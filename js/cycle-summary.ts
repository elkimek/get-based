// cycle-summary.ts - Compact menstrual-cycle model, migration, and summaries.

export type CycleFlow = 'spotting' | 'light' | 'moderate' | 'heavy';
// Imported metadata remains opaque until an existing consumer interprets it.
export interface CyclePeriod extends Record<string, unknown> {
  id: unknown;
  startDate: string;
  endDate: string;
  flow: CycleFlow;
  symptoms: string[];
  source: string;
  confidence: unknown;
  updatedAt: unknown;
}
interface PeriodDates { startDate: string; endDate?: string | null; flow?: string | null }
interface NormalizeOptions { defaultSource?: string; defaultUpdatedAt?: string }
interface PeriodInput extends Record<string, unknown> { bleeding?: { flow?: unknown } }
interface IntervalRecord { days: number; from: string; to: string }
interface CoverageSource extends Record<string, unknown> { observations?: number; periods?: number; importIds?: readonly unknown[]; importedAt?: unknown }
interface CoverageInput { sources?: Record<string, CoverageSource | null>; observationCount?: unknown; firstDate?: unknown; lastDate?: unknown }
interface ProfileInput extends Record<string, unknown> { coverage?: CoverageInput | null }
interface ObservationInput extends Record<string, unknown> { date: string }
interface CycleStats { cycleLength: number | null; periodLength: number | null; regularity: 'regular' | 'irregular' | 'very_irregular' | null; flow: string | null }
interface NewPeriod {
  startDate: string;
  endDate?: string | null;
  flow?: string;
  symptoms?: string[];
  notes?: string;
  source?: string;
  confidence?: string;
  updatedAt?: string;
  importId?: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_NOW_ISO = () => new Date().toISOString();

const FLOW_RANK: Record<string, number> = {
  spotting: 0,
  light: 1,
  moderate: 2,
  heavy: 3,
};

const FLOW_ALIASES: Record<string, CycleFlow | null> = {
  spot: 'spotting',
  spotting: 'spotting',
  none: null,
  no: null,
  light: 'light',
  low: 'light',
  medium: 'moderate',
  normal: 'moderate',
  moderate: 'moderate',
  heavy: 'heavy',
  high: 'heavy',
};

function isPlainObject<T extends object = Record<string, unknown>>(value: unknown): value is T {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isISODate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function safeDate(value: unknown) {
  if (!isISODate(value)) return null;
  const d = new Date(value + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value ? d : null;
}

function diffDays(a: unknown, b: unknown) {
  const da = safeDate(a);
  const db = safeDate(b);
  if (!da || !db) return null;
  return Math.round((db.getTime() - da.getTime()) / DAY_MS);
}

function addDays(dateStr: string, days: number) {
  const d = safeDate(dateStr);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function mean(nums: readonly number[]) {
  if (!nums.length) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function round(n: number, digits = 0) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function stdev(nums: readonly number[]) {
  if (nums.length < 2) return 0;
  const m = mean(nums) || 0;
  return Math.sqrt(nums.reduce((sum, n) => sum + ((n - m) ** 2), 0) / nums.length);
}

function linearSlope(nums: readonly number[]) {
  if (nums.length < 3) return 0;
  const n = nums.length;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sx += i;
    sy += nums[i]!;
    sxy += i * nums[i]!;
    sxx += i * i;
  }
  const denom = (n * sxx) - (sx * sx);
  return denom === 0 ? 0 : ((n * sxy) - (sx * sy)) / denom;
}

function uniqStrings(values: readonly unknown[] | null | undefined) {
  const out: string[] = [];
  for (const value of values || []) {
    if (value == null) continue;
    const s = String(value).trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

function flowFromCounts(flows: readonly unknown[]): CycleFlow | null {
  const counts: Record<string, number> = {};
  for (const flow of flows) {
    const normalized = normalizeCycleFlow(flow);
    if (!normalized) continue;
    counts[normalized] = (counts[normalized] || 0) + 1;
  }
  const ranked = Object.entries(counts).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return (FLOW_RANK[b[0]] ?? 0) - (FLOW_RANK[a[0]] ?? 0);
  });
  return (ranked[0]?.[0] || null) as CycleFlow | null;
}

function variabilityLabel(intervals: readonly number[]) {
  if (intervals.length < 2) return null;
  const sd = stdev(intervals);
  if (sd <= 2) return 'stable';
  if (sd <= 7) return 'mild';
  return 'high';
}

function regularityFromIntervals(intervals: readonly number[]) {
  if (intervals.length < 2) return null;
  const sd = stdev(intervals);
  if (sd <= 2) return 'regular';
  if (sd <= 7) return 'irregular';
  return 'very_irregular';
}

function periodLength(period: PeriodDates) {
  const days = diffDays(period.startDate, period.endDate || period.startDate);
  return days == null ? null : days + 1;
}

function periodSortAsc(a: PeriodDates, b: PeriodDates) {
  return (a.startDate || '').localeCompare(b.startDate || '');
}

function intervalRecords(periods: unknown) {
  const sorted = normalizeCyclePeriods(periods).sort(periodSortAsc);
  const out: IntervalRecord[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const days = diffDays(sorted[i - 1]!.startDate, sorted[i]!.startDate);
    if (days == null || days < 10 || days > 120) continue;
    out.push({ days, from: sorted[i - 1]!.startDate, to: sorted[i]!.startDate });
  }
  return out;
}

function buildHistoryFlags(intervals: IntervalRecord[], periods: CyclePeriod[]) {
  const flags: string[] = [];
  const recentIntervals = intervals.slice(-12).map(i => i.days);
  if (recentIntervals.length >= 6) {
    const slope = linearSlope(recentIntervals);
    const first = recentIntervals[0]!;
    const last = recentIntervals[recentIntervals.length - 1]!;
    if (slope > 0.35 && last - first >= 4) flags.push('recent cycles slightly lengthening');
    if (slope < -0.35 && first - last >= 4) flags.push('recent cycles shortening');
  }
  const recentPeriods = periods.slice().sort(periodSortAsc).slice(-12);
  const heavy = recentPeriods.filter(p => p.flow === 'heavy').length;
  if (recentPeriods.length >= 4 && heavy / recentPeriods.length >= 0.3) {
    flags.push('heavy flow is common in recent periods');
  }
  const prolonged = recentPeriods.filter(p => {
    const len = periodLength(p);
    return len != null && len >= 8;
  }).length;
  if (recentPeriods.length >= 4 && prolonged / recentPeriods.length >= 0.25) {
    flags.push('some recent periods are prolonged');
  }
  return flags;
}

export function normalizeCycleFlow(flow: unknown): CycleFlow | null {
  if (flow == null) return null;
  const raw = String(flow).trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (!raw) return null;
  const key = raw.split(/\s+/)[0]!;
  if (Object.prototype.hasOwnProperty.call(FLOW_ALIASES, raw)) return FLOW_ALIASES[raw]!;
  if (Object.prototype.hasOwnProperty.call(FLOW_ALIASES, key)) return FLOW_ALIASES[key]!;
  return null;
}

export function normalizeCyclePeriod(period: unknown, {
  defaultSource = 'manual',
  defaultUpdatedAt = DEFAULT_NOW_ISO(),
}: NormalizeOptions = {}): CyclePeriod | null {
  if (!isPlainObject<PeriodInput>(period)) return null;
  const startDate = (period.startDate || period.start || period.date) as string;
  if (!safeDate(startDate)) return null;
  const rawEnd = (period.endDate || period.end || startDate) as string;
  const endDate = safeDate(rawEnd) && (rawEnd >= startDate) ? rawEnd : startDate;
  const source = String(period.source || defaultSource || 'manual').trim() || 'manual';
  const flow = normalizeCycleFlow(period.flow || period.bleeding?.flow) || 'moderate';
  const symptoms = uniqStrings(Array.isArray(period.symptoms) ? period.symptoms : []);
  return {
    ...period,
    id: period.id || `period:${source}:${startDate}`,
    startDate,
    endDate,
    flow,
    symptoms,
    source,
    confidence: period.confidence || 'observed',
    updatedAt: period.updatedAt || defaultUpdatedAt,
  };
}

export function createCyclePeriod({
  startDate,
  endDate,
  flow = 'moderate',
  symptoms = [],
  notes = '',
  source = 'manual',
  confidence = 'observed',
  updatedAt = DEFAULT_NOW_ISO(),
  importId = null,
}: NewPeriod) {
  return normalizeCyclePeriod({
    id: `period:${source}:${startDate}`,
    startDate,
    endDate,
    flow,
    symptoms,
    notes,
    source,
    confidence,
    updatedAt,
    ...(importId ? { importId } : {}),
  }, { defaultSource: source, defaultUpdatedAt: updatedAt });
}

export function normalizeCyclePeriods(periods: unknown, options: NormalizeOptions = {}): CyclePeriod[] {
  if (!Array.isArray(periods)) return [];
  const byStart = new Map<string, CyclePeriod>();
  for (const period of periods) {
    const normalized = normalizeCyclePeriod(period, options);
    if (!normalized) continue;
    const existing = byStart.get(normalized.startDate);
    if (!existing || String(normalized.updatedAt || '') >= String(existing.updatedAt || '')) {
      byStart.set(normalized.startDate, normalized);
    }
  }
  return Array.from(byStart.values()).sort(periodSortAsc);
}

export function summarizeCyclePeriods(periods: unknown) {
  const normalized = normalizeCyclePeriods(periods);
  const lengths = normalized.map(periodLength).filter((v): v is number => v != null && v > 0 && v <= 21);
  const intervals = intervalRecords(normalized).map(r => r.days);
  const recentPeriods = normalized.slice(-12);
  const flow = flowFromCounts(recentPeriods.map(p => p.flow));
  const avgPeriod = mean(lengths);
  const avgCycle = mean(intervals);
  return {
    cycleLength: avgCycle == null ? null : clamp(Math.round(avgCycle), 20, 90),
    periodLength: avgPeriod == null ? null : clamp(Math.round(avgPeriod), 1, 14),
    regularity: regularityFromIntervals(intervals),
    flow,
  };
}

export function calculateCycleStats(periods: PeriodDates[] | null | undefined) {
  const result: CycleStats = { cycleLength: null, periodLength: null, regularity: null, flow: null };
  if (!periods || periods.length === 0) return result;
  const sorted = periods.slice().sort((a, b) => a.startDate.localeCompare(b.startDate));

  const periodLengths = sorted.filter(p => p.endDate).map(p => {
    const start = new Date(p.startDate + 'T00:00:00');
    const end = new Date(p.endDate + 'T00:00:00');
    return Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
  });
  if (periodLengths.length > 0) {
    const avgPeriod = Math.round(mean(periodLengths)!);
    result.periodLength = clamp(avgPeriod, 2, 10);
  }

  const recent = sorted.slice(-6).filter(p => p.flow);
  if (recent.length > 0) {
    const counts: Record<string, number> = {};
    for (const p of recent) counts[p.flow!] = (counts[p.flow!] || 0) + 1;
    result.flow = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0];
  }

  if (sorted.length >= 2) {
    const cycleLengths: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1]!.startDate + 'T00:00:00');
      const curr = new Date(sorted[i]!.startDate + 'T00:00:00');
      cycleLengths.push(Math.round((curr.getTime() - prev.getTime()) / DAY_MS));
    }
    const avgCycle = Math.round(mean(cycleLengths)!);
    // Preserve long irregular and perimenopause cycles; the former 45-day
    // ceiling shifted predicted draw windows by weeks.
    result.cycleLength = clamp(avgCycle, 20, 90);
    if (cycleLengths.length >= 2) {
      result.regularity = regularityFromIntervals(cycleLengths);
    }
  }

