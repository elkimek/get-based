// @ts-check
// wearables-store.js — L1 IndexedDB for raw wearable daily rows
//
// Per-profile database so wearable history doesn't leak across profiles.
// Stays on-device only; never syncs. L2 summary (in importedData) is what
// ships to Evolu.
//
// Row schema (canonical; any adapter normalizes into this shape on write):
//   { source, date, importedAt,
//     hrv_rmssd, rhr, sleep_score, readiness_score,
//     spo2_avg, body_temp_delta, glucose_avg,
//     _raw?: { /* optional debug stash */ } }
//
// Compound key [source, date] — multiple sources coexist per day (Oura +
// WHOOP + Apple Health on the same 2026-04-22 is three distinct rows).

const DB_PREFIX = 'labcharts-wearables-';
const DB_VERSION = 1;
const STORE_DAILY = 'daily-metrics';
const STORE_META = 'meta';
const DEVICE_LOCAL_KEY_META = 'credential-vault-key:v1';
const ALWAYS_DEVICE_ENCRYPTED_SOURCES = new Set(['google_health']);
const deviceLocalEncoder = new TextEncoder();
const deviceLocalDecoder = new TextDecoder();

const _dbPromises = new Map();

/**
 * @typedef {{
 *   getEncryptionEnabled: () => boolean,
 *   encryptObject: (value: any) => Promise<any>,
 *   isEncryptedObject: (value: any) => boolean,
 *   decryptObject: (value: any) => Promise<any>,
 * }} WearablesStoreCryptoDeps
 */

/** @type {WearablesStoreCryptoDeps} */
const wearablesStoreCryptoDeps = {
  getEncryptionEnabled: () => {
    try { return localStorage.getItem('labcharts-encryption-enabled') === 'true'; } catch { return false; }
  },
  encryptObject: async () => null,
  isEncryptedObject: value => !!(value && typeof value === 'object' && value._enc === 'v1'),
  decryptObject: async () => null,
};

/** @param {Partial<WearablesStoreCryptoDeps>} [deps] */
export function configureWearablesStoreCrypto(deps = {}) {
  const previous = { ...wearablesStoreCryptoDeps };
  if (typeof deps.getEncryptionEnabled === 'function') wearablesStoreCryptoDeps.getEncryptionEnabled = deps.getEncryptionEnabled;
  if (typeof deps.encryptObject === 'function') wearablesStoreCryptoDeps.encryptObject = deps.encryptObject;
  if (typeof deps.isEncryptedObject === 'function') wearablesStoreCryptoDeps.isEncryptedObject = deps.isEncryptedObject;
  if (typeof deps.decryptObject === 'function') wearablesStoreCryptoDeps.decryptObject = deps.decryptObject;
  return previous;
}

function isDeviceLocalAesKey(value) {
  return !!(value
    && typeof value === 'object'
    && value.type === 'secret'
    && value.algorithm?.name === 'AES-GCM');
}

async function withDeviceLocalKeyLock(profileId, callback) {
  const locks = globalThis.navigator?.locks;
  if (locks && typeof locks.request === 'function') {
    return locks.request(`getbased-wearable-device-key:${profileId}`, { mode: 'exclusive' }, callback);
  }
  return callback();
}

async function getOrCreateDeviceLocalKey(profileId) {
  return withDeviceLocalKeyLock(profileId, async () => {
    const existing = await getMeta(profileId, DEVICE_LOCAL_KEY_META);
    if (isDeviceLocalAesKey(existing)) return existing;
    if (!globalThis.crypto?.subtle) throw new Error('Secure browser storage is unavailable.');
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    await setMeta(profileId, DEVICE_LOCAL_KEY_META, key);
    return key;
  });
}

// Always-on, device-local encryption used for restricted Google Health data
// and credentials. The non-extractable key remains in this profile's
// wearable IndexedDB and is deliberately excluded from backup/sync paths.
export async function encryptWearableDeviceLocalValue(profileId, value) {
  const key = await getOrCreateDeviceLocalKey(profileId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = deviceLocalEncoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return { version: 1, iv, ciphertext };
}

export async function decryptWearableDeviceLocalValue(profileId, envelope) {
  if (envelope?.version !== 1 || !envelope.iv || !envelope.ciphertext) return null;
  const key = await getMeta(profileId, DEVICE_LOCAL_KEY_META);
  if (!isDeviceLocalAesKey(key)) return null;
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: envelope.iv },
      key,
      envelope.ciphertext,
    );
    const parsed = JSON.parse(deviceLocalDecoder.decode(plaintext));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function dbNameFor(profileId) {
  // Fall back to 'default' so a missing profile id still gets a valid db name.
  return DB_PREFIX + (profileId || 'default');
}

