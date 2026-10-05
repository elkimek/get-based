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
// Compound key [source, date, importId]. Keeping each import batch distinct
// lets users remove a re-import without losing the earlier local observation.

import { transactionCompletion as txPromise } from './transaction-completion.js';
import type { PassphraseEnvelope, WearablesStoreCryptoDeps } from './wearable-storage-types.js';

export type CycleStoreCryptoDeps = WearablesStoreCryptoDeps;
export interface StoredCycleObservation extends Record<string, unknown> {
  source: string;
  date: string;
  importId?: unknown;
  importedAt?: unknown;
  _payload?: PassphraseEnvelope | null;
}
export interface StoredCycleImportMeta extends Record<string, unknown> {
  importId: string;
  source: string;
  importedAt?: unknown;
  _payload?: PassphraseEnvelope | null;
}

const DB_PREFIX = 'labcharts-cycle-';
const DB_VERSION = 2;
const STORE_DAILY = 'daily-observations';
const STORE_IMPORTS = 'imports';
const STORE_META = 'meta';

const _dbPromises = new Map<string, Promise<IDBDatabase>>();

const cycleStoreCryptoDeps: CycleStoreCryptoDeps = {
  getEncryptionEnabled: () => {
    try { return localStorage.getItem('labcharts-encryption-enabled') === 'true'; } catch { return false; }
  },
  encryptObject: async () => null,
  isEncryptedObject: value => !!(value && typeof value === 'object' && (value as PassphraseEnvelope)._enc === 'v1'),
  decryptObject: async () => null,
};

export function configureCycleStoreCrypto(deps: Partial<CycleStoreCryptoDeps> = {}) {
  const previous = { ...cycleStoreCryptoDeps };
  if (typeof deps.getEncryptionEnabled === 'function') cycleStoreCryptoDeps.getEncryptionEnabled = deps.getEncryptionEnabled;
  if (typeof deps.encryptObject === 'function') cycleStoreCryptoDeps.encryptObject = deps.encryptObject;
  if (typeof deps.isEncryptedObject === 'function') cycleStoreCryptoDeps.isEncryptedObject = deps.isEncryptedObject;
  if (typeof deps.decryptObject === 'function') cycleStoreCryptoDeps.decryptObject = deps.decryptObject;
  return previous;
}

function dbNameFor(profileId: string | null | undefined) {
  return DB_PREFIX + (profileId || 'default');
}

function withObservationIdentity(row: StoredCycleObservation): StoredCycleObservation {
  if (!row || typeof row !== 'object') return row;
  const importId = String(row.importId || '').trim() || `legacy:${row.date || 'unknown'}`;
  return row.importId === importId ? row : { ...row, importId };
}

function createDailyStore(db: IDBDatabase) {
  const store = db.createObjectStore(STORE_DAILY, { keyPath: ['source', 'date', 'importId'] });
  store.createIndex('by_source', 'source', { unique: false });
  store.createIndex('by_source_date', ['source', 'date'], { unique: false });
  store.createIndex('by_date', 'date', { unique: false });
  store.createIndex('by_import', 'importId', { unique: false });
  return store;
}

