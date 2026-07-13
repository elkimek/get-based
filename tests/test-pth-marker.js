#!/usr/bin/env node
// test-pth-marker.js — Parathyroid hormone schema, unit, and import coverage.

import './_node-shim.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ` — ${detail}` : ''}`); }
}
const approx = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

console.log('=== Parathyroid Hormone Marker ===\n');

const {
  MARKER_SCHEMA,
  UNIT_CONVERSIONS,
  getAlternateUnit,
  convertUserInputToSI,
} = await import('../js/schema.js');
const {
  normalizeToSI,
  getValidUnitsForMarker,
  reconcileImportMarkerMappings,
} = await import('../js/pdf-import-marker-mapping.js');

const pth = MARKER_SCHEMA.hormones?.markers?.pth;
assert('PTH exists in the hormone schema', pth != null);
assert('PTH uses canonical pmol/l', pth?.unit === 'pmol/l', pth?.unit);
assert('PTH has the adult assay reference interval', pth?.refMin === 1.6 && pth?.refMax === 6.9,
  `${pth?.refMin}–${pth?.refMax}`);

const primary = UNIT_CONVERSIONS['hormones.pth'];
assert('PTH supports pg/ml display and entry', primary?.usUnit === 'pg/ml' && primary?.factor === 9.43,
  JSON.stringify(primary));
assert('PTH converts SI to pg/ml', approx(getAlternateUnit('hormones.pth', 5, false)?.value, 47.15));
assert('PTH converts pg/ml manual input to SI', approx(convertUserInputToSI('hormones.pth', 47.15, 'pg/ml'), 5));
assert('PTH imports pg/ml to SI', approx(normalizeToSI('hormones.pth', 47.15, 'pg/ml'), 5));
assert('PTH imports equivalent ng/l to SI', approx(normalizeToSI('hormones.pth', 47.15, 'ng/l'), 5));
assert('PTH leaves canonical pmol/l imports unchanged', approx(normalizeToSI('hormones.pth', 5, 'pmol/l'), 5));

const units = getValidUnitsForMarker('hormones.pth');
assert('PTH exposes SI and report units without duplicates',
  ['pmol/l', 'pg/ml', 'ng/l'].every(unit => units.includes(unit)) && units.length === new Set(units).size,
  JSON.stringify(units));

const imports = [
  { rawName: 'PTH', value: 4.2, unit: 'pmol/l', matched: false, mappedKey: null, suggestedKey: 'custom.pth' },
  { rawName: 'Parathormon', value: 4.5, unit: 'pmol/l', matched: false, mappedKey: null, suggestedKey: 'custom.parathormon' },
  { rawName: 'Parathyroid hormone, intact', value: 45, unit: 'pg/ml', matched: false, mappedKey: null, suggestedKey: 'custom.intactPth' },
];
reconcileImportMarkerMappings(imports, { testType: 'blood' });
assert('Common PTH report names reconcile to the schema marker',
  imports.every(marker => marker.matched && marker.mappedKey === 'hormones.pth'),
  JSON.stringify(imports));

const legacyProfile = {
  entries: [
    {
      date: '2026-01-10',
      markers: { 'hormones.pth': 47.15 },
      markerSources: { 'hormones.pth': { file: 'older-pth.pdf', snapshotId: 'snap_pth_pg' } },
    },
    {
      date: '2026-07-10',
      markers: { 'hormones.pth': 5 },
      markerSources: { 'hormones.pth': { file: 'newer-pth.pdf', snapshotId: 'snap_pth_si' } },
    },
  ],
  customMarkers: {
    'hormones.pth': { name: 'PTH', unit: 'pg/ml', refMin: 15.1, refMax: 65.1 },
  },
  importSnapshots: [
    {
      id: 'snap_pth_pg', date: '2026-01-10', fileName: 'older-pth.pdf',
      markers: [{ rawName: 'PTH', value: 47.15, unit: 'pg/ml', refMin: 15.1, refMax: 65.1, suggestedKey: 'hormones.pth', matched: false }],
    },
    {
      id: 'snap_pth_si', date: '2026-07-10', fileName: 'newer-pth.pdf',
      markers: [{ rawName: 'PTH', value: 5, unit: 'pmol/l', mappedKey: 'hormones.pth', matched: true }],
    },
  ],
  refOverrides: {
    'hormones.pth': { refMin: 15.1, refMax: 65.1, labRefMin: 15.1, labRefMax: 65.1, refSource: 'import' },
  },
};
const { migrateProfileData } = await import('../js/profile.js');
migrateProfileData(legacyProfile);
assert('Legacy custom PTH imports migrate both report units to canonical values',
  approx(legacyProfile.entries[0].markers['hormones.pth'], 5)
  && approx(legacyProfile.entries[1].markers['hormones.pth'], 5)
  && legacyProfile.customMarkers['hormones.pth'] === undefined,
  JSON.stringify(legacyProfile.entries));
assert('Legacy PTH snapshots and imported ranges migrate to the standard marker',
  legacyProfile.importSnapshots[0].markers[0].mappedKey === 'hormones.pth'
  && legacyProfile.importSnapshots[0].markers[0].suggestedKey === null
  && legacyProfile.importSnapshots[0].markers[0].matched === true
  && approx(legacyProfile.refOverrides['hormones.pth'].refMin, 15.1 / 9.43)
  && approx(legacyProfile.refOverrides['hormones.pth'].refMax, 65.1 / 9.43));

const { state } = await import('../js/state.js');
const { getActiveData } = await import('../js/data.js');
state.importedData = legacyProfile;
state.unitSystem = 'EU';
const chartPth = getActiveData().categories.hormones.markers.pth;
assert('PTH chart plots different imported units on one canonical scale',
  chartPth.unit === 'pmol/l'
  && chartPth.values.length === 2
  && chartPth.values.every(value => approx(value, 5)),
  JSON.stringify({ unit: chartPth.unit, values: chartPth.values }));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
if (fail > 0) process.exit(1);
