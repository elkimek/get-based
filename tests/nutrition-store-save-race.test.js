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

  it('restores the local record when stale hydration deletes it during canonical persistence', async () => {
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
    state.importedData = { entries: [], nutritionMeals: [] };
    await hydrateNutritionSummary(profileId);
    await expect(getNutritionMeal(profileId, 'meal-in-flight')).resolves.toBeNull();

    persistenceGate.release?.();
    await expect(pendingSave).resolves.toMatchObject({ id: 'meal-in-flight' });
    await expect(getNutritionMeal(profileId, 'meal-in-flight')).resolves.toMatchObject({
      name: 'In-flight lunch',
    });
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
});
