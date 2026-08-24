// @ts-check
// unit-profiles.js — complete marker display-unit profiles over canonical storage

import {
  MARKER_SCHEMA,
  SECONDARY_UNIT_CONVERSIONS,
  UNIT_CONVERSIONS,
  convertSIToInputUnit,
  convertUserInputToSI,
} from './schema.js';

export const UNIT_PROFILE_IDS = Object.freeze(['EU', 'ANZ', 'US']);

export const UNIT_PROFILE_LABELS = Object.freeze({
  EU: 'International (SI)',
  ANZ: 'Australia / New Zealand',
  US: 'US (conventional)',
});

const RCPA_CHEMICAL_PATHOLOGY_SOURCE = 'RCPA SPIA Chemical Pathology RS v4.0 / Preferred Units v1.3';
const RCPA_ENDOCRINE_SOURCE = 'RCPA Harmonisation of Endocrine Dynamic Testing (adult) v1.9';

/**
 * ANZ overrides are differences from the canonical schema unit. Markers not
 * listed here still resolve explicitly through the identity fallback, which is
 * schema-audited for every built-in marker.
 *
 * Factor convention: display value = canonical value * factor.
 */
export const ANZ_UNIT_OVERRIDES = Object.freeze({
  // Enzyme activity is conventionally reported in U/L rather than µkat/L.
  'biochemistry.ast': { factor: 60, unit: 'U/L', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },
  'biochemistry.alt': { factor: 60, unit: 'U/L', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },
  'biochemistry.alp': { factor: 60, unit: 'U/L', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },
  'biochemistry.ggt': { factor: 60, unit: 'U/L', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },
  'biochemistry.ldh': { factor: 60, unit: 'U/L', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },
  'biochemistry.creatineKinase': { factor: 60, unit: 'U/L', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },
  'biochemistry.amylase': { factor: 60, unit: 'U/L', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },
  'biochemistry.lipase': { factor: 60, unit: 'U/L', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },

  // Kidney filtration and urate conventions.
  'biochemistry.egfr': { factor: 60, unit: 'mL/min/1.73m²', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },
  'biochemistry.gfrCystatin': { factor: 60, unit: 'mL/min', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },
  'biochemistry.uricAcid': { factor: 0.001, unit: 'mmol/L', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },

  // RCPA preferred reporting units that differ from canonical storage.
  'biochemistry.osmolality': { factor: 1, unit: 'mmol/kg', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },
  'hormones.prolactin': {
    factor: 21.2,
    unit: 'mIU/L',
    type: 'multiply',
    source: `${RCPA_CHEMICAL_PATHOLOGY_SOURCE}; WHO 3rd IS 84/500-calibrated assays`,
  },
  'hormones.igf1': { factor: 0.1307, unit: 'nmol/L', type: 'multiply', source: RCPA_ENDOCRINE_SOURCE },
  'diabetes.cPeptide': { factor: 0.331, unit: 'nmol/L', type: 'multiply', source: RCPA_ENDOCRINE_SOURCE },
  'boneMetabolism.p1np': { factor: 1000, unit: 'ng/L', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },
  'urinalysis.totalProtein': { factor: 1000, unit: 'mg/L', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },

  // Numerically identical, but the ANZ clinical label is materially clearer.
  'thyroid.tsh': { factor: 1, unit: 'mIU/L', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },
  'hormones.lh': { factor: 1, unit: 'IU/L', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },
  'hormones.fsh': { factor: 1, unit: 'IU/L', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },
  'hormones.hCG': { factor: 1, unit: 'IU/L', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },
  'tumorMarkers.afp': { factor: 1, unit: 'kIU/L', type: 'multiply', source: RCPA_CHEMICAL_PATHOLOGY_SOURCE },
});

export function normalizeUnitProfile(value) {
  const profile = String(value || '').trim().toUpperCase();
  return profile === 'US' || profile === 'ANZ' ? profile : 'EU';
}

export function getUnitProfileLabel(value) {
  return UNIT_PROFILE_LABELS[normalizeUnitProfile(value)];
}

export function usesImperialMeasurements(value) {
  return normalizeUnitProfile(value) === 'US';
}

