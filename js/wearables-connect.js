// wearables-connect.js — Connect/disconnect/backfill orchestration
//
// Bridges the adapter registry (config), the vendor-specific fetcher + auth
// (wearables-oura.js, wearables-oura-auth.js), the L1 IndexedDB store, and
// the L2 summary gate. Keeps UI-side code clean of OAuth plumbing.

import { state } from './state.js';
import { saveImportedData } from './data.js';
import { adapterById, applyOAuthOverrides, getOAuthClientId } from './wearable-adapters.js';
import { upsertDailyBatch, clearSource, setMeta, getMeta, deleteMeta, countSource } from './wearables-store.js';
import { syncWearableSummary } from './wearables-summary.js';
import { fetchOuraDailyRange, fetchOuraPersonalInfo, daysAgoIso, isoDay } from './wearables-oura.js';
import { beginOAuth as beginOuraOAuth, completeOAuthCallback as completeOuraCallback, isOuraCallback, withFreshToken as ouraWithFreshToken, DEFAULT_OURA_SCOPES } from './wearables-oura-auth.js';
import { fetchWhoopDailyRange, fetchWhoopPersonalInfo } from './wearables-whoop.js';
import { beginOAuth as beginWhoopOAuth, completeOAuthCallback as completeWhoopCallback, isWhoopCallback, withFreshToken as whoopWithFreshToken, DEFAULT_WHOOP_SCOPES } from './wearables-whoop-auth.js';
import { fetchFitbitDailyRange, fetchFitbitPersonalInfo } from './wearables-fitbit.js';
import { beginOAuth as beginFitbitOAuth, completeOAuthCallback as completeFitbitCallback, isFitbitCallback, withFreshToken as fitbitWithFreshToken, DEFAULT_FITBIT_SCOPES } from './wearables-fitbit-auth.js';
import { fetchUltrahumanDailyRange, fetchUltrahumanPersonalInfo } from './wearables-ultrahuman.js';
import { beginOAuth as beginUltrahumanOAuth, completeOAuthCallback as completeUltrahumanCallback, isUltrahumanCallback, withFreshToken as ultrahumanWithFreshToken, DEFAULT_ULTRAHUMAN_SCOPES } from './wearables-ultrahuman-auth.js';
import { fetchWithingsDailyRange, fetchWithingsPersonalInfo } from './wearables-withings.js';
import { beginOAuth as beginWithingsOAuth, completeOAuthCallback as completeWithingsCallback, isWithingsCallback, withFreshToken as withingsWithFreshToken, DEFAULT_WITHINGS_SCOPES } from './wearables-withings-auth.js';
import { fetchPolarDailyRange, fetchPolarPersonalInfo, registerPolarUser, commitPolarTransactions } from './wearables-polar.js';
import { beginOAuth as beginPolarOAuth, completeOAuthCallback as completePolarCallback, isPolarCallback, withFreshToken as polarWithFreshToken, DEFAULT_POLAR_SCOPES } from './wearables-polar-auth.js';
import { getActiveProfileId } from './profile.js';
import { isDebugMode, showNotification } from './utils.js';

const BACKFILL_DAYS = 90;

