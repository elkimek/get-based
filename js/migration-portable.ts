import { _base64ToBytes, bytesToBase64 } from './base64.js';
import { openDataKey } from './crypto-passphrase-key.js';
import { parseProtectedStorageObject, serializeProtectedStorageObject } from './storage-object-codec.js';
import { decryptMigrationSourceValue, decryptMigrationDeviceValue, encryptMigrationDeviceValue } from './migration-crypto.js';
import type { MigrationDatabase, MigrationRecord } from './migration-database.js';

export interface MigrationSyncRecovery { mnemonic: string; ownerId: string; relay: string | null }
export interface MigrationInventory {
  profiles: number; meals: number; wearableRows: number; chatRecords: number;
  textDrafts: number; savedSnapshots: number; walletRecovery: boolean;
}
export interface MigrationPortableData {
  local: Record<string, string>; databases: MigrationDatabase[]; credentials: Record<string, string>;
  syncRecovery: MigrationSyncRecovery | null; inventory: MigrationInventory;
}
export interface MigrationPortableOptions { allowMissingLegacySync?: boolean }
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A saved record has an unsupported shape.');
  return value as Record<string, unknown>;
};
function isPassphraseEnvelope(value: unknown): boolean {
  return !!value && typeof value === 'object' && !Array.isArray(value) && (value as Record<string, unknown>)._enc === 'v1';
}
export function excludedMigrationLocalKey(key: string): boolean {
  if (['labcharts-sync-evolu8-identity-token', 'labcharts-sync-relay'].includes(key)) return false;
  return key === 'labcharts-legal-acceptance' || key === 'labcharts-migration-pending'
    || key === 'labcharts-companion-pairing'
    || /^labcharts-(?:sync-|wearable-credential-|agent-host-token$|agent-access-revocation-)/.test(key)
    || /-(?:sync-(?:ts|dirty|cutover)|app-control-|agent-draft-claims)/.test(key);
}
export async function sourceMigrationKey(local: Record<string, string>, passphrase: string): Promise<CryptoKey | null> {
  if (local['labcharts-encryption-enabled'] !== 'true') return null;
  if (!passphrase) throw new Error('Enter the original application passphrase as well as the migration password.');
  const manifest = local['labcharts-encryption-salt'] ?? '';
  if (!manifest) throw new Error('The source encryption salt is missing or invalid. Keep the source browser and its saved backups.');
  let key: CryptoKey;
  try { key = await openDataKey(passphrase, manifest); }
  catch { throw new Error('The original application passphrase is incorrect or its encryption key manifest is damaged.'); }
  try {
    const profiles = local['labcharts-profiles'];
    if (profiles?.startsWith('v1:')) {
      if (!Array.isArray(JSON.parse(await decryptMigrationSourceValue(key, profiles)))) throw new Error('Invalid profiles.');
    } else if (!profiles && local['labcharts-imported']?.startsWith('v1:')) {
      JSON.parse(await decryptMigrationSourceValue(key, local['labcharts-imported']));
    }
  } catch { throw new Error('The original application passphrase is incorrect or its profile index is damaged.'); }
  return key;
}
export async function openMigrationPassphraseObject(key: CryptoKey | null, value: unknown): Promise<Record<string, unknown>> {
  if (!key) throw new Error('The original application passphrase is needed to read protected wearable history.');
  const envelope = object(value);
  if (envelope._enc !== 'v1' || !(envelope.iv instanceof Uint8Array) || !(envelope.ct instanceof Uint8Array)) throw new Error('Unsupported source wearable protection.');
  const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: new Uint8Array(envelope.iv)}, key, new Uint8Array(envelope.ct));
  return object(parseProtectedStorageObject(new TextDecoder().decode(plain)));
}
export async function sealMigrationPassphraseObject(key: CryptoKey, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, new TextEncoder().encode(serializeProtectedStorageObject(value)));
  return {_enc: 'v1', iv, ct: new Uint8Array(ct)};
}
function wearableKey(database: MigrationDatabase): CryptoKey | undefined {
  const row = database.stores.find(store => store.name === 'meta')?.records.find(record => record.key === 'credential-vault-key:v1');
  const key = row ? object(row.value).v : undefined;
  return key && typeof key === 'object' && (key as CryptoKey).algorithm?.name === 'AES-GCM' ? key as CryptoKey : undefined;
}
async function deviceRead(key: CryptoKey | undefined, value: unknown) {
  if (!key) throw new Error('A browser-only encryption key is missing. Keep the original browser and its saved backups.');
  return decryptMigrationDeviceValue(key, value);
}

