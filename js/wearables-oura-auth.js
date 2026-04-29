// wearables-oura-auth.js — Oura OAuth2 server-side flow (browser side)
//
// Flow: authorize redirect → code in URL on return → /api/proxy exchanges the
// code for { access_token, refresh_token, expires_in } using OURA_CLIENT_SECRET
// held server-side. Refresh goes through the same proxy path.
//
// Why not PKCE: Oura's developer portal doesn't offer PKCE. "Client-side Flow"
// in their UI is the deprecated implicit flow (no refresh tokens, 24h re-auth).
// Server-side flow keeps the UX working indefinitely; the client_secret stays
// out of the browser via the proxy.

import { isDebugMode } from './utils.js';

const AUTHORIZE_URL = 'https://cloud.ouraring.com/oauth/authorize';
const PROXY_URL = '/api/proxy';
const STATE_KEY = 'oura-oauth-pending';            // sessionStorage — CSRF state
const REFRESH_LEAD_MS = 5 * 60 * 1000;             // refresh 5 min before expiry
const REFRESH_LOCK_KEY = 'oura-oauth-refresh';     // navigator.locks name

// Default scope set — matches the minimum we need for the v1 dashboard strip.
// Caller can override for extra cards (e.g. adding 'spo2' for the SpO2 card).
// Scope map (confirmed via Oura 401 responses, not their docs — docs say
// `spo2Daily` but the gate rejects that string):
//   personal     → personal_info
//   daily        → daily_sleep / daily_readiness / daily_activity
//   heartrate    → heartrate stream
//   session      → sessions
//   spo2         → daily_spo2
//   stress       → daily_stress, daily_resilience
//   heart_health → daily_cardiovascular_age
export const DEFAULT_OURA_SCOPES = ['personal', 'daily', 'heartrate', 'session', 'spo2', 'stress', 'heart_health'];

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function randomState() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// The redirect_uri must exactly match what's registered in the Oura developer
// portal. We pick the registered URI that matches the current origin + path.
export function pickRedirectUri(registeredUris, windowLocation = window.location) {
  const origin = windowLocation.origin;
  // Prefer exact match on origin + pathname; fall back to origin match alone.
  const hrefBase = origin + windowLocation.pathname;
  const exact = registeredUris.find(u => u === hrefBase || u === hrefBase + '/');
  if (exact) return exact;
  const byOrigin = registeredUris.find(u => u.startsWith(origin));
  if (byOrigin) return byOrigin;
  throw new Error(`No registered Oura redirect URI matches current origin ${origin}`);
}

// ─────────────────────────────────────────────────────────
// Authorize — kicks off the flow
// ─────────────────────────────────────────────────────────

