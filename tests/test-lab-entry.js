#!/usr/bin/env node
// test-lab-entry.js - shared lab entry mutation helper coverage.

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Lab Entry Mutation Tests ===\n');

const {
  createLabEntry,
  deleteLabEntryMarker,
  normalizeLabSampleTime,
  setLabEntryCollectionContext,
  setLabEntryMarker,
  syncLabEntryInsulinMirror,
} = await import('../js/lab-entry.js');
const {
  deleteLabEntryMarkerFromImportedData,
  deleteLabEntryMarkerValues,
  findOrCreateLabEntry,
} = await import('../js/lab-entry-mutations.js');

console.log('%c 1. Set marker ', 'font-weight:bold;color:#f59e0b');
const entry = createLabEntry('2026-05-01', { now: 100 });
entry.deletedMarkers = { 'biochemistry.glucose': 90 };
setLabEntryMarker(entry, 'biochemistry.glucose', 5.1, {
  now: 200,
  source: { file: null, at: 200 },
});
assert('setLabEntryMarker writes marker value and source',
  entry.markers['biochemistry.glucose'] === 5.1
    && entry.markerSources['biochemistry.glucose'].file === null);
assert('setLabEntryMarker stamps updatedAt and clears marker tombstone',
  entry.updatedAt === 200
    && !Object.prototype.hasOwnProperty.call(entry.deletedMarkers || {}, 'biochemistry.glucose'));

console.log('%c 2. Canonical insulin ', 'font-weight:bold;color:#f59e0b');
setLabEntryMarker(entry, 'diabetes.insulin_d', 8, {
  now: 300,
  source: { file: null, at: 300 },
});
entry.markers['biochemistry.glucose'] = 5;
syncLabEntryInsulinMirror(entry, { now: 300 });
assert('legacy insulin writes coalesce to the canonical diabetes key',
  entry.markers['diabetes.insulin'] === 8
    && !Object.prototype.hasOwnProperty.call(entry.markers, 'diabetes.insulin_d')
    && !Object.prototype.hasOwnProperty.call(entry.markers, 'hormones.insulin')
    && entry.markerSources['diabetes.insulin'].at === 300);
assert('canonical insulin recalculates HOMA-IR',
  entry.markers['diabetes.homaIR'] === Math.round((5 * 8) / 22.5 * 100) / 100);
setLabEntryMarker(entry, 'biochemistry.glucose', 6, { now: 325 });
assert('glucose edits recalculate HOMA-IR when insulin is present',
  entry.markers['diabetes.homaIR'] === Math.round((6 * 8) / 22.5 * 100) / 100);
deleteLabEntryMarker(entry, 'diabetes.insulin', { now: 350 });
assert('insulin delete clears stale HOMA-IR',
  !Object.prototype.hasOwnProperty.call(entry.markers, 'diabetes.homaIR'));

console.log('%c 3. Delete marker ', 'font-weight:bold;color:#f59e0b');
const imported = {
  entries: [{
    date: '2026-06-01',
    updatedAt: 100,
    markers: {
      'biochemistry.glucose': 4.7,
      'biochemistry.alp': 1.2,
    },
    markerSources: {
      'biochemistry.glucose': { file: 'old.pdf', at: 100 },
      'biochemistry.alp': { file: 'old.pdf', at: 100 },
    },
  }],
  manualValues: { 'biochemistry.glucose:2026-06-01': 4.6 },
  markerValueNotes: { 'biochemistry.glucose:2026-06-01': 'fasted' },
};
const deleteResult = deleteLabEntryMarkerFromImportedData(
  imported,
  imported.entries[0],
  'biochemistry.glucose',
  { now: 400 }
);
assert('deleteLabEntryMarkerFromImportedData removes only target marker from multi-marker row',
  deleteResult.changed
    && imported.entries.length === 1
    && imported.entries[0].markers['biochemistry.alp'] === 1.2
    && !Object.prototype.hasOwnProperty.call(imported.entries[0].markers, 'biochemistry.glucose'));
