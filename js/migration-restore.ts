import {getHostedTransition} from '../shared/hosted-transition.js';
import { existingMigrationDatabases, readMigrationDatabase, writeMigrationDatabase, MIGRATION_DATABASE, MIGRATION_PENDING_KEY } from './migration-database.js';
import { readMigrationFiles, writeMigrationFiles } from './migration-files.js';
import { inspectMigrationArchive, readMigrationLocal, validateMigrationArchive } from './migration-archive.js';
import { prepareMigrationDestination, sourceMigrationKey, makeMigrationPortable } from './migration-portable.js';
import {migrationDigest} from './migration-digest.js';
import { requireSingleMigrationClient, withMigrationLock } from './migration-clients.js';
import { createDefaultProfileData } from './profile-defaults.js';
import { prepareRestoredProfilesForSync, getPendingBackupRestoreProfileIds } from './sync-backup-restore-state.js';
import { decryptMigrationSourceValue, decryptMigrationDeviceValue } from './migration-crypto.js';
import { LENS_LOCAL_STORAGE_LOCK } from './lens-local-lock.js';
import type { MigrationArchive } from './migration-archive.js';

export interface MigrationPending { id: string; blob: Blob; phase: string }
async function journalDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MIGRATION_DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('recovery');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other recovery windows and retry.'));
  });
}
async function journal<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await journalDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('recovery', mode), request = operation(tx.objectStore('recovery'));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error || new Error('Recovery progress could not be saved.'));
      tx.onerror = () => reject(tx.error || request.error || new Error('Recovery progress could not be saved.'));
    });
  } finally { db.close(); }
}
export async function getPendingMigration(): Promise<MigrationPending | null> {
  const pending = await journal('readonly', store => store.get('pending')) as MigrationPending | undefined;
  if (!pending) {
    const fence = localStorage.getItem(MIGRATION_PENDING_KEY);
    if (fence) {
      const receipt = await journal('readonly', store => store.get('receipt')) as MigrationPending | undefined;
      if (receipt?.id === fence && receipt.phase === 'complete') localStorage.removeItem(MIGRATION_PENDING_KEY);
    }
  }
  return pending ?? null;
}
function emptyProfile(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const profile = JSON.parse(value) as Record<string, unknown>;
    const defaults = createDefaultProfileData() as unknown as Record<string, unknown>;
    return !!profile && typeof profile === 'object' && !Array.isArray(profile)
      && Object.entries(profile).every(([key, stored]) => Object.hasOwn(defaults, key) && JSON.stringify(stored) === JSON.stringify(defaults[key]));
  } catch { return false; }
}
function emptySnapshot(value: unknown): boolean {
  const stored = value as {snapshot?: {encrypted?: unknown; profiles?: Array<{keys?: Record<string, unknown>}>; wearableIDB?: unknown; cycleIDB?: unknown}};
  const snapshot = stored?.snapshot;
  return !!snapshot && !snapshot.encrypted && Array.isArray(snapshot.profiles)
    && snapshot.profiles.every(profile => !!profile.keys && Object.entries(profile.keys).every(([key, entry]) => key === 'imported' ? emptyProfile(entry) : ['units', 'rangeMode', 'chatRailOpen'].includes(key)))
    && [snapshot.wearableIDB, snapshot.cycleIDB].every(entry => !entry || JSON.stringify(entry) === '{}');
}
export async function requireEmptyMigrationDestination(): Promise<void> {
  const conflict = () => { throw new Error('This destination already contains records or a connected account. Recovery stopped before changing them. Use a fresh installation or keep a separate browser profile for the existing data.'); };
  const local = readMigrationLocal();
  if (local['labcharts-encryption-enabled'] === 'true' || local['labcharts-sync-enabled'] === 'true') conflict();
  for (const [key, value] of Object.entries(local)) {
    if (key === 'labcharts-profiles') {
      let profiles: unknown;
      try { profiles = JSON.parse(value); } catch { conflict(); }
      const defaults: Record<string, unknown> = {id: 'default', name: 'Default', sex: null, dob: null, location: {country: '', zip: ''}, tags: [], notes: '', status: 'active', avatar: null, height: null, heightUnit: 'cm', pinned: false};
      if (!Array.isArray(profiles) || profiles.length > 1 || profiles.some(profile => !profile || profile.id !== 'default'
        || Object.entries(profile).some(([field, entry]) => ['createdAt', 'lastUpdated'].includes(field)
          ? typeof entry !== 'number' || !Number.isFinite(entry)
          : !Object.hasOwn(defaults, field) || JSON.stringify(entry) !== JSON.stringify(defaults[field])))) conflict();
    } else if (/^labcharts-imported(?:$|-)/.test(key) && value) conflict();
    else if (/^labcharts-.+-imported(?:$|-)/.test(key) && (!key.endsWith('-imported') || !emptyProfile(value))) conflict();
    else if (/^labcharts-.+-(?:chat(?:Draft|PersonalityCustom|-t_|-threads)?|persona-transaction)/.test(key) && !['', '[]', '{}', 'null'].includes(value)) conflict();
    else if (/(?:-key|-token|-mnemonic)$/.test(key) && value) conflict();
  }
  for (const name of await existingMigrationDatabases()) {
    const database = await readMigrationDatabase(name);
    for (const store of database.stores) for (const row of store.records) {
      if (name === 'labcharts-blobs' && store.name === 'kv' && typeof row.key === 'string' && /^labcharts-.+-imported$/.test(row.key) && emptyProfile(row.value)) continue;
      if (name === 'labcharts-backups' && store.name === 'snapshots' && emptySnapshot(row.value)) continue;
      if ((name.startsWith('labcharts-wearables-') || name.startsWith('getbased-nutrition-')) && store.name === 'meta') {
        if (['credential-vault-key:v1', 'meal-device-key:v1', 'nutrition-profile-sync-initialized:v1'].includes(String(row.key))) continue;
        if (String(row.key) === 'nutrition-summary:v1' && name.startsWith('getbased-nutrition-')) {
          const meta = database.stores.find(store => store.name === 'meta')!;
          const key = (meta.records.find(record => record.key === 'meal-device-key:v1')?.value as {value?: CryptoKey} | undefined)?.value;
          const summary = key ? await decryptMigrationDeviceValue(key, (row.value as {value: unknown}).value) : null;
          if ((summary as {totalMeals?: unknown} | null)?.totalMeals === 0) continue;
        }
        if (String(row.key) === 'biometrics-migrated-v1' && name.startsWith('labcharts-wearables-')) {
          const counts = (row.value as {v?: {counts?: unknown}})?.v?.counts;
          if (counts && typeof counts === 'object' && Object.values(counts).every(value => value === 0)) continue;
        }
      }
      conflict();
    }
  }
  if ((await readMigrationFiles()).length) conflict();
}

