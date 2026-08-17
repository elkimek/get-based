// @ts-check
// crypto.js — Encryption at rest, backup/restore, cross-tab sync

import { getErrorMessage } from './caught-error.js';
import { isAppExtensionSyncEncryptedStorageKey } from './app-extension-runtime.js';
import { state } from './state.js';
import { profileStorageKey } from './profile-storage-key.js';
import { getBlob, setBlob, deleteBlob, shouldUseBlob } from './blob-storage.js';
import { ensureImportedArray } from './data-merge.js';
import { clearKeyCache, updateKeyCache } from './crypto-key-cache.js';
import {
  configureCycleStoreCrypto,
  getAllCycleImportMetaRaw,
  getAllCycleObservationsRaw,
  upsertCycleImportMetaBatchRaw,
  upsertCycleObservationBatchRaw,
} from './cycle-store.js';
import {
  configureWearablesStoreCrypto,
  getAllDailyRaw,
  upsertDailyBatchRaw,
} from './wearables-store.js';
import { isDataProtectionStylesheetLoaded, loadDataProtectionStylesheetForAction } from './modal-lifecycle.js';
import {
  changePassphrase,
  configureCryptoUi,
  disableEncryption,
  installCryptoActionDelegates,
  loadBackupSnapshots,
  maybeShowBackupNudge,
  maybeShowEncryptionNudge,
  renderBackupSection,
  renderEncryptionSection,
  showEnableEncryptionModal,
  showPassphraseModal,
  toggleBackupSnapshots,
} from './crypto-ui.js';

export { getCachedKey, updateKeyCache } from './crypto-key-cache.js';
export {
  changePassphrase,
  disableEncryption,
  installCryptoActionDelegates,
  loadBackupSnapshots,
  maybeShowBackupNudge,
  maybeShowEncryptionNudge,
  renderBackupSection,
  renderEncryptionSection,
  showEnableEncryptionModal,
  toggleBackupSnapshots,
};

const appWindow = /** @type {Window & typeof globalThis & {
  __WEARABLES_TEST?: boolean,
}} */ (typeof window !== 'undefined' ? window : {});

const needsDataProtectionStylesheet = () => typeof document !== 'undefined' && !!document.querySelector('[data-data-protection-stylesheet-anchor]') && !isDataProtectionStylesheetLoaded();
/**
 * @typedef {{
 *   buildSidebar: null | (() => void),
 *   migrateProfileData: null | ((data: any) => void),
 *   navigate: null | ((view: string) => void),
 * }} CryptoProfileDeps
 */

/** @type {CryptoProfileDeps} */
const cryptoProfileDeps = {
  buildSidebar: null,
  migrateProfileData: /** @type {null | ((data: any) => void)} */ (null),
  navigate: null,
};

function navigateCryptoView(view) {
  cryptoProfileDeps.navigate?.(view);
}

function buildCryptoSidebar() {
  cryptoProfileDeps.buildSidebar?.();
}

/** @param {Partial<CryptoProfileDeps>} [deps] */
export function configureCryptoProfileDeps(deps = {}) {
  const previous = { ...cryptoProfileDeps };
  if (Object.hasOwn(deps, 'buildSidebar') && (deps.buildSidebar === null || typeof deps.buildSidebar === 'function')) {
    cryptoProfileDeps.buildSidebar = deps.buildSidebar;
  }
  if (Object.hasOwn(deps, 'migrateProfileData') && (deps.migrateProfileData === null || typeof deps.migrateProfileData === 'function')) {
    cryptoProfileDeps.migrateProfileData = deps.migrateProfileData;
  }
  if (Object.hasOwn(deps, 'navigate') && (deps.navigate === null || typeof deps.navigate === 'function')) {
    cryptoProfileDeps.navigate = deps.navigate;
  }
  return previous;
}