function schemaMarker(dotKey) {
  if (typeof dotKey !== 'string') return null;
  const dot = dotKey.indexOf('.');
  if (dot < 1 || dot === dotKey.length - 1) return null;
  return MARKER_SCHEMA[dotKey.slice(0, dot)]?.markers?.[dotKey.slice(dot + 1)] || null;
}

function formatAnzIdentityUnit(unit) {
  if (!unit) return '';
  return String(unit)
    .replace(/^ml(?=\/|$)/, 'mL')
    .replace(/^fl$/, 'fL')
    .replace(/\/ml(?=$|\s)/g, '/mL')
    .replace(/\/l(?=$|\s)/g, '/L');
}

function usProfileConversion(dotKey) {
  const conversion = UNIT_CONVERSIONS[dotKey];
  if (!conversion) return null;
  return {
    ...conversion,
    unit: conversion.usUnit || (conversion.type === 'hba1c' ? '%' : ''),
    source: 'getbased US conventional registry',
  };
}

/**
 * @param {string} dotKey
 * @param {string} unitProfile
 * @param {string | null} [canonicalUnit]
 */
export function resolveMarkerUnitProfile(dotKey, unitProfile, canonicalUnit = null) {
  const profile = normalizeUnitProfile(unitProfile);
  const marker = schemaMarker(dotKey);
  const storedUnit = canonicalUnit ?? marker?.unit ?? '';
  let conversion = null;
  if (profile === 'US') {
    conversion = usProfileConversion(dotKey);
  } else if (profile === 'ANZ' && marker) {
    conversion = ANZ_UNIT_OVERRIDES[dotKey] || null;
  }
  const unit = conversion?.unit
    || (profile === 'ANZ' && marker ? formatAnzIdentityUnit(storedUnit) : storedUnit);
  return {
    dotKey,
    profile,
    canonicalUnit: storedUnit,
    unit,
    conversion,
    isIdentity: !conversion || (conversion.type === 'multiply' && conversion.factor === 1),
  };
}

function convertCanonicalWithDefinition(value, conversion) {
  if (value == null || !Number.isFinite(value) || !conversion) return value;
  if (conversion.type === 'multiply') {
    if (conversion.factor === 1) return value;
    return parseFloat((value * conversion.factor).toPrecision(6));
  }
  if (conversion.type === 'hba1c') {
    return parseFloat(((value / 10.929) + 2.15).toFixed(1));
  }
  return value;
}

function convertDisplayWithDefinition(value, conversion) {
  if (value == null || !Number.isFinite(value) || !conversion) return value;
  if (conversion.type === 'multiply') {
    if (conversion.factor === 1) return value;
    return parseFloat((value / conversion.factor).toPrecision(6));
  }
  if (conversion.type === 'hba1c') {
    return parseFloat(((value - 2.15) * 10.929).toFixed(1));
  }
  return value;
}

/**
 * @param {string} dotKey
 * @param {number | null | undefined} value
 * @param {string} unitProfile
 * @param {string | null} [canonicalUnit]
 */
export function convertCanonicalToDisplay(dotKey, value, unitProfile, canonicalUnit = null) {
  const resolved = resolveMarkerUnitProfile(dotKey, unitProfile, canonicalUnit);
  return convertCanonicalWithDefinition(value, resolved.conversion);
}

/**
 * @param {string} dotKey
 * @param {number | null | undefined} value
 * @param {string} unitProfile
 * @param {string | null} [canonicalUnit]
 */
export function convertDisplayToCanonical(dotKey, value, unitProfile, canonicalUnit = null) {
  const resolved = resolveMarkerUnitProfile(dotKey, unitProfile, canonicalUnit);
  return convertDisplayWithDefinition(value, resolved.conversion);
}

