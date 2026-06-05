// nclp-cache.js — cached dynamic NČLP lookup for explicit lab-plan/order flows.
// This complements curated marker-crosswalk seeds. It must not imply provider coverage.

import { searchNclp } from './nclp-client.js';
import { getExternalIdsForMarker } from './marker-crosswalk.js';
import { LAB_STANDARDS } from './standards-types.js';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeNclpQuery(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function createMemoryNclpCache(seed = new Map()) {
  const store = seed instanceof Map ? seed : new Map(Object.entries(seed || {}));
  return {
    get(key) { return store.get(key) || null; },
    set(key, value) { store.set(key, value); return value; },
    clear() { store.clear(); },
    entries() { return [...store.entries()]; },
  };
}

function safeParseCache(raw) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function createPersistentNclpCache(opts = {}) {
  const namespace = opts.namespace || 'getbased.nclpCache.v1';
  const storage = opts.storage || globalThis.localStorage || null;
  if (!storage) return createMemoryNclpCache();

  function readStore() {
    return safeParseCache(storage.getItem(namespace));
  }

  function writeStore(value) {
    try {
      storage.setItem(namespace, JSON.stringify(value));
    } catch {
      // Storage may be full/private-mode blocked. Keep lookup non-fatal.
    }
  }

  let memoryStore = readStore();

  return {
    get(key) { return memoryStore[key] || null; },
    set(key, value) {
      memoryStore = { ...memoryStore, [key]: value };
      writeStore({ ...readStore(), ...memoryStore });
      return value;
    },
    clear() {
      memoryStore = {};
      try { storage.removeItem(namespace); } catch { /* ignore */ }
    },
    entries() { return Object.entries(memoryStore); },
  };
}

function markerLookupText(marker) {
  return marker?.displayName || String(marker?.markerKey || '').replace(/^unmapped\./, '').replace(/[_.-]+/g, ' ');
}

function isCacheFresh(entry, now, ttlMs) {
  if (!entry?.fetchedAt) return false;
  const fetchedAt = Date.parse(entry.fetchedAt);
  return Number.isFinite(fetchedAt) && (now - fetchedAt) <= ttlMs;
}

function candidateStatus(candidates) {
  if (!candidates?.length) return 'no_nclp_match';
  if (candidates.length === 1) return 'live_exact_candidate';
  return candidates[0].score > candidates[1].score ? 'live_exact_candidate' : 'live_ambiguous';
}

function publicCandidate(candidate) {
  return {
    country: candidate.country,
    standard: candidate.standard,
    code: candidate.code,
    uuid: candidate.uuid,
    name: candidate.name,
    component: candidate.component,
    system: candidate.system,
    unit: candidate.unit,
    procedure: candidate.procedure,
    validity: candidate.validity,
    score: candidate.score,
    matchedBy: candidate.matchedBy,
    relation: candidate.relation,
  };
}

export async function resolveNclpCandidatesForMarker(marker, opts = {}) {
  const curated = getExternalIdsForMarker(marker?.markerKey, LAB_STANDARDS.NCLP);
  if (curated.length) {
    return {
      status: 'reviewed_exact',
      candidates: curated.map((id, index) => ({
        country: 'CZ',
        standard: LAB_STANDARDS.NCLP,
        code: id.code,
        system: id.system ? { code: id.system, name: id.system } : null,
        unit: id.unit || '',
        procedure: id.procedure ? { code: id.procedure, name: id.procedure } : null,
        validity: null,
        score: 100 - index,
        matchedBy: 'crosswalk',
        relation: id.relation,
        note: id.note || '',
      })),
      source: 'crosswalk',
      cacheKey: null,
    };
  }

  const query = markerLookupText(marker);
  const normalizedQuery = normalizeNclpQuery(query);
  if (!normalizedQuery) return { status: 'no_nclp_match', candidates: [], source: 'empty_query', cacheKey: null };

  const cache = opts.cache || createMemoryNclpCache();
  const now = opts.now || Date.now();
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const cacheKey = `CZ:NCLP:${normalizedQuery}`;
  const cached = cache.get(cacheKey);
  if (isCacheFresh(cached, now, ttlMs)) {
    return { status: cached.status, candidates: cached.candidates || [], source: 'cache', cacheKey };
  }

  const result = await searchNclp(query, opts);
  const candidates = (result.items || [])
    .filter(item => item.validity === 'Valid' || item.validity == null)
    .map((item, index) => ({ ...item, score: item.score ?? Math.max(1, 25 - index), matchedBy: item.matchedBy || 'search', relation: item.relation || 'unknown' }))
    .sort((a, b) => b.score - a.score || String(a.code).localeCompare(String(b.code)))
    .slice(0, opts.limit || 5)
    .map(publicCandidate);
  const status = candidateStatus(candidates);
  cache.set(cacheKey, {
    status,
    query,
    normalizedQuery,
    fetchedAt: new Date(now).toISOString(),
    candidates,
  });
  return { status, candidates, source: 'live', cacheKey };
}

export async function enrichMarkersWithNclpCandidates(markers = [], opts = {}) {
  const cache = opts.cache || createMemoryNclpCache();
  const validMarkers = (markers || []).filter(marker => marker?.markerKey);
  const concurrency = Math.max(1, Math.min(Number(opts.concurrency || opts.maxConcurrency || 6) || 6, validMarkers.length || 1));
  const resolved = new Array(validMarkers.length);
  let nextIndex = 0;

  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (nextIndex < validMarkers.length) {
      const index = nextIndex;
      nextIndex += 1;
      resolved[index] = await resolveNclpCandidatesForMarker(validMarkers[index], { ...opts, cache });
    }
  }));

  return validMarkers.map((marker, index) => ({
    ...marker,
    nclpStatus: resolved[index].status,
    nclpSource: resolved[index].source,
    nclpCacheKey: resolved[index].cacheKey,
    nclpCandidates: resolved[index].candidates,
  }));
}
