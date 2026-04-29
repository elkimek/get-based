// wearables-withings-auth.js — Withings OAuth2 server-side flow
//
// Withings's OAuth2 is LIKE Oura's but with two non-standard twists:
//   1. The token endpoint is `https://wbsapi.withings.net/v2/oauth2`
//      (not /oauth/token), and every POST carries `action=requesttoken`
//      (or `action=requesttoken2` for refresh) in the form body.
//   2. Responses wrap the real payload in `{ status: 0, body: {…} }` —
//      status 0 means success; any other integer is an error code.
//
// Everything else matches the Oura server-side pattern: client_secret
// stays server-side (Vercel env var WITHINGS_CLIENT_SECRET, read only by
// /api/proxy). PKCE is NOT supported by Withings.

import { isDebugMode } from './utils.js';

const AUTHORIZE_URL = 'https://account.withings.com/oauth2_user/authorize2';
const PROXY_URL     = '/api/proxy';
const STATE_KEY     = 'withings-oauth-pending';
const REFRESH_LEAD_MS  = 5 * 60 * 1000;
const REFRESH_LOCK_KEY = 'withings-oauth-refresh';

export const DEFAULT_WITHINGS_SCOPES = ['user.info', 'user.metrics', 'user.activity', 'user.sleepevents'];

function randomState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function pickRedirectUri(registeredUris, windowLocation = window.location) {
  const origin = windowLocation.origin;
  const hrefBase = origin + windowLocation.pathname;
  const exact = registeredUris.find(u => u === hrefBase || u === hrefBase + '/');
  if (exact) return exact;
  const byOrigin = registeredUris.find(u => u.startsWith(origin));
  if (byOrigin) return byOrigin;
  throw new Error(`No registered Withings redirect URI matches current origin ${origin}`);
}

export function buildAuthorizeUrl({ clientId, redirectUri, scopes = DEFAULT_WITHINGS_SCOPES, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(','),      // Withings delimits scopes by comma, not space
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export function beginOAuth({ clientId, registeredUris, scopes = DEFAULT_WITHINGS_SCOPES }) {
  const state = randomState();
  const redirectUri = pickRedirectUri(registeredUris);
  sessionStorage.setItem(STATE_KEY, JSON.stringify({
    state, redirectUri, startedAt: Date.now(), clientId,
    profileId: window._labState?.currentProfile || null,
  }));
  const url = buildAuthorizeUrl({ clientId, redirectUri, scopes, state });
  window.location.href = url;
}

export async function completeOAuthCallback(urlParams) {
  const code = urlParams.get('code');
  const returnedState = urlParams.get('state');
  const errorParam = urlParams.get('error');
  if (errorParam) return { ok: false, error: errorParam + (urlParams.get('error_description') ? `: ${urlParams.get('error_description')}` : '') };
  if (!code || !returnedState) return { ok: false, error: 'Missing code or state in callback' };

  const pendingRaw = sessionStorage.getItem(STATE_KEY);
  if (!pendingRaw) return { ok: false, error: 'No pending Withings OAuth state (link may have been opened in a different tab)' };
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
      withings_token_exchange: {
        code,
        redirect_uri: pending.redirectUri,
        client_id: pending.clientId,
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body?.error || body?.error_description || `Token exchange failed (${res.status})` };
  // Withings wraps successful responses in `{status: 0, body: {...}}` —
  // the proxy unwraps so we receive the plain token object.
  if (body?.status !== undefined && body.status !== 0) {
    return { ok: false, error: `Withings error ${body.status}: ${body.error || 'unknown'}` };
  }
  return {
    ok: true,
    tokens: normalizeTokenResponse(body.body || body),
    redirectUri: pending.redirectUri,
    profileId: pending.profileId,
  };
}

export function isWithingsCallback(urlParams) {
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
      withings_token_refresh: { refresh_token: refreshToken, client_id: clientId },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error || body?.error_description || `Refresh failed (${res.status})`);
    err.status = res.status; throw err;
  }
  if (body?.status !== undefined && body.status !== 0) {
    const { withingsErrorMessage } = await import('./wearables-withings.js');
    const mapped = withingsErrorMessage(body.status);
    const err = new Error(mapped
      ? `Withings ${body.status}: ${mapped}`
      : `Withings refresh error ${body.status}: ${body.error || 'unknown'}`);
    const authDead = new Set([100, 101, 102, 243, 245, 283, 284]);
    err.status = authDead.has(Number(body.status)) ? 401 : 400;
    err.withingsCode = body.status;
    throw err;
  }
  return normalizeTokenResponse(body.body || body);
}

function normalizeTokenResponse(body) {
  // Withings fields: access_token, refresh_token, userid, scope, expires_in,
  // token_type.  expires_in defaults to 10800 (3 hours) — refresh early.
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 10800;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + (expiresIn * 1000),
    scope: body.scope || '',
    tokenType: body.token_type || 'Bearer',
    userId: body.userid || null,
  };
}

export async function withFreshToken(connection, clientId, refreshedWrite, readLatest) {
  const needsRefresh = !connection.accessToken || !connection.expiresAt || (connection.expiresAt - Date.now()) < REFRESH_LEAD_MS;
  if (!needsRefresh) return connection;

  const run = async () => {
    const latest = (readLatest?.() ?? connection);
    if (latest.expiresAt && (latest.expiresAt - Date.now()) >= REFRESH_LEAD_MS) return latest;
    if (!latest.refreshToken) {
      const e = new Error('No refresh token stored — user must reconnect');
      e.code = 'needs-reauth'; throw e;
    }
    const fresh = await refreshTokens({ clientId, refreshToken: latest.refreshToken });
    const updated = {
      ...latest,
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken || latest.refreshToken, // Withings rotates, prefer fresh
      expiresAt: fresh.expiresAt,
      scope: fresh.scope || latest.scope,
      userId: fresh.userId || latest.userId,
    };
    await refreshedWrite(updated);
    return updated;
  };

  if (navigator.locks && typeof navigator.locks.request === 'function') {
    return navigator.locks.request(REFRESH_LOCK_KEY, { mode: 'exclusive' }, run);
  }
  return run();
}

if (isDebugMode?.()) window._withingsAuth = { buildAuthorizeUrl, completeOAuthCallback, isWithingsCallback, refreshTokens, withFreshToken };
