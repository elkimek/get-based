// supplement-medication-domain.js — Compatibility-first therapy history model.

import { createUniqueId } from './unique-id.js';
import type { SupplementRecord } from '../types/supplement-data.js';
type StoredSupplementPeriod = NonNullable<SupplementRecord['periods']>[number];

export interface SupplementScheduleView extends Record<string, unknown> {
  mode?: unknown; timesPerDay?: unknown; details?: unknown; daysOfWeek?: unknown;
  intervalDays?: unknown; maxPerDay?: unknown;
}
export interface SupplementIngredientView extends Record<string, unknown> {
  name?: unknown; amount?: unknown; amountValue?: unknown; amountUnit?: unknown; timesPerDay?: unknown;
}
export interface SupplementDoseView extends Record<string, unknown> {
  ingredient?: unknown; source?: unknown; basis?: unknown; value?: unknown; unit?: unknown; text?: unknown;
}
export interface SupplementPeriodView extends Record<string, unknown> {
  start?: unknown; end?: unknown; dose?: string | SupplementDoseView | null;
  ingredientDoses?: SupplementDoseView[] | null; schedule?: SupplementScheduleView | null | undefined;
}
export interface SupplementPeriod extends SupplementPeriodView { start: string; end: string | null }
export interface SupplementDomainRecord extends Record<string, unknown> {
  id?: unknown; name?: unknown; startDate?: unknown; endDate?: unknown; type?: unknown; schemaVersion?: unknown;
  periods?: unknown; lifecycle?: { state?: unknown } | null; schedule?: SupplementScheduleView | null | undefined;
  ingredients?: SupplementIngredientView[] | null; timesPerDay?: unknown;
}
type SupplementInput = SupplementDomainRecord | null | undefined;
type SupplementHistoryRecord = SupplementDomainRecord & { periods: SupplementPeriodView[] };
type CalendarValue = Date | number | string;

export const SUPPLEMENT_RECORD_VERSION = 2;
export const CORRELATION_LAGS = [0, 7, 14, 30, 60, 90];

export const SUPPLEMENT_UNIT_OPTIONS = [
  { value: '', label: 'No unit' },
  { value: 'mg', label: 'mg' },
  { value: 'mcg', label: 'mcg (µg)' },
  { value: 'g', label: 'g' },
  { value: 'mL', label: 'mL' },
  { value: 'IU', label: 'IU' },
  { value: 'CFU', label: 'CFU' },
  { value: '%', label: '%' },
  { value: 'mmol', label: 'mmol' },
  { value: 'mEq', label: 'mEq' },
  { value: 'units', label: 'units' },
  { value: 'capsule', label: 'capsule(s)' },
  { value: 'tablet', label: 'tablet(s)' },
  { value: 'drop', label: 'drop(s)' },
  { value: 'scoop', label: 'scoop(s)' },
  { value: 'spray', label: 'spray(s)' },
  { value: 'patch', label: 'patch(es)' },
];

