import {
  pickWearableRedirectUri,
  consumeOAuthCallbackState,
  isPendingOAuthCallback,
  randomOAuthState as randomState,
} from './wearable-oauth-state.js';
import { normalizeOAuthTokenResponse, refreshWearableConnection } from './wearable-oauth-tokens.js';
import type {
  OAuthAuthorizeOptions, OAuthBeginOptions, OAuthRefreshOptions,
  OAuthTokenBody, OAuthConnection, OAuthCallbackResult,
  OAuthQuery, OAuthLocation, OAuthError,
} from './wearable-oauth-types.js';

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
import { getProxyApiUrl } from './proxy-runtime.js';
import {
  exposeWearableAuthDebug,
  getWearableAuthLocation,
  redirectWearableAuth,
} from './wearables-auth-runtime.js';

const AUTHORIZE_URL    = 'https://flow.polar.com/oauth2/authorization';
const PROXY_URL        = getProxyApiUrl();
const STATE_KEY        = 'polar-oauth-pending';
const REFRESH_LOCK_KEY = 'polar-oauth-refresh';

export const DEFAULT_POLAR_SCOPES = ['accesslink.read_all'];

export function pickRedirectUri(
  registeredUris: readonly string[], locationLike: OAuthLocation = getWearableAuthLocation(),
) {
  return pickWearableRedirectUri(registeredUris, locationLike, 'Polar');
}

export function buildAuthorizeUrl({ clientId, redirectUri, scopes = DEFAULT_POLAR_SCOPES, state }: OAuthAuthorizeOptions) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export function beginOAuth({ clientId, registeredUris, scopes = DEFAULT_POLAR_SCOPES, profileId = null }: OAuthBeginOptions) {
  const state = randomState();
  const redirectUri = pickRedirectUri(registeredUris);
  sessionStorage.setItem(STATE_KEY, JSON.stringify({
    state, redirectUri, startedAt: Date.now(), clientId,
    profileId,
  }));
  const url = buildAuthorizeUrl({ clientId, redirectUri, scopes, state });
  redirectWearableAuth(url);
}

export async function completeOAuthCallback(urlParams: OAuthQuery): Promise<OAuthCallbackResult> {
  const state = consumeOAuthCallbackState(urlParams, STATE_KEY, 'Polar');
  if (state.ok === false) return state;
  const { code, pending } = state;

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
  const body: OAuthTokenBody = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body?.error || body?.error_description || `Token exchange failed (${res.status})` };
  return {
    ok: true,
    tokens: normalizeTokenResponse(body),
    redirectUri: pending.redirectUri,
    profileId: pending.profileId,
  };
}

export function isPolarCallback(urlParams: OAuthQuery) {
  return isPendingOAuthCallback(urlParams, STATE_KEY);
}

export async function refreshTokens({ clientId, refreshToken }: OAuthRefreshOptions) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      polar_token_refresh: { refresh_token: refreshToken, client_id: clientId },
    }),
  });
  const body: OAuthTokenBody = await res.json().catch(() => ({}));
  if (!res.ok) {
        const err: OAuthError = new Error((body?.error || body?.error_description || `Refresh failed (${res.status})`) as string);
    err.status = res.status; throw err;
  }
  return normalizeTokenResponse(body);
}

function normalizeTokenResponse(body: OAuthTokenBody) {
  return normalizeOAuthTokenResponse(body, { expiresIn: 20 * 365 * 86400, tokenType: 'Bearer', nullableRefresh: true, userId: 'polar' });
}

export async function withFreshToken(
  connection: OAuthConnection, clientId: string | null,
  refreshedWrite: (updated: OAuthConnection) => Promise<unknown> | unknown,
  readLatest?: (() => OAuthConnection | null | undefined),
) {
  return refreshWearableConnection(connection, clientId, refreshedWrite, readLatest, {
    lockKey: REFRESH_LOCK_KEY, refreshTokens, updateUserId: true, allowWithoutRefresh: true,
  });
}

// Exposed for test pinning — mirrors the sha256-based PKCE export in the
// whoop/fitbit modules. Polar itself doesn't use PKCE, but the consistent
// export surface makes the drift test simpler.
export const deriveCodeChallenge = null;

exposeWearableAuthDebug('_polarAuth', { buildAuthorizeUrl, completeOAuthCallback, isPolarCallback, refreshTokens, withFreshToken }, Boolean(isDebugMode?.()));
