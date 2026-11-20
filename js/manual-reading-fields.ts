import type { ManualBodyReading } from '../types/app-state.js';
import { BODY_MEASUREMENT_FIELDS } from './body-measurement-model.js';

export const MANUAL_METRICS = ['weight', 'bp_systolic', 'bp_diastolic', 'rhr', ...BODY_MEASUREMENT_FIELDS];
export const MANUAL_TAGS = ['resting', 'morning-fasted', 'post-workout', 'stress'];
export const MANUAL_HISTORY_START = '1970-01-01';
export const MANUAL_HISTORY_END = '9999-12-31';
export const MANUAL_MIRROR_FIELDS = [...MANUAL_METRICS, 'tags', 'note'];
export function manualReadingDeletionClock(field: string, date: string, markers: Record<string, number> = {}) {
  const value = Number(Object.hasOwn(markers, `${field}.${date}`) ? markers[`${field}.${date}`] : markers[`${field}.all`]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Accept only the explicit manual surface, never vendor/imported row fields. */
export function parseManualMirrorEntry(key: string, raw: unknown) {
  const dot = key.indexOf('.'), field = key.slice(0, dot), date = key.slice(dot + 1);
  if (dot < 1 || !MANUAL_MIRROR_FIELDS.includes(field) || !ISO_DAY_RE.test(date)
      || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date
      || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const entry = raw as ManualBodyReading;
  if (!Number.isFinite(entry.updatedAt) || entry.updatedAt < 0) return null;
  const value = entry.value;
  if (value !== null && (MANUAL_METRICS.includes(field) ? typeof value !== 'number' || !Number.isFinite(value)
    : field === 'note' ? typeof value !== 'string' || value.length > 500
    : !Array.isArray(value) || value.length > MANUAL_TAGS.length || value.some(tag => !MANUAL_TAGS.includes(tag)))) return null;
  return {field, date, value, updatedAt: entry.updatedAt};
}
/** A portable manual surface must contain a valid explicit measurement or deletion. */
export function hasManualBodyReadings(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).some(([key, raw]) => {
      const entry = parseManualMirrorEntry(key, raw);
      return !!entry && MANUAL_METRICS.includes(entry.field);
    });
}
