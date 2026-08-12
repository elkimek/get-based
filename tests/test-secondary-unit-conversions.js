#!/usr/bin/env node
// test-secondary-unit-conversions.js - behavioral tests for the expanded normalizeToSI()
// and the SECONDARY_UNIT_CONVERSIONS registry.
//
// Unlike the source-shape assertions in test-unit-import.js, these import the REAL
// normalizeToSI() / getValidUnitsForMarker() from pdf-import-marker-mapping.js and
// assert actual numeric output for the four conversion paths:
//   1. secondary-unit conversion (e.g. mg/L, katal, mEq/L)
//   2. SI passthrough (unit matches the schema SI unit)
//   3. unknown explicit-unit passthrough (no heuristic guessing)
//   4. urea/BUN edge case (US mg/dL routes to BUN nitrogen factor, European mg/L to urea-mass)
//
// Run: node tests/test-secondary-unit-conversions.js (or via npm test)

import './_node-shim.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Secondary Unit Conversion Behavioral Tests ===\n');

const { UNIT_CONVERSIONS } = await import('../js/schema.js');
const { SECONDARY_UNIT_CONVERSIONS } = await import('../js/secondary-unit-conversions.js');
const { normalizeToSI, getValidUnitsForMarker } = await import('../js/pdf-import-marker-mapping.js');

const approx = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

// ═══════════════════════════════════════════════
// 1. Secondary-unit conversion (European / specialized units)
// ═══════════════════════════════════════════════
console.log(' 1. Secondary-unit conversions ');

// Glucose: 1.8 g/L (European) should convert to ~0.01 mmol/L (1.8 / 0.18018... but factor is value_SI = value/factor → 1.8/0.18018 = 9.99)
// Schema SI = mmol/l. g/L factor 0.18018 → but wait, glucose g/l factor 0.18018: value_SI = 1.8/0.18018 ≈ 9.99 mmol/L. Yes.
assert('glucose mg/L → mmol/L (European mass)', approx(normalizeToSI('biochemistry.glucose', 1800, 'mg/l'), 9.99));
assert('glucose g/L → mmol/L', approx(normalizeToSI('biochemistry.glucose', 1.8, 'g/l'), 9.99));

// Enzyme katal: AST 3.0 µkat/L should be ~180 U/L (3.0 * 60)
assert('AST nkat/L → µkat/L', approx(normalizeToSI('biochemistry.ast', 3000, 'nkat/l'), 3.0));

// Electrolyte mEq/L: calcium 4.0 mEq/L → 2.0 mmol/L (factor 2)
assert('calcium mEq/L → mmol/L', approx(normalizeToSI('electrolytes.calciumTotal', 4.0, 'mEq/l'), 2.0));

// Trace minerals
assert('copper µg/L → µmol/L', approx(normalizeToSI('electrolytes.copper', 1271, 'µg/l'), 20.0));
assert('zinc mg/L → µmol/L', approx(normalizeToSI('electrolytes.zinc', 6.54, 'mg/l'), 100.0));
// magnesium MW = 24.31, so 486 mg/L → 486/24.31 ≈ 19.9918 mmol/L
assert('magnesium mg/L → mmol/L', approx(normalizeToSI('electrolytes.magnesium', 486, 'mg/l'), 19.9918));

// Hormones
assert('testosterone ng/ml → nmol/L', approx(normalizeToSI('hormones.testosterone', 10, 'ng/ml'), 34.7, 0.1));
assert('estradiol pg/ml → pmol/L', approx(normalizeToSI('hormones.estradiol', 100, 'pg/ml'), 367, 1));
assert('free T3 pg/ml → pmol/L', approx(normalizeToSI('thyroid.ft3', 3.5, 'pg/ml'), 5.374, 0.01));
assert('free T3 pg/dl preserves the 100× unit difference', approx(normalizeToSI('thyroid.ft3', 3.5, 'pg/dl'), 0.05374, 0.001));
assert('calcitriol pg/ml and ng/l convert identically',
  approx(normalizeToSI('vitamins.calcitriol', 60, 'pg/ml'), normalizeToSI('vitamins.calcitriol', 60, 'ng/l'), 0.01));
