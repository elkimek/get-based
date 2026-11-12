import { existingMigrationDatabases, readMigrationDatabase, MIGRATION_PENDING_KEY, migrationDatabaseContract } from './migration-database.js';
import { readMigrationFiles, validMigrationFilePath } from './migration-files.js';
import { makeMigrationPortable, excludedMigrationLocalKey, sourceMigrationKey, openMigrationPassphraseObject, sealMigrationPassphraseObject } from './migration-portable.js';
import { encodeMigrationValue } from './migration-codec.js';
import {migrationDigest} from './migration-digest.js';
import { sealMigration, openMigration } from './migration-crypto.js';
import { requireSingleMigrationClient, withMigrationLock } from './migration-clients.js';
import { LENS_LOCAL_STORAGE_LOCK } from './lens-local-lock.js';
import type { MigrationPortableData } from './migration-portable.js';
import type { MigrationFile } from './migration-files.js';

export interface MigrationArchive extends MigrationPortableData {
  format: 'getbased-migration-content'; version: 1; createdAt: string; sourceOrigin: string;
  files: MigrationFile[];
  reconnect: readonly string[];
}
export const MIGRATION_RECONNECT = [
  'Wearable provider logins', 'Companion pairing', 'Automatic backup folder permission',
  'Downloaded models and regeneratable caches', 'Sync connection (identity and relay are retained; enable only after checking records)',
  'Unsent attachment originals held only in memory', 'Pending edit approvals and transient action claims',
] as const;
export function readMigrationLocal(): Record<string, string> {
  return Object.fromEntries(Array.from({length: localStorage.length}, (_, index) => localStorage.key(index)!)
    .filter(Boolean).sort().map(key => [key, localStorage.getItem(key)!]));
}
async function collect(passphrase: string) {
  if (localStorage.getItem(MIGRATION_PENDING_KEY)) throw new Error('Finish or resume the pending destination recovery before creating another migration archive.');
  const local = readMigrationLocal();
  const databases = [];
  for (const name of await existingMigrationDatabases()) databases.push(await readMigrationDatabase(name));
  const files = await readMigrationFiles();
  const portable = await makeMigrationPortable(local, databases, passphrase);
  return {...portable, files};
}

