// @ts-check
// migration-recovery-store.js — Encrypted, crash-consistent profile rollback.

import { compareAndSetBlob, getBlob, shouldUseBlob } from './blob-storage.js';

const DB_NAME = 'labcharts-migration-recovery';
const DB_VERSION = 1;
const KEY_STORE = 'device-keys';
const SNAPSHOT_STORE = 'snapshots';
const PROFILE_INDEX = 'profileKey';
const DEVICE_KEY_ID = 'migration-recovery-aes-key:v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const MIGRATION_RECOVERY_FORMAT_VERSION = 1;
export const MAX_MIGRATION_RECOVERY_SNAPSHOTS = 3;

/** @typedef {'prepared' | 'committed' | 'rolled-back'} RecoveryStatus */
/**
 * @typedef {{
 *   id: string,
 *   formatVersion: number,
 *   profileKey: string,
 *   fromVersion: number,
 *   toVersion: number,
 *   createdAt: number,
 *   status: RecoveryStatus,
 *   previousBytes: number,
 *   nextBytes: number,
 *   envelope: { iv: Uint8Array, ciphertext: ArrayBuffer },
 *   committedAt?: number,
 *   rolledBackAt?: number,
 * }} RecoveryRecord
 */

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;
/** @type {Map<string, Promise<void>>} */
const inMemoryLocks = new Map();

/**
 * Close this module's cached connection before deleting the recovery database.
 * A generic deleteDatabase call can otherwise be blocked by the same page that
 * requested the wipe after migration recovery has been used.
 */
export async function eraseMigrationRecoveryStorage() {
  const openConnection = dbPromise;
  dbPromise = null;
  if (openConnection) {
    try {
      const db = await openConnection;
      db.close();
    } catch {
      // A failed open has no live connection to close; deletion can still run.
    }
  }
  if (typeof indexedDB === 'undefined') return;
  if (typeof indexedDB.deleteDatabase !== 'function') {
    throw new Error('IndexedDB deletion is unavailable.');
  }
  await new Promise((resolve, reject) => {
    try {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve(undefined);
      request.onerror = () => reject(request.error || new Error('Migration recovery deletion failed.'));
      request.onblocked = () => reject(
        new Error('Migration recovery deletion is blocked by another open Get Based tab.'),
      );
    } catch (error) {
      reject(error);
    }
  });
}

function openRecoveryDB() {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable.'));
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KEY_STORE)) db.createObjectStore(KEY_STORE);
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        const snapshots = db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
        snapshots.createIndex(PROFILE_INDEX, 'profileKey', { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('Could not open migration recovery storage.'));
    };
    request.onblocked = () => {
      dbPromise = null;
      reject(new Error('Migration recovery storage upgrade is blocked.'));
    };
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

/** @template T @param {IDBRequest<T>} request @returns {Promise<T>} */
function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

/** @param {IDBTransaction} transaction */
function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(undefined);
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted.'));
    transaction.onerror = () => {};
  });
}

/** @param {unknown} value */
function isRecoveryKey(value) {
  if (!value || typeof value !== 'object') return false;
  const candidate = /** @type {CryptoKey} */ (value);
  return candidate.type === 'secret'
    && candidate.extractable === false
    && candidate.algorithm?.name === 'AES-GCM';
}

async function readDeviceKey() {
  const db = await openRecoveryDB();
  const tx = db.transaction(KEY_STORE, 'readonly');
  return requestResult(tx.objectStore(KEY_STORE).get(DEVICE_KEY_ID));
}

async function getOrCreateDeviceKey() {
  const existing = await readDeviceKey();
  if (isRecoveryKey(existing)) return /** @type {CryptoKey} */ (existing);
  if (!globalThis.crypto?.subtle) throw new Error('Secure browser storage is unavailable.');
  const generated = await globalThis.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  try {
    const db = await openRecoveryDB();
    const tx = db.transaction(KEY_STORE, 'readwrite');
    tx.objectStore(KEY_STORE).add(generated, DEVICE_KEY_ID);
    await transactionDone(tx);
    return generated;
  } catch {
    const winner = await readDeviceKey();
    if (isRecoveryKey(winner)) return /** @type {CryptoKey} */ (winner);
    throw new Error('Could not retain the migration recovery key.');
  }
}

