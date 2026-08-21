// @ts-check
// wearables-polar.js — Polar AccessLink data layer
//
// BETA. AccessLink has two unusual quirks that shape this module:
//
//   1. Transactions model. For `activity-transactions` and
//      `exercise-transactions` you POST to *open* a transaction, receive a
//      list of item URLs, GET each one, then PUT .../transactions/{id} to
//      commit. Polar guarantees each item is delivered exactly once — if we
//      open a transaction and never commit, we get the same data again next
//      time (safe). If we commit before IndexedDB persistence succeeds, we
//      lose those items (not safe). So the helper commits ONLY after the
//      caller confirms the rows reached L1.
//
//   2. One-time user registration. After the first token issue, the app MUST
//      POST /v3/users with `{ member-id: <stable-string> }` to link the
//      authorized user. Without it, every data call returns 403. The
//      registration is idempotent from our side (wearables-connect.js stores
//      a `polarRegistered: true` flag on the connection blob and we skip the
//      call on subsequent connects); POST to /v3/users again returns 409.

import { getErrorMessage, getErrorStatus } from './caught-error.js';
import { getProxyApiUrl } from './proxy-runtime.js';
import { isDebugMode } from './utils.js';

const POLAR_API   = 'https://www.polaraccesslink.com';
const PROXY_URL   = getProxyApiUrl();

async function polarGET(url, accessToken) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url, method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
    }),
  });
  if (!res.ok) {
    let err; try { err = await res.json(); } catch { err = { error: res.statusText }; }
    /** @type {Error & { status?: number }} */
    const e = new Error(err?.error || err?.detail || res.statusText || 'Polar request failed');
    e.status = res.status; throw e;
  }
  // Polar returns 204 on empty transactions — no body. Normalize to null.
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function polarSend(url, method, accessToken, body) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url, method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  });
  if (!res.ok) {
    let err; try { err = await res.json(); } catch { err = { error: res.statusText }; }
    /** @type {Error & { status?: number }} */
    const e = new Error(err?.error || err?.detail || res.statusText || `Polar ${method} failed`);
    e.status = res.status; throw e;
  }
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

// ─────────────────────────────────────────────────────────
// User registration (one-time)
// ─────────────────────────────────────────────────────────
// Must run once per connection before any data fetch works. Idempotent from
// the caller's POV — 409 is treated as success (already registered).
export async function registerPolarUser(accessToken, memberId) {
  try {
    const out = await polarSend(`${POLAR_API}/v3/users`, 'POST', accessToken, { 'member-id': memberId });
    return { ok: true, user: out, alreadyRegistered: false };
  } catch (e) {
    if (getErrorStatus(e) === 409) return { ok: true, user: null, alreadyRegistered: true };
    return { ok: false, error: getErrorMessage(e), status: getErrorStatus(e) };
  }
}

export async function fetchPolarPersonalInfo(accessToken, userId) {
  // Personal info is optional from our perspective — connect flow already has
  // userId from the token grant. Best-effort.
  if (!userId) return { ok: false, error: 'No userId on connection' };
  try {
    const info = await polarGET(`${POLAR_API}/v3/users/${encodeURIComponent(userId)}`, accessToken);
    return { ok: true, account: {
      email: null,
      userId: String(userId),
      firstName: info?.['first-name'] || null,
      lastName:  info?.['last-name']  || null,
    }};
  } catch (e) {
    return { ok: false, error: getErrorMessage(e), status: getErrorStatus(e) };
  }
}