async function decryptDeviceCredentialString(credentialDb: MigrationDatabase | undefined, storageKey: string, value: string): Promise<string> {
  const parts = value.split(':');
  if (parts.length !== 3 || parts[0] !== 'd1') throw new Error('A saved credential has invalid protection.');
  const decrypted = object(await deviceRead(credentialDb ? wearableKey(credentialDb) : undefined,
    {version: 1, iv: _base64ToBytes(parts[1]!), ciphertext: _base64ToBytes(parts[2]!)}));
  if (decrypted.storageKey !== storageKey || typeof decrypted.plaintext !== 'string') throw new Error('A saved credential could not be verified.');
  return decrypted.plaintext;
}
async function unwrapNutritionEnvelope(raw: unknown, sourceKey: CryptoKey | null): Promise<{envelope: unknown; wrapped: boolean}> {
  if (!isPassphraseEnvelope(raw)) return {envelope: raw, wrapped: false};
  const inner = await openMigrationPassphraseObject(sourceKey, raw);
  if (inner.version !== 1 || typeof inner.iv !== 'string' || typeof inner.ciphertext !== 'string') {
    throw new Error('Unsupported source nutrition protection.');
  }
  return {envelope: {version: 1, iv: _base64ToBytes(inner.iv), ciphertext: _base64ToBytes(inner.ciphertext).buffer}, wrapped: true};
}
async function wrapNutritionEnvelope(sourceKey: CryptoKey | null, deviceEnvelope: {version: number; iv: Uint8Array; ciphertext: ArrayBuffer}) {
  if (!sourceKey) throw new Error('The original application passphrase is required.');
  return sealMigrationPassphraseObject(sourceKey, {
    version: 1, iv: bytesToBase64(deviceEnvelope.iv), ciphertext: bytesToBase64(new Uint8Array(deviceEnvelope.ciphertext)),
  });
}

