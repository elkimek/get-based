// lab-date-range.js - Shared visible bounds for lab timeline charts and filters.

const RANGE_MONTHS: Record<string, number> = {
  '3m': 3,
  '6m': 6,
  '1y': 12,
};

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function subtractUtcMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function getLabDateRangeBounds(dates: unknown, range = 'all', now = new Date(),
  options: { fallbackToAll?: boolean } = {}): { min: string; max: string } | null {
  const validDates = Array.isArray(dates)
    ? [...new Set((dates as unknown[]).filter(isIsoDate))].sort()
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
  const earliest = validDates[0]!;
  const latest = validDates[validDates.length - 1]!;
  const max = latest > today ? latest : today;
  if (earliest < max) return { min: earliest, max };
  return { min: isoDate(subtractUtcMonths(new Date(`${earliest}T12:00:00Z`), 1)), max };
}
