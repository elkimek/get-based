// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const persistenceGate = vi.hoisted(() => ({
  handler: null,
  release: null,
}));

vi.mock('../js/data.js', () => ({
  saveImportedDataForProfile: vi.fn(async (profileId, importedData) => (
    persistenceGate.handler?.(profileId, importedData) ?? true
  )),
}));

import {
  deleteActiveProfileMeal,
  deleteNutritionDB,
  getNutritionMeal,
  hydrateNutritionSummary,
  saveActiveProfileMeal,
} from '../js/nutrition-store.js';
import { state } from '../js/state.js';

describe('nutrition save and hydration ordering', () => {
  const profileId = 'nutrition-save-hydration-race';
  const previousProfile = state.currentProfile;
  const previousImportedData = state.importedData;

  afterEach(async () => {
    persistenceGate.release?.();
    persistenceGate.release = null;
    persistenceGate.handler = null;
    state.currentProfile = previousProfile;
    state.importedData = previousImportedData;
    await deleteNutritionDB(profileId);
  });

  it('queues hydration behind a save and aligns a reloaded active profile before reconciling', async () => {
    state.currentProfile = profileId;
    state.importedData = { entries: [], nutritionMeals: [] };
    await hydrateNutritionSummary(profileId);

    let signalPersistStarted;
    const persistStarted = new Promise(resolve => { signalPersistStarted = resolve; });
    persistenceGate.handler = async () => {
      signalPersistStarted();
      await new Promise(resolve => { persistenceGate.release = resolve; });
      return true;
    };
    const pendingSave = saveActiveProfileMeal({
      id: 'meal-in-flight',
      name: 'In-flight lunch',
      eatenAt: '2026-08-26T12:00:00.000Z',
    });
    await persistStarted;

    state.currentProfile = 'other-profile';
    state.importedData = { entries: [] };
    state.currentProfile = profileId;
    state.importedData = {
      entries: [],
      nutritionMeals: [],
      _deleted: { supplements: ['keep-this-delete'], nutritionMeals: ['meal-in-flight'] },
    };
    let hydrationSettled = false;
    const pendingHydration = hydrateNutritionSummary(profileId).then(summary => {
      hydrationSettled = true;
      return summary;
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(hydrationSettled).toBe(false);

    persistenceGate.release?.();
    await expect(pendingSave).resolves.toMatchObject({ id: 'meal-in-flight' });
    await expect(pendingHydration).resolves.toMatchObject({ totalMeals: 1 });
    await expect(getNutritionMeal(profileId, 'meal-in-flight')).resolves.toMatchObject({
      name: 'In-flight lunch',
    });
    expect(state.importedData.nutritionMeals).toEqual([
      expect.objectContaining({ id: 'meal-in-flight', name: 'In-flight lunch' }),
    ]);
    expect(state.importedData._deleted).toEqual({ supplements: ['keep-this-delete'] });
  });

  it('serializes overlapping edits so an older save cannot reassert stale meal data', async () => {
    state.currentProfile = profileId;
    state.importedData = { entries: [], nutritionMeals: [] };
    await hydrateNutritionSummary(profileId);

    let signalOlderPersistStarted;
    const olderPersistStarted = new Promise(resolve => { signalOlderPersistStarted = resolve; });
    persistenceGate.handler = async (ignoredProfileId, importedData) => {
      const savedName = importedData.nutritionMeals?.find(meal => meal.id === 'same-meal')?.name;
      if (savedName === 'Older edit') {
        signalOlderPersistStarted();
        await new Promise(resolve => { persistenceGate.release = resolve; });
      }
      return true;
    };

    const olderSave = saveActiveProfileMeal({
      id: 'same-meal',
      name: 'Older edit',
      eatenAt: '2026-08-26T12:00:00.000Z',
    });
    await olderPersistStarted;

    let newerSettled = false;
    const newerSave = saveActiveProfileMeal({
      id: 'same-meal',
      name: 'Newer edit',
      eatenAt: '2026-08-26T12:00:00.000Z',
    }).then(saved => {
      newerSettled = true;
      return saved;
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(newerSettled).toBe(false);

    persistenceGate.release?.();
    await expect(olderSave).resolves.toMatchObject({ name: 'Older edit' });
    await expect(newerSave).resolves.toMatchObject({ name: 'Newer edit' });
    await expect(getNutritionMeal(profileId, 'same-meal')).resolves.toMatchObject({
      name: 'Newer edit',
    });
  });

  it('serializes delete after an in-flight save so the saved meal cannot be resurrected', async () => {
    state.currentProfile = profileId;
    state.importedData = { entries: [], nutritionMeals: [] };
    await hydrateNutritionSummary(profileId);

    let signalPersistStarted;
    const persistStarted = new Promise(resolve => { signalPersistStarted = resolve; });
    persistenceGate.handler = async (ignoredProfileId, importedData) => {
      const savedName = importedData.nutritionMeals?.find(meal => meal.id === 'deleted-meal')?.name;
      if (savedName === 'Delayed edit') {
        signalPersistStarted();
        await new Promise(resolve => { persistenceGate.release = resolve; });
      }
      return true;
    };

    const pendingSave = saveActiveProfileMeal({
      id: 'deleted-meal',
      name: 'Delayed edit',
      eatenAt: '2026-08-26T12:00:00.000Z',
    });
    await persistStarted;

    let deleteSettled = false;
    const pendingDelete = deleteActiveProfileMeal('deleted-meal').then(() => {
      deleteSettled = true;
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(deleteSettled).toBe(false);

    persistenceGate.release?.();
    await expect(pendingSave).resolves.toMatchObject({ id: 'deleted-meal' });
    await expect(pendingDelete).resolves.toBeUndefined();
    await expect(getNutritionMeal(profileId, 'deleted-meal')).resolves.toBeNull();
    expect(state.importedData.nutritionMeals).toEqual([]);
    expect(state.importedData._deleted?.nutritionMeals).toContain('deleted-meal');
  });

  it('queues hydration behind a delete and carries its tombstone into a reloaded active profile', async () => {
    state.currentProfile = profileId;
    state.importedData = { entries: [], nutritionMeals: [] };
    await hydrateNutritionSummary(profileId);
    await saveActiveProfileMeal({
      id: 'delete-during-hydration',
      name: 'Dinner to delete',
      eatenAt: '2026-08-26T18:00:00.000Z',
    });
    const staleMeal = state.importedData.nutritionMeals[0];

    let signalDeletePersistStarted;
    const deletePersistStarted = new Promise(resolve => { signalDeletePersistStarted = resolve; });
    persistenceGate.handler = async (ignoredProfileId, importedData) => {
      if (importedData._deleted?.nutritionMeals?.includes('delete-during-hydration')) {
        signalDeletePersistStarted();
        await new Promise(resolve => { persistenceGate.release = resolve; });
      }
      return true;
    };
    const pendingDelete = deleteActiveProfileMeal('delete-during-hydration');
    await deletePersistStarted;

    state.currentProfile = 'other-profile';
    state.importedData = { entries: [] };
    state.currentProfile = profileId;
    state.importedData = {
      entries: [],
      nutritionMeals: [staleMeal],
      _deleted: { supplements: ['keep-this-delete'] },
    };
    let hydrationSettled = false;
    const pendingHydration = hydrateNutritionSummary(profileId).then(summary => {
      hydrationSettled = true;
      return summary;
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(hydrationSettled).toBe(false);

    persistenceGate.release?.();
    await expect(pendingDelete).resolves.toBeUndefined();
    await expect(pendingHydration).resolves.toMatchObject({ totalMeals: 0 });
    await expect(getNutritionMeal(profileId, 'delete-during-hydration')).resolves.toBeNull();
    expect(state.importedData.nutritionMeals).toEqual([]);
    expect(state.importedData._deleted?.nutritionMeals).toContain('delete-during-hydration');
    expect(state.importedData._deleted?.supplements).toEqual(['keep-this-delete']);
  });
});
