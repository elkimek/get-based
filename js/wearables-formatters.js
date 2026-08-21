// @ts-check
import { isoDay } from './wearable-adapters.js';

const LB_PER_KG = 2.2046226218;

/**
 * @param {number} value
 * @param {string} [unit]
 */
export function weightToKilograms(value, unit = 'kg') {
  return /^lbs?$/i.test(unit) ? value / LB_PER_KG : value;
}

/**
 * @param {string} metricId
 * @param {string} canonicalUnit
 * @param {string} unitSystem
 */
export function wearableDisplayUnit(metricId, canonicalUnit, unitSystem) {
  return metricId === 'weight' ? (unitSystem === 'US' ? 'lb' : 'kg') : canonicalUnit;
}

/**
 * @param {string} metricId
 * @param {number} value
 * @param {string} unitSystem
 */
export function wearableDisplayValue(metricId, value, unitSystem) {
  return metricId === 'weight' && unitSystem === 'US' ? value * LB_PER_KG : value;
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
 * @param {string} metricId
 * @param {number | null | undefined} value
 * @param {string} canonicalUnit
 * @param {string} unitSystem
 */
export function formatWearableMetricValue(metricId, value, canonicalUnit, unitSystem) {
  return formatValue(
    value == null ? value : wearableDisplayValue(metricId, value, unitSystem),
    wearableDisplayUnit(metricId, canonicalUnit, unitSystem),
  );
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
