// nclp-client.js — small public NČLP JSON client.
// Network calls stay opt-in; tests use nclp-resolver fixtures/helpers.

import { normalizeNclpSearchItem, pickPreferredNclpCandidates } from './nclp-resolver.js';

export const NCLP_BASE_URL = 'https://www.nclp.cz';
export const NCLP_BROWSER_PROXY_URL = '/api/proxy';

function isBrowserRuntime() {
  return typeof window !== 'undefined' && typeof window.location !== 'undefined';
}

function buildNclpSearchUrl(query, baseUrl = NCLP_BASE_URL) {
  const url = new URL('/api/v1/nationallaboratoryitems/search', baseUrl);
  url.searchParams.set('query', query);
  return url;
}

async function fetchNclpSearchJson(fetchImpl, url, opts = {}) {
  // NČLP does not expose Access-Control-Allow-Origin, so browser callers must
  // use the same-origin proxy. Node/test callers keep the direct URL by default
  // unless opts.proxyUrl is explicitly provided.
  if ((opts.proxyUrl || (!opts.baseUrl && isBrowserRuntime())) && !opts.direct) {
    const proxyUrl = opts.proxyUrl || NCLP_BROWSER_PROXY_URL;
    const resp = await fetchImpl(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: opts.signal,
      body: JSON.stringify({
        url: String(url),
        method: 'GET',
        headers: { Accept: 'application/json' },
      }),
    });
    if (!resp.ok) throw new Error(`NČLP proxy search returned ${resp.status}`);
    return resp.json();
  }

  const resp = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: opts.signal });
  if (!resp.ok) throw new Error(`NČLP search returned ${resp.status}`);
  return resp.json();
}

export async function searchNclp(query, opts = {}) {
  const baseUrl = opts.baseUrl || NCLP_BASE_URL;
  const fetchImpl = opts.fetch || globalThis.fetch;
  if (!fetchImpl) throw new Error('fetch is not available');
  const url = buildNclpSearchUrl(query, baseUrl);
  const data = await fetchNclpSearchJson(fetchImpl, url, opts);
  return {
    items: (data.items || []).map(normalizeNclpSearchItem),
    totalCount: data.totalCount || 0,
  };
}

export async function resolveNclpForMarker(markerKey, query, opts = {}) {
  const result = await searchNclp(query, opts);
  return pickPreferredNclpCandidates(markerKey, result.items);
}
