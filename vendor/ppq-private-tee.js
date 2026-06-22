// @ts-check
// PPQ Private TEE transport wrapper. Lazy-loaded only when PPQ private/ models are used.

import { SecureClient } from './tinfoil-browser.js';

/** @typedef {{ fetch: typeof fetch, verification: any }} PpqPrivateFetch */

let cachedClient = null;
let cachedApiBase = '';
let cachedReady = null;

function normalizeApiBase(apiBase) {
  return (apiBase || 'https://api.ppq.ai').replace(/\/+$/, '');
}

/**
 * Build a verified EHBP fetch for PPQ Private Mode.
 * Tinfoil verifies the enclave first, then encrypts request bodies with HPKE/EHBP.
 * @param {{ apiBase?: string }} opts
 * @returns {Promise<PpqPrivateFetch>}
 */
export async function createPpqPrivateFetch(opts = {}) {
  const apiBase = normalizeApiBase(opts.apiBase);
  if (!cachedClient || cachedApiBase !== apiBase) {
    cachedApiBase = apiBase;
    cachedClient = new SecureClient({
      baseURL: `${apiBase}/private/`,
      attestationBundleURL: `${apiBase}/private`,
      transport: 'ehbp',
    });
    cachedReady = cachedClient.ready();
  }
  try {
    await cachedReady;
  } catch (e) {
    clearPpqPrivateClient();
    throw e;
  }
  return {
    fetch: cachedClient.fetch,
    verification: cachedClient.getVerificationDocument?.() || null,
  };
}

export function clearPpqPrivateClient() {
  try { cachedClient?.reset?.(); } catch {}
  cachedClient = null;
  cachedApiBase = '';
  cachedReady = null;
}
