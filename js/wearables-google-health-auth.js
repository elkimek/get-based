// @ts-check
// wearables-google-health-auth.js — Google OAuth 2.0 web-server flow
//
// The OAuth client secret is held by /api/proxy and never shipped to the
// browser. The browser keeps only short-lived callback state in sessionStorage;
// successful credentials are moved into wearables-credential-vault.js by the
// connection orchestrator.

import { isDebugMode } from './utils.js';
import {
  exposeWearableAuthDebug,
  getWearableAuthLocation,
  redirectWearableAuth,
} from './wearables-auth-runtime.js';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const PROXY_URL = '/api/proxy';
const STATE_KEY = 'google_health-oauth-pending';
const REFRESH_LEAD_MS = 5 * 60 * 1000;
const REFRESH_LOCK_KEY = 'google-health-oauth-refresh';
let refreshLockTail = Promise.resolve();

/**
 * Serialize Google Health credential mutations in this module and, where the
 * Web Locks API is available, across tabs. Disconnect uses the same lock as
 * refresh so it cannot finish while a refresh callback is still able to
 * persist replacement credentials.
 *
 * @template T
 * @param {() => Promise<T> | T} callback
 * @returns {Promise<T>}
 */
export function withGoogleHealthRefreshLock(callback) {
  const runInModuleQueue = () => {
    const result = refreshLockTail.then(callback, callback);
    refreshLockTail = result.then(() => undefined, () => undefined);
    return result;
  };
  const locks = globalThis.navigator?.locks;
  if (locks && typeof locks.request === 'function') {
    return locks.request(REFRESH_LOCK_KEY, { mode: 'exclusive' }, runInModuleQueue);
  }
  return runInModuleQueue();
}

export const DEFAULT_GOOGLE_HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
];

export function googleHealthDisconnectedError() {
  /** @type {Error & { code?: string }} */
  const error = new Error('Connection was removed while credentials were being refreshed.');
  error.code = 'disconnected';
  return error;
}

function randomState() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function pickRedirectUri(registeredUris, locationLike = getWearableAuthLocation()) {
  const origin = locationLike?.origin;
  if (!origin) throw new Error('No registered Google Health redirect URI matches current origin unknown');
  const hrefBase = origin + locationLike.pathname;
  const exact = registeredUris.find(uri => uri === hrefBase || uri === `${hrefBase}/`);
  if (exact) return exact;
  const byOrigin = registeredUris.find(uri => uri.startsWith(origin));
  if (byOrigin) return byOrigin;
  throw new Error(`No registered Google Health redirect URI matches current origin ${origin}`);
}

export function buildAuthorizeUrl({ clientId, redirectUri, scopes = DEFAULT_GOOGLE_HEALTH_SCOPES, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export function beginOAuth({ clientId, registeredUris, scopes = DEFAULT_GOOGLE_HEALTH_SCOPES, profileId = null }) {
  const state = randomState();
  const redirectUri = pickRedirectUri(registeredUris);
  sessionStorage.setItem(STATE_KEY, JSON.stringify({
    state,
    redirectUri,
    startedAt: Date.now(),
    clientId,
    profileId,
  }));
  redirectWearableAuth(buildAuthorizeUrl({ clientId, redirectUri, scopes, state }));
}

export async function completeOAuthCallback(urlParams) {
  const code = urlParams.get('code');
  const returnedState = urlParams.get('state');
  const errorParam = urlParams.get('error');
  if (errorParam) {
    const description = urlParams.get('error_description');
    return { ok: false, error: errorParam + (description ? `: ${description}` : '') };
  }
  if (!code || !returnedState) return { ok: false, error: 'Missing code or state in callback' };

  const pendingRaw = sessionStorage.getItem(STATE_KEY);
  if (!pendingRaw) return { ok: false, error: 'No pending Google Health OAuth state (link may have been opened in a different tab)' };
  sessionStorage.removeItem(STATE_KEY);
  let pending;
  try { pending = JSON.parse(pendingRaw); }
  catch { return { ok: false, error: 'Corrupt pending state' }; }
  if (pending.state !== returnedState) return { ok: false, error: 'State mismatch — possible CSRF, aborting' };
  if (typeof pending.startedAt === 'number' && Date.now() - pending.startedAt > 10 * 60 * 1000) {
    return { ok: false, error: 'OAuth flow expired — please try connecting again' };
  }

  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      google_health_token_exchange: {
        code,
        redirect_uri: pending.redirectUri,
        client_id: pending.clientId,
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: body?.error_description || body?.error || `Token exchange failed (${res.status})` };
  }
  return {
    ok: true,
    tokens: normalizeTokenResponse(body),
    redirectUri: pending.redirectUri,
    profileId: pending.profileId,
  };
}

export function isGoogleHealthCallback(urlParams) {
  if (!urlParams.get('state')) return false;
  const pendingRaw = sessionStorage.getItem(STATE_KEY);
  if (!pendingRaw) return false;
  try { return JSON.parse(pendingRaw).state === urlParams.get('state'); }
  catch { return false; }
}

export async function refreshTokens({ clientId, refreshToken }) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      google_health_token_refresh: {
        refresh_token: refreshToken,
        client_id: clientId,
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    /** @type {Error & { status?: number }} */
    const error = new Error(body?.error_description || body?.error || `Refresh failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return normalizeTokenResponse(body);
}

function normalizeTokenResponse(body) {
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || null,
    expiresAt: Date.now() + (expiresIn * 1000),
    scope: body.scope || '',
    tokenType: body.token_type || 'Bearer',
  };
}

export async function withFreshToken(connection, clientId, refreshedWrite, readLatest) {
  const needsRefresh = !connection.accessToken
    || !connection.expiresAt
    || (connection.expiresAt - Date.now()) < REFRESH_LEAD_MS;
  if (!needsRefresh) return connection;

  const run = async () => {
    const latest = readLatest?.() ?? connection;
    if (latest.expiresAt && (latest.expiresAt - Date.now()) >= REFRESH_LEAD_MS && latest.accessToken) return latest;
    if (!latest.refreshToken) {
      /** @type {Error & { code?: string }} */
      const error = new Error('No refresh token stored — user must reconnect');
      error.code = 'needs-reauth';
      throw error;
    }
    const fresh = await refreshTokens({ clientId, refreshToken: latest.refreshToken });
    const updated = {
      ...latest,
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken || latest.refreshToken,
      expiresAt: fresh.expiresAt,
      scope: fresh.scope || latest.scope,
    };
    await refreshedWrite(updated);
    return updated;
  };

  return withGoogleHealthRefreshLock(run);
}

exposeWearableAuthDebug('_googleHealthAuth', {
  buildAuthorizeUrl,
  completeOAuthCallback,
  isGoogleHealthCallback,
  refreshTokens,
  withGoogleHealthRefreshLock,
  withFreshToken,
}, Boolean(isDebugMode?.()));
