// @ts-check
// pdf-import-unit-conversions.js — import review units and value conversion

import {
  MARKER_SCHEMA,
  normalizeClinicalUnit as normalizeUnitStr,
  normalizeToSI,
  UNIT_CONVERSIONS,
} from './schema.js';
import { SECONDARY_UNIT_CONVERSIONS } from './secondary-unit-conversions.js';

function isPercentImportUnit(unit) {
  const norm = normalizeUnitStr(String(unit || ''));
  return norm === '%' || norm === 'pct' || norm === 'percent' || norm === 'percentage';
}

export const GENERIC_IMPORT_UNITS = [
  '', '%', 'ratio', 'arb.j.',
  'U/l', 'IU/l', '\u00b5kat/l',
  '/\u00b5l', '10^9/l', '10^12/l',
  'g/l', 'mg/l', '\u00b5g/l', 'ng/ml', 'ng/l',
  'mol/l', 'mmol/l', '\u00b5mol/l', 'nmol/l', 'pmol/l',
  'g/mol', 'fL', 'pg', 'mm/h',
];

function normalizeGenericImportUnit(unit) {
  return normalizeUnitStr(String(unit || ''))
    .replace(/^mcg\//, 'ug/')
    .replace(/^cells\//, '/')
    .replace(/^x(10\^\d+\/l)$/i, '$1');
}

const GENERIC_UNIT_FACTORS = new Map([
  ['g/l', { group: 'mass-concentration', factor: 1 }],
  ['mg/l', { group: 'mass-concentration', factor: 1e-3 }],
  ['ug/l', { group: 'mass-concentration', factor: 1e-6 }],
  ['ng/ml', { group: 'mass-concentration', factor: 1e-6 }],
  ['ng/l', { group: 'mass-concentration', factor: 1e-9 }],
  ['mol/l', { group: 'amount-concentration', factor: 1 }],
  ['mmol/l', { group: 'amount-concentration', factor: 1e-3 }],
  ['umol/l', { group: 'amount-concentration', factor: 1e-6 }],
  ['nmol/l', { group: 'amount-concentration', factor: 1e-9 }],
  ['pmol/l', { group: 'amount-concentration', factor: 1e-12 }],
  ['/ul', { group: 'cell-count', factor: 1e6 }],
  ['10^6/l', { group: 'cell-count', factor: 1e6 }],
  ['10^9/l', { group: 'cell-count', factor: 1e9 }],
  ['10^12/l', { group: 'cell-count', factor: 1e12 }],
  ['u/l', { group: 'activity', factor: 1 }],
  ['iu/l', { group: 'activity', factor: 1 }],
  ['ukat/l', { group: 'activity', factor: 60 }],
]);

function getSchemaUnitForMarker(key) {
  const [catKey, markerKey] = String(key || '').split('.');
  return MARKER_SCHEMA[catKey]?.markers?.[markerKey]?.unit || '';
}

function isRecognizedUnitForMarker(key, unit) {
  if (!key) return false;
  if (!unit) return true;
  const aiUnit = normalizeUnitStr(unit);
  const siUnit = getSchemaUnitForMarker(key);
  if (siUnit && aiUnit === normalizeUnitStr(siUnit)) return true;
  const primaryConv = UNIT_CONVERSIONS[key];
  if (primaryConv?.type === 'multiply' && primaryConv.usUnit) {
    if (aiUnit === normalizeUnitStr(primaryConv.usUnit)) return true;
    if (isPercentImportUnit(aiUnit) && isPercentImportUnit(primaryConv.usUnit)) return true;
  }
  if (primaryConv?.type === 'hba1c' && aiUnit === '%') return true;
  const secondaryList = SECONDARY_UNIT_CONVERSIONS[key];
  if (secondaryList) {
    for (const sec of secondaryList) {
      if (sec.unit && aiUnit === normalizeUnitStr(sec.unit)) return true;
    }
  }
  return false;
}

export function getValidUnitsForMarker(key) {
  if (!key) return [];
  const [catKey, markerKey] = key.split('.');
  const schema = MARKER_SCHEMA[catKey]?.markers?.[markerKey];
  const units = [];
  if (schema?.unit) units.push(schema.unit);
  const conv = UNIT_CONVERSIONS[key];
  if (conv?.usUnit) units.push(conv.usUnit);
  const secondaries = SECONDARY_UNIT_CONVERSIONS[key];
  if (secondaries) {
    secondaries.forEach(sec => {
      if (sec.unit) units.push(sec.unit);
    });
  }
  return [...new Set(units)];
}

export function convertSIToImportUnit(key, value, unit) {
  if (value == null || isNaN(value)) return null;
  if (!key || !unit) return value;
  const aiUnit = normalizeUnitStr(unit);
  const siUnit = getSchemaUnitForMarker(key);
  if (siUnit && aiUnit === normalizeUnitStr(siUnit)) return value;

  const primaryConv = UNIT_CONVERSIONS[key];
  if (primaryConv?.type === 'multiply' && primaryConv.usUnit && aiUnit === normalizeUnitStr(primaryConv.usUnit)) {
    return parseFloat((value * primaryConv.factor).toPrecision(6));
  }
  if (primaryConv?.type === 'hba1c' && aiUnit === '%') {
    return parseFloat(((value / 10.929) + 2.15).toFixed(1));
  }

  const secondaryList = SECONDARY_UNIT_CONVERSIONS[key];
  if (secondaryList) {
    for (const sec of secondaryList) {
      if (sec.type === 'multiply' && aiUnit === normalizeUnitStr(sec.unit)) {
        return parseFloat((value * sec.factor).toPrecision(6));
      }
      if (sec.type === 'hba1c' && aiUnit === normalizeUnitStr(sec.unit)) {
        return parseFloat(((value / 10.929) + 2.15).toFixed(1));
      }
    }
  }
  return null;
}

export function convertImportValueUnit(key, value, fromUnit, toUnit) {
  if (value == null || isNaN(value)) return null;
  if (!key) return null;
  if (normalizeUnitStr(fromUnit || '') === normalizeUnitStr(toUnit || '')) return value;
  if (!isRecognizedUnitForMarker(key, fromUnit)) return null;
  const siValue = normalizeToSI(key, value, fromUnit);
  return convertSIToImportUnit(key, siValue, toUnit);
}

export function convertGenericImportValueUnit(value, fromUnit, toUnit) {
  if (value == null || isNaN(value)) return null;
  const from = normalizeGenericImportUnit(fromUnit);
  const to = normalizeGenericImportUnit(toUnit);
  if (from === to) return value;
  if (!from || !to) return null;
  const fromMeta = GENERIC_UNIT_FACTORS.get(from);
  const toMeta = GENERIC_UNIT_FACTORS.get(to);
  if (!fromMeta || !toMeta || fromMeta.group !== toMeta.group) return null;
  return parseFloat(((value * fromMeta.factor) / toMeta.factor).toPrecision(6));
}
