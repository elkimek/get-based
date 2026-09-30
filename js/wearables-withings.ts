import { createBasicWearableRow } from './wearable-daily-row.js';
import type { BasicWearableMetric, WearableDailyRow, WearableErrorBody, WearableRequestError, WearableQuery, WearableQueryConstructor } from './wearable-data-types.js';

type WithingsMetric = BasicWearableMetric | 'body_fat_pct' | 'fat_mass_kg' | 'muscle_mass_kg' | 'lean_mass_kg'
  | 'bone_mass_kg' | 'water_mass_kg' | 'pwv' | 'vascular_age' | 'cardio_fitness' | 'visceral_fat'
  | 'nerve_health_score' | 'body_temp' | 'skin_temp' | 'sleep_total_min' | 'sleep_deep_min'
  | 'sleep_light_min' | 'sleep_rem_min' | 'sleep_awake_min' | 'sleep_hr_avg' | 'sleep_breathing_rate'
  | 'sleep_snoring_min' | 'sleep_breath_disturb';
type WithingsDailyRow = WearableDailyRow<'withings', WithingsMetric>;
interface WithingsBody {
  userid?: unknown; updatetime?: number;
  measuregrps?: { date?: number; measures?: { type: number; value: number; unit: number }[] }[];
  series?: { date?: string; data?: Record<string, unknown> }[];
}
interface WithingsPayload { status?: unknown; error?: unknown; body?: WithingsBody | null }
type WithingsRequestError = WearableRequestError & { withingsCode?: unknown };

// wearables-withings.js — Withings data layer
//
// BETA. Withings's REST API quirks:
//   - Base: wbsapi.withings.net
//   - Every POST/GET carries `action=<verb>` in the body or query string
//     (e.g. action=getmeas, action=getsleep). action IS the method selector;
//     the URL path just groups endpoints.
//   - Responses wrap the real payload in `{ status: 0, body: {...} }`;
//     non-zero status is an error code.
//   - Measures use a numeric `type` code (1=weight kg, 9=bp diastolic,
//     10=bp systolic, 11=pulse bpm, 76=muscle mass, 77=hydration,
//     71=body temp, 73=skin temp, etc.) — we unpack into canonical fields.
//
// Pagination: /measure returns arrays per call, no nextToken. /v2/sleep and
// /v2/heart use `startdateymd`/`enddateymd`. Everything is day-granular on
// our side — we reduce intra-day samples before writing to L1.

import { withingsErrorMessage } from './wearables-withings-errors.js';
export { withingsErrorMessage } from './wearables-withings-errors.js';

import { getErrorMessage, getErrorStatus } from './caught-error.js';
import { getProxyApiUrl } from './proxy-runtime.js';
import { isDebugMode } from './utils.js';
import { isoDay } from './wearables-oura.js';

const WITHINGS_API = 'https://wbsapi.withings.net';
const PROXY_URL    = getProxyApiUrl();

// Withings measure-type codes → canonical fields. We aim for full coverage
// of /measure: every measType the user's hardware produces flows to a
// canonical so the strip can decide whether to surface it (auto-hidden if
// no rows). Scale pulse (type 11) is a daytime spot reading at the moment
// of standing — NOT resting heart rate — so it routes to hr_day; rhr
// comes from sleep summary's hr_min below.
const MEAS_TYPES: Record<number, WithingsMetric> = {
  1:   'weight',             // kg
  5:   'lean_mass_kg',       // kg (fat-free mass)
  6:   'body_fat_pct',       // %
  8:   'fat_mass_kg',        // kg (absolute fat tissue)
  9:   'bp_diastolic',       // mmHg
  10:  'bp_systolic',        // mmHg
  11:  'hr_day',             // bpm (scale pulse — taken while standing on the scale)
  54:  'spo2_avg',           // % (ScanWatch overnight)
  71:  'body_temp',          // °C (Body Scan IR sensor — absolute, NOT delta)
  73:  'skin_temp',          // °C (ScanWatch wrist sensor — absolute)
  76:  'muscle_mass_kg',     // kg
  77:  'water_mass_kg',      // kg (hydration)
  88:  'bone_mass_kg',       // kg
  91:  'pwv',                // m/s (pulse wave velocity)
  130: 'vascular_age',       // years (Withings PWV-derived)
  167: 'visceral_fat',       // 1-30 score
  168: 'nerve_health_score', // score
  169: 'cardio_fitness',     // VO2 estimate
};

