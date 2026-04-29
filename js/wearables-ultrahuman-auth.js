// wearables-ultrahuman-auth.js — Ultrahuman OAuth2 server-side flow
//
// Ultrahuman exposes a proper OAuth2 partner API (newer than the legacy
// static-token /api/v1/partner/* endpoints). This module targets the OAuth2
// variant — per-user consent, refresh tokens, no shared partner secret in
// the browser.
//
// Confirmed from vision.ultrahuman.com/developer-docs:
//   Authorize: https://auth.ultrahuman.com/authorise
//   Token:     https://partner.ultrahuman.com/api/partners/oauth/token
//   Scopes:    profile ring_data cgm_data   (space-separated)
//   TTLs:      access_token 3600s, refresh_token 86399s
//
// Token exchange goes through /api/proxy so ULTRAHUMAN_CLIENT_SECRET never
// reaches the browser. Same server-side-flow pattern as Oura + Withings.

import { isDebugMode } from './utils.js';

const AUTHORIZE_URL = 'https://auth.ultrahuman.com/authorise';
const PROXY_URL     = '/api/proxy';
const STATE_KEY     = 'ultrahuman-oauth-pending';
const REFRESH_LEAD_MS  = 5 * 60 * 1000;
const REFRESH_LOCK_KEY = 'ultrahuman-oauth-refresh';

export const DEFAULT_ULTRAHUMAN_SCOPES = ['profile', 'ring_data', 'cgm_data'];

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
  throw new Error(`No registered Ultrahuman redirect URI matches current origin ${origin}`);
}

export function buildAuthorizeUrl({ clientId, redirectUri, scopes = DEFAULT_ULTRAHUMAN_SCOPES, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),   // space-delimited, per Ultrahuman docs bundle
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export function beginOAuth({ clientId, registeredUris, scopes = DEFAULT_ULTRAHUMAN_SCOPES }) {
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
  if (!pendingRaw) return { ok: false, error: 'No pending Ultrahuman OAuth state (link may have been opened in a different tab)' };
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
      ultrahuman_token_exchange: {
        code,
        redirect_uri: pending.redirectUri,
        client_id: pending.clientId,
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body?.error_description || body?.error || `Token exchange failed (${res.status})` };
  return {
    ok: true,
    tokens: normalizeTokenResponse(body),
    redirectUri: pending.redirectUri,
    profileId: pending.profileId,
  };
}

export function isUltrahumanCallback(urlParams) {
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
      ultrahuman_token_refresh: { refresh_token: refreshToken, client_id: clientId },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error_description || body?.error || `Refresh failed (${res.status})`);
    err.status = res.status; throw err;
  }
  return normalizeTokenResponse(body);
}

function normalizeTokenResponse(body) {
  // Confirmed from docs bundle: expires_in is 3600s for access, ~86399s for refresh.
  // Refresh tokens DO rotate — prefer the new refresh_token when present.
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 3600;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + (expiresIn * 1000),
    scope: body.scope || '',
    tokenType: body.token_type || 'Bearer',
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

if (isDebugMode?.()) window._ultrahumanAuth = { buildAuthorizeUrl, completeOAuthCallback, isUltrahumanCallback, refreshTokens, withFreshToken };
