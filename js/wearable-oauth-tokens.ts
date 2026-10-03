import type { OAuthConnection, OAuthError, OAuthRefreshOptions, OAuthTokenBody, OAuthTokens } from './wearable-oauth-types.js';

interface OAuthTokenDefaults {
  expiresIn: number;
  tokenType: string;
  nullableRefresh?: boolean;
  userId?: 'fitbit' | 'withings' | 'polar';
}

/** Preserve provider defaults, raw fields and field evaluation order. */
export function normalizeOAuthTokenResponse(body: OAuthTokenBody, defaults: OAuthTokenDefaults): OAuthTokens {
  const expiresIn = typeof body.expires_in === 'number' ? body.expires_in : defaults.expiresIn;
  return {
    accessToken: body.access_token,
    refreshToken: defaults.nullableRefresh ? body.refresh_token || null : body.refresh_token,
    expiresAt: Date.now() + (expiresIn * 1000),
    scope: body.scope || '',
    tokenType: body.token_type || defaults.tokenType,
    ...(defaults.userId === 'fitbit' ? { userId: body.user_id || null }
      : defaults.userId === 'withings' ? { userId: body.userid || null }
      : defaults.userId === 'polar' ? { userId: body.x_user_id != null ? String(body.x_user_id) : null } : {}),
  };
}

// Return the actual async entry point so sharing adds no promise adoption
// turn. Provider modules have no import cycles and initialize this before
// exposing their debug API; the returned name and arity remain unchanged.
export function createWearableTokenRefresh(
  proxyUrl: string, requestKey: string, normalize: (body: OAuthTokenBody) => OAuthTokens,
  primaryError: 'error' | 'error_description' = 'error',
) {
  const secondaryError = primaryError === 'error' ? 'error_description' : 'error';
  return async function refreshTokens({ clientId, refreshToken }: OAuthRefreshOptions) {
    const res = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [requestKey]: { refresh_token: refreshToken, client_id: clientId } }),
    });
    const body: OAuthTokenBody = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error: OAuthError = new Error((body?.[primaryError] || body?.[secondaryError] || `Refresh failed (${res.status})`) as string);
      error.status = res.status;
      throw error;
    }
    return normalize(body);
  };
}

interface OAuthRefreshPolicy {
  lockKey: string;
  refreshTokens: (options: OAuthRefreshOptions) => Promise<OAuthTokens>;
  allowWithoutRefresh?: boolean;
  latestRequiresAccessToken?: boolean;
  updateUserId?: boolean;
  runLocked?: (run: () => Promise<OAuthConnection>) => Promise<OAuthConnection>;
}

const REFRESH_LEAD_MS = 5 * 60 * 1000;

// Keep this coordinator synchronous. Each provider's existing async wrapper
// adopts its result, so delegation introduces no additional promise turn.
export function refreshWearableConnection(
  connection: OAuthConnection, clientId: string | null,
  refreshedWrite: (updated: OAuthConnection) => Promise<unknown> | unknown,
  readLatest: (() => OAuthConnection | null | undefined) | undefined,
  policy: OAuthRefreshPolicy,
): OAuthConnection | Promise<OAuthConnection> {
  const { refreshTokens, runLocked } = policy;
  if (policy.allowWithoutRefresh && !connection.refreshToken) return connection;
  const needsRefresh = !connection.accessToken || !connection.expiresAt || (connection.expiresAt - Date.now()) < REFRESH_LEAD_MS;
  if (!needsRefresh) return connection;

  const run = async () => {
    // Re-read under the lock so another tab's rotated refresh token wins.
    const latest = readLatest?.() ?? connection;
    if (latest.expiresAt && (latest.expiresAt - Date.now()) >= REFRESH_LEAD_MS
        && (!policy.latestRequiresAccessToken || latest.accessToken)) return latest;
    if (!latest.refreshToken) {
      if (policy.allowWithoutRefresh) return latest;
      const error: OAuthError = new Error('No refresh token stored — user must reconnect');
      error.code = 'needs-reauth';
      throw error;
    }
    const fresh = await refreshTokens({ clientId, refreshToken: latest.refreshToken });
    const updated = {
      ...latest,
      accessToken: fresh.accessToken,
      refreshToken: fresh.refreshToken || latest.refreshToken,
      expiresAt: fresh.expiresAt,
      scope: fresh.scope || latest.scope,
      ...(policy.updateUserId ? { userId: fresh.userId || latest.userId } : {}),
    };
    await refreshedWrite(updated);
    return updated;
  };

  if (runLocked) return runLocked(run);
  if (navigator.locks && typeof navigator.locks.request === 'function') {
    return navigator.locks.request(policy.lockKey, { mode: 'exclusive' }, run);
  }
  return run();
}