export function buildAuthorizeUrl({ clientId, redirectUri, scopes = DEFAULT_OURA_SCOPES, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',           // server-side flow — code exchanged for tokens via proxy
    scope: scopes.join(' '),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export function beginOAuth({ clientId, registeredUris, scopes = DEFAULT_OURA_SCOPES }) {
  const state = randomState();
  const redirectUri = pickRedirectUri(registeredUris);
  sessionStorage.setItem(STATE_KEY, JSON.stringify({
    state, redirectUri, startedAt: Date.now(), clientId,
    profileId: window._labState?.currentProfile || null,
  }));
  const url = buildAuthorizeUrl({ clientId, redirectUri, scopes, state });
  window.location.href = url;
}

// ─────────────────────────────────────────────────────────
// Callback — called by main.js when it detects ?code=... on load
// ─────────────────────────────────────────────────────────

// Returns { ok, tokens, redirectUri, error } — redirectUri is returned so the
// caller can clean the URL, caller decides what to do with tokens.
export async function completeOAuthCallback(urlParams) {
  const code = urlParams.get('code');
  const returnedState = urlParams.get('state');
  const errorParam = urlParams.get('error');
  if (errorParam) return { ok: false, error: errorParam + (urlParams.get('error_description') ? `: ${urlParams.get('error_description')}` : '') };
  if (!code || !returnedState) return { ok: false, error: 'Missing code or state in callback' };

  const pendingRaw = sessionStorage.getItem(STATE_KEY);
  if (!pendingRaw) return { ok: false, error: 'No pending Oura OAuth state (link may have been opened in a different tab)' };
  // Consume state NOW — before any logic that can branch. Prevents a failed
  // CSRF attempt from being retried against the same stored state.
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

  // Oura's edge (CloudFront in front of cloud.ouraring.com) intermittently
  // 5xx's the /oauth/token endpoint. The auth code is single-use and short-
  // lived, so we retry quickly — 3 tries, exponential backoff — before
  // surfacing the failure to the user.
  let exchangeRes, body;
  for (let attempt = 0; attempt < 3; attempt++) {
    exchangeRes = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oura_token_exchange: {
          code,
          redirect_uri: pending.redirectUri,
          client_id: pending.clientId,
        },
      }),
    });
    body = await exchangeRes.clone().json().catch(() => ({}));
    if (exchangeRes.ok) break;
    // Only retry transient server-side failures; 400/401 means our request is bad.
    if (exchangeRes.status < 500 || attempt === 2) break;
    await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
  }
  if (!exchangeRes.ok) {
    // Oura sometimes returns HTML (CloudFront error page) instead of JSON on 5xx;
    // body?.error is then undefined and we'd leak a wall of HTML into the toast.
    const detail = body?.error || body?.error_description;
    const hint = exchangeRes.status >= 500 ? ' — Oura is down, try again in a minute' : '';
    return { ok: false, error: detail ? detail : `Token exchange failed (${exchangeRes.status})${hint}` };
  }
  return {
    ok: true,
    tokens: normalizeTokenResponse(body),
    redirectUri: pending.redirectUri,
    profileId: pending.profileId,
  };
}

// Is the current page load a pending Oura OAuth callback?
export function isOuraCallback(urlParams) {
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
      oura_token_refresh: { refresh_token: refreshToken, client_id: clientId },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error || body?.error_description || `Refresh failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return normalizeTokenResponse(body);
}

function normalizeTokenResponse(body) {
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : 86400;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + (expiresIn * 1000),
    scope: body.scope || '',
    tokenType: body.token_type || 'bearer',
  };
}

// ─────────────────────────────────────────────────────────
// Token middleware — used by the fetcher before each Oura API call
// ─────────────────────────────────────────────────────────

// Serialised per-tab so two concurrent API calls don't both try to refresh
// the same (single-use) refresh token. Across tabs we rely on the connection
// record being updated in importedData and picked up on next read.
export async function withFreshToken(connection, clientId, refreshedWrite, readLatest) {
  const needsRefresh = !connection.accessToken || !connection.expiresAt || (connection.expiresAt - Date.now()) < REFRESH_LEAD_MS;
  if (!needsRefresh) return connection;

  // Cross-tab lock where available; otherwise just proceed (worst case: both
  // tabs refresh, Oura rotates the refresh token and the older tab 401s on
  // next call and recovers by reading the newly-stored connection).
  const run = async () => {
    // Re-read latest connection inside the lock — cross-tab race guard. If
    // another tab already refreshed while we waited for the lock, use ITS
    // rotated refresh_token; ours (captured pre-lock) is now invalidated.
    const latest = (readLatest?.() ?? connection);
    if (latest.expiresAt && (latest.expiresAt - Date.now()) >= REFRESH_LEAD_MS) return latest;
    if (!latest.refreshToken) {
      const e = new Error('No refresh token stored — user must reconnect');
      e.code = 'needs-reauth';
      throw e;
    }
    const fresh = await refreshTokens({ clientId, refreshToken: latest.refreshToken });
    // Oura rotates refresh tokens on refresh — persist both.
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

if (isDebugMode?.()) window._ouraAuth = { buildAuthorizeUrl, completeOAuthCallback, isOuraCallback, refreshTokens, withFreshToken };
