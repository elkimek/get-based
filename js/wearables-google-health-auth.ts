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

// wearables-google-health-auth.js — Google OAuth 2.0 web-server flow
//
// The OAuth client secret is held by /api/proxy and never shipped to the
// browser. The browser keeps only short-lived callback state in sessionStorage;
// successful credentials are moved into wearables-credential-vault.js by the
// connection orchestrator.

import { isDebugMode } from './utils.js';
import { getProxyApiUrl } from './proxy-runtime.js';
import {
  exposeWearableAuthDebug,
  getWearableAuthLocation,
  redirectWearableAuth,
} from './wearables-auth-runtime.js';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const PROXY_URL = getProxyApiUrl();
const STATE_KEY = 'google_health-oauth-pending';
const REFRESH_LOCK_KEY = 'google-health-oauth-refresh';
const LIFECYCLE_LOCK_KEY = 'google-health-connection-lifecycle';
const lockTails = new Map<string, Promise<void>>();

/** Serialize module mutations and coordinate them across tabs where supported. */
function withGoogleHealthLock<T>(lockKey: string, callback: () => Promise<T> | T): Promise<T> {
  const runInModuleQueue = () => {
    const tail = lockTails.get(lockKey) || Promise.resolve();
    const result = tail.then(callback, callback);
    lockTails.set(lockKey, result.then(() => undefined, () => undefined));
    return result;
  };
  const locks = globalThis.navigator?.locks;
  if (locks && typeof locks.request === 'function') {
    return locks.request(lockKey, { mode: 'exclusive' }, runInModuleQueue);
  }
  return runInModuleQueue();
}

export function withGoogleHealthRefreshLock<T>(callback: () => Promise<T> | T): Promise<T> {
  return withGoogleHealthLock(REFRESH_LOCK_KEY, callback);
}

export function withGoogleHealthLifecycleLock<T>(callback: () => Promise<T> | T): Promise<T> {
  return withGoogleHealthLock(LIFECYCLE_LOCK_KEY, callback);
}

export const DEFAULT_GOOGLE_HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
];

export function googleHealthDisconnectedError() {
    const error: OAuthError = new Error(('Connection was removed while credentials were being refreshed.') as string);
  error.code = 'disconnected';
  return error;
}

export function pickRedirectUri(
  registeredUris: readonly string[], locationLike: OAuthLocation = getWearableAuthLocation(),
) {
  return pickWearableRedirectUri(registeredUris, locationLike, 'Google Health');
}

export function buildAuthorizeUrl({ clientId, redirectUri, scopes = DEFAULT_GOOGLE_HEALTH_SCOPES, state }: OAuthAuthorizeOptions) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export function beginOAuth({ clientId, registeredUris, scopes = DEFAULT_GOOGLE_HEALTH_SCOPES, profileId = null }: OAuthBeginOptions) {
  const state = randomState(24);
  const redirectUri = pickRedirectUri(registeredUris);
  sessionStorage.setItem(STATE_KEY, JSON.stringify({
    state,
    redirectUri,
    startedAt: Date.now(),
    clientId,
    profileId,
  }));
  redirectWearableAuth(buildAuthorizeUrl({ clientId, redirectUri, scopes, state }));
}

export async function completeOAuthCallback(urlParams: OAuthQuery): Promise<OAuthCallbackResult> {
  const state = consumeOAuthCallbackState(urlParams, STATE_KEY, 'Google Health', true);
  if (state.ok === false) return state;
  const { code, pending } = state;

  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      google_health_token_exchange: {
        code,
        redirect_uri: pending.redirectUri,
        client_id: pending.clientId,
      },
    }),
  });
  const body: OAuthTokenBody = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: body?.error_description || body?.error || `Token exchange failed (${res.status})` };
  }
  return {
    ok: true,
    tokens: normalizeTokenResponse(body),
    redirectUri: pending.redirectUri,
    profileId: pending.profileId,
  };
}

export function isGoogleHealthCallback(urlParams: OAuthQuery) {
  return isPendingOAuthCallback(urlParams, STATE_KEY);
}

export async function refreshTokens({ clientId, refreshToken }: OAuthRefreshOptions) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      google_health_token_refresh: {
        refresh_token: refreshToken,
        client_id: clientId,
      },
    }),
  });
  const body: OAuthTokenBody = await res.json().catch(() => ({}));
  if (!res.ok) {
        const error: OAuthError = new Error((body?.error_description || body?.error || `Refresh failed (${res.status})`) as string);
    error.status = res.status;
    throw error;
  }
  return normalizeTokenResponse(body);
}

function normalizeTokenResponse(body: OAuthTokenBody) {
  return normalizeOAuthTokenResponse(body, { expiresIn: 3600, tokenType: 'Bearer', nullableRefresh: true });
}

export async function withFreshToken(
  connection: OAuthConnection, clientId: string | null,
  refreshedWrite: (updated: OAuthConnection) => Promise<unknown> | unknown,
  readLatest?: (() => OAuthConnection | null | undefined),
) {
  return refreshWearableConnection(connection, clientId, refreshedWrite, readLatest, {
    lockKey: REFRESH_LOCK_KEY, refreshTokens, latestRequiresAccessToken: true, runLocked: withGoogleHealthRefreshLock,
  });
}

exposeWearableAuthDebug('_googleHealthAuth', {
  buildAuthorizeUrl,
  completeOAuthCallback,
  isGoogleHealthCallback,
  refreshTokens,
  withGoogleHealthLifecycleLock,
  withGoogleHealthRefreshLock,
  withFreshToken,
}, Boolean(isDebugMode?.()));
