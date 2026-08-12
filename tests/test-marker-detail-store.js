#!/usr/bin/env node
// test-marker-detail-store.js - marker detail mutation boundary coverage.

import './_node-shim.js';

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Marker Detail Store Tests ===\n');

const { state } = await import('../js/state.js');
const {
  deleteManualMarkerValue,
  deleteMarkerNoteText,
  deleteMarkerValueNote,
  editManualMarkerValue,
  getManualOriginalForMarker,
  hasMarkerValueForDate,
  revertManualMarkerValue,
  revertRefRangeOverride,
  saveManualMarkerValue,
  saveMarkerNoteText,
  saveMarkerValueNote,
  saveRefRangeOverride,
} = await import('../js/marker-detail-store.js');

state.currentProfile = 'marker-detail-store-test';
state.importedData = { entries: [] };

console.log('%c 1. Defensive guards ', 'font-weight:bold;color:#f59e0b');
const missingKeySave = await saveManualMarkerValue({
  date: '2026-05-02',
  storedValue: 1,
  now: 900,
});
assert('saveManualMarkerValue rejects missing dotKey before creating an entry',
  missingKeySave === null && state.importedData.entries.length === 0);
const missingDateSave = await saveManualMarkerValue({
  dotKey: 'biochemistry.glucose',
  storedValue: 1,
  now: 901,
});
assert('saveManualMarkerValue rejects missing date before creating an entry',
  missingDateSave === null && state.importedData.entries.length === 0);

state.importedData = {
  entries: [{
    date: '2026-05-01',
    updatedAt: 100,
    markers: {
      'diabetes.insulin': 8,
      'biochemistry.glucose': 4.7,
    },
    markerSources: {
      'diabetes.insulin': { file: 'lab.pdf', at: 100 },
      'biochemistry.glucose': { file: 'lab.pdf', at: 100 },
    },
    sourceFiles: ['lab.pdf'],
  }],
  manualValues: {},
  markerValueNotes: {},
  markerNotes: {},
  refOverrides: {},
};

console.log('%c 2. Manual values ', 'font-weight:bold;color:#f59e0b');
await saveManualMarkerValue({
  dotKey: 'diabetes.insulin',
  date: '2026-05-01',
  storedValue: 9,
  noteText: 'fasted',
  now: 1_000,
});
const entry = state.importedData.entries[0];
assert('saveManualMarkerValue writes the canonical insulin value',
  entry.markers['diabetes.insulin'] === 9
    && entry.markerSources['diabetes.insulin'].file === null);
assert('saveManualMarkerValue records the insulin manual original once',
  state.importedData.manualValues['diabetes.insulin:2026-05-01'] === 8
    && getManualOriginalForMarker('diabetes.insulin', '2026-05-01') === 8);
assert('saveManualMarkerValue writes one canonical value note',
  state.importedData.markerValueNotes['diabetes.insulin:2026-05-01'] === 'fasted');
assert('hasMarkerValueForDate detects canonical insulin values',
  hasMarkerValueForDate('diabetes.insulin', '2026-05-01')
    && !hasMarkerValueForDate('hormones.cortisol', '2026-05-01'));

await editManualMarkerValue({
  dotKey: 'biochemistry.glucose',
  date: '2026-05-01',
  storedValue: 5.2,
  now: 1_100,
});
assert('editManualMarkerValue records original imported value and stamps row',
  entry.markers['biochemistry.glucose'] === 5.2
    && entry.updatedAt === 1_100
    && state.importedData.manualValues['biochemistry.glucose:2026-05-01'] === 4.7);

await revertManualMarkerValue('biochemistry.glucose', '2026-05-01', { now: 1_200 });
assert('revertManualMarkerValue restores original and clears manual map via null tombstone',
  entry.markers['biochemistry.glucose'] === 4.7
    && entry.updatedAt === 1_200
    && state.importedData.manualValues['biochemistry.glucose:2026-05-01'] === null
    && !Object.prototype.hasOwnProperty.call(entry.markerSources || {}, 'biochemistry.glucose'));

await deleteManualMarkerValue('diabetes.insulin', '2026-05-01', { now: 1_300 });
assert('deleteManualMarkerValue removes canonical insulin and records its tombstone',
  !Object.prototype.hasOwnProperty.call(entry.markers, 'hormones.insulin')
    && !Object.prototype.hasOwnProperty.call(entry.markers, 'diabetes.insulin_d')
    && !Object.prototype.hasOwnProperty.call(entry.markers, 'diabetes.insulin')
    && entry.deletedMarkers['diabetes.insulin'] === 1_300);
