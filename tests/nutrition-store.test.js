import { afterEach, describe, expect, it } from 'vitest';

import {
  buildNutritionArchive,
  deleteNutritionDB,
  deleteNutritionMeal,
  getLocalNutritionComparison,
  getNutritionMeal,
  getNutritionFood,
  hydrateNutritionSummary,
  listNutritionMeals,
  openNutritionDB,
  putNutritionMeal,
  putNutritionFood,
  restoreNutritionArchive,
  setLocalNutritionComparison,
  setLocalNutritionSummary,
} from '../js/nutrition-store.js';
import { state } from '../js/state.js';

const profileIds = new Set();

afterEach(async () => {
  await Promise.all([...profileIds].map(profileId => deleteNutritionDB(profileId)));
  profileIds.clear();
});

describe('thumbnail-only nutrition storage', () => {
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

  it('caches barcode food data under a hashed key with an encrypted payload', async () => {
    const profileId = `nutrition-food-${Date.now()}`;
    profileIds.add(profileId);
    await putNutritionFood(profileId, { barcode: '3017620422003', name: 'Hazelnut spread', per100g: { energyKcal: 539 } });

    await expect(getNutritionFood(profileId, '3017620422003')).resolves.toMatchObject({
      barcode: '3017620422003',
      name: 'Hazelnut spread',
    });
    const db = await openNutritionDB(profileId);
    const raw = await new Promise((resolve, reject) => {
      const request = db.transaction('food-cache', 'readonly').objectStore('food-cache').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(raw).toHaveLength(1);
    expect(JSON.stringify(raw)).not.toContain('3017620422003');
    expect(JSON.stringify(raw)).not.toContain('Hazelnut spread');
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
    const fallback = { version: 7, totalMeals: 1, windows: { d7: { meals: 1, dailyAverages: { energyKcal: 620 } } } };
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
      nutrients: { energyKcal: 520, proteinG: 28 },
      images: [{ dataUrl: 'data:image/jpeg;base64,RlVMTA==', thumbnailUrl: 'data:image/jpeg;base64,VEhVTUI=' }],
    });

    const archive = await buildNutritionArchive(source);
    expect(archive).toMatchObject({ version: 1, includesPhotos: true });
    await expect(restoreNutritionArchive(target, archive)).resolves.toBe(1);
    await expect(getNutritionMeal(target, 'portable-meal')).resolves.toMatchObject({
      name: 'Portable lunch',
      mealType: 'lunch',
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
});