/** Transform only browser-bound protection. Passphrase ciphertext stays intact. */
export async function makeMigrationPortable(
  localSource: Record<string, string>,
  databases: MigrationDatabase[],
  passphrase: string,
  options: MigrationPortableOptions = {},
): Promise<MigrationPortableData> {
  const sourceKey = await sourceMigrationKey(localSource, passphrase);
  const local = Object.fromEntries(Object.entries(localSource).filter(([key]) => !excludedMigrationLocalKey(key)));
  const credentials: Record<string, string> = {};
  const credentialKey = databases.find(db => db.name === 'labcharts-wearables-credential-vault');
  for (const [key, value] of Object.entries(local)) {
    if (value.startsWith('d1:')) {
      credentials[key] = await decryptDeviceCredentialString(credentialKey, key, value);
      delete local[key];
    }
    if (key === 'labcharts-backup-restore-pending') throw new Error('An interrupted backup restore is still pending. Open the app to finish backup recovery, then return here.');
    if (/persona.*(?:journal|fence|transaction)|persona-storage/.test(key)) throw new Error('Open the app to finish persona recovery, then return here.');
  }
  let syncRecovery: MigrationSyncRecovery | null = null;
  const identity = databases.find(db => db.name === 'getbased-evolu8-identity');
  const identityRecord = identity?.stores.find(store => store.name === 'identity')?.records.find(record => record.key === 'app-owner');
  const identityValue = identityRecord?.value;
  if (!identityValue && (localSource['labcharts-sync-evolu8-identity-token'] || localSource['labcharts-sync-enabled'] === 'true')) {
    if (!options.allowMissingLegacySync) throw new Error('Open the app to finish Sync identity recovery, then return here.');
    delete local['labcharts-sync-evolu8-identity-token'];
  }
  if (identityRecord && identityValue) {
    const saved = object(identityValue);
    const token = localSource['labcharts-sync-evolu8-identity-token'];
    if (saved.token !== token || typeof saved.token !== 'string' || !saved.token || typeof saved.ownerId !== 'string' || !saved.ownerId) {
      throw new Error('Open the app to finish Sync identity recovery, then return here.');
    }
    let mnemonic: string;
    if (typeof saved.envelope === 'string' && saved.envelope.startsWith('d1:')) {
      mnemonic = await decryptDeviceCredentialString(credentialKey, `evolu-identity:${saved.token}`, saved.envelope);
      identityRecord.value = {version: 1, token: saved.token, ownerId: saved.ownerId, mnemonic};
      identityRecord.protection = 'evolu-identity';
    } else if (isPassphraseEnvelope(saved.envelope)) {
      const plain = await openMigrationPassphraseObject(sourceKey, saved.envelope);
      if (plain.token !== saved.token || typeof plain.mnemonic !== 'string' || !plain.mnemonic) {
        throw new Error('The stored Sync identity could not be verified.');
      }
      mnemonic = plain.mnemonic;
    } else if (!saved.envelope && typeof saved.mnemonic === 'string' && saved.mnemonic) {
      mnemonic = saved.mnemonic;
    } else {
      throw new Error('Open the app to finish Sync identity recovery, then return here.');
    }
    syncRecovery = {mnemonic, ownerId: saved.ownerId, relay: localSource['labcharts-sync-relay'] ?? null};
  }
  for (const database of databases) {
    if (database.name === 'labcharts-blobs') {
      for (const store of database.stores) {
        if (store.records.some(record => /-persona-transaction(?:-pending)?$/.test(String(record.key)))) throw new Error('Open the app to finish an existing edit recovery, then return here.');
        store.records = store.records.filter(record => String(record.key) !== 'labcharts-backup-restore-journal-v1' && !/-(?:agent-draft-claims|app-control-)/.test(String(record.key)));
      }
    }
    if (database.name === 'getbased-cashu') {
      for (const store of database.stores) {
        if (store.name === 'proofs' || store.name === 'fee-proofs') {
          for (const record of store.records) {
            const row = object(record.value);
            if (typeof row._payload !== 'string') continue;
            const storageKey = typeof row.secret === 'string' && row.secret ? row.secret : String(record.key);
            record.value = {...row, _payload: await decryptDeviceCredentialString(credentialKey, `cashu-proof:${storageKey}`, row._payload)};
            record.protection = 'cashu-proof';
          }
        }
        if (store.name === 'meta') {
          for (const record of store.records) {
            const row = object(record.value);
            if (typeof row._payload !== 'string') continue;
            const metaKey = typeof row.key === 'string' && row.key ? row.key : String(record.key);
            record.value = {...row, _payload: await decryptDeviceCredentialString(credentialKey, `cashu-meta:${metaKey}`, row._payload)};
            record.protection = 'cashu-meta';
          }
        }
      }
    }
    if (database.name.startsWith('labcharts-wearables-')) {
      const key = wearableKey(database);
      for (const store of database.stores) {
        if (store.name === 'meta') {
          const retained: MigrationRecord[] = [];
          for (const record of store.records) {
            if (record.key === 'credential-vault-key:v1' || String(record.key).startsWith('credential-vault-')) continue;
            const row = object(record.value), payload = row.v as Record<string, unknown> | null;
            if (payload?.version === 1 && payload.iv && payload.ciphertext) {
              record.value = {...row, v: await deviceRead(key, payload)}; record.protection = 'wearable-meta';
            }
            retained.push(record);
          }
          store.records = retained;
        }
        if (store.name === 'daily-metrics') for (const record of store.records) {
          const row = object(record.value);
          const unwrapped = row._payload ? await openMigrationPassphraseObject(sourceKey, row._payload) : row;
          if (row.source !== 'whoop' && row.source !== 'google_health' && !unwrapped._devicePayload) continue;
          const {source: _source, date: _date, _payload: _payload, _devicePayload: device, ...rest} = unwrapped;
          record.value = {source: row.source, date: row.date, _devicePayload: device ? await deviceRead(key, device) : rest};
          record.protection = 'wearable-row'; record.passphraseWrapped = !!row._payload || !!sourceKey;
        }
      }
    }
    if (database.name.startsWith('getbased-nutrition-')) {
      const meta = database.stores.find(store => store.name === 'meta');
      const saved = meta?.records.find(record => record.key === 'meal-device-key:v1');
      const key = saved ? object(saved.value).value as CryptoKey : undefined;
      for (const record of database.stores.find(store => store.name === 'meals')?.records ?? []) {
        const row = object(record.value);
        const {envelope, wrapped} = await unwrapNutritionEnvelope(row._devicePayload, sourceKey);
        record.value = {...row, _devicePayload: await deviceRead(key, envelope)};
        record.protection = 'nutrition'; record.passphraseWrapped = wrapped || !!sourceKey;
      }
      if (meta) {
        for (const record of meta.records) {
          if (record.key === 'meal-device-key:v1') continue;
          const row = object(record.value), payload = row.value as Record<string, unknown> | null;
          if (isPassphraseEnvelope(payload) || (payload?.version === 1 && payload.iv && payload.ciphertext)) {
            const {envelope, wrapped} = await unwrapNutritionEnvelope(payload, sourceKey);
            record.value = {...row, value: await deviceRead(key, envelope)};
            record.protection = 'nutrition-meta'; record.passphraseWrapped = wrapped || !!sourceKey;
          }
        }
        meta.records = meta.records.filter(record => record.key !== 'meal-device-key:v1');
      }
    }
    if (database.name === 'labcharts-backups') {
      const handles = database.stores.find(store => store.name === 'folder-handle');
      if (handles) handles.records = [];
    }
  }
  const storedProfiles = localSource['labcharts-profiles'];
  const profileText = storedProfiles?.startsWith('v1:') && sourceKey ? await decryptMigrationSourceValue(sourceKey, storedProfiles) : storedProfiles;
  const profiles: unknown = profileText ? JSON.parse(profileText) : [];
  if (!Array.isArray(profiles)) throw new Error('The saved profile index could not be read.');
  const count = (prefix: string, storeName: string) => databases.filter(db => db.name.startsWith(prefix))
    .reduce((total, db) => total + (db.stores.find(store => store.name === storeName)?.records.length ?? 0), 0);
  const inventory: MigrationInventory = {
    profiles: profiles.length || (localSource['labcharts-imported'] ? 1 : 0),
    meals: count('getbased-nutrition-', 'meals'), wearableRows: count('labcharts-wearables-', 'daily-metrics'),
    chatRecords: Object.keys(local).filter(key => /^labcharts-.+-(?:chat|chat-t_.+)$/.test(key)).length,
    textDrafts: Object.keys(local).filter(key => /^labcharts-.+-chatDraft_.+$/.test(key)).length,
    savedSnapshots: count('labcharts-backups', 'snapshots'), walletRecovery: databases.some(db => db.name === 'getbased-cashu') || !!local['labcharts-cashu-wallet-mnemonic'],
  };
  return {local, databases, credentials, syncRecovery, inventory};
}