export function openWearablesDB(profileId) {
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
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'k' });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); resetWearablesDB(profileId); };
      resolve(db);
    };
    req.onerror = () => { _dbPromises.delete(name); reject(req.error); };
  });
  _dbPromises.set(name, p);
  return p;
}

// Evict the cached promise so a subsequent open reconnects — useful after
// close() or when Safari evicts storage.
export function resetWearablesDB(profileId) {
  _dbPromises.delete(dbNameFor(profileId));
}

// ─────────────────────────────────────────────────────────
// Row CRUD
// ─────────────────────────────────────────────────────────

function txPromise(tx) {
  /** @type {Promise<void>} */
  const complete = new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
  return complete;
}

// Field-level AES-GCM envelope around the non-key fields of an L1 row when
// encryption-at-rest is enabled. Compound key fields (`source`, `date`) stay
// plaintext so IDB cursors / range queries still work. The envelope replaces
// every other field with `{ source, date, _payload: { _enc:'v1', iv, ct }}`.
//
// When encryption is OFF, returns the row as-is — same plaintext shape as
// pre-v1.29.0. When encryption is ON but the session is LOCKED (key cleared
// after passphrase prompt dismiss / lock timeout), THROWS rather than
// silently degrading the at-rest guarantee. Callers can catch and queue
// the write; better than landing cleartext rows in an "encrypted at rest"
// IDB without telling anyone.
async function _encryptRowIfEnabled(row) {
  if (!wearablesStoreCryptoDeps.getEncryptionEnabled()) return row;
  // Already-encrypted rows (e.g. from a backup-restore RAW path) pass through
  // untouched. Note: when encryption is OFF we DON'T hit this branch because
  // we returned above; that scenario goes through the RAW upsert API
  // (upsertDailyBatchRaw) which doesn't call this helper.
  const { source, date, _payload, ...rest } = row;
  if (_payload?._enc === 'v1') return row;
  const env = await wearablesStoreCryptoDeps.encryptObject(rest);
  if (!env) {
    // Encryption-on but session locked (or unavailable). Refuse rather than
    // silently writing cleartext. The error propagates up to the adapter
    // sync orchestrator, which logs + shows a toast asking the user to
    // unlock. Better than silent downgrade.
    /** @type {Error & { code?: string }} */
    const e = new Error('Wearable storage is encrypted; unlock with your passphrase before syncing.');
    e.code = 'session-locked';
    throw e;
  }
  return { source, date, _payload: env };
}

async function _prepareRowForStorage(profileId, row) {
  let prepared = row;
  if (ALWAYS_DEVICE_ENCRYPTED_SOURCES.has(row?.source) && !row?._devicePayload) {
    const { source, date, _payload, ...rest } = row;
    if (_payload) return row;
    prepared = {
      source,
      date,
      _devicePayload: await encryptWearableDeviceLocalValue(profileId, rest),
    };
  }
  // When the user also enables passphrase encryption, it becomes an outer
  // envelope around the always-on device envelope. Disabling the passphrase
  // therefore never downgrades Google Health rows to plaintext.
  return _encryptRowIfEnabled(prepared);
}

async function _decryptRowIfWrapped(profileId, row) {
  if (!row) return row;
  let unwrapped = row;
  if (row._payload) {
    if (!wearablesStoreCryptoDeps.isEncryptedObject(row._payload)) return null;
    const decrypted = await wearablesStoreCryptoDeps.decryptObject(row._payload).catch(() => null);
    if (!decrypted) return null;
    unwrapped = { source: row.source, date: row.date, ...decrypted };
  }

  if (unwrapped._devicePayload) {
    const decrypted = await decryptWearableDeviceLocalValue(profileId, unwrapped._devicePayload);
    if (!decrypted) return null;
    return { source: unwrapped.source, date: unwrapped.date, ...decrypted };
  }

  // Session locked / corrupt → return null. Earlier we returned the
  // wrapped row, but downstream consumers (`_mergeManualRow`,
  // `upsertDailyBatch`'s read-modify-write) would spread `_payload` into
  // a "merged" row and then `_encryptRowIfEnabled` re-wrapped it,
  // producing nested envelopes that `isEncryptedObject` couldn't detect
  // on the next read. Returning null forces callers to treat the row as
  // unreadable, which is the honest semantic when the session is locked.
  return unwrapped;
}

