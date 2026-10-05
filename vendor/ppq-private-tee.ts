// PPQ Private TEE transport wrapper. Lazy-loaded only when PPQ private/ models are used.

import {
  clearTinfoilSecureFetchCache,
  createTinfoilSecureFetch,
} from '../js/tinfoil-secure-fetch.js';

type PpqPrivateFetch = Awaited<ReturnType<typeof createTinfoilSecureFetch>>;

let cachedClient: PpqPrivateFetch | null = null;
let cachedApiBase = '';
let cachedReady: Promise<PpqPrivateFetch> | null = null;

function normalizeApiBase(apiBase: string | undefined) {
  return (apiBase || 'https://api.ppq.ai').replace(/\/+$/, '');
}

/**
 * Build a verified EHBP fetch for PPQ Private Mode.
 * Tinfoil verifies the enclave first, then encrypts request bodies with HPKE/EHBP.
 */
export async function createPpqPrivateFetch(opts: { apiBase?: string } = {}) {
  const apiBase = normalizeApiBase(opts.apiBase);
  if (!cachedClient || cachedApiBase !== apiBase) {
    cachedApiBase = apiBase;
    cachedReady = createTinfoilSecureFetch({
      baseUrl: `${apiBase}/private/`,
      attestationBundleURL: `${apiBase}/private`,
    });
  }
  try {
    cachedClient = await cachedReady!;
  } catch (e) {
    clearPpqPrivateClient();
    throw e;
  }
  return {
    fetch: cachedClient.fetch,
    verification: cachedClient.verification || null,
  };
}

export function clearPpqPrivateClient() {
  clearTinfoilSecureFetchCache();
  cachedClient = null;
  cachedApiBase = '';
  cachedReady = null;
}
