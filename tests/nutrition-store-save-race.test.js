// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

const persistenceGate = vi.hoisted(() => ({
  blocked: false,
  release: null,
  started: null,
}));

vi.mock('../js/data.js', () => ({
  saveImportedDataForProfile: vi.fn(async () => {
    if (!persistenceGate.blocked) return true;
    persistenceGate.started?.();
    await new Promise(resolve => { persistenceGate.release = resolve; });
    return true;
  }),
}));

import {
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
    persistenceGate.blocked = false;
    persistenceGate.release?.();
    persistenceGate.release = null;
    persistenceGate.started = null;
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
    persistenceGate.blocked = true;
    persistenceGate.started = signalPersistStarted;
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
});