// Defense-in-depth: scrub any token-shaped substring out of an error message
// before surfacing it to the user. Vendors occasionally echo the access
// token back in error bodies (Withings has done this historically); we
// don't want it leaking into a toast.
function _scrubError(msg) {
  if (typeof msg !== 'string') return String(msg);
  return msg
    .replace(/[Bb]earer\s+[A-Za-z0-9._\-]+/g, 'Bearer [redacted]')
    .replace(/access[_\s-]?token['"\s:=]+[A-Za-z0-9._\-]{16,}/gi, 'access_token=[redacted]')
    .replace(/refresh[_\s-]?token['"\s:=]+[A-Za-z0-9._\-]{16,}/gi, 'refresh_token=[redacted]');
}

// ─────────────────────────────────────────────────────────
// importedData.wearableConnections read/write
// ─────────────────────────────────────────────────────────
// Stored in the same blob as other credentials. Rides Evolu sync so the
// connection is available on the user's other devices.

function getConnections() {
  if (!state.importedData) return {};
  if (!state.importedData.wearableConnections) state.importedData.wearableConnections = {};
  return state.importedData.wearableConnections;
}

export function getConnection(adapterId) {
  return getConnections()[adapterId] || null;
}

export function listConnectedSources() {
  const map = getConnections();
  const out = {};
  for (const [sid, conn] of Object.entries(map)) {
    if (conn?.connectedAt) {
      out[sid] = {
        connectedSince: conn.connectedAt,
        lastSyncAt: conn.lastSyncAt || 0,
      };
    }
  }
  return out;
}

function saveConnection(adapterId, conn) {
  const map = getConnections();
  map[adapterId] = conn;
  saveImportedData();
}

function removeConnection(adapterId) {
  const map = getConnections();
  delete map[adapterId];
  saveImportedData();
}

// ─────────────────────────────────────────────────────────
// OAuth kick-off
// ─────────────────────────────────────────────────────────

// Starts the OAuth flow. Navigates away from the current page — control
// returns via the redirect handler in main.js (see `handleOAuthCallbackOnLoad`).
export function beginConnectOAuth(adapterId) {
  const adapter = adapterById(adapterId);
  if (!adapter) throw new Error(`Unknown adapter: ${adapterId}`);
  if (adapter.authType !== 'oauth2') throw new Error(`Adapter ${adapterId} is not OAuth2`);
  const kick = OAUTH_DISPATCH[adapter.id]?.begin;
  if (!kick) throw new Error(`Unsupported OAuth adapter: ${adapter.id}`);
  kick({
    clientId: getOAuthClientId(adapter),
    registeredUris: adapter.oauth.redirectUris,
    scopes: adapter.oauth.scopes,
  });
}

// Per-adapter OAuth wiring table. Keeps the orchestrator out of vendor-specific
// branch logic — new adapters register here once and flow through generically.
export const OAUTH_DISPATCH = {
  oura: {
    begin: (args) => beginOuraOAuth({ ...args, scopes: args.scopes || DEFAULT_OURA_SCOPES }),
    isCallback: isOuraCallback,
    complete: completeOuraCallback,
    withFreshToken: ouraWithFreshToken,
    fetchAccountInfo: fetchOuraPersonalInfo,
    fetchRange: fetchOuraDailyRange,
    displayName: 'Oura',
  },
  whoop: {
    begin: (args) => beginWhoopOAuth({ ...args, scopes: args.scopes || DEFAULT_WHOOP_SCOPES }),
    isCallback: isWhoopCallback,
    complete: completeWhoopCallback,
    withFreshToken: whoopWithFreshToken,
    fetchAccountInfo: fetchWhoopPersonalInfo,
    fetchRange: fetchWhoopDailyRange,
    displayName: 'WHOOP',
  },
  withings: {
    begin: (args) => beginWithingsOAuth({ ...args, scopes: args.scopes || DEFAULT_WITHINGS_SCOPES }),
    isCallback: isWithingsCallback,
    complete: completeWithingsCallback,
    withFreshToken: withingsWithFreshToken,
    fetchAccountInfo: fetchWithingsPersonalInfo,
    fetchRange: fetchWithingsDailyRange,
    displayName: 'Withings',
  },
  ultrahuman: {
    begin: (args) => beginUltrahumanOAuth({ ...args, scopes: args.scopes || DEFAULT_ULTRAHUMAN_SCOPES }),
    isCallback: isUltrahumanCallback,
    complete: completeUltrahumanCallback,
    withFreshToken: ultrahumanWithFreshToken,
    fetchAccountInfo: fetchUltrahumanPersonalInfo,
    fetchRange: fetchUltrahumanDailyRange,
    displayName: 'Ultrahuman',
  },
  fitbit: {
    begin: (args) => beginFitbitOAuth({ ...args, scopes: args.scopes || DEFAULT_FITBIT_SCOPES }),
    isCallback: isFitbitCallback,
    complete: completeFitbitCallback,
    withFreshToken: fitbitWithFreshToken,
    fetchAccountInfo: fetchFitbitPersonalInfo,
    fetchRange: fetchFitbitDailyRange,
    displayName: 'Fitbit',
  },
  polar: {
    begin: (args) => beginPolarOAuth({ ...args, scopes: args.scopes || DEFAULT_POLAR_SCOPES }),
    isCallback: isPolarCallback,
    complete: completePolarCallback,
    withFreshToken: polarWithFreshToken,
    fetchAccountInfo: (accessToken, connection) => fetchPolarPersonalInfo(accessToken, connection?.userId),
    fetchRange: (accessToken, startDate, endDate, connection) => fetchPolarDailyRange(accessToken, startDate, endDate, connection),
    // Polar-only hooks — invoked by connect/backfill when present; other
    // adapters don't need them and the orchestrator treats missing as no-op.
    postConnect: registerPolarUser,
    commitAfterWrite: commitPolarTransactions,
    displayName: 'Polar',
  },
};

// Called from main.js on page load. Returns true if a callback was handled.
// Dispatches to the right vendor based on which pending sessionStorage entry
// matches the incoming ?state= — lets multiple OAuth providers coexist.
export async function handleOAuthCallbackOnLoad() {
  const urlParams = new URLSearchParams(window.location.search);
  // Find the first registered adapter whose callback-matcher recognises this URL.
  const adapterId = Object.keys(OAUTH_DISPATCH).find(id => OAUTH_DISPATCH[id].isCallback(urlParams));
  if (!adapterId) return false;

  const disp = OAUTH_DISPATCH[adapterId];
  const result = await disp.complete(urlParams);
  window.history.replaceState(null, '', window.location.pathname);

  if (!result.ok) {
    showNotification?.(`${disp.displayName} connection failed: ${result.error}`, 'error', 5000);
    return true;
  }

  // If the user swapped profile mid-OAuth, the auth module stored the
  // initiating profileId in sessionStorage; honour it so the connection
  // doesn't land in the wrong profile's data. We can't retroactively switch
  // the active profile here (would kick the whole UI around), so refuse the
  // connect and ask the user to switch back first.
  const activeProfile = getActiveProfileId();
  if (result.profileId && result.profileId !== activeProfile) {
    showNotification?.(`${disp.displayName} was connected for a different profile — switch back to that profile and retry.`, 'error', 6000);
    return true;
  }

  // Persist the connection FIRST so fetchAccountInfo (which may need userId)
  // and any postConnect hook can read the userId the token grant returned.
  saveConnection(adapterId, {
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken,
    expiresAt: result.tokens.expiresAt,
    scope: result.tokens.scope,
    userId: result.tokens.userId || null,
    connectedAt: new Date().toISOString(),
    account: null,
    lastSyncAt: 0,
  });
  const conn0 = getConnection(adapterId);
  // Pass a MINIMAL arg shape — fetchAccountInfo only needs userId for vendors
  // that scope by user (Polar). Don't hand the whole connection object
  // (with refreshToken) to a per-vendor function — defensive against a
  // future contributor logging the second arg for debugging.
  const info = await disp.fetchAccountInfo(result.tokens.accessToken, { userId: conn0?.userId });
  saveConnection(adapterId, { ...getConnection(adapterId), account: info.ok ? info.account : null });
  // Polar-only one-time user registration (409 if already registered — fine).
  if (typeof disp.postConnect === 'function') {
    // The token grant MUST carry x_user_id — without it two profiles connecting
    // Polar on the same browser would collide on the literal "user" fallback,
    // and the second profile's data fetches would alias to the first one's
    // member registration. Refuse rather than silently pollute.
    if (!result.tokens.userId) {
      saveConnection(adapterId, { ...getConnection(adapterId), needsReauth: true });
      showNotification?.(`${disp.displayName}: connect response missing user id — please reconnect`, 'error', 5000);
      return;
    }
    const memberId = `getbased-${activeProfile}-${result.tokens.userId}`;
    try {
      const reg = await disp.postConnect(result.tokens.accessToken, memberId);
      if (reg?.ok) {
        saveConnection(adapterId, { ...getConnection(adapterId), polarRegistered: true });
      } else if (isDebugMode?.()) {
        console.warn(`[wearables] ${disp.displayName} postConnect failed:`, reg?.error);
      }
    } catch (e) { if (isDebugMode?.()) console.warn(`[wearables] ${disp.displayName} postConnect threw:`, e); }
  }
  showNotification?.(`${disp.displayName} connected — backfilling 90 days in background…`, 'info', 4000);
  if (window.navigate) window.navigate('dashboard');
  // Snapshot active profile now so the background IIFE writes into the same
  // profile even if the user swaps profiles during the backfill.
  const profileAtConnect = getActiveProfileId();
  (async () => {
    try {
      const bf = await backfillWearable(adapterId);
      // Only persist the summary if the user hasn't swapped profiles out from
      // under us. Summary is tied to a specific profile's L1 IDB.
      if (getActiveProfileId() === profileAtConnect) {
        await syncWearableSummary(profileAtConnect, listConnectedSources());
      }
      showNotification?.(`${disp.displayName} backfilled ${bf.rows} days`, 'success');
      if (window.navigate) window.navigate('dashboard');
    } catch (e) {
      showNotification?.(`${disp.displayName} backfill failed: ${_scrubError(e.message)}`, 'error', 5000);
    }
  })();
  return true;
}

// (PAT flow removed in v1.23.3 — all OAuth2 adapters now go through the
//  unified OAUTH_DISPATCH table + handleOAuthCallbackOnLoad. Ultrahuman
//  moved from legacy static-token to their OAuth2 partner API.)

// ─────────────────────────────────────────────────────────
// Per-adapter dispatch (fetch + auth refresh)
// ─────────────────────────────────────────────────────────

// Wraps a fetcher call with token refresh. On 401, does one retry with a
// forced refresh — guards against the case where the access token expired
// between our clock check and the actual API call.
async function callWithRefresh(adapter, fetcher) {
  let conn = getConnection(adapter.id);
  if (!conn) throw new Error(`Not connected: ${adapter.id}`);

  const disp = OAUTH_DISPATCH[adapter.id];
  if (!disp) throw new Error(`No auth dispatch for ${adapter.id}`);
  const wft = disp.withFreshToken;

  conn = await wft(conn, getOAuthClientId(adapter), async (updated) => {
    saveConnection(adapter.id, updated);
  }, () => getConnection(adapter.id)).catch(async e => {
    if (e?.code === 'needs-reauth' || e?.status === 400 || e?.status === 401) {
      saveConnection(adapter.id, { ...conn, needsReauth: true });
      const wrap = new Error('Reconnect required'); wrap.code = 'needs-reauth'; throw wrap;
    }
    throw e;
  });

  try {
    return await fetcher(conn.accessToken);
  } catch (e) {
    if (e?.status !== 401) throw e;
    const forced = { ...conn, expiresAt: 0 };
    const refreshed = await wft(forced, getOAuthClientId(adapter), async (u) => saveConnection(adapter.id, u), () => getConnection(adapter.id));
    return fetcher(refreshed.accessToken);
  }
}

async function fetchRange(adapter, startDate, endDate, opts = {}) {
  if (adapter.id === 'oura') {
    return callWithRefresh(adapter, (token) => fetchOuraDailyRange(token, startDate, endDate));
  }
  if (adapter.id === 'whoop') {
    return callWithRefresh(adapter, (token) => fetchWhoopDailyRange(token, startDate, endDate));
  }
  if (adapter.id === 'withings') {
    return callWithRefresh(adapter, (token) => fetchWithingsDailyRange(token, startDate, endDate, opts.lastSyncUnix ?? null));
  }
  if (adapter.id === 'ultrahuman') {
    return callWithRefresh(adapter, (token) => fetchUltrahumanDailyRange(token, startDate, endDate));
  }
  if (adapter.id === 'fitbit') {
    return callWithRefresh(adapter, (token) => fetchFitbitDailyRange(token, startDate, endDate));
  }
  if (adapter.id === 'polar') {
    // Polar needs the live connection (userId + transaction state).
    return callWithRefresh(adapter, (token) => fetchPolarDailyRange(token, startDate, endDate, getConnection('polar')));
  }
  return [];
}

// ─────────────────────────────────────────────────────────
// Backfill / incremental sync
// ─────────────────────────────────────────────────────────

export async function backfillWearable(adapterId, daysBack = BACKFILL_DAYS) {
  const adapter = adapterById(adapterId);
  if (!adapter) throw new Error(`Unknown adapter: ${adapterId}`);
  const conn = getConnection(adapterId);
  if (!conn?.accessToken) throw new Error(`Not connected: ${adapterId}`);
  const profileId = getActiveProfileId();

  const startDate = daysAgoIso(daysBack);
  const endDate = isoDay();
  const rows = await fetchRange(adapter, startDate, endDate);
  if (isDebugMode?.()) console.log(`[wearables] ${adapterId} backfill ${startDate}..${endDate}: ${rows.length} rows`);

  if (rows.length > 0) await upsertDailyBatch(profileId, rows);
  // Pass the pre-await connection snapshot so a profile swap mid-flight
  // can't make the commit run against the new profile's token.
  await commitAfterWriteIfAny(adapterId, rows, conn);
  await setMeta(profileId, `last-sync:${adapterId}`, { at: Date.now(), rows: rows.length, startDate, endDate });

  // Re-read the live connection — if it disappeared mid-flight (profile swap,
  // state reload, etc.), DO NOT write a partial stub that wipes tokens. This
  // was the root of the "Settings says not connected after backfill" bug.
  const current = getConnection(adapterId);
  if (current?.accessToken) {
    saveConnection(adapterId, { ...current, lastSyncAt: Date.now(), needsReauth: false });
  }
  return { rows: rows.length, startDate, endDate };
}

// Adapter-specific post-write hook. Polar uses this to commit open AccessLink
// transactions once rows safely landed in L1. No-op for every other adapter.
// `connSnapshot` is the connection captured BEFORE the upsertDailyBatch await
// — if the user swaps profiles mid-flight, we'd otherwise read the new
// profile's connection (or null) and commit the OLD profile's transactions
// against the wrong token.
async function commitAfterWriteIfAny(adapterId, rows, connSnapshot) {
  const disp = OAUTH_DISPATCH[adapterId];
  const pending = rows?._polarTransactions;
  if (!disp?.commitAfterWrite || !pending?.length) return;
  try {
    // Prefer the snapshot when present; fall back to live read for callers
    // that haven't been migrated yet.
    const conn = connSnapshot || getConnection(adapterId);
    if (conn?.accessToken) await disp.commitAfterWrite(conn.accessToken, pending);
  } catch (e) { if (isDebugMode?.()) console.warn(`[wearables] ${adapterId} commit failed:`, e); }
}

// Incremental sync — pull from the last successful sync day (or 7d back,
// whichever is earlier, so a missed day gets backfilled).
export async function incrementalSyncWearable(adapterId, { force = false } = {}) {
  const conn = getConnection(adapterId);
  if (!conn?.accessToken) return { skipped: true, reason: 'not-connected' };
  const profileId = getActiveProfileId();

  const lastSync = await getMeta(profileId, `last-sync:${adapterId}`);
  const fallbackStart = daysAgoIso(7);
  // Always use AT LEAST a 7-day window. When `lastSync.endDate` is already
  // today (because the user synced earlier the same day), the previous
  // `[today, today]` window sometimes returns no rows from Oura's /sleep —
  // observed bug where strip's "Sync now" did nothing while Settings →
  // "Re-sync last 90 days" caught the missing HRV/RHR. Background
  // scheduler runs every 6h and used to have the same regression; floor
  // here closes both paths. Wider window overlaps with already-synced
  // data; upsertDailyBatch is idempotent (read-merge-put preserves
  // non-null fields) so the cost is a handful of redundant rows per sync.
  let startDate;
  if (lastSync?.endDate && lastSync.endDate < fallbackStart) {
    // Previous sync is older than 7 days — backfill from there, but cap
    // at BACKFILL_DAYS to avoid 90+ day windows on long-stale connections.
    const back = daysAgoIso(BACKFILL_DAYS);
    startDate = lastSync.endDate < back ? back : lastSync.endDate;
  } else {
    startDate = fallbackStart;
  }
  const endDate = isoDay();
  // The `force` arg is now informational only — kept for API compatibility
  // and used downstream by syncWearableSummary to bypass the L2 gate.
  void force;

  const adapter = adapterById(adapterId);
  // Pass `lastSyncUnix` so adapters that support incremental fetch (Withings)
  // can ask the API for "anything modified since" instead of a fixed window —
  // catches retroactive manual entries (BP backfilled a week later, etc.).
  const rows = await fetchRange(adapter, startDate, endDate, { lastSyncUnix: lastSync?.at || conn.lastSyncAt || null });
  if (rows.length > 0) await upsertDailyBatch(profileId, rows);
  // Snapshot connection (see backfillWearable) — profile-swap mid-flight
  // safety.
  await commitAfterWriteIfAny(adapterId, rows, conn);
  await setMeta(profileId, `last-sync:${adapterId}`, { at: Date.now(), rows: rows.length, startDate, endDate });

  // Same guard as backfillWearable — never overwrite a full connection with
  // a tokenless stub if state was swapped while we were fetching.
  const current = getConnection(adapterId);
  if (current?.accessToken) {
    saveConnection(adapterId, { ...current, lastSyncAt: Date.now(), needsReauth: false });
  }
  return { rows: rows.length, startDate, endDate };
}

// ─────────────────────────────────────────────────────────
// Disconnect
// ─────────────────────────────────────────────────────────

export async function disconnectWearable(adapterId, { deleteData = true } = {}) {
  const profileId = getActiveProfileId();
  removeConnection(adapterId);
  if (deleteData) {
    try { await clearSource(profileId, adapterId); } catch (e) { if (isDebugMode?.()) console.warn('[wearables] clearSource failed:', e.message); }
    // Drop the `last-sync:{adapterId}` meta entry too — otherwise a future
    // reconnect's incrementalSyncWearable picks up the stale endDate as
    // start, missing the freshly-cleared backfill range until the
    // recoverIfL1Empty scheduler eventually full-resyncs.
    try { await deleteMeta(profileId, `last-sync:${adapterId}`); } catch { /* meta wipe failure is recoverable */ }
    if (state.importedData?.wearableSummary?.sources?.[adapterId]) {
      delete state.importedData.wearableSummary.sources[adapterId];
      if (Object.keys(state.importedData.wearableSummary.sources).length === 0) {
        delete state.importedData.wearableSummary;
      }
      saveImportedData();
    }
  }
}

// ─────────────────────────────────────────────────────────
// Top-level orchestrator: sync one source end-to-end
// ─────────────────────────────────────────────────────────

export async function syncNow(adapterId, { force = false } = {}) {
  const profileId = getActiveProfileId();
  try {
    const res = await incrementalSyncWearable(adapterId, { force });
    if (res.skipped) return res;
    // Manual user-driven syncs pass `force: true` so the L2 gate (which
    // skips writes when the d7 mean / trend / weekly delta haven't moved
    // ≥ 5%) can't make the strip card "stick" on a stale snapshot.
    // Background scheduler omits the flag → keeps Evolu writes minimal.
    await syncWearableSummary(profileId, listConnectedSources(), { force });
    return res;
  } catch (e) {
    const displayName = adapterById(adapterId)?.displayName || adapterId;
    if (e?.code === 'needs-reauth') {
      showNotification?.(`${displayName} needs reconnection — open Settings → Wearables`, 'error', 5000);
    } else if (e?.status === 401 || e?.status === 403) {
      const conn = getConnection(adapterId);
      if (conn) saveConnection(adapterId, { ...conn, needsReauth: true });
      showNotification?.(`${displayName} token rejected — reconnect`, 'error');
    } else {
      if (isDebugMode?.()) console.warn(`[wearables] syncNow ${adapterId} failed:`, e.message);
      showNotification?.(`${displayName} sync failed: ${_scrubError(e.message)}`, 'error', 4000);
    }
    throw e;
  }
}

export async function syncAllConnected() {
  const sources = listConnectedSources();
  const results = {};
  for (const sid of Object.keys(sources)) {
    try { results[sid] = await syncNow(sid); }
    catch (e) { results[sid] = { error: e.message }; }
  }
  return results;
}

export async function recoverIfL1Empty(adapterId) {
  const conn = getConnection(adapterId);
  if (!conn?.accessToken) return { skipped: true };
  // Skip if the connection is already flagged as needing reauth — backfill
  // would 401 → flip the same flag again and the user gets noisy errors
  // every scheduler tick. Wait for them to reconnect before retrying.
  if (conn.needsReauth) return { skipped: true, reason: 'needs-reauth' };
  const profileId = getActiveProfileId();
  const n = await countSource(profileId, adapterId).catch(() => 0);
  if (n > 0) return { skipped: true, rows: n };
  if (isDebugMode?.()) console.log(`[wearables] L1 empty for ${adapterId} — recovering via backfill`);
  return backfillWearable(adapterId);
}

// ─────────────────────────────────────────────────────────
// Scheduler — only runs while the tab is open
// ─────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STALE_MS         = 12 * 60 * 60 * 1000;

let _pollTimer = null;
let _schedulerInstalled = false;

async function maybeSyncStaleSources() {
  // Wait for the runtime-config fetch (or its 1.5s timeout) so a self-hoster's
  // first scheduled refresh doesn't race the override and call the token
  // endpoint with a stale (hardcoded maintainer) clientId. Hosted users see
  // a no-op since the promise resolves immediately to {} overrides.
  await runtimeConfigReady();
  const sources = getConnections();
  const now = Date.now();
  for (const [sid, conn] of Object.entries(sources)) {
    if (!conn?.accessToken) continue;
    if (conn.needsReauth) continue;
    const last = conn.lastSyncAt || 0;
    if (now - last < STALE_MS) continue;
    try {
      await recoverIfL1Empty(sid);
      await syncNow(sid);
    } catch (e) { if (isDebugMode?.()) console.warn(`[wearables] scheduled sync ${sid} failed:`, e.message); }
  }
}

export function initWearableScheduler() {
  if (_schedulerInstalled) return;
  _schedulerInstalled = true;
  maybeSyncStaleSources();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') maybeSyncStaleSources();
  });
  _pollTimer = setInterval(maybeSyncStaleSources, POLL_INTERVAL_MS);
  window.addEventListener('beforeunload', () => { if (_pollTimer) clearInterval(_pollTimer); });
}

// ─────────────────────────────────────────────────────────
// Runtime config (self-host OAuth client_id overrides)
// ─────────────────────────────────────────────────────────
//
// Fired once from main.js, then awaited by the scheduler so its first
// refresh attempt sees the override map (rather than racing against an
// unresolved fetch and hitting `invalid_client` with the maintainer's
// clientId paired with the self-hoster's secret).
//
// Bounded by RUNTIME_CONFIG_TIMEOUT_MS so a slow / down /api/proxy can't
// stall the scheduler indefinitely — on timeout we fall back to whatever
// the adapter registry has hardcoded (i.e. the hosted-user behavior).

const RUNTIME_CONFIG_TIMEOUT_MS = 1500;
let _runtimeConfigPromise = null;

export function loadWearableRuntimeConfig() {
  if (_runtimeConfigPromise) return _runtimeConfigPromise;
  const fetchPromise = (async () => {
    try {
      const res = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wearable_runtime_config: true }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.overrides) applyOAuthOverrides(data.overrides);
    } catch { /* offline / proxy missing — silently fall back to hardcoded */ }
  })();
  // Race the fetch against a soft timeout so the scheduler never blocks
  // longer than RUNTIME_CONFIG_TIMEOUT_MS, even if the network never
  // resolves. The fetch itself continues in the background — if it lands
  // after the timeout, applyOAuthOverrides still runs and the *next*
  // visibilitychange / poll-interval sync picks up the override.
  const timeoutPromise = new Promise(resolve => setTimeout(resolve, RUNTIME_CONFIG_TIMEOUT_MS));
  _runtimeConfigPromise = Promise.race([fetchPromise, timeoutPromise]);
  return _runtimeConfigPromise;
}

// Used by the scheduler to gate its first sync. If main.js skipped the
// bootstrap call (test contexts, embedded usage), this resolves promptly
// so the scheduler isn't blocked forever.
function runtimeConfigReady() {
  return _runtimeConfigPromise || Promise.resolve();
}
