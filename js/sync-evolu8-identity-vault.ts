// Durable browser identity handoff from Evolu 7 to Evolu 8.
//
// The recovery mnemonic stays in IndexedDB. localStorage contains only a
// random, non-secret commit token so identity changes can invalidate the vault
// synchronously before either Evolu generation mutates its durable owner.

export interface EvoluIdentity { ownerId: string; mnemonic: string }
export interface EvoluIdentityStorage {
  getItem?: (key: string) => string | null;
  setItem?: (key: string, value: string) => unknown;
  removeItem?: (key: string) => unknown;
}
interface VaultLockManager {
  request?(name: string, operation: () => Promise<void>): Promise<void>;
}
interface VaultOptions {
  storage?: EvoluIdentityStorage | null;
  indexedDb?: IDBFactory | null;
  tokenFactory?: () => string;
  lockManager?: VaultLockManager | null;
}
interface VaultRecord { version?: unknown; token?: unknown; ownerId?: unknown; mnemonic?: unknown }
type VaultOperation<Result> = (store: IDBObjectStore) => IDBRequest<Result> | void;

export const EVOLU8_IDENTITY_TOKEN_KEY = 'labcharts-sync-evolu8-identity-token';
const DATABASE_NAME = 'getbased-evolu8-identity';
const STORE_NAME = 'identity';
const RECORD_KEY = 'app-owner';
const RECORD_VERSION = 1;
const OPERATION_TIMEOUT_MS = 5_000;

function openVaultDatabase(indexedDb: IDBFactory) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDb.open(DATABASE_NAME, 1);
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(new Error('Evolu 8 identity vault timed out'));
    }, OPERATION_TIMEOUT_MS);
    const finish = (callback: () => void) => {
      if (settled) return false;
      settled = true;
      clearTimeout(timeout);
      callback();
      return true;
    };
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      if (!finish(() => resolve(request.result))) request.result.close();
    };
    request.onerror = () => finish(() => reject(request.error || new Error('Identity vault open failed')));
    request.onblocked = () => finish(() => reject(new Error('Evolu 8 identity vault is blocked')));
  });
}

function runVaultTransaction<Result>(database: IDBDatabase, mode: IDBTransactionMode, operation: VaultOperation<Result>) {
  return new Promise<Result | undefined>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    let result: Result | undefined;
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };
    const timeout = setTimeout(() => {
      try { transaction.abort(); } catch {}
      finish(() => reject(new Error('Evolu 8 identity vault transaction timed out')));
    }, OPERATION_TIMEOUT_MS);
    try {
      const request = operation(transaction.objectStore(STORE_NAME));
      if (request) {
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => {};
      }
    } catch (error) {
      try { transaction.abort(); } catch {}
      finish(() => reject(error));
      return;
    }
    transaction.oncomplete = () => finish(() => resolve(result));
    transaction.onabort = () => finish(() => reject(
      transaction.error || new Error('Evolu 8 identity vault transaction aborted'),
    ));
    transaction.onerror = () => {};
  });
}

async function accessVault<Result>(indexedDb: IDBFactory, mode: IDBTransactionMode, operation: VaultOperation<Result>) {
  const database = (await openVaultDatabase(indexedDb) as IDBDatabase);
  try {
    return await runVaultTransaction(database, mode, operation);
  } finally {
    database.close();
  }
}

function createCommitToken() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
    || `${Date.now()}-${Math.random()}`;
}

function readCommitToken(storage: EvoluIdentityStorage | null | undefined) {
  try { return String(storage?.getItem?.(EVOLU8_IDENTITY_TOKEN_KEY) || ''); } catch { return ''; }
}

export function createEvolu8IdentityVault({
  storage = globalThis.localStorage,
  indexedDb = globalThis.indexedDB,
  tokenFactory = createCommitToken,
  lockManager = globalThis.navigator?.locks,
}: VaultOptions = {}) {
  // Invalidate in-flight work even when the first write has no token yet.
  // Token rechecks also detect changes made by a different vault/context.
  let revision = 0;
  const read = async () => {
    const startedRevision = revision;
    const token = readCommitToken(storage);
    if (!token || !indexedDb) return null;
    try {
      const record = (await accessVault(
        indexedDb,
        'readonly',
        store => store.get(RECORD_KEY),
      ) as VaultRecord | null | undefined);
      if (revision !== startedRevision || readCommitToken(storage) !== token
          || record?.version !== RECORD_VERSION
          || record?.token !== token
          || typeof record?.ownerId !== 'string'
          || !record.ownerId
          || typeof record?.mnemonic !== 'string'
          || !record.mnemonic) return null;
      return { ownerId: record.ownerId, mnemonic: record.mnemonic };
    } catch {
      return null;
    }
  };

  const withWriteLock = (operation: () => Promise<void>) => {
    if (typeof lockManager?.request !== 'function') {
      throw new Error('Evolu 8 identity vault coordination is unavailable');
    }
    return lockManager.request('getbased-evolu8-identity-write', operation);
  };

  const write = async ({ ownerId, mnemonic }: { ownerId: unknown; mnemonic: unknown }) => {
    if (!indexedDb || typeof storage?.setItem !== 'function' || typeof storage?.getItem !== 'function') {
      throw new Error('Evolu 8 identity vault storage is unavailable');
    }
    const publishToken = storage.setItem.bind(storage);
    const readToken = storage.getItem.bind(storage);
    const startedRevision = ++revision;
    return withWriteLock(async () => {
      if (revision !== startedRevision) throw new Error('Evolu 8 identity vault write was invalidated or superseded');
      const previousToken = readCommitToken(storage);
      const token = String(tokenFactory() || '');
      if (!token) throw new Error('Evolu 8 identity vault token is unavailable');
      await accessVault(indexedDb, 'readwrite', store => store.put({
        version: RECORD_VERSION,
        token,
        ownerId: String(ownerId),
        mnemonic: String(mnemonic),
      }, RECORD_KEY));
      if (revision !== startedRevision || readCommitToken(storage) !== previousToken) {
        throw new Error('Evolu 8 identity vault write was invalidated or superseded');
      }
      publishToken(EVOLU8_IDENTITY_TOKEN_KEY, token);
      if (readToken(EVOLU8_IDENTITY_TOKEN_KEY) !== token) {
        throw new Error('Evolu 8 identity vault commit was not retained');
      }
    });
  };

  const invalidate = () => {
    revision += 1;
    if (typeof storage?.removeItem !== 'function' || typeof storage?.getItem !== 'function') {
      throw new Error('Evolu 8 identity vault cannot be invalidated');
    }
    const removeToken = storage.removeItem.bind(storage);
    const readToken = storage.getItem.bind(storage);
    const clearToken = () => {
      removeToken(EVOLU8_IDENTITY_TOKEN_KEY);
      if (readToken(EVOLU8_IDENTITY_TOKEN_KEY) !== null) {
        throw new Error('Evolu 8 identity vault invalidation was not retained');
      }
    };
    clearToken();
    if (!indexedDb) return Promise.resolve();
    return Promise.resolve().then(() => withWriteLock(async () => {
      // A writer ahead of this deletion may have published since the synchronous
      // invalidation. Clear again under the lock before deleting its record.
      clearToken();
      await accessVault(indexedDb, 'readwrite', store => store.delete(RECORD_KEY)).catch(() => {});
    }));
  };

  return { invalidate, read, write };
}
