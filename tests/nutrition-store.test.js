import { afterEach, describe, expect, it } from 'vitest';

import {
  buildNutritionArchive,
  deleteNutritionDB,
  deleteNutritionMeal,
  getLocalNutritionComparison,
  getNutritionMeal,
  hydrateNutritionSummary,
  listNutritionMeals,
  openNutritionDB,
  putNutritionMeal,
  resetNutritionDB,
  restoreNutritionArchive,
  saveActiveProfileMeal,
  setLocalNutritionComparison,
  setLocalNutritionSummary,
} from '../js/nutrition-store.js';
import { encryptedGetItem, encryptedRemoveItem } from '../js/crypto.js';
import { buildFullBackupSnapshot, parseBackupSnapshot, serializeBackupSnapshot } from '../js/backup.js';
import { setBlob } from '../js/blob-storage.js';
import { buildNutritionSummaryContext, NUTRITION_SUMMARY_VERSION } from '../js/nutrition-summary.js';
import { profileStorageKey } from '../js/profile-storage-key.js';
import { state } from '../js/state.js';

const profileIds = new Set();

afterEach(async () => {
  await Promise.all([...profileIds].map(profileId => deleteNutritionDB(profileId)));
  profileIds.clear();
});

describe('thumbnail-only nutrition storage', () => {
  it('removes the retired barcode product cache during database upgrade', async () => {
    const profileId = `nutrition-legacy-food-cache-${Date.now()}`;
    profileIds.add(profileId);
    const legacyDb = await new Promise((resolve, reject) => {
      const request = indexedDB.open(`getbased-nutrition-${profileId}`, 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        const meals = db.createObjectStore('meals', { keyPath: 'id' });
        meals.createIndex('by_eaten_at', 'eatenAt', { unique: false });
        db.createObjectStore('meta', { keyPath: 'k' });
        db.createObjectStore('food-cache', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    legacyDb.close();
    resetNutritionDB(profileId);

    const upgraded = await openNutritionDB(profileId);
    expect([...upgraded.objectStoreNames]).toContain('meals');
    expect([...upgraded.objectStoreNames]).toContain('meta');
    expect([...upgraded.objectStoreNames]).not.toContain('food-cache');
  });

  it('uses one device key when several first writes start concurrently', async () => {
    const profileId = `nutrition-concurrent-${Date.now()}`;
    profileIds.add(profileId);
    await Promise.all(Array.from({ length: 6 }, (_, index) => putNutritionMeal(profileId, {
      name: `Concurrent meal ${index + 1}`,
      eatenAt: `2026-08-23T${String(10 + index).padStart(2, '0')}:00:00.000Z`,
    })));

    const meals = await listNutritionMeals(profileId);
    expect(meals).toHaveLength(6);
    expect(meals.map(meal => meal.name).sort()).toEqual(Array.from({ length: 6 }, (_, index) => `Concurrent meal ${index + 1}`));
  });

  it('round-trips meals while keeping the payload encrypted in IndexedDB', async () => {
    const profileId = `nutrition-test-${Date.now()}`;
    profileIds.add(profileId);
    const saved = await putNutritionMeal(profileId, {
      name: 'Lentil bowl',
      eatenAt: '2026-08-23T12:30:00.000Z',
      nutrients: { energyKcal: 620, proteinG: 31 },
      image: { dataUrl: 'data:image/jpeg;base64,PRIVATEPHOTO', thumbnailUrl: 'data:image/jpeg;base64,VEhVTUI=' },
    });

    await expect(getNutritionMeal(profileId, saved.id)).resolves.toMatchObject({
      name: 'Lentil bowl',
      reviewed: true,
      nutrients: { energyKcal: 620, proteinG: 31 },
      images: [{ thumbnailUrl: 'data:image/jpeg;base64,VEhVTUI=' }],
    });
    expect(JSON.stringify(await getNutritionMeal(profileId, saved.id))).not.toContain('PRIVATEPHOTO');

    const db = await openNutritionDB(profileId);
    const raw = await new Promise((resolve, reject) => {
      const request = db.transaction('meals', 'readonly').objectStore('meals').get(saved.id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(raw).toHaveProperty('_devicePayload');
    expect(raw).not.toHaveProperty('name');
    expect(JSON.stringify(raw)).not.toContain('PRIVATEPHOTO');
  });

  it('isolates profiles, orders newest first, and deletes the photo with the meal', async () => {
    const a = `nutrition-a-${Date.now()}`;
    const b = `nutrition-b-${Date.now()}`;
    profileIds.add(a);
    profileIds.add(b);
    const older = await putNutritionMeal(a, { name: 'Older', eatenAt: '2026-08-20T12:00:00.000Z' });
    const newer = await putNutritionMeal(a, { name: 'Newer', eatenAt: '2026-08-23T12:00:00.000Z' });
    await putNutritionMeal(b, { name: 'Other profile', eatenAt: '2026-08-24T12:00:00.000Z' });

    await expect(listNutritionMeals(a)).resolves.toMatchObject([{ id: newer.id }, { id: older.id }]);
    await deleteNutritionMeal(a, newer.id);
    await expect(getNutritionMeal(a, newer.id)).resolves.toBeNull();
    await expect(listNutritionMeals(b)).resolves.toHaveLength(1);
  });

  it('finishes a meal save against its initiating profile after a profile switch', async () => {
    const profileId = `nutrition-save-origin-${Date.now()}`;
    const otherProfileId = `${profileId}-other`;
    const storageKey = profileStorageKey(profileId, 'imported');
    const previousProfile = state.currentProfile;
    const previousImportedData = state.importedData;
    const initiatingData = { entries: [], nutritionMeals: [] };
    const otherData = { entries: [], contextNotes: 'other profile' };
    profileIds.add(profileId);
    await encryptedRemoveItem(storageKey);
    state.currentProfile = profileId;
    state.importedData = initiatingData;

    try {
      const pendingSave = saveActiveProfileMeal({
        id: 'profile-scoped-meal',
        name: 'Profile-scoped lunch',
        eatenAt: '2026-08-25T12:00:00.000Z',
      });
      state.currentProfile = otherProfileId;
      state.importedData = otherData;

      await expect(pendingSave).resolves.toMatchObject({ id: 'profile-scoped-meal' });
      await expect(getNutritionMeal(profileId, 'profile-scoped-meal')).resolves.toMatchObject({
        name: 'Profile-scoped lunch',
      });
      const persisted = JSON.parse(await encryptedGetItem(storageKey));
      expect(persisted.nutritionMeals).toMatchObject([{
        id: 'profile-scoped-meal',
        name: 'Profile-scoped lunch',
      }]);
      expect(otherData).toEqual({ entries: [], contextNotes: 'other profile' });
    } finally {
      await encryptedRemoveItem(storageKey);
      state.currentProfile = previousProfile;
      state.importedData = previousImportedData;
    }
  });

  it('keeps the last model comparison encrypted and profile-scoped', async () => {
    const profileId = `nutrition-comparison-${Date.now()}`;
    profileIds.add(profileId);
    const comparison = {
      version: 1,
      savedAt: '2026-08-24T10:00:00.000Z',
      runs: [{ route: { provider: 'openrouter', model: 'model-a' }, modelLabel: 'Meal Close', result: { analysis: { mealName: 'Private meal' } } }],
      manualReference: { energyKcal: 600 },
    };

    await setLocalNutritionComparison(profileId, comparison);
    await expect(getLocalNutritionComparison(profileId)).resolves.toEqual(comparison);
    const db = await openNutritionDB(profileId);
    const raw = await new Promise((resolve, reject) => {
      const request = db.transaction('meta', 'readonly').objectStore('meta').get('nutrition-comparison:v1');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(JSON.stringify(raw)).not.toContain('Private meal');
    expect(JSON.stringify(raw)).not.toContain('Meal Close');
    await setLocalNutritionComparison(profileId, null);
    await expect(getLocalNutritionComparison(profileId)).resolves.toBeNull();
  });

  it('retains the last valid encrypted summary when a hard-refresh recompute cannot read one damaged meal', async () => {
    const profileId = `nutrition-summary-fallback-${Date.now()}`;
    profileIds.add(profileId);
    const previousProfile = state.currentProfile;
    state.currentProfile = profileId;
    const saved = await putNutritionMeal(profileId, { name: 'Recoverable summary meal', eatenAt: '2026-08-23T12:30:00.000Z' });
    const fallback = { version: NUTRITION_SUMMARY_VERSION, totalMeals: 1, windows: { d7: { meals: 1, dailyAverages: { energyKcal: 620 } } } };
    fallback.contextByDays = { d30: buildNutritionSummaryContext(fallback) };
    await setLocalNutritionSummary(profileId, fallback);
    const db = await openNutritionDB(profileId);
    const tx = db.transaction('meals', 'readwrite');
    const store = tx.objectStore('meals');
    const row = await new Promise((resolve, reject) => {
      const request = store.get(saved.id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    row._devicePayload.ciphertext = new Uint8Array([1, 2, 3]);
    store.put(row);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    await expect(hydrateNutritionSummary(profileId)).resolves.toEqual(fallback);
    expect(state.nutritionSummary).toEqual(fallback);
    state.currentProfile = previousProfile;
  });

  it('reports encrypted-record corruption instead of silently hiding a meal', async () => {
    const profileId = `nutrition-corrupt-${Date.now()}`;
    profileIds.add(profileId);
    const saved = await putNutritionMeal(profileId, {
      name: 'Recoverable record',
      eatenAt: '2026-08-23T12:30:00.000Z',
    });
    const db = await openNutritionDB(profileId);
    const tx = db.transaction('meals', 'readwrite');
    const store = tx.objectStore('meals');
    const row = await new Promise((resolve, reject) => {
      const request = store.get(saved.id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    row._devicePayload.ciphertext = new Uint8Array([1, 2, 3]);
    store.put(row);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });

    await expect(listNutritionMeals(profileId)).rejects.toThrow('could not be decrypted');
  });

  it('round-trips the portable archive with photos and validates it before writing', async () => {
    const source = `nutrition-archive-source-${Date.now()}`;
    const target = `nutrition-archive-target-${Date.now()}`;
    profileIds.add(source);
    profileIds.add(target);
    await putNutritionMeal(source, {
      id: 'portable-meal',
      name: 'Portable lunch',
      eatenAt: '2026-08-23T12:30:00.000Z',
      mealType: 'lunch',
      nutrients: { energyKcal: 520, proteinG: 28, sodiumMg: 840, vitaminCMg: 36 },
      components: [{ name: 'Lentils', amount: 180, unit: 'g', nutrients: { ironMg: 5.4 } }],
      responseCheckIn: { satiety2h: 3, energy2h: 2, recordedAt: '2026-08-23T14:30:00.000Z' },
      source: {
        kind: 'ai-photo-estimate',
        aiNutritionEstimate: { nutrientKeys: ['energyKcal', 'proteinG', 'sodiumMg', 'vitaminCMg'] },
        review: { editedNutrients: ['sodiumMg'] },
      },
      images: [{ dataUrl: 'data:image/jpeg;base64,RlVMTA==', thumbnailUrl: 'data:image/jpeg;base64,VEhVTUI=' }],
    });

    const archive = await buildNutritionArchive(source);
    expect(archive).toMatchObject({ version: 1, includesPhotos: true });
    await expect(restoreNutritionArchive(target, archive)).resolves.toBe(1);
    await expect(getNutritionMeal(target, 'portable-meal')).resolves.toMatchObject({
      name: 'Portable lunch',
      mealType: 'lunch',
      nutrients: { energyKcal: 520, proteinG: 28, sodiumMg: 840, vitaminCMg: 36 },
      components: [{ name: 'Lentils', amount: 180, unit: 'g', nutrients: { ironMg: 5.4 } }],
      responseCheckIn: { satiety2h: 3, energy2h: 2, recordedAt: '2026-08-23T14:30:00.000Z' },
      source: {
        aiNutritionEstimate: { nutrientKeys: ['energyKcal', 'proteinG', 'sodiumMg', 'vitaminCMg'] },
        review: { editedNutrients: ['sodiumMg'] },
      },
      images: [{ thumbnailUrl: 'data:image/jpeg;base64,VEhVTUI=' }],
    });
    expect(JSON.stringify(await getNutritionMeal(target, 'portable-meal'))).not.toContain('RlVMTA==');

    const invalidArchive = {
      version: 1,
      meals: [
        { id: 'must-not-be-written', name: 'Valid first row', eatenAt: '2026-08-23T14:00:00.000Z' },
        { id: 'bad date row', name: 'Invalid second row', eatenAt: 'not-a-date' },
      ],
    };
    await expect(restoreNutritionArchive(target, invalidArchive)).rejects.toThrow('invalid identifier');
    await expect(getNutritionMeal(target, 'must-not-be-written')).resolves.toBeNull();

    await expect(restoreNutritionArchive(target, {
      version: 1,
      meals: [{
        id: 'remote-image', name: 'Remote image', eatenAt: '2026-08-23T14:00:00.000Z',
        images: [{ dataUrl: 'https://tracker.example/meal.jpg', thumbnailUrl: 'data:image/jpeg;base64,VEhVTUI=' }],
      }],
    })).rejects.toThrow('must be an embedded');
    await expect(getNutritionMeal(target, 'remote-image')).resolves.toBeNull();
  });

  it('restores an archive into an active profile whose empty sync surface was already initialized', async () => {
    const profileId = `nutrition-active-archive-${Date.now()}`;
    const storageKey = profileStorageKey(profileId, 'imported');
    const previousProfile = state.currentProfile;
    const previousImportedData = state.importedData;
    profileIds.add(profileId);
    await encryptedRemoveItem(storageKey);
    state.currentProfile = profileId;
    state.importedData = { entries: [], nutritionMeals: [] };

    try {
      await hydrateNutritionSummary(profileId);
      await expect(restoreNutritionArchive(profileId, {
        version: 1,
        meals: [{
          id: 'active-restored-meal',
          name: 'Restored active lunch',
          eatenAt: new Date().toISOString(),
          nutrients: { energyKcal: 610, proteinG: 34, ironMg: 7.2 },
          images: [],
        }],
      })).resolves.toBe(1);

      await expect(listNutritionMeals(profileId)).resolves.toMatchObject([{
        id: 'active-restored-meal',
        name: 'Restored active lunch',
      }]);
      expect(state.importedData.nutritionMeals).toMatchObject([{
        id: 'active-restored-meal',
        name: 'Restored active lunch',
      }]);
      expect(state.nutritionSummary.totalMeals).toBe(1);
      const persisted = JSON.parse(await encryptedGetItem(storageKey));
      expect(persisted.nutritionMeals).toMatchObject([{ id: 'active-restored-meal' }]);
    } finally {
      await encryptedRemoveItem(storageKey);
      state.currentProfile = previousProfile;
      state.importedData = previousImportedData;
    }
  });

  it('keeps the canonical nutrition surface encrypted and restorable in full backups', async () => {
    const profileId = `nutrition-backup-${Date.now()}`;
    const storageKey = profileStorageKey(profileId, 'imported');
    const previousProfile = state.currentProfile;
    const previousImportedData = state.importedData;
    const previousTestFlag = globalThis.__WEARABLES_TEST;
    const cryptoModule = await import('../js/crypto.js');
    profileIds.add(profileId);
    globalThis.__WEARABLES_TEST = true;
    localStorage.setItem('labcharts-encryption-enabled', 'true');

    try {
      const salt = await cryptoModule._setTestSessionKey('nutrition-backup-passphrase');
      const saltText = btoa(String.fromCharCode(...salt));
      localStorage.setItem('labcharts-encryption-salt', saltText);
      await cryptoModule.encryptedSetItem('labcharts-profiles', JSON.stringify([{ id: profileId, name: 'Nutrition backup' }]));
      await cryptoModule.encryptedSetItem(storageKey, JSON.stringify({
        entries: [],
        contextSourceSettings: { nutrition: true },
        nutritionContextDays: 90,
        nutritionTargets: { energyKcal: 2150, proteinG: 125 },
        nutritionMeals: [{
          id: 'private-backup-meal',
          name: 'PRIVATE BACKUP MEAL',
          eatenAt: '2026-08-23T12:30:00.000Z',
          updatedAt: '2026-08-23T13:00:00.000Z',
          nutrients: { energyKcal: 640, sodiumMg: 987, vitaminDMcg: 14 },
          images: [{ thumbnailUrl: 'data:image/jpeg;base64,UFJJVkFURV9USFVNQg==' }],
        }],
      }));

      const serialized = serializeBackupSnapshot(await buildFullBackupSnapshot());
      expect(serialized).not.toContain('PRIVATE BACKUP MEAL');
      expect(serialized).not.toContain('UFJJVkFURV9USFVNQg');
      const restoredSnapshot = parseBackupSnapshot(serialized);
      expect(restoredSnapshot).toMatchObject({ encrypted: true, encryptionSalt: saltText });
      const rawImported = restoredSnapshot.profiles.find(profile => profile.profileId === profileId)?.keys?.imported;
      expect(rawImported).toMatch(/^v1:/);

      await encryptedRemoveItem(storageKey);
      await setBlob(storageKey, rawImported);
      const restoredData = JSON.parse(await encryptedGetItem(storageKey));
      expect(restoredData).toMatchObject({
        contextSourceSettings: { nutrition: true },
        nutritionContextDays: 90,
        nutritionTargets: { energyKcal: 2150, proteinG: 125 },
        nutritionMeals: [{
          id: 'private-backup-meal',
          name: 'PRIVATE BACKUP MEAL',
          nutrients: { energyKcal: 640, sodiumMg: 987, vitaminDMcg: 14 },
        }],
      });

      state.currentProfile = profileId;
      state.importedData = restoredData;
      await hydrateNutritionSummary(profileId);
      await expect(getNutritionMeal(profileId, 'private-backup-meal')).resolves.toMatchObject({
        nutrients: { energyKcal: 640, sodiumMg: 987, vitaminDMcg: 14 },
      });
    } finally {
      await encryptedRemoveItem(storageKey).catch(() => {});
      await cryptoModule._setTestSessionKey(null).catch(() => {});
      localStorage.removeItem('labcharts-encryption-enabled');
      localStorage.removeItem('labcharts-encryption-salt');
      localStorage.removeItem('labcharts-profiles');
      state.currentProfile = previousProfile;
      state.importedData = previousImportedData;
      if (previousTestFlag === undefined) delete globalThis.__WEARABLES_TEST;
      else globalThis.__WEARABLES_TEST = previousTestFlag;
    }
  });
});
