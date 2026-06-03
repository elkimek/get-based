// nclp-client.js — small public NČLP JSON client.
// Network calls stay opt-in; tests use nclp-resolver fixtures/helpers.

import { normalizeNclpSearchItem, pickPreferredNclpCandidates } from './nclp-resolver.js';

export const NCLP_BASE_URL = 'https://www.nclp.cz';

export async function searchNclp(query, opts = {}) {
  const baseUrl = opts.baseUrl || NCLP_BASE_URL;
  const fetchImpl = opts.fetch || globalThis.fetch;
  if (!fetchImpl) throw new Error('fetch is not available');
  const url = new URL('/api/v1/nationallaboratoryitems/search', baseUrl);
  url.searchParams.set('query', query);
  const resp = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: opts.signal });
  if (!resp.ok) throw new Error(`NČLP search returned ${resp.status}`);
  const data = await resp.json();
  return {
    items: (data.items || []).map(normalizeNclpSearchItem),
    totalCount: data.totalCount || 0,
  };
}

export async function resolveNclpForMarker(markerKey, query, opts = {}) {
  const result = await searchNclp(query, opts);
  return pickPreferredNclpCandidates(markerKey, result.items);
}
