import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { readProfileForLoad } from '../js/profile-load-safety.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as crypto from '../js/crypto.js';
import { createNutritionEntrySession } from '../js/nutrition-entry-session.js';
import { getNutritionTargets } from '../js/nutrition-targets.js';
import { deleteNutritionDB, listNutritionMeals } from '../js/nutrition-store.js';
const profile = 'nutrition-owned-entry', key = profileStorageKey(profile, 'imported');
const previousProfile = state.currentProfile, previousData = state.importedData, previousSummary = state.nutritionSummary;
const stored = async () => JSON.parse((await crypto.encryptedGetItem(key))!);
beforeEach(async () => {
  state.currentProfile = profile; state.importedData = createDefaultProfileData();
  await crypto.encryptedRemoveItem(key); expect(await saveImportedData()).toBe(true);
});
afterEach(async () => {
  vi.restoreAllMocks(); await deleteNutritionDB(profile); await crypto.encryptedRemoveItem(key);
  state.currentProfile = previousProfile; state.importedData = previousData; state.nutritionSummary = previousSummary;
});
it('keeps failed settings unpublished and permits retry without losing the draft', async () => {
  const session = createNutritionEntrySession(), before = structuredClone(state.importedData);
  const value = { ...getNutritionTargets(), energyKcal: 2450, widgetNutrients: ['proteinG', 'magnesiumMg'] };
  const write = vi.spyOn(crypto, 'encryptedSetItem').mockRejectedValueOnce(new Error('Storage failed'));
  expect(await session.saveTargets(value)).toBe('failed'); expect(state.importedData).toEqual(before);
  write.mockRestore(); expect(await session.saveTargets(value)).toBe('saved');
  expect((await stored()).nutritionTargets).toMatchObject({ configured: true, energyKcal: 2450, widgetNutrients: ['proteinG', 'magnesiumMg'] });
});
it('commits settings to the initiating profile after retirement without changing the new profile', async () => {
  const source = state.importedData, original = crypto.encryptedSetItem;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(crypto, 'encryptedSetItem').mockImplementation(async (...args) => { await gate; return original(...args); });
  const session = createNutritionEntrySession(), value = { ...getNutritionTargets(), energyKcal: 2600 };
  const pending = session.saveTargets(value);
  expect(source.nutritionTargets?.energyKcal).not.toBe(2600);
  expect(await session.saveTargets(value)).toBe('busy');
  session.retire(); state.currentProfile = 'other-entry-profile'; state.importedData = createDefaultProfileData();
  state.importedData.contextNotes = 'Other profile';
  release(); expect(await pending).toBe('saved'); expect((await stored()).nutritionTargets.energyKcal).toBe(2600);
  expect(source.nutritionTargets?.energyKcal).toBe(2600); expect(state.importedData.nutritionTargets?.energyKcal).not.toBe(2600);
  expect(state.importedData.contextNotes).toBe('Other profile'); expect(await session.saveTargets(value)).toBe('retired');
});
it('rejects a saved peer change inside the profile transaction without overwriting unrelated data', async () => {
  const session = createNutritionEntrySession(), peer = await stored();
  peer.nutritionTargets = { ...getNutritionTargets(), configured: true, energyKcal: 2700 }; peer.contextNotes = 'Peer notes';
  await crypto.encryptedSetItem(key, JSON.stringify(peer));
  expect(await session.saveTargets({ ...getNutritionTargets(), energyKcal: 2500 })).toBe('conflict');
  expect((await stored()).nutritionTargets.energyKcal).toBe(2700); expect((await stored()).contextNotes).toBe('Peer notes');
});
it('rejects local settings changes while preserving unsaved and peer fields in accepted writes', async () => {
  const session = createNutritionEntrySession(); state.importedData.nutritionTargets = { ...getNutritionTargets(), energyKcal: 2800 };
  expect(await session.saveTargets({ ...getNutritionTargets(), energyKcal: 2200 })).toBe('conflict');
  delete state.importedData.nutritionTargets;
  const next = createNutritionEntrySession(), peer = await stored(); peer.contextNotes = 'Peer notes';
  await crypto.encryptedSetItem(key, JSON.stringify(peer)); state.importedData.contextNotes = 'Unsaved local notes';
  expect(await next.saveTargets({ ...getNutritionTargets(), energyKcal: 2400 })).toBe('saved');
  expect((await stored()).contextNotes).toBe('Peer notes'); expect(state.importedData.contextNotes).toBe('Unsaved local notes');
});
it('finishes an accepted drink on its original profile and rejects subsequent stale actions', async () => {
  const session = createNutritionEntrySession();
  const pending = session.saveFluid({ kind: 'tea-coffee', amount: 275.5, at: '2026-10-08T10:30', label: 'Green tea' });
  state.currentProfile = 'other-drink-profile'; state.importedData = createDefaultProfileData();
  expect(await pending).toBe('saved');
  const meals = await listNutritionMeals(profile);
  expect(meals).toMatchObject([{ name: 'Green tea', mealType: 'drink', nutrients: { fluidMl: 275.5 }, localDate: '2026-10-08', localTimeMinutes: 630 }]);
  expect(meals[0]?.nutrients).not.toHaveProperty('plainWaterMl'); expect((await stored()).nutritionMeals).toHaveLength(1);
  expect(state.importedData.nutritionMeals || []).toEqual([]);
  expect(await session.saveFluid({ kind: 'water', amount: 500, at: '2026-10-08T12:00', label: '' })).toBe('retired');
});

it('blocks new form writes after a failed profile read until that profile loads successfully', async () => {
  const session = createNutritionEntrySession(), before = await stored();
  await expect(readProfileForLoad(profile, () => Promise.reject(new Error('Read failed')), () => {})).rejects.toThrow('Read failed');
  try {
    expect(await session.saveTargets(getNutritionTargets())).toBe('blocked');
    expect(await session.saveFluid({ kind: 'water', amount: 500, at: '2026-10-08T12:00', label: '' })).toBe('blocked');
    expect(await stored()).toEqual(before);
  } finally { await readProfileForLoad(profile, () => undefined, () => {}); }
});
