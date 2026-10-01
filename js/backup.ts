import { configureRuntimeFunctions } from './runtime-callbacks.js';
// backup.js — Backup/restore, auto-backup (IndexedDB), folder backup (File System Access API)
import { getErrorMessage, getErrorName } from './caught-error.js';
import { showNotification, showConfirmDialog, escapeAttr, escapeHTML } from './utils.js';
import { profileStorageKey } from './profile-storage-key.js';
import { getBlob, setBlob, shouldUseBlob } from './blob-storage.js';
import { parseBackupSnapshot, serializeBackupSnapshot } from './backup-serialization.js';
import { collectRawChatBackup } from './backup-chat-storage.js';
import { prepareRestoredProfilesForSync } from './sync-backup-restore-state.js';
import { getDailyRangeRaw, upsertDailyBatchRaw } from './wearables-store.js';
import { VOICE_BACKUP_KEYS } from './voice-settings-schema.js';
export { parseBackupSnapshot, serializeBackupSnapshot } from './backup-serialization.js';

import type { StoredWearableRow } from './wearable-storage-types.js';
import type { RawChatBackup } from './backup-chat-storage.js';

export interface BackupRuntimeDeps {
  encryptedGetItem(key: string): Promise<string | null>;
  encryptedSetItem(key: string, value: string): Promise<void>;
  getEncryptionEnabled(): boolean;
  isCredentialKey(key: string): boolean;
}
interface PermissionOptions { mode?: 'read' | 'readwrite' }
interface BackupDirectory extends AsyncIterable<[string, unknown]> {
  name: string;
  queryPermission(options: PermissionOptions): Promise<PermissionState>;
  requestPermission(options: PermissionOptions): Promise<PermissionState>;
  getFileHandle(name: string, options: { create: boolean }): Promise<FileSystemFileHandle>;
  removeEntry(name: string): Promise<void>;
}
interface BackupWindow { showDirectoryPicker?: (options?: PermissionOptions) => Promise<BackupDirectory> }
interface ClosestActionTarget { closest?: (selector: string) => Element | null }
type BackupActionRoot = Node & { [BACKUP_ACTION_DELEGATE_KEY]?: unknown };
interface ProfileListEntry { id: string; name?: unknown }
interface BackupProfile extends RawChatBackup { name: unknown }
type WearableBackup = Record<string, Record<string, StoredWearableRow[]>>;
type BackupRestoreView = Record<string, unknown>;
export interface BackupSnapshot extends BackupRestoreView {
  format: 'labcharts-backup'; version: 1; createdAt: string; encrypted: boolean;
  encryptionSalt: string | null; settings: Record<string, string>; profileList: string;
  profiles: BackupProfile[]; wearableIDB: WearableBackup | null;
  cycleIDB: Awaited<ReturnType<typeof import('./backup-cycle.js').collectCycleBackup>>['observations'] | null;
  cycleImportMeta: Awaited<ReturnType<typeof import('./backup-cycle.js').collectCycleBackup>>['importMeta'] | null;
}
export interface AutoBackupRecord { id?: IDBValidKey; createdAt: string; encrypted: boolean; snapshot: BackupSnapshot }

let backupCycleModuleLoad: Promise<typeof import('./backup-cycle.js')> | null = null;

function loadBackupCycleModule() {
  if (!backupCycleModuleLoad) {
    backupCycleModuleLoad = import('./backup-cycle.js').catch(err => {
      backupCycleModuleLoad = null;
      throw err;
    });
  }
  return backupCycleModuleLoad;
}

// Crypto imports this module for backup UI helpers, so inject the two crypto
// operations backup needs instead of coupling the modules through globals.
const appWindow = (typeof window !== 'undefined' ? window : {}) as BackupWindow;

// `var` is intentional: the profile → crypto cycle can configure backup
// while this module is still initializing, before lexical bindings are ready.
var backupRuntimeDeps: BackupRuntimeDeps | undefined;

function getBackupRuntimeDeps() {
  if (!backupRuntimeDeps) {
    backupRuntimeDeps = { encryptedGetItem: async () => null, getEncryptionEnabled: () => false, isCredentialKey: () => false,
      encryptedSetItem: async () => { throw new Error('Credential storage is not configured.'); } };
  }
  return backupRuntimeDeps;
}

