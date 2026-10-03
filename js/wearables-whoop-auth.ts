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

// wearables-whoop-auth.js — WHOOP OAuth2 confidential-client flow
//
// WHOOP requires the application's client secret for authorization-code token
// exchange and refresh. The browser handles consent state; /api/proxy injects
// the deployment's WHOOP_CLIENT_SECRET so it never reaches browser storage.

import { isDebugMode } from './utils.js';
import { getProxyApiUrl } from './proxy-runtime.js';
import {
  exposeWearableAuthDebug,
  getWearableAuthLocation,
  redirectWearableAuth,
} from './wearables-auth-runtime.js';

const AUTHORIZE_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const PROXY_URL     = getProxyApiUrl();
const STATE_KEY     = 'whoop-oauth-pending';       // sessionStorage
const REFRESH_LOCK_KEY = 'whoop-oauth-refresh';

export const DEFAULT_WHOOP_SCOPES = [
  'read:recovery', 'read:sleep', 'read:workout', 'read:cycles', 'read:profile', 'offline',
];

// ─────────────────────────────────────────────────────────
// Authorize
// ─────────────────────────────────────────────────────────

export function pickRedirectUri(
  registeredUris: readonly string[], locationLike: OAuthLocation = getWearableAuthLocation(),
) {
  return pickWearableRedirectUri(registeredUris, locationLike, 'WHOOP');
}

export function buildAuthorizeUrl({ clientId, redirectUri, scopes = DEFAULT_WHOOP_SCOPES, state }: OAuthAuthorizeOptions) {
  return buildWearableAuthorizeUrl(AUTHORIZE_URL, { clientId, redirectUri, scopes, state });
}

export async function beginOAuth({ clientId, registeredUris, scopes = DEFAULT_WHOOP_SCOPES, profileId = null }: OAuthBeginOptions) {
  beginWearableOAuth({ clientId, registeredUris, scopes, profileId }, STATE_KEY, pickRedirectUri, buildAuthorizeUrl, redirectWearableAuth);
}

// ─────────────────────────────────────────────────────────
// Callback
// ─────────────────────────────────────────────────────────

export async function completeOAuthCallback(urlParams: OAuthQuery): Promise<OAuthCallbackResult> {
  const state = consumeOAuthCallbackState(urlParams, STATE_KEY, 'WHOOP');
  if (state.ok === false) return state;
  const { code, pending } = state;

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
  const body: OAuthTokenBody = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body?.error_description || body?.error || `Token exchange failed (${res.status})` };
  return { ok: true, tokens: normalizeTokenResponse(body), redirectUri: pending.redirectUri, profileId: pending.profileId };
}

export function isWhoopCallback(urlParams: OAuthQuery) {
  return isPendingOAuthCallback(urlParams, STATE_KEY);
}

// ─────────────────────────────────────────────────────────
// Refresh
// ─────────────────────────────────────────────────────────

export const refreshTokens = createWearableTokenRefresh(
  PROXY_URL, 'whoop_token_refresh', normalizeTokenResponse, 'error_description',
);

function normalizeTokenResponse(body: OAuthTokenBody) {
  return normalizeOAuthTokenResponse(body, { expiresIn: 3600, tokenType: 'bearer' });
}

// ─────────────────────────────────────────────────────────
// Refresh middleware — same contract as Oura's withFreshToken
// ─────────────────────────────────────────────────────────

export async function withFreshToken(
  connection: OAuthConnection, clientId: string | null,
  refreshedWrite: (updated: OAuthConnection) => Promise<unknown> | unknown,
  readLatest?: (() => OAuthConnection | null | undefined),
) {
  return refreshWearableConnection(connection, clientId, refreshedWrite, readLatest, {
    lockKey: REFRESH_LOCK_KEY, refreshTokens,
  });
}

exposeWearableAuthDebug('_whoopAuth', { buildAuthorizeUrl, completeOAuthCallback, isWhoopCallback, refreshTokens, withFreshToken }, Boolean(isDebugMode?.()));