/** @param {Uint8Array | ArrayBuffer} value */
function byteView(value) {
  const source = value instanceof Uint8Array ? value : new Uint8Array(value);
  return new Uint8Array(source);
}

/** @param {unknown} error */
function caughtErrorCode(error) {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return String(error.code || '');
}

/** @param {ArrayBuffer} value */
function hex(value) {
  return Array.from(new Uint8Array(value), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** @param {string} value */
async function digest(value) {
  const hashed = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(value));
  return hex(hashed);
}

function createSnapshotId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** @param {Pick<RecoveryRecord, 'id' | 'profileKey' | 'fromVersion' | 'toVersion' | 'createdAt'>} record */
function additionalData(record) {
  return encoder.encode([
    'getbased-migration-recovery',
    MIGRATION_RECOVERY_FORMAT_VERSION,
    record.id,
    record.profileKey,
    record.fromVersion,
    record.toVersion,
    record.createdAt,
  ].join('|'));
}

/**
 * @param {string} previousValue
 * @param {string} nextValue
 */
export function estimateMigrationRecoveryBytes(previousValue, nextValue) {
  const previousBytes = encoder.encode(previousValue).byteLength;
  const nextBytes = encoder.encode(nextValue).byteLength;
  const requiredBytes = Math.ceil((previousBytes + nextBytes + 65536) * 1.25);
  return { previousBytes, nextBytes, requiredBytes };
}

/**
 * @param {string} previousValue
 * @param {string} nextValue
 * @param {{ estimate?: () => Promise<{ usage?: number, quota?: number }> }} [options]
 */
export async function preflightMigrationRecoveryStorage(previousValue, nextValue, options = {}) {
  const sizes = estimateMigrationRecoveryBytes(previousValue, nextValue);
  const estimate = options.estimate || globalThis.navigator?.storage?.estimate?.bind(globalThis.navigator.storage);
  if (typeof estimate !== 'function') {
    return { ok: true, supported: false, availableBytes: null, headroomBytes: null, ...sizes };
  }
  try {
    const result = await estimate();
    if (!Number.isFinite(result?.usage) || !Number.isFinite(result?.quota)) {
      return { ok: true, supported: false, availableBytes: null, headroomBytes: null, ...sizes };
    }
    const availableBytes = Math.max(0, Number(result.quota) - Number(result.usage));
    const headroomBytes = availableBytes - sizes.requiredBytes;
    return {
      ok: headroomBytes >= 0,
      supported: true,
      availableBytes,
      headroomBytes,
      ...sizes,
    };
  } catch {
    return { ok: true, supported: false, availableBytes: null, headroomBytes: null, ...sizes };
  }
}

/**
 * @param {Pick<RecoveryRecord, 'id' | 'profileKey' | 'fromVersion' | 'toVersion' | 'createdAt'>} record
 * @param {string} previousValue
 * @param {string} nextValue
 */
async function encryptRecoveryRecord(record, previousValue, nextValue) {
  const key = await getOrCreateDeviceKey();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify({
    version: MIGRATION_RECOVERY_FORMAT_VERSION,
    profileKey: record.profileKey,
    previousValue,
    nextDigest: await digest(nextValue),
  }));
  const ciphertext = await globalThis.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(record) },
    key,
    plaintext,
  );
  return { iv, ciphertext };
}

