import { isoDay } from './wearable-adapters.js';

// Single formatter used by the strip cards and detail modals so a number
// renders identically everywhere.
export function formatValue(latest, unit) {
  if (latest == null || !isFinite(latest)) return '—';
  const intUnits = ['ms', 'bpm', '%', 'min', ''];
  if (intUnits.includes(unit) || Number.isInteger(latest)) return String(Math.round(latest));
  return latest.toFixed(1);
}

// Format an ISO date (YYYY-MM-DD) as "Apr 24" for compact display next to a
// metric value. Include the year for dates outside the current local year.
// Returns the raw input on parse failure.
export function shortDate(iso) {
  if (!iso || typeof iso !== 'string') return iso || '';
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d.getTime())) return iso;
  const sameYear = d.getUTCFullYear() === Number(isoDay().slice(0, 4));
  const fmt = sameYear
    ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
    : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
  return d.toLocaleDateString(undefined, fmt);
}