// /v2/sleep getsleepsummary fields → canonical. Some need unit conversion
// from seconds to minutes (Withings' default for *duration fields).
const SLEEP_FIELDS: Record<string, { key?: WithingsMetric; canonical?: WithingsMetric; secToMin?: boolean }> = {
  sleep_score:          { key: 'sleep_score' },
  hr_min:               { canonical: 'rhr' },
  hr_average:           { canonical: 'sleep_hr_avg' },
  rr_average:           { canonical: 'sleep_breathing_rate' },
  asleepduration:       { canonical: 'sleep_total_min', secToMin: true },
  deepsleepduration:    { canonical: 'sleep_deep_min', secToMin: true },
  lightsleepduration:   { canonical: 'sleep_light_min', secToMin: true },
  remsleepduration:     { canonical: 'sleep_rem_min', secToMin: true },
  wakeupduration:       { canonical: 'sleep_awake_min', secToMin: true },
  snoring:              { canonical: 'sleep_snoring_min', secToMin: true },
  breathing_disturbances_intensity: { canonical: 'sleep_breath_disturb' },
};
// Withings caps `data_fields` at one comma-delimited list per request.
const SLEEP_DATA_FIELDS = [
  'asleepduration', 'wakeupduration', 'durationtosleep',
  'deepsleepduration', 'lightsleepduration', 'remsleepduration',
  'hr_average', 'hr_min', 'hr_max', 'rr_average',
  'sleep_score', 'snoring', 'breathing_disturbances_intensity',
].join(',');

async function withingsPOST(action: string, accessToken: string, params: WearableQuery = {}): Promise<WithingsBody> {
  // Withings accepts either x-www-form-urlencoded body OR query string. Form
  // body is the documented path; the deployment proxy forwards it verbatim.
  const form = new (URLSearchParams as unknown as WearableQueryConstructor)({ action, ...params });
  const url = `${WITHINGS_API}/${normalisePath(action)}`;
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: form.toString(),
    }),
  });
  if (!res.ok) {
    let err: WearableErrorBody | null; try { err = await res.json(); } catch { err = { error: res.statusText }; }
    const e: WearableRequestError = new Error((err?.error || err?.detail || res.statusText || 'Withings request failed') as string);
    e.status = res.status; throw e;
  }
  const payload: WithingsPayload | null = await res.json();
  if (payload?.status !== 0) {
    const code = payload?.status;
    const mapped = withingsErrorMessage(code);
    const msg = mapped
      ? `Withings ${code}: ${mapped}`
      : `Withings status ${code}: ${payload?.error || 'unknown'}`;
    const e: WithingsRequestError = new Error(msg);
    // Codes 100, 101, 102, 243, 283, 284 all mean "token dead — reconnect"
    // → surface as 401 so the auth-refresh middleware retries once.
    const authDead = new Set([100, 101, 102, 243, 245, 283, 284]);
    e.status = authDead.has(Number(code)) ? 401 : 400;
    e.withingsCode = code;
    throw e;
  }
  return payload!.body || {};
}

// Withings clusters endpoints into groups; the action tells the server which
// resource to hit. The path prefix is the group.
function normalisePath(action: string) {
  if (action === 'getmeas' || action === 'getsubscription') return 'measure';
  if (action === 'getsleep' || action === 'getsleepsummary') return 'v2/sleep';
  if (action === 'getheartlist' || action === 'get') return 'v2/heart';
  if (action === 'getactivity') return 'v2/measure';
  return 'measure';
}

export async function fetchWithingsPersonalInfo(accessToken: string) {
  // Withings doesn't have a clean /user endpoint; we best-effort by pulling a
  // short-range measure window and stamping a connection identity. This avoids
  // failing the connect flow just because profile info is sparse.
  try {
    const today = Math.floor(Date.now() / 1000);
    const week = today - 7 * 86400;
    const meas = await withingsPOST('getmeas', accessToken, { startdate: String(week), enddate: String(today) });
    // Withings doesn't expose email via getmeas. We can confirm the token
    // works (got a response) and stamp the date of the most recent measure
    // as a friendly identifier ("Withings · last measure 2026-04-22").
    const lastDate = meas?.updatetime ? isoDay(new Date(meas.updatetime * 1000)) : null;
    return { ok: true, account: { email: null, lastMeasure: lastDate, identity: lastDate ? `Withings — last measure ${lastDate}` : 'Withings (account verified)' } };
  } catch (e) {
    return { ok: false, error: getErrorMessage(e), status: getErrorStatus(e) };
  }
}

