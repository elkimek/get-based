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
// On a user-owned deployment, token exchange goes through its /api/proxy so
// ULTRAHUMAN_CLIENT_SECRET never reaches the browser. The official hosted app
// disables this relay-dependent connection.

import { isDebugMode } from './utils.js';
import { getProxyApiUrl } from './proxy-runtime.js';
import {
  exposeWearableAuthDebug,
  getWearableAuthLocation,
  redirectWearableAuth,
} from './wearables-auth-runtime.js';

const AUTHORIZE_URL = 'https://auth.ultrahuman.com/authorise';
const PROXY_URL     = getProxyApiUrl();
const STATE_KEY     = 'ultrahuman-oauth-pending';
const REFRESH_LOCK_KEY = 'ultrahuman-oauth-refresh';

export const DEFAULT_ULTRAHUMAN_SCOPES = ['profile', 'ring_data', 'cgm_data'];

export function pickRedirectUri(
  registeredUris: readonly string[], locationLike: OAuthLocation = getWearableAuthLocation(),
) {
  return pickWearableRedirectUri(registeredUris, locationLike, 'Ultrahuman');
}

export function buildAuthorizeUrl({ clientId, redirectUri, scopes = DEFAULT_ULTRAHUMAN_SCOPES, state }: OAuthAuthorizeOptions) {
  return buildWearableAuthorizeUrl(AUTHORIZE_URL, { clientId, redirectUri, scopes, state });
}

export function beginOAuth({ clientId, registeredUris, scopes = DEFAULT_ULTRAHUMAN_SCOPES, profileId = null }: OAuthBeginOptions) {
  beginWearableOAuth({ clientId, registeredUris, scopes, profileId }, STATE_KEY, pickRedirectUri, buildAuthorizeUrl, redirectWearableAuth);
}

export async function completeOAuthCallback(urlParams: OAuthQuery): Promise<OAuthCallbackResult> {
  const state = consumeOAuthCallbackState(urlParams, STATE_KEY, 'Ultrahuman');
  if (state.ok === false) return state;
  const { code, pending } = state;

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
  const body: OAuthTokenBody = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body?.error_description || body?.error || `Token exchange failed (${res.status})` };
  return {
    ok: true,
    tokens: normalizeTokenResponse(body),
    redirectUri: pending.redirectUri,
    profileId: pending.profileId,
  };
}

export function isUltrahumanCallback(urlParams: OAuthQuery) {
  return isPendingOAuthCallback(urlParams, STATE_KEY);
}

export const refreshTokens = createWearableTokenRefresh(
  PROXY_URL, 'ultrahuman_token_refresh', normalizeTokenResponse, 'error_description',
);

function normalizeTokenResponse(body: OAuthTokenBody) {
  return normalizeOAuthTokenResponse(body, { expiresIn: 3600, tokenType: 'Bearer' });
}

export async function withFreshToken(
  connection: OAuthConnection, clientId: string | null,
  refreshedWrite: (updated: OAuthConnection) => Promise<unknown> | unknown,
  readLatest?: (() => OAuthConnection | null | undefined),
) {
  return refreshWearableConnection(connection, clientId, refreshedWrite, readLatest, {
    lockKey: REFRESH_LOCK_KEY, refreshTokens,
  });
}

exposeWearableAuthDebug('_ultrahumanAuth', { buildAuthorizeUrl, completeOAuthCallback, isUltrahumanCallback, refreshTokens, withFreshToken }, Boolean(isDebugMode?.()));