export async function upsertDaily(profileId, row) {
  if (!row || !row.source || !row.date) throw new Error('upsertDaily requires {source, date}');
  const stamped = { importedAt: Date.now(), ...row };
  const towrite = await _prepareRowForStorage(profileId, stamped);
  const db = await openWearablesDB(profileId);
  const tx = db.transaction(STORE_DAILY, 'readwrite');
  tx.objectStore(STORE_DAILY).put(towrite);
  return txPromise(tx);
}

// Remove a single row by compound key. Used by deleteManualMetric when
// the last metric field on a row is cleared — otherwise stub rows pile up
// in IDB and sources.coverageDays over-counts. Idempotent (silent on
// missing key).
export async function deleteDaily(profileId, source, date) {
  const db = await openWearablesDB(profileId);
  const tx = db.transaction(STORE_DAILY, 'readwrite');
  tx.objectStore(STORE_DAILY).delete([source, date]);
  return txPromise(tx);
}

// Merge two canonical rows: incoming wins UNLESS its field is null/undefined,
// in which case the existing value survives. This is the central protection
// against partial-fetch overwrites — vendor adapters initialise every
// canonical field to null and only populate what came back, so a same-day
// re-sync that returns a subset (e.g. Withings `lastupdate` finds nothing
// new for weight but does for sleep) must not blank the fields it didn't
// fetch. Special-cased: `source`, `date`, `importedAt`, `tags` always come
// from the incoming row. Mirrors `_mergeManualRow` semantics.
function _mergeRow(existing, incoming) {
  if (!existing) return incoming;
  const out = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (k === 'source' || k === 'date') { out[k] = v; continue; }
    if (k === 'importedAt') { out[k] = v; continue; }
    if (k === 'tags') { out[k] = v; continue; }
    if (v === null || v === undefined) continue; // preserve existing
    out[k] = v;
  }
  return out;
}

export async function upsertDailyBatch(profileId, rows) {
  if (!rows || rows.length === 0) return;
  const stamp = Date.now();
  const cleaned = rows.filter(r => r && r.source && r.date);
  if (cleaned.length === 0) return;
  const db = await openWearablesDB(profileId);

  // Phase 1 — read existing rows in a read tx. We can't await between
  // get() and put() inside a single tx (IDB auto-closes the tx on the
  // first microtask yield), so the read and decrypt happen first, then
  // a fresh write tx applies all merged puts in one shot. Race window:
  // a concurrent write between phases could be overwritten — acceptable
  // because (a) wearable syncs are serialized via _syncing/_pulling
  // guards upstream, (b) we're protecting against the much more common
  // partial-fetch overwrite.
  const existingRows = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DAILY, 'readonly');
    const store = tx.objectStore(STORE_DAILY);
    const out = new Map();
    let pending = cleaned.length;
    if (pending === 0) return resolve(out);
    for (const incoming of cleaned) {
      const req = store.get([incoming.source, incoming.date]);
      req.onsuccess = () => {
        if (req.result) out.set(`${incoming.source}|${incoming.date}`, req.result);
        if (--pending === 0) resolve(out);
      };
      req.onerror = () => reject(req.error);
    }
  });

  // Decrypt existing rows + build merged payloads (await-friendly outside tx)
  const towrite = [];
  for (const incoming of cleaned) {
    const key = `${incoming.source}|${incoming.date}`;
    const existing = existingRows.get(key);
    const existingPlain = existing ? await _decryptRowIfWrapped(profileId, existing) : null;
    const merged = _mergeRow(existingPlain, { importedAt: stamp, ...incoming });
    towrite.push(await _prepareRowForStorage(profileId, merged));
  }

  // Phase 2 — write all merged rows in a single fresh tx, no awaits.
  const tx = db.transaction(STORE_DAILY, 'readwrite');
  const store = tx.objectStore(STORE_DAILY);
  for (const row of towrite) store.put(row);
  return txPromise(tx);
}

export async function getDaily(profileId, source, date) {
  const db = await openWearablesDB(profileId);
  const raw = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DAILY, 'readonly');
    const req = tx.objectStore(STORE_DAILY).get([source, date]);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  return raw ? _decryptRowIfWrapped(profileId, raw) : null;
}

