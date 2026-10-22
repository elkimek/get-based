import {validMeasurementDate, type BodyMeasurement} from './body-measurement-model.js';

interface CycleInput {
  cycleStatus?: unknown; regularity?: unknown; contraceptive?: unknown;
  cycleLength?: unknown; periodLength?: unknown; periods?: unknown;
}
interface Period {start: string; end: string | null}
interface CycleContext {day: number; label: string; naturalRegular: boolean; length: number | null}
export interface BodyMeasurementTiming {heading: string; dateLabel: string | null; hint: string}
type Reading = Pick<BodyMeasurement, 'field' | 'date' | 'updatedAt'>;
const DAY = 86400000;
const NON_HORMONAL = new Set(['', 'none', 'copper iud', 'barrier', 'fam']);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY;
const addDays = (date: string, days: number) => new Date((dayNumber(date) + days) * DAY).toISOString().slice(0, 10);
function integer(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;
}
function activeCycle(value: unknown): CycleInput | null {
  if (!object(value) || (value.cycleStatus && !['regular', 'perimenopause'].includes(String(value.cycleStatus)))) return null;
  return value;
}
function periods(mc: CycleInput): Period[] {
  if (!Array.isArray(mc.periods)) return [];
  const unique = new Map<string, Period>();
  for (const row of mc.periods) {
    if (!object(row) || typeof row.startDate !== 'string' || !validMeasurementDate(row.startDate)
      || row.source === 'predicted' || row.confidence === 'predicted') continue;
    const end = typeof row.endDate === 'string' && validMeasurementDate(row.endDate) && row.endDate >= row.startDate ? row.endDate : null;
    unique.set(row.startDate, {start: row.startDate, end});
  }
  return [...unique.values()].sort((a, b) => a.start.localeCompare(b.start));
}
function naturalRegular(mc: CycleInput): boolean {
  return (!mc.cycleStatus || mc.cycleStatus === 'regular') && mc.regularity === 'regular'
    && typeof (mc.contraceptive ?? '') === 'string' && NON_HORMONAL.has(String(mc.contraceptive ?? '').trim().toLowerCase());
}
function context(mc: CycleInput, date: string): CycleContext | null {
  if (!validMeasurementDate(date)) return null;
  const all = periods(mc), index = all.findLastIndex(period => period.start <= date);
  if (index < 0) return null;
  const period = all[index]!, next = all[index + 1];
  const day = dayNumber(date) - dayNumber(period.start) + 1;
  const length = next ? integer(dayNumber(next.start) - dayNumber(period.start), 21, 40) : integer(mc.cycleLength, 21, 40);
  // Never wrap unlogged bleeding into an apparently observed new cycle.
  if (day > (length ?? 40) + 7) return null;
  const natural = naturalRegular(mc) && length !== null && day <= length;
  const periodLength = integer(mc.periodLength, 1, 10);
  const bleeding = period.end !== null && date <= period.end;
  let detail = 'since logged bleeding';
  if (bleeding) detail = 'bleeding recorded';
  else if (natural && periodLength !== null) {
    const ovulation = length - 14;
    detail = day <= periodLength ? 'menstrual phase (estimated)'
      : day < ovulation - 1 ? 'follicular phase (estimated)'
        : day <= ovulation + 1 ? 'ovulatory phase (estimated)' : 'luteal phase (estimated)';
  }
  const label = length !== null && day > length && !bleeding
    ? `${day - 1} days since last logged period started` : `Cycle day ${day} · ${detail}`;
  return {day, length, naturalRegular: natural, label};
}
export function bodyMeasurementCycleLabel(value: unknown, date: string): string | null {
  const mc = activeCycle(value);
  return mc ? context(mc, date)?.label ?? null : null;
}
function dateRange(start: string, end: string): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});
  return `${formatter.formatRange(new Date(`${start}T12:00:00Z`), new Date(`${end}T12:00:00Z`))} · estimated`;
}
/** A consistency aid inferred from bloating research, not a validated best day for waist/SAD.
 * Calendar windows for regular natural cycles roll forward from logged history;
 * projected cycles stay estimates and are never inserted as observed periods.
 * See engineering/manual-body-readings-sync.md for evidence and the heuristic.
 */
