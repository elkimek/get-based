import type { WearableDailyRow, WearableRequestError } from './wearable-data-types.js';

interface CivilDate { year?: unknown; month?: unknown; day?: unknown; date?: CivilDate | null }
interface GoogleSampleTime { civilTime?: CivilDate | null; physicalTime?: unknown }
interface GoogleMetricData {
  date?: CivilDate | null;
  deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds?: unknown;
  averageHeartRateVariabilityMilliseconds?: unknown; beatsPerMinute?: unknown;
  averagePercentage?: unknown; breathsPerMinute?: unknown; nightlyTemperatureCelsius?: unknown;
  baselineTemperatureCelsius?: unknown; vo2Max?: unknown;
  metadata?: { nap?: unknown };
  interval?: { civilEndTime?: CivilDate | null; endTime?: unknown };
  summary?: { minutesInSleepPeriod?: unknown; minutesAsleep?: unknown; minutesAwake?: unknown;
    stagesSummary?: { minutes?: unknown; type?: unknown }[] };
}
interface GooglePoint {
  civilStartTime?: CivilDate | null;
  steps?: { countSum?: unknown }; heartRate?: { beatsPerMinuteAvg?: unknown };
  weight?: { weightGramsAvg?: unknown }; bodyFat?: { bodyFatPercentageAvg?: unknown };
  [key: string]: unknown;
}
interface GoogleHealthPage { rollupDataPoints?: GooglePoint[]; dataPoints?: GooglePoint[]; nextPageToken?: string | null }
interface GoogleIdentity { healthUserId?: unknown; legacyUserId?: unknown }
interface GoogleErrorBody { error?: unknown; error_description?: unknown; message?: unknown }

// wearables-google-health.js — Google Health API v4 data normalization
//
// This adapter reads Google's reconciled stream. It is intentionally a
// separate, opt-in source: direct Oura/WHOOP/Withings/etc. integrations remain
// available and are not routed through Google Health.

import { getErrorMessage, getErrorStatus } from './caught-error.js';
import { getProxyApiUrl } from './proxy-runtime.js';
import { isDebugMode } from './utils.js';

const GOOGLE_HEALTH_API = 'https://health.googleapis.com/v4/users/me';
const PROXY_URL = getProxyApiUrl();
const SOURCE = 'google_health';
const DEFAULT_SOURCE_FAMILY = 'all-sources';

const CANONICAL_FIELDS = [
  'hrv_rmssd', 'rhr', 'hr_day', 'steps', 'weight', 'body_fat_pct',
  'spo2_avg', 'body_temp_delta', 'vo2max',
  'sleep_total_min', 'sleep_deep_min', 'sleep_light_min',
  'sleep_rem_min', 'sleep_awake_min', 'sleep_breathing_rate',
] as const;

type GoogleDailyRow = WearableDailyRow<'google_health', typeof CANONICAL_FIELDS[number]> & {
  _provenance: { provider: 'google_health'; stream: 'reconciled'; dataSourceFamily: string };
};