export function configureBackupRuntimeDeps(deps: Partial<BackupRuntimeDeps> = {}) {
  const runtimeDeps = getBackupRuntimeDeps();
  return configureRuntimeFunctions(runtimeDeps, deps, ["encryptedGetItem","encryptedSetItem","getEncryptionEnabled","isCredentialKey"]);
}
const getEncryptionEnabled = () => Boolean(getBackupRuntimeDeps().getEncryptionEnabled());
const isEncryptedValue = (v: unknown) => typeof v === 'string' && v.startsWith('v1:');
const backupActionDelegateRoots = new WeakSet();
const BACKUP_ACTION_DELEGATE_KEY = Symbol.for('getbased.backupActionDelegatesInstalled');
const BACKUP_ACTION_ATTR = 'data-backup-action';
const BACKUP_ACTION_SELECTOR = `[${BACKUP_ACTION_ATTR}]`;

function backupActionAttrs(action: string) {
  return `${BACKUP_ACTION_ATTR}="${escapeAttr(action)}"`;
}

function closestBackupAction(target: ClosestActionTarget | null) {
  return (target && typeof target.closest === 'function'
      ? target.closest(BACKUP_ACTION_SELECTOR)
      : null) as HTMLElement | null;
}

function handleBackupActionClick(event: Event) {
  const actionEl = closestBackupAction(event.target as ClosestActionTarget | null);
  if (!actionEl || !(event.currentTarget as Node | null)?.contains?.(actionEl)) return;
  const action = actionEl.getAttribute(BACKUP_ACTION_ATTR);
  if (action === 'pick-folder') pickFolderForBackup();
  else if (action === 'reauthorize-folder') reauthorizeFolderBackup();
  else if (action === 'remove-folder') removeFolderBackup();
  else return;
  event.preventDefault();
  event.stopPropagation();
}

export function installBackupActionDelegates(root: BackupActionRoot | null = typeof document !== 'undefined' ? document : null) {
  if (!root || backupActionDelegateRoots.has(root) || root[BACKUP_ACTION_DELEGATE_KEY]) return;
  backupActionDelegateRoots.add(root);
  Object.defineProperty(root, BACKUP_ACTION_DELEGATE_KEY, { value: true, configurable: true });
  root.addEventListener('click', handleBackupActionClick);
}

if (typeof document !== 'undefined') installBackupActionDelegates();

// Read the RAW stored value (encrypted-if-encryption-on, plaintext-if-off)
// for any key. Big-blob `-imported` keys live in IndexedDB now; everything
// else stays in localStorage. Backup needs the raw form so the encrypted
// envelope (if any) round-trips unchanged through restore.
async function readRawStoredItem(key: string) {
  if (shouldUseBlob(key)) {
    const blob = await getBlob(key);
    if (blob != null) return blob;
    // Migration safety: pre-IDB installs have the value in localStorage.
    return localStorage.getItem(key);
  }
  return localStorage.getItem(key);
}

async function writeRawStoredItem(key: string, value: unknown) {
  if (shouldUseBlob(key)) {
    await setBlob(key, value);
    // Best-effort cleanup of any pre-IDB localStorage residue for this key.
    try { localStorage.removeItem(key); } catch {}
  } else {
    localStorage.setItem(key, value as string);
  }
}

// ═══════════════════════════════════════════════
// BACKUP / RESTORE
// ═══════════════════════════════════════════════
const GLOBAL_SETTINGS_KEYS = [
  'labcharts-venice-key', 'labcharts-openrouter-key', 'labcharts-routstr-key', 'labcharts-routstr-sessions', 'labcharts-ppq-key',
  'labcharts-custom-key', 'labcharts-custom-url', 'labcharts-custom-model', 'labcharts-custom-models',
  'labcharts-ai-provider',
  'labcharts-ppq-credit-id',
  'labcharts-venice-model', 'labcharts-openrouter-model', 'labcharts-routstr-model', 'labcharts-ppq-model',
  'labcharts-ollama', 'labcharts-ollama-model',
  'labcharts-ollama-pii-url', 'labcharts-ollama-pii-key', 'labcharts-ollama-pii-model',
  'labcharts-nutrition-ai-route',
  ...VOICE_BACKUP_KEYS,
  'labcharts-routstr-node',
  'labcharts-time-format', 'labcharts-theme', 'labcharts-sunset-mode', 'labcharts-crt-effects', 'labcharts-debug',
  'labcharts-pii-review', 'labcharts-ollama-pii-enabled', 'labcharts-chat-sources',
  'labcharts-active-profile'
];

