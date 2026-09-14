// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../js/data.js', () => ({ saveImportedData: vi.fn(async () => true), invalidateActiveDataCache: vi.fn() }));
import { state } from '../js/state.js';
import { repairEditedImportProvenance } from '../js/profile-import-provenance.js';
import { editManualMarkerValue, saveManualMarkerValue, revertManualMarkerValue } from '../js/marker-detail-store.js';
import { buildMarkerHistoryMetadata } from '../js/marker-detail-history.js';

const key = 'biochemistry.glucose';
const date = '2026-01-01';
const mapKey = `${key}:${date}`;
function fixture() {
  return {
    entries: [{ date, markers: { [key]: 5 }, markerSources: {
      [key]: { snapshotId: 'report', file: 'lab.pdf', at: 100 },
    } }],
    importSnapshots: [{ id: 'report', date, fileName: 'lab.pdf', markers: [
      { mappedKey: key, value: 5, unit: 'mmol/l' },
    ] }],
    manualValues: {},
  };
}
beforeEach(() => { state.importedData = fixture(); });

it('retains report ancestry across both edit paths and revert, while stamping each change', async () => {
  await editManualMarkerValue({ dotKey: key, date, storedValue: 6, now: 200 });
  await saveManualMarkerValue({ dotKey: key, date, storedValue: 7, now: 300 });
  const entry = state.importedData.entries[0];
  expect(entry.markerSources[key]).toEqual({ snapshotId: 'report', file: 'lab.pdf', at: 300, manuallyEdited: true });
  expect(state.importedData.manualValues[mapKey]).toBe(5);
  const history = buildMarkerHistoryMetadata(entry, entry.markerSources[key], date).sourceHtml;
  expect(history).toContain('lab.pdf');
  expect(history).toContain('manually edited');
  await revertManualMarkerValue(key, date, { now: 400 });
  expect(entry.markers[key]).toBe(5);
  expect(entry.markerSources[key]).toEqual({ snapshotId: 'report', file: 'lab.pdf', at: 400 });
  expect(state.importedData.manualValues[mapKey]).toBeNull();
});

it('keeps a genuinely manual marker manual even on a date containing imported markers', async () => {
  state.importedData.entries[0].sourceFile = 'lab.pdf';
  const manualKey = 'biochemistry.alt';
  await saveManualMarkerValue({ dotKey: manualKey, date, storedValue: 0, now: 200 });
  await editManualMarkerValue({ dotKey: manualKey, date, storedValue: 0.2, now: 300 });
  expect(state.importedData.manualValues[`${manualKey}:${date}`]).toBe(true);
  expect(state.importedData.entries[0].markerSources[manualKey]).toEqual({ file: null, at: 300 });
});

it('retains a zero original and a report link even without a filename', async () => {
  const entry = state.importedData.entries[0];
  entry.markers[key] = 0;
  entry.markerSources[key].file = null;
  await editManualMarkerValue({ dotKey: key, date, storedValue: 1, now: 200 });
  await editManualMarkerValue({ dotKey: key, date, storedValue: 2, now: 300 });
  expect(state.importedData.manualValues[mapKey]).toBe(0);
  await revertManualMarkerValue(key, date, { now: 400 });
  expect(entry.markers[key]).toBe(0);
  expect(entry.markerSources[key]).toEqual({ file: null, snapshotId: 'report', at: 400 });
  expect(buildMarkerHistoryMetadata(entry, entry.markerSources[key], date).sourceHtml).toContain('Imported report');
});

function lostLink() {
  const data = fixture();
  data.entries[0].markerSources[key] = { file: null, at: 200 };
  data.manualValues[mapKey] = 5;
  data.entries[0].markers[key] = 6;
  return data;
}

it('repairs an unambiguous old edit without changing values, original values, snapshots, or timestamps', () => {
  const data = lostLink();
  const before = structuredClone(data);
  repairEditedImportProvenance(data);
  expect(data.entries[0].markerSources[key]).toEqual({ file: 'lab.pdf', at: 200, snapshotId: 'report', manuallyEdited: true });
  expect(data.entries[0].markers).toEqual(before.entries[0].markers);
  expect(data.manualValues).toEqual(before.manualValues);
  expect(data.importSnapshots).toEqual(before.importSnapshots);
  const repaired = structuredClone(data);
  repairEditedImportProvenance(data);
  expect(data).toEqual(repaired);
});

it('also recovers a correction back to the report value', () => {
  const data = lostLink();
  data.manualValues[mapKey] = 0.05;
  data.entries[0].markers[key] = 5;
  repairEditedImportProvenance(data);
  expect(data.entries[0].markerSources[key].snapshotId).toBe('report');
});

it('compares snapshot values in storage units as well as the saved original units', () => {
  const data = lostLink();
  const row = data.importSnapshots[0].markers[0];
  row.value = 90;
  row.unit = 'mg/dL';
  data.manualValues[mapKey] = 4.995;
  repairEditedImportProvenance(data);
  expect(data.entries[0].markerSources[key].snapshotId).toBe('report');
});

it.each([
  ['new manual value', d => { d.manualValues[mapKey] = true; }],
  ['no edit history', d => { delete d.manualValues[mapKey]; }],
  ['no matching value', d => { d.importSnapshots[0].markers[0].value = 9; }],
  ['different date', d => { d.importSnapshots[0].date = '2025-01-01'; }],
  ['excluded row', d => { d.importSnapshots[0].excludedIndices = [0]; }],
  ['deleted report', d => { d._deleted = { importSnapshots: ['report'] }; }],
  ['duplicate row', d => { d.importSnapshots[0].markers.push({ ...d.importSnapshots[0].markers[0] }); }],
  ['two reports', d => { d.importSnapshots.push({ ...d.importSnapshots[0], id: 'another' }); }],
  ['existing link', d => { d.entries[0].markerSources[key].snapshotId = 'existing'; }],
  ['no source', d => { delete d.entries[0].markerSources[key]; }],
  ['deleted marker', d => { d.entries[0].deletedMarkers = { [key]: 300 }; }],
])('leaves %s unchanged', (_label, mutate) => {
  const data = lostLink();
  mutate(data);
  const before = structuredClone(data);
  repairEditedImportProvenance(data);
  expect(data).toEqual(before);
});
