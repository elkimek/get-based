import {
  pickWearableRedirectUri,
  consumeOAuthCallbackState,
  isPendingOAuthCallback,
  beginWearableOAuth,
  buildWearableAuthorizeUrl,
} from './wearable-oauth-state.js';
import { normalizeOAuthTokenResponse, refreshWearableConnection } from './wearable-oauth-tokens.js';
import type {
  OAuthAuthorizeOptions, OAuthBeginOptions, OAuthRefreshOptions,
  OAuthTokenBody, OAuthConnection, OAuthCallbackResult,
  OAuthQuery, OAuthLocation, OAuthError,
} from './wearable-oauth-types.js';

// wearables-withings-auth.js — Withings OAuth2 server-side flow
//
// Withings's OAuth2 is LIKE Oura's but with two non-standard twists:
//   1. The token endpoint is `https://wbsapi.withings.net/v2/oauth2`
//      (not /oauth/token). Both exchange and refresh use `action=requesttoken`;
//      `grant_type` distinguishes the two requests.
//   2. Responses wrap the real payload in `{ status: 0, body: {…} }` —
//      status 0 means success; any other integer is an error code.
//
// Everything else matches the Oura server-side pattern: client_secret
// stays server-side (Vercel env var WITHINGS_CLIENT_SECRET, read only by
// /api/proxy). PKCE is NOT supported by Withings.

import { isDebugMode } from './utils.js';
import { getProxyApiUrl } from './proxy-runtime.js';
import {
  exposeWearableAuthDebug,
  getWearableAuthLocation,
  redirectWearableAuth,
} from './wearables-auth-runtime.js';
import { withingsErrorMessage } from './wearables-withings-errors.js';

const AUTHORIZE_URL = 'https://account.withings.com/oauth2_user/authorize2';
const PROXY_URL     = getProxyApiUrl();
const STATE_KEY     = 'withings-oauth-pending';
const REFRESH_LOCK_KEY = 'withings-oauth-refresh';
// Withings authorization codes must be exchanged promptly. Never let a
// stalled proxy hold the startup sequence open until the hosting platform's
// multi-minute function timeout; fail back to the rendered app with a useful
// reconnect message instead.
const TOKEN_REQUEST_TIMEOUT_MS = 20_000;

export const DEFAULT_WITHINGS_SCOPES = ['user.info', 'user.metrics', 'user.activity', 'user.sleepevents'];

export function pickRedirectUri(
  registeredUris: readonly string[], locationLike: OAuthLocation = getWearableAuthLocation(),
) {
  return pickWearableRedirectUri(registeredUris, locationLike, 'Withings');
}

export function buildAuthorizeUrl({ clientId, redirectUri, scopes = DEFAULT_WITHINGS_SCOPES, state }: OAuthAuthorizeOptions) {
  return buildWearableAuthorizeUrl(AUTHORIZE_URL, { clientId, redirectUri, scopes, state }, ',');
}

export function beginOAuth({ clientId, registeredUris, scopes = DEFAULT_WITHINGS_SCOPES, profileId = null }: OAuthBeginOptions) {
  beginWearableOAuth({ clientId, registeredUris, scopes, profileId }, STATE_KEY, pickRedirectUri, buildAuthorizeUrl, redirectWearableAuth);
}

async function withingsTokenRequest(payload: Record<string, unknown>) {
  // AbortController predates AbortSignal.timeout across supported browsers.
  // Build the deadline explicitly so older engines cannot silently fall back
  // to the unbounded request that originally blocked the startup sequence.
  // Keep the deadline around response parsing too: fetch() resolves when
  // headers arrive, while a stalled JSON body can otherwise block forever.
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      const error = new DOMException('Withings token request timed out', 'TimeoutError');
      controller.abort(error);
      reject(error);
    }, TOKEN_REQUEST_TIMEOUT_MS);
  });
  const request = (async () => {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let body: OAuthTokenBody;
    try {
      body = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason || error;
      body = {};
    }
    return { response, body };
  })();
  try {
    return await Promise.race([request, deadline]);
  } finally {
    clearTimeout(timeout);
  }
}

function withingsTokenRequestError(error: unknown, operation: string) {
  const name = error instanceof Error ? error.name : '';
  const timedOut = name === 'TimeoutError' || name === 'AbortError';
  const wrapped: OAuthError = new Error(timedOut
    ? `Withings ${operation} timed out — please connect Withings again`
    : `Withings ${operation} failed — check your connection and try again`);
  wrapped.code = timedOut ? 'timeout' : 'network';
  wrapped.status = 503;
  return wrapped;
}

export async function completeOAuthCallback(urlParams: OAuthQuery): Promise<OAuthCallbackResult> {
  const state = consumeOAuthCallbackState(urlParams, STATE_KEY, 'Withings');
  if (state.ok === false) return state;
  const { code, pending } = state;

  let tokenResult;
  try {
    tokenResult = await withingsTokenRequest({
      withings_token_exchange: {
        code,
        redirect_uri: pending.redirectUri,
        client_id: pending.clientId,
      },
    });
  } catch (error) {
    return { ok: false, error: withingsTokenRequestError(error, 'token exchange').message };
  }
  const { response: res, body } = tokenResult;
  if (!res.ok) return { ok: false, error: body?.error || body?.error_description || `Token exchange failed (${res.status})` };
  // Accept both `{status: 0, body: {...}}` and plain token responses.
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

export function isWithingsCallback(urlParams: OAuthQuery) {
  return isPendingOAuthCallback(urlParams, STATE_KEY);
}

export async function refreshTokens({ clientId, refreshToken }: OAuthRefreshOptions) {
  let tokenResult;
  try {
    tokenResult = await withingsTokenRequest({
      withings_token_refresh: { refresh_token: refreshToken, client_id: clientId },
    });
  } catch (error) {
    throw withingsTokenRequestError(error, 'token refresh');
  }
  const { response: res, body } = tokenResult;
  if (!res.ok) {
        const err: OAuthError = new Error((body?.error || body?.error_description || `Refresh failed (${res.status})`) as string);
    err.status = res.status; throw err;
  }
  if (body?.status !== undefined && body.status !== 0) {
    const mapped = withingsErrorMessage(body.status);
    const err: OAuthError = new Error(mapped
      ? `Withings ${body.status}: ${mapped}`
      : `Withings refresh error ${body.status}: ${body.error || 'unknown'}`);
    const authDead = new Set([100, 101, 102, 243, 245, 283, 284]);
    err.status = authDead.has(Number(body.status)) ? 401 : 400;
    err.withingsCode = body.status;
    throw err;
  }
  return normalizeTokenResponse(body.body || body);
}

function normalizeTokenResponse(body: OAuthTokenBody) {
  return normalizeOAuthTokenResponse(body, { expiresIn: 10800, tokenType: 'Bearer', userId: 'withings' });
}

export async function withFreshToken(
  connection: OAuthConnection, clientId: string | null,
  refreshedWrite: (updated: OAuthConnection) => Promise<unknown> | unknown,
  readLatest?: (() => OAuthConnection | null | undefined),
) {
  return refreshWearableConnection(connection, clientId, refreshedWrite, readLatest, {
    lockKey: REFRESH_LOCK_KEY, refreshTokens, updateUserId: true,
  });
}

exposeWearableAuthDebug('_withingsAuth', { buildAuthorizeUrl, completeOAuthCallback, isWithingsCallback, refreshTokens, withFreshToken }, Boolean(isDebugMode?.()));