export async function buildMigrationArchive(password: string, originalPassphrase: string, progress: (text: string) => void = () => {}): Promise<Blob> {
  if (!navigator.locks) throw new Error('Recovery requires HTTPS and browser-wide storage locks.');
  if (password.length < 12) throw new Error('Use a migration password with at least 12 characters.');
  progress('Checking recovery tools and other application windows…');
  await requireSingleMigrationClient();
  progress('Waiting for ongoing saves to finish…');
  return withMigrationLock('getbased-migration', () =>
    withMigrationLock(LENS_LOCAL_STORAGE_LOCK, async () => {
      await requireSingleMigrationClient();
      progress('Finishing interrupted saves, if needed…');
      const sourceKey = await sourceMigrationKey(readMigrationLocal(), originalPassphrase);
      const persona = await import('./persona-storage-transaction.js');
      persona.configurePersonaJournalProtection({enabled: () => !!sourceKey,
        seal: async value => {if (!sourceKey) throw new Error('Source protection is unavailable.'); return sealMigrationPassphraseObject(sourceKey, value);},
        open: value => openMigrationPassphraseObject(sourceKey, value)});
      try {await persona.recoverAllPersonaStorage();}
      finally {persona.configurePersonaJournalProtection({enabled: () => false,
        seal: async () => {throw new Error('Recovery protection is closed.');},
        open: async () => {throw new Error('Recovery protection is closed.');}});}
      progress('Reading saved records and browser-protected data…');
      let first: Awaited<ReturnType<typeof collect>> | null = await collect(originalPassphrase);
      if (!first.local['labcharts-profiles'] && !first.databases.some(db => db.stores.some(store => store.records.length)) && !first.files.length && !Object.keys(first.credentials).length) throw new Error('No saved application records were found at this address. Open the original browser profile or installed app before creating a migration file.');
      const firstDigest = await migrationDigest(first); first = null;
      progress('Checking that the source stayed unchanged…');
      const second = await collect(originalPassphrase);
      await requireSingleMigrationClient();
      if (firstDigest !== await migrationDigest(second)) throw new Error('Saved data changed while it was being read. Close the other windows and retry. No migration file was created.');
      const archive: MigrationArchive = {format: 'getbased-migration-content', version: 1,
        createdAt: new Date().toISOString(), sourceOrigin: location.origin, ...second, reconnect: MIGRATION_RECONNECT};
      validateMigrationArchive(archive);
      progress('Encrypting the migration file…');
      const envelope = await sealMigration(archive, password);
      return new Blob([JSON.stringify(envelope)], {type: 'application/json'});
    }));
}

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
export function validateMigrationArchive(value: unknown): asserts value is MigrationArchive {
  if (!record(value) || value.format !== 'getbased-migration-content' || value.version !== 1
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
    || typeof value.sourceOrigin !== 'string' || !record(value.local) || !record(value.credentials)
    || !record(value.inventory) || !Array.isArray(value.databases) || !Array.isArray(value.files) || !Array.isArray(value.reconnect)) throw new Error('The migration file has an unsupported content format.');
  for (const name of ['profiles', 'meals', 'wearableRows', 'chatRecords', 'textDrafts', 'savedSnapshots']) {
    if (!Number.isSafeInteger(value.inventory[name]) || Number(value.inventory[name]) < 0) throw new Error('Invalid migration inventory.');
  }
  if (typeof value.inventory.walletRecovery !== 'boolean') throw new Error('Invalid migration inventory.');
  for (const [key, stored] of Object.entries(value.local)) {
    if (typeof stored !== 'string' || excludedMigrationLocalKey(key)) throw new Error('The migration file contains an invalid setting.');
  }
  for (const [key, stored] of Object.entries(value.credentials)) if (typeof stored !== 'string' || !key.startsWith('labcharts-') || excludedMigrationLocalKey(key)) throw new Error('The migration file contains an invalid credential.');
  const names = new Set<string>();
  for (const database of value.databases) {
    if (!record(database) || typeof database.name !== 'string' || names.has(database.name)) throw new Error('Invalid migration database.');
    names.add(database.name);
    const contract = migrationDatabaseContract(database.name);
    if (!contract || database.version !== contract.version || !Array.isArray(database.stores)) throw new Error('Unsupported migration database schema.');
    const stores = new Set<string>();
    for (const store of database.stores) {
      if (!record(store) || typeof store.name !== 'string' || !contract.stores.includes(store.name) || stores.has(store.name)
        || typeof store.autoIncrement !== 'boolean' || !Array.isArray(store.records) || !Array.isArray(store.indexes)) throw new Error('Invalid migration store.');
      stores.add(store.name);
      const keyPath = (path: unknown) => path === null || typeof path === 'string' || Array.isArray(path) && path.every(item => typeof item === 'string');
      if (!keyPath(store.keyPath)) throw new Error('Invalid migration key path.');
      for (const index of store.indexes) if (!record(index) || typeof index.name !== 'string' || !keyPath(index.keyPath) || index.keyPath === null || typeof index.unique !== 'boolean' || typeof index.multiEntry !== 'boolean') throw new Error('Invalid migration index.');
      const keys = new Set<string>();
      for (const entry of store.records) {
        if (!record(entry) || !Object.hasOwn(entry, 'key') || !Object.hasOwn(entry, 'value')) throw new Error('Invalid migration record.');
        try { indexedDB.cmp(entry.key as IDBValidKey, entry.key as IDBValidKey); } catch { throw new Error('Invalid migration record key.'); }
        const serialized = encodeMigrationValue(entry.key);
        if (keys.has(serialized)) throw new Error('Duplicate migration record key.');
        keys.add(serialized);
        if (entry.protection !== undefined && !['wearable-row', 'wearable-meta', 'nutrition', 'nutrition-meta'].includes(String(entry.protection))) throw new Error('Unsupported migration protection.');
        if (entry.passphraseWrapped !== undefined && typeof entry.passphraseWrapped !== 'boolean') throw new Error('Invalid migration protection.');
        if (entry.protection) {
          const row = entry.value;
          const wearable = database.name.startsWith('labcharts-wearables-');
          const nutrition = database.name.startsWith('getbased-nutrition-');
          if (!record(row)) throw new Error('Invalid protected migration record.');
          if (entry.protection === 'nutrition' && (!nutrition || store.name !== 'meals' || !record(row._devicePayload))) throw new Error('Invalid protected meal record.');
          if (entry.protection === 'wearable-row' && (!wearable || store.name !== 'daily-metrics' || typeof row.source !== 'string' || !row.source || typeof row.date !== 'string' || !record(row._devicePayload))) throw new Error('Invalid protected wearable row.');
          if (entry.protection === 'nutrition-meta' && (!nutrition || store.name !== 'meta' || !record(row.value))) throw new Error('Invalid protected meal metadata.');
          if (entry.protection === 'wearable-meta' && (!wearable || store.name !== 'meta' || !record(row.v))) throw new Error('Invalid protected wearable metadata.');
        }

      }
    }
    if (contract.stores.some(store => !stores.has(store))) throw new Error('A migration database is missing a store.');
  }
  const paths = new Set<string>();
  for (const file of value.files) {
    if (!record(file) || !validMigrationFilePath(file.path) || typeof file.bytes !== 'string' || paths.has(file.path)) throw new Error('Invalid migration file.');
    try { atob(file.bytes); } catch { throw new Error('A migration file contains invalid bytes.'); }
    paths.add(file.path);
  }
  if (value.syncRecovery !== null && (!record(value.syncRecovery) || typeof value.syncRecovery.mnemonic !== 'string' || typeof value.syncRecovery.ownerId !== 'string' || !(value.syncRecovery.relay === null || typeof value.syncRecovery.relay === 'string'))) throw new Error('Invalid Sync recovery record.');
}
export async function inspectMigrationArchive(blob: Blob, password: string): Promise<MigrationArchive> {
  if (blob.size > Math.ceil((512 * 1024 * 1024 + 16) / 3) * 4 + 4096) throw new Error('This migration file is too large to read safely in this browser.');
  const value = await openMigration(JSON.parse(await blob.text()), password);
  validateMigrationArchive(value); return value;
}
