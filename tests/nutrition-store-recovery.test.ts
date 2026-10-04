import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProfileData } from '../types/app-state.js';

const persistence = vi.hoisted(() => ({
  write: vi.fn(async (_profileId: string, _data: Partial<ProfileData>) => true),
}));
vi.mock('../js/data.js', () => ({ saveImportedDataForProfile: persistence.write }));

import {
  deleteActiveProfileMeal, deleteNutritionDB, getNutritionMeal, hydrateNutritionSummary,
  listNutritionMeals, openNutritionDB, putNutritionMeal, reconcileNutritionMealsFromProfileData,
  resetNutritionDB, saveActiveProfileMeal, setLocalNutritionSummary,
} from '../js/nutrition-store.js';
import { NUTRITION_SUMMARY_VERSION } from '../js/nutrition-summary.js';
import { state } from '../js/state.js';

const previous = { profile: state.currentProfile, data: state.importedData, summary: state.nutritionSummary };
let profile: string;
const meal = (id = 'meal', name = 'Original lunch', updatedAt = '2026-09-22T12:00:00.000Z') => ({
  id, name, eatenAt: '2026-09-22T12:00:00.000Z', updatedAt,
});
function useData(data: Partial<ProfileData>) {
  (state as { importedData: Partial<ProfileData> }).importedData = data;
  return data;
}
function requestResult(request: IDBOpenDBRequest): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
beforeEach(() => {
  profile = `nutrition-recovery-${crypto.randomUUID()}`;
  state.currentProfile = profile;
  useData({ entries: [], nutritionMeals: [] });
  persistence.write.mockReset().mockResolvedValue(true);
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  state.currentProfile = previous.profile;
  state.importedData = previous.data;
  state.nutritionSummary = previous.summary;
  await deleteNutritionDB(profile);
});