assert('prolactin mU/L → µg/L', approx(normalizeToSI('hormones.prolactin', 263.7, 'mU/l'), 12.4387, 0.001));
assert('prolactin mIU/L alias → µg/L', approx(normalizeToSI('hormones.prolactin', 324, 'mIU/l'), 15.283, 0.001));

// ═══════════════════════════════════════════════
// 2. SI passthrough
// ═══════════════════════════════════════════════
console.log(' 2. SI passthrough ');

assert('glucose mmol/L passes through unchanged', normalizeToSI('biochemistry.glucose', 5.5, 'mmol/l') === 5.5);
assert('testosterone nmol/L passes through', normalizeToSI('hormones.testosterone', 15, 'nmol/l') === 15);
assert('SI passthrough is case-insensitive (mmol/L vs schema mmol/l)', normalizeToSI('biochemistry.glucose', 5.5, 'MMOL/L') === 5.5);

// ═══════════════════════════════════════════════
// 2b. Fraction-stored percent imports
// ═══════════════════════════════════════════════
console.log(' 2b. Fraction-stored percent imports ');

assert('differential neutrophils 0.609 % stays 0.609 fraction',
  normalizeToSI('differential.neutrophilsPct', 0.609, '%') === 0.609);
assert('differential neutrophils 0.609 % stays 0.609 even with whole-percent lab range',
  normalizeToSI('differential.neutrophilsPct', 0.609, '%', { refMin: 45, refMax: 70 }) === 0.609);
assert('differential neutrophils 60.9 % converts to 0.609 fraction',
  approx(normalizeToSI('differential.neutrophilsPct', 60.9, '%'), 0.609));
assert('differential lymphocytes 0.332 % stays 0.332 fraction',
  normalizeToSI('differential.lymphocytesPct', 0.332, '%') === 0.332);
assert('differential lymphocytes 33.2 % converts to 0.332 fraction',
  approx(normalizeToSI('differential.lymphocytesPct', 33.2, '%'), 0.332));
assert('differential monocytes 0.074 PERCENTAGE stays 0.074 fraction',
  normalizeToSI('differential.monocytesPct', 0.074, 'PERCENTAGE') === 0.074);
assert('differential monocytes 7.4 PERCENTAGE converts to 0.074 fraction',
  approx(normalizeToSI('differential.monocytesPct', 7.4, 'PERCENTAGE'), 0.074));
assert('differential eosinophils 0.041 % stays 0.041 fraction',
  normalizeToSI('differential.eosinophilsPct', 0.041, '%') === 0.041);
assert('differential eosinophils 4.1 % converts to 0.041 fraction',
  approx(normalizeToSI('differential.eosinophilsPct', 4.1, '%'), 0.041));
assert('differential basophils 0.006 % stays 0.006 fraction',
  normalizeToSI('differential.basophilsPct', 0.006, '%') === 0.006);
assert('differential basophils 0.6 % with whole-percent lab range converts to 0.006 fraction',
  approx(normalizeToSI('differential.basophilsPct', 0.6, '%', { refMin: 0, refMax: 2 }), 0.006));
assert('HbA1c percent conversion is unchanged',
  approx(normalizeToSI('diabetes.hba1c', 5.7, '%'), 38.8, 0.5));

// ═══════════════════════════════════════════════
// 3. Unknown explicit-unit passthrough (no heuristic guessing)
// ═══════════════════════════════════════════════
console.log(' 3. Unknown explicit-unit passthrough ');

// A provided-but-unrecognized unit must NOT trigger the magnitude heuristic.
// testosterone refMax=29, factor=28.818 → heuristic would fire at value > 29*28.818*0.3 ≈ 250.
// Give it a value well above that threshold with a genuinely unknown unit - it must come back unchanged.
// (Note: 'nG/dL' is NOT a valid negative-test here because normalizeUnitStr lowercases it to
// 'ng/dl', which legitimately matches the usUnit and correctly converts. Only a truly
// unmatchable unit exercises the "provided but unrecognized → passthrough" branch.)
assert('unrecognized unit returns value unchanged (no heuristic)', normalizeToSI('hormones.testosterone', 600, 'wibble') === 600);
assert('garbage unit string returns value unchanged', normalizeToSI('biochemistry.glucose', 500, 'xyzzy') === 500);
assert('empty unit with normal-range value still heuristics correctly (glucose 5 = SI)', normalizeToSI('biochemistry.glucose', 5, null) === 5);
// And confirm a unit that DOES fold to a known usUnit still converts (case-insensitivity is a feature):
assert('case-variant usUnit still converts (nG/dL → ng/dl match)', approx(normalizeToSI('hormones.testosterone', 600, 'nG/dL'), 20.82, 0.01));