const UNIT_ALIASES = new Map([
  ['µg', 'mcg'], ['μg', 'mcg'], ['ug', 'mcg'],
  ['ml', 'mL'], ['iu', 'IU'], ['i.u.', 'IU'], ['cfu', 'CFU'],
  // Product labels keep their original language, while common measurement
  // units are normalized so imported strengths work with the same controls.
  ['мкг', 'mcg'], ['мг', 'mg'], ['г', 'g'], ['мл', 'mL'],
  ['ме', 'IU'], ['м.е.', 'IU'], ['ед', 'units'], ['ед.', 'units'], ['кое', 'CFU'],
  ['ملغ', 'mg'], ['مجم', 'mg'], ['مكغ', 'mcg'], ['ميكروغرام', 'mcg'], ['میكروغرام', 'mcg'],
  ['غ', 'g'], ['مل', 'mL'],
  ['מקג', 'mcg'], ['מק״ג', 'mcg'], ['מק"ג', 'mcg'],
  ['מג', 'mg'], ['מ״ג', 'mg'], ['מ"ג', 'mg'], ['גרם', 'g'],
  ['מל', 'mL'], ['מ״ל', 'mL'], ['מ"ל', 'mL'],
  ['微克', 'mcg'], ['毫克', 'mg'], ['克', 'g'], ['毫升', 'mL'],
  ['国际单位', 'IU'], ['國際單位', 'IU'],
  ['マイクログラム', 'mcg'], ['ミリグラム', 'mg'], ['グラム', 'g'],
  ['ミリリットル', 'mL'], ['国際単位', 'IU'],
  ['마이크로그램', 'mcg'], ['밀리그램', 'mg'], ['그램', 'g'],
  ['밀리리터', 'mL'], ['국제단위', 'IU'],
  ['माइक्रोग्राम', 'mcg'], ['मिलीग्राम', 'mg'], ['ग्राम', 'g'],
  ['मिलीलीटर', 'mL'], ['अंतरराष्ट्रीय इकाई', 'IU'],
  ['ไมโครกรัม', 'mcg'], ['มิลลิกรัม', 'mg'], ['กรัม', 'g'], ['มิลลิลิตร', 'mL'],
  ['meq', 'mEq'], ['capsules', 'capsule'], ['caps', 'capsule'],
  ['tablets', 'tablet'], ['tabs', 'tablet'], ['drops', 'drop'],
  ['scoops', 'scoop'], ['sprays', 'spray'], ['patches', 'patch'],
]);

const SAFE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function djb2(str: string) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function isSafeDate(value: unknown): value is string {
  return typeof value === 'string' && SAFE_DATE.test(value)
    && Number.isFinite(new Date(`${value}T00:00:00`).getTime());
}

/**
 * Local calendar key. Health usage changes should not jump dates at UTC midnight.
 */
