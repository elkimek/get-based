import { isoDay } from './wearable-adapters.js';

const LB_PER_KG = 2.2046226218;

export function weightToKilograms(value: number, unit = 'kg') {
  return /^lbs?$/i.test(unit) ? value / LB_PER_KG : value;
}

export function wearableDisplayUnit(metricId: string, canonicalUnit: string, unitSystem: string) {
  return metricId === 'weight' ? (unitSystem === 'US' ? 'lb' : 'kg') : canonicalUnit;
}

export function wearableDisplayValue(metricId: string, value: number, unitSystem: string) {
  return metricId === 'weight' && unitSystem === 'US' ? value * LB_PER_KG : value;
}

// Single formatter used by the strip cards and detail modals so a number
// renders identically everywhere.
export function formatValue(latest: number | null | undefined, unit: string) {
  if (latest == null || !isFinite(latest)) return '—';
  const intUnits = ['ms', 'bpm', '%', 'min', ''];
  if (intUnits.includes(unit) || Number.isInteger(latest)) return String(Math.round(latest));
  return latest.toFixed(1);
}

export function formatWearableMetricValue(metricId: string, value: number | null | undefined, canonicalUnit: string, unitSystem: string) {
  return formatValue(
    value == null ? value : wearableDisplayValue(metricId, value, unitSystem),
    wearableDisplayUnit(metricId, canonicalUnit, unitSystem),
  );
}

// Format an ISO date (YYYY-MM-DD) as "Apr 24" for compact display next to a
// metric value. Include the year for dates outside the current local year.
// Returns the raw input on parse failure.
export function shortDate(iso: string | null | undefined) {
  if (!iso || typeof iso !== 'string') return iso || '';
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime())) return iso;
  const sameYear = d.getUTCFullYear() === Number(isoDay().slice(0, 4));
  const fmt: Intl.DateTimeFormatOptions = sameYear
    ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
    : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
  return d.toLocaleDateString(undefined, fmt);
}
