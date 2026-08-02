// @ts-check
// wearables-whoop-auth.js — WHOOP OAuth2 confidential-client flow
//
// WHOOP requires the application's client secret for authorization-code token
// exchange and refresh. The browser handles consent state; /api/proxy injects
// the deployment's WHOOP_CLIENT_SECRET so it never reaches browser storage.

import { isDebugMode } from './utils.js';
import {
  exposeWearableAuthDebug,
  getWearableAuthLocation,
  redirectWearableAuth,
} from './wearables-auth-runtime.js';

const AUTHORIZE_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const PROXY_URL     = '/api/proxy';
const STATE_KEY     = 'whoop-oauth-pending';       // sessionStorage
const REFRESH_LEAD_MS = 5 * 60 * 1000;
const REFRESH_LOCK_KEY = 'whoop-oauth-refresh';

export const DEFAULT_WHOOP_SCOPES = [
  'read:recovery', 'read:sleep', 'read:workout', 'read:cycles', 'read:profile', 'offline',
];

// ─────────────────────────────────────────────────────────
// OAuth state helper
// ─────────────────────────────────────────────────────────

function randomState(nBytes = 16) {
  const bytes = new Uint8Array(nBytes);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// ─────────────────────────────────────────────────────────
// Authorize
// ─────────────────────────────────────────────────────────

export function pickRedirectUri(registeredUris, locationLike = getWearableAuthLocation()) {
  const origin = locationLike?.origin;
  if (!origin) throw new Error('No registered WHOOP redirect URI matches current origin unknown');
  const hrefBase = origin + locationLike.pathname;
  const exact = registeredUris.find(u => u === hrefBase || u === hrefBase + '/');
  if (exact) return exact;
  const byOrigin = registeredUris.find(u => u.startsWith(origin));
  if (byOrigin) return byOrigin;
  throw new Error(`No registered WHOOP redirect URI matches current origin ${origin}`);
}

export function buildAuthorizeUrl({ clientId, redirectUri, scopes = DEFAULT_WHOOP_SCOPES, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function beginOAuth({ clientId, registeredUris, scopes = DEFAULT_WHOOP_SCOPES, profileId = null }) {
  const state = randomState();
  const redirectUri = pickRedirectUri(registeredUris);
  sessionStorage.setItem(STATE_KEY, JSON.stringify({
    state, redirectUri, startedAt: Date.now(), clientId,
    profileId, // pin profile so a mid-OAuth switch lands in the initiating profile
  }));
  const url = buildAuthorizeUrl({ clientId, redirectUri, scopes, state });
  redirectWearableAuth(url);
}

// ─────────────────────────────────────────────────────────
// Callback
// ─────────────────────────────────────────────────────────

export async function completeOAuthCallback(urlParams) {
  const code = urlParams.get('code');
  const returnedState = urlParams.get('state');
  const errorParam = urlParams.get('error');
  if (errorParam) return { ok: false, error: errorParam + (urlParams.get('error_description') ? `: ${urlParams.get('error_description')}` : '') };
  if (!code || !returnedState) return { ok: false, error: 'Missing code or state in callback' };

  const pendingRaw = sessionStorage.getItem(STATE_KEY);
  if (!pendingRaw) return { ok: false, error: 'No pending WHOOP OAuth state (link may have been opened in a different tab)' };
  sessionStorage.removeItem(STATE_KEY);
  let pending;
  try { pending = JSON.parse(pendingRaw); } catch { return { ok: false, error: 'Corrupt pending state' }; }
  if (pending.state !== returnedState) return { ok: false, error: 'State mismatch — possible CSRF, aborting' };
  // Reject stale pending states. 10 minutes covers a slow second-factor on
  // the provider's auth page; longer than that and the user almost certainly
  // closed and reopened.
  if (typeof pending.startedAt === 'number' && Date.now() - pending.startedAt > 10 * 60 * 1000) {
    return { ok: false, error: 'OAuth flow expired — please try connecting again' };
  }

  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      whoop_token_exchange: {
        code,
        redirect_uri: pending.redirectUri,
        client_id: pending.clientId,
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body?.error_description || body?.error || `Token exchange failed (${res.status})` };
  return { ok: true, tokens: normalizeTokenResponse(body), redirectUri: pending.redirectUri, profileId: pending.profileId };
}

export function isWhoopCallback(urlParams) {
  if (!urlParams.get('state')) return false;
  const pendingRaw = sessionStorage.getItem(STATE_KEY);
  if (!pendingRaw) return false;
  try { return JSON.parse(pendingRaw).state === urlParams.get('state'); }
  catch { return false; }
}

// ─────────────────────────────────────────────────────────
// Refresh
// ─────────────────────────────────────────────────────────

export async function refreshTokens({ clientId, refreshToken }) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      whoop_token_refresh: { refresh_token: refreshToken, client_id: clientId },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    /** @type {Error & { status?: number }} */
    const err = new Error(body?.error_description || body?.error || `Refresh failed (${res.status})`);
    err.status = res.status; throw err;
  }
  return normalizeTokenResponse(body);
}

function normalizeTokenResponse(body) {
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + (expiresIn * 1000),
    scope: body.scope || '',
    tokenType: body.token_type || 'bearer',
  };
}

// ─────────────────────────────────────────────────────────
// Refresh middleware — same contract as Oura's withFreshToken
// ─────────────────────────────────────────────────────────

export async function withFreshToken(connection, clientId, refreshedWrite, readLatest) {
  const needsRefresh = !connection.accessToken || !connection.expiresAt || (connection.expiresAt - Date.now()) < REFRESH_LEAD_MS;
  if (!needsRefresh) return connection;

  const run = async () => {
    const latest = (readLatest?.() ?? connection);
    if (latest.expiresAt && (latest.expiresAt - Date.now()) >= REFRESH_LEAD_MS) return latest;
    if (!latest.refreshToken) {
      /** @type {Error & { code?: string }} */
      const e = new Error('No refresh token stored — user must reconnect');
      e.code = 'needs-reauth'; throw e;
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

  if (navigator.locks && typeof navigator.locks.request === 'function') {
    return navigator.locks.request(REFRESH_LOCK_KEY, { mode: 'exclusive' }, run);
  }
  return run();
}

exposeWearableAuthDebug('_whoopAuth', { buildAuthorizeUrl, completeOAuthCallback, isWhoopCallback, refreshTokens, withFreshToken }, Boolean(isDebugMode?.()));
