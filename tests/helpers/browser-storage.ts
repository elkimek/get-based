// Shared storage shim for standalone Node suites and Vitest setup.
function _makeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  };
}
// Node 22+ may expose a built-in localStorage that is unusable when
// --localstorage-file is missing (empty object, no getItem, or a getter
// that throws on access). Prefer our in-memory shim whenever the Storage
// API is absent or throws.
function _readGlobalStorage(name: 'localStorage' | 'sessionStorage'): Partial<Storage> | null {
  try {
    return globalThis[name];
  } catch {
    return null;
  }
}
function _needsStorageShim(storage: Partial<Storage> | null): boolean {
  if (!storage) return true;
  try {
    if (
      typeof storage.getItem !== 'function' ||
      typeof storage.setItem !== 'function' ||
      typeof storage.removeItem !== 'function' ||
      typeof storage.clear !== 'function' ||
      typeof storage.key !== 'function'
    ) {
      return true;
    }
    storage.getItem('__storage_shim_probe__');
    return false;
  } catch {
    return true;
  }
}
function _installStorageShim(name: 'localStorage' | 'sessionStorage'): void {
  const shim = _makeStorage();
  const replacement = {
    configurable: true,
    writable: true,
    enumerable: true,
    value: shim,
  };
  try {
    Object.defineProperty(globalThis, name, replacement);
    return;
  } catch {
    // Accessor-only or non-configurable properties reject defineProperty
    // in some engines; fall through to assignment when allowed.
  }
  try {
    globalThis[name] = shim;
  } catch {
    // Non-configurable accessor — native storage cannot be replaced.
  }
}
export function ensureBrowserStorage(name: 'localStorage' | 'sessionStorage'): void {
  if (!_needsStorageShim(_readGlobalStorage(name))) return;
  _installStorageShim(name);
}