// ═══════════════════════════════════════════════
// SENSITIVE KEY PATTERNS
// ═══════════════════════════════════════════════
const SENSITIVE_PATTERNS = [
  /^labcharts-.+-imported$/,
  /^labcharts-.+-imported-corrupt$/,
  /^labcharts-.+-chat$/,
  /^labcharts-.+-chat-threads$/,
  /^labcharts-.+-chat-t_.+$/,
  /^labcharts-.+-chatDraft_.+$/,
  /^labcharts-.+-chatPersonalityCustom$/,
  /^labcharts-.+-chatPersonalityDeleted$/,
  /^labcharts-imported$/,
  /^labcharts-profiles$/,
  /^labcharts-api-key$/,
  /^labcharts-venice-key$/,
  /^labcharts-openrouter-key$/,
  /^labcharts-routstr-key$/,
  /^labcharts-ppq-key$/,
  /^labcharts-custom-key$/,
  /^labcharts-lens-key$/,
  /^labcharts-ollama$/,
  /^labcharts-ollama-pii-key$/,
  /^labcharts-xai-voice-key$/,
  /^labcharts-elevenlabs-voice-key$/,
  /^labcharts-voice-local-server-key$/,
  /^labcharts-cashu-wallet-mnemonic$/,
  /^labcharts-meteo-config$/,
];

export function isSensitiveKey(key) {
  return SENSITIVE_PATTERNS.some(p => p.test(key))
    || isAppExtensionSyncEncryptedStorageKey(key);
}

// ═══════════════════════════════════════════════
// KEY LIFECYCLE
// ═══════════════════════════════════════════════
let _sessionKey = null;

// ═══════════════════════════════════════════════
// API KEY CACHE — sync access to decrypted API keys
// ═══════════════════════════════════════════════
const API_KEY_LS_KEYS = [
  'labcharts-api-key',
  'labcharts-venice-key',
  'labcharts-openrouter-key',
  'labcharts-routstr-key',
  'labcharts-ppq-key',
  'labcharts-lens-key',
  'labcharts-custom-key',
  'labcharts-ollama',
  'labcharts-ollama-pii-key',
  'labcharts-xai-voice-key',
  'labcharts-elevenlabs-voice-key',
  'labcharts-voice-local-server-key',
  'labcharts-cashu-wallet-mnemonic',
];

export async function decryptKeyCache() {
  clearKeyCache();
  for (const lsKey of Object.keys(localStorage)) {
    if (API_KEY_LS_KEYS.includes(lsKey) || isAppExtensionSyncEncryptedStorageKey(lsKey)) {
      const raw = localStorage[lsKey];
      if (!raw) continue;
      if (isEncryptedValue(raw) && _sessionKey) {
        const parsed = parseEncryptedValue(raw);
        if (!parsed) continue;
        try {
          const plaintext = await decrypt(_sessionKey, parsed.iv, parsed.ciphertext);
          updateKeyCache(lsKey, plaintext);
        } catch { /* skip if can't decrypt */ }
      } else if (!isEncryptedValue(raw)) {
        updateKeyCache(lsKey, raw);
      }
    }
  }
}
const PBKDF2_ITERATIONS = 600000;

export function getEncryptionEnabled() {
  return localStorage.getItem('labcharts-encryption-enabled') === 'true';
}

export function isUnlocked() {
  return _sessionKey !== null;
}

