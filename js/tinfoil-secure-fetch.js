// @ts-check
// tinfoil-secure-fetch.js - Verified EHBP transport with plaintext proxy-error preservation.

import { SecureClient } from '../vendor/tinfoil-browser.js';
import {
  Identity,
  KeyConfigMismatchError,
  PROTOCOL,
  decryptResponseWithToken,
  extractSessionRecoveryToken,
} from '../vendor/ehbp-browser.js';

/** @typedef {{
 *   baseUrl: string,
 *   attestationBundleURL?: string,
 *   enclaveURL?: string,
 *   configRepo?: string,
 * }} TinfoilSecureOptions */

/** @typedef {{ client: any, verification: any }} TinfoilClientContext */

/** @type {Map<string, Promise<TinfoilClientContext>>} */
const clientCache = new Map();

/** @param {string} value */
function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

/** @param {TinfoilSecureOptions} options */
function resolveOptions(options) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  if (!baseUrl) throw new Error('Tinfoil proxy base URL is required');
  return { ...options, baseUrl };
}

/** @param {TinfoilSecureOptions} options */
function optionsCacheKey(options) {
  return JSON.stringify(resolveOptions(options));
}

/**
 * Force the browser HTTP cache to refresh a custom attestation bundle before
 * re-attesting after an enclave key rotation. SecureClient verifies the bundle
 * again itself; this preflight only prevents its subsequent fetch from reusing
 * the stale response that caused the key-config mismatch.
 * @param {TinfoilSecureOptions} options
 */
async function refreshAttestationBundleCache(options) {
  if (!options.attestationBundleURL) return;
  const attestationURL = `${normalizeBaseUrl(options.attestationBundleURL)}/attestation`;
  const response = await fetch(attestationURL, { cache: 'reload' });
  if (!response.ok) {
    throw new Error(`Failed to refresh Tinfoil attestation bundle: HTTP ${response.status}`);
  }
  // Fully consume the response so the browser can commit the refreshed entry.
  await response.arrayBuffer();
}

/** @param {TinfoilSecureOptions} options */
async function prepareTinfoilClient(options) {
  const resolved = resolveOptions(options);
  const key = optionsCacheKey(resolved);
  let pending = clientCache.get(key);
  if (!pending) {
    pending = (async () => {
      const client = new SecureClient({
        baseURL: resolved.baseUrl,
        attestationBundleURL: resolved.attestationBundleURL,
        enclaveURL: resolved.enclaveURL,
        configRepo: resolved.configRepo,
        transport: 'ehbp',
      });
      await client.ready();
      const verification = client.getVerificationDocument();
      if (!verification?.securityVerified || !verification?.hpkePublicKey) {
        throw new Error('Tinfoil attestation did not produce a verified EHBP key');
      }
      return { client, verification };
    })();
    clientCache.set(key, pending);
  }
  try {
    return await pending;
  } catch (error) {
    clientCache.delete(key);
    throw error;
  }
}

/**
 * @param {RequestInfo | URL} input
 * @param {RequestInit | undefined} init
 */
function normalizeFetchArgs(input, init) {
  if (typeof input === 'string') return { url: input, init };
  if (input instanceof URL) return { url: input.toString(), init };
  const cloned = input.clone();
  return {
    url: cloned.url,
    init: {
      method: cloned.method,
      headers: new Headers(cloned.headers),
      body: cloned.body,
      signal: cloned.signal,
      ...init,
    },
  };
}

/** @param {Response} response */
async function isKeyConfigMismatchResponse(response) {
  if (response.status !== 422) return false;
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== PROTOCOL.PROBLEM_JSON_MEDIA_TYPE) return false;
  try {
    const problem = await response.clone().json();
    return problem?.type === PROTOCOL.KEY_CONFIG_PROBLEM_TYPE;
  } catch {
    return false;
  }
}

/**
 * @param {TinfoilClientContext} context
 * @param {TinfoilSecureOptions} options
 * @param {{url: string, init?: RequestInit}} normalized
 */
async function fetchEhbpOnce(context, options, normalized) {
  const resolved = resolveOptions(options);
  const baseURL = context.client.getBaseURL?.() || resolved.baseUrl;
  const enclaveURL = context.client.getEnclaveURL?.() || '';
  const baseOrigin = new URL(baseURL).origin;
  const allowedOrigins = new Set([baseOrigin]);
  if (enclaveURL) allowedOrigins.add(new URL(enclaveURL).origin);

  const targetUrl = new URL(normalized.url, baseURL);
  if (!allowedOrigins.has(targetUrl.origin)) {
    throw new Error(`Refusing Tinfoil request to unverified origin ${targetUrl.origin}`);
  }

  const headers = new Headers(normalized.init?.headers);
  if (enclaveURL && new URL(enclaveURL).origin !== baseOrigin) {
    headers.set('X-Tinfoil-Enclave-Url', enclaveURL);
  }
  const requestInit = /** @type {RequestInit & {duplex?: string}} */ ({
    method: normalized.init?.method || 'GET',
    headers,
    body: normalized.init?.body,
    signal: normalized.init?.signal,
    duplex: 'half',
  });
  const request = new Request(targetUrl.toString(), requestInit);
  const serverIdentity = await Identity.fromPublicKeyHex(context.verification.hpkePublicKey);
  const encrypted = await serverIdentity.encryptRequestWithContext(request);
  const response = await fetch(encrypted.request, { signal: normalized.init?.signal });

  if (await isKeyConfigMismatchResponse(response)) {
    throw new KeyConfigMismatchError('EHBP key configuration mismatch');
  }
  if (!encrypted.context) return response;
  if (!response.headers.get(PROTOCOL.RESPONSE_NONCE_HEADER)) {
    if (response.status >= 400) return response;
    throw new Error(`Missing ${PROTOCOL.RESPONSE_NONCE_HEADER} on successful Tinfoil response`);
  }
  const token = await extractSessionRecoveryToken(encrypted.context);
  return decryptResponseWithToken(response, token);
}

/**
 * Attest a Tinfoil enclave and return an EHBP fetch bound to the verified proxy/enclave origins.
 * Plaintext proxy-side errors are returned unchanged because only the enclave can encrypt replies.
 * @param {TinfoilSecureOptions} options
 */
export async function createTinfoilSecureFetch(options) {
  const context = await prepareTinfoilClient(options);
  return {
    verification: context.verification,
    /** @param {RequestInfo | URL} input @param {RequestInit} [init] */
    fetch: async (input, init) => {
      const normalized = normalizeFetchArgs(input, init);
      try {
        return await fetchEhbpOnce(context, options, normalized);
      } catch (error) {
        if (!(error instanceof KeyConfigMismatchError)) throw error;
        await refreshAttestationBundleCache(options);
        context.client.reset();
        try {
          await context.client.ready();
          context.verification = context.client.getVerificationDocument();
          if (!context.verification?.securityVerified || !context.verification?.hpkePublicKey) {
            throw new Error('Tinfoil re-attestation did not produce a verified EHBP key');
          }
        } catch (reattestError) {
          clientCache.delete(optionsCacheKey(options));
          throw reattestError;
        }
        try {
          return await fetchEhbpOnce(context, options, normalized);
        } catch (retryError) {
          if (retryError instanceof KeyConfigMismatchError) {
            clientCache.delete(optionsCacheKey(options));
            context.client.reset();
          }
          throw retryError;
        }
      }
    },
  };
}

export function clearTinfoilSecureFetchCache() {
  for (const pending of clientCache.values()) {
    pending.then(context => context.client.reset?.()).catch(() => {});
  }
  clientCache.clear();
}
