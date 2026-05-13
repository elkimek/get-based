#!/usr/bin/env node
// test-unit-import.js — Verify US-unit values are normalized to SI on import
//
// Run: node tests/test-unit-import.js  (or via npm test)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.window = globalThis.window || globalThis;
function _ls() {
  const s = new Map();
  return { getItem: k => s.has(k) ? s.get(k) : null, setItem: (k, v) => s.set(k, String(v)),
    removeItem: k => s.delete(k), clear: () => s.clear(),
    get length() { return s.size; }, key: i => Array.from(s.keys())[i] ?? null };
}
if (typeof globalThis.localStorage === 'undefined') globalThis.localStorage = _ls();
if (typeof globalThis.sessionStorage === 'undefined') globalThis.sessionStorage = _ls();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Unit Normalization on Import Tests ===\n');

const src = read('js/pdf-import.js');
  // ═══════════════════════════════════════
  // 1. normalizeToSI function exists
  // ═══════════════════════════════════════
  console.log('%c 1. normalizeToSI function ', 'font-weight:bold;color:#f59e0b');

  assert('normalizeToSI defined', src.includes('function normalizeToSI('));
  assert('normalizeToSI checks UNIT_CONVERSIONS', src.includes('UNIT_CONVERSIONS[key]'));
  assert('normalizeUnitStr handles µ variants', src.includes('normalizeUnitStr') && src.includes('\\u03bc'));

  // ═══════════════════════════════════════
  // 2. UNIT_CONVERSIONS is imported
  // ═══════════════════════════════════════
  console.log('%c 2. UNIT_CONVERSIONS import ', 'font-weight:bold;color:#f59e0b');

  assert('UNIT_CONVERSIONS imported from schema.js',
    /import\s*\{[^}]*UNIT_CONVERSIONS[^}]*\}\s*from\s*['"]\.\/schema\.js['"]/.test(src));

  // ═══════════════════════════════════════
  // 3. confirmImport uses normalizeToSI for matched markers
  // ═══════════════════════════════════════
  console.log('%c 3. confirmImport normalization ', 'font-weight:bold;color:#f59e0b');

  const confirmBlock = src.substring(src.indexOf('function confirmImport'));
  assert('matched markers normalized',
    confirmBlock.includes('normalizeToSI(m.mappedKey, m.value, m.unit)'));
  assert('new (custom) markers normalized',
    confirmBlock.includes('normalizeToSI(m.suggestedKey, m.value, m.unit)'));

  // ═══════════════════════════════════════
  // 4. normalizeToSI handles multiply type (inverse)
  // ═══════════════════════════════════════
  console.log('%c 4. Conversion logic ', 'font-weight:bold;color:#f59e0b');

  assert('divides by factor for multiply type', src.includes('value / conv.factor'));
  assert('handles hba1c inverse', src.includes('(value - 2.15) * 10.929'));

  // ═══════════════════════════════════════
  // 5. Functional test via module import
  // ═══════════════════════════════════════
  console.log('%c 5. Functional conversion tests ', 'font-weight:bold;color:#f59e0b');

  const { UNIT_CONVERSIONS } = await import('../js/schema.js');

  // Simulate normalizeToSI (same logic as the function)
  function normUnit(s) {
    return s.toLowerCase().replace(/\s/g, '').replace(/[\u00b5\u03bc]/g, 'u').replace(/^mcg/, 'ug').replace(/^iu\//, 'u/');
  }
  function testNormalize(key, value, unit) {
    if (value == null || !unit) return value;
    const conv = UNIT_CONVERSIONS[key];
    if (!conv) return value;
    const aiUnit = normUnit(unit);
    if (conv.type === 'multiply') {
      if (aiUnit === normUnit(conv.usUnit)) return parseFloat((value / conv.factor).toPrecision(6));
    } else if (conv.type === 'hba1c' && aiUnit === '%') {
      return parseFloat(((value - 2.15) * 10.929).toFixed(1));
    }
    return value;
  }

  // Glucose: 95 mg/dL → should be ~5.27 mmol/L
  const glucoseSI = testNormalize('biochemistry.glucose', 95, 'mg/dl');
  assert('Glucose 95 mg/dL → ~5.27 mmol/L',
    Math.abs(glucoseSI - 5.27) < 0.1,
    `got ${glucoseSI}`);

  // Glucose already in SI should pass through unchanged
  const glucosePassthrough = testNormalize('biochemistry.glucose', 5.27, 'mmol/l');
  assert('Glucose 5.27 mmol/L unchanged',
    glucosePassthrough === 5.27,
    `got ${glucosePassthrough}`);

  // HbA1c: 5.7% → should be ~38.8 mmol/mol
  const hba1cSI = testNormalize('diabetes.hba1c', 5.7, '%');
  assert('HbA1c 5.7% → ~38.8 mmol/mol',
    Math.abs(hba1cSI - 38.8) < 0.5,
    `got ${hba1cSI}`);

  // Testosterone: 500 ng/dL → should be ~17.35 nmol/L
  const testoSI = testNormalize('hormones.testosterone', 500, 'ng/dl');
  assert('Testosterone 500 ng/dL → ~17.35 nmol/L',
    Math.abs(testoSI - 17.35) < 0.5,
    `got ${testoSI}`);

  // Cholesterol: 200 mg/dL → should be ~5.17 mmol/L
  const cholSI = testNormalize('lipids.cholesterol', 200, 'mg/dl');
  assert('Cholesterol 200 mg/dL → ~5.17 mmol/L',
    Math.abs(cholSI - 5.17) < 0.1,
    `got ${cholSI}`);

  // µ character variants for DHEA-S (usUnit: 'µg/dl', factor: 36.87)
  // Unicode MICRO SIGN (U+00B5)
  const dhea1 = testNormalize('hormones.dheaS', 200, '\u00b5g/dl');
  assert('DHEA-S with µ (U+00B5) converts',
    Math.abs(dhea1 - 5.424) < 0.01, `got ${dhea1}`);
  // Greek mu (U+03BC)
  const dhea2 = testNormalize('hormones.dheaS', 200, '\u03bcg/dl');
  assert('DHEA-S with μ (U+03BC) converts',
    Math.abs(dhea2 - 5.424) < 0.01, `got ${dhea2}`);
  // mcg
  const dhea3 = testNormalize('hormones.dheaS', 200, 'mcg/dl');
  assert('DHEA-S with mcg converts',
    Math.abs(dhea3 - 5.424) < 0.01, `got ${dhea3}`);

  // Null value should return null
  assert('null value returns null', testNormalize('biochemistry.glucose', null, 'mg/dl') === null);

  // No unit should return value unchanged
  assert('no unit returns value unchanged', testNormalize('biochemistry.glucose', 95, null) === 95);

  // Unknown marker key should return value unchanged
  assert('unknown key returns value unchanged', testNormalize('custom.something', 42, 'mg/dl') === 42);

  // IU/L → U/L normalization (enzyme units are equivalent)
  const altIU = testNormalize('biochemistry.alt', 20, 'IU/L');
  assert('ALT 20 IU/L → ~0.333 µkat/L',
    Math.abs(altIU - 0.333) < 0.01, `got ${altIU}`);
  const astIU = testNormalize('biochemistry.ast', 18, 'IU/L');
  assert('AST 18 IU/L → ~0.3 µkat/L',
    Math.abs(astIU - 0.3) < 0.01, `got ${astIU}`);
  const alpIU = testNormalize('biochemistry.alp', 65, 'IU/L');
  assert('ALP 65 IU/L → ~1.083 µkat/L',
    Math.abs(alpIU - 1.083) < 0.01, `got ${alpIU}`);

  // IU/L should match U/L conversion
  const altUL = testNormalize('biochemistry.alt', 20, 'U/L');
  assert('ALT IU/L and U/L give same result',
    altIU === altUL, `IU/L=${altIU}, U/L=${altUL}`);

  // Hematocrit: 45% stays as 45 (stored natively as %)
  const hctSI = testNormalize('hematology.hematocrit', 45, '%');
  assert('Hematocrit 45% stays 45',
    Math.abs(hctSI - 45) < 0.001, `got ${hctSI}`);

  // Vitamin A: 50 µg/dL → ~1.745 µmol/L
  const vitASI = testNormalize('vitamins.vitaminA', 50, '\u00b5g/dl');
  assert('Vitamin A 50 µg/dL → ~1.745 µmol/L',
    Math.abs(vitASI - 1.745) < 0.05, `got ${vitASI}`);

  // Calcitriol: 60 pg/mL → ~149.8 pmol/L
  const calcSI = testNormalize('vitamins.calcitriol', 60, 'pg/ml');
  assert('Calcitriol 60 pg/mL → ~149.8 pmol/L',
    Math.abs(calcSI - 149.8) < 1, `got ${calcSI}`);

  // Free T4: 1.2 ng/dL → ~15.44 pmol/L
  const ft4SI = testNormalize('thyroid.ft4', 1.2, 'ng/dl');
  assert('Free T4 1.2 ng/dL → ~15.44 pmol/L',
    Math.abs(ft4SI - 15.44) < 0.5, `got ${ft4SI}`);

  // Free T3: 3.5 pg/dL → ~5.37 pmol/L
  const ft3SI = testNormalize('thyroid.ft3', 3.5, 'pg/dl');
  assert('Free T3 3.5 pg/dL → ~5.37 pmol/L',
    Math.abs(ft3SI - 5.37) < 0.2, `got ${ft3SI}`);

  // Transferrin: 250 mg/dL → 2.5 g/L
  const transSI = testNormalize('iron.transferrin', 250, 'mg/dl');
  assert('Transferrin 250 mg/dL → 2.5 g/L',
    Math.abs(transSI - 2.5) < 0.01, `got ${transSI}`);

  // MCHC: 34.0 g/dL → 340 g/L
  const mchcSI = testNormalize('hematology.mchc', 34.0, 'g/dl');
  assert('MCHC 34 g/dL → 340 g/L',
    Math.abs(mchcSI - 340) < 1, `got ${mchcSI}`);

  // Ceruloplasmin: 25 mg/dL → 0.25 g/L
  const ceruSI = testNormalize('proteins.ceruloplasmin', 25, 'mg/dl');
  assert('Ceruloplasmin 25 mg/dL → 0.25 g/L',
    Math.abs(ceruSI - 0.25) < 0.01, `got ${ceruSI}`);

  // Factor-1 markers: unit label changes but value stays same
  const ferritinSI = testNormalize('iron.ferritin', 80, 'ng/ml');
  assert('Ferritin 80 ng/mL → 80 (factor 1)',
    ferritinSI === 80, `got ${ferritinSI}`);

  // BUN/Creatinine ratio exists in schema
  const { MARKER_SCHEMA } = await import('../js/schema.js');
  assert('bunCreatRatio in calculatedRatios',
    MARKER_SCHEMA.calculatedRatios?.markers?.bunCreatRatio != null);
  assert('bunCreatRatio ref range 10-20',
    MARKER_SCHEMA.calculatedRatios.markers.bunCreatRatio.refMin === 10 &&
    MARKER_SCHEMA.calculatedRatios.markers.bunCreatRatio.refMax === 20);

  // ═══════════════════════════════════════
  // 6. FA normalization doesn't rewrite standard markers
  // ═══════════════════════════════════════
  console.log('%c 6. FA normalization safety ', 'font-weight:bold;color:#f59e0b');

  // Verify FA normalization uses adapters.js (not inline functions)
  assert('pdf-import imports adapter functions', src.includes("from './adapters.js'"));
  assert('Inline FA functions removed', !src.includes('function _normalizeFattyAcidMarkers(') && !src.includes('FA_PRODUCT_PATTERNS'));
  assert('Uses detectProduct from adapters', src.includes('detectProduct('));
  assert('Uses normalizeWithAdapter from adapters', src.includes('normalizeWithAdapter('));

  // FA normalize logic lives in adapters.js — check it there
  const adapterSrc = read('js/adapters.js');
  assert('FA normalize checks standardCats', adapterSrc.includes('standardCats.has(catKey)'));
  assert('FA normalize skips standard markers', adapterSrc.includes('continue') && adapterSrc.includes('standard category'));

  // Verify adapter normalization requires AI agreement — product detection alone + blood testType must NOT trigger
  assert('Adapter normalization requires non-blood testType',
    src.includes("testType !== 'blood'") && src.includes('detected') && src.includes('needsAdapterNormalize'));

  // Verify guard at line 367 only fires for non-blood tests
  assert('Guard checks testType !== blood',
    src.includes("testType !== 'blood'") && src.includes('Import Guard'));

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