async function deriveKey(passphrase, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encrypt(key, plaintext) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

async function decrypt(key, iv, ciphertext) {
  const dec = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return dec.decode(plaintext);
}

function toBase64(arr) {
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

function fromBase64(str) {
  const bin = atob(str);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

export function isEncryptedValue(val) {
  return typeof val === 'string' && val.startsWith('v1:');
}

function parseEncryptedValue(val) {
  const parts = val.split(':');
  if (parts.length < 3 || parts[0] !== 'v1') return null;
  return { iv: fromBase64(parts[1]), ciphertext: fromBase64(parts.slice(2).join(':')) };
}

function formatEncryptedValue(iv, ciphertext) {
  return `v1:${toBase64(iv)}:${toBase64(ciphertext)}`;
}

// ═══════════════════════════════════════════════
// OBJECT ENCRYPTION (for IDB rows where the envelope IS an object)
// ═══════════════════════════════════════════════
// Wearable L1 IndexedDB stores rows as objects; we don't want to base64-
// stringify them like we do for localStorage. These helpers wrap a JSON-
// serializable plain object into `{_enc:'v1', iv:Uint8Array, ct:Uint8Array}`
// that re-serializes through structured-clone (IDB) without coercion.
//
// Returns null when encryption is off / locked — callers fall back to
// writing the plain object. Reads detect the envelope marker and decrypt
// transparently; legacy plaintext rows pass through.

async function encryptObjectWithKey(plainObj, key) {
  const json = JSON.stringify(plainObj);
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(json),
  );
  return { _enc: 'v1', iv, ct: new Uint8Array(ct) };
}

export async function encryptObject(plainObj) {
  if (!getEncryptionEnabled() || !_sessionKey) return null;
  return encryptObjectWithKey(plainObj, _sessionKey);
}

export async function decryptObject(envelope) {
  if (!envelope || envelope._enc !== 'v1' || !_sessionKey) return null;
  const dec = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: envelope.iv },
    _sessionKey,
    envelope.ct,
  );
  return JSON.parse(dec.decode(plaintext));
}

export function isEncryptedObject(o) {
  return o && typeof o === 'object' && o._enc === 'v1' &&
         o.iv instanceof Uint8Array && o.ct instanceof Uint8Array;
}
const indexedDBCryptoDeps = {
  getEncryptionEnabled, encryptObject, isEncryptedObject, decryptObject,
};
export const getCashuWalletStoreCryptoDeps = () => ({
  ...indexedDBCryptoDeps,
  encryptedGetItem,
  encryptedSetItem,
});
configureCycleStoreCrypto(indexedDBCryptoDeps);
configureWearablesStoreCrypto(indexedDBCryptoDeps);

// TEST-ONLY: injects a freshly-derived key so behavioral tests can drive
// the encrypt/decrypt round-trip without going through the passphrase
// modal. Gated on the runtime __WEARABLES_TEST flag so a missed call site can't
// reach into production. The matching `_setEncryptionEnabledForTest`
// pair lives below.
export async function _setTestSessionKey(passphrase) {
  if (!appWindow.__WEARABLES_TEST) {
    throw new Error('_setTestSessionKey is test-only — enable the runtime __WEARABLES_TEST flag first');
  }
  if (passphrase === null) { _sessionKey = null; return null; }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  _sessionKey = await deriveKey(passphrase, salt);
  return salt;
}

export async function _migrateAllStorageForTest(mode) {
  if (!appWindow.__WEARABLES_TEST) throw new Error('_migrateAllStorageForTest is test-only.');
  if (mode === 'encrypted') {
    await migrateSensitiveKeys();
    return migrateLocalIDB('encrypted');
  }
  if (mode === 'plain') {
    const migrated = await migrateLocalIDB('plain');
    await decryptAllSensitiveKeys();
    return migrated;
  }
  throw new Error(`Unsupported migration mode: ${mode}`);
}

// ═══════════════════════════════════════════════
// STORAGE WRAPPERS
// ═══════════════════════════════════════════════
export async function encryptedSetItem(key, value) {
  let stored;
  if (isSensitiveKey(key) && getEncryptionEnabled() && _sessionKey) {
    const { iv, ciphertext } = await encrypt(_sessionKey, value);
    stored = formatEncryptedValue(iv, ciphertext);
  } else {
    stored = value;
  }
  // Big-blob keys (currently `*-imported`) go to IndexedDB to escape
  // the ~5 MB localStorage cap. Failed IDB writes propagate so callers
  // can show a quota error — falling back to localStorage on failure
  // would just trade an explicit error for the silent wedge we're
  // trying to leave behind.
  if (shouldUseBlob(key)) {
    await setBlob(key, stored);
    // Best-effort cleanup of any localStorage leftover from a pre-IDB
    // install. We've already written to IDB above so the canonical
    // copy is safe.
    try { localStorage.removeItem(key); } catch {}
  } else {
    localStorage.setItem(key, stored);
  }
  if (isAppExtensionSyncEncryptedStorageKey(key)) updateKeyCache(key, value);
}

