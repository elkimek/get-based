// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import * as data from '../js/data.js';
import * as storage from '../js/crypto.js';
import * as meals from '../js/nutrition-store.js';
import { commitNativeNutritionMeal, readCurrentNutritionRecords } from '../js/nutrition-record-store.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
const original = { profile: state.currentProfile, root: state.importedData, summary: state.nutritionSummary };
let profile: string, key: string;
const fresh = () => ({ name: 'Native chosen meal', mealType: 'lunch', eatenAt: '2026-10-20T12:01:22.123Z', note: 'Original note', nutrients: { energyKcal: 350 }, source: { kind: 'manual', opaque: 'Keep source' }, opaquePortableMetadata: { revision: 1 } });
const raw = () => storage.encryptedGetItem(key);
const canonical = async () => JSON.parse((await raw())!) as typeof state.importedData;
beforeEach(async () => {
  profile = 'native-meal-' + crypto.randomUUID(); key = profileStorageKey(profile, 'imported');
  state.currentProfile = profile; state.importedData = createDefaultProfileData(); state.importedData.contextNotes = 'Unrelated health';
  expect(await data.saveImportedData()).toBe(true); await meals.reconcileNutritionMealsFromProfileData(profile);
  await meals.saveActiveProfileMeal({ id: 'native-target', ...fresh() });
});
afterEach(async () => { vi.restoreAllMocks(); clearSyncSaveTimers(); await meals.deleteNutritionDB(profile); state.currentProfile = original.profile; state.importedData = original.root; state.nutritionSummary = original.summary; localStorage.clear(); });
const before = async () => (await readCurrentNutritionRecords(profile)).find(row => row.id === 'native-target')!;
it('commits an exact native edit through canonical storage and the encrypted cache', async () => {
  const first = await before(), result = await commitNativeNutritionMeal(profile, first, { ...first, note: 'Native correction' }, () => true);
  expect(result.refreshPending).toBe(false); expect(result.meal).toMatchObject({ note: 'Native correction', opaquePortableMetadata: { revision: 1 }, source: { opaque: 'Keep source' } });
  expect(await meals.getNutritionMeal(profile, 'native-target')).toEqual(result.meal);
  expect((await canonical()).contextNotes).toBe('Unrelated health'); expect((await canonical()).nutritionMeals).toEqual([result.meal]);
});
it('creates one native record without replacing a supplied or existing identity', async () => {
  const result = await commitNativeNutritionMeal(profile, null, fresh(), () => true);
  expect(result.meal.id).not.toBe('native-target'); expect(result.refreshPending).toBe(false);
  expect((await canonical()).nutritionMeals).toHaveLength(2); expect(await meals.getNutritionMeal(profile, String(result.meal.id))).toEqual(result.meal);
  expect(() => commitNativeNutritionMeal(profile, null, { id: 'native-target', ...fresh() }, () => true)).toThrow();
});
it('refuses a newer canonical meal without writing its local cache', async () => {
  const first = await before(), cache = await meals.getNutritionMeal(profile, 'native-target'), peer = await canonical();
  peer.nutritionMeals![0]!.note = 'Newer peer note'; await storage.encryptedSetItem(key, JSON.stringify(peer)); const saved = await raw();
  await expect(commitNativeNutritionMeal(profile, first, { ...first, note: 'Stale draft' }, () => true)).rejects.toMatchObject({ noChangeApplied: true });
  expect(await raw()).toBe(saved); expect(await meals.getNutritionMeal(profile, 'native-target')).toEqual(cache);
});
it('enforces the record expectation after a peer writes between the read and atomic commit', async () => {
  const first = await before(), cache = await meals.getNutritionMeal(profile, 'native-target'), write = data.saveImportedDataForProfile;
  let peerSaved: string | null = null;
  vi.spyOn(data, 'saveImportedDataForProfile').mockImplementation(async (...args) => { const peer = await canonical(); peer.nutritionMeals![0]!.note = 'Peer at commit boundary'; await storage.encryptedSetItem(key, JSON.stringify(peer)); peerSaved = await raw(); return write(...args); });
  await expect(commitNativeNutritionMeal(profile, first, { ...first, note: 'Stale draft' }, () => true)).rejects.toMatchObject({ noChangeApplied: true });
  expect(peerSaved).not.toBeNull(); expect(await raw()).toBe(peerSaved); expect(await meals.getNutritionMeal(profile, 'native-target')).toEqual(cache);
});
it('withholds both canonical and cache writes when native ownership is revoked at commit', async () => {
  const first = await before(), cache = await meals.getNutritionMeal(profile, 'native-target'), saved = await raw(), write = data.saveImportedDataForProfile; let allowed = true;
  vi.spyOn(data, 'saveImportedDataForProfile').mockImplementation(async (...args) => { allowed = false; return write(...args); });
  await expect(commitNativeNutritionMeal(profile, first, { ...first, note: 'Retired draft' }, () => allowed)).rejects.toMatchObject({ noChangeApplied: true });
  expect(await raw()).toBe(saved); expect(await meals.getNutritionMeal(profile, 'native-target')).toEqual(cache);
});
for (const create of [false, true]) it(`reports committed data accurately after cache failure for creation ${create}`, async () => {
  const first = await before(), cache = await meals.listNutritionMeals(profile);
  vi.spyOn(meals, 'refreshNutritionMealsFromSnapshot').mockRejectedValue(new Error('Synthetic cache failure'));
  const result = await commitNativeNutritionMeal(profile, create ? null : first, create ? fresh() : { ...first, note: 'Committed native correction' }, () => true);
  expect(result.refreshPending).toBe(true); expect((await canonical()).nutritionMeals).toContainEqual(result.meal); expect(await meals.listNutritionMeals(profile)).toEqual(cache);
});
it('does not revive a deleted canonical meal from an open native form', async () => {
  const first = await before(), cache = await meals.getNutritionMeal(profile, 'native-target'), peer = await canonical(); peer.nutritionMeals = [];
  await storage.encryptedSetItem(key, JSON.stringify(peer)); const saved = await raw();
  await expect(commitNativeNutritionMeal(profile, first, { ...first, note: 'Retired draft' }, () => true)).rejects.toMatchObject({ noChangeApplied: true });
  expect(await raw()).toBe(saved); expect(await meals.getNutritionMeal(profile, 'native-target')).toEqual(cache);
});
