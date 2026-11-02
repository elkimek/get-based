// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { editManualMarkerValue, saveManualMarkerValue, revertManualMarkerValue, deleteManualMarkerValue, getManualOriginalForMarker, hasMarkerValueForDate } from '../js/marker-detail-store.js';
import { commitLabMarkerCommand } from '../js/lab-marker-record-store.js';
import { removeLabPanel, restoreLabPanel } from '../js/lab-panel-mutations.js';
import { labPanelTombstoneKey } from '../js/lab-panel-deletions.js';
import { mergeImportedData } from '../js/data-merge.js';
import type { ProfileData } from '../types/app-state.js';
import { renameLabEntryMarker, setLabEntryMarker, deleteLabEntryMarker } from '../js/lab-entry.js';
const day = '2026-10-20', marker = 'biochemistry.glucose', noteKey = `${marker}:${day}`;
const initial = { profile: state.currentProfile, data: state.importedData };
let profile: string, key: string;
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
beforeEach(async () => {
  profile = `panel-mutation-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported'); state.currentProfile = profile; state.importedData = createDefaultProfileData(); localStorage.setItem('labcharts-active-profile', profile);
  state.importedData.entries = [
    { date: day, markers: { [marker]: 5 }, sourceFile: 'first.pdf', markerSources: { [marker]: { file: 'first.pdf', snapshotId: 'first-report', at: 100 } }, context: { sampleTime: '08:00', fasting: true }, updatedAt: 100 },
    { date: day, markers: { [marker]: 6 }, sourceFile: 'second.pdf', markerSources: { [marker]: { file: 'second.pdf', snapshotId: 'second-report', at: 200 } }, context: { sampleTime: '16:00', fasting: false }, updatedAt: 200 },
  ];
  state.importedData.markerValueNotes = { [noteKey]: 'Shared date note' }; expect(await saveImportedData()).toBe(true);
});
afterEach(async () => { vi.restoreAllMocks(); clearSyncSaveTimers(); await storage.encryptedRemoveItem(key); state.currentProfile = initial.profile; state.importedData = initial.data; });
it('edits and reverts one sample with its own original, source and unchanged sibling', async () => {
  const before = await stored(), panelId = before.entries[0]!.panelId!;
  expect(await editManualMarkerValue({ dotKey: marker, date: day, panelId, storedValue: 5.5, now: 1000 })).toBeTruthy();
  let saved = await stored(); expect(saved.entries[0]!.markers[marker]).toBe(5.5); expect(saved.entries[1]).toEqual(before.entries[1]);
  expect(saved.entries[0]!.manualOriginals![marker]).toMatchObject({ value: 5, source: { file: 'first.pdf', snapshotId: 'first-report' } });
  expect(saved.entries[0]!.markerSources![marker]).toMatchObject({ manuallyEdited: true, file: 'first.pdf', snapshotId: 'first-report' });
  expect(getManualOriginalForMarker(marker, day, panelId)).toBe(5); expect(getManualOriginalForMarker(marker, day)).toBeUndefined();
  expect(await revertManualMarkerValue(marker, day, { panelId, now: 1100 })).toBeTruthy(); saved = await stored();
  expect(saved.entries[0]!.markers[marker]).toBe(5); expect(saved.entries[0]!.markerSources![marker]).toEqual({ file: 'first.pdf', snapshotId: 'first-report', at: 1100 });
  expect(saved.entries[0]!.manualOriginals?.[marker]).toBeNull(); expect(saved.entries[1]).toEqual(before.entries[1]);
});
it('moves original metadata with marker aliases and removes it with a replaced report or deleted result', async () => {
  const panelId = state.importedData.entries[0]!.panelId!;
  expect(await editManualMarkerValue({ dotKey: marker, date: day, panelId, storedValue: 5.5 })).toBeTruthy();
  const entry = state.importedData.entries[0]!, original = structuredClone(entry.manualOriginals![marker]);
  renameLabEntryMarker(entry, marker, 'custom.glucose'); expect(entry.manualOriginals!['custom.glucose']).toEqual(original); expect(entry.manualOriginals![marker]).toBeUndefined();
  setLabEntryMarker(entry, 'custom.glucose', 5.8, { source: { file: 'replacement.pdf', snapshotId: 'replacement-report', at: 2000 }, now: 2000 });
  expect(entry.manualOriginals!['custom.glucose']).toBeNull();
  entry.manualOriginals!['custom.glucose'] = original!; deleteLabEntryMarker(entry, 'custom.glucose', { now: 2100 }); expect(entry.manualOriginals!['custom.glucose']).toBeUndefined();
});
it('refuses an ambiguous date write without modifying live data or durable history', async () => {
  const before = await storage.encryptedGetItem(key), live = structuredClone(state.importedData);
  expect(await editManualMarkerValue({ dotKey: marker, date: day, storedValue: 8 })).toBeNull();
  expect(await storage.encryptedGetItem(key)).toBe(before); expect(state.importedData).toEqual(live);
});
it('retains a unique legacy original until an explicit replacement report clears it', async () => {
  state.importedData.entries.splice(1, 1); state.importedData.manualValues = { [noteKey]: 4.5 }; expect(await saveImportedData()).toBe(true);
  const entry = state.importedData.entries[0]!, panelId = entry.panelId!;
  expect(getManualOriginalForMarker(marker, day, panelId)).toBe(4.5);
  setLabEntryMarker(entry, marker, 5.8, { source: { file: 'replacement.pdf', snapshotId: 'replacement-report', at: 2000 }, now: 2000 });
  expect(getManualOriginalForMarker(marker, day, panelId)).toBeUndefined(); expect(entry.manualOriginals![marker]).toBeNull();
  expect(await saveImportedData()).toBe(true);
  expect(await editManualMarkerValue({ dotKey: marker, date: day, panelId, storedValue: 6, now: 3000 })).toBeTruthy();
  expect(getManualOriginalForMarker(marker, day, panelId)).toBe(5.8);
});
it('never adopts an ambiguous legacy date original as a specimen original', async () => {
  state.importedData.manualValues = { [noteKey]: 999 }; state.importedData.entries[0]!.markerSources![marker]!.manuallyEdited = true; expect(await saveImportedData()).toBe(true);
  const panelId = state.importedData.entries[0]!.panelId!;
  expect(getManualOriginalForMarker(marker, day, panelId)).toBeUndefined();
  expect(await editManualMarkerValue({ dotKey: marker, date: day, panelId, storedValue: 5.5 })).toBeTruthy();
  const saved = await stored(); expect(saved.entries[0]!.manualOriginals?.[marker]).toBeNull(); expect(saved.manualValues![noteKey]).toBe(999);
  expect(await revertManualMarkerValue(marker, day, { panelId })).toBeNull();
});
it('deletes one result with a marker tombstone while preserving its sibling and the date-wide note', async () => {
  const before = await stored(), panelId = before.entries[0]!.panelId!;
  expect(await deleteManualMarkerValue(marker, day, { panelId, now: 1000 })).toBeTruthy(); const saved = await stored();
  expect(saved.entries[0]!.markers[marker]).toBeUndefined(); expect(saved.entries[0]!.deletedMarkers![marker]).toBe(1000); expect(saved.entries[1]).toEqual(before.entries[1]);
  expect(saved.markerValueNotes[noteKey]).toBe('Shared date note'); expect(hasMarkerValueForDate(marker, day)).toBe(true); expect(getManualOriginalForMarker(marker, day, panelId)).toBeUndefined();
  const merged = mergeImportedData(saved, before); expect(merged.entries[0]!.markers[marker]).toBeUndefined(); expect(merged.entries[1]!.markers[marker]).toBe(6);
});
it('adds a deliberately separate sample without replacing any existing same-day value', async () => {
  const before = await stored();
  expect(await saveManualMarkerValue({ dotKey: marker, date: day, newPanel: true, storedValue: 7, collectionContext: { sampleTime: '21:00', fasting: false }, now: 1000 })).toBeTruthy();
  const saved = await stored(); expect(saved.entries.slice(0, 2)).toEqual(before.entries); expect(saved.entries[2]!.markers[marker]).toBe(7); expect(saved.entries[2]!.context).toEqual({ sampleTime: '21:00', fasting: false });
  expect(saved.markerValueNotes[noteKey]).toBe('Shared date note');
  expect(new Set(saved.entries.map(row => row.panelId)).size).toBe(3);
});
it('does not publish a value before durable commit and an accepted write stays on its captured profile', async () => {
  const panelId = state.importedData.entries[0]!.panelId!, original = storage.encryptedSetItem;
  let release!: () => void, began!: () => void; const held = new Promise<void>(resolve => { release = resolve; }), started = new Promise<void>(resolve => { began = resolve; });
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) { began(); await held; } return original(...args); });
  const pending = editManualMarkerValue({ dotKey: marker, date: day, panelId, storedValue: 5.5 }); await started;
  expect(state.importedData.entries[0]!.markers[marker]).toBe(5); expect((await stored()).entries[0]!.markers[marker]).toBe(5);
  state.currentProfile = 'unrelated-panel-profile'; state.importedData = createDefaultProfileData(); state.importedData.contextNotes = 'Keep'; release(); expect(await pending).toBeTruthy();
  expect((await stored()).entries[0]!.markers[marker]).toBe(5.5); expect(state.importedData.entries).toEqual([]); expect(state.importedData.contextNotes).toBe('Keep');
});
it('keeps failed saves unpublished and permits an explicit retry', async () => {
  const before = await storage.encryptedGetItem(key), panelId = state.importedData.entries[0]!.panelId!, write = vi.spyOn(storage, 'encryptedSetItem').mockRejectedValueOnce(new Error('Quota'));
  expect(await editManualMarkerValue({ dotKey: marker, date: day, panelId, storedValue: 5.5 })).toBeNull(); expect(state.importedData.entries[0]!.markers[marker]).toBe(5); expect(await storage.encryptedGetItem(key)).toBe(before);
  write.mockRestore(); expect(await editManualMarkerValue({ dotKey: marker, date: day, panelId, storedValue: 5.5 })).toBeTruthy();
});
it.each(['sample', 'note', 'dateDeletion'] as const)('guards a concurrent %s change inside the profile lock', async kind => {
  const panelId = state.importedData.entries[0]!.panelId!, peer = await stored(), read = storage.encryptedGetItem, write = storage.encryptedSetItem; let once = false;
  if (kind === 'sample') peer.entries[1]!.markers[marker] = 8;
  if (kind === 'note') peer.markerValueNotes[noteKey] = 'Peer note';
  if (kind === 'dateDeletion') { peer._deleted = { entries: [day] }; peer._deletedAt = { entries: { [day]: 1000 } }; }
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (!once && args[0] === key) { once = true; await write(key, JSON.stringify(peer)); } return read(...args); });
  await expect(commitLabMarkerCommand(profile, state.importedData, { kind: 'edit', dotKey: marker, date: day, panelId, storedValue: 5.5 })).rejects.toMatchObject({ noChangeApplied: true });
  expect(await stored()).toEqual(peer); expect(state.importedData.entries[0]!.markers[marker]).toBe(5);
});
it('merges an unrelated peer date and retains an unsubmitted lifestyle draft', async () => {
  const peer = await stored(); peer.entries.push({ date: '2026-10-19', markers: { [marker]: 4 } }); await storage.encryptedSetItem(key, JSON.stringify(peer));
  state.importedData.stress = { note: 'Unsaved' }; const panelId = state.importedData.entries[0]!.panelId!;
  expect(await editManualMarkerValue({ dotKey: marker, date: day, panelId, storedValue: 5.5 })).toBeTruthy();
  const saved = await stored(); expect(saved.entries.find(row => row.date === '2026-10-19')!.markers[marker]).toBe(4); expect(saved.stress).toBeNull(); expect(state.importedData.stress).toEqual({ note: 'Unsaved' });
});
it('rechecks authorization inside the locked transaction', async () => {
  const original = storage.encryptedGetItem; let enabled = true;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { const raw = await original(...args); if (args[0] === key) enabled = false; return raw; });
  await expect(commitLabMarkerCommand(profile, state.importedData, { kind: 'edit', dotKey: marker, date: day, panelId: state.importedData.entries[0]!.panelId!, storedValue: 5.5 }, () => enabled)).rejects.toMatchObject({ noChangeApplied: true });
  expect((await stored()).entries[0]!.markers[marker]).toBe(5);
});
it('removes and explicitly restores one whole panel with monotonic state and no whole-date tombstone', async () => {
  const before = await stored(), first = state.importedData.entries[0]!, id = first.panelId!, address = labPanelTombstoneKey(id, day);
  expect(removeLabPanel(state.importedData, first, 1000)).toBe(true); expect(await saveImportedData()).toBe(true); const removed = await stored();
  expect(removed.entries).toEqual([before.entries[1]]); expect(removed._deleted?.entries || []).not.toContain(day); expect(removed.labPanelTombstones![address]!.deletedAt).toBe(1000);
  expect(mergeImportedData(removed, before).entries).toEqual(removed.entries); expect(mergeImportedData(before, removed).entries).toEqual(removed.entries);
  restoreLabPanel(state.importedData, before.entries[0]!, 100); expect(await saveImportedData()).toBe(true); const restored = await stored();
  expect(restored.entries).toHaveLength(2); expect(restored.labPanelTombstones![address]!.restoredAt).toBeGreaterThan(1000); expect(mergeImportedData(restored, removed).entries).toHaveLength(2);
});
