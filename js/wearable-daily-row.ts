import type { BasicWearableDailyRow } from './wearable-data-types.js';

/** Each call creates an independent row with the existing metric order and null semantics. */
export function createBasicWearableRow<Source extends string>(source: Source, day: string): BasicWearableDailyRow<Source> {
  return {
    source, date: day,
    hrv_rmssd: null, hrv_sdnn: null, rhr: null,
    hrv_day: null, hr_day: null,
    sleep_score: null, readiness_score: null,
    activity_score: null, steps: null,
    strain: null,
    stress_high_min: null, resilience_level: null, cardio_age: null,
    weight: null, bp_systolic: null, bp_diastolic: null,
    spo2_avg: null, body_temp_delta: null, glucose_avg: null,
  };
}
