import {
  pickWearableRedirectUri,
  consumeOAuthCallbackState,
  isPendingOAuthCallback,
  beginWearableOAuth,
  buildWearableAuthorizeUrl,
} from './wearable-oauth-state.js';
import { normalizeOAuthTokenResponse, refreshWearableConnection, createWearableTokenRefresh } from './wearable-oauth-tokens.js';
import type {
  OAuthAuthorizeOptions, OAuthBeginOptions,
  OAuthTokenBody, OAuthConnection, OAuthCallbackResult,
  OAuthQuery, OAuthLocation,
} from './wearable-oauth-types.js';

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
import { getProxyApiUrl } from './proxy-runtime.js';
import {
  exposeWearableAuthDebug,
  getWearableAuthLocation,
  redirectWearableAuth,
} from './wearables-auth-runtime.js';

const AUTHORIZE_URL = 'https://cloud.ouraring.com/oauth/authorize';
const PROXY_URL = getProxyApiUrl();
const STATE_KEY = 'oura-oauth-pending';            // sessionStorage — CSRF state
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

// The redirect_uri must exactly match what's registered in the Oura developer
// portal. We pick the registered URI that matches the current origin + path.
export function pickRedirectUri(
  registeredUris: readonly string[], locationLike: OAuthLocation = getWearableAuthLocation(),
) {
  return pickWearableRedirectUri(registeredUris, locationLike, 'Oura');
}

// ─────────────────────────────────────────────────────────
// Authorize — kicks off the flow
// ─────────────────────────────────────────────────────────

export function buildAuthorizeUrl({ clientId, redirectUri, scopes = DEFAULT_OURA_SCOPES, state }: OAuthAuthorizeOptions) {
  return buildWearableAuthorizeUrl(AUTHORIZE_URL, { clientId, redirectUri, scopes, state });
}

export function beginOAuth({ clientId, registeredUris, scopes = DEFAULT_OURA_SCOPES, profileId = null }: OAuthBeginOptions) {
  beginWearableOAuth({ clientId, registeredUris, scopes, profileId }, STATE_KEY, pickRedirectUri, buildAuthorizeUrl, redirectWearableAuth);
}

// ─────────────────────────────────────────────────────────
// Callback — called by main.js when it detects ?code=... on load
// ─────────────────────────────────────────────────────────

// Returns { ok, tokens, redirectUri, error } — redirectUri is returned so the
// caller can clean the URL, caller decides what to do with tokens.
export async function completeOAuthCallback(urlParams: OAuthQuery): Promise<OAuthCallbackResult> {
  const state = consumeOAuthCallbackState(urlParams, STATE_KEY, 'Oura');
  if (state.ok === false) return state;
  const { code, pending } = state;

  // Oura's edge (CloudFront in front of cloud.ouraring.com) intermittently
  // 5xx's the /oauth/token endpoint. The auth code is single-use and short-
  // lived, so we retry quickly — 3 tries, exponential backoff — before
  // surfacing the failure to the user.
  let exchangeRes: Response | null = null, body: OAuthTokenBody | null | undefined;
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
  if (!exchangeRes) return { ok: false, error: 'Token exchange failed before receiving a response' };
  if (!exchangeRes.ok) {
    // Oura sometimes returns HTML (CloudFront error page) instead of JSON on 5xx;
    // body?.error is then undefined and we'd leak a wall of HTML into the toast.
    const detail = body?.error || body?.error_description;
    const hint = exchangeRes.status >= 500 ? ' — Oura is down, try again in a minute' : '';
    return { ok: false, error: detail ? detail : `Token exchange failed (${exchangeRes.status})${hint}` };
  }
  return {
    ok: true,
    tokens: normalizeTokenResponse(body!),
    redirectUri: pending.redirectUri,
    profileId: pending.profileId,
  };
}

// Is the current page load a pending Oura OAuth callback?
export function isOuraCallback(urlParams: OAuthQuery) {
  return isPendingOAuthCallback(urlParams, STATE_KEY);
}

// ─────────────────────────────────────────────────────────
// Refresh
// ─────────────────────────────────────────────────────────

export const refreshTokens = createWearableTokenRefresh(
  PROXY_URL, 'oura_token_refresh', normalizeTokenResponse,
);

function normalizeTokenResponse(body: OAuthTokenBody) {
  return normalizeOAuthTokenResponse(body, { expiresIn: 86400, tokenType: 'bearer' });
}

// ─────────────────────────────────────────────────────────
// Token middleware — used by the fetcher before each Oura API call
// ─────────────────────────────────────────────────────────

// Serialised per-tab so two concurrent API calls don't both try to refresh
// the same (single-use) refresh token. Across tabs we rely on the connection
// record being updated in importedData and picked up on next read.
export async function withFreshToken(
  connection: OAuthConnection, clientId: string | null,
  refreshedWrite: (updated: OAuthConnection) => Promise<unknown> | unknown,
  readLatest?: (() => OAuthConnection | null | undefined),
) {
  return refreshWearableConnection(connection, clientId, refreshedWrite, readLatest, {
    lockKey: REFRESH_LOCK_KEY, refreshTokens,
  });
}

exposeWearableAuthDebug('_ouraAuth', { buildAuthorizeUrl, completeOAuthCallback, isOuraCallback, refreshTokens, withFreshToken }, Boolean(isDebugMode?.()));