// ═══════════════════════════════════════════════
// 4. Urea / BUN edge cases
// ═══════════════════════════════════════════════
console.log(' 4. Urea / BUN edge cases ');

// US "BUN" mg/dL → primary conversion uses nitrogen mass factor 2.801. 14 mg/dL → ~5.0 mmol/L.
assert('urea mg/dL routes to BUN nitrogen factor (14 → ~5.0)', approx(normalizeToSI('biochemistry.urea', 14, 'mg/dl'), 4.998, 0.01));
// European mg/L → urea-mass factor 60.06. 360 mg/L → ~6.0 mmol/L (NOT 12.85).
assert('urea mg/L uses urea-mass factor 60.06 (360 → ~6.0)', approx(normalizeToSI('biochemistry.urea', 360, 'mg/l'), 5.99, 0.02));
// g/L
assert('urea g/L uses factor 0.06006 (0.36 → ~6.0)', approx(normalizeToSI('biochemistry.urea', 0.36, 'g/l'), 5.99, 0.02));

// ═══════════════════════════════════════════════
// 5. getValidUnitsForMarker
// ═══════════════════════════════════════════════
console.log(' 5. getValidUnitsForMarker ');

const glucoseUnits = getValidUnitsForMarker('biochemistry.glucose');
assert('glucose returns deduped unit set including SI + secondary',
  glucoseUnits.includes('mmol/l') && glucoseUnits.includes('g/l') && glucoseUnits.includes('mg/l'));
assert('getValidUnitsForMarker dedupes (no duplicates)', glucoseUnits.length === new Set(glucoseUnits).size);
assert('empty/invalid key returns []', getValidUnitsForMarker('').length === 0 && getValidUnitsForMarker('nope.nada').length === 0);

// ═══════════════════════════════════════════════
// 6. Registry integrity (all keys resolve to real markers)
// ═══════════════════════════════════════════════
console.log(' 6. Registry integrity ');

const { MARKER_SCHEMA } = await import('../js/schema.js');
const allKeys = new Set();
for (const [cat, def] of Object.entries(MARKER_SCHEMA)) {
  for (const mk of Object.keys(def.markers || {})) allKeys.add(`${cat}.${mk}`);
}
let missing = 0;
for (const key of Object.keys(SECONDARY_UNIT_CONVERSIONS)) {
  if (!allKeys.has(key)) { missing++; console.log(`    MISSING: ${key}`); }
}
assert('all SECONDARY_UNIT_CONVERSIONS keys resolve to real markers', missing === 0, `${missing} missing`);

// No internal conflicts: two entries for the same marker that normalize to the same unit
// but have different factors would be a latent bug.
const norm = s => s.toLowerCase().replace(/\s/g, '').replace(/[\u00b5\u03bc]/g, 'u').replace(/^mcg/, 'ug').replace(/^iu\//, 'u/').replace(/^ug\/l$/, 'ng/ml');
let conflicts = 0;
for (const [key, list] of Object.entries(SECONDARY_UNIT_CONVERSIONS)) {
  const seen = new Map();
  for (const e of list) {
    const n = norm(e.unit);
    if (seen.has(n) && seen.get(n).factor !== e.factor) {
      conflicts++; console.log(`    CONFLICT ${key}: '${seen.get(n).unit}'(${seen.get(n).factor}) vs '${e.unit}'(${e.factor})`);
    }
    seen.set(n, e);
  }
}
assert('no unit/factor conflicts within any marker', conflicts === 0, `${conflicts} conflicts`);

// ═══════════════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
if (fail > 0) process.exit(1);
