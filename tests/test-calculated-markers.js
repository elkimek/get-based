#!/usr/bin/env node
// test-calculated-markers.js — PhenoAge, Bortz Age, Biological Age, BUN/Creat, Free Water Deficit, hs-CRP/HDL
//
// Run: node tests/test-calculated-markers.js  (or via npm test)

globalThis.window = globalThis.window || globalThis;
function _ls() {
  const s = new Map();
  return { getItem: k => s.has(k) ? s.get(k) : null, setItem: (k, v) => s.set(k, String(v)),
    removeItem: k => s.delete(k), clear: () => s.clear(),
    get length() { return s.size; }, key: i => Array.from(s.keys())[i] ?? null };
}
if (typeof globalThis.localStorage === 'undefined') globalThis.localStorage = _ls();
if (typeof globalThis.sessionStorage === 'undefined') globalThis.sessionStorage = _ls();

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const _ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const _realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (typeof url === 'string' && !/^https?:/.test(url)) {
    const rel = url.replace(/^\//, '');
    try {
      const body = fs.readFileSync(path.join(_ROOT, rel), 'utf-8');
      return new Response(body, { status: 200 });
    } catch (_) { return new Response('', { status: 404 }); }
  }
  return _realFetch(url, opts);
};

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Calculated Markers Tests ===\n');

// Bring in state.js + data.js so window._labState exists and getActiveData
// is wired up (data.js does Object.assign(window, { getActiveData, ... })).
await import('../js/state.js');
await import('../js/data.js');