  return result;
}

export function buildCycleHistorySummary(periods: unknown) {
  const normalized = normalizeCyclePeriods(periods);
  const intervals = intervalRecords(normalized);
  const intervalDays = intervals.map(i => i.days);
  const recentIntervals = intervals.slice(-12).map(i => i.days);
  const recentPeriods = normalized.slice(-12);
  const lastStart = normalized[normalized.length - 1]?.startDate || null;
  const cutoff = lastStart ? addDays(lastStart, -365) : null;
  const lastYearIntervals = cutoff
    ? intervals.filter(i => i.to >= cutoff).map(i => i.days)
    : [];
  const heavyRecent = recentPeriods.filter(p => p.flow === 'heavy').length;
  const avgRecent = mean(recentIntervals);
  const avgLastYear = mean(lastYearIntervals);
  const avgAll = mean(intervalDays);
  return {
    recent12: {
      avgCycle: avgRecent == null ? null : Math.round(avgRecent),
      range: recentIntervals.length ? [Math.min(...recentIntervals), Math.max(...recentIntervals)] : null,
      heavyRate: recentPeriods.length ? round(heavyRecent / recentPeriods.length, 2) : null,
      variability: variabilityLabel(recentIntervals),
    },
    last12Months: {
      avgCycle: avgLastYear == null ? null : Math.round(avgLastYear),
      variability: variabilityLabel(lastYearIntervals),
      cycleCount: lastYearIntervals.length,
    },
    allTime: {
      avgCycle: avgAll == null ? null : Math.round(avgAll),
      periodCount: normalized.length,
    },
    flags: buildHistoryFlags(intervals, normalized),
  };
}

