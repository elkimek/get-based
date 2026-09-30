import {
  pickWearableRedirectUri,
  consumeOAuthCallbackState,
  isPendingOAuthCallback,
} from './wearable-oauth-state.js';
import { normalizeOAuthTokenResponse, refreshWearableConnection } from './wearable-oauth-tokens.js';
import type {
  OAuthAuthorizeOptions, OAuthBeginOptions, OAuthRefreshOptions,
  OAuthTokenBody, OAuthConnection, OAuthCallbackResult,
  OAuthQuery, OAuthLocation, OAuthError,
  OAuthFormConstructor,
} from './wearable-oauth-types.js';

// wearables-fitbit-auth.js — Fitbit OAuth 2.0 PKCE flow
//
// Fitbit supports PKCE out of the box — public client, no client_secret
// needed. The same-origin compatibility proxy handles browser CORS but does
// not add a server-side Fitbit secret.
//
// Authorize: https://www.fitbit.com/oauth2/authorize
// Token:     https://api.fitbit.com/oauth2/token
// API base:  https://api.fitbit.com
// Docs:      https://dev.fitbit.com/build/reference/web-api/

import { isDebugMode } from './utils.js';
import { getProxyApiUrl } from './proxy-runtime.js';
import {
  exposeWearableAuthDebug,
  getWearableAuthLocation,
  redirectWearableAuth,
} from './wearables-auth-runtime.js';

const AUTHORIZE_URL = 'https://www.fitbit.com/oauth2/authorize';
const TOKEN_URL     = 'https://api.fitbit.com/oauth2/token';
const PROXY_URL     = getProxyApiUrl();
const STATE_KEY     = 'fitbit-oauth-pending';
const REFRESH_LOCK_KEY = 'fitbit-oauth-refresh';

// Trimmed to what we canonicalise. Fitbit has more (nutrition, social, etc.)
// that don't currently map to our dashboard — add when a canonical metric
// needs them.
export const DEFAULT_FITBIT_SCOPES = [
  'profile',
  'activity',
  'heartrate',
  'sleep',
  'oxygen_saturation',
  'respiratory_rate',
  'temperature',
  'weight',
];

// ─────────────────────────────────────────────────────────
// PKCE helpers (shared shape with WHOOP's auth module)
// ─────────────────────────────────────────────────────────

function randomUrlSafe(nBytes: number) {
  const bytes = new Uint8Array(nBytes);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Base64Url(str: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return base64UrlEncode(new Uint8Array(buf));
}

// Exposed for test pinning against RFC 7636 Appendix B vector.
export const deriveCodeChallenge = sha256Base64Url;

// ─────────────────────────────────────────────────────────
// Authorize
// ─────────────────────────────────────────────────────────

export function pickRedirectUri(
  registeredUris: readonly string[], locationLike: OAuthLocation = getWearableAuthLocation(),
) {
  return pickWearableRedirectUri(registeredUris, locationLike, 'Fitbit');
}

export async function buildAuthorizeUrl({ clientId, redirectUri, scopes = DEFAULT_FITBIT_SCOPES, state, codeVerifier }: OAuthAuthorizeOptions & { codeVerifier: string }) {
  const challenge = await sha256Base64Url(codeVerifier);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),       // space-delimited per OAuth 2.0 spec
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function beginOAuth({ clientId, registeredUris, scopes = DEFAULT_FITBIT_SCOPES, profileId = null }: OAuthBeginOptions) {
  const state = randomUrlSafe(16);
  const codeVerifier = randomUrlSafe(32); // 43 chars after base64url encoding
  const redirectUri = pickRedirectUri(registeredUris);
  sessionStorage.setItem(STATE_KEY, JSON.stringify({
    state, redirectUri, startedAt: Date.now(), clientId, codeVerifier,
    profileId,
  }));
  const url = await buildAuthorizeUrl({ clientId, redirectUri, scopes, state, codeVerifier });
  redirectWearableAuth(url);
}

// ─────────────────────────────────────────────────────────
// Callback
// ─────────────────────────────────────────────────────────

export async function completeOAuthCallback(urlParams: OAuthQuery): Promise<OAuthCallbackResult> {
  const state = consumeOAuthCallbackState(urlParams, STATE_KEY, 'Fitbit');
  if (state.ok === false) return state;
  const { code, pending } = state;

  const form = new (URLSearchParams as OAuthFormConstructor)({
    grant_type: 'authorization_code',
    code,
    redirect_uri: pending.redirectUri,
    client_id: pending.clientId,
    code_verifier: pending.codeVerifier,
  });
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: TOKEN_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    }),
  });
  const body: OAuthTokenBody = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body?.errors?.[0]?.message || body?.error_description || body?.error || `Token exchange failed (${res.status})` };
  return { ok: true, tokens: normalizeTokenResponse(body), redirectUri: pending.redirectUri, profileId: pending.profileId };
}

export function isFitbitCallback(urlParams: OAuthQuery) {
  return isPendingOAuthCallback(urlParams, STATE_KEY);
}

// ─────────────────────────────────────────────────────────
// Refresh
// ─────────────────────────────────────────────────────────

export async function refreshTokens({ clientId, refreshToken }: OAuthRefreshOptions) {
  const form = new (URLSearchParams as OAuthFormConstructor)({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: TOKEN_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    }),
  });
  const body: OAuthTokenBody = await res.json().catch(() => ({}));
  if (!res.ok) {
        const err: OAuthError = new Error((body?.errors?.[0]?.message || body?.error_description || body?.error || `Refresh failed (${res.status})`) as string);
    err.status = res.status; throw err;
  }
  return normalizeTokenResponse(body);
}

function normalizeTokenResponse(body: OAuthTokenBody) {
  return normalizeOAuthTokenResponse(body, { expiresIn: 28800, tokenType: 'Bearer', userId: 'fitbit' });
}

// ─────────────────────────────────────────────────────────
// Refresh middleware — matches the contract used by other vendors
// ─────────────────────────────────────────────────────────

export async function withFreshToken(
  connection: OAuthConnection, clientId: string | null,
  refreshedWrite: (updated: OAuthConnection) => Promise<unknown> | unknown,
  readLatest?: (() => OAuthConnection | null | undefined),
) {
  return refreshWearableConnection(connection, clientId, refreshedWrite, readLatest, {
    lockKey: REFRESH_LOCK_KEY, refreshTokens, updateUserId: true,
  });
}

exposeWearableAuthDebug('_fitbitAuth', { buildAuthorizeUrl, completeOAuthCallback, isFitbitCallback, refreshTokens, withFreshToken }, Boolean(isDebugMode?.()));
