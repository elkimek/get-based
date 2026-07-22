// @ts-check
// crypto-key-cache.js - synchronous access to decrypted in-memory secrets.

const keyCache = new Map();

export function clearKeyCache() {
  keyCache.clear();
}

export function getCachedKey(storageKey) {
  if (keyCache.has(storageKey)) return keyCache.get(storageKey);
  // Fallback: raw localStorage when encryption is off or the cache has not
  // been populated yet.
  return localStorage.getItem(storageKey);
}

export function updateKeyCache(storageKey, value) {
  // Empty string is a meaningful cached tombstone for encrypted provider keys:
  // without it, getCachedKey() falls back to the on-disk `v1:` wrapper and can
  // mistake encrypted emptiness for a usable credential.
  if (value !== null && value !== undefined) keyCache.set(storageKey, value);
  else keyCache.delete(storageKey);
}
