// @ts-check
// cycle-store.js - L1 IndexedDB for raw menstrual-cycle observations.
//
// Per-profile database so local raw cycle history does not leak across
// profiles. Raw daily observations stay on-device; the compact
// importedData.menstrualCycle model is the synced layer.
//
// Daily row shape:
//   { source, date, importId?, bleeding?, symptoms?, bbtC?, cervicalMucus?,
//     ovulationTest?, note?, importedAt }
//
// Compound key [source, date]. Source-level imports can be removed without
// touching manual cycle profile fields in importedData.

const DB_PREFIX = 'labcharts-cycle-';
const DB_VERSION = 1;
const STORE_DAILY = 'daily-observations';
const STORE_IMPORTS = 'imports';
const STORE_META = 'meta';

const _dbPromises = new Map();

function dbNameFor(profileId) {
  return DB_PREFIX + (profileId || 'default');
}

export function openCycleDB(profileId) {
  const name = dbNameFor(profileId);
  if (_dbPromises.has(name)) return _dbPromises.get(name);
  const p = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_DAILY)) {
        const store = db.createObjectStore(STORE_DAILY, { keyPath: ['source', 'date'] });
        store.createIndex('by_source', 'source', { unique: false });
        store.createIndex('by_date', 'date', { unique: false });
        store.createIndex('by_import', 'importId', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_IMPORTS)) {
        const imports = db.createObjectStore(STORE_IMPORTS, { keyPath: 'importId' });
        imports.createIndex('by_source', 'source', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'k' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); resetCycleDB(profileId); };
      resolve(db);
    };
    req.onerror = () => { _dbPromises.delete(name); reject(req.error); };
  });
  _dbPromises.set(name, p);
  return p;
}

export function resetCycleDB(profileId) {
  _dbPromises.delete(dbNameFor(profileId));
}

function txPromise(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

async function _encryptRowIfEnabled(row) {
  let crypto;
  try { crypto = await import('./crypto.js'); } catch { return row; }
  if (!crypto.getEncryptionEnabled?.()) return row;
  const { source, date, importId, _payload, ...rest } = row;
  if (_payload?._enc === 'v1') return row;
  const env = await crypto.encryptObject(rest);
  if (!env) {
    const e = new Error('Cycle storage is encrypted; unlock with your passphrase before importing cycle data.');
    /** @type {Error & { code?: string }} */ (e).code = 'session-locked';
    throw e;
  }
  return importId
    ? { source, date, importId, _payload: env }
    : { source, date, _payload: env };
}

async function _decryptRowIfWrapped(row) {
  if (!row || !row._payload) return row;
  let crypto;
  try { crypto = await import('./crypto.js'); } catch { return null; }
  if (!crypto.isEncryptedObject?.(row._payload)) return row;
  const decrypted = await crypto.decryptObject(row._payload).catch(() => null);
  if (!decrypted) return null;
  return {
    source: row.source,
    date: row.date,
    ...(row.importId ? { importId: row.importId } : {}),
    ...decrypted,
  };
}

async function _encryptImportMetaIfEnabled(meta) {
  let crypto;
  try { crypto = await import('./crypto.js'); } catch { return meta; }
  if (!crypto.getEncryptionEnabled?.()) return meta;
  const { importId, source, _payload, ...rest } = meta;
  if (_payload?._enc === 'v1') return meta;
  const env = await crypto.encryptObject(rest);
  if (!env) {
    const e = new Error('Cycle storage is encrypted; unlock with your passphrase before importing cycle data.');
    /** @type {Error & { code?: string }} */ (e).code = 'session-locked';
    throw e;
  }
  return { importId, source, _payload: env };
}

async function _decryptImportMetaIfWrapped(meta) {
  if (!meta || !meta._payload) return meta;
  let crypto;
  try { crypto = await import('./crypto.js'); } catch { return null; }
  if (!crypto.isEncryptedObject?.(meta._payload)) return meta;
  const decrypted = await crypto.decryptObject(meta._payload).catch(() => null);
  if (!decrypted) return null;
  return { importId: meta.importId, source: meta.source, ...decrypted };
}

function cleanRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter(row => row && row.source && row.date);
}

