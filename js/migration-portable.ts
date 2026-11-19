import { _base64ToBytes, bytesToBase64 } from './base64.js';
import { parseProtectedStorageObject, serializeProtectedStorageObject } from './storage-object-codec.js';
import { deriveMigrationKey, decryptMigrationSourceValue, decryptMigrationDeviceValue, encryptMigrationDeviceValue } from './migration-crypto.js';
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
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('A saved record has an unsupported shape.');
  return value as Record<string, unknown>;
};
export function excludedMigrationLocalKey(key: string): boolean {
  if (['labcharts-sync-evolu8-identity-token', 'labcharts-sync-relay'].includes(key)) return false;
  return key === 'labcharts-legal-acceptance' || key === 'labcharts-migration-pending'
    || /^labcharts-(?:sync-|wearable-credential-|agent-host-token$)/.test(key)
    || /-(?:sync-(?:ts|dirty|cutover)|app-control-|agent-draft-claims)/.test(key);
}
export async function sourceMigrationKey(local: Record<string, string>, passphrase: string): Promise<CryptoKey | null> {
  if (local['labcharts-encryption-enabled'] !== 'true') return null;
  if (!passphrase) throw new Error('Enter the original application passphrase as well as the migration password.');
  const salt = _base64ToBytes(local['labcharts-encryption-salt'] ?? '');
  if (salt.length !== 16) throw new Error('The source encryption salt is missing or invalid. Keep the source browser and its saved backups.');
  const key = await deriveMigrationKey(passphrase, salt);
  try {
    const profiles = local['labcharts-profiles'];
    if (profiles?.startsWith('v1:')) {
      if (!Array.isArray(JSON.parse(await decryptMigrationSourceValue(key, profiles)))) throw new Error('Invalid profiles.');
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

/** Transform only browser-bound protection. Passphrase ciphertext stays intact. */
export async function makeMigrationPortable(localSource: Record<string, string>, databases: MigrationDatabase[], passphrase: string): Promise<MigrationPortableData> {
  const sourceKey = await sourceMigrationKey(localSource, passphrase);
  const local = Object.fromEntries(Object.entries(localSource).filter(([key]) => !excludedMigrationLocalKey(key)));
  const credentials: Record<string, string> = {};
  const credentialKey = databases.find(db => db.name === 'labcharts-wearables-credential-vault');
  for (const [key, value] of Object.entries(local)) {
    if (value.startsWith('d1:')) {
      const parts = value.split(':');
      if (parts.length !== 3) throw new Error('A saved credential has invalid protection.');
      const decrypted = object(await deviceRead(credentialKey ? wearableKey(credentialKey) : undefined,
        {version: 1, iv: _base64ToBytes(parts[1]!), ciphertext: _base64ToBytes(parts[2]!)}));
      if (decrypted.storageKey !== key || typeof decrypted.plaintext !== 'string') throw new Error('A saved credential could not be verified.');
      credentials[key] = decrypted.plaintext; delete local[key];
    }
    if (/persona.*(?:journal|fence|transaction)|persona-storage/.test(key)) throw new Error('Open the app to finish persona recovery, then return here.');
  }
  let syncRecovery: MigrationSyncRecovery | null = null;
  const identity = databases.find(db => db.name === 'getbased-evolu8-identity');
  const identityValue = identity?.stores.find(store => store.name === 'identity')?.records.find(record => record.key === 'app-owner')?.value;
  if (!identityValue && (localSource['labcharts-sync-evolu8-identity-token'] || localSource['labcharts-sync-enabled'] === 'true')) throw new Error('Open the app to finish Sync identity recovery, then return here.');
  if (identityValue) {
    const saved = object(identityValue);
    if (saved.token === localSource['labcharts-sync-evolu8-identity-token'] && typeof saved.mnemonic === 'string' && typeof saved.ownerId === 'string') {
      syncRecovery = {mnemonic: saved.mnemonic, ownerId: saved.ownerId, relay: localSource['labcharts-sync-relay'] ?? null};
    } else throw new Error('Open the app to finish Sync identity recovery, then return here.');
  }
  for (const database of databases) {
    if (database.name === 'labcharts-blobs') {
      for (const store of database.stores) {
        if (store.records.some(record => /-persona-transaction(?:-pending)?$/.test(String(record.key)))) throw new Error('Open the app to finish an existing edit recovery, then return here.');
        store.records = store.records.filter(record => !/-(?:agent-draft-claims|app-control-)/.test(String(record.key)));
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
        record.value = {...row, _devicePayload: await deviceRead(key, row._devicePayload)}; record.protection = 'nutrition';
      }
      if (meta) {
        for (const record of meta.records) {
          if (record.key === 'meal-device-key:v1') continue;
          const row = object(record.value), payload = row.value as Record<string, unknown> | null;
          if (payload?.version === 1 && payload.iv && payload.ciphertext) {
            record.value = {...row, value: await deviceRead(key, payload)}; record.protection = 'nutrition-meta';
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
    profiles: profiles.length, meals: count('getbased-nutrition-', 'meals'), wearableRows: count('labcharts-wearables-', 'daily-metrics'),
    chatRecords: Object.keys(local).filter(key => /^labcharts-.+-(?:chat|chat-t_.+)$/.test(key)).length,
    textDrafts: Object.keys(local).filter(key => /^labcharts-.+-chatDraft_.+$/.test(key)).length,
    savedSnapshots: count('labcharts-backups', 'snapshots'), walletRecovery: databases.some(db => db.name === 'getbased-cashu') || !!local['labcharts-cashu-wallet-mnemonic'],
  };
  return {local, databases, credentials, syncRecovery, inventory};
}

export async function prepareMigrationDestination(data: MigrationPortableData, passphrase: string): Promise<void> {
  const sourceKey = await sourceMigrationKey(data.local, passphrase);
  for (const database of data.databases) {
    const nutrition = database.name.startsWith('getbased-nutrition-');
    const wearable = database.name.startsWith('labcharts-wearables-');
    const credentials = database.name === 'labcharts-wearables-credential-vault';
    if (!nutrition && !wearable) continue;
    if (!database.stores.some(store => store.records.some(record => record.protection)) && !(credentials && Object.keys(data.credentials).length)) continue;
    const key = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
    const meta = database.stores.find(store => store.name === 'meta');
    if (!meta) throw new Error('The destination protection store is missing.');
    const keyName = nutrition ? 'meal-device-key:v1' : 'credential-vault-key:v1';
    meta.records.push({key: keyName, value: nutrition ? {k: keyName, value: key} : {k: keyName, v: key, updatedAt: Date.now()}});
    for (const store of database.stores) for (const record of store.records) {
      if (!record.protection) continue;
      const row = object(record.value);
      if (record.protection === 'nutrition-meta') record.value = {...row, value: await encryptMigrationDeviceValue(key, row.value)};
      else if (record.protection === 'wearable-meta') record.value = {...row, v: await encryptMigrationDeviceValue(key, row.v)};
      else {
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
}