type GoogleReconciledMetricBatch = readonly [
  points: GooglePoint[], camel: string, snake: string,
  field: typeof CANONICAL_FIELDS[number], readValue: (data: GoogleMetricData | null) => number | null,
];

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function addDaysIso(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function civilDate(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

function isoFromCivil(value: CivilDate | null | undefined) {
  const date = value?.date || value;
  if (!date?.year || !date?.month || !date?.day) return null;
  return `${String(date.year).padStart(4, '0')}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
}

function dateFromSampleTime(sampleTime: GoogleSampleTime | null | undefined) {
  return isoFromCivil(sampleTime?.civilTime)
    || (typeof sampleTime?.physicalTime === 'string' ? sampleTime.physicalTime.slice(0, 10) : null);
}

function dateFromSleep(sleep: GoogleMetricData | null | undefined) {
  return isoFromCivil(sleep?.interval?.civilEndTime)
    || (typeof sleep?.interval?.endTime === 'string' ? sleep.interval.endTime.slice(0, 10) : null);
}

function pointData(point: GooglePoint | null, camel: string, snake: string): GoogleMetricData | null {
  return (point?.[camel] as GoogleMetricData | null | undefined) || (point?.[snake] as GoogleMetricData | null | undefined) || null;
}

async function googleHealthRequest<T>(path: string, accessToken: string, { method = 'GET', body = null }: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };
  if (body != null) headers['Content-Type'] = 'application/json';
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `${GOOGLE_HEALTH_API}/${path.replace(/^\//, '')}`,
      method,
      headers,
      ...(body != null ? { body } : {}),
    }),
  });
  const payload: GoogleErrorBody & T = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (payload?.error as { message?: unknown } | null)?.message
      || payload?.error_description
      || payload?.message
      || payload?.error
      || `Google Health request failed (${res.status})`;
    const error: WearableRequestError = new Error(typeof message === 'string' ? message : `Google Health request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return payload;
}

export async function fetchGoogleHealthPersonalInfo(accessToken: string) {
  try {
    const identity = await googleHealthRequest<GoogleIdentity>('identity', accessToken);
    const healthUserId = identity?.healthUserId || null;
    return {
      ok: true,
      account: {
        identity: healthUserId ? `Google Health user ${healthUserId}` : 'Google Health account',
        userId: healthUserId,
        legacyFitbitUserId: identity?.legacyUserId || null,
      },
    };
  } catch (error) {
    return { ok: false, error: getErrorMessage(error), status: getErrorStatus(error) };
  }
}

function chunks(startDate: string, endDate: string, maximumDays: number) {
  const ranges: { start: string; end: string }[] = [];
  let start = startDate;
  while (start <= endDate) {
    const candidate = addDaysIso(start, maximumDays - 1);
    const end = candidate < endDate ? candidate : endDate;
    ranges.push({ start, end });
    start = addDaysIso(end, 1);
  }
  return ranges;
}

async function fetchDailyRollups(type: string, accessToken: string, startDate: string, endDate: string, sourceFamily: string, maximumDays?: number): Promise<GooglePoint[]> {
  const limitDays = maximumDays ?? (type === 'heart-rate' ? 14 : 90);
  const out: GooglePoint[] = [];
  for (const range of chunks(startDate, endDate, limitDays)) {
    let pageToken = '';
    do {
      const body = {
        range: {
          start: { date: civilDate(range.start) },
          end: { date: civilDate(addDaysIso(range.end, 1)) },
        },
        windowSizeDays: 1,
        pageSize: limitDays,
        dataSourceFamily: `users/me/dataSourceFamilies/${sourceFamily}`,
        ...(pageToken ? { pageToken } : {}),
      };
      const payload: GoogleHealthPage = await googleHealthRequest<GoogleHealthPage>(
        `dataTypes/${type}/dataPoints:dailyRollUp`,
        accessToken,
        { method: 'POST', body },
      );
      out.push(...(payload?.rollupDataPoints || []));
      pageToken = payload?.nextPageToken || '';
    } while (pageToken);
  }
  return out;
}

async function fetchReconciled(type: string, filterForRange: (start: string, end: string) => string, accessToken: string, startDate: string, endDate: string, sourceFamily: string, pageSize = 10000): Promise<GooglePoint[]> {
  const out: GooglePoint[] = [];
  for (const range of chunks(startDate, endDate, 90)) {
    let pageToken = '';
    do {
      const params = new URLSearchParams({
        filter: filterForRange(range.start, range.end),
        pageSize: String(pageSize),
        dataSourceFamily: `users/me/dataSourceFamilies/${sourceFamily}`,
      });
      if (pageToken) params.set('pageToken', pageToken);
      const payload: GoogleHealthPage = await googleHealthRequest<GoogleHealthPage>(
        `dataTypes/${type}/dataPoints:reconcile?${params.toString()}`,
        accessToken,
      );
      out.push(...(payload?.dataPoints || []));
      pageToken = payload?.nextPageToken || '';
    } while (pageToken);
  }
  return out;
}

async function safeMetric(label: string, request: () => Promise<GooglePoint[]>, authorizationState: { denied: number }): Promise<GooglePoint[]> {
  try { return await request(); }
  catch (error) {
    const status = getErrorStatus(error);
    if (status === 401) throw error;
    // Google lets people grant only a subset of the requested health scopes.
    // A missing scope must suppress that metric family without discarding data
    // from the scopes they did approve. If every family is denied, the caller
    // turns the aggregate result back into an actionable authorization error.
    if (status === 403) authorizationState.denied += 1;
    if (isDebugMode?.()) console.warn(`[google-health] ${label} unavailable:`, getErrorMessage(error));
    return [];
  }
}

function dailyFilter(field: string, startDate: string, endDate: string) {
  return `${field}.date >= "${startDate}" AND ${field}.date < "${addDaysIso(endDate, 1)}"`;
}

function sleepFilter(startDate: string, endDate: string) {
  return `sleep.interval.civil_end_time >= "${startDate}" AND sleep.interval.civil_end_time < "${addDaysIso(endDate, 1)}"`;
}

function emptyRow(date: string, sourceFamily: string): GoogleDailyRow {
  return {
    source: SOURCE,
    date,
    _provenance: { provider: SOURCE, stream: 'reconciled', dataSourceFamily: sourceFamily },
    hrv_rmssd: null,
    rhr: null,
    hr_day: null,
    steps: null,
    weight: null,
    body_fat_pct: null,
    spo2_avg: null,
    body_temp_delta: null,
    vo2max: null,
    sleep_total_min: null,
    sleep_deep_min: null,
    sleep_light_min: null,
    sleep_rem_min: null,
    sleep_awake_min: null,
    sleep_breathing_rate: null,
  };
}

export async function fetchGoogleHealthDailyRange(accessToken: string, startDate: string, endDate: string, options: { dataSourceFamily?: string } = {}) {
  const sourceFamily = options.dataSourceFamily || DEFAULT_SOURCE_FAMILY;
  const endExclusive = addDaysIso(endDate, 1);
  const authorizationState = { denied: 0 };
  const metricRequestCount = 11;
  const [steps, heartRate, weight, bodyFat, hrv, rhr, oxygen, respiratory, temperature, vo2max, sleep] = await Promise.all([
    safeMetric('steps', () => fetchDailyRollups('steps', accessToken, startDate, endDate, sourceFamily), authorizationState),
    safeMetric('heart rate', () => fetchDailyRollups('heart-rate', accessToken, startDate, endDate, sourceFamily, 14), authorizationState),
    safeMetric('weight', () => fetchDailyRollups('weight', accessToken, startDate, endDate, sourceFamily), authorizationState),
    safeMetric('body fat', () => fetchDailyRollups('body-fat', accessToken, startDate, endDate, sourceFamily), authorizationState),
    safeMetric('HRV', () => fetchReconciled('daily-heart-rate-variability', (start, end) => dailyFilter('daily_heart_rate_variability', start, end), accessToken, startDate, endDate, sourceFamily), authorizationState),
    safeMetric('resting heart rate', () => fetchReconciled('daily-resting-heart-rate', (start, end) => dailyFilter('daily_resting_heart_rate', start, end), accessToken, startDate, endDate, sourceFamily), authorizationState),
    safeMetric('oxygen saturation', () => fetchReconciled('daily-oxygen-saturation', (start, end) => dailyFilter('daily_oxygen_saturation', start, end), accessToken, startDate, endDate, sourceFamily), authorizationState),
    safeMetric('respiratory rate', () => fetchReconciled('daily-respiratory-rate', (start, end) => dailyFilter('daily_respiratory_rate', start, end), accessToken, startDate, endDate, sourceFamily), authorizationState),
    safeMetric('sleep temperature', () => fetchReconciled('daily-sleep-temperature-derivations', (start, end) => dailyFilter('daily_sleep_temperature_derivations', start, end), accessToken, startDate, endDate, sourceFamily), authorizationState),
    safeMetric('VO2 max', () => fetchReconciled('daily-vo2-max', (start, end) => dailyFilter('daily_vo2_max', start, end), accessToken, startDate, endDate, sourceFamily), authorizationState),
    safeMetric('sleep', () => fetchReconciled('sleep', sleepFilter, accessToken, startDate, endDate, sourceFamily, 25), authorizationState),
  ]);
  if (authorizationState.denied === metricRequestCount) {
    const error: WearableRequestError = new Error('Google Health access was not granted for any requested health data.');
    error.status = 403;
    throw error;
  }

  const byDate = new Map<string, GoogleDailyRow>();
  const ensure = (date: string | null) => {
    if (!date || date < startDate || date >= endExclusive) return null;
    if (!byDate.has(date)) byDate.set(date, emptyRow(date, sourceFamily));
    return byDate.get(date)!;
  };

  for (const point of steps) {
    const row = ensure(isoFromCivil(point?.civilStartTime));
    const value = asNumber(point?.steps?.countSum);
    if (row && value != null) row.steps = value;
  }
  for (const point of heartRate) {
    const row = ensure(isoFromCivil(point?.civilStartTime));
    const value = asNumber(point?.heartRate?.beatsPerMinuteAvg);
    if (row && value != null) row.hr_day = value;
  }
  for (const point of weight) {
    const row = ensure(isoFromCivil(point?.civilStartTime));
    const grams = asNumber(point?.weight?.weightGramsAvg);
    if (row && grams != null) row.weight = grams / 1000;
  }
  for (const point of bodyFat) {
    const row = ensure(isoFromCivil(point?.civilStartTime));
    const value = asNumber(point?.bodyFat?.bodyFatPercentageAvg);
    if (row && value != null) row.body_fat_pct = value;
  }

  const reconciledMetrics: readonly GoogleReconciledMetricBatch[] = [
    [hrv, 'dailyHeartRateVariability', 'daily_heart_rate_variability', 'hrv_rmssd', data =>
      asNumber(data?.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds)
        ?? asNumber(data?.averageHeartRateVariabilityMilliseconds)],
    [rhr, 'dailyRestingHeartRate', 'daily_resting_heart_rate', 'rhr', data => asNumber(data?.beatsPerMinute)],
    [oxygen, 'dailyOxygenSaturation', 'daily_oxygen_saturation', 'spo2_avg', data => asNumber(data?.averagePercentage)],
    [respiratory, 'dailyRespiratoryRate', 'daily_respiratory_rate', 'sleep_breathing_rate', data => asNumber(data?.breathsPerMinute)],
    [temperature, 'dailySleepTemperatureDerivations', 'daily_sleep_temperature_derivations', 'body_temp_delta', data => {
      const nightly = asNumber(data?.nightlyTemperatureCelsius);
      const baseline = asNumber(data?.baselineTemperatureCelsius);
      return nightly != null && baseline != null ? nightly - baseline : null;
    }],
    [vo2max, 'dailyVo2Max', 'daily_vo2_max', 'vo2max', data => asNumber(data?.vo2Max)],
  ];
  for (const [points, camel, snake, field, readValue] of reconciledMetrics) {
    for (const point of points) {
      const data = pointData(point, camel, snake);
      const row = ensure(isoFromCivil(data?.date));
      const value = readValue(data);
      if (row && value != null) row[field] = value;
    }
  }

  const sleepByDate = new Map<string, { data: GoogleMetricData; duration: number }>();
  for (const point of sleep) {
    const data = pointData(point, 'sleep', 'sleep');
    if (!data || data?.metadata?.nap) continue;
    const date = dateFromSleep(data);
    if (!date || date < startDate || date >= endExclusive) continue;
    const duration = asNumber(data?.summary?.minutesInSleepPeriod) || 0;
    const previous = sleepByDate.get(date);
    if (!previous || duration > previous.duration) sleepByDate.set(date, { data, duration });
  }
  for (const [date, selected] of sleepByDate) {
    const row = ensure(date);
    if (!row) continue;
    const summary = selected.data?.summary || {};
    const stageMinutes = new Map<string, number>();
    for (const stage of (summary.stagesSummary || [])) {
      const value = asNumber(stage?.minutes);
      if (value != null) stageMinutes.set(String(stage?.type || '').toUpperCase(), value);
    }
    const total = asNumber(summary.minutesAsleep);
    const awake = asNumber(summary.minutesAwake);
    if (total != null) row.sleep_total_min = total;
    if (awake != null) row.sleep_awake_min = awake;
    if (stageMinutes.has('DEEP')) row.sleep_deep_min = stageMinutes.get('DEEP')!;
    if (stageMinutes.has('LIGHT')) row.sleep_light_min = stageMinutes.get('LIGHT')!;
    if (stageMinutes.has('REM')) row.sleep_rem_min = stageMinutes.get('REM')!;
  }

  return [...byDate.values()]
    .filter(row => CANONICAL_FIELDS.some(field => row[field] != null))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Test hooks for date-boundary and parser coverage without exporting the HTTP
// transport itself.
export const _googleHealthInternals = Object.freeze({
  addDaysIso,
  civilDate,
  isoFromCivil,
  dateFromSampleTime,
  chunks,
});