export async function encryptedGetItem(key) {
  let raw;
  if (shouldUseBlob(key)) {
    raw = await getBlob(key);
    // Migration path: pre-IDB installs have the blob in localStorage.
    // On the first read we copy it into IDB and (only on successful
    // write) clear it from localStorage. Failed migration keeps the
    // localStorage copy intact so the value isn't lost.
    if (raw == null) {
      const lsRaw = localStorage.getItem(key);
      if (lsRaw !== null) {
        raw = lsRaw;
        try {
          await setBlob(key, lsRaw);
          try { localStorage.removeItem(key); } catch {}
        } catch (e) {
          console.warn('[crypto] blob migration failed for', key, '—', getErrorMessage(e, e));
        }
      }
    }
  } else {
    raw = localStorage.getItem(key);
  }
  if (raw == null) return null;
  if (isEncryptedValue(raw) && _sessionKey) {
    const parsed = parseEncryptedValue(raw);
    if (!parsed) return raw;
    try {
      return await decrypt(_sessionKey, parsed.iv, parsed.ciphertext);
    } catch {
      return null; // wrong key or corrupt
    }
  }
  return raw;
}

// Companion to encryptedSetItem/encryptedGetItem — ensures big-blob
// keys are removed from BOTH backends. Use this for any cleanup path
// that wipes profile data, otherwise IDB residue accumulates after
// profile deletion / reset.
/**
 * @param {string} key
 * @param {{ throwOnBlobError?: boolean }} [options]
 */
export async function encryptedRemoveItem(key, options = {}) {
  if (shouldUseBlob(key)) {
    try {
      await deleteBlob(key, { throwOnError: options.throwOnBlobError });
    } catch (error) {
      if (options.throwOnBlobError) throw error;
    }
  }
  try { localStorage.removeItem(key); } catch {}
  if (isAppExtensionSyncEncryptedStorageKey(key)) updateKeyCache(key, null);
}

// ═══════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════
export async function initEncryption() {
  if (!getEncryptionEnabled()) return;
  if (needsDataProtectionStylesheet()) await loadDataProtectionStylesheetForAction();
  await new Promise((resolve) => {
    showPassphraseModal(resolve);
  });
  await migrateSensitiveKeys();
  await migrateLocalIDB('encrypted');
  await decryptKeyCache();
}


async function migrationProfileIds() {
  const ids = new Set();
  for (const profile of Array.isArray(state.profiles) ? state.profiles : []) {
    if (profile?.id) ids.add(profile.id);
  }
  if (state.currentProfile) ids.add(state.currentProfile);
  const active = localStorage.getItem('labcharts-active-profile');
  if (active) ids.add(active);
  let profilesRaw = localStorage.getItem('labcharts-profiles');
  if (profilesRaw && isEncryptedValue(profilesRaw)) {
    const parsed = parseEncryptedValue(profilesRaw);
    if (!parsed || !_sessionKey) throw new Error('Encrypted profile list could not be read for storage migration.');
    profilesRaw = await decrypt(_sessionKey, parsed.iv, parsed.ciphertext);
  }
  if (profilesRaw) {
    const profiles = JSON.parse(profilesRaw);
    for (const profile of Array.isArray(profiles) ? profiles : []) {
      if (profile?.id) ids.add(profile.id);
    }
  }
  return [...ids];
}

async function sensitiveBlobKeys() {
  const keys = new Set(['labcharts-imported']);
  for (const profileId of await migrationProfileIds()) {
    keys.add(profileStorageKey(profileId, 'imported'));
    keys.add(profileStorageKey(profileId, 'imported-corrupt'));
  }
  return [...keys];
}

