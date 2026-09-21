import { expect, test } from './coverage-fixture.js';

test('meal proposal rolls back its local cache and live surface when the profile commit aborts', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const { saveImportedData } = await import('/js/data.js');
    const { applyAgentDraft } = await import('/js/agent-drafts.js');
    const { listNutritionMeals } = await import('/js/nutrition-store.js');
    const { encryptedGetItem } = await import('/js/crypto.js');
    const { profileStorageKey } = await import('/js/profile.js');
    state.importedData.nutritionMeals = [];
    if (!await saveImportedData()) throw new Error('Fixture save failed');
    const key = profileStorageKey(state.currentProfile, 'imported');
    const before = await encryptedGetItem(key);
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (args[1] === key) request.addEventListener('success', () => this.transaction.abort(), { once: true });
      return request;
    };
    const draft = { profileId: state.currentProfile, kind: 'meal', status: 'pending', payload: { name: 'Synthetic lunch', eatenAt: '2026-09-21T12:00:00Z', nutrients: { energyKcal: 500 } } };
    let error = '';
    try { await applyAgentDraft(draft); } catch (e) { error = e.message; }
    finally { IDBObjectStore.prototype.put = put; }
    const failed = { error, liveCount: (state.importedData.nutritionMeals || []).length, cacheCount: (await listNutritionMeals(state.currentProfile)).length, unchanged: before === await encryptedGetItem(key) };
    const notice = await applyAgentDraft(draft);
    return { failed, notice, saved: (await listNutritionMeals(state.currentProfile)).map(meal => meal.name) };
  });
  expect(result.failed.error).toContain('could not be saved');
  expect(result.failed).toMatchObject({ liveCount: 0, cacheCount: 0, unchanged: true });
  expect(result.notice).toContain('saved');
  expect(result.saved).toEqual(['Synthetic lunch']);
});

for (const operation of ['save', 'delete', 'restore']) {
test(`a stale nutrition ${operation} preserves unrelated changes committed by another writer`, async ({ page }) => {
  await page.goto('/app');
  const saved = await page.evaluate(async operation => {
    const { state } = await import('/js/state.js');
    const { saveImportedData, saveImportedDataForProfile } = await import('/js/data.js');
    const { saveActiveProfileMeal, deleteActiveProfileMeal, restoreNutritionArchive } = await import('/js/nutrition-store.js');
    const { encryptedGetItem } = await import('/js/crypto.js');
    const { profileStorageKey } = await import('/js/profile.js');
    state.importedData.contextNotes = 'Original'; state.importedData.nutritionMeals = [];
    if (!await saveImportedData()) throw new Error('Fixture save failed');
    if (operation === 'delete') await saveActiveProfileMeal({ id: 'concurrent-meal', name: 'Lunch', eatenAt: '2026-09-21T12:00:00Z' });
    // A whole snapshot write with no adoption models a second tab committing
    // while this view still holds its previously loaded profile.
    const concurrent = structuredClone(state.importedData);
    concurrent.contextNotes = 'Committed elsewhere';
    if (!await saveImportedDataForProfile(state.currentProfile, concurrent, { forceProfileScope: true })) throw new Error('Concurrent fixture save failed');
    if (state.importedData.contextNotes !== 'Original') throw new Error('Fixture must keep the initiating view stale');
    const meal = { id: 'concurrent-meal', name: 'Lunch', eatenAt: '2026-09-21T12:00:00Z', images: [] };
    if (operation === 'delete') await deleteActiveProfileMeal(meal.id);
    else if (operation === 'restore') await restoreNutritionArchive(state.currentProfile, { version: 1, meals: [meal] });
    else await saveActiveProfileMeal(meal);
    return JSON.parse(await encryptedGetItem(profileStorageKey(state.currentProfile, 'imported')));
  }, operation);
  expect(saved.contextNotes).toBe('Committed elsewhere');
  if (operation === 'delete') expect(saved.nutritionMeals || []).toEqual([]);
  else expect(saved.nutritionMeals).toMatchObject([{ id: 'concurrent-meal', name: 'Lunch' }]);
});
}

test('hydration rebuilds its summary after the canonical meal committed but cache finalization failed', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const { state } = await import('/js/state.js');
    const nutrition = await import('/js/nutrition-store.js');
    const { saveImportedData } = await import('/js/data.js');
    const { encryptedGetItem } = await import('/js/crypto.js');
    const { profileStorageKey } = await import('/js/profile.js');
    if (!await saveImportedData()) throw new Error('Fixture save failed');
    const initial = await nutrition.hydrateNutritionSummary(state.currentProfile);
    const put = IDBObjectStore.prototype.put;
    let mealWrites = 0;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (this.name === 'meals' && ++mealWrites === 2) request.addEventListener('success', () => this.transaction.abort(), { once: true });
      return request;
    };
    let failed = false;
    try { await nutrition.saveActiveProfileMeal({ id: 'committed-meal', name: 'Committed lunch', eatenAt: new Date().toISOString(), nutrients: { energyKcal: 500 } }); }
    catch { failed = true; }
    finally { IDBObjectStore.prototype.put = put; }
    const stored = JSON.parse(await encryptedGetItem(profileStorageKey(state.currentProfile, 'imported')));
    nutrition.resetNutritionDB(state.currentProfile);
    const recovered = await nutrition.hydrateNutritionSummary(state.currentProfile);
    return { failed, initialCount: initial?.totalMeals || 0, storedIds: stored.nutritionMeals.map(meal => meal.id), recoveredCount: recovered?.totalMeals || 0 };
  });
  expect(result).toEqual({ failed: true, initialCount: 0, storedIds: ['committed-meal'], recoveredCount: 1 });
});
