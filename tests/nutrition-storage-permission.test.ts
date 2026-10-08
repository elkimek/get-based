import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  deleteNutritionDB, getNutritionMeal, openNutritionDB,
  requestPersistentNutritionStorage, saveActiveProfileMeal,
} from '../js/nutrition-store.js';
import { encryptedGetItem, encryptedRemoveItem } from '../js/crypto.js';
import { profileStorageKey } from '../js/profile-storage-key.js';
import { state } from '../js/state.js';

afterEach(() => { vi.unstubAllGlobals(); });

describe('optional nutrition storage permission', () => {
  it('commits queued meals and their summary while one shared permission request remains pending', async () => {
    const profileId = `nutrition-pending-permission-${Date.now()}`;
    const storageKey = profileStorageKey(profileId, 'imported');
    const previousProfile = state.currentProfile;
    const previousData = state.importedData;
    const previousSummary = state.nutritionSummary;
    let settlePermission!: (granted: boolean) => void;
    const permission = new Promise<boolean>(resolve => { settlePermission = resolve; });
    const persist = vi.fn(() => permission);
    vi.stubGlobal('navigator', { storage: { persist } });
    state.currentProfile = profileId;
    (state as { importedData: Partial<typeof state.importedData> }).importedData = {
      entries: [], nutritionMeals: [],
    };
    const completed: string[] = [];
    const saves = Promise.all(['first', 'second'].map(id => saveActiveProfileMeal({
      id, name: `Private ${id} meal`, eatenAt: new Date().toISOString(),
      nutrients: { energyKcal: 500, proteinG: 20 },
    }).then(meal => { completed.push(meal.id); return meal; })));
    try {
      await vi.waitFor(() => { expect(completed).toEqual(['first', 'second']); });
      expect(persist).toHaveBeenCalledTimes(1);
      const saved = await saves;
      const canonical = JSON.parse((await encryptedGetItem(storageKey))!);
      expect(canonical.nutritionMeals.map((meal: { id: string }) => meal.id).sort()).toEqual(['first', 'second']);
      expect(state.nutritionSummary?.totalMeals).toBe(2);
      for (const meal of saved) {
        await expect(getNutritionMeal(profileId, meal.id)).resolves.toMatchObject({
          id: meal.id, name: meal.name, nutrients: { energyKcal: 500, proteinG: 20 },
        });
      }
      const db = await openNutritionDB(profileId);
      const raw = await new Promise<unknown>((resolve, reject) => {
        const request = db.transaction('meals', 'readonly').objectStore('meals').get('first');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      expect(raw).toHaveProperty('_devicePayload');
      expect(raw).not.toHaveProperty('name');
      expect(JSON.stringify(raw)).not.toContain('Private first meal');
    } finally {
      settlePermission(false);
      await permission;
      await saves;
      await deleteNutritionDB(profileId);
      await encryptedRemoveItem(storageKey);
      state.currentProfile = previousProfile;
      state.importedData = previousData;
      state.nutritionSummary = previousSummary;
    }
  });

  it('handles unavailable, denied and failed requests and permits a later grant', async () => {
    vi.stubGlobal('navigator', {});
    await expect(requestPersistentNutritionStorage()).resolves.toBe(false);
    const persist = vi.fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('Permission unavailable'))
      .mockImplementationOnce(() => { throw new Error('Storage disabled'); })
      .mockResolvedValueOnce(true);
    vi.stubGlobal('navigator', { storage: { persist } });
    await expect(requestPersistentNutritionStorage()).resolves.toBe(false);
    await expect(requestPersistentNutritionStorage()).resolves.toBe(false);
    await expect(requestPersistentNutritionStorage()).resolves.toBe(false);
    await expect(requestPersistentNutritionStorage()).resolves.toBe(true);
    expect(persist).toHaveBeenCalledTimes(4);
  });
});