async function migrateSensitiveKeys() {
  if (!_sessionKey) throw new Error('Encryption key is locked.');
  const blobKeys = await sensitiveBlobKeys();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isSensitiveKey(key)) continue;
    const raw = localStorage.getItem(key);
    if (!raw || isEncryptedValue(raw)) continue; // already encrypted
    const { iv, ciphertext } = await encrypt(_sessionKey, raw);
    localStorage.setItem(key, formatEncryptedValue(iv, ciphertext));
  }
  for (const key of blobKeys) {
    const raw = await getBlob(key);
    if (typeof raw !== 'string' || !raw || isEncryptedValue(raw)) continue;
    const { iv, ciphertext } = await encrypt(_sessionKey, raw);
    await setBlob(key, formatEncryptedValue(iv, ciphertext));
  }
}

async function decryptAllSensitiveKeys() {
  if (!_sessionKey) throw new Error('Encryption key is locked.');
  const blobKeys = await sensitiveBlobKeys();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isSensitiveKey(key)) continue;
    const raw = localStorage.getItem(key);
    if (!raw || !isEncryptedValue(raw)) continue;
    const parsed = parseEncryptedValue(raw);
    if (!parsed) throw new Error(`Encrypted value ${key} is malformed.`);
    const plaintext = await decrypt(_sessionKey, parsed.iv, parsed.ciphertext);
    localStorage.setItem(key, plaintext);
  }
  for (const key of blobKeys) {
    const raw = await getBlob(key);
    if (typeof raw !== 'string' || !isEncryptedValue(raw)) continue;
    const parsed = parseEncryptedValue(raw);
    if (!parsed) throw new Error(`Encrypted value ${key} is malformed.`);
    await setBlob(key, await decrypt(_sessionKey, parsed.iv, parsed.ciphertext));
  }
}

async function transformPayloadRows(rows, keyFields, mode) {
  const changed = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?._payload) {
      if (mode === 'plain') continue;
      const keys = {};
      const payload = { ...row };
      for (const key of keyFields) {
        keys[key] = payload[key];
        delete payload[key];
      }
      changed.push({ ...keys, _payload: await encryptObjectWithKey(payload, _sessionKey) });
      continue;
    }
    if (!isEncryptedObject(row._payload)) throw new Error('Encrypted IndexedDB row has an invalid envelope.');
    if (mode === 'encrypted') continue;
    const payload = await decryptObject(row._payload);
    if (!payload) throw new Error('Encrypted IndexedDB row could not be decrypted.');
    const keys = {};
    for (const key of keyFields) keys[key] = row[key];
    changed.push({ ...keys, ...payload });
  }
  return changed;
}

async function migrateLocalIDB(mode) {
  if (!_sessionKey) throw new Error('Encryption key is locked.');
  const cashuStore = await import('./cashu-wallet-store.js');
  cashuStore.configureCashuWalletStoreCryptoDeps(getCashuWalletStoreCryptoDeps());
  let migrated = await cashuStore.migrateCashuWalletStorage(mode);
  for (const profileId of await migrationProfileIds()) {
    const wearableRows = await transformPayloadRows(await getAllDailyRaw(profileId), ['source', 'date'], mode);
    const cycleRows = await transformPayloadRows(await getAllCycleObservationsRaw(profileId), ['source', 'date', 'importId'], mode);
    const importRows = await transformPayloadRows(await getAllCycleImportMetaRaw(profileId), ['importId', 'source'], mode);
    await upsertDailyBatchRaw(profileId, wearableRows);
    await upsertCycleObservationBatchRaw(profileId, cycleRows);
    await upsertCycleImportMetaBatchRaw(profileId, importRows);
    migrated += wearableRows.length + cycleRows.length + importRows.length;
  }
  return migrated;
}

async function unlockEncryption(passphrase) {
  const saltHex = localStorage.getItem('labcharts-encryption-salt');
  if (!saltHex) throw new Error('No encryption salt found');
  const salt = fromBase64(saltHex);
  const key = await deriveKey(passphrase, salt);

  const profilesRaw = localStorage.getItem('labcharts-profiles');
  if (profilesRaw && isEncryptedValue(profilesRaw)) {
    const parsed = parseEncryptedValue(profilesRaw);
    if (parsed) await decrypt(key, parsed.iv, parsed.ciphertext);
  }
  _sessionKey = key;
}