export function buildCycleCoverage(periods: unknown, previousCoverage: CoverageInput | null = null) {
  const normalized = normalizeCyclePeriods(periods);
  const previousSources = isPlainObject<Record<string, CoverageSource | null>>(previousCoverage?.sources) ? previousCoverage.sources : {};
  const sources: Record<string, CoverageSource> = {};
  for (const [source, info] of Object.entries(previousSources)) {
    if ((info?.observations || 0) > 0 || (info?.periods || 0) > 0 || info?.importIds?.length) {
      sources[source] = { ...info, periods: 0 };
    }
  }
  for (const p of normalized) {
    const source = p.source || 'manual';
    const curr = sources[source] || { importedAt: null, periods: 0, observations: 0 };
    curr.periods = (curr.periods || 0) + 1;
    if (!curr.importedAt || String(p.updatedAt || '') > String(curr.importedAt || '')) {
      curr.importedAt = p.updatedAt || curr.importedAt || null;
    }
    sources[source] = curr;
  }
  const observationCount = Number(previousCoverage?.observationCount) || 0;
  const coverageDates: unknown[] = normalized.flatMap(period => [period.startDate, period.endDate]).filter(Boolean);
  if (observationCount > 0) {
    if (previousCoverage?.firstDate) coverageDates.push(previousCoverage.firstDate);
    if (previousCoverage?.lastDate) coverageDates.push(previousCoverage.lastDate);
  }
  coverageDates.sort();
  return {
    firstDate: coverageDates[0] || null,
    lastDate: coverageDates[coverageDates.length - 1] || null,
    periodCount: normalized.length,
    observationCount,
    sources,
  };
}

