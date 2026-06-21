// @ts-check
// lens-cache.js - in-memory LRU cache for Knowledge Base query envelopes.
import { hashString } from './utils.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 20;
const _cache = new Map(); // key -> { value, at }

function cacheKey(backendKey, topK, profileId, hint) {
  return `${hashString(backendKey)}|${topK}|${profileId}|${hint}`;
}

export function cacheGet(k) {
  const row = _cache.get(k);
  if (!row) return null;
  if (Date.now() - row.at > CACHE_TTL_MS) { _cache.delete(k); return null; }
  _cache.delete(k);
  _cache.set(k, row);
  return row.value;
}

export function cacheSet(k, v) {
  if (_cache.size >= CACHE_MAX) {
    const oldest = _cache.keys().next().value;
    _cache.delete(oldest);
  }
  _cache.set(k, { value: v, at: Date.now() });
}

export function getLensCacheEntry(backendKey, topK, profileId, hint) {
  return cacheGet(cacheKey(backendKey, topK, profileId, hint));
}

export function setLensCacheEntry(backendKey, topK, profileId, hint, value) {
  cacheSet(cacheKey(backendKey, topK, profileId, hint), value);
}

export function clearLensCache() {
  _cache.clear();
}