export async function upsertCycleObservation(profileId, row) {
  if (!row || !row.source || !row.date) throw new Error('upsertCycleObservation requires {source, date}');
  const stamped = { importedAt: Date.now(), ...row };
  const towrite = await _encryptRowIfEnabled(stamped);
  const db = await openCycleDB(profileId);
  const tx = db.transaction(STORE_DAILY, 'readwrite');
  tx.objectStore(STORE_DAILY).put(towrite);
  return txPromise(tx);
}

export async function upsertCycleObservationBatch(profileId, rows) {
  const cleaned = cleanRows(rows);
  if (cleaned.length === 0) return;
  const stamp = Date.now();
  const towrite = [];
  for (const row of cleaned) {
    towrite.push(await _encryptRowIfEnabled({ importedAt: stamp, ...row }));
  }
  const db = await openCycleDB(profileId);
  const tx = db.transaction(STORE_DAILY, 'readwrite');
  const store = tx.objectStore(STORE_DAILY);
  for (const row of towrite) store.put(row);
  return txPromise(tx);
}

export async function getCycleObservation(profileId, source, date) {
  const db = await openCycleDB(profileId);
  const raw = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DAILY, 'readonly');
    const req = tx.objectStore(STORE_DAILY).get([source, date]);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  return raw ? _decryptRowIfWrapped(raw) : null;
}

export async function getCycleObservationRange(profileId, source, startDate, endDate) {
  const db = await openCycleDB(profileId);
  const raws = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DAILY, 'readonly');
    const store = tx.objectStore(STORE_DAILY);
    const keyRange = IDBKeyRange.bound([source, startDate], [source, endDate]);
    const rows = [];
    const req = store.openCursor(keyRange);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        rows.push(cursor.value);
        cursor.continue();
      } else {
        resolve(rows);
      }
    };
    req.onerror = () => reject(req.error);
  });
  const decrypted = await Promise.all(raws.map(row => _decryptRowIfWrapped(row)));
  return decrypted.filter(row => row !== null);
}