export async function prepareMigrationDestination(data: MigrationPortableData, passphrase: string): Promise<void> {
  const sourceKey = await sourceMigrationKey(data.local, passphrase);
  const needsIdentityVault = data.databases.some(db => db.name === 'getbased-evolu8-identity'
    && db.stores.some(store => store.records.some(record => record.protection === 'evolu-identity')));
  const needsCashuVault = data.databases.some(db => db.name === 'getbased-cashu'
    && db.stores.some(store => store.records.some(record => record.protection === 'cashu-proof' || record.protection === 'cashu-meta')));
  let destinationVaultKey: CryptoKey | undefined;
  for (const database of data.databases) {
    const nutrition = database.name.startsWith('getbased-nutrition-');
    const wearable = database.name.startsWith('labcharts-wearables-');
    const credentials = database.name === 'labcharts-wearables-credential-vault';
    if (!nutrition && !wearable) continue;
    if (!database.stores.some(store => store.records.some(record => record.protection))
      && !(credentials && (Object.keys(data.credentials).length || needsIdentityVault || needsCashuVault))) continue;
    const key = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
    if (credentials) destinationVaultKey = key;
    const meta = database.stores.find(store => store.name === 'meta');
    if (!meta) throw new Error('The destination protection store is missing.');
    const keyName = nutrition ? 'meal-device-key:v1' : 'credential-vault-key:v1';
    meta.records.push({key: keyName, value: nutrition ? {k: keyName, value: key} : {k: keyName, v: key, updatedAt: Date.now()}});
    for (const store of database.stores) for (const record of store.records) {
      if (!record.protection) continue;
      const row = object(record.value);
      if (record.protection === 'nutrition-meta') {
        const deviceEnv = await encryptMigrationDeviceValue(key, row.value);
        record.value = {...row, value: record.passphraseWrapped ? await wrapNutritionEnvelope(sourceKey, deviceEnv) : deviceEnv};
      } else if (record.protection === 'nutrition') {
        const deviceEnv = await encryptMigrationDeviceValue(key, row._devicePayload);
        record.value = {...row, _devicePayload: record.passphraseWrapped ? await wrapNutritionEnvelope(sourceKey, deviceEnv) : deviceEnv};
      } else if (record.protection === 'wearable-meta') {
        record.value = {...row, v: await encryptMigrationDeviceValue(key, row.v)};
      } else {
        const protectedRow: Record<string, unknown> = {...row, _devicePayload: await encryptMigrationDeviceValue(key, row._devicePayload)};
        if (record.passphraseWrapped) {
          if (!sourceKey) throw new Error('The original application passphrase is required.');
          const {source, date, ...rest} = protectedRow;
          record.value = {source, date, _payload: await sealMigrationPassphraseObject(sourceKey, rest)};
        } else record.value = protectedRow;
      }
      delete record.protection; delete record.passphraseWrapped;
    }
    if (credentials) for (const [storageKey, plaintext] of Object.entries(data.credentials)) {
      const envelope = await encryptMigrationDeviceValue(key, {storageKey, plaintext});
      data.local[storageKey] = 'd1:' + bytesToBase64(envelope.iv) + ':' + bytesToBase64(new Uint8Array(envelope.ciphertext));
    }
  }
  if (needsIdentityVault) {
    if (!destinationVaultKey) throw new Error('The destination credential vault is missing.');
    for (const database of data.databases) {
      if (database.name !== 'getbased-evolu8-identity') continue;
      for (const store of database.stores) for (const record of store.records) {
        if (record.protection !== 'evolu-identity') continue;
        const row = object(record.value);
        const envelope = await encryptMigrationDeviceValue(destinationVaultKey, {
          storageKey: `evolu-identity:${String(row.token)}`, plaintext: String(row.mnemonic),
        });
        record.value = {
          version: 1, token: row.token, ownerId: row.ownerId,
          envelope: 'd1:' + bytesToBase64(envelope.iv) + ':' + bytesToBase64(new Uint8Array(envelope.ciphertext)),
        };
        delete record.protection; delete record.passphraseWrapped;
      }
    }
  }
  if (needsCashuVault) {
    if (!destinationVaultKey) throw new Error('The destination credential vault is missing.');
    for (const database of data.databases) {
      if (database.name !== 'getbased-cashu') continue;
      for (const store of database.stores) for (const record of store.records) {
        if (record.protection !== 'cashu-proof' && record.protection !== 'cashu-meta') continue;
        const row = object(record.value);
        const storageKey = record.protection === 'cashu-proof'
          ? `cashu-proof:${String(row.secret)}`
          : `cashu-meta:${String(row.key)}`;
        const envelope = await encryptMigrationDeviceValue(destinationVaultKey, {
          storageKey, plaintext: String(row._payload),
        });
        record.value = {
          ...row,
          _payload: 'd1:' + bytesToBase64(envelope.iv) + ':' + bytesToBase64(new Uint8Array(envelope.ciphertext)),
        };
        delete record.protection; delete record.passphraseWrapped;
      }
    }
  }
}
