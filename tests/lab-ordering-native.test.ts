// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createProfile, createDefaultProfileData, profileStorageKey, getProfiles, saveProfiles } from '../js/profile.js';
import { saveImportedData, getActiveData, invalidateActiveDataCache } from '../js/data.js';
import * as storage from '../js/crypto.js';
import { readNativeLabOrder, commitNativeLabOrder } from '../js/lab-ordering-store.js';
import { nativeLabOrderScopes, applyNativeLabOrder } from '../js/lab-ordering-native.js';
import type { NativeLabOrderCommand } from '../js/lab-ordering-native.js';
import { setMarkerPlacement } from '../js/marker-placement.js';
import { appendLabOrderMove, replaceLabOrder, projectLabOrder } from '../js/lab-ordering-core.js';
import { mergeImportedData, localHasRowsRemoteLacks } from '../js/data-merge.js';
import { mergeProfileMutation } from '../js/profile-data-writes.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import type { ProfileData } from '../types/app-state.js';
const initial = { profile: state.currentProfile, data: state.importedData }, oldActive = localStorage.getItem('labcharts-active-profile');
const scopeId = 'markers.biochemistry', move = { move: { item: 'biochemistry.glucose', before: 'biochemistry.urea' } };
let profile: string, key: string;
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
beforeEach(async () => {
  profile = await createProfile('Synthetic order checks', { skipInitialSync: true }); key = profileStorageKey(profile, 'imported');
  state.currentProfile = profile; state.importedData = createDefaultProfileData(); localStorage.setItem('labcharts-active-profile', profile);
  state.importedData.entries = [{ date: '2026-10-20', markers: { 'biochemistry.glucose': 5, 'biochemistry.urea': 5 }, sourceFile: 'PRIVATE_SOURCE.pdf' }];
  state.importedData.contextNotes = 'PRIVATE_CONTEXT'; state.importedData.labOrdering = { futureScope: { version: 99, keep: true } };
  expect(await saveImportedData()).toBe(true);
});
afterEach(async () => {
  vi.restoreAllMocks(); clearSyncSaveTimers(); await storage.encryptedRemoveItem(key); await saveProfiles(getProfiles().filter(row => row.id !== profile));
  state.currentProfile = initial.profile; state.importedData = initial.data; invalidateActiveDataCache();
  if (oldActive === null) localStorage.removeItem('labcharts-active-profile'); else localStorage.setItem('labcharts-active-profile', oldActive);
});
it('reads native ordering without adopting, saving or exposing clinical/source data', async () => {
  const raw = await storage.encryptedGetItem(key), root = state.importedData, snapshot = await readNativeLabOrder(profile, scopeId);
  expect(snapshot.record.items.some(item => item.id === move.move.item)).toBe(true); expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE_|sourceFile|entries/);
  expect(await storage.encryptedGetItem(key)).toBe(raw); expect(state.importedData).toBe(root);
});
it.each([{}, { reset: false }, { reset: true, move: move.move }, { all: true }])('refuses an ambiguous native command before changing the live data: %j', command => {
  const before = structuredClone(state.importedData);
  expect(() => applyNativeLabOrder(state.importedData, scopeId, command as unknown as NativeLabOrderCommand)).toThrow(/explicit/); expect(state.importedData).toEqual(before);
});
it('durably changes only the selected ordering scope and projects the actual active view', async () => {
  const before = await stored(), expected = await readNativeLabOrder(profile, scopeId), result = await commitNativeLabOrder(profile, expected, move), after = await stored();
  expect({ ...after, labOrdering: before.labOrdering }).toEqual(before); expect(after.labOrdering!.futureScope).toEqual(before.labOrdering!.futureScope);
  expect(result.snapshot.record.items.findIndex(row => row.id === move.move.item)).toBeLessThan(result.snapshot.record.items.findIndex(row => row.id === move.move.before));
  const view = getActiveData(), keys = Object.keys(view.categories.biochemistry!.markers);
  expect(keys.indexOf('glucose')).toBeLessThan(keys.indexOf('urea')); expect(view.categories.biochemistry!.markers.glucose!.values).toEqual([5]);
});
it('keeps moved markers attached to their canonical storage keys', async () => {
  expect(setMarkerPlacement(state.importedData, move.move.item, 'lipids').ok).toBe(true); expect(await saveImportedData()).toBe(true);
  const scopes = nativeLabOrderScopes(state.importedData), target = scopes.find(row => row.id === 'markers.lipids')!;
  expect(target.items.some(row => row.id === move.move.item && row.sourceKeys[0] === move.move.item)).toBe(true);
  expect(scopes.find(row => row.id === scopeId)!.items.some(row => row.id === move.move.item)).toBe(false);
  const anchor = target.items.find(row => row.id !== move.move.item)!.id, expected = await readNativeLabOrder(profile, target.id);
  await commitNativeLabOrder(profile, expected, { move: { item: move.move.item, before: anchor } });
  const view = getActiveData(); expect(view.categories.lipids!.markers.glucose).toMatchObject({ storageDotKey: move.move.item, values: [5] }); expect((await stored()).entries[0]!.markers[move.move.item]).toBe(5);
});
it.each(['label', 'placement', 'registry', 'scope', 'unsaved'] as const)('rejects a stale %s dependency without losing the newer data', async cause => {
  const expected = await readNativeLabOrder(profile, scopeId), peer = await stored();
  if (cause === 'label') peer.markerLabels = { [move.move.item]: 'Peer label' };
  if (cause === 'placement') expect(setMarkerPlacement(peer, move.move.item, 'lipids').ok).toBe(true);
  if (cause === 'registry') peer.customMarkers = { 'biochemistry.synthetic': { name: 'Synthetic', unit: '' } };
  if (cause === 'scope') peer.labOrdering![scopeId] = appendLabOrderMove(null, move.move, 'peer', 1);
  if (cause === 'unsaved') state.importedData.labOrdering![scopeId] = appendLabOrderMove(null, move.move, 'unsaved', 1);
  else await storage.encryptedSetItem(key, JSON.stringify(peer));
  const raw = await storage.encryptedGetItem(key), live = structuredClone(state.importedData);
  await expect(commitNativeLabOrder(profile, expected, move)).rejects.toMatchObject({ noChangeApplied: true }); expect(await storage.encryptedGetItem(key)).toBe(raw); expect(state.importedData).toEqual(live);
});
it('refuses another profile, retired editor and invalid target or anchor before writing', async () => {
  const expected = await readNativeLabOrder(profile, scopeId), raw = await storage.encryptedGetItem(key);
  await expect(commitNativeLabOrder(profile, expected, move, () => false)).rejects.toMatchObject({ noChangeApplied: true });
  await expect(commitNativeLabOrder(profile, expected, { move: { item: 'lipids.apoB', before: move.move.before } })).rejects.toThrow(/item or anchor/);
  await expect(commitNativeLabOrder(profile, expected, { move: { item: move.move.item, before: 'lipids.apoB' } })).rejects.toThrow(/item or anchor/);
  state.currentProfile = 'synthetic-other'; await expect(commitNativeLabOrder(profile, expected, move)).rejects.toMatchObject({ noChangeApplied: true }); expect(await storage.encryptedGetItem(key)).toBe(raw);
});
it('preserves a clinical peer correction and another ordering scope at the locked save', async () => {
  const expected = await readNativeLabOrder(profile, scopeId), peer = await stored(), read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  peer.entries[0]!.markers[move.move.item] = 5.2; peer.labOrdering!.sidebar = appendLabOrderMove(null, { item: 'category.lipids', before: 'category.biochemistry' }, 'peer', 1);
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) await write(key, JSON.stringify(peer)); return read(...args); });
  await commitNativeLabOrder(profile, expected, move); const after = await stored(); expect(after.entries).toEqual(peer.entries); expect(after.labOrdering!.sidebar).toEqual(peer.labOrdering!.sidebar); expect(after.labOrdering![scopeId]).toBeTruthy();
});
it('refuses a concurrent selected-scope change at the final locked save', async () => {
  const expected = await readNativeLabOrder(profile, scopeId), peer = await stored(), read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  peer.labOrdering![scopeId] = appendLabOrderMove(null, { item: move.move.before, after: move.move.item }, 'peer', 1);
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) await write(key, JSON.stringify(peer)); return read(...args); });
  await expect(commitNativeLabOrder(profile, expected, move)).rejects.toMatchObject({ noChangeApplied: true }); expect(await stored()).toEqual(peer);
});
it('keeps failed writes off the live root and retains the exact durable snapshot', async () => {
  const expected = await readNativeLabOrder(profile, scopeId), before = await stored(), live = structuredClone(state.importedData), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic save unavailable'); return write(...args); });
  await expect(commitNativeLabOrder(profile, expected, move)).rejects.toThrow(/could not be saved/); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(live);
});
it('restores previous intents as a fresh generation and a stale peer cannot revive the undone move', async () => {
  const expected = await readNativeLabOrder(profile, scopeId), applied = await commitNativeLabOrder(profile, expected, move), stale = await stored();
  const undone = await commitNativeLabOrder(profile, applied.snapshot, { restore: applied.before });
  expect(undone.after.commands).toHaveLength(0); expect(undone.after.generation.at).toBeGreaterThan(applied.after.commands[0]!.at);
  const after = await stored(); expect(mergeImportedData(after, stale).labOrdering![scopeId]).toEqual(after.labOrdering![scopeId]); expect(localHasRowsRemoteLacks(after, stale)).toBe(true);
  expect(mergeImportedData(stale, after).labOrdering![scopeId]).toEqual(after.labOrdering![scopeId]);
});
it('three-way profile saves union concurrent moves while deletion of an ordering map cannot erase peer choices', () => {
  const a = appendLabOrderMove(null, { item: 'A', after: 'C' }, 'a', 1), b = appendLabOrderMove(null, { item: 'D', before: 'B' }, 'b', 1), base = { labOrdering: {} };
  const merged = mergeProfileMutation(base, { labOrdering: { markers: a } }, { labOrdering: { markers: b } });
  expect(projectLabOrder(['A', 'B', 'C', 'D'], row => row, merged.labOrdering.markers)).toEqual(['D', 'B', 'C', 'A']);
  expect(mergeProfileMutation({ labOrdering: { markers: a } }, {}, merged)).toEqual(merged);
  const reset = replaceLabOrder(merged.labOrdering.markers, null, 'reset', 5);
  expect(mergeProfileMutation(base, { labOrdering: { markers: reset } }, merged).labOrdering.markers).toEqual(reset);
});
