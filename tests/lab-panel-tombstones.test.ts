import { beforeEach, afterEach, expect, it } from 'vitest';
import { identifyLabPanels, labPanelId } from '../js/lab-panel-identity.js';
import { filterRemovedLabPanels, labPanelTombstoneKey, mergeLabPanelTombstones, recordLabPanelState } from '../js/lab-panel-deletions.js';
import { removeLabPanel, restoreLabPanel } from '../js/lab-panel-mutations.js';
import { mergeImportedData, preserveFreshLocalLabEntries, localHasRowsRemoteLacks } from '../js/data-merge.js';
import { mergeProfileMutation } from '../js/profile-data-writes.js';
import { mergeArrayRowsIntoImported } from '../js/sync-delta-array-merge.js';
import { mergeMapRowsIntoImported } from '../js/sync-delta-map-merge.js';
import { _planArrayDelta, _planKeyedMapDelta, configureSyncDelta } from '../js/sync-delta.js';
import { ITEM_ROW_QUERY, makeEvolu, PROFILE_ID, writeSnapshot } from './helpers/sync-runtime-fixture.js';
import type { LabEntryDraft } from '../js/lab-entry.js';
import type { LabPanelTombstones } from '../js/lab-panel-deletions.js';
import type { DeltaItemRow } from '../js/sync-delta-row-codec.js';
const day = '2026-10-20';
const legacy = () => [{ date: day, markers: { a: 1 }, sourceFile: 'first.pdf' }, { date: day, markers: { a: 2 }, sourceFile: 'second.pdf' }];
const panels = () => identifyLabPanels(legacy());
const fixture = () => ({ entries: panels(), labPanelTombstones: {} as LabPanelTombstones });
beforeEach(() => { localStorage.clear(); const fake = makeEvolu(); configureSyncDelta({ getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY }); });
afterEach(() => configureSyncDelta({ getEvolu: () => null, getItemRowQuery: () => null }));
it('removes a named panel without creating the date-wide tombstone', () => {
  const data = fixture(), before = structuredClone(data), id = labPanelId(data.entries[0]!);
  expect(removeLabPanel(data, data.entries[0]!, 1000)).toBe(true); expect(data.entries).toEqual([before.entries[1]]); expect(data).not.toHaveProperty('_deleted');
  expect(data.labPanelTombstones[labPanelTombstoneKey(id, day)]).toEqual({ deletedAt: 1000, restoredAt: 0, updatedAt: 1000 });
  expect(mergeImportedData(data, before).entries).toEqual(data.entries); expect(mergeImportedData(before, data).entries).toEqual(data.entries);
});
it('matches unchanged unversioned legacy panels to their removal history', () => {
  const data = fixture(); removeLabPanel(data, data.entries[0]!, 1000);
  expect(mergeImportedData(data, { entries: legacy(), labPanelTombstones: {} }).entries).toEqual(data.entries);
});
it('clears date-wide metadata only when its last matching result leaves the date', () => {
  const data = { ...fixture(), markerValueNotes: { [`a:${day}`]: 'Shared note' as string | null }, manualValues: { [`a:${day}`]: 1 as number | null } };
  removeLabPanel(data, data.entries[0]!, 1000); expect(data.markerValueNotes[`a:${day}`]).toBe('Shared note');
  removeLabPanel(data, data.entries[0]!, 1100); expect(data.markerValueNotes[`a:${day}`]).toBeNull(); expect(data.manualValues[`a:${day}`]).toBeNull();
});
it('does not restore a second copy of a panel already present under a corrected date', () => {
  const data = fixture(), original = structuredClone(data.entries[0]!); data.entries[0]!.date = '2026-10-21';
  expect(() => restoreLabPanel(data, original)).toThrow('already present'); expect(data.entries).toHaveLength(2);
});
it('explicit restores and repeated removals beat their observed predecessor after clock rollback', () => {
  const data = fixture(), original = structuredClone(data.entries[0]!); removeLabPanel(data, data.entries[0]!, 1000); const deleted = structuredClone(data);
  restoreLabPanel(data, original, 100); const restored = structuredClone(data), key = labPanelTombstoneKey(labPanelId(original), day);
  expect(data.labPanelTombstones[key]!.restoredAt).toBe(1001); expect(mergeImportedData(data, deleted).entries).toHaveLength(2);
  removeLabPanel(data, data.entries.find(row => row.panelId === original.panelId)!, 0); expect(data.labPanelTombstones[key]!.deletedAt).toBe(1002);
  expect(mergeImportedData(data, restored).entries).toHaveLength(1); expect(mergeImportedData(restored, data).entries).toHaveLength(1);
});
it('combines independent remove and restore clocks rather than choosing a whole history record', () => {
  const id = labPanelId(panels()[0]!), key = labPanelTombstoneKey(id, day), a = { [key]: { deletedAt: 200, restoredAt: 100, updatedAt: 200 } }, b = { [key]: { deletedAt: 150, restoredAt: 300, updatedAt: 300 } };
  expect(mergeLabPanelTombstones(a, b)[key]).toEqual({ deletedAt: 200, restoredAt: 300, updatedAt: 300 });
  expect(mergeLabPanelTombstones(a, b)).toEqual(mergeLabPanelTombstones(b, a));
  expect(mergeProfileMutation({}, a, b, 'labPanelTombstones')).toEqual(mergeLabPanelTombstones(a, b));
});
it.each(['map-first', 'array-first'] as const)('a cold replica receives removal state and stale panels in either order: %s', async order => {
  const old = fixture(), removed = structuredClone(old); removeLabPanel(removed, removed.entries[0]!, 1000);
  const arrays = await _planArrayDelta(PROFILE_ID, 'entries', old.entries), maps = await _planKeyedMapDelta(PROFILE_ID, 'labPanelTombstones', removed.labPanelTombstones);
  const replica: { entries: LabEntryDraft[]; labPanelTombstones: LabPanelTombstones } = { entries: [], labPanelTombstones: {} };
  const arrayRows = arrays.ops.map(op => ({ ...op.args, itemId: day } as DeltaItemRow)), mapRows = maps.ops.map(op => ({ ...op.args, itemId: String(op.args.itemId) } as DeltaItemRow));
  const receiveArray = () => mergeArrayRowsIntoImported(replica, 'entries', arrayRows), receiveMap = () => mergeMapRowsIntoImported(replica, 'labPanelTombstones', mapRows);
  if (order === 'map-first') { await receiveMap(); await receiveArray(); } else { await receiveArray(); await receiveMap(); }
  expect(replica.entries).toEqual(removed.entries); expect(replica.labPanelTombstones).toEqual(removed.labPanelTombstones);
});
it('keeps a panel removed after a newer relay timestamp carries an older restore state', async () => {
  const data = fixture(), first = structuredClone(data.entries[0]!); removeLabPanel(data, data.entries[0]!, 1000); const key = labPanelTombstoneKey(labPanelId(first), day);
  await mergeMapRowsIntoImported(data, 'labPanelTombstones', [{ itemId: key, syncedAt: '2099-01-01T00:00:00Z', payload: JSON.stringify({ k: key, v: { deletedAt: 500, restoredAt: 600, updatedAt: 600 } }) }]);
  expect(data.labPanelTombstones[key]!.deletedAt).toBe(1000); expect(filterRemovedLabPanels([first], data.labPanelTombstones)).toEqual([]);
});
it('does not infer a restoration from an omitted map key or a relay row tombstone', async () => {
  const data = fixture(); removeLabPanel(data, data.entries[0]!, 1000); const key = Object.keys(data.labPanelTombstones)[0]!;
  const fake = makeEvolu({ itemRows: [{ id: 'removal-history', profileId: PROFILE_ID, arrayName: 'labPanelTombstones', itemId: key }] });
  configureSyncDelta({ getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY }); writeSnapshot(PROFILE_ID, 'labPanelTombstones', { [key]: 'old' });
  const plan = await _planKeyedMapDelta(PROFILE_ID, 'labPanelTombstones', {}); expect(plan.ops).toEqual([]); expect(plan.next).toHaveProperty(key);
  await mergeMapRowsIntoImported(data, 'labPanelTombstones', [{ itemId: key, payload: '', isDeleted: 1 }]); expect(data.labPanelTombstones[key]!.deletedAt).toBe(1000);
});
it('does not let fresh local rows resurrect a specifically removed panel', () => {
  const now = Date.now(), data = fixture(), before = structuredClone(data); before.entries.forEach(row => { row.updatedAt = now; });
  removeLabPanel(data, data.entries[0]!, now); preserveFreshLocalLabEntries(data, before, now); expect(data.entries).toHaveLength(1); expect(data.entries[0]!.sourceFile).toBe('second.pdf');
  expect(localHasRowsRemoteLacks(data, before)).toBe(true); expect(localHasRowsRemoteLacks(data, structuredClone(data))).toBe(false);
});
it.each(['__proto__.2026-10-20', 'constructor.2026-10-20', 'valid.2026-02-30', 'valid.bad-date'])('rejects an unsafe or invalid removal address %s', key => {
  expect(() => mergeLabPanelTombstones({ [key]: { deletedAt: 1, restoredAt: 0, updatedAt: 1 } }, null)).toThrow(); expect(Object.prototype).not.toHaveProperty('deletedAt');
});
it.each([NaN, Infinity, -1])('rejects an invalid removal clock %s before mutating state', now => {
  const data = fixture(), before = structuredClone(data); expect(() => recordLabPanelState(data, data.entries[0]!, true, now)).toThrow(); expect(data).toEqual(before);
});
