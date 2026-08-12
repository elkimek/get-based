// @ts-check
// schema.js — Compatibility facade, unit conversions, pricing, optimal ranges

import { MARKER_SCHEMA } from './marker-schema.js';
import { SECONDARY_UNIT_CONVERSIONS } from './secondary-unit-conversions.js';
import { state } from './state.js';

export {
  CONTEXT_OPTIMAL_RANGES,
  CONTEXT_REFERENCE_RANGES,
  PHASE_RANGES,
  SBM_2015_THRESHOLDS,
  getEMFSeverity,
} from './schema-environment.js';

// ═══════════════════════════════════════════════
// MARKER SCHEMA COMPATIBILITY FACADE
// Keep consumers on ./schema.js while catalog concerns are separated safely.
// ═══════════════════════════════════════════════
export { MARKER_SCHEMA };
export {
  BUILTIN_MARKER_DOT_KEY_ALIASES,
  BUILTIN_MARKER_IDENTITIES,
  BUILTIN_MARKER_ID_ALIASES,
  CUSTOM_MARKER_ID_PREFIX,
  getBuiltinMarkerDotKey,
  getBuiltinMarkerId,
  isCustomMarkerId,
  resolveBuiltinMarkerDotKey,
} from './marker-schema.js';

// ═══════════════════════════════════════════════
// UNIT CONVERSIONS (EU SI → US conventional)
// ═══════════════════════════════════════════════
export const UNIT_CONVERSIONS = {
  'biochemistry.glucose': { factor: 18.018, usUnit: 'mg/dl', type: 'multiply' },
  'biochemistry.urea': { factor: 2.801, usUnit: 'mg/dl', type: 'multiply' },
  'biochemistry.creatinine': { factor: 0.01131, usUnit: 'mg/dl', type: 'multiply' },
  'biochemistry.uricAcid': { factor: 0.01681, usUnit: 'mg/dl', type: 'multiply' },
  'biochemistry.bilirubinTotal': { factor: 0.05848, usUnit: 'mg/dl', type: 'multiply' },
  'biochemistry.bilirubinDirect': { factor: 0.05848, usUnit: 'mg/dl', type: 'multiply' },
  'biochemistry.bilirubinIndirect': { factor: 0.05848, usUnit: 'mg/dl', type: 'multiply' },
  'biochemistry.ast': { factor: 60, usUnit: 'U/L', type: 'multiply' },
  'biochemistry.alt': { factor: 60, usUnit: 'U/L', type: 'multiply' },
  'biochemistry.alp': { factor: 60, usUnit: 'U/L', type: 'multiply' },
  'biochemistry.ggt': { factor: 60, usUnit: 'U/L', type: 'multiply' },
  'biochemistry.ldh': { factor: 60, usUnit: 'U/L', type: 'multiply' },
  'biochemistry.creatineKinase': { factor: 60, usUnit: 'U/L', type: 'multiply' },
  'biochemistry.amylase': { factor: 60, usUnit: 'U/L', type: 'multiply' },
  'biochemistry.lipase': { factor: 60, usUnit: 'U/L', type: 'multiply' },
  'biochemistry.egfr': { factor: 60, usUnit: 'mL/min/1.73m²', type: 'multiply' },
  'biochemistry.gfrCystatin': { factor: 60, usUnit: 'mL/min', type: 'multiply' },
  'biochemistry.cystatinC': { factor: 0.1, usUnit: 'mg/dl', type: 'multiply' },
  'proteins.hsCRP': { factor: 0.1, usUnit: 'mg/dl', type: 'multiply' },
  'proteins.crp': { factor: 0.1, usUnit: 'mg/dl', type: 'multiply' },
  'hormones.testosterone': { factor: 28.818, usUnit: 'ng/dl', type: 'multiply' },
  'hormones.bioactiveTestosterone': { factor: 28.818, usUnit: 'ng/dl', type: 'multiply' },
  'hormones.freeTestosterone': { factor: 0.2885, usUnit: 'pg/ml', type: 'multiply' },
  'hormones.estradiol': { factor: 0.2724, usUnit: 'pg/ml', type: 'multiply' },
  'hormones.progesterone': { factor: 0.3145, usUnit: 'ng/ml', type: 'multiply' },
  'hormones.dheaS': { factor: 36.87, usUnit: '\u00b5g/dl', type: 'multiply' },
  'hormones.dht': { factor: 28.818, usUnit: 'ng/dl', type: 'multiply' },
  'hormones.androstenedione': { factor: 28.64, usUnit: 'ng/dl', type: 'multiply' },
  'hormones.cortisol': { factor: 0.03625, usUnit: '\u00b5g/dl', type: 'multiply' },
  'hormones.acth': { factor: 4.541, usUnit: 'pg/ml', type: 'multiply' },
  'hormones.aldosterone': { factor: 0.03605, usUnit: 'ng/dl', type: 'multiply' },
  'hormones.amh': { factor: 0.14, usUnit: 'ng/ml', type: 'multiply' },
  'hormones.igf1': { factor: 1, usUnit: 'ng/ml', type: 'multiply' },
  'hormones.prolactin': { factor: 1, usUnit: 'ng/ml', type: 'multiply' },
  'hormones.pth': { factor: 9.43, usUnit: 'pg/ml', type: 'multiply' },
  'hormones.calcitonin': { factor: 1, usUnit: 'pg/ml', type: 'multiply' },
  'lipids.cholesterol': { factor: 38.67, usUnit: 'mg/dl', type: 'multiply' },
  'lipids.triglycerides': { factor: 88.57, usUnit: 'mg/dl', type: 'multiply' },
  'lipids.hdl': { factor: 38.67, usUnit: 'mg/dl', type: 'multiply' },
  'lipids.ldl': { factor: 38.67, usUnit: 'mg/dl', type: 'multiply' },
  'lipids.nonHdl': { factor: 38.67, usUnit: 'mg/dl', type: 'multiply' },
  'iron.iron': { factor: 5.585, usUnit: '\u00b5g/dl', type: 'multiply' },
  'iron.ferritin': { factor: 1, usUnit: 'ng/ml', type: 'multiply' },
  'iron.transferrin': { factor: 100, usUnit: 'mg/dl', type: 'multiply' },
  'iron.tibc': { factor: 5.585, usUnit: '\u00b5g/dl', type: 'multiply' },
  'vitamins.vitaminD': { factor: 0.4006, usUnit: 'ng/ml', type: 'multiply' },
  'vitamins.vitaminD3': { factor: 0.4006, usUnit: 'ng/ml', type: 'multiply' },
  'vitamins.calcitriol': { factor: 0.4167, usUnit: 'pg/ml', type: 'multiply' },
  'vitamins.vitaminA': { factor: 28.65, usUnit: '\u00b5g/dl', type: 'multiply' },
  'vitamins.vitaminB12': { factor: 1.355, usUnit: 'pg/ml', type: 'multiply' },
  'vitamins.activeB12': { factor: 1, usUnit: 'pmol/l', type: 'multiply' },
  'vitamins.folate': { factor: 0.4413, usUnit: 'ng/ml', type: 'multiply' },
  'vitamins.vitaminC': { factor: 0.017612, usUnit: 'mg/dl', type: 'multiply' },
  'vitamins.vitaminE': { factor: 0.043071, usUnit: 'mg/dl', type: 'multiply' },
  'diabetes.cPeptide': { factor: 1, usUnit: 'ng/ml', type: 'multiply' },
  'hematology.hemoglobin': { factor: 0.1, usUnit: 'g/dl', type: 'multiply' },
  // hematocrit: stored as % natively (was fraction before v1.6.1, migrated in profile.js)
  'hematology.mchc': { factor: 0.1, usUnit: 'g/dl', type: 'multiply' },
  'differential.neutrophilsPct': { factor: 100, usUnit: '%', type: 'multiply' },
  'differential.lymphocytesPct': { factor: 100, usUnit: '%', type: 'multiply' },
  'differential.monocytesPct': { factor: 100, usUnit: '%', type: 'multiply' },
  'differential.eosinophilsPct': { factor: 100, usUnit: '%', type: 'multiply' },
  'differential.basophilsPct': { factor: 100, usUnit: '%', type: 'multiply' },
  'boneMetabolism.osteocalcin': { factor: 1, usUnit: 'ng/ml', type: 'multiply' },
  'boneMetabolism.p1np': { factor: 1, usUnit: 'ng/ml', type: 'multiply' },
  'boneMetabolism.ctx': { factor: 1, usUnit: 'pg/ml', type: 'multiply' },
  'tumorMarkers.psa': { factor: 1, usUnit: 'ng/ml', type: 'multiply' },
  'tumorMarkers.afp': { factor: 1.21, usUnit: 'ng/ml', type: 'multiply' },
  'electrolytes.calciumTotal': { factor: 4.008, usUnit: 'mg/dl', type: 'multiply' },
  'electrolytes.calciumIonized': { factor: 4.008, usUnit: 'mg/dl', type: 'multiply' },
  'electrolytes.phosphorus': { factor: 3.097, usUnit: 'mg/dl', type: 'multiply' },
  'electrolytes.magnesium': { factor: 2.431, usUnit: 'mg/dl', type: 'multiply' },
  'electrolytes.magnesiumRBC': { factor: 2.431, usUnit: 'mg/dl', type: 'multiply' },
  'electrolytes.copper': { factor: 6.355, usUnit: '\u00b5g/dl', type: 'multiply' },
  'electrolytes.zinc': { factor: 6.54, usUnit: '\u00b5g/dl', type: 'multiply' },
  'electrolytes.selenium': { factor: 7.8971, usUnit: '\u00b5g/dl', type: 'multiply' },
  'proteins.totalProtein': { factor: 0.1, usUnit: 'g/dl', type: 'multiply' },
  'proteins.albumin': { factor: 0.1, usUnit: 'g/dl', type: 'multiply' },
  'proteins.globulin': { factor: 0.1, usUnit: 'g/dl', type: 'multiply' },
  'proteins.ceruloplasmin': { factor: 100, usUnit: 'mg/dl', type: 'multiply' },
  'lipids.apoB': { factor: 100, usUnit: 'mg/dl', type: 'multiply' },
  'lipids.apoAI': { factor: 100, usUnit: 'mg/dl', type: 'multiply' },
  'lipids.lpA': { factor: 1, usUnit: 'nmol/l', type: 'multiply' },
  'thyroid.ft4': { factor: 0.07769, usUnit: 'ng/dl', type: 'multiply' },
  'thyroid.ft3': { factor: 0.6513, usUnit: 'pg/ml', type: 'multiply' },
  'thyroid.t4total': { factor: 0.07769, usUnit: '\u00b5g/dl', type: 'multiply' },
  'thyroid.t3total': { factor: 0.6513, usUnit: 'ng/dl', type: 'multiply' },
  'thyroid.thyroglobulin': { factor: 1, usUnit: 'ng/ml', type: 'multiply' },
  'diabetes.hba1c': { type: 'hba1c' },
  'calculatedRatios.tgHdlRatio': { factor: 2.29, usUnit: '', type: 'multiply' },
  'calculatedRatios.ft3ft4Ratio': { factor: 8.3833, usUnit: '', type: 'multiply' },
  'bodyComposition.leanMass': { factor: 2.20462, usUnit: 'lbs', type: 'multiply' },
  'bodyComposition.fatMass': { factor: 2.20462, usUnit: 'lbs', type: 'multiply' },
  'urinalysis.albuminCreatinineRatio': { factor: 8.84, usUnit: 'mg/g', type: 'multiply' },
  'urinalysis.proteinCreatinineRatio': { factor: 8.84, usUnit: 'mg/g', type: 'multiply' },
  'urinalysis.albumin': { factor: 0.1, usUnit: 'mg/dl', type: 'multiply' },
  'urinalysis.creatinine': { factor: 11.312, usUnit: 'mg/dl', type: 'multiply' },
  'urinalysis.totalProtein': { factor: 100, usUnit: 'mg/dl', type: 'multiply' },
  // ── Label-only US conventions (factor: 1) ─────────────────────────────────
  // These markers have *identical numerical values* in EU SI and US conventional
  // units — only the printed label on a US lab report differs. We still expose
  // them so a US user reading e.g. a Quest panel can match "5 µIU/mL" to the
  // app's "5 mU/L" without second-guessing. NOT included: truly universal labels
  // (homocysteine µmol/L, MCV fL, hematocrit %) or labels that match exactly
  // (SHBG nmol/L).
  'diabetes.insulin':         { factor: 1, usUnit: 'µIU/mL',  type: 'multiply' },
  'thyroid.tsh':              { factor: 1, usUnit: 'µIU/mL',  type: 'multiply' },
  'hormones.lh':              { factor: 1, usUnit: 'mIU/mL',       type: 'multiply' },
  'hormones.fsh':             { factor: 1, usUnit: 'mIU/mL',       type: 'multiply' },
  'electrolytes.sodium':      { factor: 1, usUnit: 'mEq/L',        type: 'multiply' },
  'electrolytes.potassium':   { factor: 1, usUnit: 'mEq/L',        type: 'multiply' },
  'electrolytes.chloride':    { factor: 1, usUnit: 'mEq/L',        type: 'multiply' },
  'hematology.wbc':           { factor: 1, usUnit: 'K/µL',    type: 'multiply' },
  'hematology.rbc':           { factor: 1, usUnit: 'M/µL',    type: 'multiply' },
  'hematology.platelets':     { factor: 1, usUnit: 'K/µL',    type: 'multiply' },
  'differential.neutrophils': { factor: 1, usUnit: 'K/µL',    type: 'multiply' },
  'differential.lymphocytes': { factor: 1, usUnit: 'K/µL',    type: 'multiply' },
  'differential.monocytes':   { factor: 1, usUnit: 'K/µL',    type: 'multiply' },
  'differential.eosinophils': { factor: 1, usUnit: 'K/µL',    type: 'multiply' },
  'differential.basophils':   { factor: 1, usUnit: 'K/µL',    type: 'multiply' },
  'tumorMarkers.cea':         { factor: 1, usUnit: 'ng/mL',   type: 'multiply' },
  'tumorMarkers.ca125':       { factor: 1, usUnit: 'U/mL',    type: 'multiply' },
  'tumorMarkers.ca199':       { factor: 1, usUnit: 'U/mL',    type: 'multiply' },
  'tumorMarkers.ca153':       { factor: 1, usUnit: 'U/mL',    type: 'multiply' },
  'cardiac.hsTroponinT':      { factor: 1, usUnit: 'pg/mL',   type: 'multiply' },
  'cardiac.hsTroponinI':      { factor: 1, usUnit: 'pg/mL',   type: 'multiply' },
  'cardiac.bnp':              { factor: 1, usUnit: 'pg/mL',   type: 'multiply' },
  'cardiac.ntProBnp':         { factor: 1, usUnit: 'pg/mL',   type: 'multiply' }
};

