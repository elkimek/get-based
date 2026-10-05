// tinfoil-secure-fetch.js - Verified EHBP transport with plaintext proxy-error preservation.

import { SecureClient } from '../vendor/tinfoil-browser.js';
import {
  Identity,
  KeyConfigMismatchError,
  PROTOCOL,
  decryptResponseWithToken,
  extractSessionRecoveryToken,
} from '../vendor/ehbp-browser.js';

export interface TinfoilSecureOptions {
  baseUrl: string;
  attestationBundleURL?: string; enclaveURL?: string; configRepo?: string;
}

interface TinfoilClientContext {
  client: SecureClient;
  verification: ReturnType<SecureClient['getVerificationDocument']>;
}
interface NormalizedFetchArgs { url: string; init?: RequestInit | undefined }

const clientCache = new Map<string, Promise<TinfoilClientContext>>();

function normalizeBaseUrl(value: string) {
  return String(value || '').replace(/\/+$/, '');
}

function resolveOptions(options: TinfoilSecureOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  if (!baseUrl) throw new Error('Tinfoil proxy base URL is required');
  return { ...options, baseUrl };
}

function optionsCacheKey(options: TinfoilSecureOptions) {
  return JSON.stringify(resolveOptions(options));
}

/**
 * Force the browser HTTP cache to refresh a custom attestation bundle before
 * re-attesting after an enclave key rotation. SecureClient verifies the bundle
 * again itself; this preflight only prevents its subsequent fetch from reusing
 * the stale response that caused the key-config mismatch.
 */
async function refreshAttestationBundleCache(options: TinfoilSecureOptions) {
  if (!options.attestationBundleURL) return;
  const attestationURL = `${normalizeBaseUrl(options.attestationBundleURL)}/attestation`;
  const response = await fetch(attestationURL, { cache: 'reload' });
  if (!response.ok) {
    throw new Error(`Failed to refresh Tinfoil attestation bundle: HTTP ${response.status}`);
  }
  // Fully consume the response so the browser can commit the refreshed entry.
  await response.arrayBuffer();
}

async function prepareTinfoilClient(options: TinfoilSecureOptions) {
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
      } as ConstructorParameters<typeof SecureClient>[0]);
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

function normalizeFetchArgs(input: RequestInfo | URL, init: RequestInit | undefined): NormalizedFetchArgs {
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

async function isKeyConfigMismatchResponse(response: Response) {
  if (response.status !== 422) return false;
  const mediaType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== PROTOCOL.PROBLEM_JSON_MEDIA_TYPE) return false;
  try {
    const problem = await response.clone().json() as { type?: unknown } | null;
    return problem?.type === PROTOCOL.KEY_CONFIG_PROBLEM_TYPE;
  } catch {
    return false;
  }
}

async function fetchEhbpOnce(context: TinfoilClientContext, options: TinfoilSecureOptions, normalized: NormalizedFetchArgs) {
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
  const requestInit = {
    method: normalized.init?.method || 'GET',
    headers,
    body: normalized.init?.body,
    signal: normalized.init?.signal,
    duplex: 'half',
  } as RequestInit & { duplex?: string };
  const request = new Request(targetUrl.toString(), requestInit);
  const serverIdentity = await Identity.fromPublicKeyHex(context.verification.hpkePublicKey);
  const encrypted = await serverIdentity.encryptRequestWithContext(request);
  const response = await fetch(encrypted.request, { signal: normalized.init?.signal } as RequestInit);

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
 */
export async function createTinfoilSecureFetch(options: TinfoilSecureOptions) {
  const context = await prepareTinfoilClient(options);
  return {
    verification: context.verification,
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
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
