// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, createProfile, profileStorageKey, getProfiles, saveProfiles } from '../js/profile.js';
import { saveImportedData, getActiveData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import * as utils from '../js/utils.js';
import { readNativeCustomMarker, previewNativeCustomMarkerCreation, commitNativeCustomMarkerCreation, commitNativeCustomMarkerRemoval } from '../js/custom-marker-store.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import type { ProfileData } from '../types/app-state.js';

const initial = { profile: state.currentProfile, data: state.importedData }, previous = localStorage.getItem('labcharts-active-profile');
const input = { name: 'Synthetic marker', unit: 'widgets', category: 'biochemistry', refMin: 1, refMax: 9, optimalMax: 8 }, id = 'custom:synthetic-native-marker';
let profile: string, key: string;
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
beforeEach(async () => {
  profile = await createProfile('Synthetic native custom marker', { skipInitialSync: true }); key = profileStorageKey(profile, 'imported');
  state.currentProfile = profile; state.importedData = createDefaultProfileData(); localStorage.setItem('labcharts-active-profile', profile);
  state.importedData.entries = [{ date: '2026-10-20', markers: { 'biochemistry.glucose': 5 }, sourceFile: 'PRIVATE_REPORT.pdf' }];
  expect(await saveImportedData()).toBe(true); vi.spyOn(utils, 'showConfirmDialog').mockResolvedValue(true);
});
afterEach(async () => {
  vi.restoreAllMocks(); document.body.innerHTML = ''; clearSyncSaveTimers();
  await storage.encryptedRemoveItem(key); await saveProfiles(getProfiles().filter(row => row.id !== profile));
  state.currentProfile = initial.profile; state.importedData = initial.data;
  if (previous === null) localStorage.removeItem('labcharts-active-profile'); else localStorage.setItem('labcharts-active-profile', previous);
});
async function create() {
  const preview = await previewNativeCustomMarkerCreation(profile, input, id);
  const plan = await commitNativeCustomMarkerCreation(profile, input, { markerId: id, expected: preview });
  return { plan, review: await readNativeCustomMarker(profile, plan.markerKey) };
}
it('previews without mutation, durably creates and uses the native category projection', async () => {
  const raw = await storage.encryptedGetItem(key), preview = await previewNativeCustomMarkerCreation(profile, input, id);
  expect(await storage.encryptedGetItem(key)).toBe(raw); expect(JSON.stringify(preview)).not.toMatch(/PRIVATE_|sourceFile/);
  const plan = await commitNativeCustomMarkerCreation(profile, input, { markerId: id, expected: preview }), after = await stored();
  expect(after.customMarkers[plan.markerKey]).toMatchObject({ markerId: id, name: input.name, unit: 'widgets' });
  expect(after.refOverrides[plan.markerKey]).toEqual({ optimalMin: null, optimalMax: 8, optimalSource: 'manual' });
  expect(getActiveData().categories.biochemistry!.markers[plan.markerKey.split('.')[1]!]).toMatchObject({ name: input.name, unit: 'widgets' });
  expect(after.entries).toEqual(JSON.parse(raw!).entries);
});
it('removes only after native confirmation, retains other markers and reports safe counts', async () => {
  const { plan } = await create(); state.importedData.entries[0]!.markers[plan.markerKey] = 4;
  state.importedData.markerNotes = { [plan.markerKey]: 'selected note' }; await saveImportedData(); const before = await stored();
  const review = await readNativeCustomMarker(profile, plan.markerKey); expect(review.effects.results).toBe(1); expect(JSON.stringify(review)).not.toContain('PRIVATE_REPORT');
  await commitNativeCustomMarkerRemoval(profile, review); const after = await stored();
  expect(utils.showConfirmDialog).toHaveBeenCalledWith(expect.stringContaining('1 saved result(s)'), expect.objectContaining({ confirmLabel: 'Delete marker and results' }));
  expect(after.customMarkers[plan.markerKey]).toBeUndefined(); expect(after.entries[0]!.markers).toEqual({ 'biochemistry.glucose': 5 });
  expect(after.entries[0]!.sourceFile).toBe(before.entries[0]!.sourceFile); expect(state.importedData.customMarkers[plan.markerKey]).toBeUndefined();
});
it('cancels without saving or claiming the review applied', async () => {
  const { review } = await create(), raw = await storage.encryptedGetItem(key); vi.mocked(utils.showConfirmDialog).mockResolvedValue(false);
  await expect(commitNativeCustomMarkerRemoval(profile, review)).rejects.toMatchObject({ cancelledBeforeSave: true }); expect(await storage.encryptedGetItem(key)).toBe(raw);
});
it.each(['profile', 'root', 'input', 'saved-result'] as const)('rejects a changed %s while confirmation is open', async cause => {
  const { review, plan } = await create(), raw = await storage.encryptedGetItem(key); let inputCurrent = true;
  vi.mocked(utils.showConfirmDialog).mockImplementation(async () => {
    if (cause === 'profile') state.currentProfile = 'other';
    if (cause === 'root') state.importedData = structuredClone(state.importedData);
    if (cause === 'input') inputCurrent = false;
    if (cause === 'saved-result') { state.importedData.entries[0]!.markers[plan.markerKey] = 6; await saveImportedData(); }
    return true;
  });
  await expect(commitNativeCustomMarkerRemoval(profile, review, () => inputCurrent)).rejects.toMatchObject({ noChangeApplied: true });
  if (cause !== 'saved-result') expect(await storage.encryptedGetItem(key)).toBe(raw); else expect((await stored()).entries[0]!.markers[plan.markerKey]).toBe(6);
  expect((await stored()).customMarkers[plan.markerKey]).toBeDefined();
});
it.each(['create', 'remove'] as const)('does not adopt an unsuccessful %s write into live state', async operation => {
  const prepared = operation === 'remove' ? await create() : null, before = await stored(), live = structuredClone(state.importedData), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic quota failure'); return write(...args); });
  if (prepared) await expect(commitNativeCustomMarkerRemoval(profile, prepared.review)).rejects.toThrow();
  else await expect(commitNativeCustomMarkerCreation(profile, input, { markerId: id })).rejects.toThrow();
  expect(await stored()).toEqual(before); expect(state.importedData).toEqual(live);
});
it.each([false, true])('guards the selected registry inside the native save lock (related peer %s)', async related => {
  const { plan, review } = await create(), peer = await stored(), read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  if (related) peer.customMarkers[plan.markerKey]!.unit = 'changed'; else peer.contextNotes = 'Peer unrelated change';
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 3) await write(key, JSON.stringify(peer)); return read(...args); });
  if (related) await expect(commitNativeCustomMarkerRemoval(profile, review)).rejects.toMatchObject({ noChangeApplied: true }); else await commitNativeCustomMarkerRemoval(profile, review);
  expect((await stored()).contextNotes).toBe(peer.contextNotes); if (related) expect((await stored()).customMarkers[plan.markerKey]!.unit).toBe('changed');
});
it('keeps unsaved native marker edits and rejects built-in removals', async () => {
  const { review, plan } = await create(), raw = await storage.encryptedGetItem(key); state.importedData.customMarkers[plan.markerKey]!.name = 'Unsaved input';
  await expect(commitNativeCustomMarkerRemoval(profile, review)).rejects.toThrow(/native marker edits/); expect(await storage.encryptedGetItem(key)).toBe(raw);
  await expect(readNativeCustomMarker(profile, 'biochemistry.glucose')).rejects.toThrow(/built-in/);
});
it('prevents two in-flight creations from producing duplicate definitions', async () => {
  const results = await Promise.allSettled([commitNativeCustomMarkerCreation(profile, input, { markerId: id }), commitNativeCustomMarkerCreation(profile, input, { markerId: 'custom:other-native-marker' })]);
  expect(results.filter(row => row.status === 'fulfilled')).toHaveLength(1); expect(results.filter(row => row.status === 'rejected')).toHaveLength(1);
  expect(Object.values((await stored()).customMarkers).filter(row => row.name === input.name)).toHaveLength(1);
});
