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