async function prepareEncryption(passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem('labcharts-encryption-salt', toBase64(salt));
  _sessionKey = await deriveKey(passphrase, salt);
  localStorage.setItem('labcharts-encryption-enabled', 'true');
}

async function migrateEncryptionStorage() {
  await migrateSensitiveKeys();
  await migrateLocalIDB('encrypted');
  await decryptKeyCache();
}

async function disableEncryptionStorage() {
  // Decrypt every storage backend before dropping the only in-memory key.
  await migrateLocalIDB('plain');
  await decryptAllSensitiveKeys();
  localStorage.removeItem('labcharts-encryption-enabled');
  localStorage.removeItem('labcharts-encryption-salt');
  _sessionKey = null;
  clearKeyCache();
}

async function changeEncryptionPassphrase(oldPassphrase, newPassphrase) {
  const oldSalt = fromBase64(localStorage.getItem('labcharts-encryption-salt'));
  const oldKey = await deriveKey(oldPassphrase, oldSalt);

  const profilesRaw = localStorage.getItem('labcharts-profiles');
  if (profilesRaw && isEncryptedValue(profilesRaw)) {
    const parsed = parseEncryptedValue(profilesRaw);
    if (parsed) await decrypt(oldKey, parsed.iv, parsed.ciphertext);
  }

  // Decrypt every backend under the old key before replacing it.
  _sessionKey = oldKey;
  await migrateLocalIDB('plain');
  await decryptAllSensitiveKeys();

  // Re-encrypt localStorage, blob storage, and raw local databases.
  const newSalt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem('labcharts-encryption-salt', toBase64(newSalt));
  const newKey = await deriveKey(newPassphrase, newSalt);
  _sessionKey = newKey;
  await migrateSensitiveKeys();
  await migrateLocalIDB('encrypted');
  await decryptKeyCache();
}


// ═══════════════════════════════════════════════
// Backup/restore, auto-backup, folder backup extracted to js/backup.js
import { buildBackupSnapshot, configureBackupRuntimeDeps, scheduleAutoBackup, openBackupDB, initFolderBackup } from './backup.js';
export { buildBackupSnapshot, scheduleAutoBackup, openBackupDB, initFolderBackup };

configureBackupRuntimeDeps({ encryptedGetItem, getEncryptionEnabled });
configureCryptoUi({
  changeEncryptionPassphrase,
  clearEncryptionSession: () => { _sessionKey = null; },
  disableEncryptionStorage,
  getEncryptionEnabled,
  migrateEncryptionStorage,
  prepareEncryption,
  unlockEncryption,
});

// ═══════════════════════════════════════════════
// CROSS-TAB SYNC (BroadcastChannel)
// ═══════════════════════════════════════════════
let _bc = null;

export function initBroadcastChannel() {
  if (typeof BroadcastChannel === 'undefined') return;
  _bc = new BroadcastChannel('labcharts-sync');
  _bc.onmessage = async (event) => {
    const { type, profileId } = event.data || {};
    if (type === 'data-changed' && profileId === state.currentProfile) {
      // Re-read from localStorage and re-render
      const raw = await encryptedGetItem(profileStorageKey(profileId, 'imported'));
      if (raw) {
        try {
          state.importedData = JSON.parse(raw);
          ensureImportedArray(state.importedData, 'notes');
          ensureImportedArray(state.importedData, 'supplements');
          cryptoProfileDeps.migrateProfileData?.(state.importedData);
          buildCryptoSidebar();
          // buildSidebar resets the .active class to Dashboard, so source
          // the target view from state.currentView (kept in sync by
          // navigate) rather than re-reading the stale DOM.
          navigateCryptoView(state.currentView || 'dashboard');
        } catch { /* ignore parse errors */ }
      }
    }
  };
}

export function broadcastDataChanged(profileId) {
  if (_bc) {
    _bc.postMessage({ type: 'data-changed', profileId });
  }
}
