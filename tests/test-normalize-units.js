#!/usr/bin/env node
// test-normalize-units.js — Unit normalization in the PDF import pipeline
//
// Run: node tests/test-normalize-units.js  (or via npm test)

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Unit Normalization Pipeline Tests ===\n');

const src = read('js/pdf-import.js');
const mappingSrc = read('js/pdf-import-marker-mapping.js');
const schemaSrc = read('js/schema.js');
const { UNIT_CONVERSIONS, MARKER_SCHEMA } = await import('../js/schema.js');
const { assessTextQuality } = await import('../js/pdf-import.js');

  // ═══════════════════════════════════════
  // Replicate normalizeUnitStr for functional tests
  // ═══════════════════════════════════════
  function normalizeUnitStr(s) {
    return s.toLowerCase().replace(/\s/g, '').replace(/[\u00b5\u03bc]/g, 'u').replace(/^mcg/, 'ug').replace(/^iu\//, 'u/').replace(/^ug\/l$/, 'ng/ml');
  }

  // Replicate normalizeToSI for functional tests
  function normalizeToSI(key, value, unit) {
    if (value == null) return value;
    // Hematocrit fraction → %
    if (key === 'hematology.hematocrit' && value < 1.5) {
      return parseFloat((value * 100).toFixed(1));
    }
    const conv = UNIT_CONVERSIONS[key];
    if (!conv) return value;

    if (unit) {
      const aiUnit = normalizeUnitStr(unit);
      if (conv.type === 'multiply') {
        if (aiUnit === normalizeUnitStr(conv.usUnit)) return parseFloat((value / conv.factor).toPrecision(6));
      } else if (conv.type === 'hba1c' && aiUnit === '%') {
        return parseFloat(((value - 2.15) * 10.929).toFixed(1));
      }
      return value;
    }

    // Heuristic fallback when AI omits unit string
    if (conv.type === 'multiply' && conv.factor > 1) {
      const [catKey, markerKey] = key.split('.');
      const marker = MARKER_SCHEMA[catKey]?.markers?.[markerKey];
      if (marker && marker.refMax != null) {
        if (value > marker.refMax * conv.factor * 0.3) {
          return parseFloat((value / conv.factor).toPrecision(6));
        }
      }
    }
    return value;
  }

  // ═══════════════════════════════════════
  // 1. normalizeUnitStr — basic normalization
  // ═══════════════════════════════════════
  console.log('%c 1. normalizeUnitStr — basic normalization ', 'font-weight:bold;color:#f59e0b');

  assert('lowercases input', normalizeUnitStr('MG/DL') === 'mg/dl');
  assert('lowercases mixed case', normalizeUnitStr('Ng/mL') === 'ng/ml');
  assert('removes whitespace', normalizeUnitStr('mg / dL') === 'mg/dl');
  assert('removes internal spaces', normalizeUnitStr('n g / m l') === 'ng/ml');
  assert('removes leading/trailing whitespace', normalizeUnitStr(' mg/dl ') === 'mg/dl');
  assert('already normalized passes through', normalizeUnitStr('mmol/l') === 'mmol/l');

  // ═══════════════════════════════════════
  // 2. normalizeUnitStr — Unicode micro sign
  // ═══════════════════════════════════════
  console.log('%c 2. normalizeUnitStr — Unicode micro sign ', 'font-weight:bold;color:#f59e0b');

  assert('\u00b5 (MICRO SIGN U+00B5) → u', normalizeUnitStr('\u00b5g/dl') === 'ug/dl');
  assert('\u03bc (GREEK MU U+03BC) → u', normalizeUnitStr('\u03bcg/dl') === 'ug/dl');
  assert('\u00b5mol/l normalized', normalizeUnitStr('\u00b5mol/L') === 'umol/l');
  assert('\u03bckat/l normalized', normalizeUnitStr('\u03bckat/L') === 'ukat/l');
  assert('double mu signs both replaced', normalizeUnitStr('\u00b5\u03bcg') === 'uug');
  assert('micro in middle of string', normalizeUnitStr('n\u00b5g') === 'nug');

  // ═══════════════════════════════════════
  // 3. normalizeUnitStr — mcg → ug prefix
  // ═══════════════════════════════════════
  console.log('%c 3. normalizeUnitStr — mcg prefix ', 'font-weight:bold;color:#f59e0b');

  assert('mcg/dl → ug/dl', normalizeUnitStr('mcg/dl') === 'ug/dl');
  assert('mcg/ml → ug/ml', normalizeUnitStr('mcg/ml') === 'ug/ml');
  assert('MCG/DL (uppercase) → ug/dl', normalizeUnitStr('MCG/DL') === 'ug/dl');
  assert('mcg at start only (not mid-string)', normalizeUnitStr('nmcg') === 'nmcg',
    'nmcg should not be transformed');

  // ═══════════════════════════════════════
  // 4. normalizeUnitStr — iu/ → u/ prefix
  // ═══════════════════════════════════════
  console.log('%c 4. normalizeUnitStr — IU prefix ', 'font-weight:bold;color:#f59e0b');

  assert('IU/L → u/l', normalizeUnitStr('IU/L') === 'u/l');
  assert('iu/l → u/l', normalizeUnitStr('iu/l') === 'u/l');
  assert('IU/mL → u/ml', normalizeUnitStr('IU/mL') === 'u/ml');
  assert('iu at start only (not mid-string)', normalizeUnitStr('miu/l') === 'miu/l',
    'miu/l should not be transformed');

  // ═══════════════════════════════════════
  // 5. normalizeUnitStr — ug/l → ng/ml alias (#102 fix)
  // ═══════════════════════════════════════
  console.log('%c 5. normalizeUnitStr — ug/l → ng/ml alias (#102) ', 'font-weight:bold;color:#f59e0b');

  assert('ug/l → ng/ml', normalizeUnitStr('ug/l') === 'ng/ml');
  assert('UG/L (uppercase) → ng/ml', normalizeUnitStr('UG/L') === 'ng/ml');
  assert('\u00b5g/L → ng/ml (micro sign + alias)', normalizeUnitStr('\u00b5g/L') === 'ng/ml');
  assert('\u03bcg/L → ng/ml (greek mu + alias)', normalizeUnitStr('\u03bcg/L') === 'ng/ml');
  assert('mcg/L → ng/ml (mcg prefix + alias)', normalizeUnitStr('mcg/L') === 'ng/ml');
  assert('ug/l with spaces → ng/ml', normalizeUnitStr(' ug / l ') === 'ng/ml');
  // Ensure ug/dl is NOT aliased (only exact ug/l match)
  assert('ug/dl is NOT aliased to ng/ml', normalizeUnitStr('ug/dl') === 'ug/dl');
  assert('ug/ml is NOT aliased', normalizeUnitStr('ug/ml') === 'ug/ml');

  // ═══════════════════════════════════════
  // 6. normalizeUnitStr — source verification
  // ═══════════════════════════════════════
  console.log('%c 6. normalizeUnitStr — source verification ', 'font-weight:bold;color:#f59e0b');

  assert('normalizeUnitStr defined in source', mappingSrc.includes('function normalizeUnitStr(s)'));
  assert('handles U+00B5 in source', mappingSrc.includes('\\u00b5'));
  assert('handles U+03BC in source', mappingSrc.includes('\\u03bc'));
  assert('mcg replacement in source', mappingSrc.includes("replace(/^mcg/, 'ug')"));
  assert('iu/ replacement in source', mappingSrc.includes("replace(/^iu\\//, 'u/')"));
  assert('ug/l → ng/ml alias in source', mappingSrc.includes("replace(/^ug\\/l$/, 'ng/ml')"));

  // ═══════════════════════════════════════
  // 7. normalizeToSI — glucose (mg/dL → mmol/L)
  // ═══════════════════════════════════════
  console.log('%c 7. normalizeToSI — glucose conversion ', 'font-weight:bold;color:#f59e0b');

  // factor: 18.018, 95 mg/dL → 95 / 18.018 ≈ 5.272
  const glucoseSI = normalizeToSI('biochemistry.glucose', 95, 'mg/dl');
  assert('Glucose 95 mg/dL → ~5.27 mmol/L',
    Math.abs(glucoseSI - 5.272) < 0.05, `got ${glucoseSI}`);

  // Already SI value passes through
  const glucosePass = normalizeToSI('biochemistry.glucose', 5.27, 'mmol/l');
  assert('Glucose 5.27 mmol/L unchanged', glucosePass === 5.27, `got ${glucosePass}`);

  // ═══════════════════════════════════════
  // 8. normalizeToSI — cholesterol (mg/dL → mmol/L)
  // ═══════════════════════════════════════
  console.log('%c 8. normalizeToSI — cholesterol conversion ', 'font-weight:bold;color:#f59e0b');

  // factor: 38.67, 200 mg/dL → 200 / 38.67 ≈ 5.172
  const cholSI = normalizeToSI('lipids.cholesterol', 200, 'mg/dl');
  assert('Cholesterol 200 mg/dL → ~5.17 mmol/L',
    Math.abs(cholSI - 5.172) < 0.05, `got ${cholSI}`);

  const hdlSI = normalizeToSI('lipids.hdl', 55, 'mg/dl');
  assert('HDL 55 mg/dL → ~1.42 mmol/L',
    Math.abs(hdlSI - 1.422) < 0.05, `got ${hdlSI}`);

  const ldlSI = normalizeToSI('lipids.ldl', 120, 'mg/dl');
  assert('LDL 120 mg/dL → ~3.10 mmol/L',
    Math.abs(ldlSI - 3.103) < 0.05, `got ${ldlSI}`);

  // ═══════════════════════════════════════
  // 9. normalizeToSI — vitamin D (ng/mL → nmol/L)
  // ═══════════════════════════════════════
  console.log('%c 9. normalizeToSI — vitamin D conversion ', 'font-weight:bold;color:#f59e0b');

  // factor: 0.4006, 40 ng/mL → 40 / 0.4006 ≈ 99.85
  const vitDSI = normalizeToSI('vitamins.vitaminD', 40, 'ng/ml');
  assert('Vitamin D 40 ng/mL → ~99.85 nmol/L',
    Math.abs(vitDSI - 99.85) < 0.5, `got ${vitDSI}`);

  // ═══════════════════════════════════════
  // 10. normalizeToSI — creatinine (mg/dL → µmol/L)
  // ═══════════════════════════════════════
  console.log('%c 10. normalizeToSI — creatinine conversion ', 'font-weight:bold;color:#f59e0b');

  // factor: 0.01131, 1.0 mg/dL → 1.0 / 0.01131 ≈ 88.42
  const creatSI = normalizeToSI('biochemistry.creatinine', 1.0, 'mg/dl');
  assert('Creatinine 1.0 mg/dL → ~88.42 µmol/L',
    Math.abs(creatSI - 88.42) < 0.5, `got ${creatSI}`);

  // ═══════════════════════════════════════
  // 11. normalizeToSI — testosterone (ng/dL → nmol/L)
  // ═══════════════════════════════════════
  console.log('%c 11. normalizeToSI — testosterone conversion ', 'font-weight:bold;color:#f59e0b');

  // factor: 28.818, 500 ng/dL → 500 / 28.818 ≈ 17.35
  const testoSI = normalizeToSI('hormones.testosterone', 500, 'ng/dl');
  assert('Testosterone 500 ng/dL → ~17.35 nmol/L',
    Math.abs(testoSI - 17.35) < 0.5, `got ${testoSI}`);

  // ═══════════════════════════════════════
  // 12. normalizeToSI — HbA1c (% → mmol/mol)
  // ═══════════════════════════════════════
  console.log('%c 12. normalizeToSI — HbA1c conversion ', 'font-weight:bold;color:#f59e0b');

  // Formula: (value - 2.15) * 10.929
  // 5.7% → (5.7 - 2.15) * 10.929 ≈ 38.8
  const hba1cSI = normalizeToSI('diabetes.hba1c', 5.7, '%');
  assert('HbA1c 5.7% → ~38.8 mmol/mol',
    Math.abs(hba1cSI - 38.8) < 0.5, `got ${hba1cSI}`);

  const hba1cHigh = normalizeToSI('diabetes.hba1c', 6.5, '%');
  assert('HbA1c 6.5% → ~47.5 mmol/mol',
    Math.abs(hba1cHigh - 47.5) < 0.5, `got ${hba1cHigh}`);

  // HbA1c in mmol/mol passes through (not '%' unit)
  const hba1cPass = normalizeToSI('diabetes.hba1c', 38.8, 'mmol/mol');
  assert('HbA1c 38.8 mmol/mol unchanged', hba1cPass === 38.8, `got ${hba1cPass}`);

  // ═══════════════════════════════════════
  // 13. normalizeToSI — enzyme units (IU/L = U/L)
  // ═══════════════════════════════════════
  console.log('%c 13. normalizeToSI — enzyme IU/L = U/L ', 'font-weight:bold;color:#f59e0b');

  // factor: 60, ALT 20 U/L → 20 / 60 ≈ 0.333 µkat/L
  const altUL = normalizeToSI('biochemistry.alt', 20, 'U/L');
  const altIU = normalizeToSI('biochemistry.alt', 20, 'IU/L');
  assert('ALT 20 U/L → ~0.333 µkat/L',
    Math.abs(altUL - 0.333) < 0.01, `got ${altUL}`);
  assert('ALT IU/L gives same result as U/L',
    altUL === altIU, `U/L=${altUL}, IU/L=${altIU}`);

  const ggtSI = normalizeToSI('biochemistry.ggt', 30, 'U/L');
  assert('GGT 30 U/L → ~0.5 µkat/L',
    Math.abs(ggtSI - 0.5) < 0.01, `got ${ggtSI}`);

  // ═══════════════════════════════════════
  // 14. normalizeToSI — edge cases
  // ═══════════════════════════════════════
  console.log('%c 14. normalizeToSI — edge cases ', 'font-weight:bold;color:#f59e0b');

  assert('null value returns null', normalizeToSI('biochemistry.glucose', null, 'mg/dl') === null);
  assert('undefined value returns undefined', normalizeToSI('biochemistry.glucose', undefined, 'mg/dl') === undefined);
  assert('unknown key returns value unchanged', normalizeToSI('custom.something', 42, 'mg/dl') === 42);
  assert('factor-1 marker: ferritin 80 ng/mL → 80',
    normalizeToSI('iron.ferritin', 80, 'ng/ml') === 80, `got ${normalizeToSI('iron.ferritin', 80, 'ng/ml')}`);

  // ═══════════════════════════════════════
  // 15. normalizeToSI — hematocrit fraction → %
  // ═══════════════════════════════════════
  console.log('%c 15. normalizeToSI — hematocrit fraction ', 'font-weight:bold;color:#f59e0b');

  const hctFrac = normalizeToSI('hematology.hematocrit', 0.45, null);
  assert('Hematocrit 0.45 (fraction) → 45%',
    Math.abs(hctFrac - 45) < 0.01, `got ${hctFrac}`);

  const hctPct = normalizeToSI('hematology.hematocrit', 45, null);
  assert('Hematocrit 45 (already %) stays 45',
    hctPct === 45, `got ${hctPct}`);

  const hctLow = normalizeToSI('hematology.hematocrit', 0.38, null);
  assert('Hematocrit 0.38 (fraction) → 38%',
    Math.abs(hctLow - 38) < 0.01, `got ${hctLow}`);

  // ═══════════════════════════════════════
  // 16. normalizeToSI — fallback heuristic (no unit string)
  // ═══════════════════════════════════════
  console.log('%c 16. normalizeToSI — fallback heuristic ', 'font-weight:bold;color:#f59e0b');

  // Glucose: refMax=5.60, factor=18.018
  // Threshold: 5.60 * 18.018 * 0.3 ≈ 30.27
  // 95 > 30.27 → should convert: 95 / 18.018 ≈ 5.272
  const glucoseNoUnit = normalizeToSI('biochemistry.glucose', 95, null);
  assert('Glucose 95 (no unit, heuristic) → ~5.27',
    Math.abs(glucoseNoUnit - 5.272) < 0.05, `got ${glucoseNoUnit}`);

  // Value already in SI range should NOT convert
  const glucoseSINoUnit = normalizeToSI('biochemistry.glucose', 5.0, null);
  assert('Glucose 5.0 (no unit, in SI range) unchanged',
    glucoseSINoUnit === 5.0, `got ${glucoseSINoUnit}`);

  // Cholesterol: refMax=5.00, factor=38.67
  // Threshold: 5.00 * 38.67 * 0.3 ≈ 58.01
  // 200 > 58.01 → should convert: 200 / 38.67 ≈ 5.172
  const cholNoUnit = normalizeToSI('lipids.cholesterol', 200, null);
  assert('Cholesterol 200 (no unit, heuristic) → ~5.17',
    Math.abs(cholNoUnit - 5.172) < 0.05, `got ${cholNoUnit}`);

  // Cholesterol 4.5 is in SI range — should NOT convert
  const cholSINoUnit = normalizeToSI('lipids.cholesterol', 4.5, null);
  assert('Cholesterol 4.5 (no unit, in SI range) unchanged',
    cholSINoUnit === 4.5, `got ${cholSINoUnit}`);

  // Heuristic only fires for factor > 1
  // Creatinine: factor=0.01131 (<1) → no heuristic, value returned as-is
  const creatNoUnit = normalizeToSI('biochemistry.creatinine', 1.0, null);
  assert('Creatinine 1.0 (no unit, factor<1) unchanged',
    creatNoUnit === 1.0, `got ${creatNoUnit}`);

  // Vitamin D: factor=0.4006 (<1) → no heuristic
  const vitDNoUnit = normalizeToSI('vitamins.vitaminD', 40, null);
  assert('Vitamin D 40 (no unit, factor<1) unchanged',
    vitDNoUnit === 40, `got ${vitDNoUnit}`);

  // ═══════════════════════════════════════
  // 17. normalizeToSI — additional conversions
  // ═══════════════════════════════════════
  console.log('%c 17. normalizeToSI — additional conversions ', 'font-weight:bold;color:#f59e0b');

  // Hemoglobin: factor 0.1, 14 g/dL → 140 g/L
  const hgbSI = normalizeToSI('hematology.hemoglobin', 14, 'g/dl');
  assert('Hemoglobin 14 g/dL → 140 g/L',
    Math.abs(hgbSI - 140) < 1, `got ${hgbSI}`);

  // Calcium: factor 4.008, 10 mg/dL → ~2.495 mmol/L
  const caSI = normalizeToSI('electrolytes.calciumTotal', 10, 'mg/dl');
  assert('Calcium 10 mg/dL → ~2.495 mmol/L',
    Math.abs(caSI - 2.495) < 0.05, `got ${caSI}`);

  // Magnesium: factor 2.431, 2.0 mg/dL → ~0.823 mmol/L
  const mgSI = normalizeToSI('electrolytes.magnesium', 2.0, 'mg/dl');
  assert('Magnesium 2.0 mg/dL → ~0.823 mmol/L',
    Math.abs(mgSI - 0.823) < 0.05, `got ${mgSI}`);

  // Albumin: factor 0.1, 4.0 g/dL → 40 g/L
  const albSI = normalizeToSI('proteins.albumin', 4.0, 'g/dl');
  assert('Albumin 4.0 g/dL → 40 g/L',
    Math.abs(albSI - 40) < 0.5, `got ${albSI}`);

  // Triglycerides: factor 88.57, 150 mg/dL → ~1.694 mmol/L
  const tgSI = normalizeToSI('lipids.triglycerides', 150, 'mg/dl');
  assert('Triglycerides 150 mg/dL → ~1.694 mmol/L',
    Math.abs(tgSI - 1.694) < 0.05, `got ${tgSI}`);

  // DHEA-S: factor 36.87, µg/dL
  const dheaSI = normalizeToSI('hormones.dheaS', 200, '\u00b5g/dl');
  assert('DHEA-S 200 \u00b5g/dL → ~5.42 \u00b5mol/L',
    Math.abs(dheaSI - 5.424) < 0.05, `got ${dheaSI}`);

  // Body comp: leanMass factor 2.20462, 150 lbs → ~68.04 kg
  const leanSI = normalizeToSI('bodyComposition.leanMass', 150, 'lbs');
  assert('Lean mass 150 lbs → ~68.04 kg',
    Math.abs(leanSI - 68.04) < 0.5, `got ${leanSI}`);

  // ═══════════════════════════════════════
  // 18. normalizeUnitStr — combined transforms
  // ═══════════════════════════════════════
  console.log('%c 18. normalizeUnitStr — combined transforms ', 'font-weight:bold;color:#f59e0b');

  // MCG/L with spaces should normalize → ug/l → ng/ml
  assert('MCG/L → ng/ml (mcg prefix + alias)',
    normalizeUnitStr('MCG/L') === 'ng/ml');
  // IU with micro sign
  assert('IU/L stays u/l (not affected by micro replacement)',
    normalizeUnitStr('IU/L') === 'u/l');
  // Uppercase micro prefix with mcg
  assert('MCG/DL uppercase → ug/dl',
    normalizeUnitStr('MCG / DL') === 'ug/dl');

  // ═══════════════════════════════════════
  // 19. assessTextQuality
  // ═══════════════════════════════════════
  console.log('%c 19. assessTextQuality ', 'font-weight:bold;color:#f59e0b');

  // assessTextQuality is exported on window
  const atq = assessTextQuality;
  if (atq) {
    assert('empty text → empty', atq('') === 'empty');
    assert('null text → empty', atq(null) === 'empty');
    assert('undefined text → empty', atq(undefined) === 'empty');
    assert('whitespace only → empty', atq('   \n\t  ') === 'empty');
    assert('short text → poor', atq('hello world') === 'poor');
    assert('< 30 words → poor', atq('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two twenty-three twenty-four twenty-five twenty-six twenty-seven twenty-eight twenty-nine') === 'poor');
    // 30+ words with good alpha ratio → good
    const goodText = 'Patient blood test results show the following values glucose level is within normal range and cholesterol levels appear to be slightly elevated with total cholesterol of two hundred and LDL showing elevated results';
    assert('normal lab text (30+ words) → good', atq(goodText) === 'good');
    // High non-alpha ratio → poor
    const garbled = Array(40).fill('####$$%%').join(' ');
    assert('garbled text (low alpha ratio) → poor', atq(garbled) === 'poor');
  } else {
    // Verify via source inspection
    assert('assessTextQuality defined in source', src.includes('function assessTextQuality(text)'));
    assert('assessTextQuality exported', src.includes('assessTextQuality'));
    assert('returns empty for falsy', src.includes("return 'empty'"));
    assert('returns poor for short text', src.includes("return 'poor'"));
    assert('returns good for normal text', src.includes("return 'good'"));
    assert('checks word count < 30', src.includes('words.length < 30'));
    assert('checks alpha ratio < 0.15', src.includes('alphaChars / totalChars < 0.15'));
  }

  // ═══════════════════════════════════════
  // 20. assessTextQuality — source verification
  // ═══════════════════════════════════════
  console.log('%c 20. assessTextQuality — source verification ', 'font-weight:bold;color:#f59e0b');

  assert('assessTextQuality is an export', src.includes('export function assessTextQuality'));
  assert('assessTextQuality on window', src.includes('assessTextQuality') &&
    (src.includes('Object.assign(window') || src.includes('window.')));
  assert('word split on whitespace', src.includes("split(/\\s+/)"));
  assert('alpha regex includes Latin Extended', src.includes('\\u00C0-\\u024F'));
  assert('alpha regex includes Cyrillic', src.includes('\\u0400-\\u04FF'));

  // ═══════════════════════════════════════
  // 21. UNIT_CONVERSIONS completeness
  // ═══════════════════════════════════════
  console.log('%c 21. UNIT_CONVERSIONS completeness ', 'font-weight:bold;color:#f59e0b');

  assert('UNIT_CONVERSIONS has glucose', UNIT_CONVERSIONS['biochemistry.glucose'] != null);
  assert('UNIT_CONVERSIONS has cholesterol', UNIT_CONVERSIONS['lipids.cholesterol'] != null);
  assert('UNIT_CONVERSIONS has vitaminD', UNIT_CONVERSIONS['vitamins.vitaminD'] != null);
  assert('UNIT_CONVERSIONS has creatinine', UNIT_CONVERSIONS['biochemistry.creatinine'] != null);
  assert('UNIT_CONVERSIONS has hba1c', UNIT_CONVERSIONS['diabetes.hba1c'] != null);
  assert('hba1c type is hba1c (not multiply)', UNIT_CONVERSIONS['diabetes.hba1c'].type === 'hba1c');
  assert('glucose factor is 18.018', UNIT_CONVERSIONS['biochemistry.glucose'].factor === 18.018);
  assert('cholesterol factor is 38.67', UNIT_CONVERSIONS['lipids.cholesterol'].factor === 38.67);
  assert('vitaminD factor is 0.4006', UNIT_CONVERSIONS['vitamins.vitaminD'].factor === 0.4006);
  assert('creatinine factor is 0.01131', UNIT_CONVERSIONS['biochemistry.creatinine'].factor === 0.01131);

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
