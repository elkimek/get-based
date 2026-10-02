import { bytesToBase64 as toBase64, _base64ToBytes as fromBase64 } from './base64.js';
import { configureValidRuntimeCallbacks } from './runtime-callbacks.js';
// crypto.ts — Encryption at rest, backup/restore, cross-tab sync

import type { ProfileData } from '../types/app-state.js';
import type { EncryptedEnvelopeCheck, PassphraseEnvelope } from './wearable-storage-types.js';
import type { StorageMode } from './cashu-wallet-storage-types.js';

interface CryptoProfileDeps {
  buildSidebar: null | (() => void);
  invalidateData: null | (() => void);
  migrateProfileData: null | ((data: ProfileData) => unknown);
  navigate: null | ((view: string) => void);
}
export interface ObjectEncryptionEnvelope extends PassphraseEnvelope {
  _enc: 'v1'; iv: Uint8Array<ArrayBuffer>; ct: Uint8Array<ArrayBuffer>;
}

import { getErrorMessage } from './caught-error.js';
import { isAppExtensionSyncEncryptedStorageKey } from './app-extension-runtime.js';
import { state } from './state.js';
import { queueProfileDataWrite, profileDataBaseline, rebaseLiveProfileData, adoptProfileData, rememberProfileData } from './profile-data-writes.js';
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
  decryptWearableDeviceLocalValue,
  deleteMeta,
  encryptWearableDeviceLocalValue,
  getAllDailyRaw,
  getMeta,
  setMeta,
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

const appWindow = (typeof window !== 'undefined' ? window : {}) as Window & typeof globalThis & { __WEARABLES_TEST?: boolean };

const needsDataProtectionStylesheet = () => typeof document !== 'undefined' && !!document.querySelector('[data-data-protection-stylesheet-anchor]') && !isDataProtectionStylesheetLoaded();
const cryptoProfileDeps: CryptoProfileDeps = {
  buildSidebar: null,
  invalidateData: null,
  migrateProfileData: null,
  navigate: null,
};

function navigateCryptoView(view: string) {
  cryptoProfileDeps.navigate?.(view);
}

function buildCryptoSidebar() {
  cryptoProfileDeps.buildSidebar?.();
}

export function configureCryptoProfileDeps(deps: Partial<CryptoProfileDeps> = {}) {
  return configureValidRuntimeCallbacks(cryptoProfileDeps, deps, ["buildSidebar","invalidateData","migrateProfileData","navigate"]);
}

