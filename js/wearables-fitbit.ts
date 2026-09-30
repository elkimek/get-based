import { createBasicWearableRow } from './wearable-daily-row.js';
import type { BasicWearableDailyRow, WearableErrorBody, WearableRequestError } from './wearable-data-types.js';

// wearables-fitbit.js — Fitbit Web API data layer
//
// Fitbit has a hard 150 req/hour per user rate limit. A naive per-day
// backfill (7 endpoints × 90 days = 630 requests) burns the budget
// instantly. Fitbit's time-series endpoints all support date *ranges*,
// so we issue exactly ONE request per metric for the entire backfill —
// 7 requests total, reusing the rate budget many orders of magnitude
// more efficiently.
//
// Range endpoints (confirmed from dev.fitbit.com/build/reference/web-api/):
//   HRV RMSSD       GET /1/user/-/hrv/date/YYYY-MM-DD/YYYY-MM-DD.json
//   Resting HR      GET /1/user/-/activities/heart/date/YYYY-MM-DD/YYYY-MM-DD.json
//   Steps           GET /1/user/-/activities/steps/date/YYYY-MM-DD/YYYY-MM-DD.json
//   Sleep           GET /1.2/user/-/sleep/date/YYYY-MM-DD/YYYY-MM-DD.json
//   SpO₂            GET /1/user/-/spo2/date/YYYY-MM-DD/YYYY-MM-DD.json
//   Skin temp Δ     GET /1/user/-/temp/skin/date/YYYY-MM-DD/YYYY-MM-DD.json
//   Weight log      GET /1/user/-/body/log/weight/date/YYYY-MM-DD/YYYY-MM-DD.json

import { getErrorMessage, getErrorStatus } from './caught-error.js';
import { getProxyApiUrl } from './proxy-runtime.js';
import { isDebugMode } from './utils.js';

interface FitbitSleep {
  dateOfSleep?: string; isMainSleep?: unknown; duration?: number; efficiency?: unknown;
}
interface FitbitSpO2 { dateTime?: string; value?: { avg?: unknown } }
interface FitbitPayload {
  user?: { email?: unknown; fullName?: unknown; displayName?: unknown };
  hrv?: { dateTime?: string; value?: { deepRmssd?: unknown; dailyRmssd?: unknown; rmssdMilliseconds?: unknown } }[];
  'activities-heart'?: { dateTime?: string; value?: { restingHeartRate?: unknown } }[];
  'activities-steps'?: { dateTime?: string; value?: unknown }[];
  sleep?: FitbitSleep[];
  tempSkin?: { dateTime?: string; value?: { nightlyRelative?: unknown } }[];
  weight?: { date?: string; weight?: unknown }[];
}

const FITBIT_API = 'https://api.fitbit.com';
const PROXY_URL = getProxyApiUrl();

async function fbGET<T>(path: string, accessToken: string): Promise<T> {
  const url = `${FITBIT_API}/${path.replace(/^\//, '')}`;
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url, method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }),
  });
  if (!res.ok) {
    let err: WearableErrorBody | null; try { err = await res.json(); } catch { err = { error: res.statusText }; }
    const msg = err?.errors?.[0]?.message || err?.detail || (err as { message?: unknown } | null)?.message || err?.error || res.statusText || 'Fitbit request failed';
    const e: WearableRequestError = new Error(msg as string); e.status = res.status; throw e;
  }
  return res.json();
}

export async function fetchFitbitPersonalInfo(accessToken: string) {
  try {
    const info = await fbGET<FitbitPayload>('1/user/-/profile.json', accessToken);
    const u = info?.user || {};
    return { ok: true, account: { email: u.email || null, fullName: u.fullName || u.displayName || null } };
  } catch (e) {
    return { ok: false, error: getErrorMessage(e), status: getErrorStatus(e) };
  }
}

