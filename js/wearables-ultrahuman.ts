import { createBasicWearableRow } from './wearable-daily-row.js';
import type { BasicWearableDailyRow, WearableErrorBody, WearableRequestError, WearableQuery, WearableQueryConstructor } from './wearable-data-types.js';

// wearables-ultrahuman.js — Ultrahuman Ring Air data layer (OAuth2)
//
// Targets the new OAuth2 partner API under /api/partners/v1/user_data/*,
// not the legacy static-token /api/v1/partner/* endpoints. The access_token
// identifies the user — no email query param needed.
//
// Fields normalised to canonical metrics; vendor-specific keys stay local
// to this module. If Ultrahuman rotates a field name, the .catch() on each
// endpoint keeps the backfill alive for the other metrics.

import { getErrorMessage, getErrorStatus } from './caught-error.js';
import { isDebugMode } from './utils.js';

const UH_API = 'https://partner.ultrahuman.com';


type UltrahumanDailyRow = BasicWearableDailyRow<'ultrahuman'>;
type MetricBlock = Record<string, unknown>;
interface UltrahumanPayload extends MetricBlock {
  data?: MetricBlock & { metric_data?: MetricBlock };
  metric_data?: MetricBlock;
}
interface UltrahumanProfile {
  email?: unknown; first_name?: unknown; last_name?: unknown;
  user?: { email?: unknown; first_name?: unknown; last_name?: unknown };
}

async function uhGET<T>(path: string, accessToken: string, params: WearableQuery = {}): Promise<T> {
  const qs = new (URLSearchParams as unknown as WearableQueryConstructor)(params).toString();
  const url = `${UH_API}/${path.replace(/^\//, '')}${qs ? '?' + qs : ''}`;
  // Ultrahuman permits credentialed browser CORS for these resource
  // endpoints. Keep health-data responses between the browser and provider;
  // only confidential OAuth exchange/refresh uses the self-hoster's server.
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    let err: WearableErrorBody | null;
    try { err = await res.json(); } catch { err = { error: res.statusText }; }
    const msg = err?.detail || (err as { message?: unknown } | null)?.message || err?.error || res.statusText || 'Ultrahuman request failed';
    const e: WearableRequestError = new Error(msg as string); e.status = res.status; throw e;
  }
  return res.json();
}

// Account info — used on connect to stamp an identity so the settings card
// can show "connected as <email>". No-op on failure; identity is decorative.
export async function fetchUltrahumanPersonalInfo(accessToken: string) {
  try {
    const info = await uhGET<UltrahumanProfile>('api/partners/v1/user_data/user_info', accessToken);
    return {
      ok: true,
      account: {
        email: info?.email || info?.user?.email || null,
        firstName: info?.first_name || info?.user?.first_name || null,
        lastName:  info?.last_name  || info?.user?.last_name  || null,
      },
    };
  } catch (e) {
    return { ok: false, error: getErrorMessage(e), status: getErrorStatus(e) };
  }
}

// Returns canonical L1 rows for [startDate, endDate]. Ultrahuman's OAuth2
// metrics endpoint is day-scoped (one ?date=YYYY-MM-DD at a time), so we
// loop. If a given day returns a partial payload (no CGM subscription, no
// ring worn) we still keep the row with nulls for the missing metrics.
export async function fetchUltrahumanDailyRange(accessToken: string, startDate: string, endDate: string) {
  const start = new Date(startDate + 'T00:00:00Z');
  const end   = new Date(endDate   + 'T00:00:00Z');
  const byDate = new Map<string, UltrahumanDailyRow>();
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    let payload;
    try { payload = await uhGET<UltrahumanPayload>('api/partners/v1/user_data/metrics', accessToken, { date: day }); }
    catch (e) { logDebug('metrics', e); continue; }
    const row = canonicalizeDay(day, payload);
    if (row) byDate.set(day, row);
  }
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Ultrahuman returns nested `metric_data` blocks; the exact shape varies by
// scope (ring_data vs cgm_data). This function is the ONE place that knows
// vendor-specific field names — if Ultrahuman renames anything, patch here.
function canonicalizeDay(day: string, payload: UltrahumanPayload | null): UltrahumanDailyRow | null {
  const data = payload?.data?.metric_data || payload?.metric_data || payload?.data || payload || {};
  const row: UltrahumanDailyRow = createBasicWearableRow('ultrahuman', day);
  const pick = (path: string) => path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as MetricBlock)[k]), data);
  const numOrNull = (v: unknown) => (typeof v === 'number' && isFinite(v)) ? v : null;

  // Ultrahuman exposes sleep-window aggregates (`hrv.sleep`, `resting_heart_rate.sleep`)
  // when the ring captured the night, plus the 24h-average fields under .avg.
  // Split honestly: sleep-window → overnight slots; .avg → daytime slots.
  row.hrv_rmssd       = numOrNull(pick('hrv.sleep'));
  row.rhr             = numOrNull(pick('resting_heart_rate.sleep'));
  row.hrv_day         = numOrNull(pick('hrv.avg'))                 ?? numOrNull(pick('hrv'));
  row.hr_day          = numOrNull(pick('resting_heart_rate.avg'))  ?? numOrNull(pick('resting_heart_rate'));
  row.sleep_score     = numOrNull(pick('sleep_index.score'))       ?? numOrNull(pick('sleep_index'));
  row.readiness_score = numOrNull(pick('recovery_index.score'))    ?? numOrNull(pick('recovery_index'));
  row.steps           = numOrNull(pick('steps.total'))             ?? numOrNull(pick('steps'));
  row.body_temp_delta = numOrNull(pick('temperature.deviation'))   ?? numOrNull(pick('temperature'));
  row.glucose_avg     = numOrNull(pick('glucose.avg'))             ?? numOrNull(pick('glucose'));

  // Drop entirely-null days (ring wasn't worn, scope didn't cover this user)
  const metrics = Object.entries(row).filter(([key]) => key !== 'source' && key !== 'date');
  if (metrics.every(([, value]) => value === null)) return null;
  return row;
}

function logDebug(where: string, err: unknown) {
  if (isDebugMode?.()) console.warn(`[ultrahuman] ${where} failed:`, (err as { message?: unknown } | null)?.message || err);
}