export function bodyMeasurementTiming(value: unknown, rows: readonly Reading[], today: string): BodyMeasurementTiming | null {
  const mc = activeCycle(value);
  if (!mc || !validMeasurementDate(today)) return null;
  const fallback: BodyMeasurementTiming = {heading: 'Measurement timing', dateLabel: null,
    hint: 'Measure when bloating has settled. Keep a similar point in your cycle and the same time of day.'};
  if (!naturalRegular(mc)) return fallback;
  const first: BodyMeasurementTiming = {heading: rows.length ? 'Suggested measurement window' : 'Suggested first baseline', dateLabel: null,
    hint: 'Mid-follicular: after bleeding and bloating settle. Keep the same time of day.'};
  const all = periods(mc).filter(period => period.start <= today), latest = all.at(-1);
  const length = integer(mc.cycleLength, 21, 40), usualBleeding = integer(mc.periodLength, 1, 10);
  if (!latest || length === null || usualBleeding === null) return {...first,
    hint: 'Add a period start, cycle length and period length to estimate dates.'};
  const elapsedCycles = Math.floor((dayNumber(today) - dayNumber(latest.start)) / length);
  const cycleStart = addDays(latest.start, elapsedCycles * length);
  const recent = all.slice(-4);
  const needsUpdate = elapsedCycles > 0 || recent.some((period, i) => i > 0
    && Math.abs(dayNumber(period.start) - dayNumber(recent[i - 1]!.start) - length) > 7);
  const explain = (hint: string) => needsUpdate ? `${hint} Update your last period to refine these dates.` : hint;
  const usable = rows.filter(row => validMeasurementDate(row.date) && row.date <= today);
  const mostRecent = [...usable].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const sameMethod = usable.filter(row => row.field === mostRecent?.field).sort((a, b) => a.date.localeCompare(b.date));
  const baselineDay = sameMethod.map(row => {
    const known = context(mc, row.date);
    if (known?.naturalRegular) return known.day;
    const preceding = all.findLast(period => period.start <= row.date);
    // A baseline can itself fall in a projected cycle. Retain a repeatable
    // calendar day without treating the missing period as observed bleeding.
    return preceding ? (dayNumber(row.date) - dayNumber(preceding.start)) % length + 1 : null;
  }).find((day): day is number => day !== null && day <= length);
  if (baselineDay !== undefined) {
    let target = addDays(cycleStart, baselineDay - 1);
    if (target < today || sameMethod.some(row => row.date === target)) target = addDays(target, length);
    return {heading: 'Next comparable measurement', dateLabel: dateRange(target, target),
      hint: explain(`Cycle day ${baselineDay}${needsUpdate ? ' (estimated)' : ''} · repeat the timing of your baseline, when bloating has settled.`)};
  }
  const bleeding = Math.max(usualBleeding, elapsedCycles === 0 && latest.end ? dayNumber(latest.end) - dayNumber(latest.start) + 1 : 0);
  // Centre a short window between bleeding and the calendar-estimated ovulatory phase.
  const follicularEnd = length - 16;
  if (bleeding > 10 || follicularEnd <= bleeding) return first;
  const middle = Math.round((bleeding + 1 + follicularEnd) / 2);
  const startDay = Math.max(bleeding + 1, middle - 1), endDay = Math.min(follicularEnd, middle + 1);
  let start = addDays(cycleStart, startDay - 1), end = addDays(cycleStart, endDay - 1);
  if (end < today) {start = addDays(start, length); end = addDays(end, length);}
  return {...first, dateLabel: dateRange(start, end), hint: explain(first.hint)};
}