export function upgradeMenstrualCycleProfile(mc: unknown, {
  now = DEFAULT_NOW_ISO(),
  defaultSource = 'manual',
}: { now?: string; defaultSource?: string } = {}) {
  if (!isPlainObject<ProfileInput>(mc)) return null;
  const periods = normalizeCyclePeriods(mc.periods || [], {
    defaultSource,
    defaultUpdatedAt: now,
  });
  const stats = summarizeCyclePeriods(periods);
  const cycleStatus = mc.cycleStatus || mc.status || 'regular';
  const next: Record<string, unknown> & { periods: CyclePeriod[]; coverage: ReturnType<typeof buildCycleCoverage>; historySummary: ReturnType<typeof buildCycleHistorySummary> } = {
    ...mc,
    schemaVersion: 2,
    cycleStatus,
    contraceptive: mc.contraceptive || mc.contraception || '',
    conditions: mc.conditions || '',
    cycleLength: stats.cycleLength ?? mc.cycleLength ?? 28,
    periodLength: stats.periodLength ?? mc.periodLength ?? 5,
    regularity: stats.regularity ?? mc.regularity ?? 'regular',
    flow: stats.flow ?? mc.flow ?? 'moderate',
    coverage: buildCycleCoverage(periods, mc.coverage || null),
    periods,
    historySummary: buildCycleHistorySummary(periods),
  };
  delete next.status;
  delete next.contraception;
  return next;
}

