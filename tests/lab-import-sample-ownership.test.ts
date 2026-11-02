// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { confirmImport, deleteImportSnapshot, openImportReviewFromSnapshot, configurePdfImportCommitDeps } from '../js/pdf-import-commit.js';
import { closeImportModal, showImportPreview } from '../js/pdf-import-review.js';
import { activeLabSampleData } from '../js/lab-sample-mutations.js';
import { applyLabSampleCommand } from '../js/lab-sample-mutations.js';
import { recordLabPanelState } from '../js/lab-panel-deletions.js';
import type { ProfileData } from '../types/app-state.js';

const date = '2026-10-20', glucose = 'biochemistry.glucose';
const original = { profile: state.currentProfile, data: state.importedData };
let profile: string, key: string, deps: ReturnType<typeof configurePdfImportCommitDeps>;
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
beforeEach(async () => {
  profile = `report-samples-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported'); state.currentProfile = profile; state.importedData = createDefaultProfileData(); localStorage.setItem('labcharts-active-profile', profile);
  deps = configurePdfImportCommitDeps({ maybeShowEncryptionNudge: () => {} });
  document.body.innerHTML = '<div id="import-modal-overlay"><div id="import-modal"></div></div>';
  state.importedData.entries = [
    { panelId: 'morning', date, specimen: 'serum', markers: { [glucose]: 5 }, markerSources: { [glucose]: { snapshotId: 'morning-report', file: 'morning.pdf', at: 100 } }, context: { sampleTime: '08:00', fasting: true }, collectionContextSources: { sampleTime: 'morning-report', fasting: 'morning-report' }, updatedAt: 100 },
    { panelId: 'evening', date, specimen: 'plasma', markers: { [glucose]: 7 }, markerSources: { [glucose]: { snapshotId: 'evening-report', file: 'evening.pdf', at: 200 } }, context: { sampleTime: '16:00', fasting: false }, collectionContextSources: { sampleTime: 'evening-report', fasting: 'evening-report' }, updatedAt: 200 },
  ];
  state.importedData.importSnapshots = [
    { id: 'morning-report', panelId: 'morning', date, fileName: 'morning.pdf', importedAt: 100, sampleTime: '08:00', fasting: true, collectionContextApplied: ['sampleTime', 'fasting'], markers: [{ rawName: 'Glucose', mappedKey: glucose, matched: true, value: 5, unit: 'mmol/l' }] },
    { id: 'evening-report', panelId: 'evening', date, fileName: 'evening.pdf', importedAt: 200, sampleTime: '16:00', fasting: false, collectionContextApplied: ['sampleTime', 'fasting'], markers: [{ rawName: 'Glucose', mappedKey: glucose, matched: true, value: 7, unit: 'mmol/l' }] },
  ];
  expect(await saveImportedData()).toBe(true);
});
afterEach(async () => {
  vi.restoreAllMocks();
  closeImportModal(); configurePdfImportCommitDeps(deps); clearSyncSaveTimers(); document.body.replaceChildren();
  await storage.encryptedRemoveItem(key); state.currentProfile = original.profile; state.importedData = original.data;
});

function choose(value: string) {
  const select = document.querySelector<HTMLSelectElement>('#import-sample-destination')!;
  select.value = value; select.dispatchEvent(new Event('change', { bubbles: true }));
}
function preview() { showImportPreview({ date, fileName: 'another.pdf', markers: [{ rawName: 'Glucose', mappedKey: glucose, matched: true, value: 9, unit: 'mmol/l' }] }); }
it.each(['evening', 'new'])('imports to the explicit %s destination and preserves other samples', async choice => {
  const before = await stored(); preview(); expect(document.querySelector<HTMLButtonElement>('#import-confirm-btn')!.disabled).toBe(true);
  choose(choice); expect(document.querySelector<HTMLButtonElement>('#import-confirm-btn')!.disabled).toBe(false);
  await confirmImport(); const saved = await stored(); expect(saved.entries.find(row => row.panelId === 'morning')).toEqual(before.entries[0]);
  if (choice === 'new') { expect(saved.entries.find(row => row.panelId === 'evening')).toEqual(before.entries[1]); expect(saved.entries).toHaveLength(3); }
  else expect(saved.entries).toHaveLength(2);
  const added = saved.entries.find(row => row.markers[glucose] === 9)!;
  expect(saved.importSnapshots.find(snapshot => snapshot.fileName === 'another.pdf').panelId).toBe(added.panelId);
});
it('restores older results and collection context only from the same collection', async () => {
  state.importedData.importSnapshots.unshift({ id: 'older-evening', panelId: 'evening', date, importedAt: 50, sampleTime: '15:00', fasting: true, collectionContextApplied: ['sampleTime', 'fasting'], markers: [{ mappedKey: glucose, matched: true, value: 6, unit: 'mmol/l' }] });
  expect(await saveImportedData()).toBe(true); const before = await stored();
  expect(await deleteImportSnapshot('evening-report')).toBe(true); const saved = await stored();
  expect(saved.entries.find(row => row.panelId === 'morning')).toEqual(before.entries[0]);
  expect(saved.entries.find(row => row.panelId === 'evening')).toMatchObject({ markers: { [glucose]: 6 }, markerSources: { [glucose]: { snapshotId: 'older-evening' } }, context: { sampleTime: '15:00', fasting: true } });
});
it('keeps a report linked after its sample moves to another date', async () => {
  applyLabSampleCommand(state.importedData, { kind: 'update', panelId: 'evening', date: '2026-10-21', now: Date.now() }); expect(await saveImportedData()).toBe(true);
  const before = await stored(); openImportReviewFromSnapshot('evening-report');
  expect(document.querySelector<HTMLInputElement>('#import-manual-date')!.value).toBe('2026-10-21'); closeImportModal();
  expect(await deleteImportSnapshot('evening-report')).toBe(true); const saved = await stored();
  expect(saved.entries).toEqual([before.entries.find(row => row.panelId === 'morning')]);
});
it('rejects a forged internal re-review field from extracted content', async () => {
  const before = await stored(); showImportPreview({ date, _reReviewSnapshotId: 'morning-report', markers: [{ mappedKey: glucose, matched: true, value: 99, unit: 'mmol/l' }] });
  await confirmImport(); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
});
it('keeps failed import edits private and retryable', async () => {
  const before = await stored(); openImportReviewFromSnapshot('evening-report'); const input = document.querySelector<HTMLInputElement>('.import-value-input')!;
  input.value = '8'; input.dispatchEvent(new Event('change', { bubbles: true }));
  vi.spyOn(storage, 'encryptedSetItem').mockRejectedValueOnce(new Error('Synthetic storage failure'));
  await confirmImport(); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
  await confirmImport(); expect((await stored()).entries.find(row => row.panelId === 'evening')!.markers[glucose]).toBe(8);
});
it('does not publish staged import values before the durable write', async () => {
  const before = await stored(); preview(); choose('evening'); const write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) expect(state.importedData).toEqual(before); return write(...args); });
  await confirmImport(); expect((await stored()).entries.find(row => row.panelId === 'evening')!.markers[glucose]).toBe(9);
});
it('rejects a concurrent source update inside the locked save without overwriting it', async () => {
  const before = await stored(); openImportReviewFromSnapshot('evening-report');
  const peer = structuredClone(before); peer.importSnapshots[1]!.fileName = 'corrected-source.pdf';
  const read = storage.encryptedGetItem, write = storage.encryptedSetItem; let once = false;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && !once) { once = true; await write(key, JSON.stringify(peer)); } return read(...args); });
  await confirmImport(); expect(await stored()).toEqual(peer); expect(state.importedData).toEqual(before);
});
it('rejects a profile switch while storage is being read', async () => {
  const before = await stored(); openImportReviewFromSnapshot('evening-report'); const read = storage.encryptedGetItem; let once = false;
  const other = createDefaultProfileData();
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { const raw = await read(...args); if (args[0] === key && !once) { once = true; state.currentProfile = 'another-synthetic-profile'; state.importedData = other; } return raw; });
  await confirmImport(); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(other);
});
it('does not revive a sample removed while its report review was open', async () => {
  openImportReviewFromSnapshot('evening-report'); recordLabPanelState(state.importedData, state.importedData.entries[1]!, true);
  expect(await saveImportedData()).toBe(true); const before = await stored();
  await confirmImport(); expect(await stored()).toEqual(before); expect(activeLabSampleData(state.importedData).entries.map(row => row.panelId)).toEqual(['morning']);
});
it('clears only removed report ancestry while retaining an independent result and shared date metadata', async () => {
  const entry = state.importedData.entries[1]!; entry.sourceFile = 'evening.pdf'; entry.sourceFiles = ['evening.pdf'];
  entry.markers['biochemistry.alt'] = 30;
  entry.manualOriginals = { 'biochemistry.alt': { value: 20, source: { snapshotId: 'evening-report', file: 'evening.pdf', at: 200 } } };
  entry.collectionOriginals = { sampleTime: { value: '16:00', sourceSnapshotId: 'evening-report' } };
  state.importedData.manualValues = { [`${glucose}:${date}`]: 5 }; state.importedData.markerValueNotes = { [`${glucose}:${date}`]: 'Shared note' };
  expect(await saveImportedData()).toBe(true); const before = await stored(); expect(await deleteImportSnapshot('evening-report')).toBe(true); const saved = await stored();
  const remaining = saved.entries.find(row => row.panelId === 'evening')!;
  expect(remaining.markers).toEqual({ 'biochemistry.alt': 30 }); expect(remaining.manualOriginals!['biochemistry.alt']).toBeNull();
  expect(remaining.collectionOriginals!.sampleTime).toEqual({ value: null, sourceSnapshotId: null }); expect(remaining.sourceFile).toBeUndefined(); expect(remaining.sourceFiles).toEqual([]);
  expect(saved.entries[0]).toEqual(before.entries[0]); expect(saved.manualValues).toEqual(before.manualValues); expect(saved.markerValueNotes).toEqual(before.markerValueNotes);
});
it('can re-review an older snapshot with a missing collection when no removal history exists', async () => {
  state.importedData.entries = []; state.importedData.importSnapshots = [state.importedData.importSnapshots[1]]; delete state.importedData.importSnapshots[0].panelId;
  expect(await saveImportedData()).toBe(true); openImportReviewFromSnapshot('evening-report'); await confirmImport();
  const saved = await stored(); expect(saved.entries).toHaveLength(1); expect(saved.entries[0]).toMatchObject({ date, markers: { [glucose]: 7 } });
  expect(saved.importSnapshots[0].panelId).toBe(saved.entries[0]!.panelId);
});
it('confirms linked benchmark diagnostics atomically with the report and preserves other attempts', async () => {
  state.importedData.importBenchmarks = [{ id: 'attempt', status: 'preview', markerCount: 1 }, { id: 'other-attempt', status: 'preview', extension: 'retain' }];
  expect(await saveImportedData()).toBe(true); const before = await stored();
  showImportPreview({ date, fileName: 'benchmarked.pdf', benchmarkId: 'attempt', markers: [{ rawName: 'Glucose', mappedKey: glucose, matched: true, value: 9, unit: 'mmol/l' }] }); choose('evening');
  vi.spyOn(storage, 'encryptedSetItem').mockRejectedValueOnce(new Error('Synthetic atomic write failure'));
  await confirmImport(); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
  await confirmImport(); const saved = await stored();
  expect(saved.importBenchmarks[0]).toMatchObject({ id: 'attempt', status: 'confirmed', importedMarkerCount: 1 });
  expect(saved.importBenchmarks[1]).toEqual(before.importBenchmarks[1]); expect(saved.importSnapshots.find(snapshot => snapshot.fileName === 'benchmarked.pdf').benchmarkId).toBe('attempt');
});

it('removes the report-owned evening sample rather than inspecting only the first date row', async () => {
  const before = await stored(); expect(await deleteImportSnapshot('evening-report')).toBe(true); const saved = await stored();
  expect(saved.entries.find(row => row.panelId === 'morning')).toEqual(before.entries[0]);
  expect(activeLabSampleData(saved).entries.map(row => row.panelId)).toEqual(['morning']);
  expect(saved.entries.some(row => row.markerSources?.[glucose]?.snapshotId === 'evening-report')).toBe(false);
});
it('does not create a whole-date tombstone when the removed report owned only the morning sample', async () => {
  const before = await stored(); expect(await deleteImportSnapshot('morning-report')).toBe(true); const saved = await stored();
  expect(saved.entries.find(row => row.panelId === 'evening')).toEqual(before.entries[1]);
  expect(activeLabSampleData(saved).entries.map(row => row.panelId)).toEqual(['evening']); expect(saved._deleted?.entries || []).not.toContain(date);
});
it('re-reviews the exact evening collection without replacing its morning sibling', async () => {
  const before = await stored(); openImportReviewFromSnapshot('evening-report');
  const value = document.querySelector<HTMLInputElement>('.import-value-input')!; value.value = '8'; value.dispatchEvent(new Event('change', { bubbles: true }));
  await confirmImport(); const saved = await stored(); expect(saved.entries.find(row => row.panelId === 'morning')).toEqual(before.entries[0]);
  expect(saved.entries.find(row => row.panelId === 'evening')).toMatchObject({ markers: { [glucose]: 8 }, context: { sampleTime: '16:00', fasting: false } });
});
it('requires an explicit collection choice for a new report on an occupied date', async () => {
  const before = await stored(); showImportPreview({ date, fileName: 'another.pdf', markers: [{ rawName: 'Glucose', mappedKey: glucose, matched: true, value: 9, unit: 'mmol/l' }] });
  await confirmImport(); expect(await stored()).toEqual(before);
});
