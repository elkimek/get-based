// @ts-check
// api-openrouter-oauth.js - OpenRouter OAuth PKCE session helpers.

import {
  getAIProvider,
  markAISettingsLocal,
  setAIProvider,
} from './api-provider-storage.js';
import {
  getApiLocationOriginRuntime,
  getApiLocationPathnameRuntime,
  setApiLocationHrefRuntime,
} from './api-runtime.js';

const OPENROUTER_OAUTH_PREVIOUS_PROVIDER_KEY = 'or_previous_ai_provider';
const OPENROUTER_OAUTH_LOCAL_SETTINGS_LOCK_UNTIL_KEY = 'or_oauth_local_settings_lock_until';
const OPENROUTER_OAUTH_PROVIDERS = new Set(['openrouter', 'venice', 'routstr', 'ppq', 'custom', 'ollama']);

function _isValidAIProvider(provider) {
  return typeof provider === 'string' && OPENROUTER_OAUTH_PROVIDERS.has(provider);
}

export async function generatePKCE() {
  const codeVerifier = _randomBase64Url(32);
  const codeChallenge = await _sha256Base64Url(codeVerifier);
  return { codeVerifier, codeChallenge };
}

function _base64UrlFromBytes(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _randomBase64Url(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return _base64UrlFromBytes(bytes);
}

async function _sha256Base64Url(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return _base64UrlFromBytes(new Uint8Array(digest));
}

function _generateOAuthState() {
  return _randomBase64Url(16);
}

export async function startOpenRouterOAuth() {
  const { codeVerifier, codeChallenge } = await generatePKCE();
  const state = _generateOAuthState();
  const stateDigest = await _sha256Base64Url(state);
  const previousProvider = sessionStorage.getItem(OPENROUTER_OAUTH_PREVIOUS_PROVIDER_KEY) || getAIProvider();
  if (_isValidAIProvider(previousProvider)) sessionStorage.setItem(OPENROUTER_OAUTH_PREVIOUS_PROVIDER_KEY, previousProvider);
  sessionStorage.setItem('or_pkce_verifier', codeVerifier);
  sessionStorage.setItem('or_oauth_state', `sha256:${stateDigest}`);
  const callbackUrl = getApiLocationOriginRuntime() + getApiLocationPathnameRuntime();
  setApiLocationHrefRuntime('https://openrouter.ai/auth?callback_url=' + encodeURIComponent(callbackUrl) + '&code_challenge=' + encodeURIComponent(codeChallenge) + '&code_challenge_method=S256&state=' + encodeURIComponent(state));
}

export function rememberOpenRouterOAuthPreviousProvider(provider = getAIProvider()) {
  if (_isValidAIProvider(provider)) sessionStorage.setItem(OPENROUTER_OAUTH_PREVIOUS_PROVIDER_KEY, provider);
}

export function restoreOpenRouterOAuthPreviousProvider() {
  const previousProvider = sessionStorage.getItem(OPENROUTER_OAUTH_PREVIOUS_PROVIDER_KEY);
  sessionStorage.removeItem(OPENROUTER_OAUTH_PREVIOUS_PROVIDER_KEY);
  if (_isValidAIProvider(previousProvider)) setAIProvider(previousProvider);
}

export function clearOpenRouterOAuthSession() {
  sessionStorage.removeItem('or_pkce_verifier');
  sessionStorage.removeItem('or_oauth_state');
  sessionStorage.removeItem(OPENROUTER_OAUTH_PREVIOUS_PROVIDER_KEY);
}

export function hasPendingOpenRouterOAuthSession() {
  return !!(
    sessionStorage.getItem('or_pkce_verifier')
    || sessionStorage.getItem('or_oauth_state')
    || sessionStorage.getItem(OPENROUTER_OAUTH_PREVIOUS_PROVIDER_KEY)
  );
}

export function markOpenRouterOAuthSettingsLocal() {
  markAISettingsLocal();
  sessionStorage.setItem(OPENROUTER_OAUTH_LOCAL_SETTINGS_LOCK_UNTIL_KEY, String(Date.now() + 5 * 60 * 1000));
}

export async function exchangeOpenRouterCode(code, returnedState) {
  const codeVerifier = sessionStorage.getItem('or_pkce_verifier');
  const expectedState = sessionStorage.getItem('or_oauth_state');
  if (!codeVerifier) throw new Error('Missing PKCE verifier. Please try connecting again.');
  const returnedStateDigest = typeof returnedState === 'string'
    ? `sha256:${await _sha256Base64Url(returnedState)}`
    : '';
  const stateMatches = expectedState?.startsWith('sha256:')
    ? returnedStateDigest === expectedState
    : returnedState === expectedState;
  if (expectedState && !stateMatches) {
    sessionStorage.removeItem('or_pkce_verifier');
    sessionStorage.removeItem('or_oauth_state');
    throw new Error('OAuth state mismatch - please try connecting again.');
  }
  const res = await fetch('https://openrouter.ai/api/v1/auth/keys', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'HTTP-Referer': getApiLocationOriginRuntime(),
      'X-Title': 'getbased'
    },
    body: JSON.stringify({ code, code_verifier: codeVerifier, code_challenge_method: 'S256' })
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(errBody?.error?.message || errBody?.message || `OpenRouter auth failed (${res.status})`);
  }
  const data = await res.json();
  sessionStorage.removeItem('or_pkce_verifier');
  sessionStorage.removeItem('or_oauth_state');
  return data.key;
}