export async function fetchWithingsDailyRange(accessToken: string, startDate: string, endDate: string, lastSyncUnix: number | null = null) {
  const startUnix = Math.floor(new Date(startDate + 'T00:00:00Z').getTime() / 1000);
  const endUnix   = Math.floor(new Date(endDate + 'T23:59:59Z').getTime() / 1000);

  // /measure params:
  //   - lastupdate: anything modified since this epoch (incremental; catches
  //     retroactive manual entries — Withings stamps `date` = when the
  //     reading happened, but bumps the modify-time when typed). Withings's
  //     own integration guide flags this as the recommended approach.
  //   - startdate/enddate: fixed window, used for first-sync backfill only.
  // We drop `meastypes` deliberately: the MEAS_TYPES lookup below already
  // filters client-side, and omitting the param makes us forward-compatible
  // with new Withings measTypes (instead of silently dropping them until
  // the constant is updated).
  const measParams: WearableQuery = lastSyncUnix
    ? { lastupdate: String(Math.floor(lastSyncUnix / 1000)), category: '1' }
    : { startdate: String(startUnix), enddate: String(endUnix), category: '1' };

  // Fetch in parallel: body measures (weight, BP, pulse), sleep summary.
  // Heartrate list is per-device and noisy; deferring to a follow-up.
  const [meas, sleep] = await Promise.all([
    withingsPOST('getmeas', accessToken, measParams)
      .catch((e): WithingsBody => { logDebug('getmeas', e); return {}; }),
    withingsPOST('getsleepsummary', accessToken, {
      startdateymd: startDate, enddateymd: endDate,
      data_fields: SLEEP_DATA_FIELDS,
    }).catch((e): WithingsBody => { logDebug('getsleepsummary', e); return {}; }),
  ]);

  const byDate = new Map<string, WithingsDailyRow>();
  function ensureRow(day: string): WithingsDailyRow {
    if (!byDate.has(day)) {
      byDate.set(day, {
        ...createBasicWearableRow('withings', day),
        // Withings full-coverage canonicals (one slot per registered metric).
        body_fat_pct: null, fat_mass_kg: null,
        muscle_mass_kg: null, lean_mass_kg: null,
        bone_mass_kg: null, water_mass_kg: null,
        pwv: null, vascular_age: null, cardio_fitness: null,
        visceral_fat: null, nerve_health_score: null,
        body_temp: null, skin_temp: null,
        sleep_total_min: null, sleep_deep_min: null, sleep_light_min: null,
        sleep_rem_min: null, sleep_awake_min: null,
        sleep_hr_avg: null, sleep_breathing_rate: null,
        sleep_snoring_min: null, sleep_breath_disturb: null,
      });
    }
    return byDate.get(day)!;
  }

  // Body measures — Withings returns grouped samples; each group has a date +
  // an array of {value, type, unit}. Value is `value * 10^unit` (unit can be
  // negative, e.g. weight 725 with unit=-1 → 72.5 kg).
  for (const group of (meas?.measuregrps || [])) {
    const epoch = group?.date;
    if (!epoch) continue;
    // Local-tz: a measurement at 23:30 local should be tagged with today,
    // not "tomorrow UTC" for users in positive offsets.
    const day = isoDay(new Date(epoch * 1000));
    const row = ensureRow(day);
    for (const m of (group.measures || [])) {
      const field = MEAS_TYPES[m.type];
      if (!field) continue;
      const real = m.value * Math.pow(10, m.unit);
      // When multiple samples exist per day we take the first; Withings orders
      // by `date` desc so first = most recent. Callers may want avg/min later.
      if (row[field] == null) row[field] = Math.round(real * 100) / 100;
    }
  }

  // Sleep summary — Withings gives nightly aggregates. Walk SLEEP_FIELDS
  // so adding a new field is a one-line registry change. Duration values
  // come back in seconds; `secToMin` flag normalises to minutes.
  for (const s of (sleep?.series || [])) {
    const day = s?.date;
    if (!day) continue;
    const row = ensureRow(day);
    const d = s.data || {};
    for (const [apiField, spec] of Object.entries(SLEEP_FIELDS)) {
      const v = d[apiField];
      if (typeof v !== 'number' || !isFinite(v)) continue;
      const target = spec.canonical || spec.key;
      if (!target) continue;
      // Don't overwrite a value already set by /measure (true for fields
      // like rhr where /measure has no entry, but defensive in general).
      if (row[target] != null) continue;
      const out = spec.secToMin ? Math.round(v / 60) : v;
      row[target] = out;
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function logDebug(where: string, err: unknown) {
  if (isDebugMode?.()) console.warn(`[withings] ${where} failed:`, (err as { message?: unknown } | null)?.message || err);
}
