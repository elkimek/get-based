export interface OAuthAuthorizeOptions {
  clientId: string;
  redirectUri: string;
  scopes?: readonly string[];
  state: string;
}
export interface OAuthBeginOptions {
  clientId: string;
  registeredUris: readonly string[];
  scopes?: readonly string[];
  profileId?: string | null;
}
export interface OAuthRefreshOptions { clientId: string | null; refreshToken: unknown }
export interface OAuthPendingState {
  state?: unknown; redirectUri?: unknown; startedAt?: unknown;
  clientId?: unknown; profileId?: unknown; codeVerifier?: unknown;
}
export interface OAuthTokenBody {
  access_token?: unknown; refresh_token?: unknown; expires_in?: unknown;
  scope?: unknown; token_type?: unknown; user_id?: unknown; userid?: unknown; x_user_id?: unknown;
  error?: unknown; error_description?: unknown; status?: unknown;
  errors?: { message?: unknown }[] | null;
  body?: OAuthTokenBody | null;
}
export interface OAuthTokens {
  accessToken: unknown; refreshToken: unknown; expiresAt: number;
  scope: unknown; tokenType: unknown; userId?: unknown;
}
export interface OAuthConnection {
  accessToken?: unknown; refreshToken?: unknown; expiresAt?: number | null;
  scope?: unknown; userId?: unknown;
  [key: string]: unknown;
}
export type OAuthCallbackResult =
  | { ok: false; error: unknown; tokens?: never; redirectUri?: never; profileId?: never }
  | { ok: true; error?: never; tokens: OAuthTokens; redirectUri: unknown; profileId: unknown };
export type OAuthQuery = Pick<URLSearchParams, 'get'>;
export type OAuthLocation = { origin?: string; pathname?: string } | null;
export type OAuthError = Error & { code?: string; status?: number; withingsCode?: unknown };
export type OAuthFormConstructor = new (values: Record<string, unknown>) => URLSearchParams;