function verificationShape(data: {local: Record<string, string>; databases: unknown; files: unknown; credentials: unknown}) {
  // Sync is deliberately disconnected until the user checks the recovered data.
  const local = {...data.local}; delete local['labcharts-migration-completed'];
  delete local['labcharts-migration-reviewed']; delete local['labcharts-sync-enabled'];
  return {local, databases: data.databases, files: data.files, credentials: data.credentials};
}
export async function restoreMigrationArchive(blob: Blob, password: string, originalPassphrase: string, progress: (text: string) => void = () => {}): Promise<MigrationArchive> {
  if (getHostedTransition(location.origin)?.phase === 'recovery') throw new Error('This hosted address is available for recovery only. Restore the migration file at your self-hosted address.');
  const archive = await inspectMigrationArchive(blob, password);
  const sourceKey = await sourceMigrationKey(archive.local, originalPassphrase);
  const storedProfiles = archive.local['labcharts-profiles'];
  const profiles: unknown = storedProfiles ? JSON.parse(storedProfiles.startsWith('v1:') && sourceKey
    ? await decryptMigrationSourceValue(sourceKey, storedProfiles) : storedProfiles) : [];
  if (!Array.isArray(profiles) || profiles.some(profile => !profile || typeof profile.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(profile.id))) throw new Error('The migration profile index is invalid.');
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  const id = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  return withMigrationLock('getbased-migration', () =>
    withMigrationLock(LENS_LOCAL_STORAGE_LOCK, async () => {
      await requireSingleMigrationClient();
      const pending = await getPendingMigration();
      const fence = localStorage.getItem(MIGRATION_PENDING_KEY);
      if ((pending && pending.id !== id) || (fence && fence !== id)) throw new Error('Another migration is pending. Resume it with its original file and password.');
      if (pending && fence !== id) throw new Error('Recovery metadata is missing. Keep this file and recover into a fresh installation. Existing destination records were not changed.');
      if (!pending) {
        await requireEmptyMigrationDestination();
        // Fence normal startup before retaining the encrypted file. If saving
        // the file fails, the user can reselect it without allowing app edits.
        localStorage.setItem(MIGRATION_PENDING_KEY, id);
        if (localStorage.getItem(MIGRATION_PENDING_KEY) !== id) throw new Error('The recovery fence could not be saved.');
        await journal('readwrite', store => store.put({id, blob, phase: 'prepared'}, 'pending'));
      }
      localStorage.setItem(MIGRATION_PENDING_KEY, id);
      if (localStorage.getItem(MIGRATION_PENDING_KEY) !== id) throw new Error('The recovery fence could not be saved. No records were restored.');
      const expected = await migrationDigest(verificationShape(archive));
      const prepared = archive;
      validateMigrationArchive(prepared);
      await prepareMigrationDestination(prepared, originalPassphrase);
      await journal('readwrite', store => store.put({id, blob, phase: 'restoring'}, 'pending'));
      for (const database of prepared.databases) {
        progress('Restoring saved database ' + (prepared.databases.indexOf(database) + 1) + ' of ' + prepared.databases.length + '…');
        await writeMigrationDatabase(database);
        for (const store of database.stores) store.records = [];
      }
      progress('Restoring local Knowledge Base files…');
      await writeMigrationFiles(prepared.files);
      prepared.files = [];
      // The source settings are committed after every side store. The fence
      // keeps normal startup out until the following read-back succeeds.
      for (const [key, value] of Object.entries(prepared.local)) localStorage.setItem(key, value);
      localStorage.setItem('labcharts-sync-enabled', 'false');
      progress('Verifying all restored records…');
      const databases = [];
      for (const database of prepared.databases) databases.push(await readMigrationDatabase(database.name));
      const readLocal = Object.fromEntries(Object.keys(prepared.local).map(key => [key, localStorage.getItem(key)!]));
      const portable = await makeMigrationPortable(readLocal, databases, originalPassphrase);
      const actual = {...portable, files: await readMigrationFiles()};
      if (await migrationDigest(verificationShape(actual)) !== expected) throw new Error('The destination verification did not match. Keep the source and resume recovery with the same file.');
      await requireSingleMigrationClient();
      prepareRestoredProfilesForSync({profiles: profiles.map(profile => ({profileId: profile.id}))});
      const pendingProfiles = getPendingBackupRestoreProfileIds();
      if (profiles.some(profile => !pendingProfiles.includes(profile.id))) throw new Error('Sync recovery guards could not be saved. Keep the source and retry.');
      localStorage.setItem('labcharts-migration-completed', JSON.stringify({version: 1, id, completedAt: new Date().toISOString()}));
      await journal('readwrite', store => {
        store.put({id, phase: 'complete'}, 'receipt');
        return store.delete('pending');
      });
      localStorage.removeItem(MIGRATION_PENDING_KEY);
      return {...archive, ...actual};
    }));
}
