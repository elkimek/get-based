// @ts-check
import { isoDay } from './wearable-adapters.js';

export const POUNDS_PER_KILOGRAM = 2.2046226218;

/** @param {unknown} unit */
function isPoundUnit(unit) {
  return ['lb', 'lbs', 'pound', 'pounds'].includes(String(unit || '').trim().toLowerCase());
}

/**
 * Convert a weight at an input/import boundary into the kilograms used by the
 * wearable store and summary pipeline.
 * @param {number} value
 * @param {string} [unit]
 */
export function weightToKilograms(value, unit = 'kg') {
  return isPoundUnit(unit) ? value / POUNDS_PER_KILOGRAM : value;
}

/**
 * Convert a canonical kilogram value for the selected display system.
 * @param {number} valueKg
 * @param {string} [unitSystem]
 */
export function weightFromKilograms(valueKg, unitSystem = 'EU') {
  return unitSystem === 'US' ? valueKg * POUNDS_PER_KILOGRAM : valueKg;
}

/** @param {string} [unitSystem] */
export function weightUnitForSystem(unitSystem = 'EU') {
  return unitSystem === 'US' ? 'lb' : 'kg';
}

/**
 * Resolve a canonical wearable metric's user-facing unit.
 * @param {string} metricId
 * @param {string} canonicalUnit
 * @param {string} [unitSystem]
 */
export function wearableDisplayUnit(metricId, canonicalUnit, unitSystem = 'EU') {
  return metricId === 'weight' ? weightUnitForSystem(unitSystem) : canonicalUnit;
}

/**
 * Resolve a canonical wearable metric's user-facing value.
 * @param {string} metricId
 * @param {number} value
 * @param {string} [unitSystem]
 */
export function wearableDisplayValue(metricId, value, unitSystem = 'EU') {
  return metricId === 'weight' ? weightFromKilograms(value, unitSystem) : value;
}

// Single formatter used by the strip cards and detail modals so a number
// renders identically everywhere.
export function formatValue(latest, unit) {
  if (latest == null || !isFinite(latest)) return '—';
  const intUnits = ['ms', 'bpm', '%', 'min', ''];
  if (intUnits.includes(unit) || Number.isInteger(latest)) return String(Math.round(latest));
  return latest.toFixed(1);
}

/**
 * Format a wearable value after applying the selected display unit system.
 * @param {string} metricId
 * @param {number | null | undefined} value
 * @param {string} canonicalUnit
 * @param {string} [unitSystem]
 */
export function formatWearableMetricValue(metricId, value, canonicalUnit, unitSystem = 'EU') {
  const displayUnit = wearableDisplayUnit(metricId, canonicalUnit, unitSystem);
  const displayValue = value == null ? value : wearableDisplayValue(metricId, value, unitSystem);
  return formatValue(displayValue, displayUnit);
}

// Format an ISO date (YYYY-MM-DD) as "Apr 24" for compact display next to a
// metric value. Include the year for dates outside the current local year.
// Returns the raw input on parse failure.
export function shortDate(iso) {
  if (!iso || typeof iso !== 'string') return iso || '';
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime())) return iso;
  const sameYear = d.getUTCFullYear() === Number(isoDay().slice(0, 4));
  /** @type {Intl.DateTimeFormatOptions} */
  const fmt = sameYear
    ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
    : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
  return d.toLocaleDateString(undefined, fmt);
}
