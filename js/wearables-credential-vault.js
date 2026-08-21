// @ts-check
// wearables-credential-vault.js — always-encrypted, device-local app secrets
//
// Every wearable connection is treated as sensitive. The normal wearable
// connection record lives inside importedData, so it is deliberately
// metadata-only. Access and refresh tokens are encrypted with a non-extractable
// AES-GCM CryptoKey stored in the profile's existing wearable IndexedDB.
//
// Neither the key nor the encrypted token envelope is included in profile
// sync or backups. Moving to another browser therefore requires reconnecting,
// which is preferable to copying a reusable health-data credential.

import {
  bumpMetaVersionAndDelete,
  decryptWearableDeviceLocalValue,
  encryptWearableDeviceLocalValue,
  getMetaVersioned,
  setMetaVersioned,
} from './wearables-store.js';

const RECORD_PREFIX = 'credential-vault-record:v1:';
const GENERATION_PREFIX = 'credential-vault-generation:v1:';
const LOCAL_MARKER_PREFIX = 'labcharts-wearable-credential-local:';
const LOCAL_GENERATION_PREFIX = 'labcharts-wearable-credential-generation:';
const APP_CREDENTIAL_PROFILE_ID = 'credential-vault';

export const VAULTED_CREDENTIAL_ADAPTERS = new Set([
  'oura', 'whoop', 'withings', 'ultrahuman', 'fitbit', 'google_health', 'polar',
]);

export function usesWearableCredentialVault(adapterId) {
  return VAULTED_CREDENTIAL_ADAPTERS.has(adapterId);
}

function vaultBytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function vaultBytesFromBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// General app credentials share the proven non-extractable wearable vault
// primitive but use a dedicated device-local profile database. Including the
// storage key inside the authenticated payload prevents envelope substitution.
export async function encryptDeviceCredential(storageKey, plaintext) {
  const envelope = await encryptWearableDeviceLocalValue(APP_CREDENTIAL_PROFILE_ID, {
    storageKey,
    plaintext: String(plaintext),
  });
  return `d1:${vaultBytesToBase64(envelope.iv)}:${vaultBytesToBase64(new Uint8Array(envelope.ciphertext))}`;
}

export async function decryptDeviceCredential(storageKey, value) {
  if (typeof value !== 'string' || !value.startsWith('d1:')) return null;
  const parts = value.split(':');
  if (parts.length !== 3) return null;
  try {
    const decrypted = await decryptWearableDeviceLocalValue(APP_CREDENTIAL_PROFILE_ID, {
      version: 1,
      iv: vaultBytesFromBase64(parts[1]),
      ciphertext: vaultBytesFromBase64(parts[2]),
    });
    return decrypted?.storageKey === storageKey && typeof decrypted.plaintext === 'string'
      ? decrypted.plaintext
      : null;
  } catch {
    return null;
  }
}

export function wearableCredentialDisconnectedError(displayName = 'Wearable') {
  /** @type {Error & { code?: string }} */
  const error = new Error(`${displayName} is disconnected.`);
  error.code = 'disconnected';
  return error;
}

function recordKey(adapterId) {
  return `${RECORD_PREFIX}${adapterId}`;
}

function generationKey(adapterId) {
  return `${GENERATION_PREFIX}${adapterId}`;
}

export function wearableCredentialGenerationKey(adapterId) {
  return generationKey(adapterId);
}

function normalizedGeneration(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

export function hasLocalWearableCredential(profileId, adapterId, generation, fallback = false) {
  try {
    const expected = normalizedGeneration(generation);
    const marker = localStorage.getItem(`${LOCAL_MARKER_PREFIX}${profileId}:${adapterId}`);
    const rawCurrent = Number(localStorage.getItem(`${LOCAL_GENERATION_PREFIX}${profileId}:${adapterId}`));
    const current = Number.isSafeInteger(rawCurrent) && rawCurrent >= 0 ? rawCurrent : 0;
    return current === expected && (marker === String(expected) || (expected === 0 && marker === '1'));
  } catch { return fallback; }
}

export function markLocalWearableCredential(profileId, adapterId, generation) {
  const next = normalizedGeneration(generation);
  const generationKeyName = `${LOCAL_GENERATION_PREFIX}${profileId}:${adapterId}`;
  const rawCurrent = Number(localStorage.getItem(generationKeyName));
  const current = Number.isSafeInteger(rawCurrent) && rawCurrent >= 0 ? rawCurrent : 0;
  if (current > next) return false;
  localStorage.setItem(generationKeyName, String(next));
  localStorage.setItem(`${LOCAL_MARKER_PREFIX}${profileId}:${adapterId}`, String(next));
  return true;
}

export function clearLocalWearableCredential(profileId, adapterId, generation) {
  const next = normalizedGeneration(generation);
  const generationKeyName = `${LOCAL_GENERATION_PREFIX}${profileId}:${adapterId}`;
  const rawCurrent = Number(localStorage.getItem(generationKeyName));
  const current = Number.isSafeInteger(rawCurrent) && rawCurrent >= 0 ? rawCurrent : 0;
  localStorage.setItem(generationKeyName, String(Math.max(current, next)));
  localStorage.removeItem(`${LOCAL_MARKER_PREFIX}${profileId}:${adapterId}`);
}

function staleCredentialWriteError() {
  /** @type {Error & { code?: string }} */
  const error = new Error('Connection was removed while credentials were being refreshed.');
  error.code = 'disconnected';
  return error;
}

async function withVaultLock(profileId, callback) {
  const locks = globalThis.navigator?.locks;
  if (locks && typeof locks.request === 'function') {
    return locks.request(`getbased-wearable-credential-vault:${profileId}`, { mode: 'exclusive' }, callback);
  }
  return callback();
}

export async function saveWearableCredentials(profileId, adapterId, credentials) {
  if (!profileId || !adapterId) throw new Error('Credential vault requires a profile and adapter.');
  if (!credentials?.accessToken && !credentials?.refreshToken) {
    throw new Error('Credential vault requires an access or refresh token.');
  }
  return withVaultLock(profileId, async () => {
    const encrypted = await encryptWearableDeviceLocalValue(profileId, {
      accessToken: credentials.accessToken || null,
      refreshToken: credentials.refreshToken || null,
    });
    const expectedGeneration = Number.isSafeInteger(credentials.credentialGeneration)
      ? credentials.credentialGeneration
      : null;
    const result = await setMetaVersioned(profileId, recordKey(adapterId), {
      ...encrypted,
    }, generationKey(adapterId), expectedGeneration);
    if (!result.saved) throw staleCredentialWriteError();
    return result.version;
  });
}

export async function loadWearableCredentials(profileId, adapterId) {
  if (!profileId || !adapterId) return null;
  const snapshot = await getMetaVersioned(profileId, recordKey(adapterId), generationKey(adapterId));
  const parsed = await decryptWearableDeviceLocalValue(profileId, snapshot.value);
  if (!parsed) return null;
  return {
    accessToken: typeof parsed.accessToken === 'string' ? parsed.accessToken : null,
    refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : null,
    credentialGeneration: snapshot.version,
  };
}

export async function deleteWearableCredentials(profileId, adapterId, options = {}) {
  if (!profileId || !adapterId) return;
  return withVaultLock(profileId, () => bumpMetaVersionAndDelete(
    profileId,
    recordKey(adapterId),
    generationKey(adapterId),
    options,
  ));
}