export { SECONDARY_UNIT_CONVERSIONS };

/** Normalize clinical unit spellings for import and migration comparisons. @param {unknown} unit */
export function normalizeClinicalUnit(unit) {
  return String(unit || '')
    .normalize('NFKC').toLowerCase().replace(/\s/g, '')
    .replace(/[\u00b5\u03bc]/g, 'u')
    .replace(/^mcg/, 'ug').replace(/^iu\//, 'u/')
    .replace(/^ug\/l$/, 'ng/ml');
}

function isPercentClinicalUnit(unit) {
  const normalized = normalizeClinicalUnit(unit);
  return ['%', 'pct', 'percent', 'percentage'].includes(normalized);
}

function isFractionStoredPercentMarker(key) {
  const [catKey, markerKey] = String(key || '').split('.');
  const marker = /** @type {{unit?: string, refMax?: number} | undefined} */ (
    MARKER_SCHEMA[catKey]?.markers?.[markerKey]
  );
  const conversion = UNIT_CONVERSIONS[key];
  return !!marker && (marker.unit || '') === '' && marker.refMax != null && marker.refMax <= 1
    && conversion?.type === 'multiply'
    && conversion.factor === 100 && isPercentClinicalUnit(conversion.usUnit);
}

function normalizeFractionStoredPercentValue(
  key,
  value,
  unit,
  context = /** @type {Record<string, any> | null} */ (null),
) {
  if (!isFractionStoredPercentMarker(key) || !isPercentClinicalUnit(unit)) return null;
  const [catKey, markerKey] = String(key || '').split('.');
  const schemaRefMax = Number(MARKER_SCHEMA[catKey]?.markers?.[markerKey]?.refMax);
  const reportRefMax = Number(context?.refMax);
  const hasWholePercentRange = reportRefMax > 1 && reportRefMax > schemaRefMax
    && !(Number.isFinite(schemaRefMax) && value <= schemaRefMax);
  const siValue = value > 1 || hasWholePercentRange ? value / 100 : value;
  return parseFloat(siValue.toPrecision(6));
}

/**
 * Convert an imported or legacy marker value to the schema's canonical SI unit.
 * @param {string} key
 * @param {any} value
 * @param {unknown} unit
 * @param {Record<string, any> | null} [context]
 */
export function normalizeToSI(key, value, unit, context = null) {
  if (value == null || isNaN(value)) return null;
  // Hematocrit: schema stores as % (40–50) but some labs report as fraction l/l (0.40–0.50).
  if (key === 'hematology.hematocrit' && value < 1.5) return parseFloat((value * 100).toFixed(1));
  if (context?.ratioUnitConvention === 'si') return value;
  if (context?.ratioUnitConvention === 'conventional') {
    const ratioConversion = UNIT_CONVERSIONS[key];
    if (ratioConversion?.type === 'multiply') {
      return parseFloat((value / ratioConversion.factor).toPrecision(6));
    }
  }
  if (unit) {
    const normalizedUnit = normalizeClinicalUnit(unit);
    const fractionPercentValue = normalizeFractionStoredPercentValue(key, value, normalizedUnit, context);
    if (fractionPercentValue != null) return fractionPercentValue;
    const primaryConversion = UNIT_CONVERSIONS[key];
    if (
      primaryConversion?.type === 'multiply'
      && normalizedUnit === normalizeClinicalUnit(primaryConversion.usUnit)
    ) {
      return parseFloat((value / primaryConversion.factor).toPrecision(6));
    }
    if (primaryConversion?.type === 'hba1c' && normalizedUnit === '%') {
      return parseFloat(((value - 2.15) * 10.929).toFixed(1));
    }
    for (const conversion of SECONDARY_UNIT_CONVERSIONS[key] || []) {
      if (normalizedUnit !== normalizeClinicalUnit(conversion.unit)) continue;
      if (conversion.type === 'multiply') {
        return parseFloat((value / conversion.factor).toPrecision(6));
      }
      if (conversion.type === 'hba1c') return parseFloat(((value - 2.15) * 10.929).toFixed(1));
    }
    return value;
  }
  const fallbackConversion = UNIT_CONVERSIONS[key];
  if (fallbackConversion?.type === 'multiply' && fallbackConversion.factor > 1) {
    const [catKey, markerKey] = key.split('.');
    const marker = MARKER_SCHEMA[catKey]?.markers?.[markerKey];
    if (marker?.refMax != null && value > marker.refMax * fallbackConversion.factor * 0.3) {
      return parseFloat((value / fallbackConversion.factor).toPrecision(6));
    }
  }
  return value;
}

// Returns the converted {value, unit} in the *other* unit system for dual-display,
// or null when no conversion exists. `displayValue` is what the user currently sees
// (state.unitSystem-dependent); `isUSMode` is the current display mode flag.
export function getAlternateUnit(dotKey, displayValue, isUSMode) {
  const conv = UNIT_CONVERSIONS[dotKey];
  if (!conv || displayValue == null || !Number.isFinite(displayValue)) return null;
  const dot = dotKey.indexOf('.');
  if (dot < 0) return null;
  const cat = dotKey.slice(0, dot), mkr = dotKey.slice(dot + 1);
  const siUnit = MARKER_SCHEMA[cat]?.markers?.[mkr]?.unit;
  if (!siUnit) return null;
  if (isUSMode) {
    if (conv.type === 'multiply') {
      return { value: parseFloat((displayValue / conv.factor).toPrecision(4)), unit: siUnit };
    }
    if (conv.type === 'hba1c') {
      return { value: parseFloat(((displayValue - 2.15) * 10.929).toFixed(1)), unit: 'mmol/mol' };
    }
  } else {
    if (conv.type === 'multiply') {
      return { value: parseFloat((displayValue * conv.factor).toPrecision(4)), unit: conv.usUnit };
    }
    if (conv.type === 'hba1c') {
      return { value: parseFloat(((displayValue / 10.929) + 2.15).toFixed(1)), unit: '%' };
    }
  }
  return null;
}

// Convert a value the user typed in `inputUnit` to canonical SI for storage.
// Used by manual-entry's per-field unit picker. Handles the SI unit, the primary
// US-conventional unit (UNIT_CONVERSIONS), and any secondary clinical unit
// (SECONDARY_UNIT_CONVERSIONS, e.g. mg/L for Lp(a) or g/L for cholesterol).
export function convertUserInputToSI(dotKey, value, inputUnit) {
  if (!Number.isFinite(value)) return value;
  const dot = dotKey.indexOf('.');
  if (dot < 0) return value;
  const cat = dotKey.slice(0, dot), mkr = dotKey.slice(dot + 1);
  const siUnit = MARKER_SCHEMA[cat]?.markers?.[mkr]?.unit;
  // SI input (or no unit chosen) is already canonical.
  if (!inputUnit || inputUnit === siUnit) return value;
  const conv = UNIT_CONVERSIONS[dotKey];
  if (conv) {
    if (conv.type === 'multiply' && inputUnit === conv.usUnit) return parseFloat((value / conv.factor).toPrecision(6));
    if (conv.type === 'hba1c' && inputUnit === '%') return parseFloat(((value - 2.15) * 10.929).toFixed(1));
  }
  const secondaries = SECONDARY_UNIT_CONVERSIONS[dotKey];
  if (secondaries) {
    for (const sec of secondaries) {
      if (sec.type === 'multiply' && inputUnit === sec.unit) return parseFloat((value / sec.factor).toPrecision(6));
      if (sec.type === 'hba1c' && inputUnit === sec.unit) return parseFloat(((value - 2.15) * 10.929).toFixed(1));
    }
  }
  return value; // unrecognized unit — store as typed rather than guessing
}

// Inverse of convertUserInputToSI: express a canonical-SI value in `targetUnit`
// (SI / primary US / secondary clinical). Used by manual entry's range sanity
// check so the "did you mean?" warning compares in the unit the user is typing.
export function convertSIToInputUnit(dotKey, siValue, targetUnit) {
  if (!Number.isFinite(siValue)) return siValue;
  const dot = dotKey.indexOf('.');
  if (dot < 0) return siValue;
  const cat = dotKey.slice(0, dot), mkr = dotKey.slice(dot + 1);
  const siUnit = MARKER_SCHEMA[cat]?.markers?.[mkr]?.unit;
  if (!targetUnit || targetUnit === siUnit) return siValue;
  const conv = UNIT_CONVERSIONS[dotKey];
  if (conv) {
    if (conv.type === 'multiply' && targetUnit === conv.usUnit) return parseFloat((siValue * conv.factor).toPrecision(6));
    if (conv.type === 'hba1c' && targetUnit === '%') return parseFloat(((siValue / 10.929) + 2.15).toFixed(1));
  }
  const secondaries = SECONDARY_UNIT_CONVERSIONS[dotKey];
  if (secondaries) {
    for (const sec of secondaries) {
      if (sec.type === 'multiply' && targetUnit === sec.unit) return parseFloat((siValue * sec.factor).toPrecision(6));
      if (sec.type === 'hba1c' && targetUnit === sec.unit) return parseFloat(((siValue / 10.929) + 2.15).toFixed(1));
    }
  }
  return siValue;
}

// ═══════════════════════════════════════════════
// CORRELATION PRESETS
// ═══════════════════════════════════════════════
export const CORRELATION_PRESETS = [
  { label: "Testosterone vs SHBG", markers: ["hormones.testosterone", "hormones.shbg"] },
  { label: "LDL vs hs-CRP", markers: ["lipids.ldl", "proteins.hsCRP"] },
  { label: "HbA1c vs Insulin vs HOMA-IR", markers: ["diabetes.hba1c", "diabetes.insulin", "diabetes.homaIR"] },
  { label: "Liver Enzymes", markers: ["biochemistry.ast", "biochemistry.alt", "biochemistry.alp", "biochemistry.ggt"] },
  { label: "Iron Panel", markers: ["iron.iron", "iron.ferritin", "iron.transferrin"] },
  { label: "Lipid Panel", markers: ["lipids.cholesterol", "lipids.hdl", "lipids.ldl", "lipids.triglycerides"] },
  { label: "Vitamin D vs Calcium", markers: ["vitamins.vitaminD", "electrolytes.calciumTotal"] },
  { label: "TSH vs T3 vs T4", markers: ["thyroid.tsh", "thyroid.ft3", "thyroid.ft4"] },
  { label: "LH vs FSH vs Estradiol", markers: ["hormones.lh", "hormones.fsh", "hormones.estradiol"] }
];
export const CHIP_COLORS = ['#4f8cff','#34d399','#f87171','#fbbf24','#a78bfa','#f472b6','#38bdf8','#fb923c'];

// NOTE: The marker data that was previously inline here (194 entries for OAT + Fatty Acids)
// now lives in js/adapters.js as part of the parser adapter registry.

// ── Model pricing ($/M tokens) ──
export const MODEL_PRICING = {
  venice: {
    'claude-opus-4-6':      { input: 6.00,  output: 30.00 },
    'claude-opus-4-5':      { input: 6.00,  output: 30.00 },
    'claude-sonnet-4-6':    { input: 3.60,  output: 18.00 },
    'claude-sonnet-4-5':    { input: 3.75,  output: 18.75 },
    'openai-gpt-54':        { input: 3.13,  output: 18.80 },
    'openai-gpt-52':        { input: 2.19,  output: 17.50 },
    'gemini-3-pro':         { input: 2.50,  output: 15.00 },
    'gemini-3-1-pro':       { input: 2.50,  output: 15.00 },
    'grok-4-20':            { input: 2.50,  output: 7.50  },
    'hermes-3-llama-3.1-405b': { input: 1.10, output: 3.00 },
    'glm-5':                { input: 1.00,  output: 3.20  },
    'qwen3-coder':          { input: 0.75,  output: 3.00  },
    'kimi-k2':              { input: 0.56,  output: 3.50  },
    'llama-3.3-70b':        { input: 0.70,  output: 2.80  },
    'gemini-3-flash':       { input: 0.70,  output: 3.75  },
    'glm-4':                { input: 0.55,  output: 2.65  },
    'minimax':              { input: 0.35,  output: 1.50  },
    'deepseek-v3':          { input: 0.33,  output: 0.48  },
    'qwen3-next':           { input: 0.35,  output: 1.90  },
    'grok-code':            { input: 0.25,  output: 1.87  },
    'grok-41-fast':         { input: 0.25,  output: 0.63  },
    'qwen3-vl':             { input: 0.25,  output: 1.50  },
    'venice-uncensored':    { input: 0.20,  output: 0.90  },
    'qwen3-235b':           { input: 0.15,  output: 0.75  },
    'llama-3.2':            { input: 0.15,  output: 0.60  },
    'google-gemma':         { input: 0.12,  output: 0.20  },
    'qwen3-5-9b':           { input: 0.05,  output: 0.15  },
    'openai-gpt-oss':       { input: 0.07,  output: 0.30  },
    '_default':             { input: 0.50,  output: 2.00, approx: true },
  },
  openrouter: {
    '_default':  { input: 1.00,  output: 3.00, approx: true },
  },
  ppq: {
    '_default':  { input: 1.00,  output: 3.00, approx: true },
  },
  routstr: {
    '_default':  { input: 1.00,  output: 5.00, approx: true },
  },
  custom: {},
};
export function getModelPricing(provider, modelId) {
  // OpenRouter/Routstr: check dynamic API-sourced pricing first
  if ((provider === 'openrouter' || provider === 'routstr' || provider === 'ppq' || provider === 'venice') && modelId) {
    const cacheKey = provider === 'ppq' ? 'labcharts-ppq-pricing' : provider === 'venice' ? 'labcharts-venice-pricing' : provider === 'routstr' ? 'labcharts-routstr-pricing' : 'labcharts-openrouter-pricing';
    const cached = JSON.parse(localStorage.getItem(cacheKey) || '{}');
    if (cached[modelId]) return cached[modelId];
  }
  if (!MODEL_PRICING[provider]) return { input: 0, output: 0 };
  const table = MODEL_PRICING[provider];
  const stripped = (modelId || '').replace(/-\d{8}$/, '');
  if (table[stripped]) return table[stripped];
  const prefix = Object.keys(table).filter(k => k !== '_default' && stripped.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  if (prefix) return table[prefix];
  const fallback = table['_default'] || { input: 0, output: 0 };
  return { ...fallback, approx: true };
}
export function calculateCost(provider, modelId, inputTokens, outputTokens) {
  if (provider === 'custom') return -1;
  const p = getModelPricing(provider, modelId);
  return (p.input * (inputTokens || 0) + p.output * (outputTokens || 0)) / 1_000_000;
}
export function formatCost(usd) {
  if (usd < 0) return 'N/A';
  if (usd === 0) return 'Free';
  if (usd < 0.0001) return '<$0.0001';
  if (usd < 0.01) return '$' + usd.toFixed(4);
  return '$' + usd.toFixed(3);
}

// ── AI Usage Tracking ──────────────────────────────
const _emptyUsage = () => ({ totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, requestCount: 0 });

export function trackUsage(provider, modelId, inputTokens, outputTokens) {
  try {
    const cost = calculateCost(provider, modelId, inputTokens || 0, outputTokens || 0);
    const inp = inputTokens || 0, out = outputTokens || 0;
    if (inp === 0 && out === 0) return;

    // Per-profile
    const pid = state.currentProfile || 'default';
    const pKey = `labcharts-${pid}-usage`;
    const pu = JSON.parse(localStorage.getItem(pKey) || 'null') || _emptyUsage();
    pu.totalCost += cost; pu.totalInputTokens += inp; pu.totalOutputTokens += out; pu.requestCount++;
    localStorage.setItem(pKey, JSON.stringify(pu));

    // Global
    const gu = JSON.parse(localStorage.getItem('labcharts-global-usage') || 'null') || _emptyUsage();
    gu.totalCost += cost; gu.totalInputTokens += inp; gu.totalOutputTokens += out; gu.requestCount++;
    localStorage.setItem('labcharts-global-usage', JSON.stringify(gu));
  } catch(e) { /* usage tracking is non-critical — never break chat/import */ }
}

export function getProfileUsage(profileId) {
  return JSON.parse(localStorage.getItem(`labcharts-${profileId || 'default'}-usage`) || 'null') || _emptyUsage();
}

export function getGlobalUsage() {
  return JSON.parse(localStorage.getItem('labcharts-global-usage') || 'null') || _emptyUsage();
}

export function resetProfileUsage(profileId) {
  localStorage.removeItem(`labcharts-${profileId || 'default'}-usage`);
}

// Optimal ranges are curated lower-risk, target, or nutritional-adequacy bands
// for the optional wellness view; they are not laboratory reference intervals.
// A marker without a defensible entry intentionally falls back to its reference
// interval in getEffectiveRange(). Markers with rangePolicy: "guidance" use a
// representative population or risk band rather than claiming a lab interval;
// "contextual" markers have no honest universal static interval.
// Sources: CKD Prognosis Consortium, ASH/Blood 2015, Harris & von Schacky 2004,
// Lancet non-HDL pooled analysis, PMC8844108 (IGF-1), PMC10324141 (sodium),
// PMC10866328 (thyroid/CVD), PMC11078084 (albumin), Gilbert syndrome studies.
export const OPTIMAL_RANGES = {
  // Biochemistry
  'biochemistry.glucose': { optimalMin: 4.0, optimalMax: 5.0 },
  'biochemistry.urea': { optimalMin: 4.6, optimalMax: 6.4 },
  'biochemistry.creatinine': { optimalMin: 75, optimalMax: 97, optimalMin_f: 57, optimalMax_f: 80 },
  'biochemistry.egfr': { optimalMin: 1.50, optimalMax: 2.30 },
  'biochemistry.bilirubinTotal': { optimalMin: 8.0, optimalMax: 17.0 },
  'biochemistry.ast': { optimalMin: 0.17, optimalMax: 0.58 },
  'biochemistry.alt': { optimalMin: 0.17, optimalMax: 0.42 },
  'biochemistry.alp': { optimalMin: 0.67, optimalMax: 1.67 },
  'biochemistry.ggt': { optimalMin: 0.17, optimalMax: 0.42 },
  'biochemistry.ldh': { optimalMin: 2.25, optimalMax: 3.00 },
  'biochemistry.uricAcid': { optimalMin: 200, optimalMax: 350 },
  'biochemistry.cystatinC': { optimalMin: 0.61, optimalMax: 0.82 },
  'biochemistry.gfrCystatin': { optimalMin: 1.50, optimalMax: null },
  // General-population NHANES lower-risk stratum; PMCID PMC9125743.
  'biochemistry.bicarbonate': { optimalMin: 22, optimalMax: 26 },
  // Hormones
  // General adult wellness fallback. Men aged 70–89 use the dated,
  // observational 9.8–15.8 nmol/L cohort band from CONTEXT_OPTIMAL_RANGES.
  'hormones.testosterone': { optimalMin: 15.0, optimalMax: 25.0, optimalMin_f: 0.5, optimalMax_f: 1.2 },
  'hormones.freeTestosterone': { optimalMin: 70, optimalMax: 130, optimalMin_f: 2.0, optimalMax_f: 7.0 },
  // Do not apply male-oriented SHBG/estradiol wellness bands to women.
  'hormones.shbg': { optimalMin: 20.0, optimalMax: 40.0, optimalMin_f: null, optimalMax_f: null },
  'hormones.estradiol': { optimalMin: 70, optimalMax: 130, optimalMin_f: null, optimalMax_f: null },
  'hormones.igf1': { optimalMin: 120, optimalMax: 160 },
  'hormones.prolactin': { optimalMin: 4.0, optimalMax: 12.0, optimalMin_f: 4.8, optimalMax_f: 18.0 },
  // Electrolytes & Minerals
  'electrolytes.sodium': { optimalMin: 139, optimalMax: 142 },
  'electrolytes.potassium': { optimalMin: 4.0, optimalMax: 4.5 },
  'electrolytes.calciumTotal': { optimalMin: 2.20, optimalMax: 2.40 },
  'electrolytes.magnesium': { optimalMin: 0.85, optimalMax: 0.95 },
  'electrolytes.phosphorus': { optimalMin: 0.90, optimalMax: 1.30 },
  'electrolytes.chloride': { optimalMin: 100, optimalMax: 106 },
  'electrolytes.magnesiumRBC': { optimalMin: 2.00, optimalMax: 2.40 },
  'electrolytes.copper': { optimalMin: 12.6, optimalMax: 18.9 },
  // NIH ODS considers serum/plasma Se >=80 µg/L (1.01 µmol/L) sufficient
  // for selenoprotein synthesis. The upper edge remains the schema lab bound,
  // not a supplementation target.
  'electrolytes.selenium': { optimalMin: 1.01, optimalMax: 1.65 },
  // Iron
  'iron.iron': { optimalMin: 12.0, optimalMax: 25.0 },
  'iron.ferritin': { optimalMin: 40, optimalMax: 200 },
  'iron.transferrinSat': { optimalMin: 25.0, optimalMax: 35.0 },
  'iron.transferrin': { optimalMin: 2.2, optimalMax: 3.2 },
  'iron.tibc': { optimalMin: 45.0, optimalMax: 61.0 },
  'iron.solubleTransferrinReceptor': { optimalMin: 0.8, optimalMax: 1.4 },
  // Lipids
  'lipids.cholesterol': { optimalMin: 3.9, optimalMax: 5.2 },
  'lipids.triglycerides': { optimalMin: 0.45, optimalMax: 1.00 },
  'lipids.hdl': { optimalMin: 1.50, optimalMax: 2.10 },
  'lipids.ldl': { optimalMin: 1.20, optimalMax: 2.60 },
  'lipids.nonHdl': { optimalMin: 1.80, optimalMax: 2.60 },
  'lipids.apoB': { optimalMin: 0.40, optimalMax: 0.70 },
  'lipids.apoAI': { optimalMin: 1.40, optimalMax: 1.70 },
  'lipids.lpA': { optimalMin: 0, optimalMax: 75 },
  // Proteins & Inflammation
  'proteins.hsCRP': { optimalMin: 0.00, optimalMax: 0.50 },
  'proteins.crp': { optimalMin: 0.00, optimalMax: 1.00 },
  'proteins.totalProtein': { optimalMin: 69.0, optimalMax: 74.0 },
  'proteins.albumin': { optimalMin: 42.0, optimalMax: 50.0 },
  'proteins.ceruloplasmin': { optimalMin: 0.20, optimalMax: 0.30 },
  // Thyroid
  'thyroid.tsh': { optimalMin: 1.0, optimalMax: 2.5 },
  'thyroid.ft3': { optimalMin: 4.6, optimalMax: 6.0 },
  'thyroid.ft4': { optimalMin: 14.0, optimalMax: 17.0 },
  'thyroid.reverseT3': { optimalMin: 0, optimalMax: 0.32 },
  'thyroid.tpoAb': { optimalMin: 0, optimalMax: 9 },
  'thyroid.tgAb': { optimalMin: 0, optimalMax: 18 },
  // Vitamins
  'vitamins.vitaminD': { optimalMin: 100.0, optimalMax: 200.0 },
  'vitamins.calcitriol': { optimalMin: 60.0, optimalMax: 160.0 },
  'vitamins.vitaminA': { optimalMin: 1.40, optimalMax: 2.10 },
  'vitamins.vitaminB12': { optimalMin: 300, optimalMax: 500 },
  'vitamins.activeB12': { optimalMin: 70, optimalMax: 160 },
  'vitamins.methylmalonicAcid': { optimalMin: 0, optimalMax: 270 },
  'vitamins.folate': { optimalMin: 14.0, optimalMax: 36.0 },
  // EFSA adequacy threshold for plasma PLP is 30 nmol/L (DOI
  // 10.2903/j.efsa.2016.4485). The upper edge remains the lab reference bound.
  'vitamins.vitaminB6': { optimalMin: 30, optimalMax: 125 },
  // Plasma ascorbate >=50 µmol/L is considered adequate; intervention data
  // show saturation around 65-80 µmol/L (PMCID PMC4924182, PMC7071312).
  // A value above saturation is not inherently adverse, so retain the lab max.
  'vitamins.vitaminC': { optimalMin: 50, optimalMax: 114 },
  // Diabetes
  'diabetes.hba1c': { optimalMin: 20.0, optimalMax: 36.0 },
  'diabetes.insulin': { optimalMin: 2.6, optimalMax: 10.0 },
  'diabetes.homaIR': { optimalMin: 0, optimalMax: 1.5 },
  'diabetes.cPeptide': { optimalMin: 0.8, optimalMax: 2.5 },
  'diabetes.fructosamine': { optimalMin: 205, optimalMax: 250 },
  // Hematology
  'hematology.wbc': { optimalMin: 5.0, optimalMax: 7.0 },
  'hematology.rbc': { optimalMin: 4.4, optimalMax: 5.0, optimalMin_f: 4.0, optimalMax_f: 4.5 },
  'hematology.hemoglobin': { optimalMin: 140, optimalMax: 170, optimalMin_f: 125, optimalMax_f: 155 },
  'hematology.hematocrit': { optimalMin: 42.0, optimalMax: 48.0, optimalMin_f: 37.0, optimalMax_f: 43.0 },
  'hematology.mcv': { optimalMin: 85.0, optimalMax: 92.0 },
  'hematology.mch': { optimalMin: 29.0, optimalMax: 32.0 },
  'hematology.rdwcv': { optimalMin: 11.5, optimalMax: 13.0 },
  'hematology.platelets': { optimalMin: 200, optimalMax: 300 },
  // WBC Differential
  'differential.neutrophils': { optimalMin: 2.0, optimalMax: 4.0 },
  'differential.lymphocytes': { optimalMin: 1.5, optimalMax: 3.0 },
  'differential.monocytes': { optimalMin: 0.20, optimalMax: 0.80 },
  'differential.eosinophils': { optimalMin: 0, optimalMax: 0.30 },
  'differential.basophils': { optimalMin: 0, optimalMax: 0.10 },
  // Coagulation
  'coagulation.homocysteine': { optimalMin: 5.0, optimalMax: 8.0 },
  'coagulation.fibrinogen': { optimalMin: 2.0, optimalMax: 3.2 },
  'coagulation.dDimer': { optimalMin: 0, optimalMax: 0.25 },
  // Body Composition
  'bodyComposition.bodyFatPct': { optimalMin: 8, optimalMax: 19, optimalMin_f: 18, optimalMax_f: 25 },
  'bodyComposition.bmiDexa': { optimalMin: 20.0, optimalMax: 23.0 },
  'bodyComposition.agRatio': { optimalMin: 0.4, optimalMax: 0.8 },
  'bodyComposition.visceralFatArea': { optimalMin: 0, optimalMax: 65 },
  // Bone Density
  'boneDensity.tScoreSpine': { optimalMin: 0, optimalMax: null },
  'boneDensity.tScoreFemurTotal': { optimalMin: 0, optimalMax: null },
  'boneDensity.tScoreFemurNeck': { optimalMin: 0, optimalMax: null },
  'boneDensity.zScoreSpine': { optimalMin: 0, optimalMax: null },
  'boneDensity.zScoreFemurTotal': { optimalMin: 0, optimalMax: null },
  'boneDensity.zScoreFemurNeck': { optimalMin: 0, optimalMax: null },
  // Specialty adapters — only where a static lower-risk/target band is defensible.
  // Fatty-acid and stool assays remain product-specific; these entries cover the
  // few widely-used targets rather than pretending every OAT/stool marker has a
  // universal “optimal” range.
  'fattyAcids.omega3Index': { optimalMin: 8, optimalMax: 12 },
  'fattyAcids.omega6to3Ratio': { optimalMin: 1, optimalMax: 4 },
  'fattyAcids.aaEpaRatio': { optimalMin: 1.5, optimalMax: 3.0 },
  'fattyAcids.dhaC22_6': { optimalMin: 4.0, optimalMax: 4.64 },
  'fattyAcids.epaC20_5': { optimalMin: 3.5, optimalMax: 4.72 },
  'stool.calprotectin': { optimalMin: 0, optimalMax: 50 },
  'stool.secretoryIgA': { optimalMin: 510, optimalMax: 2040 },
  'stool.zonulin': { optimalMin: 0, optimalMax: 30 },
  'nutrientElements.selenium': { optimalMin: 60, optimalMax: 200 },
  // Calculated Ratios
  // Calculated ratio targets. Conservative target-fit bands based on common
  // cardiometabolic/inflammatory cut-points: ApoB/ApoA-I and TG/HDL lower-is-better,
  // TC/HDL <3.5 as a favorable cholesterol balance, NLR 1.0–2.5 as a low-inflammatory
  // adult zone, BUN/Cr 10–16 as a hydration/renal-context sweet spot.
  'calculatedRatios.tgHdlRatio': { optimalMin: 0, optimalMax: 0.87 },
  'calculatedRatios.apoBapoAIRatio': { optimalMin: 0, optimalMax: 0.60, optimalMax_f: 0.50 },
  'calculatedRatios.cholHdlRatio': { optimalMin: 0, optimalMax: 3.5 },
  'calculatedRatios.nlr': { optimalMin: 1.0, optimalMax: 2.5 },
  'calculatedRatios.deRitisRatio': { optimalMin: 0.8, optimalMax: 1.1 },
  'calculatedRatios.bunCreatRatio': { optimalMin: 10, optimalMax: 16 },
  'calculatedRatios.atherogenicIndexPlasma': { optimalMin: null, optimalMax: 0.11 },
  'calculatedRatios.ft3ft4Ratio': { optimalMin: 0.286, optimalMax: 0.322 },
  // Lower-half population band in a longitudinal cohort using hs-CRP mg/L
  // divided by HDL-C mg/dL; DOI 10.3389/fnut.2025.1580904.
  'calculatedRatios.crpHdlRatio': { optimalMin: 0, optimalMax: 0.02 },
  // Dose-response diabetes risk becomes steeper above 8.6 (PMID 34086260).
  // A known non-fasting sample suppresses this band in data.js.
  'calculatedRatios.tygIndex': { optimalMin: null, optimalMax: 8.6 },
};