const state = window._labState;

  // Save originals
  const origEntries = state.importedData.entries;
  const origSex = state.profileSex;
  const origDob = state.profileDob;
  const origUnit = state.unitSystem;
  const origBio = state.importedData.biometrics;

  // ═══════════════════════════════════════
  // 1. PhenoAge (Levine 2018)
  // ═══════════════════════════════════════
  console.log('%c 1. PhenoAge (Levine 2018) ', 'font-weight:bold;color:#f59e0b');

  // Set up profile: 45 years old at blood draw 2025-06-15
  // DOB: 1980-06-15 → age exactly 45 at draw date
  state.profileDob = '1980-06-15';
  state.profileSex = 'male';
  state.unitSystem = 'EU';
  state.importedData.biometrics = null;

  // All 9 biomarkers in SI units as stored in schema
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: {
      'proteins.albumin': 45,            // g/L
      'biochemistry.creatinine': 80,     // µmol/L
      'biochemistry.glucose': 5.5,       // mmol/L
      'proteins.hsCRP': 1.5,             // mg/L
      'differential.lymphocytesPct': 0.30, // fraction 0-1
      'hematology.mcv': 90,              // fL
      'hematology.rdwcv': 13.0,          // %
      'biochemistry.alp': 1.2,           // µkat/L
      'hematology.wbc': 6.5              // 10^9/L
    }
  }];

  let data = window.getActiveData();
  let phenoVal = data.categories.calculatedRatios?.markers?.phenoAge?.values?.[0];

  // Expected: xb = -19.907 - 0.0336*45 + 0.0095*80 + 0.1953*5.5 + 0.0954*ln(1.5)
  //   - 0.0120*0.30 + 0.0268*90 + 0.3306*13.0 + 0.00188*1.2 + 0.0554*6.5 + 0.0804*45
  // mortalityScore = 1 - exp(-exp(xb) * (exp(120*0.0076927)-1) / 0.0076927)
  // phenoAge = 141.50225 + ln(-0.00553 * ln(1-mortalityScore)) / 0.090165
  // Result: 44.2 years
  assert('PhenoAge computes with all 9 markers', phenoVal != null, `got ${phenoVal}`);
  assert('PhenoAge value is 44.2', phenoVal === 44.2, `expected 44.2, got ${phenoVal}`);
  assert('PhenoAge is younger than chronological age (45)', phenoVal < 45, `${phenoVal} should be < 45`);

  // ── PhenoAge: missing one biomarker → null ──
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: {
      'proteins.albumin': 45,
      'biochemistry.creatinine': 80,
      'biochemistry.glucose': 5.5,
      'proteins.hsCRP': 1.5,
      'differential.lymphocytesPct': 0.30,
      'hematology.mcv': 90,
      'hematology.rdwcv': 13.0,
      'biochemistry.alp': 1.2
      // missing WBC
    }
  }];

  data = window.getActiveData();
  phenoVal = data.categories.calculatedRatios?.markers?.phenoAge?.values?.[0];
  assert('PhenoAge is null when WBC missing', phenoVal === null || phenoVal === undefined, `got ${phenoVal}`);

  // ── PhenoAge: missing DOB → null ──
  state.profileDob = null;
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: {
      'proteins.albumin': 45, 'biochemistry.creatinine': 80, 'biochemistry.glucose': 5.5,
      'proteins.hsCRP': 1.5, 'differential.lymphocytesPct': 0.30, 'hematology.mcv': 90,
      'hematology.rdwcv': 13.0, 'biochemistry.alp': 1.2, 'hematology.wbc': 6.5
    }
  }];

  data = window.getActiveData();
  phenoVal = data.categories.calculatedRatios?.markers?.phenoAge?.values?.[0];
  assert('PhenoAge is null when DOB missing', phenoVal == null, `got ${phenoVal}`);

  // ── PhenoAge: CRP <= 0 → null (ln undefined) ──
  state.profileDob = '1980-06-15';
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: {
      'proteins.albumin': 45, 'biochemistry.creatinine': 80, 'biochemistry.glucose': 5.5,
      'proteins.hsCRP': 0, 'differential.lymphocytesPct': 0.30, 'hematology.mcv': 90,
      'hematology.rdwcv': 13.0, 'biochemistry.alp': 1.2, 'hematology.wbc': 6.5
    }
  }];

  data = window.getActiveData();
  phenoVal = data.categories.calculatedRatios?.markers?.phenoAge?.values?.[0];
  assert('PhenoAge is null when CRP is zero (ln undefined)', phenoVal == null, `got ${phenoVal}`);

  // ── PhenoAge: hs-CRP only, no fallback to standard CRP ──
  // (Behavior tightened in v1.5.1 — the two assays differ in detection range
  // and substituting silently corrupts age estimates.)
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: {
      'proteins.albumin': 45, 'biochemistry.creatinine': 80, 'biochemistry.glucose': 5.5,
      'proteins.crp': 1.5,  // standard CRP, not hs-CRP — should NOT be used
      'differential.lymphocytesPct': 0.30, 'hematology.mcv': 90,
      'hematology.rdwcv': 13.0, 'biochemistry.alp': 1.2, 'hematology.wbc': 6.5
    }
  }];

  data = window.getActiveData();
  phenoVal = data.categories.calculatedRatios?.markers?.phenoAge?.values?.[0];
  assert('PhenoAge is null when only standard CRP is provided (no fallback)', phenoVal == null, `got ${phenoVal}`);

  // ── PhenoAge: coefficients are SI-calibrated ──
  // Verify the formula structure by checking source code contains the Levine 2018 coefficients
  const dataSrc = await fetch('js/data.js').then(r => r.text());
  assert('PhenoAge uses SI albumin coeff -0.0336', dataSrc.includes('0.0336  * albumin_si'));
  assert('PhenoAge uses SI creatinine coeff 0.0095', dataSrc.includes('0.0095  * creatinine_si'));
  assert('PhenoAge uses Levine mortality constant 0.0076927', dataSrc.includes('0.0076927'));
  assert('PhenoAge uses Levine age-to-pheno constant 141.50225', dataSrc.includes('141.50225'));
  assert('PhenoAge uses Levine inverse constant 0.090165', dataSrc.includes('0.090165'));

  // ═══════════════════════════════════════
  // 2. Bortz Age (Bortz 2023)
  // ═══════════════════════════════════════
  console.log('%c 2. Bortz Age (Bortz 2023) ', 'font-weight:bold;color:#f59e0b');

  state.profileDob = '1980-06-15';
  state.profileSex = 'male';
  state.unitSystem = 'EU';

  // All 22 Bortz features (21 biomarkers + age)
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: {
      'proteins.albumin': 45,            // g/L
      'biochemistry.alp': 1.2,           // µkat/L (→ U/L via ×60)
      'biochemistry.urea': 5.5,          // mmol/L
      'lipids.cholesterol': 5.2,         // mmol/L
      'biochemistry.creatinine': 80,     // µmol/L
      'biochemistry.cystatinC': 0.9,     // mg/L
      'diabetes.hba1c': 36,              // mmol/mol
      'proteins.hsCRP': 1.5,             // mg/L
      'biochemistry.ggt': 0.5,           // µkat/L (→ U/L via ×60)
      'hematology.rbc': 4.8,             // 10^12/L
      'hematology.mcv': 90,              // fL
      'hematology.rdwcv': 13.0,          // %
      'differential.monocytes': 0.5,     // 10^9/L
      'differential.neutrophils': 4.0,   // 10^9/L
      'differential.lymphocytesPct': 0.30, // fraction 0-1 (→ % via ×100)
      'biochemistry.alt': 0.4,           // µkat/L (→ U/L via ×60)
      'hormones.shbg': 40,               // nmol/L
      'vitamins.vitaminD': 60,           // nmol/L (→ ng/mL via ×0.4006)
      'biochemistry.glucose': 5.5,       // mmol/L
      'hematology.mch': 31.0,            // pg
      'lipids.apoAI': 1.5                // g/L
    }
  }];

  data = window.getActiveData();
  let bortzVal = data.categories.calculatedRatios?.markers?.bortzAge?.values?.[0];

  // BAA = sum((centered - mean) × coeff) for all 22 features, biological age = age + 10 × BAA
  // Result: 45.7 years
  assert('Bortz Age computes with all 22 markers', bortzVal != null, `got ${bortzVal}`);
  assert('Bortz Age value is 45.7', bortzVal === 45.7, `expected 45.7, got ${bortzVal}`);

  // ── Bortz: missing one marker → null ──
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: {
      'proteins.albumin': 45, 'biochemistry.alp': 1.2, 'biochemistry.urea': 5.5,
      'lipids.cholesterol': 5.2, 'biochemistry.creatinine': 80, 'biochemistry.cystatinC': 0.9,
      'diabetes.hba1c': 36, 'proteins.hsCRP': 1.5, 'biochemistry.ggt': 0.5,
      'hematology.rbc': 4.8, 'hematology.mcv': 90, 'hematology.rdwcv': 13.0,
      'differential.monocytes': 0.5, 'differential.neutrophils': 4.0,
      'differential.lymphocytesPct': 0.30, 'biochemistry.alt': 0.4,
      'hormones.shbg': 40, 'vitamins.vitaminD': 60, 'biochemistry.glucose': 5.5,
      'hematology.mch': 31.0
      // missing apoAI
    }
  }];

  data = window.getActiveData();
  bortzVal = data.categories.calculatedRatios?.markers?.bortzAge?.values?.[0];
  assert('Bortz Age is null when apoAI missing', bortzVal == null, `got ${bortzVal}`);

  // ── Bortz: missing DOB → null ──
  state.profileDob = null;
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: {
      'proteins.albumin': 45, 'biochemistry.alp': 1.2, 'biochemistry.urea': 5.5,
      'lipids.cholesterol': 5.2, 'biochemistry.creatinine': 80, 'biochemistry.cystatinC': 0.9,
      'diabetes.hba1c': 36, 'proteins.hsCRP': 1.5, 'biochemistry.ggt': 0.5,
      'hematology.rbc': 4.8, 'hematology.mcv': 90, 'hematology.rdwcv': 13.0,
      'differential.monocytes': 0.5, 'differential.neutrophils': 4.0,
      'differential.lymphocytesPct': 0.30, 'biochemistry.alt': 0.4,
      'hormones.shbg': 40, 'vitamins.vitaminD': 60, 'biochemistry.glucose': 5.5,
      'hematology.mch': 31.0, 'lipids.apoAI': 1.5
    }
  }];

  data = window.getActiveData();
  bortzVal = data.categories.calculatedRatios?.markers?.bortzAge?.values?.[0];
  assert('Bortz Age is null when DOB missing', bortzVal == null, `got ${bortzVal}`);

  // ── Bortz: unit conversions applied correctly ──
  // ALP, GGT, ALT use scaleFactor 60 (µkat/L → U/L)
  // lymphocytesPct uses scaleFactor 100 (fraction → %)
  // vitaminD uses scaleFactor 0.4006 (nmol/L → ng/mL)
  assert('Bortz features include µkat/L→U/L conversion (×60)', dataSrc.includes('60],  // µkat/L→U/L'));
  assert('Bortz features include fraction→% conversion (×100)', dataSrc.includes('100], // fraction→%'));
  assert('Bortz features include nmol/L→ng/mL conversion (×0.4006)', dataSrc.includes('0.4006'));

  // ═══════════════════════════════════════
  // 3. Biological Age (combined)
  // ═══════════════════════════════════════
  console.log('%c 3. Biological Age (Combined) ', 'font-weight:bold;color:#f59e0b');

  state.profileDob = '1980-06-15';
  state.profileSex = 'male';

  // Full entry with all markers for both PhenoAge + Bortz
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: {
      'proteins.albumin': 45, 'biochemistry.creatinine': 80, 'biochemistry.glucose': 5.5,
      'proteins.hsCRP': 1.5, 'differential.lymphocytesPct': 0.30, 'hematology.mcv': 90,
      'hematology.rdwcv': 13.0, 'biochemistry.alp': 1.2, 'hematology.wbc': 6.5,
      // Extra Bortz-only markers
      'biochemistry.urea': 5.5, 'lipids.cholesterol': 5.2, 'biochemistry.cystatinC': 0.9,
      'diabetes.hba1c': 36, 'biochemistry.ggt': 0.5, 'hematology.rbc': 4.8,
      'differential.monocytes': 0.5, 'differential.neutrophils': 4.0,
      'biochemistry.alt': 0.4, 'hormones.shbg': 40, 'vitamins.vitaminD': 60,
      'hematology.mch': 31.0, 'lipids.apoAI': 1.5
    }
  }];

  data = window.getActiveData();
  const bioAge = data.categories.calculatedRatios?.markers?.biologicalAge?.values?.[0];
  const phenoCheck = data.categories.calculatedRatios?.markers?.phenoAge?.values?.[0];
  const bortzCheck = data.categories.calculatedRatios?.markers?.bortzAge?.values?.[0];

  // biologicalAge = (phenoAge + bortzAge) / 2 = (44.2 + 45.7) / 2 = 45.0
  assert('Biological Age is average of PhenoAge + Bortz', bioAge != null, `got ${bioAge}`);
  assert('Biological Age is 45.0', bioAge === 45.0, `expected 45.0, got ${bioAge}`);
  assert('Biological Age equals (PhenoAge + Bortz) / 2',
    bioAge === Math.round(((phenoCheck + bortzCheck) / 2) * 10) / 10,
    `${bioAge} vs (${phenoCheck} + ${bortzCheck}) / 2`);

  // ── Biological Age: only PhenoAge available → uses PhenoAge alone ──
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: {
      'proteins.albumin': 45, 'biochemistry.creatinine': 80, 'biochemistry.glucose': 5.5,
      'proteins.hsCRP': 1.5, 'differential.lymphocytesPct': 0.30, 'hematology.mcv': 90,
      'hematology.rdwcv': 13.0, 'biochemistry.alp': 1.2, 'hematology.wbc': 6.5
      // No Bortz-only markers
    }
  }];

  data = window.getActiveData();
  const bioAgePheno = data.categories.calculatedRatios?.markers?.biologicalAge?.values?.[0];
  const phenoOnly = data.categories.calculatedRatios?.markers?.phenoAge?.values?.[0];
  const bortzNull = data.categories.calculatedRatios?.markers?.bortzAge?.values?.[0];
  assert('Bortz is null when missing markers', bortzNull == null, `got ${bortzNull}`);
  assert('Biological Age falls back to PhenoAge alone', bioAgePheno === phenoOnly,
    `bioAge=${bioAgePheno}, phenoAge=${phenoOnly}`);

  // ── Biological Age: both null → null ──
  state.profileDob = null;
  data = window.getActiveData();
  const bioAgeNull = data.categories.calculatedRatios?.markers?.biologicalAge?.values?.[0];
  assert('Biological Age is null when both components null', bioAgeNull == null, `got ${bioAgeNull}`);

  // ═══════════════════════════════════════
  // 4. BUN/Creatinine Ratio
  // ═══════════════════════════════════════
  console.log('%c 4. BUN/Creatinine Ratio ', 'font-weight:bold;color:#f59e0b');

  state.profileDob = '1980-06-15';
  state.unitSystem = 'EU';

  // Formula: (urea × 2.801) / (creatinine × 0.01131)
  // urea=5.5 mmol/L, creatinine=80 µmol/L → (5.5×2.801)/(80×0.01131) = 15.4055/0.9048 = 17.0
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: {
      'biochemistry.urea': 5.5,
      'biochemistry.creatinine': 80
    }
  }];

  data = window.getActiveData();
  const bunCreat = data.categories.calculatedRatios?.markers?.bunCreatRatio?.values?.[0];
  assert('BUN/Creat ratio computes correctly', bunCreat === 17.0, `expected 17.0, got ${bunCreat}`);

  // ── BUN/Creat: zero creatinine → null ──
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: {
      'biochemistry.urea': 5.5,
      'biochemistry.creatinine': 0
    }
  }];

  data = window.getActiveData();
  const bunCreatZero = data.categories.calculatedRatios?.markers?.bunCreatRatio?.values?.[0];
  assert('BUN/Creat is null when creatinine is zero', bunCreatZero == null, `got ${bunCreatZero}`);

  // ── BUN/Creat: missing urea → null ──
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: {
      'biochemistry.creatinine': 80
    }
  }];

  data = window.getActiveData();
  const bunCreatNoUrea = data.categories.calculatedRatios?.markers?.bunCreatRatio?.values?.[0];
  assert('BUN/Creat is null when urea missing', bunCreatNoUrea == null, `got ${bunCreatNoUrea}`);

  // ── BUN/Creat: ref range check ──
  const bunCreatMarker = data.categories.calculatedRatios?.markers?.bunCreatRatio;
  assert('BUN/Creat refMin is 10', bunCreatMarker?.refMin === 10, `got ${bunCreatMarker?.refMin}`);
  assert('BUN/Creat refMax is 20', bunCreatMarker?.refMax === 20, `got ${bunCreatMarker?.refMax}`);

  // ═══════════════════════════════════════
  // 5. Free Water Deficit
  // ═══════════════════════════════════════
  console.log('%c 5. Free Water Deficit ', 'font-weight:bold;color:#f59e0b');

  state.profileSex = 'male';
  // Clear any wearableSummary inherited from a previously loaded demo profile
  // — wearableSummary.metrics.weight.latest takes precedence over biometrics
  // in the FWD calc, and we're explicitly testing the legacy-biometrics path.
  state.importedData.wearableSummary = null;
  state.importedData.biometrics = { weight: [{ date: '2025-06-01', value: 80, unit: 'kg' }], bp: [], pulse: [] };

  // FWD = TBW × (Na/140 - 1), TBW = weight × 0.6 (male)
  // 80 × 0.6 × (145/140 - 1) = 48 × 0.0357... = 1.71
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: { 'electrolytes.sodium': 145 }
  }];

  data = window.getActiveData();
  const fwd = data.categories.calculatedRatios?.markers?.freeWaterDeficit?.values?.[0];
  assert('FWD computes for male with weight', fwd === 1.71, `expected 1.71, got ${fwd}`);

  // ── FWD: female → uses 0.5 TBW factor ──
  state.profileSex = 'female';

  data = window.getActiveData();
  const fwdF = data.categories.calculatedRatios?.markers?.freeWaterDeficit?.values?.[0];
  // 80 × 0.5 × (145/140 - 1) = 40 × 0.0357... = 1.43
  assert('FWD uses 0.5 factor for female', fwdF === 1.43, `expected 1.43, got ${fwdF}`);

  // ── FWD: no weight → 70kg default ──
  state.profileSex = 'male';
  state.importedData.biometrics = null;

  data = window.getActiveData();
  const fwdDef = data.categories.calculatedRatios?.markers?.freeWaterDeficit?.values?.[0];
  // 70 × 0.6 × (145/140 - 1) = 42 × 0.0357... = 1.5
  assert('FWD falls back to 70kg default', fwdDef === 1.5, `expected 1.5, got ${fwdDef}`);

  // ── FWD: Na ≤ 0 → null ──
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: { 'electrolytes.sodium': 0 }
  }];

  data = window.getActiveData();
  const fwdZero = data.categories.calculatedRatios?.markers?.freeWaterDeficit?.values?.[0];
  assert('FWD is null when sodium is zero', fwdZero == null, `got ${fwdZero}`);

  // ── FWD: missing sodium → null ──
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: { 'biochemistry.glucose': 5.5 }
  }];

  data = window.getActiveData();
  const fwdMissing = data.categories.calculatedRatios?.markers?.freeWaterDeficit?.values?.[0];
  assert('FWD is null when sodium missing', fwdMissing == null, `got ${fwdMissing}`);

  // ── FWD: negative result (hyponatremia) ──
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: { 'electrolytes.sodium': 130 }
  }];
  state.importedData.biometrics = null;

  data = window.getActiveData();
  const fwdNeg = data.categories.calculatedRatios?.markers?.freeWaterDeficit?.values?.[0];
  // 70 × 0.6 × (130/140 - 1) = 42 × (-0.07143) = -3.0
  assert('FWD is negative for low sodium (overhydration)', fwdNeg < 0, `got ${fwdNeg}`);
  assert('FWD value correct for Na=130', fwdNeg === -3.0, `expected -3.0, got ${fwdNeg}`);

  // ═══════════════════════════════════════
  // 6. hs-CRP/HDL Cardiovascular Risk Ratio
  // ═══════════════════════════════════════
  console.log('%c 6. hs-CRP/HDL Ratio ', 'font-weight:bold;color:#f59e0b');

  // Formula: CRP mg/L ÷ (HDL mmol/L × 38.67)
  // Requires hs-CRP specifically (not standard CRP)
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: {
      'proteins.hsCRP': 1.5,  // mg/L
      'lipids.hdl': 1.5       // mmol/L
    }
  }];

  data = window.getActiveData();
  const crpHdl = data.categories.calculatedRatios?.markers?.crpHdlRatio?.values?.[0];
  // 1.5 / (1.5 × 38.67) = 1.5 / 58.005 = 0.0259
  assert('CRP/HDL ratio computes correctly', crpHdl === 0.0259, `expected 0.0259, got ${crpHdl}`);

  // ── CRP/HDL: optimal threshold < 0.24 ──
  assert('CRP/HDL 0.0259 is under optimal 0.24', crpHdl < 0.24, `${crpHdl} should be < 0.24`);

  // ── CRP/HDL: ref range from schema ──
  const crpHdlMarker = data.categories.calculatedRatios?.markers?.crpHdlRatio;
  assert('CRP/HDL refMax is 0.94', crpHdlMarker?.refMax === 0.94, `got ${crpHdlMarker?.refMax}`);

  // ── CRP/HDL: optimal range from OPTIMAL_RANGES ──
  // OPTIMAL_RANGES['calculatedRatios.crpHdlRatio'] = { optimalMin: 0, optimalMax: 0.24 }
  const schemaSrc = await fetch('js/schema.js').then(r => r.text());
  assert('CRP/HDL optimal max is 0.24 in schema',
    schemaSrc.includes("'calculatedRatios.crpHdlRatio': { optimalMin: 0, optimalMax: 0.24 }"));

  // ── CRP/HDL: HDL = 0 → null ──
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: { 'proteins.hsCRP': 1.5, 'lipids.hdl': 0 }
  }];

  data = window.getActiveData();
  const crpHdlZeroHdl = data.categories.calculatedRatios?.markers?.crpHdlRatio?.values?.[0];
  assert('CRP/HDL is null when HDL is zero', crpHdlZeroHdl == null, `got ${crpHdlZeroHdl}`);

  // ── CRP/HDL: missing hs-CRP → null ──
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: { 'lipids.hdl': 1.5 }
  }];

  data = window.getActiveData();
  const crpHdlNoCrp = data.categories.calculatedRatios?.markers?.crpHdlRatio?.values?.[0];
  assert('CRP/HDL is null when hs-CRP missing', crpHdlNoCrp == null, `got ${crpHdlNoCrp}`);

  // ── CRP/HDL: does NOT fall back to standard CRP ──
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: {
      'proteins.crp': 1.5,   // standard CRP, not hs-CRP
      'lipids.hdl': 1.5
    }
  }];

  data = window.getActiveData();
  const crpHdlStd = data.categories.calculatedRatios?.markers?.crpHdlRatio?.values?.[0];
  assert('CRP/HDL does NOT use standard CRP (requires hs-CRP)', crpHdlStd == null, `got ${crpHdlStd}`);

  // ═══════════════════════════════════════
  // 7. Multiple dates — computed per date
  // ═══════════════════════════════════════
  console.log('%c 7. Multi-Date Computation ', 'font-weight:bold;color:#f59e0b');

  state.profileDob = '1980-06-15';
  state.profileSex = 'male';
  state.importedData.biometrics = null;

  state.importedData.entries = [
    {
      date: '2025-01-15',
      markers: { 'biochemistry.urea': 5.0, 'biochemistry.creatinine': 90 }
    },
    {
      date: '2025-06-15',
      markers: { 'biochemistry.urea': 5.5, 'biochemistry.creatinine': 80 }
    },
    {
      date: '2025-09-15',
      markers: { 'biochemistry.urea': 6.0 }  // missing creatinine
    }
  ];

  data = window.getActiveData();
  const bunArr = data.categories.calculatedRatios?.markers?.bunCreatRatio?.values;
  assert('Multi-date: 3 values in array', bunArr?.length === 3, `got ${bunArr?.length}`);

  const bunJan = bunArr?.[0];
  // (5.0 × 2.801) / (90 × 0.01131) = 14.005 / 1.0179 = 13.8
  assert('Multi-date: Jan BUN/Creat is 13.8', bunJan === 13.8, `expected 13.8, got ${bunJan}`);
  assert('Multi-date: Jun BUN/Creat is 17.0', bunArr?.[1] === 17.0, `expected 17.0, got ${bunArr?.[1]}`);
  assert('Multi-date: Sep BUN/Creat is null (missing creatinine)', bunArr?.[2] == null, `got ${bunArr?.[2]}`);

  // ═══════════════════════════════════════
  // 8. Simple ratios (TG/HDL, LDL/HDL, etc.)
  // ═══════════════════════════════════════
  console.log('%c 8. Simple Ratios ', 'font-weight:bold;color:#f59e0b');

  state.importedData.entries = [{
    date: '2025-06-15',
    markers: {
      'lipids.triglycerides': 1.5,
      'lipids.hdl': 1.5,
      'lipids.ldl': 3.0,
      'lipids.apoB': 1.0,
      'lipids.apoAI': 1.5,
      'differential.neutrophils': 4.0,
      'differential.lymphocytes': 2.0,
      'hematology.platelets': 250,
      'biochemistry.ast': 0.4,
      'biochemistry.alt': 0.5,
      'electrolytes.copper': 15,
      'electrolytes.zinc': 18
    }
  }];

  data = window.getActiveData();
  const cr = data.categories.calculatedRatios?.markers;

  // TG/HDL = 1.5/1.5 = 1.0
  assert('TG/HDL ratio is 1.0', cr?.tgHdlRatio?.values?.[0] === 1.0,
    `expected 1.0, got ${cr?.tgHdlRatio?.values?.[0]}`);

  // LDL/HDL = 3.0/1.5 = 2.0
  assert('LDL/HDL ratio is 2.0', cr?.ldlHdlRatio?.values?.[0] === 2.0,
    `expected 2.0, got ${cr?.ldlHdlRatio?.values?.[0]}`);

  // ApoB/ApoAI = 1.0/1.5 = 0.667
  assert('ApoB/ApoAI ratio is 0.667', cr?.apoBapoAIRatio?.values?.[0] === 0.667,
    `expected 0.667, got ${cr?.apoBapoAIRatio?.values?.[0]}`);

  // NLR = 4.0/2.0 = 2.0
  assert('NLR is 2.0', cr?.nlr?.values?.[0] === 2.0, `expected 2.0, got ${cr?.nlr?.values?.[0]}`);

  // PLR = 250/2.0 = 125.0
  assert('PLR is 125.0', cr?.plr?.values?.[0] === 125.0, `expected 125.0, got ${cr?.plr?.values?.[0]}`);

  // De Ritis = 0.4/0.5 = 0.8
  assert('De Ritis ratio is 0.8', cr?.deRitisRatio?.values?.[0] === 0.8,
    `expected 0.8, got ${cr?.deRitisRatio?.values?.[0]}`);

  // Cu/Zn = 15/18 = 0.833
  assert('Cu/Zn ratio is 0.833', cr?.copperZincRatio?.values?.[0] === 0.833,
    `expected 0.833, got ${cr?.copperZincRatio?.values?.[0]}`);

  // ── Division by zero → null ──
  state.importedData.entries = [{
    date: '2025-06-15',
    markers: { 'lipids.triglycerides': 1.5, 'lipids.hdl': 0 }
  }];

  data = window.getActiveData();
  const tgHdlZero = data.categories.calculatedRatios?.markers?.tgHdlRatio?.values?.[0];
  assert('TG/HDL is null when HDL is zero', tgHdlZero == null, `got ${tgHdlZero}`);

  // ═══════════════════════════════════════
  // Cleanup
  // ═══════════════════════════════════════
  state.importedData.entries = origEntries;
  state.profileSex = origSex;
  state.profileDob = origDob;
  state.unitSystem = origUnit;
  state.importedData.biometrics = origBio;

  // ═══════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════
console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