const PER_PROFILE_PREF_SUFFIXES = [
  'units', 'rangeMode', 'suppOverlay', 'noteOverlay', 'phaseOverlay',
  'correlation-workspace', 'chatPersonality', 'chatPersonalityCustom', 'chatPersonalityDeleted', 'chatRailOpen'
];

function collectLocalProfileKeys(p: Pick<ProfileListEntry, 'id'>) {
  const keys: Record<string, string> = {};
  const imported = localStorage.getItem(profileStorageKey(p.id, 'imported'));
  if (imported) keys.imported = imported;
  const chat = localStorage.getItem(`labcharts-${p.id}-chat`);
  if (chat) keys.chat = chat;
  const threadIndex = localStorage.getItem(`labcharts-${p.id}-chat-threads`);
  if (threadIndex) {
    keys['chat-threads'] = threadIndex;
    try {
      const threads = JSON.parse(threadIndex) as Array<{ id: unknown }>;
      for (const t of threads) {
        const tk = `labcharts-${p.id}-chat-t_${t.id}`;
        const tv = localStorage.getItem(tk);
        if (tv !== null) keys[`chat-t_${t.id}`] = tv;
      }
    } catch {}
  }
  for (const suffix of PER_PROFILE_PREF_SUFFIXES) {
    const v = localStorage.getItem(`labcharts-${p.id}-${suffix}`);
    if (v !== null) keys[suffix] = v;
  }
  return keys;
}

function restoreBackupEncryptionSettings(backup: BackupRestoreView) {
  if (backup.encrypted && backup.encryptionSalt) {
    localStorage.setItem('labcharts-encryption-enabled', 'true');
    localStorage.setItem('labcharts-encryption-salt', (backup.encryptionSalt as string));
  } else {
    localStorage.removeItem('labcharts-encryption-enabled');
    localStorage.removeItem('labcharts-encryption-salt');
  }
}

async function restoreBackupSettings(backup: BackupRestoreView) {
  if (!backup.settings || typeof backup.settings !== 'object') return;
  const deps = getBackupRuntimeDeps();
  for (const [key, value] of Object.entries(backup.settings)) {
    // Re-wrap credentials from legacy unencrypted backups before local storage.
    if (!backup.encrypted && deps.isCredentialKey(key)) await deps.encryptedSetItem(key, String(value));
    else localStorage.setItem(key, String(value));
  }
}

// Wearable L1 IndexedDB lives outside localStorage (per-profile DB
// `labcharts-wearables-${profileId}`) — read raw daily rows for every
// connected source so backups can round-trip the full 90 days of HRV/sleep/
// RHR + manual entries. Returns { profileId: { source: rows[] } }.
async function collectWearableIDB(profileIds: Iterable<string>) {
  const out: WearableBackup = {};
  for (const pid of profileIds) {
    // CRITICAL: read RAW (no decrypt). When encryption-at-rest is on, the
    // rows on disk are AES-GCM-wrapped envelopes. getDailyRange would
    // decrypt them into plaintext for the snapshot — silently downgrading
    // the at-rest guarantee. getDailyRangeRaw returns rows as-stored.
    // WHOOP and Google Health raw rows use an always-on device key.
    // These keys are non-exportable, so omit those rows rather than creating
    // undecryptable or downgraded backups; reconnecting can fetch them again.
    const KNOWN_SOURCES = ['oura', 'fitbit', 'withings', 'ultrahuman', 'polar', 'apple_health', 'manual'];
    const perProfile: Record<string, StoredWearableRow[]> = {};
    for (const src of KNOWN_SOURCES) {
      const srcRows = await getDailyRangeRaw(pid, src, '2000-01-01', '2099-12-31');
      if (Array.isArray(srcRows) && srcRows.length > 0) perProfile[src] = srcRows;
    }
    if (Object.keys(perProfile).length > 0) out[pid] = perProfile;
  }
  return out;
}