assert('deleteLabEntryMarkerFromImportedData records marker tombstone and metadata cleanup',
  imported.entries[0].deletedMarkers['biochemistry.glucose'] === 400
    && imported.entries[0].updatedAt === 400
    && !imported.manualValues['biochemistry.glucose:2026-06-01']
    && !imported.markerValueNotes['biochemistry.glucose:2026-06-01']);

console.log('%c 4. Imported data helpers ', 'font-weight:bold;color:#f59e0b');
const created = findOrCreateLabEntry(imported, '2026-07-01', { now: 500 });
assert('findOrCreateLabEntry creates a date-keyed row with updatedAt',
  created.date === '2026-07-01' && created.updatedAt === 500 && imported.entries.includes(created));
const removed = deleteLabEntryMarkerValues(imported, 'biochemistry.alp', { now: 600 });
const tombstoneOnlyEntry = imported.entries.find(e => e.date === '2026-06-01');
assert('deleteLabEntryMarkerValues preserves marker tombstones when last marker is removed',
  removed.length === 1
    && tombstoneOnlyEntry
    && Object.keys(tombstoneOnlyEntry.markers || {}).length === 0
    && tombstoneOnlyEntry.deletedMarkers['biochemistry.glucose'] === 400
    && tombstoneOnlyEntry.deletedMarkers['biochemistry.alp'] === 600
    && !imported._deleted?.entries?.includes('2026-06-01'));
assert('deleteLabEntryMarkerValues cleans empty rows that have no marker tombstones',
  !imported.entries.some(e => e.date === '2026-07-01')
    && imported._deleted?.entries?.includes('2026-07-01'));
const reimported = findOrCreateLabEntry(imported, '2026-06-01', { now: 700 });
setLabEntryMarker(reimported, 'biochemistry.alp', 1.4, {
  now: 700,
  source: { file: 'new.pdf', at: 700 },
});
assert('reimport into tombstone-only row clears only the restored marker tombstone',
  reimported.markers['biochemistry.alp'] === 1.4
    && reimported.deletedMarkers['biochemistry.glucose'] === 400
    && !Object.prototype.hasOwnProperty.call(reimported.deletedMarkers || {}, 'biochemistry.alp'));

console.log('%c 5. Collection context ', 'font-weight:bold;color:#f59e0b');
const contextEntry = createLabEntry('2026-08-12', { now: 800 });
contextEntry.context = { cyclePhase: 'follicular' };
assert('collection time normalization accepts 24-hour, seconds, and AM/PM forms',
  normalizeLabSampleTime('8:05') === '08:05'
    && normalizeLabSampleTime('2026-08-12T08:05:31') === '08:05'
    && normalizeLabSampleTime('1:20 PM') === '13:20');
assert('collection time normalization rejects prose and invalid clock values',
  normalizeLabSampleTime('processed at 08:05') === null
    && normalizeLabSampleTime('25:00') === null
    && normalizeLabSampleTime('08:72') === null);
setLabEntryCollectionContext(contextEntry, { sampleTime: '07:45', fasting: true }, { now: 900 });
assert('collection context merges with existing draw context and stamps freshness',
  contextEntry.context.sampleTime === '07:45'
    && contextEntry.context.fasting === true
    && contextEntry.context.cyclePhase === 'follicular'
    && contextEntry.updatedAt === 900);
setLabEntryCollectionContext(contextEntry, { sampleTime: null, fasting: null }, { now: 950 });
assert('explicit unknown collection context clears only collection fields',
  !Object.prototype.hasOwnProperty.call(contextEntry.context, 'sampleTime')
    && !Object.prototype.hasOwnProperty.call(contextEntry.context, 'fasting')
    && contextEntry.context.cyclePhase === 'follicular');

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
