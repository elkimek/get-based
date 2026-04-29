// wearables-polar-auth.js — Polar AccessLink OAuth2 server-side flow
//
// Polar AccessLink is a confidential OAuth2 client (requires client_secret at
// token exchange). No PKCE option offered. Flow slots into the same
// Vercel-proxy pattern as Oura / Withings / Ultrahuman — POLAR_CLIENT_SECRET
// is read only by /api/proxy's handlePolarTokenRequest.
//
// Polar-specific quirks documented inline:
//   1. Authorize page is flow.polar.com, token endpoint is polarremote.com,
//      data reads are www.polaraccesslink.com. All three must be allowlisted.
//   2. After the first token issue, we MUST call POST /v3/users with a
//      `member-id` JSON body to register the user before any data read will
//      work. That call returns 409 Conflict if repeated; idempotent on retry
//      from the app's perspective (we store a `registered: true` flag in the
//      connection blob). wearables-polar.js handles that call, not this file.

import { isDebugMode } from './utils.js';

const AUTHORIZE_URL    = 'https://flow.polar.com/oauth2/authorization';
const PROXY_URL        = '/api/proxy';
const STATE_KEY        = 'polar-oauth-pending';
const REFRESH_LEAD_MS  = 5 * 60 * 1000;
const REFRESH_LOCK_KEY = 'polar-oauth-refresh';

export const DEFAULT_POLAR_SCOPES = ['accesslink.read_all'];

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
  throw new Error(`No registered Polar redirect URI matches current origin ${origin}`);
}

export function buildAuthorizeUrl({ clientId, redirectUri, scopes = DEFAULT_POLAR_SCOPES, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export function beginOAuth({ clientId, registeredUris, scopes = DEFAULT_POLAR_SCOPES }) {
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
  if (!pendingRaw) return { ok: false, error: 'No pending Polar OAuth state (link may have been opened in a different tab)' };
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
      polar_token_exchange: {
        code,
        redirect_uri: pending.redirectUri,
        client_id: pending.clientId,
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body?.error || body?.error_description || `Token exchange failed (${res.status})` };
  return {
    ok: true,
    tokens: normalizeTokenResponse(body),
    redirectUri: pending.redirectUri,
    profileId: pending.profileId,
  };
}

export function isPolarCallback(urlParams) {
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
      polar_token_refresh: { refresh_token: refreshToken, client_id: clientId },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error || body?.error_description || `Refresh failed (${res.status})`);
    err.status = res.status; throw err;
  }
  return normalizeTokenResponse(body);
}

function normalizeTokenResponse(body) {
  // Polar fields: access_token, token_type, expires_in, x_user_id, refresh_token (only if "offline" was requested).
  // expires_in is typically 20 years (Polar uses long-lived tokens and relies on re-auth on revoke). We still refresh
  // defensively if refresh_token is present; otherwise we just let the long-lived token stand.
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : (20 * 365 * 86400);
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || null,
    expiresAt: Date.now() + (expiresIn * 1000),
    scope: body.scope || '',
    tokenType: body.token_type || 'Bearer',
    // Polar returns x_user_id on grant. We need this for every subsequent
    // /v3/users/{uid}/... call, so pin it on the connection blob.
    userId: body.x_user_id != null ? String(body.x_user_id) : null,
  };
}

export async function withFreshToken(connection, clientId, refreshedWrite, readLatest) {
  // Polar issues long-lived tokens; only attempt a refresh if we actually
  // have a refresh_token AND we're near expiry. Most accounts won't ever
  // enter the refresh branch.
  if (!connection.refreshToken) return connection;
  const needsRefresh = !connection.accessToken || !connection.expiresAt || (connection.expiresAt - Date.now()) < REFRESH_LEAD_MS;
  if (!needsRefresh) return connection;

  const run = async () => {
    const latest = (readLatest?.() ?? connection);
    if (latest.expiresAt && (latest.expiresAt - Date.now()) >= REFRESH_LEAD_MS) return latest;
    if (!latest.refreshToken) return latest; // nothing we can do — let the call 401
    const fresh = await refreshTokens({ clientId, refreshToken: latest.refreshToken });
    const updated = {
      ...latest,
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken || latest.refreshToken,
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

// Exposed for test pinning — mirrors the sha256-based PKCE export in the
// whoop/fitbit modules. Polar itself doesn't use PKCE, but the consistent
// export surface makes the drift test simpler.
export const deriveCodeChallenge = null;

if (isDebugMode?.()) window._polarAuth = { buildAuthorizeUrl, completeOAuthCallback, isPolarCallback, refreshTokens, withFreshToken };