function comparableUnit(unit) {
  return String(unit || '')
    .trim()
    .replace(/\u03bc/g, 'µ')
    .replace(/litres?/gi, 'L')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function conversionForInputUnit(dotKey, unit) {
  const comparable = comparableUnit(unit);
  const us = usProfileConversion(dotKey);
  if (us && comparable === comparableUnit(us.unit)) return us;
  const anz = ANZ_UNIT_OVERRIDES[dotKey];
  if (anz && comparable === comparableUnit(anz.unit)) return anz;
  for (const secondary of SECONDARY_UNIT_CONVERSIONS[dotKey] || []) {
    if (comparable === comparableUnit(secondary.unit)) return secondary;
  }
  return null;
}

/**
 * @param {string} dotKey
 * @param {number} value
 * @param {string} inputUnit
 * @param {string} unitProfile
 * @param {string | null} [canonicalUnit]
 */
export function convertUnitInputToCanonical(dotKey, value, inputUnit, unitProfile, canonicalUnit = null) {
  const resolved = resolveMarkerUnitProfile(dotKey, unitProfile, canonicalUnit);
  if (!inputUnit || comparableUnit(inputUnit) === comparableUnit(resolved.canonicalUnit)) return value;
  if (comparableUnit(inputUnit) === comparableUnit(resolved.unit)) {
    return convertDisplayWithDefinition(value, resolved.conversion);
  }
  const conversion = conversionForInputUnit(dotKey, inputUnit);
  if (conversion) return convertDisplayWithDefinition(value, conversion);
  return convertUserInputToSI(dotKey, value, inputUnit);
}

/**
 * @param {string} dotKey
 * @param {number} value
 * @param {string} targetUnit
 * @param {string} unitProfile
 * @param {string | null} [canonicalUnit]
 */
export function convertCanonicalToInputUnit(dotKey, value, targetUnit, unitProfile, canonicalUnit = null) {
  const resolved = resolveMarkerUnitProfile(dotKey, unitProfile, canonicalUnit);
  if (!targetUnit || comparableUnit(targetUnit) === comparableUnit(resolved.canonicalUnit)) return value;
  if (comparableUnit(targetUnit) === comparableUnit(resolved.unit)) {
    return convertCanonicalWithDefinition(value, resolved.conversion);
  }
  const conversion = conversionForInputUnit(dotKey, targetUnit);
  if (conversion) return convertCanonicalWithDefinition(value, conversion);
  return convertSIToInputUnit(dotKey, value, targetUnit);
}

/**
 * @param {string} dotKey
 * @param {number | null | undefined} displayValue
 * @param {string} unitProfile
 * @param {string | null} [canonicalUnit]
 */
export function getAlternateUnitForProfile(dotKey, displayValue, unitProfile, canonicalUnit = null) {
  if (displayValue == null || !Number.isFinite(displayValue)) return null;
  const resolved = resolveMarkerUnitProfile(dotKey, unitProfile, canonicalUnit);
  const canonicalValue = convertDisplayWithDefinition(displayValue, resolved.conversion);
  if (resolved.conversion) {
    return { value: canonicalValue, unit: resolved.canonicalUnit };
  }
  const us = usProfileConversion(dotKey);
  if (!us) return null;
  return {
    value: convertCanonicalWithDefinition(canonicalValue, us),
    unit: us.unit,
  };
}

/**
 * @param {string} dotKey
 * @param {string} unitProfile
 * @param {string | null} [canonicalUnit]
 */
export function getMarkerInputUnits(dotKey, unitProfile, canonicalUnit = null) {
  const resolved = resolveMarkerUnitProfile(dotKey, unitProfile, canonicalUnit);
  const units = [resolved.unit, resolved.canonicalUnit];
  const usUnit = usProfileConversion(dotKey)?.unit;
  if (usUnit) units.push(usUnit);
  const anzUnit = ANZ_UNIT_OVERRIDES[dotKey]?.unit;
  if (anzUnit) units.push(anzUnit);
  for (const secondary of SECONDARY_UNIT_CONVERSIONS[dotKey] || []) {
    if (secondary.unit) units.push(secondary.unit);
  }
  const seen = new Set();
  return units.filter(unit => {
    const comparable = comparableUnit(unit);
    if (!unit || seen.has(comparable)) return false;
    seen.add(comparable);
    return true;
  });
}

export function auditUnitProfileCoverage(unitProfile) {
  const profile = normalizeUnitProfile(unitProfile);
  const resolved = [];
  for (const [categoryKey, category] of Object.entries(MARKER_SCHEMA)) {
    for (const [markerKey, marker] of Object.entries(category.markers || {})) {
      resolved.push(resolveMarkerUnitProfile(`${categoryKey}.${markerKey}`, profile, marker.unit));
    }
  }
  return resolved;
}
