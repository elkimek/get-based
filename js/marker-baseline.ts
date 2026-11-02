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

function validDate(date: string | undefined): date is string {
  return !!date && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(`${date}T00:00:00Z`))
    && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
}

/** One baseline per draw, built before chart filtering in display units.
 * The current draw never enters its own baseline. Keep abnormal readings:
 * this describes recorded history, not an inferred healthy state.
 */
export function buildMarkerBaselines(values: MarkerValues, dates: readonly string[]): Array<MarkerBaseline | null> {
  const byDate = new Map<string, number | null>();
  values.forEach((value, index) => {
    const date = dates[index];
    if (!validDate(date) || typeof value !== 'number' || !Number.isFinite(value)) return;
    // A conflicting duplicate date cannot become a second independent draw.
    if (byDate.has(date) && byDate.get(date) !== value) byDate.set(date, null);
    else if (!byDate.has(date)) byDate.set(date, value);
  });
  const points = [...byDate].filter((point): point is [string, number] => point[1] !== null)
    .sort(([a], [b]) => a.localeCompare(b));
  return values.map((value, index) => {
    const date = dates[index];
    if (!validDate(date) || typeof value !== 'number' || !Number.isFinite(value) || byDate.get(date) !== value) return null;
    const cutoff = new Date(`${date}T00:00:00Z`);
    const month = cutoff.getUTCMonth();
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
    if (cutoff.getUTCMonth() !== month) cutoff.setUTCDate(0);
    const start = cutoff.toISOString().slice(0, 10);
    const previous = points.filter(([day]) => day >= start && day < date);
    if (previous.length < MIN_PRIOR_DRAWS) return null;
    const sorted = previous.map(([, v]) => v).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[middle]! : sorted[middle - 1]! / 2 + sorted[middle]! / 2;
    const delta = value - median;
    return { median, count: previous.length, startDate: previous[0]![0], endDate: previous.at(-1)![0],
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
