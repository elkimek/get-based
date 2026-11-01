// One date-bound calculation for the native inspector and validated workspace commands.
import { correlationDay, correlationDate } from './therapy-correlations.js';
import type { prepareCorrelationSelection } from './therapy-correlations.js';
import { localDateKey } from './supplement-medication-domain.js';
export function correlationTimelineBounds(selection: ReturnType<typeof prepareCorrelationSelection>) {
  const days = selection.markers.flatMap(m => m.rows.map(r => correlationDay(r.date)));
  for (const h of selection.histories) if (!h.invalid) for (const p of h.periods) {
    if ((p.start as string) <= h.today) days.push(correlationDay(p.start), correlationDay(p.end && (p.end as string) < h.today ? p.end : h.today));
  }
  const validDays = days.filter(day => day !== null);
  const fallback = (correlationDay(localDateKey()) as number);
  const requestedEnd = correlationDay(selection.range.end);
  const naturalStart = validDays.length ? Math.min(...validDays) : fallback;
  const start = correlationDay(selection.range.start) ?? Math.min(naturalStart, requestedEnd ?? naturalStart);
  const last = requestedEnd ?? Math.max(start, fallback, validDays.length ? Math.max(...validDays) : fallback);
  const end = Math.max(start + 1, last + 1);
  return { start, end, last, firstDate: correlationDate(start), lastDate: correlationDate(end - 1) };
}
