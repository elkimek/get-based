import type { CanonicalWearableMetricId } from './wearable-adapters.js';

/** Provider rows retain absent metrics as well as explicitly missing measurements. */
export type WearableDailyRow<Source extends string, Metric extends CanonicalWearableMetricId> =
  { source: Source; date: string } & Record<Metric, number | null>;

/** Error payload fields remain opaque until the native Error constructor coerces them. */
export interface WearableErrorBody {
  detail?: unknown;
  message?: unknown;
  error?: unknown;
  errors?: { message?: unknown }[];
}
export type WearableRequestError = Error & { status?: number };
export type WearableQuery = Record<string, string | number>;
export type WearableQueryConstructor = new (params: WearableQuery) => URLSearchParams;

export type BasicWearableMetric = 'hrv_rmssd' | 'hrv_sdnn' | 'rhr' | 'hrv_day' | 'hr_day' | 'sleep_score'
  | 'readiness_score' | 'activity_score' | 'steps' | 'strain' | 'stress_high_min' | 'resilience_level'
  | 'cardio_age' | 'weight' | 'bp_systolic' | 'bp_diastolic' | 'spo2_avg' | 'body_temp_delta' | 'glucose_avg';
export type BasicWearableDailyRow<Source extends string> = WearableDailyRow<Source, BasicWearableMetric>;