function observationFlow(row: unknown) {
  if (!isPlainObject(row)) return null;
  const bleeding = isPlainObject(row.bleeding) ? row.bleeding : {};
  if (bleeding.excluded === true || row.excluded === true) return null;
  return normalizeCycleFlow(bleeding.flow || row.flow || row.bleeding);
}

export function isCycleBleedingObservation(row: unknown) {
  return !!observationFlow(row);
}

export function stitchCyclePeriodsFromObservations(observations: unknown, {
  source = 'import',
  importId = null,
  updatedAt = DEFAULT_NOW_ISO(),
}: { source?: string; importId?: string | null; updatedAt?: string } = {}) {
  const rows = ((Array.isArray(observations) ? observations : [])
    .filter((row: unknown) => isPlainObject(row) && isISODate(row.date) && observationFlow(row))
    .slice() as ObservationInput[])
    .sort((a, b) => a.date.localeCompare(b.date));
  const periods: CyclePeriod[] = [];
  let current: { days: { date: string; flow: CycleFlow | null }[]; symptoms: unknown[] } | null = null;
  let prevDate: string | null = null;
  const closeCurrent = () => {
    if (!current) return;
    const menstrualDays = current.days.filter(day => day.flow !== 'spotting');
    if (menstrualDays.length === 0) {
      current = null;
      return;
    }
    const flow = flowFromCounts(menstrualDays.map(day => day.flow)) || 'moderate';
    periods.push({
      id: `period:${source}:${menstrualDays[0]!.date}`,
      startDate: menstrualDays[0]!.date,
      endDate: menstrualDays[menstrualDays.length - 1]!.date,
      flow,
      symptoms: uniqStrings(current.symptoms),
      source,
      confidence: 'observed',
      updatedAt,
      ...(importId ? { importId } : {}),
    });
    current = null;
  };
  for (const row of rows) {
    const gap = prevDate ? diffDays(prevDate, row.date) : null;
    if (!current || gap == null || gap > 1) {
      closeCurrent();
      current = { days: [], symptoms: [] };
    }
    current.days.push({ date: row.date, flow: observationFlow(row) });
    if (Array.isArray(row.symptoms)) current.symptoms.push(...row.symptoms);
    prevDate = row.date;
  }
  closeCurrent();
  return periods;
}

export function recentCyclePeriods(mc: { periods?: unknown } | null | undefined, count = 12) {
  return normalizeCyclePeriods(mc?.periods || []).sort((a, b) => b.startDate.localeCompare(a.startDate)).slice(0, count);
}

export function isHormonalContraception(value: unknown) {
  const raw = String(value || '').toLowerCase();
  if (!raw) return false;
  return ['ocp', 'pill', 'patch', 'ring', 'implant', 'mirena', 'hormonal iud', 'depo', 'injection']
    .some(term => raw.includes(term));
}