describe('nutrition database recovery', () => {
  it('reports missing IndexedDB and permits a fresh open after explicit reset', async () => {
    vi.stubGlobal('indexedDB', undefined);
    await expect(openNutritionDB(profile)).rejects.toThrow('Secure meal storage is unavailable');
    resetNutritionDB(profile);
    vi.unstubAllGlobals();
    const db = await openNutritionDB(profile);
    expect([...db.objectStoreNames]).toEqual(['meals', 'meta']);
    expect(openNutritionDB(profile)).toBe(openNutritionDB(profile));
  });

  it('retains one blocked upgrade until its native request settles, then allows retry', async () => {
    const legacy = await requestResult(indexedDB.open(`getbased-nutrition-${profile}`, 2));
    const open = vi.spyOn(indexedDB, 'open');
    const pending = openNutritionDB(profile);
    try {
      await expect(pending).rejects.toThrow('blocked by another open tab');
      expect(openNutritionDB(profile)).toBe(pending);
      resetNutritionDB(profile);
      expect(openNutritionDB(profile)).toBe(pending);
      expect(open).toHaveBeenCalledTimes(1);
    } finally { legacy.close(); }
    let retried = pending;
    await vi.waitFor(() => {
      retried = openNutritionDB(profile);
      expect(retried).not.toBe(pending);
    });
    const db = await retried;
    expect([...db.objectStoreNames]).toEqual(['meals', 'meta']);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('clears a failed version open so a repaired database can be opened', async () => {
    const future = await requestResult(indexedDB.open(`getbased-nutrition-${profile}`, 4));
    future.close();
    await expect(openNutritionDB(profile)).rejects.toMatchObject({ name: 'VersionError' });
    await deleteNutritionDB(profile);
    await expect(openNutritionDB(profile)).resolves.toHaveProperty('version', 3);
  });

  it('closes a cached connection on version change and opens a replacement', async () => {
    const db = await openNutritionDB(profile);
    const close = vi.spyOn(db, 'close');
    const upgraded = await requestResult(indexedDB.open(`getbased-nutrition-${profile}`, 4));
    expect(close).toHaveBeenCalled();
    upgraded.close();
    await deleteNutritionDB(profile);
    expect(await openNutritionDB(profile)).not.toBe(db);
  });
});

describe('canonical meal reconciliation and cached summaries', () => {
  it('imports only fresher local meals once, respects tombstones, then honors canonical deletion', async () => {
    await putNutritionMeal(profile, meal('same', 'Newer local', '2031-01-01T00:00:00.000Z'), { preserveUpdatedAt: true });
    await putNutritionMeal(profile, meal('local-only'), { preserveUpdatedAt: true });
    await putNutritionMeal(profile, meal('deleted'), { preserveUpdatedAt: true });
    useData({ entries: [], nutritionMeals: [meal('same', 'Older synced', '2030-01-01T00:00:00.000Z')], _deleted: { nutritionMeals: ['deleted'] } });
    const first = await reconcileNutritionMealsFromProfileData(profile);
    expect(first.meals).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'same', name: 'Newer local' }), expect.objectContaining({ id: 'local-only' }),
    ]));
    expect(first.meals).toHaveLength(2);
    await expect(getNutritionMeal(profile, 'deleted')).resolves.toBeNull();
    expect(persistence.write).toHaveBeenCalledWith(profile, state.importedData, expect.objectContaining({ forceProfileScope: true }));
    useData({ entries: [], nutritionMeals: [] });
    await expect(reconcileNutritionMealsFromProfileData(profile)).resolves.toEqual({ meals: [], cacheChanged: true });
    await expect(listNutritionMeals(profile)).resolves.toEqual([]);
  });

  it('updates the encrypted cache from canonical edits without accepting stale local content', async () => {
    await putNutritionMeal(profile, meal('same', 'Older local'), { preserveUpdatedAt: true });
    useData({ entries: [], nutritionMeals: [meal('same', 'Newer synced', '2032-01-01T00:00:00.000Z')] });
    await expect(reconcileNutritionMealsFromProfileData(profile)).resolves.toMatchObject({ cacheChanged: true });
    await expect(getNutritionMeal(profile, 'same')).resolves.toMatchObject({ name: 'Newer synced', updatedAt: '2032-01-01T00:00:00.000Z' });
    await expect(reconcileNutritionMealsFromProfileData(profile)).resolves.toMatchObject({ meals: [expect.objectContaining({ id: 'same', name: 'Newer synced' })] });
  });

  it('rejects canonical persistence failure before deleting or rewriting local meals', async () => {
    await putNutritionMeal(profile, meal());
    persistence.write.mockResolvedValue(false);
    await expect(reconcileNutritionMealsFromProfileData(profile)).rejects.toThrow('could not be prepared for cross-device sync');
    await expect(getNutritionMeal(profile, 'meal')).resolves.toMatchObject({ name: 'Original lunch' });
  });

  it('reuses a matching cached summary and emits the actual summary-change event', async () => {
    await reconcileNutritionMealsFromProfileData(profile);
    const cached = { version: NUTRITION_SUMMARY_VERSION, totalMeals: 0, wearableRevision: 0, windows: { d7: { meals: 0 } } };
    await setLocalNutritionSummary(profile, cached);
    const dispatch = vi.fn(() => true);
    vi.stubGlobal('dispatchEvent', dispatch);
    persistence.write.mockClear();
    await expect(hydrateNutritionSummary(profile)).resolves.toEqual(cached);
    expect(state.nutritionSummary).toEqual(cached);
    expect(persistence.write).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'labcharts-nutrition-summary-changed', detail: { profileId: profile, totalMeals: 0 } }));
  });

  it('does not hydrate a profile that is no longer active', async () => {
    await expect(hydrateNutritionSummary('another-profile')).resolves.toBeNull();
    await expect(reconcileNutritionMealsFromProfileData('another-profile')).resolves.toEqual({ meals: [], cacheChanged: false });
  });
});