// ─────────────────────────────────────────────────────────
// Transactions-backed range fetch
// ─────────────────────────────────────────────────────────
// Opens an activity-transaction and a sleep fetch in parallel, reads the
// listed items, maps to canonical daily rows in [startDate, endDate].
// DOES NOT commit the transaction — the caller must do that after a
// successful L1 write, via commitPolarTransactions().
export async function fetchPolarDailyRange(accessToken, startDate, endDate, connection = {}) {
  const userId = connection.userId;
  if (!userId) {
    /** @type {Error & { code?: string }} */
    const e = new Error('Polar connection missing userId — reconnect to obtain one');
    e.code = 'needs-reauth'; throw e;
  }

  const byDate = new Map();
  function ensureRow(day) {
    if (!byDate.has(day)) {
      byDate.set(day, {
        source: 'polar', date: day,
        hrv_rmssd: null, hrv_sdnn: null, rhr: null,
        hrv_day: null, hr_day: null,
        sleep_score: null, readiness_score: null,
        activity_score: null, steps: null,
        strain: null,
        stress_high_min: null, resilience_level: null, cardio_age: null,
        weight: null, bp_systolic: null, bp_diastolic: null,
        spo2_avg: null, body_temp_delta: null, glucose_avg: null,
      });
    }
    return byDate.get(day);
  }
  // Sleep endpoint is windowed by the API itself, so we filter sleep rows
  // to the requested range. Activity/exercise come from one-shot transactions
  // and we accept every dated item — see notes on the transaction blocks.
  function inRange(day) {
    return day >= startDate && day <= endDate;
  }

  const pendingTransactions = [];

  // ── 1. Sleep (no transaction model — straight GET) ───────────────
  try {
    const sleep = await polarGET(`${POLAR_API}/v3/users/${encodeURIComponent(userId)}/nights/sleep`, accessToken);
    for (const n of (sleep?.nights || [])) {
      const day = n?.date || n?.['calendar-date'];
      if (!day || !inRange(day)) continue;
      const row = ensureRow(day);
      if (typeof n['sleep-score'] === 'number') row.sleep_score = n['sleep-score'];
      if (row.rhr == null && typeof n['heart-rate-samples']?.min === 'number') row.rhr = n['heart-rate-samples'].min;
    }
  } catch (e) { logDebug('nights/sleep', e); }

  // ── 2. Activity transactions (daily summaries) ───────────────────
  try {
    const actTx = await polarSend(
      `${POLAR_API}/v3/users/${encodeURIComponent(userId)}/activity-transactions`,
      'POST', accessToken
    );
    if (actTx?.['transaction-id']) {
      pendingTransactions.push({ kind: 'activity', userId, id: actTx['transaction-id'] });
      for (const itemUrl of (actTx['activity-log'] || actTx?.activities || [])) {
        try {
          const item = await polarGET(itemUrl, accessToken);
          const day = item?.date || item?.['created']?.slice(0, 10);
          // No inRange() filter here. Polar transactions are exactly-once —
          // committing without writing means the data is gone forever from
          // the user's queue. Earlier the inRange check dropped retroactively
          // dated activities (e.g. a workout that synced from a watch days
          // late) and the transaction commit then permanently lost them.
          // Keep every dated item; downstream L2 windows trim what they
          // care about, and L1 upserts dedupe so duplicates are harmless.
          if (!day) continue;
          const row = ensureRow(day);
          if (row.steps == null && typeof item['active-steps'] === 'number') row.steps = item['active-steps'];
          if (row.hr_day == null && typeof item?.['heart-rate']?.average === 'number') row.hr_day = item['heart-rate'].average;
        } catch (e) { logDebug('activity-item', e); }
      }
    }
  } catch (e) { logDebug('activity-transactions', e); }

  // ── 3. Exercise transactions (workout-gated HRV) ─────────────────
  try {
    const exTx = await polarSend(
      `${POLAR_API}/v3/users/${encodeURIComponent(userId)}/exercise-transactions`,
      'POST', accessToken
    );
    if (exTx?.['transaction-id']) {
      pendingTransactions.push({ kind: 'exercise', userId, id: exTx['transaction-id'] });
      for (const itemUrl of (exTx?.exercises || [])) {
        try {
          const ex = await polarGET(itemUrl, accessToken);
          const day = (ex?.['start-time'] || '').slice(0, 10);
          // No inRange() filter — same exactly-once concern as the activity
          // transaction above. Drop the workout from THIS sync's window
          // would mean Polar marks it consumed and we never see it again.
          if (!day) continue;
          const row = ensureRow(day);
          // Workout-gated HRV: this is a daytime/active measurement during
          // exercise — semantically distinct from overnight rMSSD. Route to
          // hrv_day so the strip's hrv_rmssd card stays a recovery signal.
          if (typeof ex?.['heart-rate-variability-avg'] === 'number' && row.hrv_day == null) {
            row.hrv_day = ex['heart-rate-variability-avg'];
          }
          // Workout HR average — daytime, route accordingly.
          if (row.hr_day == null && typeof ex?.['heart-rate']?.average === 'number') row.hr_day = ex['heart-rate'].average;
        } catch (e) { logDebug('exercise-item', e); }
      }
    }
  } catch (e) { logDebug('exercise-transactions', e); }

  const rows = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  // Stash pending transactions on the rows array so the caller (wearables-connect.js)
  // can commit them after L1 write succeeds. Hiding on a non-enumerable property
  // avoids leaking into JSON serialization of the daily rows.
  Object.defineProperty(rows, '_polarTransactions', { value: pendingTransactions, enumerable: false });
  return rows;
}

// Commit all listed transactions. Call ONLY after the rows have been persisted
// to L1. Any failure here means we'll see duplicate rows next sync — that's
// fine because L1 upserts dedupe by (source, date); the only real cost is one
// extra network round-trip the next time.
export async function commitPolarTransactions(accessToken, pendingTransactions) {
  if (!pendingTransactions?.length) return { ok: true, committed: 0 };
  let committed = 0;
  for (const { kind, userId, id } of pendingTransactions) {
    const path = kind === 'exercise' ? 'exercise-transactions' : 'activity-transactions';
    try {
      await polarSend(
        `${POLAR_API}/v3/users/${encodeURIComponent(userId)}/${path}/${encodeURIComponent(id)}`,
        'PUT', accessToken
      );
      committed++;
    } catch (e) { logDebug(`commit-${kind}`, e); }
  }
  return { ok: true, committed };
}

function logDebug(where, err) {
  if (isDebugMode?.()) console.warn(`[polar] ${where} failed:`, err?.message || err);
}
