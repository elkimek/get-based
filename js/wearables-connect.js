// @ts-check
// wearables-connect.js — Connect/disconnect/backfill orchestration
//
// Bridges the adapter registry (config), the vendor-specific fetcher + auth
// (wearables-oura.js, wearables-oura-auth.js), the L1 IndexedDB store, and
// the L2 summary gate. Keeps UI-side code clean of OAuth plumbing.

import { getErrorCode, getErrorMessage, getErrorStatus } from './caught-error.js';
import { state } from './state.js';
import { saveImportedData, saveImportedDataForProfile } from './data.js';
import { adapterById, applyOAuthConfigured, applyOAuthOverrides, getOAuthClientId, isOAuthAdapterConfigured } from './wearable-adapters.js';
import { upsertDailyBatch, clearSource, setMeta, setMetaVersioned, getMeta, deleteMeta, countSource } from './wearables-store.js';
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
import { fetchGoogleHealthDailyRange, fetchGoogleHealthPersonalInfo } from './wearables-google-health.js';
import { beginOAuth as beginGoogleHealthOAuth, completeOAuthCallback as completeGoogleHealthCallback, isGoogleHealthCallback, withFreshToken as googleHealthWithFreshToken, withGoogleHealthLifecycleLock, withGoogleHealthRefreshLock, googleHealthDisconnectedError, DEFAULT_GOOGLE_HEALTH_SCOPES } from './wearables-google-health-auth.js';
import { clearLocalWearableCredential, deleteWearableCredentials, hasLocalWearableCredential, loadWearableCredentials, markLocalWearableCredential, saveWearableCredentials, wearableCredentialGenerationKey } from './wearables-credential-vault.js';
import { applyWearableDisconnectToProfile, clearPendingWearableDisconnect, pendingWearableDisconnectMetaKey } from './wearables-disconnect-recovery.js';
import { getActiveProfileId } from './profile.js';
import { isDebugMode, showNotification } from './utils.js';
import {
  addWearablesBeforeUnloadRuntime,
  clearWearableOAuthCallbackRuntime,
  getWearableOAuthSearchParamsRuntime,
  navigateWearablesDashboardAfterConnectRuntime,
} from './wearables-connect-runtime.js';

export { recoverPendingWearableDisconnect } from './wearables-disconnect-recovery.js';

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
// Most existing providers still store credentials in importedData. Google
// Health is deliberately different: only non-secret connection metadata is
// kept here, while tokens live in the encrypted, device-local credential vault.

const VAULTED_CREDENTIAL_ADAPTERS = new Set(['google_health']);
const credentialCache = new Map();

function credentialCacheKey(profileId, adapterId) {
  return `${profileId}:${adapterId}`;
}

function usesCredentialVault(adapterId) {
  return VAULTED_CREDENTIAL_ADAPTERS.has(adapterId);
}

function connectionHasCredentials(adapterId, connection, profileId = getActiveProfileId()) {
  return usesCredentialVault(adapterId)
    ? Boolean(connection?.hasStoredCredentials && hasLocalWearableCredential(
      profileId,
      adapterId,
      connection?.credentialGeneration,
      credentialCache.has(credentialCacheKey(profileId, adapterId)),
    ))
    : Boolean(connection?.accessToken);
}

function metadataOnlyConnection(adapterId, connection) {
  if (!usesCredentialVault(adapterId)) return connection;
  const { accessToken, refreshToken, ...metadata } = connection;
  return {
    ...metadata,
    hasStoredCredentials: Boolean(metadata.hasStoredCredentials || accessToken || refreshToken),
  };
}

function getConnections(importedData = state.importedData) {
  if (!importedData) return {};
  if (!importedData.wearableConnections) importedData.wearableConnections = {};
  return importedData.wearableConnections;
}

export function getConnection(adapterId) {
  return getConnections()[adapterId] || null;
}

export function listConnectedSources() { return listConnectedSourcesFor(state.importedData, getActiveProfileId()); }

