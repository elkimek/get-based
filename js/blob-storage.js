// @ts-check
// blob-storage.js — IndexedDB-backed key/value store for big blobs.
//
// localStorage's typical 5 MB cap is too small for the imported profile
// blob: lab entries + change history + light measurements + audits +
// chat threads + screenshots can collectively grow past it on a long-
// running install. Hitting the cap throws QuotaExceededError on every
// setItem, which silently wedges sync (every saveImportedData throws,
// pushes never write fresh state). IndexedDB has GB-scale quotas and
// no equivalent silent-rejection failure mode.
//
// Scope: ONLY the `*-imported` keys move here, via shouldUseBlob().
// Everything else stays in localStorage where the synchronous read
// API and small payload sizes are a better fit.

import { getErrorMessage } from './caught-error.js';

const DB_NAME = 'labcharts-blobs';
const STORE_NAME = 'kv';
const DB_VERSION = 1;

// Detect IDB availability up-front. Test environments and pre-IDB
// browsers should fall back to plain localStorage so existing read/
// write semantics survive — shouldUseBlob() returns false there.
const _idbAvailable = typeof indexedDB !== 'undefined';

let _dbPromise = null;

function _openDB() {
  if (!_idbAvailable) return Promise.reject(new Error('IndexedDB not available'));
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
  // Reset on failure so the next caller can retry instead of forever
  // returning the same rejected promise.
  _dbPromise.catch(() => { _dbPromise = null; });
  return _dbPromise;
}

export async function getBlob(key) {
  if (!_idbAvailable) return null;
  try {
    const db = await _openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('[blob-storage] getBlob failed:', getErrorMessage(e, e));
    return null;
  }
}

export async function setBlob(key, value) {
  if (!_idbAvailable) throw new Error('IndexedDB not available');
  const db = await _openDB();
  return /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
}

/**
 * Replace a profile blob only if it still matches the value the caller read.
 * IndexedDB serializes read-write transactions, so this remains safe when
 * Navigator Locks is unavailable or another tab writes between shadow
 * validation and commit.
 *
 * @param {string} key
 * @param {string} expectedValue
 * @param {string} nextValue
 * @returns {Promise<void>}
 */
export async function compareAndSetBlob(key, expectedValue, nextValue) {
  if (!shouldUseBlob(key)) throw new Error('Compare-and-set requires an IndexedDB profile blob key.');
  if (typeof expectedValue !== 'string' || typeof nextValue !== 'string') {
    throw new TypeError('Compare-and-set profile values must be strings.');
  }
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    let conflict = false;
    const read = store.get(key);
    read.onsuccess = () => {
      if (read.result !== expectedValue) {
        conflict = true;
        tx.abort();
        return;
      }
      store.put(nextValue, key);
    };
    read.onerror = () => reject(read.error);
    tx.oncomplete = () => resolve();
    tx.onabort = () => {
      if (conflict) {
        const error = /** @type {Error & { code?: string }} */ (
          new Error('Profile data changed before migration commit.')
        );
        error.code = 'blob_conflict';
        reject(error);
      } else {
        reject(tx.error || new Error('Profile blob transaction was aborted.'));
      }
    };
    tx.onerror = () => {};
  });
}

/**
 * @param {string} key
 * @param {{ throwOnError?: boolean }} [options]
 */
export async function deleteBlob(key, options = {}) {
  if (!_idbAvailable) return;
  try {
    const db = await _openDB();
    await /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    }));
  } catch (e) {
    console.warn('[blob-storage] deleteBlob failed:', getErrorMessage(e, e));
    if (options.throwOnError) throw e;
  }
}

export async function getBlobKeys() {
  if (!_idbAvailable) return [];
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAllKeys();
    req.onsuccess = () => resolve((req.result || []).filter(key => typeof key === 'string'));
    req.onerror = () => reject(req.error);
  });
}

// Sum of stored blob sizes — for diagnostics. Walks all keys.
export async function getBlobStorageSize() {
  if (!_idbAvailable) return 0;
  try {
    const db = await _openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        let total = 0;
        for (const v of req.result || []) {
          if (typeof v === 'string') total += v.length;
          else if (v && typeof v.byteLength === 'number') total += v.byteLength;
        }
        resolve(total);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

// Detect which keys should be backed by IDB (vs localStorage).
// Currently: any `*-imported` profile blob and its corrupt-recovery copy.
// Also routed: the legacy pre-profile `labcharts-imported` key from very old
// installs (handled by the same suffix match).
export function shouldUseBlob(key) {
  return _idbAvailable
    && typeof key === 'string'
    && (key.endsWith('-imported') || key.endsWith('-imported-corrupt'));
}
