// @ts-check
// supplement-medication-domain.js — Compatibility-first therapy history model.

import { createUniqueId } from './unique-id.js';

export const SUPPLEMENT_RECORD_VERSION = 2;

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

/** @param {string} str */
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** @param {unknown} value */
function isSafeDate(value) {
  return typeof value === 'string' && SAFE_DATE.test(value)
    && Number.isFinite(new Date(`${value}T00:00:00`).getTime());
}

/**
 * Local calendar key. Health usage changes should not jump dates at UTC midnight.
 * @param {Date | number | string} [value]
 */
export function localDateKey(value = Date.now()) {
  if (typeof value === 'string' && isSafeDate(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** @param {any} supplement */
export function legacySupplementId(supplement) {
  if (!supplement || typeof supplement !== 'object') return null;
  const sig = `${supplement.name || ''}|${supplement.startDate || ''}|${supplement.type || ''}`;
  return sig === '||' ? null : `s_${djb2(sig)}`;
}

/** @param {any} supplement */
export function getSupplementRecordId(supplement) {
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
 * @param {any} supplement
 */
export function getSupplementPeriods(supplement) {
  if (Array.isArray(supplement?.periods) && supplement.periods.length > 0) {
    return supplement.periods;
  }
  return [{ start: supplement?.startDate || '', end: supplement?.endDate || null }];
}

/** @param {any} supplement */
export function getValidSupplementPeriods(supplement) {
  return getSupplementPeriods(supplement)
    .filter(period => period && isSafeDate(period.start))
    .map(period => ({ ...period, end: isSafeDate(period.end) ? period.end : null }))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** @param {any} period @param {string} date */
export function supplementPeriodContains(period, date) {
  return !!period && isSafeDate(period.start) && isSafeDate(date)
    && period.start <= date && (!isSafeDate(period.end) || date <= period.end);
}

/**
 * Status is derived from periods. The explicit lifecycle state only separates
 * a deliberate pause from a completed course after all open periods are closed.
 * @param {any} supplement
 * @param {Date | number | string} [asOf]
 * @returns {'active'|'scheduled'|'paused'|'ended'|'planned'}
 */
export function getSupplementStatus(supplement, asOf = Date.now()) {
  const date = localDateKey(asOf);
  const periods = getValidSupplementPeriods(supplement);
  if (!date || periods.length === 0) return 'planned';

  const explicitState = supplement?.lifecycle?.state;
  const hasOpenPeriod = periods.some(period => period.start <= date && !period.end);
  if (hasOpenPeriod) return 'active';
  const hasPastPeriod = periods.some(period => period.start <= date);
  if (!hasPastPeriod && periods.some(period => period.start > date)) return 'scheduled';
  if (explicitState === 'paused') return 'paused';
  if (explicitState === 'ended') return 'ended';
  if (periods.some(period => supplementPeriodContains(period, date))) return 'active';
  if (periods.some(period => period.start > date)) return hasPastPeriod ? 'paused' : 'scheduled';
  return 'ended';
}

/** @param {any} supplement @param {Date | number | string} [asOf] */
export function isSupplementCurrent(supplement, asOf = Date.now()) {
  return getSupplementStatus(supplement, asOf) === 'active';
}

/**
 * Whether a deterministic scheduled exposure is expected on this date.
 * PRN use is intentionally never assumed; callers need an actual-use log.
 * @param {any} supplement
 * @param {Date | number | string} [asOf]
 */
export function isSupplementExpectedOnDate(supplement, asOf = Date.now()) {
  const dateKey = localDateKey(asOf);
  if (!isSupplementCurrent(supplement, dateKey)) return false;
  const schedule = supplement?.schedule;
  const mode = schedule?.mode || 'daily';
  if (mode === 'prn') return false;
  const date = new Date(`${dateKey}T12:00:00`);
  if (mode === 'selected-days') {
    return Array.isArray(schedule.daysOfWeek) && schedule.daysOfWeek.includes(date.getDay());
  }
  if (mode === 'interval') {
    const intervalDays = Number(schedule.intervalDays);
    const anchor = getValidSupplementPeriods(supplement)
      .filter(period => period.start <= dateKey && (!period.end || dateKey <= period.end))
      .at(-1)?.start;
    if (!anchor || !Number.isInteger(intervalDays) || intervalDays < 1) return false;
    const elapsedDays = Math.round((date.getTime() - new Date(`${anchor}T12:00:00`).getTime()) / 86400000);
    return elapsedDays >= 0 && elapsedDays % intervalDays === 0;
  }
  return true;
}

/** @param {any[]} supplements @param {Date | number | string} [asOf] */
export function getCurrentSupplements(supplements, asOf = Date.now()) {
  return (Array.isArray(supplements) ? supplements : [])
    .filter(supplement => isSupplementCurrent(supplement, asOf));
}

/** @param {any[]} supplements @param {Date | number | string} [asOf] */
export function getUpcomingSupplements(supplements, asOf = Date.now()) {
  return (Array.isArray(supplements) ? supplements : [])
    .filter(supplement => getSupplementStatus(supplement, asOf) === 'scheduled');
}

/** @param {any[]} supplements @param {Date | number | string} [asOf] */
export function getInactiveSupplements(supplements, asOf = Date.now()) {
  return (Array.isArray(supplements) ? supplements : [])
    .filter(supplement => ['paused', 'ended', 'planned'].includes(getSupplementStatus(supplement, asOf)));
}

/**
 * Used by charts/reports/lab context where historical overlap is intentional.
 * @param {any} supplement
 * @param {string} start
 * @param {string} end
 */
export function supplementOverlapsRange(supplement, start, end) {
  if (!isSafeDate(start) || !isSafeDate(end)) return false;
  return getValidSupplementPeriods(supplement).some(period => {
    const periodEnd = period.end || '9999-12-31';
    return period.start <= end && start <= periodEnd;
  });
}

/** @param {any[]} supplements @param {string} start @param {string} end */
export function getSupplementsOverlappingRange(supplements, start, end) {
  return (Array.isArray(supplements) ? supplements : [])
    .filter(supplement => supplementOverlapsRange(supplement, start, end));
}

/** @param {unknown} rawUnit */
export function normalizeSupplementUnit(rawUnit) {
  const trimmed = typeof rawUnit === 'string' ? rawUnit.trim() : '';
  if (!trimmed) return '';
  return UNIT_ALIASES.get(trimmed.toLowerCase()) || trimmed;
}

/**
 * Parses display quantities without discarding their original representation.
 * Supports decimal comma and grouped thousands; unknown units remain intact.
 * @param {unknown} raw
 */
export function parseSupplementQuantity(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const text = raw.trim();
  const match = text.match(/^([+-]?(?:\d{1,3}(?:[ ,.]\d{3})+|\d+)(?:[.,]\d+)?)\s*([^\d\s].*?)?$/u);
  if (!match) return null;
  let numeric = match[1].replace(/\s/g, '');
  const commaCount = (numeric.match(/,/g) || []).length;
  const dotCount = (numeric.match(/\./g) || []).length;
  if (commaCount && dotCount) {
    const decimal = numeric.lastIndexOf(',') > numeric.lastIndexOf('.') ? ',' : '.';
    numeric = numeric.replace(decimal === ',' ? /\./g : /,/g, '').replace(decimal, '.');
  } else if (commaCount === 1 && !dotCount) {
    const [, tail = ''] = numeric.split(',');
    numeric = tail.length === 3 && /^\d{1,3},\d{3}$/.test(numeric)
      ? numeric.replace(',', '') : numeric.replace(',', '.');
  } else if (dotCount > 1 || (dotCount === 1 && /^\d{1,3}\.\d{3}$/.test(numeric))) {
    numeric = numeric.replace(/\./g, '');
  } else if (commaCount > 1) {
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

/** @param {any} ingredient */
export function getIngredientQuantity(ingredient) {
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

/** @param {number | string} value @param {string} unit */
export function formatSupplementAmount(value, unit) {
  const rawValue = typeof value === 'number' ? String(value) : String(value || '').trim();
  const normalizedUnit = normalizeSupplementUnit(unit);
  return `${rawValue}${rawValue && normalizedUnit ? ' ' : ''}${normalizedUnit}`.trim();
}

/**
 * Add only compatibility metadata. No periods, amounts, timestamps, or custom
 * keys are rewritten, so the operation is idempotent and mixed-client safe.
 * @param {any} data
 */
export function migrateSupplementMedicationRecords(data) {
  if (!data || typeof data !== 'object') return data;
  if (!Array.isArray(data.supplements)) {
    if (data.supplements === undefined) data.supplements = [];
    return data;
  }
  for (const supplement of data.supplements) {
    if (!supplement || typeof supplement !== 'object' || Array.isArray(supplement)) continue;
    if (!getSupplementRecordId(supplement)) continue;
    if (!supplement.id) supplement.id = legacySupplementId(supplement);
    if (supplement.schemaVersion === undefined) supplement.schemaVersion = SUPPLEMENT_RECORD_VERSION;
  }
  return data;
}