/** @param {RecoveryRecord} record */
async function decryptRecoveryRecord(record) {
  try {
    const key = await readDeviceKey();
    if (!isRecoveryKey(key)) return null;
    const plaintext = await globalThis.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: byteView(record.envelope.iv),
        additionalData: additionalData(record),
      },
      /** @type {CryptoKey} */ (key),
      record.envelope.ciphertext,
    );
    const payload = JSON.parse(decoder.decode(plaintext));
    if (payload?.version !== MIGRATION_RECOVERY_FORMAT_VERSION
        || payload?.profileKey !== record.profileKey
        || typeof payload?.previousValue !== 'string'
        || !/^[a-f0-9]{64}$/.test(payload?.nextDigest || '')) return null;
    return payload;
  } catch {
    return null;
  }
}

/** @param {RecoveryRecord} record */
async function addRecoveryRecord(record) {
  const db = await openRecoveryDB();
  const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
  tx.objectStore(SNAPSHOT_STORE).add(record);
  await transactionDone(tx);
}

/** @param {string} id @returns {Promise<RecoveryRecord | null>} */
async function getRecoveryRecord(id) {
  const db = await openRecoveryDB();
  const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
  const result = await requestResult(tx.objectStore(SNAPSHOT_STORE).get(id));
  return result ? /** @type {RecoveryRecord} */ (result) : null;
}

/** @param {string} id */
async function deleteRecoveryRecord(id) {
  const db = await openRecoveryDB();
  const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
  tx.objectStore(SNAPSHOT_STORE).delete(id);
  await transactionDone(tx);
}

/** @param {string} id @param {RecoveryStatus} status */
async function setRecoveryStatus(id, status) {
  const db = await openRecoveryDB();
  const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
  const store = tx.objectStore(SNAPSHOT_STORE);
  const record = await requestResult(store.get(id));
  if (!record) {
    tx.abort();
    throw new Error('Migration recovery snapshot was not found.');
  }
  const next = /** @type {RecoveryRecord} */ (record);
  next.status = status;
  if (status === 'committed') next.committedAt = Date.now();
  if (status === 'rolled-back') next.rolledBackAt = Date.now();
  store.put(next);
  await transactionDone(tx);
}

/**
 * @template T
 * @param {string} profileKey
 * @param {() => Promise<T>} callback
 * @returns {Promise<T>}
 */
export async function withProfileMigrationLock(profileKey, callback) {
  const lockName = `getbased-profile-migration:${profileKey}`;
  const locks = globalThis.navigator?.locks;
  if (locks && typeof locks.request === 'function') {
    return locks.request(lockName, { mode: 'exclusive' }, callback);
  }

  const previous = inMemoryLocks.get(lockName) || Promise.resolve();
  /** @type {() => void} */
  let release = () => {};
  const current = new Promise(resolve => { release = () => resolve(undefined); });
  const tail = previous.then(() => current);
  inMemoryLocks.set(lockName, tail);
  await previous;
  try {
    return await callback();
  } finally {
    release();
    if (inMemoryLocks.get(lockName) === tail) inMemoryLocks.delete(lockName);
  }
}

/** @param {unknown} input */
function isValidRecoveryInput(input) {
  if (!input || typeof input !== 'object') return false;
  const candidate = /** @type {Record<string, any>} */ (input);
  return typeof candidate.profileKey === 'string'
    && candidate.profileKey.endsWith('-imported')
    && shouldUseBlob(candidate.profileKey)
    && typeof candidate.previousValue === 'string'
    && typeof candidate.nextValue === 'string'
    && candidate.previousValue !== candidate.nextValue
    && Number.isInteger(candidate.fromVersion)
    && Number.isInteger(candidate.toVersion)
    && candidate.fromVersion >= 0
    && candidate.toVersion > candidate.fromVersion
    && (candidate.estimate === undefined || typeof candidate.estimate === 'function');
}

/**
 * @param {{
 *   profileKey: string,
 *   previousValue: string,
 *   nextValue: string,
 *   fromVersion: number,
 *   toVersion: number,
 *   estimate?: () => Promise<{ usage?: number, quota?: number }>,
 * }} input
 */