assert('deleteManualMarkerValue clears the canonical manual original',
  state.importedData.manualValues['diabetes.insulin:2026-05-01'] === null);

console.log('%c 3. Notes and ranges ', 'font-weight:bold;color:#f59e0b');
await saveMarkerValueNote('diabetes.insulin', '2026-05-01', 'x'.repeat(520));
assert('saveMarkerValueNote caps canonical insulin notes',
  state.importedData.markerValueNotes['diabetes.insulin:2026-05-01'].length === 500);
await deleteMarkerValueNote('diabetes.insulin', '2026-05-01');
assert('deleteMarkerValueNote nulls the canonical insulin note key',
  state.importedData.markerValueNotes['diabetes.insulin:2026-05-01'] === null);

state.importedData.refOverrides['biochemistry.alt'] = {
  refMin: 7,
  refMax: 40,
  refSource: 'import',
};
await saveRefRangeOverride('biochemistry.alt', 'ref', { min: 8, max: 32 });
assert('saveRefRangeOverride stashes lab range before manual override',
  state.importedData.refOverrides['biochemistry.alt'].labRefMin === 7
    && state.importedData.refOverrides['biochemistry.alt'].labRefMax === 40
    && state.importedData.refOverrides['biochemistry.alt'].refMin === 8
    && state.importedData.refOverrides['biochemistry.alt'].refSource === 'manual');
const revertRange = await revertRefRangeOverride('biochemistry.alt', 'ref');
assert('revertRefRangeOverride restores stashed lab range',
  revertRange.message === 'Range reverted to lab range'
    && state.importedData.refOverrides['biochemistry.alt'].refMin === 7
    && state.importedData.refOverrides['biochemistry.alt'].refSource === 'import'
    && !Object.prototype.hasOwnProperty.call(state.importedData.refOverrides['biochemistry.alt'], 'labRefMin'));
const badRange = await saveRefRangeOverride('biochemistry.alt', 'bad-type', { min: 1, max: 2 });
assert('saveRefRangeOverride rejects unknown range type',
  badRange === null && state.importedData.refOverrides['biochemistry.alt'].refMin === 7);

await saveMarkerNoteText('biochemistry.alt', '  liver context  ');
assert('saveMarkerNoteText stores trimmed marker note',
  state.importedData.markerNotes['biochemistry.alt'] === 'liver context');
await deleteMarkerNoteText('biochemistry.alt');
assert('deleteMarkerNoteText deletes marker note key so map tombstone planner can run',
  !Object.prototype.hasOwnProperty.call(state.importedData.markerNotes, 'biochemistry.alt'));

console.log('%c 4. Boundary guard ', 'font-weight:bold;color:#f59e0b');
const editingSrc = read('js/marker-detail-editing.js');
const storeSrc = read('js/marker-detail-store.js');
const deleteMarkerValueBlock = editingSrc.match(/export async function deleteMarkerValue[\s\S]*?export function editMarkerValue/)?.[0] || '';
const saveRefRangeBlock = editingSrc.match(/export async function saveRefRange[\s\S]*?export async function revertRefRange/)?.[0] || '';
assert('marker-detail-editing imports the store boundary',
  editingSrc.includes("from './marker-detail-store.js'"));
assert('marker-detail-editing no longer persists marker detail mutations directly',
  !/saveImportedData\(/.test(editingSrc)
    && !/setLabEntryMarker\(/.test(editingSrc)
    && !/deleteLabEntryMarkerFromImportedData\(/.test(editingSrc));
assert('deleteMarkerValue checks store value presence before confirm dialog',
  /if \(!hasMarkerValueForDate\(dotKey, date\)\) return;[\s\S]*showConfirmDialog/.test(deleteMarkerValueBlock));
assert('saveRefRange skips UI success path when store rejects the range type',
  /const saved = await saveRefRangeOverride\(dotKey, type, \{ min: newMin, max: newMax \}\);[\s\S]*if \(!saved\) return;[\s\S]*showNotification\('Range updated'/.test(saveRefRangeBlock));
assert('synced marker maps are written only by marker-detail-store.js',
  !/state\.importedData\.(?:manualValues|markerValueNotes|refOverrides|markerNotes)\s*(?:\[|=|\.)/.test(editingSrc)
    && /manualValues[\s\S]{0,2000}markerValueNotes[\s\S]{0,3000}refOverrides[\s\S]{0,3000}markerNotes/.test(storeSrc));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