export function openCycleDB(profileId: string | null | undefined): Promise<IDBDatabase> {
  const name = dbNameFor(profileId);
  if (_dbPromises.has(name)) return _dbPromises.get(name)!;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = event => {
      const db = req.result;
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
      if (oldVersion < 2 && db.objectStoreNames.contains(STORE_DAILY)) {
        const upgradeTx = req.transaction;
        if (!upgradeTx) {
          reject(new Error('Cycle database upgrade transaction is unavailable'));
          return;
        }
        const legacyRows = upgradeTx.objectStore(STORE_DAILY).getAll() as IDBRequest<StoredCycleObservation[]>;
        legacyRows.onsuccess = () => {
          db.deleteObjectStore(STORE_DAILY);
          const store = createDailyStore(db);
          for (const row of legacyRows.result || []) store.put(withObservationIdentity(row));
        };
        legacyRows.onerror = () => upgradeTx.abort();
      } else if (!db.objectStoreNames.contains(STORE_DAILY)) {
        createDailyStore(db);
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

export function resetCycleDB(profileId: string | null | undefined) {
  _dbPromises.delete(dbNameFor(profileId));
}


async function _encryptRowIfEnabled(row: StoredCycleObservation): Promise<StoredCycleObservation> {
  if (!cycleStoreCryptoDeps.getEncryptionEnabled()) return row;
  const identified = withObservationIdentity(row);
  const { source, date, importId, _payload, ...rest } = identified;
  if (_payload?._enc === 'v1') return identified;
  const env = await cycleStoreCryptoDeps.encryptObject(rest);
  if (!env) {
    const e = new Error('Cycle storage is encrypted; unlock with your passphrase before importing cycle data.');
    (e as Error & { code?: string }).code = 'session-locked';
    throw e;
  }
  return { source, date, importId, _payload: env };
}

async function _decryptRowIfWrapped(row: StoredCycleObservation): Promise<StoredCycleObservation | null> {
  if (!row || !row._payload) return row;
  if (!cycleStoreCryptoDeps.isEncryptedObject(row._payload)) return row;
  const decrypted = await cycleStoreCryptoDeps.decryptObject(row._payload).catch(() => null);
  if (!decrypted) return null;
  return {
    source: row.source,
    date: row.date,
    ...(row.importId ? { importId: row.importId } : {}),
    ...decrypted,
  };
}

async function _encryptImportMetaIfEnabled(meta: StoredCycleImportMeta): Promise<StoredCycleImportMeta> {
  if (!cycleStoreCryptoDeps.getEncryptionEnabled()) return meta;
  const { importId, source, _payload, ...rest } = meta;
  if (_payload?._enc === 'v1') return meta;
  const env = await cycleStoreCryptoDeps.encryptObject(rest);
  if (!env) {
    const e = new Error('Cycle storage is encrypted; unlock with your passphrase before importing cycle data.');
    (e as Error & { code?: string }).code = 'session-locked';
    throw e;
  }
  return { importId, source, _payload: env };
}

async function _decryptImportMetaIfWrapped(meta: StoredCycleImportMeta): Promise<StoredCycleImportMeta | null> {
  if (!meta || !meta._payload) return meta;
  if (!cycleStoreCryptoDeps.isEncryptedObject(meta._payload)) return meta;
  const decrypted = await cycleStoreCryptoDeps.decryptObject(meta._payload).catch(() => null);
  if (!decrypted) return null;
  return { importId: meta.importId, source: meta.source, ...decrypted };
}

function cleanRows(rows: unknown): StoredCycleObservation[] {
  return ((Array.isArray(rows) ? rows : []) as StoredCycleObservation[])
    .filter(row => row && row.source && row.date)
    .map(withObservationIdentity);
}

export async function upsertCycleObservation(profileId: string, row: StoredCycleObservation | null | undefined) {
  if (!row || !row.source || !row.date) throw new Error('upsertCycleObservation requires {source, date}');
  const stamped = withObservationIdentity({ importedAt: Date.now(), ...row });
  const towrite = await _encryptRowIfEnabled(stamped);
  const db = await openCycleDB(profileId);
  const tx = db.transaction(STORE_DAILY, 'readwrite');
  tx.objectStore(STORE_DAILY).put(towrite);
  return txPromise(tx);
}

export async function upsertCycleObservationBatch(profileId: string, rows: unknown) {
  const cleaned = cleanRows(rows);
  if (cleaned.length === 0) return;
  const stamp = Date.now();
  const towrite: StoredCycleObservation[] = [];
  for (const row of cleaned) {
    towrite.push(await _encryptRowIfEnabled({ importedAt: stamp, ...row }));
  }
  const db = await openCycleDB(profileId);
  const tx = db.transaction(STORE_DAILY, 'readwrite');
  const store = tx.objectStore(STORE_DAILY);
  for (const row of towrite) store.put(row);
  return txPromise(tx);
}

export async function getCycleObservation(profileId: string, source: string, date: string) {
  const db = await openCycleDB(profileId);
  const raw = await new Promise<StoredCycleObservation | null>((resolve, reject) => {
    const tx = db.transaction(STORE_DAILY, 'readonly');
    const req = tx.objectStore(STORE_DAILY).index('by_source_date')
      .openCursor(IDBKeyRange.only([source, date]), 'prev');
    req.onsuccess = () => resolve(req.result?.value || null);
    req.onerror = () => reject(req.error);
  });
  return raw ? _decryptRowIfWrapped(raw) : null;
}

function readCycleObservationRange(db: IDBDatabase, source: string, startDate: string, endDate: string) {
  return new Promise<StoredCycleObservation[]>((resolve, reject) => {
    const tx = db.transaction(STORE_DAILY, 'readonly');
    const store = tx.objectStore(STORE_DAILY).index('by_source_date');
    const keyRange = IDBKeyRange.bound([source, startDate], [source, endDate]);
    const rows: StoredCycleObservation[] = [];
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

export async function getCycleObservationRange(profileId: string, source: string, startDate: string, endDate: string) {
  const db = await openCycleDB(profileId);
  const raws = await readCycleObservationRange(db, source, startDate, endDate);
  const decrypted = await Promise.all(raws.map(row => _decryptRowIfWrapped(row)));
  return decrypted.filter(row => row !== null);
}

export async function getCycleObservationRangeRaw(profileId: string, source: string, startDate: string, endDate: string) {
  const db = await openCycleDB(profileId);
  return readCycleObservationRange(db, source, startDate, endDate);
}

export async function getAllCycleObservationsRaw(profileId: string) {
  const db = await openCycleDB(profileId);
  return new Promise<StoredCycleObservation[]>((resolve, reject) => {
    const tx = db.transaction(STORE_DAILY, 'readonly');
    const rows: StoredCycleObservation[] = [];
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

export async function upsertCycleObservationBatchRaw(profileId: string, rows: unknown) {
  const cleaned = cleanRows(rows);
  if (cleaned.length === 0) return;
  const db = await openCycleDB(profileId);
  const tx = db.transaction(STORE_DAILY, 'readwrite');
  const store = tx.objectStore(STORE_DAILY);
  for (const row of cleaned) store.put(row);
  return txPromise(tx);
}

export async function countCycleSource(profileId: string, source: string) {
  const db = await openCycleDB(profileId);
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE_DAILY, 'readonly');
    const req = tx.objectStore(STORE_DAILY).index('by_source').count(IDBKeyRange.only(source));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function deleteCursorRows(req: IDBRequest<IDBCursorWithValue | null>) {
  req.onsuccess = () => {
    const cursor = req.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };
}

export async function clearCycleSource(profileId: string, source: string) {
  const db = await openCycleDB(profileId);
  const tx = db.transaction([STORE_DAILY, STORE_IMPORTS], 'readwrite');
  const dailyIdx = tx.objectStore(STORE_DAILY).index('by_source');
  const importIdx = tx.objectStore(STORE_IMPORTS).index('by_source');
  const dailyReq = dailyIdx.openCursor(IDBKeyRange.only(source));
  deleteCursorRows(dailyReq);
  const importReq = importIdx.openCursor(IDBKeyRange.only(source));
  deleteCursorRows(importReq);
  return txPromise(tx);
}

export async function clearCycleImport(profileId: string, importId: string) {
  const db = await openCycleDB(profileId);
  const tx = db.transaction([STORE_DAILY, STORE_IMPORTS], 'readwrite');
  const dailyIdx = tx.objectStore(STORE_DAILY).index('by_import');
  const req = dailyIdx.openCursor(IDBKeyRange.only(importId));
  deleteCursorRows(req);
  tx.objectStore(STORE_IMPORTS).delete(importId);
  return txPromise(tx);
}

export async function saveCycleImportMeta(profileId: string, meta: StoredCycleImportMeta | null | undefined) {
  if (!meta || !meta.importId) throw new Error('saveCycleImportMeta requires importId');
  const towrite = await _encryptImportMetaIfEnabled({ importedAt: new Date().toISOString(), ...meta });
  const db = await openCycleDB(profileId);
  const tx = db.transaction(STORE_IMPORTS, 'readwrite');
  tx.objectStore(STORE_IMPORTS).put(towrite);
  return txPromise(tx);
}

export async function getCycleImportMetaRaw(profileId: string, importId: string) {
  const db = await openCycleDB(profileId);
  return new Promise<StoredCycleImportMeta | null>((resolve, reject) => {
    const tx = db.transaction(STORE_IMPORTS, 'readonly');
    const req = tx.objectStore(STORE_IMPORTS).get(importId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllCycleImportMetaRaw(profileId: string) {
  const db = await openCycleDB(profileId);
  return new Promise<StoredCycleImportMeta[]>((resolve, reject) => {
    const tx = db.transaction(STORE_IMPORTS, 'readonly');
    const req = tx.objectStore(STORE_IMPORTS).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function upsertCycleImportMetaBatchRaw(profileId: string, rows: unknown) {
  const cleaned = ((Array.isArray(rows) ? rows : []) as StoredCycleImportMeta[]).filter(row => row?.importId && row?.source);
  if (cleaned.length === 0) return;
  const db = await openCycleDB(profileId);
  const tx = db.transaction(STORE_IMPORTS, 'readwrite');
  const store = tx.objectStore(STORE_IMPORTS);
  for (const row of cleaned) store.put(row);
  return txPromise(tx);
}

export async function getCycleImportMeta(profileId: string, importId: string) {
  const raw = await getCycleImportMetaRaw(profileId, importId);
  return raw ? _decryptImportMetaIfWrapped(raw) : null;
}

export async function getCycleMeta<T = unknown>(profileId: string, key: IDBValidKey) {
  const db = await openCycleDB(profileId);
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.v : null);
    req.onerror = () => reject(req.error);
  });
}

export async function setCycleMeta(profileId: string, key: IDBValidKey, value: unknown) {
  const db = await openCycleDB(profileId);
  const tx = db.transaction(STORE_META, 'readwrite');
  tx.objectStore(STORE_META).put({ k: key, v: value, updatedAt: Date.now() });
  return txPromise(tx);
}

export async function deleteCycleMeta(profileId: string, key: IDBValidKey) {
  const db = await openCycleDB(profileId);
  const tx = db.transaction(STORE_META, 'readwrite');
  tx.objectStore(STORE_META).delete(key);
  return txPromise(tx);
}

export async function clearCycleDB(profileId: string) {
  const db = await openCycleDB(profileId);
  const tx = db.transaction([STORE_DAILY, STORE_IMPORTS, STORE_META], 'readwrite');
  tx.objectStore(STORE_DAILY).clear();
  tx.objectStore(STORE_IMPORTS).clear();
  tx.objectStore(STORE_META).clear();
  return txPromise(tx);
}

export async function deleteCycleDB(profileId: string): Promise<void> {
  const name = dbNameFor(profileId);
  const cached = _dbPromises.get(name);
  if (cached) {
    try { (await cached)?.close?.(); } catch {}
  }
  resetCycleDB(profileId);
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Cycle data deletion is blocked by another open tab. Close it and try again.'));
  });
}
