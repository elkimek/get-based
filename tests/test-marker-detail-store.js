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
  revertManualMarkerValue,
  revertRefRangeOverride,
  saveManualMarkerValue,
  saveMarkerNoteText,
  saveMarkerValueNote,
  saveRefRangeOverride,
} = await import('../js/marker-detail-store.js');

state.currentProfile = 'marker-detail-store-test';
state.importedData = {
  entries: [{
    date: '2026-05-01',
    updatedAt: 100,
    markers: {
      'hormones.insulin': 8,
      'diabetes.insulin_d': 8,
      'biochemistry.glucose': 4.7,
    },
    markerSources: {
      'hormones.insulin': { file: 'lab.pdf', at: 100 },
      'diabetes.insulin_d': { file: 'lab.pdf', at: 100 },
      'biochemistry.glucose': { file: 'lab.pdf', at: 100 },
    },
    sourceFiles: ['lab.pdf'],
  }],
  manualValues: {},
  markerValueNotes: {},
  markerNotes: {},
  refOverrides: {},
};

console.log('%c 1. Manual values ', 'font-weight:bold;color:#f59e0b');
await saveManualMarkerValue({
  dotKey: 'hormones.insulin',
  date: '2026-05-01',
  storedValue: 9,
  noteText: 'fasted',
  now: 1_000,
});
const entry = state.importedData.entries[0];
assert('saveManualMarkerValue writes value and insulin mirror',
  entry.markers['hormones.insulin'] === 9
    && entry.markers['diabetes.insulin_d'] === 9
    && entry.markerSources['hormones.insulin'].file === null
    && entry.markerSources['diabetes.insulin_d'].file === null);
assert('saveManualMarkerValue records manual originals for both insulin keys',
  state.importedData.manualValues['hormones.insulin:2026-05-01'] === 8
    && state.importedData.manualValues['diabetes.insulin_d:2026-05-01'] === 8
    && getManualOriginalForMarker('diabetes.insulin_d', '2026-05-01') === 8);
assert('saveManualMarkerValue writes mirrored value notes',
  state.importedData.markerValueNotes['hormones.insulin:2026-05-01'] === 'fasted'
    && state.importedData.markerValueNotes['diabetes.insulin_d:2026-05-01'] === 'fasted');

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

await deleteManualMarkerValue('hormones.insulin', '2026-05-01', { now: 1_300 });
assert('deleteManualMarkerValue removes mirrored insulin values and records marker tombstones',
  !Object.prototype.hasOwnProperty.call(entry.markers, 'hormones.insulin')
    && !Object.prototype.hasOwnProperty.call(entry.markers, 'diabetes.insulin_d')
    && entry.deletedMarkers['hormones.insulin'] === 1_300
    && entry.deletedMarkers['diabetes.insulin_d'] === 1_300);
assert('deleteManualMarkerValue clears mirrored manual originals',
  state.importedData.manualValues['hormones.insulin:2026-05-01'] === null
    && state.importedData.manualValues['diabetes.insulin_d:2026-05-01'] === null);

console.log('%c 2. Notes and ranges ', 'font-weight:bold;color:#f59e0b');
await saveMarkerValueNote('diabetes.insulin_d', '2026-05-01', 'x'.repeat(520));
assert('saveMarkerValueNote caps and mirrors insulin notes',
  state.importedData.markerValueNotes['diabetes.insulin_d:2026-05-01'].length === 500
    && state.importedData.markerValueNotes['hormones.insulin:2026-05-01'].length === 500);
await deleteMarkerValueNote('hormones.insulin', '2026-05-01');
assert('deleteMarkerValueNote nulls both insulin note keys',
  state.importedData.markerValueNotes['hormones.insulin:2026-05-01'] === null
    && state.importedData.markerValueNotes['diabetes.insulin_d:2026-05-01'] === null);

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

await saveMarkerNoteText('biochemistry.alt', '  liver context  ');
assert('saveMarkerNoteText stores trimmed marker note',
  state.importedData.markerNotes['biochemistry.alt'] === 'liver context');
await deleteMarkerNoteText('biochemistry.alt');
assert('deleteMarkerNoteText deletes marker note key so map tombstone planner can run',
  !Object.prototype.hasOwnProperty.call(state.importedData.markerNotes, 'biochemistry.alt'));

console.log('%c 3. Boundary guard ', 'font-weight:bold;color:#f59e0b');
const editingSrc = read('js/marker-detail-editing.js');
const storeSrc = read('js/marker-detail-store.js');
assert('marker-detail-editing imports the store boundary',
  editingSrc.includes("from './marker-detail-store.js'"));
assert('marker-detail-editing no longer persists marker detail mutations directly',
  !/saveImportedData\(/.test(editingSrc)
    && !/setLabEntryMarker\(/.test(editingSrc)
    && !/deleteLabEntryMarkerFromImportedData\(/.test(editingSrc));
assert('synced marker maps are written only by marker-detail-store.js',
  !/state\.importedData\.(?:manualValues|markerValueNotes|refOverrides|markerNotes)\s*(?:\[|=|\.)/.test(editingSrc)
    && /manualValues[\s\S]{0,2000}markerValueNotes[\s\S]{0,3000}refOverrides[\s\S]{0,3000}markerNotes/.test(storeSrc));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