function listConnectedSourcesFor(importedData, profileId) {
  const map = getConnections(importedData);
  const out = {};
  for (const [sid, conn] of Object.entries(map)) {
    if (conn?.connectedAt && (!usesCredentialVault(sid) || connectionHasCredentials(sid, conn, profileId))) {
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
  map[adapterId] = metadataOnlyConnection(adapterId, conn);
  saveImportedData();
}

async function saveConnectionWithCredentials(adapterId, connection, profileId = getActiveProfileId()) {
  if (!usesCredentialVault(adapterId)) {
    saveConnection(adapterId, connection);
    return;
  }
  if (profileId !== getActiveProfileId()) {
    throw new Error('Profile changed while credentials were being refreshed.');
  }
  const credentials = {
    accessToken: connection.accessToken || null,
    refreshToken: connection.refreshToken || null,
    credentialGeneration: Number.isSafeInteger(connection.credentialGeneration)
      ? connection.credentialGeneration
      : null,
  };
  if (credentials.accessToken || credentials.refreshToken) {
    const generation = await saveWearableCredentials(profileId, adapterId, credentials);
    connection = { ...connection, credentialGeneration: generation };
    credentials.credentialGeneration = generation;
    try {
      if (!markLocalWearableCredential(profileId, adapterId, generation)) throw googleHealthDisconnectedError();
    } catch (error) {
      await deleteWearableCredentials(profileId, adapterId).catch(() => {});
      throw error;
    }
    credentialCache.set(credentialCacheKey(profileId, adapterId), credentials);
  }
  if (profileId !== getActiveProfileId()) {
    throw new Error('Profile changed while credentials were being refreshed.');
  }
  saveConnection(adapterId, connection);
}

async function hydratedConnection(adapterId) {
  const connection = getConnection(adapterId);
  if (!connection || !usesCredentialVault(adapterId)) return connection;
  const profileId = getActiveProfileId();
  const key = credentialCacheKey(profileId, adapterId);
  const credentials = await loadWearableCredentials(profileId, adapterId);
  if (credentials) credentialCache.set(key, credentials);
  else credentialCache.delete(key);
  if (!credentials && connection?.hasStoredCredentials) {
    try { clearLocalWearableCredential(profileId, adapterId, connection.credentialGeneration); } catch {}
    /** @type {Error & { code?: string }} */
    const error = new Error('Google Health must be connected separately on this device.');
    error.code = 'needs-device-connect';
    throw error;
  }
  return credentials ? { ...connection, ...credentials } : connection;
}

function latestHydratedConnection(adapterId, fallback, profileId = getActiveProfileId()) {
  if (profileId !== getActiveProfileId()) return fallback;
  const metadata = getConnection(adapterId);
  if (usesCredentialVault(adapterId) && (!metadata || !connectionHasCredentials(adapterId, metadata, profileId))) throw googleHealthDisconnectedError();
  if (!metadata || !usesCredentialVault(adapterId)) return metadata || fallback;
  const credentials = credentialCache.get(credentialCacheKey(profileId, adapterId));
  return credentials ? { ...metadata, ...credentials } : fallback;
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
// returns via the redirect handler in startup-oauth-callbacks.js.
export function beginConnectOAuth(adapterId) {
  const adapter = adapterById(adapterId);
  if (!adapter) throw new Error(`Unknown adapter: ${adapterId}`);
  if (adapter.authType !== 'oauth2') throw new Error(`Adapter ${adapterId} is not OAuth2`);
  const oauth = adapter.oauth;
  if (!oauth) throw new Error(`Adapter ${adapterId} is missing OAuth configuration`);
  if (adapter.id === 'google_health' && !isOAuthAdapterConfigured(adapter)) throw new Error('Google Health requires this deployment to use its own Google Cloud OAuth client.');
  const kick = OAUTH_DISPATCH[adapter.id]?.begin;
  if (!kick) throw new Error(`Unsupported OAuth adapter: ${adapter.id}`);
  kick({
    clientId: getOAuthClientId(adapter),
    registeredUris: oauth.redirectUris,
    scopes: oauth.scopes,
    profileId: state.currentProfile,
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
  google_health: {
    begin: (args) => beginGoogleHealthOAuth({ ...args, scopes: args.scopes || DEFAULT_GOOGLE_HEALTH_SCOPES }),
    isCallback: isGoogleHealthCallback,
    complete: completeGoogleHealthCallback,
    withFreshToken: googleHealthWithFreshToken,
    fetchAccountInfo: fetchGoogleHealthPersonalInfo,
    fetchRange: fetchGoogleHealthDailyRange,
    displayName: 'Google Health',
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
  const urlParams = getWearableOAuthSearchParamsRuntime();
  // Find the first registered adapter whose callback-matcher recognises this URL.
  const adapterId = Object.keys(OAUTH_DISPATCH).find(id => OAUTH_DISPATCH[id].isCallback(urlParams));
  if (!adapterId) return false;

  const disp = OAUTH_DISPATCH[adapterId];
  const result = await disp.complete(urlParams);
  clearWearableOAuthCallbackRuntime();

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
  try {
    await saveConnectionWithCredentials(adapterId, {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      expiresAt: result.tokens.expiresAt,
      scope: result.tokens.scope,
      userId: result.tokens.userId || null,
      connectedAt: new Date().toISOString(),
      account: null,
      lastSyncAt: 0,
      ...(adapterId === 'google_health' ? { dataSourceFamily: 'all-sources' } : {}),
    });
  } catch (error) {
    showNotification?.(`${disp.displayName} credentials could not be stored securely: ${_scrubError(getErrorMessage(error))}`, 'error', 6000);
    return true;
  }
  const conn0 = getConnection(adapterId);
  // Pass a MINIMAL arg shape — fetchAccountInfo only needs userId for vendors
  // that scope by user (Polar). Don't hand the whole connection object
  // (with refreshToken) to a per-vendor function — defensive against a
  // future contributor logging the second arg for debugging.
  const info = await disp.fetchAccountInfo(result.tokens.accessToken, { userId: conn0?.userId });
  // Guard: if the user swapped profiles during the network call, undo the
  // initial saveConnection (which landed on profile A's blob) and abort.
  if (getActiveProfileId() !== activeProfile) {
    showNotification?.(`${disp.displayName} connect aborted — profile changed`, 'error', 5000);
    return true;
  }
  saveConnection(adapterId, { ...getConnection(adapterId), account: info.ok ? info.account : null });
  // Polar-only one-time user registration (409 if already registered — fine).
  if (typeof disp.postConnect === 'function') {
    // The token grant MUST carry x_user_id — without it two profiles connecting
    // Polar on the same browser would collide on the literal "user" fallback,
    // and the second profile's data fetches would alias to the first one's
    // member registration. Refuse rather than silently pollute.
    if (!result.tokens.userId) {
      // Drop the half-connected record entirely — keeping it with needsReauth
      // strands the user (sync would 'missing userId'-throw on every retry).
      // A clean disconnect lets the UI show "not connected" so the user can
      // reconnect cleanly from the same place.
      removeConnection(adapterId);
      showNotification?.(`${disp.displayName}: connect response missing user id — please reconnect`, 'error', 5000);
      return true;
    }
    const memberId = `getbased-${activeProfile}-${result.tokens.userId}`;
    try {
      const reg = await disp.postConnect(result.tokens.accessToken, memberId);
      // Same profile-swap guard around the awaited postConnect.
      if (getActiveProfileId() !== activeProfile) {
        showNotification?.(`${disp.displayName} connect aborted — profile changed`, 'error', 5000);
        return true;
      }
      if (reg?.ok) {
        saveConnection(adapterId, { ...getConnection(adapterId), polarRegistered: true });
      } else if (isDebugMode?.()) {
        console.warn(`[wearables] ${disp.displayName} postConnect failed:`, reg?.error);
      }
    } catch (e) { if (isDebugMode?.()) console.warn(`[wearables] ${disp.displayName} postConnect threw:`, e); }
  }
  showNotification?.(`${disp.displayName} connected — backfilling 90 days in background…`, 'info', 4000);
  navigateWearablesDashboardAfterConnectRuntime();
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
      navigateWearablesDashboardAfterConnectRuntime();
    } catch (e) {
      showNotification?.(`${disp.displayName} backfill failed: ${_scrubError(getErrorMessage(e))}`, 'error', 5000);
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
  if (adapter.id === 'google_health' && !isOAuthAdapterConfigured(adapter)) throw Object.assign(new Error('Google Health is unavailable on this deployment.'), { code: 'deployment-unavailable' });
  const profileId = getActiveProfileId();
  let conn = await hydratedConnection(adapter.id);
  if (!conn) throw new Error(`Not connected: ${adapter.id}`);

  const disp = OAUTH_DISPATCH[adapter.id];
  if (!disp) throw new Error(`No auth dispatch for ${adapter.id}`);
  const wft = disp.withFreshToken;

  conn = await wft(conn, getOAuthClientId(adapter), async (updated) => {
    await saveConnectionWithCredentials(adapter.id, updated, profileId);
  }, () => latestHydratedConnection(adapter.id, conn, profileId)).catch(async e => {
    if (e?.code === 'needs-reauth' || e?.status === 400 || e?.status === 401) {
      if (getActiveProfileId() === profileId) {
        saveConnection(adapter.id, { ...conn, needsReauth: true });
      }
      /** @type {Error & { code?: string }} */
      const wrap = new Error('Reconnect required'); wrap.code = 'needs-reauth'; throw wrap;
    }
    throw e;
  });

  try {
    return await fetcher(conn.accessToken);
  } catch (e) {
    if (getErrorStatus(e) !== 401) throw e;
    const forced = { ...conn, expiresAt: 0 };
    const refreshed = await wft(forced, getOAuthClientId(adapter), async (updated) => {
      await saveConnectionWithCredentials(adapter.id, updated, profileId);
    }, () => latestHydratedConnection(adapter.id, forced, profileId));
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
  if (adapter.id === 'google_health') {
    const sourceFamily = getConnection('google_health')?.dataSourceFamily || 'all-sources';
    return callWithRefresh(adapter, (token) => fetchGoogleHealthDailyRange(token, startDate, endDate, { dataSourceFamily: sourceFamily }));
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
  if (!connectionHasCredentials(adapterId, conn)) throw new Error(`Not connected: ${adapterId}`);
  const profileId = getActiveProfileId();

  const startDate = daysAgoIso(daysBack);
  const endDate = isoDay();
  const rows = await fetchRange(adapter, startDate, endDate);
  if (isDebugMode?.()) console.log(`[wearables] ${adapterId} backfill ${startDate}..${endDate}: ${rows.length} rows`);
  const persisted = await persistFetchedRows(adapterId, profileId, rows, conn, startDate, endDate);
  return { rows: persisted ? rows.length : 0, startDate, endDate };
}

async function persistFetchedRows(adapterId, profileId, rows, conn, startDate, endDate) {
  const persist = async () => {
    const live = getConnection(adapterId);
    const isGoogleHealth = adapterId === 'google_health';
    if (isGoogleHealth && (getActiveProfileId() !== profileId || !connectionHasCredentials(adapterId, live, profileId))) return false;
    const expectedVersion = Number.isSafeInteger(conn?.credentialGeneration) ? conn.credentialGeneration : 0;
    const versionKey = wearableCredentialGenerationKey(adapterId);
    if (rows.length > 0) {
      const written = await upsertDailyBatch(profileId, rows, isGoogleHealth ? { versionKey, expectedVersion } : null);
      if (isGoogleHealth && !written) return false;
    }
    await commitAfterWriteIfAny(adapterId, rows, conn);
    const lastSync = { at: Date.now(), rows: rows.length, startDate, endDate };
    if (isGoogleHealth) {
      const result = await setMetaVersioned(profileId, `last-sync:${adapterId}`, lastSync, versionKey, expectedVersion);
      if (!result.saved) return false;
    } else {
      await setMeta(profileId, `last-sync:${adapterId}`, lastSync);
    }
    const current = getConnection(adapterId);
    if (getActiveProfileId() === profileId && connectionHasCredentials(adapterId, current)) saveConnection(adapterId, { ...current, lastSyncAt: Date.now(), needsReauth: false });
    return true;
  };
  return adapterId === 'google_health' ? withGoogleHealthLifecycleLock(persist) : persist();
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
  if (!connectionHasCredentials(adapterId, conn)) return { skipped: true, reason: 'not-connected' };
  const profileId = getActiveProfileId();

  const lastSync = await getMeta(profileId, `last-sync:${adapterId}`);
  const fallbackStart = daysAgoIso(7);
  // Always use AT LEAST a 7-day sync range. When `lastSync.endDate` is already
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
  const persisted = await persistFetchedRows(adapterId, profileId, rows, conn, startDate, endDate);
  return { rows: persisted ? rows.length : 0, startDate, endDate };
}

// ─────────────────────────────────────────────────────────
// Disconnect
// ─────────────────────────────────────────────────────────

export async function disconnectWearable(adapterId, options = {}) {
  return adapterId === 'google_health'
    ? withGoogleHealthLifecycleLock(() => withGoogleHealthRefreshLock(() => disconnectWearableLocked(adapterId, options)))
    : disconnectWearableLocked(adapterId, options);
}

async function disconnectWearableLocked(adapterId, { deleteData = true } = {}) {
  const profileId = getActiveProfileId();
  // Keep post-await mutations bound to the initiating profile; loadProfile()
  // replaces the global and could otherwise redirect the purge.
  const profileData = state.importedData;
  // A failed requested purge leaves the connection intact so the user can
  // retry instead of receiving false success with inaccessible rows present.
  if (deleteData && !usesCredentialVault(adapterId)) {
    await clearSource(profileId, adapterId);
  }
  if (usesCredentialVault(adapterId)) {
    // For Google Health, credential revocation, the generation fence, daily
    // row deletion, and cursor deletion share one IndexedDB transaction. A
    // stale cross-tab write cannot land between clearing data and revoking credentials.
    const recoveryJournal = adapterId === 'google_health' ? {
      metaWrites: {
        [pendingWearableDisconnectMetaKey(adapterId)]: {
          adapterId, deleteData, createdAt: Date.now(),
        },
      },
    } : {};
    const generation = await deleteWearableCredentials(
      profileId,
      adapterId,
      deleteData ? {
        source: adapterId,
        metaKeys: [`last-sync:${adapterId}`],
        ...recoveryJournal,
      } : recoveryJournal,
    );
    credentialCache.delete(credentialCacheKey(profileId, adapterId));
    clearLocalWearableCredential(profileId, adapterId, generation);
  }
  applyWearableDisconnectToProfile(profileData, adapterId, { deleteData });
  let remainingSources = null;
  if (deleteData) {
    // Drop the `last-sync:{adapterId}` meta entry too — otherwise a future
    // reconnect's incrementalSyncWearable picks up the stale endDate as
    // start, missing the freshly-cleared backfill range until the
    // recoverIfL1Empty scheduler eventually full-resyncs.
    if (!usesCredentialVault(adapterId)) {
      try { await deleteMeta(profileId, `last-sync:${adapterId}`); } catch { /* meta wipe failure is recoverable */ }
    }
    remainingSources = listConnectedSourcesFor(profileData, profileId);
  }

  // Persist to the captured profile before any best-effort summary rebuild.
  const persisted = await saveImportedDataForProfile(profileId, profileData);
  if (persisted === false) {
    throw new Error('Wearable disconnect could not be persisted for this profile.');
  }
  if (adapterId === 'google_health') await clearPendingWearableDisconnect(profileId, adapterId);

  if (deleteData && remainingSources && Object.keys(remainingSources).length > 0
    && getActiveProfileId() === profileId && state.importedData === profileData) {
    // A switched-away profile recomputes safely when it is next loaded.
    await syncWearableSummary(profileId, remainingSources, { force: true });
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
    if (getErrorCode(e) === 'needs-reauth') {
      showNotification?.(`${displayName} needs reconnection — open Settings → Wearables`, 'error', 5000);
    } else if (getErrorStatus(e) === 401 || getErrorStatus(e) === 403) {
      const conn = getConnection(adapterId);
      if (conn) saveConnection(adapterId, { ...conn, needsReauth: true });
      showNotification?.(`${displayName} token rejected — reconnect`, 'error');
    } else {
      if (isDebugMode?.()) console.warn(`[wearables] syncNow ${adapterId} failed:`, getErrorMessage(e));
      showNotification?.(`${displayName} sync failed: ${_scrubError(getErrorMessage(e))}`, 'error', 4000);
    }
    throw e;
  }
}

export async function recoverIfL1Empty(adapterId) {
  const conn = getConnection(adapterId);
  if (!connectionHasCredentials(adapterId, conn)) return { skipped: true };
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
let _staleSyncInFlight = null;

async function maybeSyncStaleSources() {
  // Wait for the runtime-config fetch (or its 1.5s timeout) so a self-hoster's
  // first scheduled refresh doesn't race the override and call the token
  // endpoint with a stale (hardcoded maintainer) clientId. Hosted users see
  // a no-op since the promise resolves immediately to {} overrides.
  await loadWearableRuntimeConfig();
  const sources = getConnections();
  const now = Date.now();
  for (const [sid, conn] of Object.entries(sources)) {
    if (!connectionHasCredentials(sid, conn)) continue;
    if (sid === 'google_health' && !isOAuthAdapterConfigured(sid)) continue;
    if (conn.needsReauth) continue;
    const last = conn.lastSyncAt || 0;
    if (now - last < STALE_MS) continue;
    try {
      await recoverIfL1Empty(sid);
      await syncNow(sid);
    } catch (e) { if (isDebugMode?.()) console.warn(`[wearables] scheduled sync ${sid} failed:`, getErrorMessage(e)); }
  }
}

export function syncStaleWearablesNow() {
  if (_staleSyncInFlight) return _staleSyncInFlight;
  _staleSyncInFlight = maybeSyncStaleSources()
    .finally(() => { _staleSyncInFlight = null; });
  return _staleSyncInFlight;
}

export function initWearableScheduler() {
  if (_schedulerInstalled) return;
  _schedulerInstalled = true;
  syncStaleWearablesNow();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncStaleWearablesNow();
  });
  _pollTimer = setInterval(syncStaleWearablesNow, POLL_INTERVAL_MS);
  addWearablesBeforeUnloadRuntime(() => { if (_pollTimer) clearInterval(_pollTimer); });
}

// ─────────────────────────────────────────────────────────
// Runtime config (self-host OAuth client_id overrides)
// ─────────────────────────────────────────────────────────
// The scheduler briefly waits for overrides; Settings can await the bounded
// fetch so slow responses enable rows and failed/hung attempts stay retryable.

const RUNTIME_CONFIG_TIMEOUT_MS = 1500, RUNTIME_CONFIG_FETCH_TIMEOUT_MS = 10000;
/** @type {Promise<void> | null} */ let _runtimeConfigFetchPromise = null;
/** @type {Promise<void> | null} */ let _runtimeConfigPromise = null;
/** @param {{ waitForFetch?: boolean }} [options] @returns {Promise<void>} */
export function loadWearableRuntimeConfig(options = {}) {
  if (!_runtimeConfigFetchPromise) {
    let loaded = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RUNTIME_CONFIG_FETCH_TIMEOUT_MS);
    _runtimeConfigFetchPromise = (async () => {
      try {
        const res = await fetch('/api/proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wearable_runtime_config: true }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data && data.overrides) applyOAuthOverrides(data.overrides);
        if (data && data.configured) applyOAuthConfigured(data.configured);
        loaded = true;
      } catch { /* offline / proxy missing — silently fall back to hardcoded */ }
    })().finally(() => {
      clearTimeout(timeoutId);
      if (!loaded) _runtimeConfigFetchPromise = _runtimeConfigPromise = null;
    });
    // The scheduler uses a soft timeout; Settings can await the full fetch.
    const timeoutPromise = /** @type {Promise<void>} */ (new Promise(
      resolve => setTimeout(resolve, RUNTIME_CONFIG_TIMEOUT_MS)));
    _runtimeConfigPromise = Promise.race([_runtimeConfigFetchPromise, timeoutPromise]);
  }
  return options.waitForFetch ? _runtimeConfigFetchPromise
    : /** @type {Promise<void>} */ (_runtimeConfigPromise);
}