describe('failed canonical meal writes', () => {
  it.each(['rejected', 'thrown'] as const)('restores an existing meal and all tombstone surfaces after a %s save', async failure => {
    const old = await putNutritionMeal(profile, meal());
    const data = useData({ entries: [], nutritionMeals: [meal()], _deleted: { nutritionMeals: ['meal'], supplements: ['keep'] }, _deletedAt: { nutritionMeals: { meal: 20 } }, _deletedClearedAt: { nutritionMeals: { meal: 10 } } });
    const surfaces = { meals: data.nutritionMeals, deleted: data._deleted, at: data._deletedAt, cleared: data._deletedClearedAt };
    if (failure === 'thrown') persistence.write.mockRejectedValue(new Error('Synthetic canonical failure'));
    else persistence.write.mockResolvedValue(false);
    await expect(saveActiveProfileMeal({ ...meal(), name: 'Unsaved replacement' })).rejects.toThrow('cross-device copy could not be persisted');
    expect(data.nutritionMeals).toBe(surfaces.meals);
    expect(data._deleted).toBe(surfaces.deleted);
    expect(data._deletedAt).toBe(surfaces.at);
    expect(data._deletedClearedAt).toBe(surfaces.cleared);
    await expect(getNutritionMeal(profile, 'meal')).resolves.toEqual(old);
  });

  it('removes a new local meal and newly created tombstone fields when its canonical save fails', async () => {
    const data = useData({ entries: [], nutritionMeals: [] });
    const before = data.nutritionMeals;
    persistence.write.mockResolvedValue(false);
    await expect(saveActiveProfileMeal(meal())).rejects.toThrow('cross-device copy could not be persisted');
    await expect(getNutritionMeal(profile, 'meal')).resolves.toBeNull();
    expect(data.nutritionMeals).toBe(before);
    for (const key of ['_deleted', '_deletedAt', '_deletedClearedAt']) expect(Object.hasOwn(data, key)).toBe(false);
  });

  it('reports local rollback encryption failure while retaining the previous canonical snapshot', async () => {
    await putNutritionMeal(profile, meal());
    const data = useData({ entries: [], nutritionMeals: [meal()] });
    const previousMeals = data.nutritionMeals;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    persistence.write.mockImplementationOnce(async () => {
      vi.spyOn(crypto.subtle, 'encrypt').mockRejectedValueOnce(new Error('Synthetic rollback encryption failure'));
      return false;
    });
    await expect(saveActiveProfileMeal({ ...meal(), name: 'Unsaved replacement' })).rejects.toThrow('cross-device copy could not be persisted');
    expect(data.nutritionMeals).toBe(previousMeals);
    expect(warn).toHaveBeenCalledWith('[nutrition] Could not roll back a failed canonical meal save:', expect.objectContaining({ message: 'Synthetic rollback encryption failure' }));
    await expect(getNutritionMeal(profile, 'meal')).resolves.toMatchObject({ name: 'Unsaved replacement' });
  });

  it('restores the original meal and tombstone identities and preserves a thrown deletion error', async () => {
    const localMeal = await putNutritionMeal(profile, meal());
    const data = useData({ entries: [], nutritionMeals: [meal()], _deleted: { supplements: ['keep'] }, _deletedAt: { supplements: { keep: 10 } }, _deletedClearedAt: { supplements: { keep: 5 } } });
    const before = { meals: data.nutritionMeals, deleted: data._deleted, at: data._deletedAt, cleared: data._deletedClearedAt };
    const failure = new Error('Synthetic canonical deletion failure');
    persistence.write.mockRejectedValueOnce(failure);
    await expect(deleteActiveProfileMeal('meal')).rejects.toBe(failure);
    expect(data.nutritionMeals).toBe(before.meals);
    expect(data._deleted).toBe(before.deleted);
    expect(data._deletedAt).toBe(before.at);
    expect(data._deletedClearedAt).toBe(before.cleared);
    await expect(getNutritionMeal(profile, 'meal')).resolves.toEqual(localMeal);
    // A rejected queued operation must not poison a later successful deletion.
    await expect(deleteActiveProfileMeal('meal')).resolves.toBeUndefined();
    await expect(getNutritionMeal(profile, 'meal')).resolves.toBeNull();
    expect(data.nutritionMeals).toEqual([]);
    expect(data._deleted?.nutritionMeals).toContain('meal');
    expect(data._deleted?.supplements).toEqual(['keep']);
  });

  it('restores canonical deletion state without deleting the local meal when persistence refuses the delete', async () => {
    await putNutritionMeal(profile, meal());
    const data = useData({ entries: [], nutritionMeals: [meal()], _deleted: { supplements: ['keep'] }, _deletedAt: { supplements: { keep: 10 } } });
    const before = { meals: data.nutritionMeals, deleted: data._deleted, at: data._deletedAt };
    persistence.write.mockResolvedValue(false);
    await expect(deleteActiveProfileMeal('meal')).rejects.toThrow('cross-device deletion could not be saved');
    expect(data.nutritionMeals).toBe(before.meals);
    expect(data._deleted).toBe(before.deleted);
    expect(data._deletedAt).toBe(before.at);
    expect(Object.hasOwn(data, '_deletedClearedAt')).toBe(false);
    await expect(getNutritionMeal(profile, 'meal')).resolves.toMatchObject({ name: 'Original lunch' });
  });
});
