import type { ActiveMarker, MarkerValues } from './data-view-types.js';

/** Descriptive history, never a healthy interval or a significance test. */
export interface MarkerBaseline {
  median: number;
  count: number;
  startDate: string;
  endDate: string;
  comparedDate: string;
  delta: number;
  deltaPercent: number | null;
}

const MIN_PRIOR_DRAWS = 3;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDateCache = new Map<string, boolean>();

function validDate(date: string | undefined): date is string {
  if (!date || !DATE_RE.test(date)) return false;
  const cached = validDateCache.get(date);
  if (cached !== undefined) return cached;
  const parsed = Date.parse(`${date}T00:00:00Z`);
  const ok = Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date;
  if (validDateCache.size < 2048) validDateCache.set(date, ok);
  return ok;
}

/** One baseline per draw, built before chart filtering in display units.
 * The current draw never enters its own baseline. Keep abnormal readings:
 * this describes recorded history, not an inferred healthy state.
 */
export function buildMarkerBaselines(values: MarkerValues, dates: readonly string[]): Array<MarkerBaseline | null> {
  // Need at least MIN_PRIOR_DRAWS prior draws plus the compared draw itself.
  let finiteCount = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (typeof v === 'number' && Number.isFinite(v)) finiteCount++;
  }
  if (finiteCount <= MIN_PRIOR_DRAWS) return new Array<MarkerBaseline | null>(values.length).fill(null);

  const byDate = new Map<string, number | null>();
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    const date = dates[index];
    if (typeof value !== 'number' || !Number.isFinite(value) || !validDate(date)) continue;
    // A conflicting duplicate date cannot become a second independent draw.
    if (byDate.has(date)) {
      if (byDate.get(date) !== value) byDate.set(date, null);
    } else {
      byDate.set(date, value);
    }
  }
  const points: Array<[string, number]> = [];
  for (const [date, value] of byDate) {
    if (value !== null) points.push([date, value]);
  }
  if (points.length <= MIN_PRIOR_DRAWS) return new Array<MarkerBaseline | null>(values.length).fill(null);
  points.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return values.map((value, index) => {
    const date = dates[index];
    if (typeof value !== 'number' || !Number.isFinite(value) || !date || byDate.get(date) !== value) return null;
    const cutoff = new Date(`${date}T00:00:00Z`);
    const month = cutoff.getUTCMonth();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
    if (cutoff.getUTCMonth() !== month) cutoff.setUTCDate(0);
    const start = cutoff.toISOString().slice(0, 10);
    const previousValues: number[] = [];
    let startDate = '';
    let endDate = '';
    for (let i = 0; i < points.length; i++) {
      const point = points[i]!;
      const day = point[0];
      if (day >= date) break;
      if (day >= start) {
        if (!startDate) startDate = day;
        endDate = day;
        previousValues.push(point[1]);
      }
    }
    if (previousValues.length < MIN_PRIOR_DRAWS) return null;
    previousValues.sort((a, b) => a - b);
    const middle = Math.floor(previousValues.length / 2);
    const median = previousValues.length % 2
      ? previousValues[middle]!
      : previousValues[middle - 1]! / 2 + previousValues[middle]! / 2;
    const delta = value - median;
    return { median, count: previousValues.length, startDate, endDate,
      comparedDate: date, delta, deltaPercent: median === 0 ? null : delta / Math.abs(median) * 100 };
  });
}

export function baselineForDate(marker: Pick<ActiveMarker, 'personalBaselines'>, index: number, date: string | undefined) {
  const baseline = marker.personalBaselines?.[index];
  return baseline?.comparedDate === date ? baseline : null;
}

export interface MarkerBaselineComparison { value: string; comparison: string }

export function projectMarkerBaseline(baseline: MarkerBaseline | null | undefined, unit: string, format: (value: number) => string): MarkerBaselineComparison | null {
  if (!baseline) return null;
  const direction = baseline.delta > 0 ? 'above' : 'below';
  const difference = baseline.deltaPercent == null
    ? `${format(Math.abs(baseline.delta))}${unit ? ` ${unit}` : ''}`
    : `${Number(Math.abs(baseline.deltaPercent).toFixed(1))}%`;
  return {
    value: `${format(baseline.median)}${unit ? ` ${unit}` : ''}`,
    comparison: baseline.delta === 0 ? 'Latest matches baseline' : `Latest ${difference} ${direction} baseline`,
  };
}
