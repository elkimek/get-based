// @ts-check
// Durable browser identity handoff from Evolu 7 to Evolu 8.
//
// The recovery mnemonic stays in IndexedDB. localStorage contains only a
// random, non-secret commit token so identity changes can invalidate the vault
// synchronously before either Evolu generation mutates its durable owner.

export const EVOLU8_IDENTITY_TOKEN_KEY = 'labcharts-sync-evolu8-identity-token';
const DATABASE_NAME = 'getbased-evolu8-identity';
const STORE_NAME = 'identity';
const RECORD_KEY = 'app-owner';
const RECORD_VERSION = 1;
const OPERATION_TIMEOUT_MS = 5_000;

/** @param {IDBFactory} indexedDb */
function openVaultDatabase(indexedDb) {
  return new Promise((resolve, reject) => {
    const request = indexedDb.open(DATABASE_NAME, 1);
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      reject(new Error('Evolu 8 identity vault timed out'));
    }, OPERATION_TIMEOUT_MS);
    const finish = (callback) => {
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

/**
 * @param {IDBDatabase} database
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest | void} operation
 */
function runVaultTransaction(database, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    let result;
    let settled = false;
    const finish = (callback) => {
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

/** @param {IDBFactory} indexedDb @param {IDBTransactionMode} mode @param {(store: IDBObjectStore) => IDBRequest | void} operation */
async function accessVault(indexedDb, mode, operation) {
  const database = /** @type {IDBDatabase} */ (await openVaultDatabase(indexedDb));
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

/** @param {Storage | { getItem?: Function }} storage */
function readCommitToken(storage) {
  try { return String(storage?.getItem?.(EVOLU8_IDENTITY_TOKEN_KEY) || ''); } catch { return ''; }
}

/**
 * @param {{
 *   storage?: Storage | { getItem?: Function, setItem?: Function, removeItem?: Function },
 *   indexedDb?: IDBFactory | null,
 *   tokenFactory?: () => string,
 * }} [options]
 */
export function createEvolu8IdentityVault({
  storage = globalThis.localStorage,
  indexedDb = globalThis.indexedDB,
  tokenFactory = createCommitToken,
} = {}) {
  const read = async () => {
    const token = readCommitToken(storage);
    if (!token || !indexedDb) return null;
    try {
      const record = /** @type {any} */ (await accessVault(
        indexedDb,
        'readonly',
        store => store.get(RECORD_KEY),
      ));
      if (record?.version !== RECORD_VERSION
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

  const write = async ({ ownerId, mnemonic }) => {
    if (!indexedDb || typeof storage?.setItem !== 'function' || typeof storage?.getItem !== 'function') {
      throw new Error('Evolu 8 identity vault storage is unavailable');
    }
    const token = String(tokenFactory() || '');
    if (!token) throw new Error('Evolu 8 identity vault token is unavailable');
    await accessVault(indexedDb, 'readwrite', store => store.put({
      version: RECORD_VERSION,
      token,
      ownerId: String(ownerId),
      mnemonic: String(mnemonic),
    }, RECORD_KEY));
    storage.setItem(EVOLU8_IDENTITY_TOKEN_KEY, token);
    if (storage.getItem(EVOLU8_IDENTITY_TOKEN_KEY) !== token) {
      throw new Error('Evolu 8 identity vault commit was not retained');
    }
  };

  const invalidate = () => {
    if (typeof storage?.removeItem !== 'function' || typeof storage?.getItem !== 'function') {
      throw new Error('Evolu 8 identity vault cannot be invalidated');
    }
    storage.removeItem(EVOLU8_IDENTITY_TOKEN_KEY);
    if (storage.getItem(EVOLU8_IDENTITY_TOKEN_KEY) !== null) {
      throw new Error('Evolu 8 identity vault invalidation was not retained');
    }
    if (!indexedDb) return Promise.resolve();
    return accessVault(indexedDb, 'readwrite', store => store.delete(RECORD_KEY)).catch(() => {});
  };

  return { invalidate, read, write };
}
