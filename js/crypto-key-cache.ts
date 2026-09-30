// crypto-key-cache.js - synchronous access to decrypted in-memory secrets.

const keyCache = new Map<string, string>();

export function clearKeyCache() {
  keyCache.clear();
}

export function getCachedKey(storageKey: string): string | null {
  if (keyCache.has(storageKey)) return keyCache.get(storageKey)!;
  // Legacy plaintext values remain readable until startup migrates them.
  // Never expose an at-rest envelope as though it were a usable credential.
  const raw = localStorage.getItem(storageKey);
  return raw?.startsWith('v1:') || raw?.startsWith('d1:') ? null : raw;
}

export function updateKeyCache(storageKey: string, value: string | null | undefined): void {
  // Empty string is a meaningful cached tombstone for encrypted provider keys:
  // without it, getCachedKey() falls back to the on-disk `v1:` wrapper and can
  // mistake encrypted emptiness for a usable credential.
  if (value !== null && value !== undefined) keyCache.set(storageKey, value);
  else keyCache.delete(storageKey);
}