async function restoreWearableIDB(payload: unknown) {
  if (!payload || typeof payload !== 'object') return;
  let failures = 0;
  for (const [pid, sources] of Object.entries(payload)) {
    for (const [, rows] of Object.entries(sources as Record<string, unknown>)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      // RAW write — preserve wrappers from an encrypted backup. If the
      // destination has encryption disabled, the wrappers stay unreadable
      // until the user enables encryption with the matching passphrase, OR
      // they get rewritten in plaintext on next mutation (write-on-touch
      // via the normal upsertDaily path). NOT decrypting at restore time
      // keeps the encryption guarantee end-to-end.
      try { await upsertDailyBatchRaw(pid, rows); } catch { failures += 1; }
    }
  }
  if (failures) throw new Error(`${failures} wearable source(s) could not be restored.`);
}

async function restoreBackupSideStores(backup: BackupRestoreView) {
  // Wait for every dependent restore to settle. A partial restore must never
  // trigger a success notification or an automatic reload.
  const results = await Promise.allSettled([
    restoreWearableIDB(backup.wearableIDB),
    loadBackupCycleModule()
      .then(({ restoreCycleBackup }) => restoreCycleBackup(backup.cycleIDB, backup.cycleImportMeta)),
  ]);
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length) {
    throw new Error('Backup restore incomplete. Some data may already be restored. Keep the backup and retry after resolving the storage problem.');
  }
}

export function buildBackupSnapshot(): BackupSnapshot | null {
  const profiles = localStorage.getItem('labcharts-profiles');
  if (!profiles) return null;

  let profileList: ProfileListEntry[];
  try {
    profileList = JSON.parse(isEncryptedValue(profiles) ? '[]' : profiles);
  } catch {
    profileList = [];
  }

  const backupProfiles: BackupProfile[] = [];
  if (profileList.length > 0) {
    for (const p of profileList) {
      const keys = collectLocalProfileKeys(p);
      backupProfiles.push({ profileId: p.id, name: p.name, keys });
    }
  } else {
    const profileIds = new Set<string>();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const match = key && key.match(/^labcharts-(.+)-imported$/);
      if (match) profileIds.add(match[1]!);
    }
    for (const pid of profileIds) {
      const keys = collectLocalProfileKeys({ id: pid });
      backupProfiles.push({ profileId: pid, name: pid, keys });
    }
  }

  const settings: Record<string, string> = {};
  for (const k of GLOBAL_SETTINGS_KEYS) {
    // Device-key envelopes are not portable; only passphrase-encrypted backups include credentials.
    if (!getEncryptionEnabled() && getBackupRuntimeDeps().isCredentialKey(k)) continue;
    const v = localStorage.getItem(k);
    if (v !== null) settings[k] = v;
  }

  return {
    format: 'labcharts-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    encrypted: getEncryptionEnabled(),
    encryptionSalt: localStorage.getItem('labcharts-encryption-salt') || null,
    settings,
    profileList: profiles,
    profiles: backupProfiles,
    wearableIDB: null, // populated async by augmentBackupWithWearables
    cycleIDB: null,
    cycleImportMeta: null,
  };
}