export async function prepareMigrationRecoverySnapshot(input) {
  if (!isValidRecoveryInput(input)) {
    return { ok: false, error: { code: 'RECOVERY_INPUT_INVALID', message: 'Migration recovery input is invalid.' } };
  }
  const preflight = await preflightMigrationRecoveryStorage(
    input.previousValue,
    input.nextValue,
    { ...(input.estimate ? { estimate: input.estimate } : {}) },
  );
  if (!preflight.ok) {
    return {
      ok: false,
      preflight,
      error: { code: 'RECOVERY_STORAGE_INSUFFICIENT', message: 'Not enough storage is available for a recovery snapshot.' },
    };
  }

  const metadata = /** @type {Omit<RecoveryRecord, 'envelope'>} */ ({
    id: createSnapshotId(),
    formatVersion: MIGRATION_RECOVERY_FORMAT_VERSION,
    profileKey: input.profileKey,
    fromVersion: input.fromVersion,
    toVersion: input.toVersion,
    createdAt: Date.now(),
    status: 'prepared',
    previousBytes: preflight.previousBytes,
    nextBytes: preflight.nextBytes,
  });
  try {
    const record = /** @type {RecoveryRecord} */ ({
      ...metadata,
      envelope: await encryptRecoveryRecord(metadata, input.previousValue, input.nextValue),
    });
    await addRecoveryRecord(record);
    return { ok: true, snapshotId: record.id, preflight };
  } catch {
    return {
      ok: false,
      preflight,
      error: { code: 'RECOVERY_SNAPSHOT_WRITE_FAILED', message: 'The encrypted recovery snapshot could not be retained.' },
    };
  }
}

/** @param {string} profileKey */
export async function listMigrationRecoverySnapshots(profileKey) {
  const db = await openRecoveryDB();
  const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
  const records = await requestResult(
    tx.objectStore(SNAPSHOT_STORE).index(PROFILE_INDEX).getAll(profileKey),
  );
  return (records || [])
    .map(record => ({
      id: record.id,
      formatVersion: record.formatVersion,
      profileKey: record.profileKey,
      fromVersion: record.fromVersion,
      toVersion: record.toVersion,
      createdAt: record.createdAt,
      status: record.status,
      previousBytes: record.previousBytes,
      nextBytes: record.nextBytes,
    }))
    .sort((left, right) => right.createdAt - left.createdAt);
}

/** @param {string} profileKey */
async function pruneSettledSnapshots(profileKey) {
  const records = await listMigrationRecoverySnapshots(profileKey);
  const settled = records.filter(record => record.status !== 'prepared');
  for (const record of settled.slice(MAX_MIGRATION_RECOVERY_SNAPSHOTS)) {
    await deleteRecoveryRecord(record.id);
  }
}

/**
 * Retain an encrypted snapshot first, then atomically replace the active blob
 * only if it has not changed since shadow validation.
 *
 * @param {Parameters<typeof prepareMigrationRecoverySnapshot>[0]} input
 */
export async function commitProfileMigrationWithRecovery(input) {
  if (!isValidRecoveryInput(input)) {
    return { ok: false, error: { code: 'RECOVERY_INPUT_INVALID', message: 'Migration recovery input is invalid.' } };
  }
  return withProfileMigrationLock(input.profileKey, async () => {
    const prepared = await prepareMigrationRecoverySnapshot(input);
    if (prepared.ok !== true || typeof prepared.snapshotId !== 'string') return prepared;
    const snapshotId = prepared.snapshotId;
    try {
      await compareAndSetBlob(input.profileKey, input.previousValue, input.nextValue);
    } catch (error) {
      try { await deleteRecoveryRecord(snapshotId); } catch {}
      const code = caughtErrorCode(error);
      return {
        ok: false,
        preflight: prepared.preflight,
        error: {
          code: code === 'blob_conflict' ? 'RECOVERY_COMMIT_CONFLICT' : 'RECOVERY_COMMIT_FAILED',
          message: code === 'blob_conflict'
            ? 'Profile data changed before migration commit.'
            : 'The profile migration was not committed.',
        },
      };
    }

    let journalStatus = 'prepared';
    try {
      await setRecoveryStatus(snapshotId, 'committed');
      journalStatus = 'committed';
    } catch {
      // The active write is valid and its prepared journal is recoverable.
    }
    if (journalStatus === 'committed') {
      try { await pruneSettledSnapshots(input.profileKey); } catch {}
    }
    return {
      ok: true,
      snapshotId,
      journalStatus,
      preflight: prepared.preflight,
    };
  });
}

