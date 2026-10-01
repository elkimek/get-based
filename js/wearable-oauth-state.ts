import type { OAuthAuthorizeOptions, OAuthBeginOptions, OAuthLocation, OAuthPendingState, OAuthQuery } from './wearable-oauth-types.js';

type OAuthCallbackState =
  | { ok: false; error: string; code?: never; pending?: never }
  | { ok: true; error?: never; code: string; pending: OAuthPendingState };

export function randomOAuthState(nBytes = 16): string {
  const bytes = new Uint8Array(nBytes);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function pickWearableRedirectUri(registeredUris: readonly string[], locationLike: OAuthLocation, provider: string) {
  const origin = locationLike?.origin;
  if (!origin) throw new Error(`No registered ${provider} redirect URI matches current origin unknown`);
  const hrefBase = origin + locationLike.pathname;
  const exact = registeredUris.find(uri => uri === hrefBase || uri === hrefBase + '/');
  if (exact) return exact;
  const byOrigin = registeredUris.find(uri => uri.startsWith(origin));
  if (byOrigin) return byOrigin;
  throw new Error(`No registered ${provider} redirect URI matches current origin ${origin}`);
}

/** Consume callback state before parsing or checking CSRF and expiry. */
export function consumeOAuthCallbackState(
  urlParams: OAuthQuery, stateKey: string, provider: string, descriptionReadOnce = false,
): OAuthCallbackState {
  const code = urlParams.get('code');
  const returnedState = urlParams.get('state');
  const errorParam = urlParams.get('error');
  if (errorParam) {
    if (descriptionReadOnce) {
      const description = urlParams.get('error_description');
      return { ok: false, error: errorParam + (description ? `: ${description}` : '') };
    }
    return { ok: false, error: errorParam + (urlParams.get('error_description') ? `: ${urlParams.get('error_description')}` : '') };
  }
  if (!code || !returnedState) return { ok: false, error: 'Missing code or state in callback' };
  const pendingRaw = sessionStorage.getItem(stateKey);
  if (!pendingRaw) return { ok: false, error: `No pending ${provider} OAuth state (link may have been opened in a different tab)` };
  sessionStorage.removeItem(stateKey);
  let pending: OAuthPendingState;
  try { pending = JSON.parse(pendingRaw); }
  catch { return { ok: false, error: 'Corrupt pending state' }; }
  if (pending.state !== returnedState) return { ok: false, error: 'State mismatch — possible CSRF, aborting' };
  if (typeof pending.startedAt === 'number' && Date.now() - pending.startedAt > 10 * 60 * 1000) {
    return { ok: false, error: 'OAuth flow expired — please try connecting again' };
  }
  return { ok: true, code, pending };
}

export function isPendingOAuthCallback(urlParams: OAuthQuery, stateKey: string): boolean {
  if (!urlParams.get('state')) return false;
  const pendingRaw = sessionStorage.getItem(stateKey);
  if (!pendingRaw) return false;
  try { return JSON.parse(pendingRaw).state === urlParams.get('state'); }
  catch { return false; }
}


/** Build a code-flow URL with provider-owned defaults and scope delimiter. */
export function buildWearableAuthorizeUrl(
  authorizeUrl: string, { clientId, redirectUri, scopes, state }: Required<OAuthAuthorizeOptions>, scopeSeparator = ' ',
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(scopeSeparator),
    state,
  });
  return `${authorizeUrl}?${params.toString()}`;
}

/** Pin the initiating profile and CSRF state before redirecting. */
export function beginWearableOAuth(
  { clientId, registeredUris, scopes, profileId }: Required<OAuthBeginOptions>, stateKey: string,
  pickRedirectUri: (registeredUris: readonly string[]) => string,
  buildAuthorizeUrl: (options: OAuthAuthorizeOptions) => string, redirectWearableAuth: (url: string) => unknown,
): void {
  const state = randomOAuthState();
  const redirectUri = pickRedirectUri(registeredUris);
  sessionStorage.setItem(stateKey, JSON.stringify({
    state, redirectUri, startedAt: Date.now(), clientId,
    profileId,
  }));
  const url = buildAuthorizeUrl({ clientId, redirectUri, scopes, state });
  redirectWearableAuth(url);
}
