import type { ProxyValidation } from './proxy-policy.js';

export type OAuthProvider = 'oura' | 'withings' | 'ultrahuman' | 'whoop' | 'polar' | 'google_health';
export type OAuthGrant = 'exchange' | 'refresh';
type OAuthFormField = 'action' | 'grant_type' | 'code' | 'redirect_uri' | 'client_id' | 'client_secret' | 'refresh_token' | 'scope';

export interface OAuthTokenFields {
  code?: unknown;
  redirect_uri?: unknown;
  client_id?: unknown;
  refresh_token?: unknown;
}

interface OAuthTokenFormBase {
  provider: OAuthProvider;
  secret: string;
  action?: string;
  scope?: string;
  exchangeFields?: readonly OAuthFormField[];
  refreshFields?: readonly OAuthFormField[];
}

export type OAuthTokenFormSpec = OAuthTokenFormBase & (
  | { clientId: string; clientMismatch: string }
  | { clientId?: never; clientMismatch?: never }
);

// Native URLSearchParams supplies the established coercion for truthy raw values.
type OAuthFormConstructor = new (values: Record<string, unknown>) => URLSearchParams;

export function createOAuthTokenForm(
  input: OAuthTokenFields, grant: OAuthGrant, spec: OAuthTokenFormSpec,
): ProxyValidation<{ form: URLSearchParams; clientId: unknown }> {
  let values: Record<string, unknown>;
  let clientId: unknown;
  let fields: readonly OAuthFormField[];
  if (grant === 'exchange') {
    const { code, redirect_uri, client_id } = input;
    if (!code || !redirect_uri || !client_id) {
      return { ok: false, error: `${spec.provider}_token_exchange requires code, redirect_uri, client_id` };
    }
    if (spec.clientId !== undefined && client_id !== spec.clientId) {
      return { ok: false, error: spec.clientMismatch };
    }
    clientId = spec.clientId ?? client_id;
    values = { grant_type: 'authorization_code', code, redirect_uri, client_id: clientId, client_secret: spec.secret };
    fields = spec.exchangeFields || ['grant_type', 'code', 'redirect_uri', 'client_id', 'client_secret'];
  } else {
    const { refresh_token, client_id } = input;
    if (!refresh_token || !client_id) {
      return { ok: false, error: `${spec.provider}_token_refresh requires refresh_token, client_id` };
    }
    if (spec.clientId !== undefined && client_id !== spec.clientId) {
      return { ok: false, error: spec.clientMismatch };
    }
    clientId = spec.clientId ?? client_id;
    values = { grant_type: 'refresh_token', refresh_token, client_id: clientId, client_secret: spec.secret };
    fields = spec.refreshFields || ['grant_type', 'refresh_token', 'client_id', 'client_secret'];
  }
  values.action = spec.action;
  values.scope = spec.scope;
  const form = new (URLSearchParams as OAuthFormConstructor)(
    Object.fromEntries(fields.map(field => [field, values[field]])),
  );
  return { ok: true, form, clientId };
}
