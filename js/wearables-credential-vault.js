// @ts-check
// wearables-credential-vault.js — always-encrypted, device-local OAuth secrets
//
// Google Health scopes are restricted and its policy requires credentials to
// be encrypted at rest. The normal wearable connection record lives inside
// importedData, so it is deliberately metadata-only for adapters using this
// vault. Access and refresh tokens are encrypted with a non-extractable
// AES-GCM CryptoKey stored in the profile's existing wearable IndexedDB.
//
// Neither the key nor the encrypted token envelope is included in profile
// sync or backups. Moving to another browser therefore requires reconnecting,
// which is preferable to copying a reusable health-data credential.

import {
  decryptWearableDeviceLocalValue,
  deleteMeta,
  encryptWearableDeviceLocalValue,
  getMeta,
  setMeta,
} from './wearables-store.js';

const RECORD_PREFIX = 'credential-vault-record:v1:';

function recordKey(adapterId) {
  return `${RECORD_PREFIX}${adapterId}`;
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
    await setMeta(profileId, recordKey(adapterId), {
      ...encrypted,
    });
  });
}

export async function loadWearableCredentials(profileId, adapterId) {
  if (!profileId || !adapterId) return null;
  const record = await getMeta(profileId, recordKey(adapterId));
  const parsed = await decryptWearableDeviceLocalValue(profileId, record);
  if (!parsed) return null;
  return {
    accessToken: typeof parsed.accessToken === 'string' ? parsed.accessToken : null,
    refreshToken: typeof parsed.refreshToken === 'string' ? parsed.refreshToken : null,
  };
}

export async function deleteWearableCredentials(profileId, adapterId) {
  if (!profileId || !adapterId) return;
  await withVaultLock(profileId, () => deleteMeta(profileId, recordKey(adapterId)));
}
