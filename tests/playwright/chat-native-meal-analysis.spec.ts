import { expect, test } from './coverage-fixture.js';
import { stoppedChatCompletion } from '../helpers/http-responses.js';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZcL8AAAAASUVORK5CYII=';
for (const edit of [false, true]) test(`a native meal ${edit ? 'reanalysis' : 'analysis'} handoff runs one requested inference and requires native Save`, async ({ page, context }) => {
  await context.route('https://**/*', route => route.abort());
  await page.addInitScript(() => { localStorage.setItem('labcharts-ai-paused', 'true'); localStorage.setItem('labcharts-analytics-disabled', 'true'); for (const suffix of ['tour', 'emptyTour']) localStorage.setItem('labcharts-default-' + suffix, 'completed'); });
  await page.goto('/app');
  const before = await page.evaluate(async ({ edit, png }) => {
    const profile = await import('/js/profile.js'), id = await profile.createProfile('Synthetic native vision handoff', { skipInitialSync: true }); if (!id) throw new Error('Synthetic profile missing');
    for (const suffix of ['tour', 'emptyTour']) localStorage.setItem(profile.profileStorageKey(id, suffix), 'completed'); for (const prefix of ['labcharts-onboard-extras-done-', 'labcharts-onboard-context-cards-skipped-']) localStorage.setItem(prefix + id, '1'); await profile.switchProfile(id);
    const { state } = await import('/js/state.js'); state.importedData.entries = []; state.importedData.contextNotes = 'Preserve unrelated native health context'; state.importedData.nutritionMeals = [];
    if (!await (await import('/js/data.js')).saveImportedData()) throw new Error('Native analysis fixture save failed');
    const store = await import('/js/nutrition-store.js'); await store.reconcileNutritionMealsFromProfileData(id);
    if (edit) await store.saveActiveProfileMeal({ id: 'analysis-target', name: 'Previous saved estimate', mealType: 'lunch', eatenAt: '2026-10-20T12:01:22.123Z', nutrients: { energyKcal: 200 }, note: 'Keep this meal note', images: [{ thumbnailUrl: 'data:image/png;base64,' + png, fileName: 'old-preview.png' }], source: { kind: 'manual', recordedAt: '2026-10-20T12:30:00Z', opaqueSourceMetadata: { keep: 'Original provenance' }, review: { privateReview: 'Retain unseen review metadata' } }, opaquePortableMetadata: { retained: true } });
    const api = await import('/js/api.js'); await api.saveVeniceKey('synthetic-native-vision-key'); api.setVeniceModel('native-vision'); api.setVeniceE2EE(false);
    localStorage.setItem('labcharts-venice-models', JSON.stringify([{ id: 'native-vision', name: 'Native vision', model_spec: { capabilities: { supportsVision: true } } }])); localStorage.setItem('labcharts-venice-vision-models', '["native-vision"]'); localStorage.setItem('labcharts-venice-e2ee-models', '[]'); localStorage.setItem('labcharts-venice-pricing', '{"native-vision":{"input":1,"output":1}}');
    api.setAIProvider('venice'); api.setAIPaused(false); (await import('/js/agent-chat-settings.js')).setChatBackend('direct'); (await import('/js/nutrition-ai-settings.js')).setNutritionAIRoute({ provider: 'venice', model: 'native-vision' });
    const runtime = (await import('/js/agent-tool-runtime.js')).createAgentToolRuntime({ readContext: () => '', userMessage: edit ? 'Open my exact saved meal for reanalysis.' : 'Open native meal photo analysis.', ...(await import('/js/agent-tool-bindings.js')).createBrowserAgentToolDependencies(id) });
    const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'meals', ...(edit ? { recordId: 'analysis-target' } : { create: true }) } }); if (!read.success) throw new Error('Native target read unavailable');
    const opened = await runtime.execute({ tool: 'getbased_navigate', arguments: { view: 'nutritionEditor', ...(edit ? { recordId: 'analysis-target' } : {}) } }); if (!opened.success) throw new Error('Native photo handoff unavailable');
    return { canonical: await (await import('/js/crypto.js')).encryptedGetItem(profile.profileStorageKey(id, 'imported')), meals: await store.listNutritionMeals(id) };
  }, { edit, png });
  let calls = 0, release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('https://api.venice.ai/api/v1/chat/completions', async route => {
    const body = route.request().postDataJSON(); calls++; expect(calls).toBe(1); expect(body.model).toBe('native-vision'); expect(JSON.stringify(body.messages)).toContain('data:image/png;base64,' + png); await pending;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...stoppedChatCompletion(JSON.stringify({ mealName: 'Native reviewed rice', components: [{ name: 'Rice', quantityG: 100, nutrients: { energyKcal: 130, proteinG: 2 }, confidence: 0.75 }], nutrients: { energyKcal: 130, proteinG: 2 }, confidence: 0.75, warnings: ['Synthetic uncertainty requires human review.'], assumptions: [] })), model: 'native-vision', usage: { prompt_tokens: 100, completion_tokens: 80 } }) });
  });
  try {
  await page.getByRole('tab', { name: 'Photo', exact: true }).click(); await page.locator('#nutrition-photo-input').setInputFiles({ name: 'chosen-original.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }); expect(calls).toBe(0);
  const raw = () => page.evaluate(async () => { const { state } = await import('/js/state.js'); return (await import('/js/crypto.js')).encryptedGetItem((await import('/js/profile.js')).profileStorageKey(state.currentProfile, 'imported')); });
  expect(await raw()).toBe(before.canonical); await page.locator('#nutrition-analyze-btn').click();
  await expect(page.locator('#cloud-ai-consent-overlay')).toBeVisible(); expect(calls).toBe(0); await page.locator('#cloud-ai-consent-checkbox').check(); await page.locator('[data-cloud-ai-consent-action="approve"]').click();
  await expect.poll(() => calls).toBe(1); await expect(page.locator('#nutrition-analysis-progress')).toBeVisible(); expect(await raw()).toBe(before.canonical);
  release(); await expect(page.locator('#nutrition-meal-name')).toHaveValue('Native reviewed rice'); await expect(page.locator('#nutrition-energyKcal')).toHaveValue('130');
  await expect(page.locator('#nutrition-analysis-status')).toContainText('Review the values and notes, then save.'); expect(await raw()).toBe(before.canonical);
  if (!edit) await page.locator('#nutrition-meal-type').selectOption('lunch'); await page.locator('#nutrition-save-btn').click();
  await expect.poll(async () => JSON.parse((await raw())!).nutritionMeals[0]?.name).toBe('Native reviewed rice');
  const saved = JSON.parse((await raw())!); expect(saved.nutritionMeals).toHaveLength(1); const meal = saved.nutritionMeals[0];
  expect(meal.source).toMatchObject({ kind: 'ai-photo-estimate', provider: 'venice', model: 'native-vision' }); expect(meal.images).toHaveLength(1); expect(meal.images[0]).toMatchObject({ fileName: 'chosen-original.png' }); expect(meal.images[0]).not.toHaveProperty('dataUrl'); expect(calls).toBe(1);
  expect(saved.contextNotes).toBe('Preserve unrelated native health context');
  if (edit) { expect(meal.id).toBe('analysis-target'); expect(meal.note).toBe('Keep this meal note'); expect(meal.eatenAt).toBe('2026-10-20T12:01:22.123Z'); expect(meal.opaquePortableMetadata).toEqual({ retained: true }); expect(meal.source).toMatchObject({ opaqueSourceMetadata: { keep: 'Original provenance' }, review: { privateReview: 'Retain unseen review metadata' } }); }
  } finally { release(); }
});
