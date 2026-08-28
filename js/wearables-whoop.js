// @ts-check
// wearables-whoop.js — WHOOP data layer
//
// BETA. WHOOP's API is a clean REST JSON API with cursor pagination. Data
// endpoints live under api.prod.whoop.com/developer/v2 — WHOOP removed the
// v1 recovery and activity/sleep routes (404 for API clients, verified
// 2026-08-27 with a live member token; direct and via proxy behave the same).
// Response shapes here match WHOOP's OpenAPI spec as of 2026-08.
//
// Pagination: nextToken via `?nextToken=...` until the server returns a
// response without nextToken. Kept aligned with Oura's ouraCollect shape
// so callers don't branch on vendor.

import { getErrorMessage, getErrorStatus } from './caught-error.js';
import { getProxyApiUrl } from './proxy-runtime.js';
import { isDebugMode } from './utils.js';

const WHOOP_API = 'https://api.prod.whoop.com';
const PROXY_URL = getProxyApiUrl();

async function whoopGET(path, accessToken, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${WHOOP_API}/${path.replace(/^\//, '')}${qs ? '?' + qs : ''}`;
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url, method: 'GET',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }),
  });
  if (!res.ok) {
    let err;
    try { err = await res.json(); } catch { err = { error: res.statusText }; }
    const msg = err?.detail || err?.message || err?.error || res.statusText || 'WHOOP request failed';
    /** @type {Error & { status?: number }} */
    const e = new Error(msg); e.status = res.status; throw e;
  }
  return res.json();
}

async function whoopCollect(path, accessToken, params) {
  const all = [];
  let nextToken = null;
  let pages = 0;
  do {
    const p = nextToken ? { ...params, nextToken } : params;
    const page = await whoopGET(path, accessToken, p);
    if (Array.isArray(page?.records)) all.push(...page.records);
    nextToken = page?.next_token || null;
    pages++;
    if (pages > 20) break;
  } while (nextToken);
  return all;
}

export async function fetchWhoopPersonalInfo(accessToken) {
  try {
    const info = await whoopGET('developer/v2/user/profile/basic', accessToken);
    return { ok: true, account: { email: info?.email || null, firstName: info?.first_name || null, lastName: info?.last_name || null } };
  } catch (e) {
    return { ok: false, error: getErrorMessage(e), status: getErrorStatus(e) };
  }
}

// WHOOP keys time windows as ISO timestamps, not dates. Convert YYYY-MM-DD
// to ISO boundaries in UTC so the bracket matches day-granularity reads.
function isoFloor(dayStr) { return dayStr + 'T00:00:00.000Z'; }
function isoCeil(dayStr)  { return dayStr + 'T23:59:59.999Z'; }

// WHOOP cycles/recoveries are keyed by `start` (ISO). Map to the calendar
// day in UTC for canonical-row alignment; caller can re-bucket if needed.
function dayFromIso(iso) { return (iso || '').slice(0, 10); }

export async function fetchWhoopDailyRange(accessToken, startDate, endDate) {
  const params = { start: isoFloor(startDate), end: isoCeil(endDate), limit: 25 };

  const [cycles, recoveries, sleeps] = await Promise.all([
    whoopCollect('developer/v2/cycle', accessToken, params).catch(e => { logDebug('cycle', e); return []; }),
    whoopCollect('developer/v2/recovery', accessToken, params).catch(e => { logDebug('recovery', e); return []; }),
    whoopCollect('developer/v2/activity/sleep', accessToken, params).catch(e => { logDebug('sleep', e); return []; }),
  ]);

  // v2 flattens relationships to bare IDs: a recovery record carries
  // `cycle_id`/`sleep_id` instead of the v1 embedded `cycle`/`sleep` objects.
  // Join against the fetched collections to recover the onset timestamps
  // used for day attribution below.
  /** @type {Map<number|string, string>} */
  const cycleStartById = new Map();
  for (const c of cycles) {
    if (c?.id != null && c?.start) cycleStartById.set(c.id, c.start);
  }
  /** @type {Map<number|string, string>} */
  const sleepStartById = new Map();
  for (const s of sleeps) {
    if (s?.id != null && s?.start) sleepStartById.set(s.id, s.start);
  }

  const byDate = new Map();
  function ensureRow(day) {
    if (!byDate.has(day)) {
      byDate.set(day, {
        source: 'whoop', date: day,
        hrv_rmssd: null, rhr: null,
        hrv_day: null, hr_day: null,
        sleep_score: null, readiness_score: null,
        activity_score: null, steps: null,
        strain: null,
        stress_high_min: null, resilience_level: null, cardio_age: null,
        spo2_avg: null, body_temp_delta: null, glucose_avg: null,
      });
    }
    return byDate.get(day);
  }

  for (const r of recoveries) {
    // Attribute by the cycle/sleep the recovery describes, not by
    // `created_at`: created_at is when WHOOP's pipeline finished writing the
    // score, typically the morning AFTER the sleep cycle ended, so using it
    // mis-attributes the row by one day. v2 flattened the v1 embedded
    // `cycle`/`sleep` objects into bare `cycle_id`/`sleep_id` IDs, so the
    // onset timestamps come from the ID-keyed maps built above; created_at
    // stays only as a last resort for malformed records.
    const day = dayFromIso(cycleStartById.get(r?.cycle_id))
      || dayFromIso(sleepStartById.get(r?.sleep_id))
      || dayFromIso(r?.created_at);
    if (!day) continue;
    const s = r?.score || {};
    const row = ensureRow(day);
    if (typeof s.hrv_rmssd_milli === 'number') row.hrv_rmssd = s.hrv_rmssd_milli;
    if (typeof s.resting_heart_rate === 'number') row.rhr = s.resting_heart_rate;
    if (typeof s.recovery_score === 'number') row.readiness_score = s.recovery_score;
  }
  for (const c of cycles) {
    const day = dayFromIso(c?.start);
    if (!day) continue;
    const s = c?.score || {};
    const row = ensureRow(day);
    if (typeof s.strain === 'number') row.strain = s.strain;
    // 24h cycle average HR — closer to a daytime HR than recovery's resting HR.
    // WHOOP doesn't surface daytime rMSSD via v1, so hrv_day stays null.
    if (typeof s.average_heart_rate === 'number') row.hr_day = s.average_heart_rate;
  }
  for (const sl of sleeps) {
    const day = dayFromIso(sl?.start);
    if (!day) continue;
    const s = sl?.score || {};
    const row = ensureRow(day);
    if (typeof s.sleep_performance_percentage === 'number') row.sleep_score = s.sleep_performance_percentage;
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function logDebug(where, err) {
  if (isDebugMode?.()) console.warn(`[whoop] ${where} failed:`, err?.message || err);
}