export async function fetchFitbitDailyRange(accessToken: string, startDate: string, endDate: string) {
  // Seven range-reads in parallel, one per metric family. Each endpoint
  // degrades to null on failure so we don't lose the rest of the backfill.
  const [hrv, hr, steps, sleep, spo2, skinTemp, weight] = await Promise.all([
    fbGET<FitbitPayload>(`1/user/-/hrv/date/${startDate}/${endDate}.json`,                       accessToken).catch(e => { logDebug('hrv',       e); return null; }),
    fbGET<FitbitPayload>(`1/user/-/activities/heart/date/${startDate}/${endDate}.json`,          accessToken).catch(e => { logDebug('hr',        e); return null; }),
    fbGET<FitbitPayload>(`1/user/-/activities/steps/date/${startDate}/${endDate}.json`,          accessToken).catch(e => { logDebug('steps',     e); return null; }),
    fbGET<FitbitPayload>(`1.2/user/-/sleep/date/${startDate}/${endDate}.json`,                   accessToken).catch(e => { logDebug('sleep',     e); return null; }),
    fbGET<FitbitSpO2[]>(`1/user/-/spo2/date/${startDate}/${endDate}.json`,                      accessToken).catch(e => { logDebug('spo2',      e); return null; }),
    fbGET<FitbitPayload>(`1/user/-/temp/skin/date/${startDate}/${endDate}.json`,                 accessToken).catch(e => { logDebug('temp',      e); return null; }),
    fbGET<FitbitPayload>(`1/user/-/body/log/weight/date/${startDate}/${endDate}.json`,           accessToken).catch(e => { logDebug('weight',    e); return null; }),
  ]);

  // Build row skeletons first so days with partial data still get a row.
  const byDate = new Map<string, BasicWearableDailyRow<'fitbit'>>();
  function ensureRow(day: string): BasicWearableDailyRow<'fitbit'> {
    if (!byDate.has(day)) {
      byDate.set(day, createBasicWearableRow('fitbit', day));
    }
    return byDate.get(day)!;
  }

  // HRV: `hrv` is an array of { dateTime, value: { dailyRmssd, deepRmssd? } }.
  // - deepRmssd is the deep-sleep window measurement → cleanest overnight rMSSD.
  // - dailyRmssd is averaged across all sleep stages (deep + light + REM) and
  //   includes some dawn-period samples → routes to hrv_day as the broader
  //   "across-the-day" aggregate. It's the closest Fitbit gets to a daytime
  //   HRV without intraday-scope upgrades.
  for (const entry of (hrv?.hrv || [])) {
    if (!entry?.dateTime) continue;
    const row = ensureRow(entry.dateTime);
    if (typeof entry.value?.deepRmssd === 'number') row.hrv_rmssd = entry.value.deepRmssd;
    else if (typeof entry.value?.dailyRmssd === 'number') row.hrv_rmssd = entry.value.dailyRmssd;
    else if (typeof entry.value?.rmssdMilliseconds === 'number') row.hrv_rmssd = entry.value.rmssdMilliseconds;
    if (typeof entry.value?.dailyRmssd === 'number') row.hrv_day = entry.value.dailyRmssd;
  }

  // Resting heart rate: `activities-heart` is an array of { dateTime,
  // value: { restingHeartRate, heartRateZones, ... } }. Fitbit's
  // restingHeartRate is sleep-window derived → routes to rhr (overnight).
  // Daytime average HR would require the activities-heart-intraday endpoint
  // (1-min resolution), which needs a Personal-app scope upgrade we don't
  // currently request. hr_day stays null for Fitbit until that scope lands.
  for (const entry of (hr?.['activities-heart'] || [])) {
    if (!entry?.dateTime) continue;
    const rhrVal = entry.value?.restingHeartRate;
    if (typeof rhrVal === 'number') ensureRow(entry.dateTime).rhr = rhrVal;
  }

  // Steps: `activities-steps` is an array of { dateTime, value } — value is a
  // numeric string in Fitbit's API ("2500").
  for (const entry of (steps?.['activities-steps'] || [])) {
    if (!entry?.dateTime) continue;
    const n = Number(entry.value);
    if (isFinite(n)) ensureRow(entry.dateTime).steps = n;
  }

  // Sleep: `sleep` is an array of sleep logs (multiple per day possible —
  // naps + main sleep). Pick main sleep per day, fall back to first.
  const sleepsByDay = new Map<string, FitbitSleep>();
  for (const s of (sleep?.sleep || [])) {
    if (!s?.dateOfSleep) continue;
    // Prefer `isMainSleep: true`; else keep the longest duration of the day.
    const existing = sleepsByDay.get(s.dateOfSleep);
    if (!existing) sleepsByDay.set(s.dateOfSleep, s);
    else if (s.isMainSleep && !existing.isMainSleep) sleepsByDay.set(s.dateOfSleep, s);
    else if ((s.duration || 0) > (existing.duration || 0)) sleepsByDay.set(s.dateOfSleep, s);
  }
  for (const [day, s] of sleepsByDay) {
    if (typeof s.efficiency === 'number') ensureRow(day).sleep_score = s.efficiency;
  }

  // SpO₂: range response is an array of { dateTime, value: { avg, min, max } }.
  for (const entry of (spo2 || [])) {
    if (!entry?.dateTime) continue;
    const avg = entry.value?.avg;
    if (typeof avg === 'number') ensureRow(entry.dateTime).spo2_avg = avg;
  }

  // Skin temperature: `tempSkin` is an array of { dateTime, value: { nightlyRelative } }.
  for (const entry of (skinTemp?.tempSkin || [])) {
    if (!entry?.dateTime) continue;
    const n = entry.value?.nightlyRelative;
    if (typeof n === 'number') ensureRow(entry.dateTime).body_temp_delta = n;
  }

  // Weight log: `weight` is an array of { date, weight, ... }. Multiple per
  // day possible — take the most recent.
  const weightByDay = new Map<string, number>();
  for (const w of (weight?.weight || [])) {
    if (!w?.date || typeof w.weight !== 'number') continue;
    weightByDay.set(w.date, w.weight);  // last-write-wins; Fitbit returns in insertion order
  }
  for (const [day, kg] of weightByDay) {
    ensureRow(day).weight = kg;
  }

  // Drop any row that ended up all-null despite being in our skeleton map.
  const rows: BasicWearableDailyRow<'fitbit'>[] = [];
  for (const row of byDate.values()) {
    const hasAny = (['hrv_rmssd','rhr','sleep_score','steps','spo2_avg','body_temp_delta','weight'] as const)
      .some(k => row[k] != null);
    if (hasAny) rows.push(row);
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

function logDebug(where: string, err: unknown) {
  if (isDebugMode?.()) console.warn(`[fitbit] ${where} range failed:`, (err as { message?: unknown } | null)?.message || err, (err as { status?: unknown } | null)?.status);
}