// ═══════════════════════════════════════════════
// SENSITIVE KEY PATTERNS
// ═══════════════════════════════════════════════
const SENSITIVE_PATTERNS = [
  /^labcharts-.+-correlation-workspace$/,
  /^labcharts-.+-imported$/,
  /^labcharts-.+-imported-corrupt$/,
  /^labcharts-.+-chat$/,
  /^labcharts-.+-chat-threads$/,
  /^labcharts-.+-agent-draft-claims$/,
  /^labcharts-.+-chat-t_.+$/,
  /^labcharts-.+-chatDraft_.+$/,
  /^labcharts-.+-chatPersonalityCustom$/,
  /^labcharts-.+-chatPersonalityDeleted$/,
  /^labcharts-imported$/,
  /^labcharts-profiles$/,
  /^labcharts-api-key$/,
  /^labcharts-agent-host-token$/,
  /^labcharts-venice-key$/,
  /^labcharts-openrouter-key$/,
  /^labcharts-routstr-key$/,
  /^labcharts-routstr-sessions$/,
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

export function isSensitiveKey(key: string) {
  return SENSITIVE_PATTERNS.some(p => p.test(key))
    || isAppExtensionSyncEncryptedStorageKey(key);
}

const whoopStorageDeps = {
  decryptWearableDeviceLocalValue,
  deleteMeta,
  encryptWearableDeviceLocalValue,
  getMeta,
  setMeta,
};
const transformWhoopStorage = (key: string, value: string, mode: string, encrypted = false) => import('./wearables-whoop-storage.js')
  .then(module => module.transformWhoopStorageValue(key, value, mode, encrypted, whoopStorageDeps));

// ═══════════════════════════════════════════════
// KEY LIFECYCLE
// ═══════════════════════════════════════════════
let _sessionKey: CryptoKey | null = null;

let deviceCredentialCryptoLoad: Promise<typeof import('./wearables-credential-vault.js')> | null = null;
function loadDeviceCredentialCrypto() {
  if (!deviceCredentialCryptoLoad) deviceCredentialCryptoLoad = import('./wearables-credential-vault.js');
  return deviceCredentialCryptoLoad;
}
function isDeviceCredentialValue(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('d1:');
}
async function encryptDeviceCredential(storageKey: string, plaintext: string) {
  return (await loadDeviceCredentialCrypto()).encryptDeviceCredential(storageKey, plaintext);
}
async function decryptDeviceCredential(storageKey: string, envelope: string) {
  return (await loadDeviceCredentialCrypto()).decryptDeviceCredential(storageKey, envelope);
}

// ═══════════════════════════════════════════════
// API KEY CACHE — sync access to decrypted API keys
// ═══════════════════════════════════════════════
const API_KEY_LS_KEYS = [
  'labcharts-api-key',
  'labcharts-agent-host-token',
  'labcharts-venice-key',
  'labcharts-openrouter-key',
  'labcharts-routstr-key',
  'labcharts-routstr-sessions',
  'labcharts-ppq-key',
  'labcharts-lens-key',
  'labcharts-custom-key',
  'labcharts-ollama',
  'labcharts-ollama-pii-key',
  'labcharts-xai-voice-key',
  'labcharts-elevenlabs-voice-key',
  'labcharts-voice-local-server-key',
  'labcharts-cashu-wallet-mnemonic',
  'labcharts-meteo-config',
];

export function isCredentialKey(key: string) {
  return API_KEY_LS_KEYS.includes(key) || isAppExtensionSyncEncryptedStorageKey(key);
}

export async function decryptKeyCache() {
  clearKeyCache();
  for (let index = 0; index < localStorage.length; index++) {
    const lsKey = localStorage.key(index);
    if (!lsKey || !isCredentialKey(lsKey)) continue;
    const raw = localStorage.getItem(lsKey);
    if (raw === null) continue;
    if (isDeviceCredentialValue(raw)) {
      try {
        const plaintext = await decryptDeviceCredential(lsKey, raw);
        if (plaintext !== null) updateKeyCache(lsKey, plaintext);
      } catch (error) {
        console.warn(`[crypto] device credential ${lsKey} could not be loaded`, error);
      }
    } else if (isEncryptedValue(raw) && _sessionKey) {
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
const PBKDF2_ITERATIONS = 600000;

export function getEncryptionEnabled() {
  return localStorage.getItem('labcharts-encryption-enabled') === 'true';
}

export function isUnlocked() {
  return _sessionKey !== null;
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
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

async function encrypt(key: CryptoKey, plaintext: string) {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  return { iv, ciphertext: new Uint8Array(ciphertext) };
}

async function decrypt(key: CryptoKey, iv: Uint8Array<ArrayBuffer>, ciphertext: Uint8Array<ArrayBuffer>) {
  const dec = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return dec.decode(plaintext);
}

export function isEncryptedValue(val: unknown): val is string {
  return typeof val === 'string' && val.startsWith('v1:');
}

function parseEncryptedValue(val: string) {
  const parts = val.split(':');
  if (parts.length < 3 || parts[0] !== 'v1') return null;
  return { iv: fromBase64(parts[1]!), ciphertext: fromBase64(parts.slice(2).join(':')) };
}

function formatEncryptedValue(iv: Uint8Array, ciphertext: Uint8Array) {
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

async function encryptObjectWithKey(plainObj: unknown, key: CryptoKey): Promise<ObjectEncryptionEnvelope> {
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

export async function encryptObject(plainObj: unknown) {
  if (!getEncryptionEnabled() || !_sessionKey) return null;
  return encryptObjectWithKey(plainObj, _sessionKey);
}

export async function decryptObject<Value = Record<string, unknown>>(envelope: unknown): Promise<Value | null> {
  if (!envelope || (envelope as Partial<ObjectEncryptionEnvelope>)._enc !== 'v1' || !_sessionKey) return null;
  const dec = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: (envelope as ObjectEncryptionEnvelope).iv },
    _sessionKey,
    (envelope as ObjectEncryptionEnvelope).ct,
  );
  return JSON.parse(dec.decode(plaintext)) as Value;
}

export function isEncryptedObject(o: unknown): EncryptedEnvelopeCheck {
  return (o && typeof o === 'object' && (o as Partial<ObjectEncryptionEnvelope>)._enc === 'v1' &&
         (o as Partial<ObjectEncryptionEnvelope>).iv instanceof Uint8Array && (o as Partial<ObjectEncryptionEnvelope>).ct instanceof Uint8Array) as EncryptedEnvelopeCheck;
}
const indexedDBCryptoDeps = {
  getEncryptionEnabled, encryptObject, isEncryptedObject, decryptObject,
};
export const getCashuWalletStoreCryptoDeps = () => ({
  ...indexedDBCryptoDeps,
  encryptedGetItem,
  encryptedSetItem: encryptedSetCredentialItem,
});
configureCycleStoreCrypto(indexedDBCryptoDeps);
configureWearablesStoreCrypto(indexedDBCryptoDeps);

// TEST-ONLY: injects a freshly-derived key so behavioral tests can drive
// the encrypt/decrypt round-trip without going through the passphrase
// modal. Gated on the runtime __WEARABLES_TEST flag so a missed call site can't
// reach into production. The matching `_setEncryptionEnabledForTest`
// pair lives below.
export async function _setTestSessionKey(passphrase: string | null) {
  if (!appWindow.__WEARABLES_TEST) {
    throw new Error('_setTestSessionKey is test-only — enable the runtime __WEARABLES_TEST flag first');
  }
  if (passphrase === null) { _sessionKey = null; return null; }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  _sessionKey = await deriveKey(passphrase, salt);
  return salt;
}

export async function _migrateAllStorageForTest(mode: string) {
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
export async function encryptedSetCredentialItem(key: string, value: string) {
  if (!isCredentialKey(key)) throw new Error(`Credential key is not allowlisted: ${key}`);
  let stored;
  if (getEncryptionEnabled()) {
    if (!_sessionKey) throw new Error('Credential storage is locked; unlock encryption before saving.');
    const { iv, ciphertext } = await encrypt(_sessionKey, value);
    stored = formatEncryptedValue(iv, ciphertext);
  } else {
    stored = await encryptDeviceCredential(key, value);
  }
  localStorage.setItem(key, stored);
  updateKeyCache(key, value);
}

export async function encryptedSetItem(key: string, value: string) {
  if (isCredentialKey(key)) return encryptedSetCredentialItem(key, value);
  const valueForStorage = key.endsWith('-imported')
    ? (await transformWhoopStorage(key, value, 'protect')).value
    : value;
  if (isSensitiveKey(key) && getEncryptionEnabled() && !_sessionKey) {
    throw new Error('Profile storage is locked; unlock encryption before saving.');
  }
  let stored;
  if (isSensitiveKey(key) && getEncryptionEnabled() && _sessionKey) {
    const { iv, ciphertext } = await encrypt(_sessionKey, valueForStorage);
    stored = formatEncryptedValue(iv, ciphertext);
  } else {
    stored = valueForStorage;
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
}

export async function encryptedGetItem(key: string) {
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
  let plaintext: string | null = raw;
  if (isDeviceCredentialValue(raw)) {
    plaintext = await decryptDeviceCredential(key, raw);
    if (plaintext !== null && isCredentialKey(key)) updateKeyCache(key, plaintext);
  } else if (isEncryptedValue(raw) && _sessionKey) {
    const parsed = parseEncryptedValue(raw);
    if (!parsed) return raw;
    try {
      plaintext = await decrypt(_sessionKey, parsed.iv, parsed.ciphertext);
      if (isCredentialKey(key)) updateKeyCache(key, plaintext);
    } catch {
      return null; // wrong key or corrupt
    }
  }
  if (plaintext === null) return null;

  if (!key.endsWith('-imported')) return plaintext;
  const hydrated = await transformWhoopStorage(key, plaintext, 'hydrate', isEncryptedValue(raw));
  if (hydrated.migrated) {
    if (shouldUseBlob(key)) await setBlob(key, hydrated.storedValue);
    else localStorage.setItem(key, hydrated.storedValue);
  }
  return hydrated.value;
}

// Companion to encryptedSetItem/encryptedGetItem — ensures big-blob
// keys are removed from BOTH backends. Use this for any cleanup path
// that wipes profile data, otherwise IDB residue accumulates after
// profile deletion / reset.
export async function encryptedRemoveItem(key: string, options: { throwOnBlobError?: boolean | undefined } = {}) {
  if (shouldUseBlob(key)) {
    try {
      await deleteBlob(key, { throwOnError: options.throwOnBlobError });
    } catch (error) {
      if (options.throwOnBlobError) throw error;
    }
  }
  try { localStorage.removeItem(key); } catch {}
  if (isSensitiveKey(key)) updateKeyCache(key, null);
}

// ═══════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════
export async function initEncryption() {
  if (!getEncryptionEnabled()) {
    const volatileCredentials = await migrateDeviceProtectedKeys();
    await decryptKeyCache();
    for (const [key, value] of volatileCredentials) updateKeyCache(key, value);
    return;
  }
  if (needsDataProtectionStylesheet()) await loadDataProtectionStylesheetForAction();
  await new Promise<void>((resolve) => {
    showPassphraseModal(resolve);
  });
  await migrateSensitiveKeys();
  await migrateLocalIDB('encrypted');
  await decryptKeyCache();
}

async function migrationProfileIds() {
  const ids = new Set<string>();
  for (const profile of Array.isArray(state.profiles) ? state.profiles : []) {
    if (profile?.id) ids.add(profile.id as string);
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
    const profiles: unknown = JSON.parse(profilesRaw);
    for (const profile of (Array.isArray(profiles) ? profiles : []) as Array<{ id?: unknown } | null>) {
      if (profile?.id) ids.add(profile.id as string);
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
    if (raw === null || isEncryptedValue(raw)) continue; // already encrypted
    const plaintext = isDeviceCredentialValue(raw)
      ? await decryptDeviceCredential(key, raw)
      : raw;
    if (plaintext === null) throw new Error(`Device credential ${key} could not be decrypted.`);
    const { iv, ciphertext } = await encrypt(_sessionKey, plaintext);
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
    if (raw === null || !isEncryptedValue(raw)) continue;
    const parsed = parseEncryptedValue(raw);
    if (!parsed) throw new Error(`Encrypted value ${key} is malformed.`);
    let plaintext = await decrypt(_sessionKey, parsed.iv, parsed.ciphertext);
    if (key.endsWith('-imported')) plaintext = (await transformWhoopStorage(key, plaintext, 'protect')).value;
    if (isCredentialKey(key)) {
      localStorage.setItem(key, await encryptDeviceCredential(key, plaintext));
      updateKeyCache(key, plaintext);
    } else {
      localStorage.setItem(key, plaintext);
    }
  }
  for (const key of blobKeys) {
    const raw = await getBlob(key);
    if (typeof raw !== 'string' || !isEncryptedValue(raw)) continue;
    const parsed = parseEncryptedValue(raw);
    if (!parsed) throw new Error(`Encrypted value ${key} is malformed.`);
    let plaintext = await decrypt(_sessionKey, parsed.iv, parsed.ciphertext);
    if (key.endsWith('-imported')) plaintext = (await transformWhoopStorage(key, plaintext, 'protect')).value;
    await setBlob(key, plaintext);
  }
}

async function migrateDeviceProtectedKeys() {
  const volatileCredentials = new Map<string, string>();
  const storageKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
  for (const key of storageKeys) {
    if (!key || !isCredentialKey(key)) continue;
    const raw = localStorage.getItem(key);
    if (raw === null || isDeviceCredentialValue(raw) || isEncryptedValue(raw)) continue;
    try {
      localStorage.setItem(key, await encryptDeviceCredential(key, raw));
      updateKeyCache(key, raw);
    } catch (error) {
      // A blocked/evicted IndexedDB vault must not abort the rest of startup
      // or leave a legacy credential in clear text. Keep it usable in memory
      // for this session; the provider will ask for it again after reload.
      volatileCredentials.set(key, raw);
      try { localStorage.removeItem(key); } catch {}
      console.warn(`[crypto] device protection unavailable for ${key}; keeping it in memory only`, error);
    }
  }
  return volatileCredentials;
}

async function transformPayloadRows<Row extends Record<string, unknown>>(rows: Row[], keyFields: Array<keyof Row & string>, mode: StorageMode) {
  const changed: Row[] = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row?._payload) {
      if (mode === 'plain') continue;
      const keys: Record<string, unknown> = {};
      const payload = { ...row };
      for (const key of keyFields) {
        keys[key] = payload[key];
        delete payload[key];
      }
      changed.push({ ...keys, _payload: await encryptObjectWithKey(payload, _sessionKey!) } as unknown as Row);
      continue;
    }
    if (!isEncryptedObject(row._payload)) throw new Error('Encrypted IndexedDB row has an invalid envelope.');
    if (mode === 'encrypted') continue;
    const payload = await decryptObject(row._payload);
    if (!payload) throw new Error('Encrypted IndexedDB row could not be decrypted.');
    const keys: Record<string, unknown> = {};
    for (const key of keyFields) keys[key] = row[key];
    changed.push({ ...keys, ...payload } as Row);
  }
  return changed;
}

async function migrateLocalIDB(mode: StorageMode) {
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

async function unlockEncryption(passphrase: string) {
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

async function prepareEncryption(passphrase: string) {
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
  await decryptKeyCache();
}

async function changeEncryptionPassphrase(oldPassphrase: string, newPassphrase: string) {
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

configureBackupRuntimeDeps({
  encryptedGetItem,
  encryptedSetItem: encryptedSetCredentialItem,
  getEncryptionEnabled,
  isCredentialKey,
});
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
let _bc: BroadcastChannel | null = null;

export function initBroadcastChannel() {
  if (typeof BroadcastChannel === 'undefined') return;
  _bc = new BroadcastChannel('labcharts-sync');
  _bc.onmessage = async (event) => {
    const { type, profileId } = (event.data || {}) as { type?: unknown; profileId?: string };
    if (type === 'data-changed' && profileId === state.currentProfile) {
      // Serialize reads with saves so an older broadcast cannot roll back a
      // newer commit. Retain unsaved edits and their conflict baseline.
      await queueProfileDataWrite(profileId, async () => {
        const raw = await encryptedGetItem(profileStorageKey(profileId, 'imported'));
        if (!raw || profileId !== state.currentProfile) return;
        const persisted = JSON.parse(raw) as ProfileData;
        ensureImportedArray(persisted, 'notes');
        ensureImportedArray(persisted, 'supplements');
        cryptoProfileDeps.migrateProfileData?.(persisted);
        const live = state.importedData;
        const baseline = profileDataBaseline(live);
        if (!baseline) return; // Unknown snapshot: do not discard local edits.
        const result = rebaseLiveProfileData(baseline, live, persisted);
        state.importedData = adoptProfileData(live, result.data);
        rememberProfileData(state.importedData, result.baseline);
        cryptoProfileDeps.invalidateData?.();
        buildCryptoSidebar();
        navigateCryptoView(state.currentView || 'dashboard');
      }).catch(() => { /* retain current data if the remote snapshot cannot be read */ });
    }
  };
}

export function broadcastDataChanged(profileId: string) {
  if (_bc) {
    _bc.postMessage({ type: 'data-changed', profileId });
  }
}