/** @param {string} snapshotId */
export async function reconcileMigrationRecoverySnapshot(snapshotId) {
  const record = await getRecoveryRecord(snapshotId);
  if (!record) return { ok: false, error: { code: 'RECOVERY_NOT_FOUND', message: 'Recovery snapshot was not found.' } };
  const payload = await decryptRecoveryRecord(record);
  if (!payload) return { ok: false, error: { code: 'RECOVERY_DECRYPT_FAILED', message: 'Recovery snapshot could not be decrypted.' } };
  return withProfileMigrationLock(record.profileKey, async () => {
    const current = await getBlob(record.profileKey);
    if (typeof current !== 'string') {
      return { ok: false, error: { code: 'RECOVERY_ACTIVE_PROFILE_MISSING', message: 'Active profile data is unavailable.' } };
    }
    if (current === payload.previousValue) {
      await setRecoveryStatus(record.id, 'rolled-back');
      return { ok: true, outcome: 'rolled-back', snapshotId: record.id };
    }
    if (await digest(current) === payload.nextDigest) {
      await setRecoveryStatus(record.id, 'committed');
      return { ok: true, outcome: 'committed', snapshotId: record.id };
    }
    return {
      ok: false,
      error: { code: 'RECOVERY_RECONCILE_CONFLICT', message: 'Active profile data no longer matches the migration journal.' },
    };
  });
}

/** @param {string} snapshotId */
export async function rollbackProfileMigration(snapshotId) {
  const record = await getRecoveryRecord(snapshotId);
  if (!record) return { ok: false, error: { code: 'RECOVERY_NOT_FOUND', message: 'Recovery snapshot was not found.' } };
  const payload = await decryptRecoveryRecord(record);
  if (!payload) return { ok: false, error: { code: 'RECOVERY_DECRYPT_FAILED', message: 'Recovery snapshot could not be decrypted.' } };
  return withProfileMigrationLock(record.profileKey, async () => {
    const current = await getBlob(record.profileKey);
    if (typeof current !== 'string') {
      return { ok: false, error: { code: 'RECOVERY_ACTIVE_PROFILE_MISSING', message: 'Active profile data is unavailable.' } };
    }
    if (current === payload.previousValue) {
      await setRecoveryStatus(record.id, 'rolled-back');
      return { ok: true, snapshotId: record.id, journalStatus: 'rolled-back' };
    }
    if (await digest(current) !== payload.nextDigest) {
      return {
        ok: false,
        error: { code: 'RECOVERY_CURRENT_VALUE_CHANGED', message: 'Profile data changed after migration; automatic rollback was refused.' },
      };
    }
    try {
      await compareAndSetBlob(record.profileKey, current, payload.previousValue);
    } catch (error) {
      const code = caughtErrorCode(error);
      return {
        ok: false,
        error: {
          code: code === 'blob_conflict' ? 'RECOVERY_ROLLBACK_CONFLICT' : 'RECOVERY_ROLLBACK_FAILED',
          message: 'The recovery snapshot was retained, but rollback was not applied.',
        },
      };
    }
    let journalStatus = 'rolled-back';
    try { await setRecoveryStatus(record.id, 'rolled-back'); } catch { journalStatus = record.status; }
    return { ok: true, snapshotId: record.id, journalStatus };
  });
}
