// @ts-check
// lab-date-range.js - Shared visible bounds for lab timeline charts and filters.

const RANGE_MONTHS = {
  '3m': 3,
  '6m': 6,
  '1y': 12,
};

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

/**
 * @param {Date} date
 * @returns {string}
 */
function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Subtract whole calendar months while clamping end-of-month dates.
 * @param {Date} date
 * @param {number} months
 * @returns {Date}
 */
function subtractUtcMonths(date, months) {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/**
 * Resolve the shared x-axis window for lab timelines.
 * Rolling ranges span their calendar cutoff through today. "All" spans the
 * earliest real lab date through today, preserving post-lab annotation space
 * without adding a synthetic null datapoint. When a rolling range contains no
 * dates, the default mirrors filterDatesByRange's existing all-data fallback.
 *
 * @param {unknown} dates
 * @param {string} [range]
 * @param {Date} [now]
 * @param {{ fallbackToAll?: boolean }} [options]
 * @returns {{ min: string, max: string } | null}
 */
export function getLabDateRangeBounds(dates, range = 'all', now = new Date(), options = {}) {
  const validDates = Array.isArray(dates)
    ? [...new Set(dates.filter(isIsoDate))].sort()
    : [];
  const today = isoDate(now);
  const months = RANGE_MONTHS[range];

  if (months) {
    const rollingBounds = {
      min: isoDate(subtractUtcMonths(now, months)),
      max: today,
    };
    const hasDateInRange = validDates.some(date => date >= rollingBounds.min && date <= rollingBounds.max);
    if (hasDateInRange || options.fallbackToAll === false || validDates.length === 0) return rollingBounds;
  }

  if (validDates.length === 0) return null;
  const earliest = validDates[0];
  const latest = validDates[validDates.length - 1];
  const max = latest > today ? latest : today;
  if (earliest < max) return { min: earliest, max };
  return { min: isoDate(subtractUtcMonths(new Date(`${earliest}T12:00:00Z`), 1)), max };
}