export async function getCycleObservationRangeRaw(profileId, source, startDate, endDate) {
  const db = await openCycleDB(profileId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DAILY, 'readonly');
    const store = tx.objectStore(STORE_DAILY);
    const keyRange = IDBKeyRange.bound([source, startDate], [source, endDate]);
    const rows = [];
    const req = store.openCursor(keyRange);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        rows.push(cursor.value);
        cursor.continue();
      } else {
        resolve(rows);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getAllCycleObservationsRaw(profileId) {
  const db = await openCycleDB(profileId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DAILY, 'readonly');
    const rows = [];
    const req = tx.objectStore(STORE_DAILY).openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        rows.push(cursor.value);
        cursor.continue();
      } else {
        resolve(rows);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

export async function upsertCycleObservationBatchRaw(profileId, rows) {
  const cleaned = cleanRows(rows);
  if (cleaned.length === 0) return;
  const db = await openCycleDB(profileId);
  const tx = db.transaction(STORE_DAILY, 'readwrite');
  const store = tx.objectStore(STORE_DAILY);
  for (const row of cleaned) store.put(row);
  return txPromise(tx);
}

export async function countCycleSource(profileId, source) {
  const db = await openCycleDB(profileId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DAILY, 'readonly');
    const req = tx.objectStore(STORE_DAILY).index('by_source').count(IDBKeyRange.only(source));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function clearCycleSource(profileId, source) {
  const db = await openCycleDB(profileId);
  const tx = db.transaction([STORE_DAILY, STORE_IMPORTS], 'readwrite');
  const dailyIdx = tx.objectStore(STORE_DAILY).index('by_source');
  const importIdx = tx.objectStore(STORE_IMPORTS).index('by_source');
  const dailyReq = dailyIdx.openCursor(IDBKeyRange.only(source));
  dailyReq.onsuccess = () => {
    const cursor = dailyReq.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
  const importReq = importIdx.openCursor(IDBKeyRange.only(source));
  importReq.onsuccess = () => {
    const cursor = importReq.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
  return txPromise(tx);
}

export async function clearCycleImport(profileId, importId) {
  const db = await openCycleDB(profileId);
  const tx = db.transaction([STORE_DAILY, STORE_IMPORTS], 'readwrite');
  const dailyIdx = tx.objectStore(STORE_DAILY).index('by_import');
  const req = dailyIdx.openCursor(IDBKeyRange.only(importId));
  req.onsuccess = () => {
    const cursor = req.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
  tx.objectStore(STORE_IMPORTS).delete(importId);
  return txPromise(tx);
}

export async function saveCycleImportMeta(profileId, meta) {
  if (!meta || !meta.importId) throw new Error('saveCycleImportMeta requires importId');
  const towrite = await _encryptImportMetaIfEnabled({ importedAt: new Date().toISOString(), ...meta });
  const db = await openCycleDB(profileId);
  const tx = db.transaction(STORE_IMPORTS, 'readwrite');
  tx.objectStore(STORE_IMPORTS).put(towrite);
  return txPromise(tx);
}

export async function getCycleImportMetaRaw(profileId, importId) {
  const db = await openCycleDB(profileId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMPORTS, 'readonly');
    const req = tx.objectStore(STORE_IMPORTS).get(importId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllCycleImportMetaRaw(profileId) {
  const db = await openCycleDB(profileId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_IMPORTS, 'readonly');
    const req = tx.objectStore(STORE_IMPORTS).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function upsertCycleImportMetaBatchRaw(profileId, rows) {
  const cleaned = (Array.isArray(rows) ? rows : []).filter(row => row?.importId && row?.source);
  if (cleaned.length === 0) return;
  const db = await openCycleDB(profileId);
  const tx = db.transaction(STORE_IMPORTS, 'readwrite');
  const store = tx.objectStore(STORE_IMPORTS);
  for (const row of cleaned) store.put(row);
  return txPromise(tx);
}

export async function getCycleImportMeta(profileId, importId) {
  const raw = await getCycleImportMetaRaw(profileId, importId);
  return raw ? _decryptImportMetaIfWrapped(raw) : null;
}

export async function getCycleMeta(profileId, key) {
  const db = await openCycleDB(profileId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.v : null);
    req.onerror = () => reject(req.error);
  });
}

export async function setCycleMeta(profileId, key, value) {
  const db = await openCycleDB(profileId);
  const tx = db.transaction(STORE_META, 'readwrite');
  tx.objectStore(STORE_META).put({ k: key, v: value, updatedAt: Date.now() });
  return txPromise(tx);
}

export async function deleteCycleMeta(profileId, key) {
  const db = await openCycleDB(profileId);
  const tx = db.transaction(STORE_META, 'readwrite');
  tx.objectStore(STORE_META).delete(key);
  return txPromise(tx);
}

export async function clearCycleDB(profileId) {
  const db = await openCycleDB(profileId);
  const tx = db.transaction([STORE_DAILY, STORE_IMPORTS, STORE_META], 'readwrite');
  tx.objectStore(STORE_DAILY).clear();
  tx.objectStore(STORE_IMPORTS).clear();
  tx.objectStore(STORE_META).clear();
  return txPromise(tx);
}

export async function deleteCycleDB(profileId) {
  const name = dbNameFor(profileId);
  const cached = _dbPromises.get(name);
  if (cached) {
    try { (await cached)?.close?.(); } catch {}
  }
  resetCycleDB(profileId);
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Cycle data deletion is blocked by another open tab. Close it and try again.'));
  });
}