// Build a snapshot AND populate the wearable L1 rows + the IDB-backed
// `-imported` blobs. Most callers (auto-backup, folder-backup, manual
// export) want the full payload; the legacy synchronous
// `buildBackupSnapshot` stays for tests that don't need IDB rows.
//
// `buildBackupSnapshot` reads only localStorage, so post-IDB-migration
// the `-imported` slot in each profile.keys would be empty for users
// whose blob already moved. Patch that here by fetching from IDB when
// localStorage didn't have the value.
export async function buildFullBackupSnapshot() {
  const snap = buildBackupSnapshot();
  if (!snap) return null;

  // Always enumerate the decrypted profile index: localStorage may contain
  // only a legacy subset while other profiles have already migrated to IDB.
  if (snap.profileList && isEncryptedValue(snap.profileList)) {
    let profileList: ProfileListEntry[] | null = null;
    try {
      const decrypted = await getBackupRuntimeDeps().encryptedGetItem('labcharts-profiles');
      if (decrypted) profileList = JSON.parse(decrypted);
    } catch {}
    if (!Array.isArray(profileList)) {
      throw new Error('The encrypted profile list could not be read. Unlock your data before creating a backup.');
    }
    snap.profiles = [];
    for (const p of profileList) {
      const keys = collectLocalProfileKeys(p);
      snap.profiles.push({ profileId: p.id, name: p.name, keys });
    }
  }
  for (const p of snap.profiles || []) {
    if (p.keys) {
      const key = profileStorageKey(p.profileId, 'imported');
      // Hydrate WHOOP's sidecar before copying the deliberately stripped canonical value.
      try { await getBackupRuntimeDeps().encryptedGetItem(key); } catch {}
      const rawImported = await readRawStoredItem(key);
      if (rawImported != null) p.keys.imported = rawImported;
    }
    await collectRawChatBackup(p, { encryptedGetItem: getBackupRuntimeDeps().encryptedGetItem, readRawStoredItem });
  }
  const profileIds = (snap.profiles || []).map(p => p.profileId);
  snap.wearableIDB = await collectWearableIDB(profileIds);
  const { collectCycleBackup } = await loadBackupCycleModule();
  const cycleBackup = await collectCycleBackup(profileIds);
  snap.cycleIDB = cycleBackup.observations;
  snap.cycleImportMeta = cycleBackup.importMeta;
  return snap;
}