// Raw range read — returns rows AS STORED in IDB without decrypt. Used by
// the backup snapshot path so encrypted rows survive the round-trip
// AS-WRAPPERS instead of being decrypted into the snapshot in plaintext
// (which would silently downgrade the at-rest encryption guarantee).
export async function getDailyRangeRaw(profileId, source, startDate, endDate) {
  const db = await openWearablesDB(profileId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DAILY, 'readonly');
    const store = tx.objectStore(STORE_DAILY);
    const keyRange = IDBKeyRange.bound([source, startDate], [source, endDate]);
    const rows = [];
    const req = store.openCursor(keyRange);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) { rows.push(cursor.value); cursor.continue(); }
      else resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getAllDailyRaw(profileId) {
  const db = await openWearablesDB(profileId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DAILY, 'readonly');
    const req = tx.objectStore(STORE_DAILY).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// Raw write — accepts rows AS-IS without re-encrypting. Used by the
// backup-restore path so wrapped rows go back into IDB untouched. Plain
// rows that come from a non-encrypted backup land in a possibly-encrypted
// destination IDB still as plaintext — they'll be re-encrypted on next
// mutation via the normal upsertDaily path (write-on-touch).
export async function upsertDailyBatchRaw(profileId, rows) {
  if (!rows || rows.length === 0) return;
  const db = await openWearablesDB(profileId);
  const tx = db.transaction(STORE_DAILY, 'readwrite');
  const store = tx.objectStore(STORE_DAILY);
  for (const row of rows) {
    if (!row || !row.source || !row.date) continue;
    // Google Health rows cannot be restored as plaintext. Device-encrypted
    // rows are not exported by our backup path because their non-extractable
    // key intentionally stays on the originating device.
    if (ALWAYS_DEVICE_ENCRYPTED_SOURCES.has(row.source) && !row._devicePayload && !row._payload) continue;
    store.put(row);
  }
  return txPromise(tx);
}

// Inclusive range query for ONE source. ISO dates; lexicographic order matches
// chronological because format is YYYY-MM-DD.
export async function getDailyRange(profileId, source, startDate, endDate) {
  const db = await openWearablesDB(profileId);
  const raws = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DAILY, 'readonly');
    const store = tx.objectStore(STORE_DAILY);
    const keyRange = IDBKeyRange.bound([source, startDate], [source, endDate]);
    const rows = [];
    const req = store.openCursor(keyRange);
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) { rows.push(cursor.value); cursor.continue(); }
      else resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
  // Decrypt-on-read. Plaintext rows pass through untouched; encrypted
  // rows unwrap. Any single-row decrypt failure (session locked / corrupt)
  // returns null from _decryptRowIfWrapped — drop those rows from the
  // range rather than passing them through, since downstream consumers
  // can't render a wrapped row safely.
  const decrypted = await Promise.all(raws.map(r => _decryptRowIfWrapped(profileId, r)));
  return decrypted.filter(r => r !== null);
}

// Count rows for a given source (fast sanity check, also used by Safari-eviction recovery).
export async function countSource(profileId, source) {
  const db = await openWearablesDB(profileId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DAILY, 'readonly');
    const idx = tx.objectStore(STORE_DAILY).index('by_source');
    const req = idx.count(IDBKeyRange.only(source));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Wipe every row for a source — used by "disconnect wearable" action.
export async function clearSource(profileId, source) {
  const db = await openWearablesDB(profileId);
  const tx = db.transaction(STORE_DAILY, 'readwrite');
  const idx = tx.objectStore(STORE_DAILY).index('by_source');
  const req = idx.openCursor(IDBKeyRange.only(source));
  req.onsuccess = () => {
    const c = req.result;
    if (c) { c.delete(); c.continue(); }
  };
  return txPromise(tx);
}

// ─────────────────────────────────────────────────────────
// Meta KV (last-sync cursors, token fingerprints, one-off flags)
// ─────────────────────────────────────────────────────────

export async function getMeta(profileId, key) {
  const db = await openWearablesDB(profileId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.v : null);
    req.onerror = () => reject(req.error);
  });
}

export async function setMeta(profileId, key, value) {
  const db = await openWearablesDB(profileId);
  const tx = db.transaction(STORE_META, 'readwrite');
  tx.objectStore(STORE_META).put({ k: key, v: value, updatedAt: Date.now() });
  return txPromise(tx);
}

export async function deleteMeta(profileId, key) {
  const db = await openWearablesDB(profileId);
  const tx = db.transaction(STORE_META, 'readwrite');
  tx.objectStore(STORE_META).delete(key);
  return txPromise(tx);
}

// Delete the entire wearable database for this profile — used by the nuke
// path in Settings → Data and by deleteProfile.
export async function deleteWearablesDB(profileId) {
  // Close the cached connection first — a held-open connection blocks
  // indexedDB.deleteDatabase. Without this, the delete fires `onblocked`
  // and the actual disk-level removal waits until every tab closes.
  const name = dbNameFor(profileId);
  const cached = _dbPromises.get(name);
  if (cached) {
    try { (await cached)?.close?.(); } catch { /* connection might be in error state */ }
  }
  resetWearablesDB(profileId);
  /** @type {Promise<void>} */
  const deleted = new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Wearable data deletion is blocked by another open tab.'));
  });
  return deleted;
}