export function localDateKey(value: CalendarValue = Date.now()) {
  if (typeof value === 'string' && isSafeDate(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function legacySupplementId(supplement: SupplementInput) {
  if (!supplement || typeof supplement !== 'object') return null;
  const sig = `${supplement.name || ''}|${supplement.startDate || ''}|${supplement.type || ''}`;
  return sig === '||' ? null : `s_${djb2(sig)}`;
}

export function getSupplementRecordId(supplement: SupplementInput) {
  if (typeof supplement?.id === 'string' && /^[a-zA-Z0-9_.-]+$/.test(supplement.id)) {
    return supplement.id;
  }
  return legacySupplementId(supplement);
}

export function createSupplementRecordId() {
  return createUniqueId('sm_');
}

/**
 * Preserve the original array and period objects. Consumers decide whether to
 * ignore invalid/draft dates; migrations never delete or rewrite them.
 */
export function getSupplementPeriods(supplement: Pick<Partial<SupplementRecord>, 'startDate' | 'endDate' | 'periods'> | null | undefined): StoredSupplementPeriod[];
export function getSupplementPeriods(supplement: SupplementInput): SupplementPeriodView[];
export function getSupplementPeriods(supplement: SupplementInput): SupplementPeriodView[] {
  if (Array.isArray(supplement?.periods) && supplement.periods.length > 0) {
    return supplement.periods as SupplementPeriodView[];
  }
  return [{ start: supplement?.startDate || '', end: supplement?.endDate || null }] as SupplementPeriodView[];
}

// Date guards precede spread/getter rereads; copied date leaves remain opaque.
export function getValidSupplementPeriods(supplement: SupplementInput): SupplementPeriodView[] {
  return getSupplementPeriods(supplement)
    .filter(period => period && isSafeDate(period.start))
    .map(period => ({ ...period, end: isSafeDate(period.end) ? period.end : null }))
    .sort((a, b) => (a.start as { localeCompare(other: unknown): number }).localeCompare(b.start));
}

export function supplementPeriodContains(period: SupplementPeriodView | null | undefined, date: unknown) {
  return !!period && isSafeDate(period.start) && isSafeDate(date)
    && period.start <= date && (!isSafeDate(period.end) || date <= period.end);
}

/**
 * Status is derived from periods. The explicit lifecycle state only separates
 * a deliberate pause from a completed course after all open periods are closed.
 */
export function getSupplementStatus(supplement: SupplementInput, asOf: CalendarValue = Date.now()) {
  const date = localDateKey(asOf);
  const periods = getValidSupplementPeriods(supplement);
  if (!date || periods.length === 0) return 'planned';

  const explicitState = supplement?.lifecycle?.state;
  const hasOpenPeriod = periods.some(period => (period.start as string) <= date && !period.end);
  if (hasOpenPeriod) return 'active';
  const hasPastPeriod = periods.some(period => (period.start as string) <= date);
  if (!hasPastPeriod && periods.some(period => (period.start as string) > date)) return 'scheduled';
  if (explicitState === 'paused') return 'paused';
  if (explicitState === 'ended') return 'ended';
  if (periods.some(period => supplementPeriodContains(period, date))) return 'active';
  if (periods.some(period => (period.start as string) > date)) return hasPastPeriod ? 'paused' : 'scheduled';
  return 'ended';
}

export function isSupplementCurrent(supplement: SupplementInput, asOf: CalendarValue = Date.now()) {
  return getSupplementStatus(supplement, asOf) === 'active';
}

/**
 * Whether a deterministic scheduled exposure is expected on this date.
 * PRN use is intentionally never assumed; callers need an actual-use log.
 */
export function isSupplementExpectedOnDate(supplement: SupplementInput, asOf: CalendarValue = Date.now()) {
  const dateKey = localDateKey(asOf);
  if (!isSupplementCurrent(supplement, dateKey)) return false;
  const schedule = supplement?.schedule;
  const mode = schedule?.mode || 'daily';
  if (mode === 'prn') return false;
  const date = new Date(`${dateKey}T12:00:00`);
  if (mode === 'selected-days') {
    return Array.isArray(schedule!.daysOfWeek) && schedule!.daysOfWeek.includes(date.getDay());
  }
  if (mode === 'interval') {
    const intervalDays = Number(schedule!.intervalDays);
    const anchor = getValidSupplementPeriods(supplement)
      .filter(period => (period.start as string) <= dateKey && (!period.end || dateKey <= (period.end as string)))
      .at(-1)?.start;
    if (!anchor || !Number.isInteger(intervalDays) || intervalDays < 1) return false;
    const elapsedDays = Math.round((date.getTime() - new Date(`${anchor}T12:00:00`).getTime()) / 86400000);
    return elapsedDays >= 0 && elapsedDays % intervalDays === 0;
  }
  return true;
}

export function getCurrentSupplements<T extends SupplementInput>(supplements: T[], asOf: CalendarValue = Date.now()) {
  return (Array.isArray(supplements) ? supplements : [])
    .filter(supplement => isSupplementCurrent(supplement, asOf));
}

export function getUpcomingSupplements<T extends SupplementInput>(supplements: T[], asOf: CalendarValue = Date.now()) {
  return (Array.isArray(supplements) ? supplements : [])
    .filter(supplement => getSupplementStatus(supplement, asOf) === 'scheduled');
}

export function getInactiveSupplements<T extends SupplementInput>(supplements: T[], asOf: CalendarValue = Date.now()) {
  return (Array.isArray(supplements) ? supplements : [])
    .filter(supplement => ['paused', 'ended', 'planned'].includes(getSupplementStatus(supplement, asOf)));
}

/**
 * Used by charts/reports/lab context where historical overlap is intentional.
 */
export function supplementOverlapsRange(supplement: SupplementInput, start: unknown, end: unknown) {
  if (!isSafeDate(start) || !isSafeDate(end)) return false;
  return getValidSupplementPeriods(supplement).some(period => {
    const periodEnd = period.end || '9999-12-31';
    return (period.start as string) <= end && start <= (periodEnd as string);
  });
}

export function getSupplementsOverlappingRange<T extends SupplementInput>(supplements: T[], start: unknown, end: unknown) {
  return (Array.isArray(supplements) ? supplements : [])
    .filter(supplement => supplementOverlapsRange(supplement, start, end));
}

export function normalizeSupplementUnit(rawUnit: unknown) {
  const trimmed = typeof rawUnit === 'string' ? rawUnit.trim() : '';
  if (!trimmed) return '';
  return UNIT_ALIASES.get(trimmed.toLowerCase()) || trimmed;
}

/**
 * Parses display quantities without discarding their original representation.
 * Supports decimal comma and grouped thousands; unknown units remain intact.
 */
export function parseSupplementQuantity(raw: unknown) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const text = raw.trim();
  const match = text.match(/^([+-]?(?:\d{1,3}(?:[ ,.]\d{3})+|\d+)(?:[.,]\d+)?)\s*([^\d\s.,].*?)?$/u);
  if (!match) return null;
  let numeric = match[1]!.replace(/\s/g, '');
  // Older imports may use a dot for grouping. A nonzero single group of
  // three decimal digits is ambiguous without locale/structured metadata.
  if (/^[1-9]\d{0,2}\.\d{3}$/.test(numeric)) return null;
  const commaCount = (numeric.match(/,/g) || []).length;
  const dotCount = (numeric.match(/\./g) || []).length;
  if (commaCount && dotCount) {
    const decimal = numeric.lastIndexOf(',') > numeric.lastIndexOf('.') ? ',' : '.';
    numeric = numeric.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.');
  } else if (commaCount === 1 && !dotCount) {
    const [, tail = ''] = numeric.split(',');
    numeric = tail.length === 3 && /^[1-9]\d{0,2},\d{3}$/.test(numeric)
      ? numeric.replace(',', '') : numeric.replace(',', '.');
  } else if (dotCount > 1) {
    // A single dot is decimal, including 0.500. Repeated separators must
    // form complete thousands groups; never turn malformed text into a dose.
    if (!/^[1-9]\d{0,2}(\.\d{3})+$/.test(numeric)) return null;
    numeric = numeric.replace(/\./g, '');
  } else if (commaCount > 1) {
    if (!/^[1-9]\d{0,2}(,\d{3})+$/.test(numeric)) return null;
    numeric = numeric.replace(/,/g, '');
  }
  const value = Number(numeric);
  if (!Number.isFinite(value)) return null;
  return {
    value,
    unit: normalizeSupplementUnit(match[2] || ''),
    raw: text,
  };
}

export function getIngredientQuantity(ingredient: SupplementIngredientView | null | undefined) {
  const structuredValue = Number(ingredient?.amountValue);
  if (ingredient && ingredient.amountValue !== '' && ingredient.amountValue != null && Number.isFinite(structuredValue)) {
    return {
      value: structuredValue,
      unit: normalizeSupplementUnit(ingredient.amountUnit || ''),
      raw: typeof ingredient.amount === 'string' ? ingredient.amount : '',
    };
  }
  return parseSupplementQuantity(ingredient?.amount);
}

export function formatSupplementAmount(value: unknown, unit?: unknown) {
  const rawValue = typeof value === 'number' ? String(value) : String(value || '').trim();
  const normalizedUnit = normalizeSupplementUnit(unit);
  return `${rawValue}${rawValue && normalizedUnit ? ' ' : ''}${normalizedUnit}`.trim();
}

/**
 * Add only compatibility metadata. No periods, amounts, timestamps, or custom
 * keys are rewritten, so the operation is idempotent and mixed-client safe.
 */
export function migrateSupplementMedicationRecords<T>(data: T): T {
  if (!data || typeof data !== 'object') return data;
  if (!Array.isArray((data as { supplements?: unknown }).supplements)) {
    if ((data as { supplements?: unknown }).supplements === undefined) (data as { supplements?: unknown }).supplements = [];
    return data;
  }
  for (const supplement of (data as unknown as { supplements: Array<SupplementDomainRecord | null | undefined> }).supplements) {
    if (!supplement || typeof supplement !== 'object' || Array.isArray(supplement)) continue;
    if (!getSupplementRecordId(supplement)) continue;
    if (!supplement.id) supplement.id = legacySupplementId(supplement);
    if (supplement.schemaVersion === undefined) supplement.schemaVersion = SUPPLEMENT_RECORD_VERSION;
  }
  return data;
}

/** Render both existing free-text doses and structured imported doses losslessly. */
export function supplementDoseText(dose: unknown) {
  if (typeof dose === 'string') return dose;
  if (!dose || typeof dose !== 'object') return '';
  if (typeof (dose as SupplementDoseView).text === 'string') return (dose as SupplementDoseView).text;
  return (dose as SupplementDoseView).value != null ? `${(dose as SupplementDoseView).value}${(dose as SupplementDoseView).unit ? ` ${(dose as SupplementDoseView).unit}` : ''}${(dose as SupplementDoseView).basis === 'day' ? '/day' : ''}` : '';
}

/** Save today's schedule without projecting it into older historical periods. */
export function recordSupplementSchedule(previous: SupplementInput, periods: StoredSupplementPeriod[], schedule: SupplementScheduleView, today = localDateKey()) {
  const result = periods.map(period => ({ ...period }));
  const signature = (value: SupplementScheduleView | null | undefined) => JSON.stringify([
    value?.mode || 'daily', value?.timesPerDay ?? null, value?.details || '',
    value?.daysOfWeek || [], value?.intervalDays ?? null, value?.maxPerDay ?? null,
  ]);
  const previousSchedule = previous?.schedule || { mode: Number(previous?.timesPerDay) > 1 ? 'multiple' : 'daily', timesPerDay: previous?.timesPerDay ?? null };
  const changed = previous && signature(previousSchedule) !== signature(schedule);
  const open = result.find(period => period.start <= today && (!period.end || period.end >= today));
  if (open && changed && open.start < today) {
    const yesterday = new Date(`${today}T12:00:00`);
    yesterday.setDate(yesterday.getDate() - 1);
    const next = { ...open, start: today, schedule: { ...schedule } as NonNullable<SupplementRecord['schedule']> };
    open.end = localDateKey(yesterday);
    result.push(next);
  } else if (open?.start === today) {
    open.schedule = { ...schedule } as NonNullable<SupplementRecord['schedule']>;
  }
  return result;
}

// Effective timesPerDay for an ingredient: row override wins, else the supp-level default.
export function effectiveTimesPerDay(ing: SupplementIngredientView | null | undefined, supp?: SupplementInput) {
  if (ing && (ing.timesPerDay === 0 || ing.timesPerDay)) return Number(ing.timesPerDay);
  if (supp?.schedule?.mode === 'prn') return null;
  if (supp?.schedule && (supp.schedule.timesPerDay === 0 || supp.schedule.timesPerDay)) return Number(supp.schedule.timesPerDay);
  if (supp && (supp.timesPerDay === 0 || supp.timesPerDay)) return Number(supp.timesPerDay);
  return null;
}

// Compute daily total when amount is parseable and there's an effective timesPerDay.
export function ingredientDailyTotal(ing: SupplementIngredientView | null | undefined, supp?: SupplementInput) {
  const times = effectiveTimesPerDay(ing, supp);
  if (!ing || !times) return null;
  const parsed = getIngredientQuantity(ing);
  if (!parsed) return null;
  const total = parsed.value * times;
  if (!isFinite(total)) return null;
  return { value: total, unit: parsed.unit, times };
}


/** Current ingredient totals are a reference, never a historical dose by default. */
export function getSupplementDailyDoses(record: SupplementInput) {
  if (!['daily', 'multiple'].includes((record?.schedule?.mode || 'daily') as string)) return [];
  const ingredients = record?.ingredients || [];
  return ingredients.flatMap(ingredient => {
    const name = (ingredient.name as { trim(): unknown } | null | undefined)?.trim();
    if (!name || ingredients.filter(i => (i.name as { trim(): { toLowerCase(): unknown } } | null | undefined)?.trim().toLowerCase() === (name as { toLowerCase(): unknown }).toLowerCase()).length !== 1) return [];
    const total = ingredientDailyTotal(ingredient, record);
    if (!total || total.value <= 0 || !SUPPLEMENT_UNIT_OPTIONS.some(u => u.value === total.unit && u.value && u.value !== '%')) return [];
    return [{ value: total.value, unit: total.unit, basis: 'day' as const, ingredient: name, source: 'ingredient' as const }];
  });
}

/** Snapshot the saved regimen from today; earlier unknown amounts stay unknown.
 */
export function recordIngredientDoseChange(entry: SupplementHistoryRecord, today = localDateKey(), savedRecord: SupplementInput = null) {
  const open = entry.periods.find(p => (p.start as string) <= today && (!p.end || (p.end as string) >= today));
  if (!open || (open.dose && (open.dose as SupplementDoseView).source !== 'ingredient' && !Array.isArray(open.ingredientDoses))) return;
  const next = getSupplementDailyDoses(entry);
  const previous = Array.isArray(open.ingredientDoses) ? open.ingredientDoses : (open.dose as SupplementDoseView | null | undefined)?.source === 'ingredient' ? [open.dose as SupplementDoseView] : [];
  const signature = (doses: SupplementDoseView[]) => JSON.stringify(doses.map(d => [d.ingredient, d.value, d.unit, d.basis]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  if (signature(next) === signature(previous)) return;
  // Unchanged ingredients must not recreate a period removed during a date
  // correction, including on subsequent saves. Earlier dates need confirmation.
  if (savedRecord && (open.start as string) < today
      && signature(next) === signature(getSupplementDailyDoses(savedRecord))) return;
  let target = open;
  if ((open.start as string) < today) {
    const yesterday = new Date(`${today}T12:00:00`);
    yesterday.setDate(yesterday.getDate() - 1);
    target = { ...open, start: today };
    open.end = localDateKey(yesterday);
    entry.periods.push(target);
  }
  target.schedule = { ...entry.schedule };
  target.ingredientDoses = next;
  if (next.length === 1) target.dose = { ...next[0] };
  else delete target.dose;
}


/** Explicitly link current ingredient totals to one existing, undosed period. */
export function confirmIngredientDosePeriod(record: SupplementInput, periodIndex: number) {
  const periods = getSupplementPeriods(record);
  const period = periods[periodIndex];
  const doses = getSupplementDailyDoses(record);
  const validDate = (date: unknown) => isSafeDate(date) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
  if (!period || period.dose || period.ingredientDoses?.length || !doses.length) return null;
  if (periods.some(p => !p || !validDate(p.start) || (p.end && (!validDate(p.end) || (p.end as string) < (p.start as string))))) return null;
  const ordered = [...periods].sort((a, b) => (a.start as { localeCompare(other: unknown): number }).localeCompare(b.start));
  if (ordered.some((p, i) => i > 0 && (!ordered[i - 1]!.end || (ordered[i - 1]!.end as string) >= (p.start as string)))) return null;
  return { ...record, updatedAt: Date.now(), periods: periods.map((p, i) => i === periodIndex
    ? { ...p, end: p.end || null, ingredientDoses: doses, ...(doses.length === 1 ? { dose: doses[0] } : {}), schedule: p.schedule ? { ...p.schedule } : { mode: 'daily' } }
    : { ...p }) };
}