export async function exportEncryptedBackup() {
  let backup;
  try {
    backup = await buildFullBackupSnapshot();
  } catch (err) {
    showNotification('Backup could not be created: ' + getErrorMessage(err), 'error');
    return;
  }
  if (!backup) {
    showNotification('No data to back up', 'error');
    return;
  }

  const blob = new Blob([serializeBackupSnapshot(backup)!], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `labcharts-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  localStorage.setItem('labcharts-last-manual-backup', new Date().toISOString());
  showNotification('Backup exported successfully', 'success');
}

export function importEncryptedBackup(file: Blob) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const result = e.target?.result;
      if (typeof result !== 'string') {
        showNotification('Invalid backup file format', 'error');
        return;
      }
      // Decoding restores byte arrays, not a validated backup schema. Keep the
      // legacy field reads and coercions explicit at this import boundary.
      const backup = parseBackupSnapshot(result) as BackupRestoreView;
      if (backup.format !== 'labcharts-backup' || !backup.profileList) {
        showNotification('Invalid backup file format', 'error');
        return;
      }

      const profileCount = backup.profiles ? (backup.profiles as { length: number }).length : 0;
      const encMsg = backup.encrypted ? ' This backup is encrypted \u2014 you\'ll need the same passphrase.' : '';

      if (await showConfirmDialog(
        `Restore backup from ${new Date((backup.createdAt as string | number)).toLocaleDateString()}? This will overwrite ${profileCount} profile(s).${encMsg}`
      )) {
        restoreBackupEncryptionSettings(backup);

        await restoreBackupSettings(backup);

        localStorage.setItem('labcharts-profiles', (backup.profileList as string));

        // Restore each profile's keys. Big-blob keys (`-imported`)
        // route to IndexedDB; everything else stays in localStorage.
        // writeRawStoredItem is async because of the IDB path \u2014 await
        // each so the wearable restore + reload only fires after all
        // profile keys are actually written.
        if (backup.profiles) {
          for (const p of (backup.profiles as Array<{ profileId: unknown; keys: Record<string, unknown> }>)) {
            for (const [suffix, value] of Object.entries(p.keys)) {
              const key = `labcharts-${p.profileId}-${suffix}`;
              await writeRawStoredItem(key, value);
            }
          }
        }
        prepareRestoredProfilesForSync(backup);

        await restoreBackupSideStores(backup);
        showNotification('Backup restored \u2014 reloading...', 'success');
        setTimeout(() => location.reload(), 1000);
      }
    } catch (err) {
      showNotification('Error reading backup: ' + getErrorMessage(err), 'error');
    }
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════════════
// AUTO-BACKUP (IndexedDB)
// ═══════════════════════════════════════════════
const BACKUP_DB_NAME = 'labcharts-backups';
const BACKUP_STORE = 'snapshots';
const FOLDER_HANDLE_STORE = 'folder-handle';
export const MAX_SNAPSHOTS = 5;
const AUTO_BACKUP_COOLDOWN = 300000; // 5 minutes
let _autoBackupTimer: ReturnType<typeof setTimeout> | null = null;
let _dbPromise: Promise<IDBDatabase> | null = null;

// Folder backup state
let _folderHandle: BackupDirectory | null = null;
let _folderPermissionLost = false;
let _folderWriteInProgress = false;

export function openBackupDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(BACKUP_DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BACKUP_STORE)) {
        db.createObjectStore(BACKUP_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(FOLDER_HANDLE_STORE)) {
        db.createObjectStore(FOLDER_HANDLE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { _dbPromise = null; reject(req.error); };
  });
  return _dbPromise;
}

async function performAutoBackup() {
  try {
    const snapshot = await buildFullBackupSnapshot();
    if (!snapshot) return;
    const db = await openBackupDB();
    const tx = db.transaction(BACKUP_STORE, 'readwrite');
    const store = tx.objectStore(BACKUP_STORE);
    store.add({ createdAt: snapshot.createdAt, encrypted: snapshot.encrypted, snapshot });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });

    const tx2 = db.transaction(BACKUP_STORE, 'readwrite');
    const store2 = tx2.objectStore(BACKUP_STORE);
    const countReq = store2.count();
    countReq.onsuccess = () => {
      const total = countReq.result;
      if (total > MAX_SNAPSHOTS) {
        const cursorReq = store2.openCursor();
        let deleted = 0;
        const toDelete = total - MAX_SNAPSHOTS;
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor && deleted < toDelete) {
            cursor.delete();
            deleted++;
            cursor.continue();
          }
        };
      }
    };
    await new Promise((resolve) => { tx2.oncomplete = resolve; tx2.onerror = resolve; });
    localStorage.setItem('labcharts-last-autobackup', snapshot.createdAt);
    showNotification('Auto-backup saved', 'info', 2000);
    writeFolderBackup();
  } catch { /* silent — auto-backup is best-effort */ }
}

export function scheduleAutoBackup() {
  if (_autoBackupTimer) return;
  _autoBackupTimer = setTimeout(async () => {
    _autoBackupTimer = null;
    await performAutoBackup();
  }, AUTO_BACKUP_COOLDOWN);
}

export async function getAutoBackupSnapshots(): Promise<AutoBackupRecord[]> {
  try {
    const db = await openBackupDB();
    const tx = db.transaction(BACKUP_STORE, 'readonly');
    const store = tx.objectStore(BACKUP_STORE);
    const req = store.getAll();
    return new Promise((resolve) => {
      req.onsuccess = () => resolve((req.result || []).reverse());
      req.onerror = () => resolve([]);
    });
  } catch { return []; }
}

export async function restoreAutoBackup(id: IDBValidKey) {
  const db = await openBackupDB();
  const tx = db.transaction(BACKUP_STORE, 'readonly');
  const store = tx.objectStore(BACKUP_STORE);
  const req = store.get(id);
  const record = await new Promise<AutoBackupRecord | null | undefined>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!record || !record.snapshot) {
    showNotification('Snapshot not found', 'error');
    return;
  }
  const backup = record.snapshot;

  if (await showConfirmDialog(
    `Restore auto-backup from ${new Date((backup.createdAt as string | number)).toLocaleString()}? This will overwrite all current data.`
  )) {
    restoreBackupEncryptionSettings(backup);
    await restoreBackupSettings(backup);
    localStorage.setItem('labcharts-profiles', (backup.profileList as string));
    if (backup.profiles) {
      for (const p of (backup.profiles as Array<{ profileId: unknown; keys: Record<string, unknown> }>)) {
        for (const [suffix, value] of Object.entries(p.keys)) {
          await writeRawStoredItem(`labcharts-${p.profileId}-${suffix}`, value);
        }
      }
    }
    prepareRestoredProfilesForSync(backup);
    // Wearable L1 IDB rows live outside localStorage \u2014 restore them
    // separately so the strip's detail-modal chart history is preserved
    // along with everything else.
    await restoreBackupSideStores(backup);
    showNotification('Backup restored \u2014 reloading...', 'success');
    setTimeout(() => location.reload(), 1000);
  }
}

// ═══════════════════════════════════════════════
// FOLDER BACKUP (File System Access API)
// ═══════════════════════════════════════════════
function isFolderBackupSupported() {
  return typeof appWindow.showDirectoryPicker === 'function';
}

async function saveFolderHandle(handle: BackupDirectory) {
  const db = await openBackupDB();
  const tx = db.transaction(FOLDER_HANDLE_STORE, 'readwrite');
  tx.objectStore(FOLDER_HANDLE_STORE).put(handle, 'handle');
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}

async function loadFolderHandle(): Promise<BackupDirectory | null> {
  const db = await openBackupDB();
  const tx = db.transaction(FOLDER_HANDLE_STORE, 'readonly');
  const req = tx.objectStore(FOLDER_HANDLE_STORE).get('handle');
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  });
}

async function clearFolderHandle() {
  const db = await openBackupDB();
  const tx = db.transaction(FOLDER_HANDLE_STORE, 'readwrite');
  tx.objectStore(FOLDER_HANDLE_STORE).delete('handle');
  await new Promise((resolve) => { tx.oncomplete = resolve; tx.onerror = resolve; });
}

export async function initFolderBackup() {
  if (!isFolderBackupSupported()) return;
  try {
    const handle = await loadFolderHandle();
    if (!handle) return;
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      _folderHandle = handle;
      _folderPermissionLost = false;
    } else {
      _folderHandle = handle;
      _folderPermissionLost = true;
      const reauth = async () => {
        document.removeEventListener('click', reauth);
        document.removeEventListener('keydown', reauth);
        try {
          const p = await handle.requestPermission({ mode: 'readwrite' });
          if (p === 'granted') {
            _folderPermissionLost = false;
            refreshFolderBackupUI();
          }
        } catch { /* user denied or browser blocked */ }
      };
      document.addEventListener('click', reauth);
      document.addEventListener('keydown', reauth);
    }
  } catch { /* silent — folder may have been deleted */ }
}

export async function pickFolderForBackup() {
  if (!isFolderBackupSupported()) return;
  const pickDirectory = appWindow.showDirectoryPicker!;
  try {
    const handle = await pickDirectory.call(appWindow, { mode: 'readwrite' });
    const testFile = await handle.getFileHandle('getbased-backup-latest.json', { create: true });
    const snapshot = await buildFullBackupSnapshot();
    if (snapshot) {
      const writable = await testFile.createWritable();
      await writable.write(serializeBackupSnapshot(snapshot)!);
      await writable.close();
    }
    await saveFolderHandle(handle);
    _folderHandle = handle;
    _folderPermissionLost = false;
    localStorage.setItem('labcharts-folder-backup-last', new Date().toISOString());
    showNotification(`Backup folder set: ${handle.name}`, 'success');
    refreshFolderBackupUI();
  } catch (err) {
    if (getErrorName(err) === 'AbortError') return;
    showNotification('Could not set backup folder: ' + getErrorMessage(err), 'error');
  }
}

export async function reauthorizeFolderBackup() {
  if (!_folderHandle) return;
  try {
    const perm = await _folderHandle.requestPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
      _folderPermissionLost = false;
      showNotification('Folder access restored', 'success');
      refreshFolderBackupUI();
    } else {
      showNotification('Permission denied — try picking the folder again', 'error');
    }
  } catch (err) {
    showNotification('Could not restore access: ' + getErrorMessage(err), 'error');
  }
}

export async function removeFolderBackup() {
  if (await showConfirmDialog('Stop backing up to this folder?')) {
    _folderHandle = null;
    _folderPermissionLost = false;
    await clearFolderHandle();
    localStorage.removeItem('labcharts-folder-backup-last');
    showNotification('Folder backup removed', 'info');
    refreshFolderBackupUI();
  }
}

export function getFolderBackupState() {
  return {
    supported: isFolderBackupSupported(),
    folderName: _folderHandle ? _folderHandle.name : null,
    permissionLost: _folderPermissionLost,
    lastBackup: localStorage.getItem('labcharts-folder-backup-last') || null
  };
}

async function writeFolderBackup() {
  if (!_folderHandle || _folderPermissionLost || _folderWriteInProgress) return;
  _folderWriteInProgress = true;
  try {
    const perm = await _folderHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      _folderPermissionLost = true;
      refreshFolderBackupUI();
      return;
    }
    const snapshot = await buildFullBackupSnapshot();
    if (!snapshot) return;
    const json = serializeBackupSnapshot(snapshot)!;
    const latestFile = await _folderHandle.getFileHandle('getbased-backup-latest.json', { create: true });
    const w1 = await latestFile.createWritable();
    await w1.write(json);
    await w1.close();
    const now = new Date();
    const day = now.toISOString().slice(0, 10);
    const tsName = `getbased-backup-${day}.json`;
    const tsFile = await _folderHandle.getFileHandle(tsName, { create: true });
    const w2 = await tsFile.createWritable();
    await w2.write(json);
    await w2.close();
    const MAX_FOLDER_SNAPSHOTS = 30;
    const backupFiles: string[] = [];
    for await (const [name] of _folderHandle) {
      if (name.startsWith('getbased-backup-') && name.endsWith('.json') && name !== 'getbased-backup-latest.json') {
        backupFiles.push(name);
      }
    }
    if (backupFiles.length > MAX_FOLDER_SNAPSHOTS) {
      backupFiles.sort();
      const toDelete = backupFiles.slice(0, backupFiles.length - MAX_FOLDER_SNAPSHOTS);
      for (const name of toDelete) {
        await _folderHandle.removeEntry(name).catch(() => {});
      }
    }
    localStorage.setItem('labcharts-folder-backup-last', new Date().toISOString());
  } catch (err) {
    if (getErrorName(err) === 'NotAllowedError') {
      _folderPermissionLost = true;
      refreshFolderBackupUI();
    } else if (getErrorName(err) === 'QuotaExceededError') {
      showNotification('Backup folder is full — free up disk space', 'error');
    } else {
      showNotification('Folder backup failed: ' + getErrorMessage(err), 'error');
    }
  } finally {
    _folderWriteInProgress = false;
  }
}

function refreshFolderBackupUI() {
  const el = document.getElementById('backup-folder-section');
  if (el) el.innerHTML = renderFolderBackupSection();
}

export function renderFolderBackupSection() {
  if (!isFolderBackupSupported()) return '';
  const st = getFolderBackupState();
  let html = '<div class="backup-folder-section">';
  html += '<div class="backup-folder-desc">Sync backups to a local folder (Proton Drive, Dropbox, NAS, etc.)</div>';
  if (!st.folderName) {
    html += `<button class="import-btn import-btn-secondary" ${backupActionAttrs('pick-folder')}>Set backup folder</button>`;
  } else if (st.permissionLost) {
    html += `<div class="backup-folder-status backup-folder-status-warn">Folder: ${escapeHTML(st.folderName)} — access lost</div>`;
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    html += `<button class="import-btn import-btn-primary" ${backupActionAttrs('reauthorize-folder')}>Restore access</button>`;
    html += `<button class="import-btn import-btn-secondary" ${backupActionAttrs('remove-folder')}>Remove</button>`;
    html += '</div>';
  } else {
    const lastLabel = st.lastBackup ? new Date(st.lastBackup).toLocaleString() : 'never';
    html += `<div class="backup-folder-status backup-folder-status-ok">Folder: ${escapeHTML(st.folderName)}</div>`;
    html += `<div class="backup-folder-meta">Last folder backup: ${escapeHTML(lastLabel)}</div>`;
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    html += `<button class="import-btn import-btn-secondary" ${backupActionAttrs('pick-folder')}>Change folder</button>`;
    html += `<button class="import-btn import-btn-secondary" ${backupActionAttrs('remove-folder')}>Remove</button>`;
    html += '</div>';
  }
  html += '</div>';
  return html;
}
