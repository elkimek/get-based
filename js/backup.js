// backup.js — Backup/restore, auto-backup (IndexedDB), folder backup (File System Access API)

import { showNotification, showConfirmDialog, escapeHTML } from './utils.js';
import { profileStorageKey } from './profile.js';
import { getBlob, setBlob, shouldUseBlob } from './blob-storage.js';

// Use window.* to avoid circular import (crypto.js imports from backup.js)
const getEncryptionEnabled = () => window.getEncryptionEnabled?.() || false;
const isEncryptedValue = (v) => typeof v === 'string' && v.startsWith('v1:');

// Read the RAW stored value (encrypted-if-encryption-on, plaintext-if-off)
// for any key. Big-blob `-imported` keys live in IndexedDB now; everything
// else stays in localStorage. Backup needs the raw form so the encrypted
// envelope (if any) round-trips unchanged through restore.
async function readRawStoredItem(key) {
  if (shouldUseBlob(key)) {
    const blob = await getBlob(key);
    if (blob != null) return blob;
    // Migration safety: pre-IDB installs have the value in localStorage.
    return localStorage.getItem(key);
  }
  return localStorage.getItem(key);
}

async function writeRawStoredItem(key, value) {
  if (shouldUseBlob(key)) {
    await setBlob(key, value);
    // Best-effort cleanup of any pre-IDB localStorage residue for this key.
    try { localStorage.removeItem(key); } catch {}
  } else {
    localStorage.setItem(key, value);
  }
}

// ═══════════════════════════════════════════════
// BACKUP / RESTORE
// ═══════════════════════════════════════════════
const GLOBAL_SETTINGS_KEYS = [
  'labcharts-venice-key', 'labcharts-openrouter-key', 'labcharts-routstr-key', 'labcharts-ppq-key',
  'labcharts-custom-key', 'labcharts-custom-url', 'labcharts-custom-model', 'labcharts-custom-models',
  'labcharts-ai-provider',
  'labcharts-ppq-credit-id',
  'labcharts-venice-model', 'labcharts-openrouter-model', 'labcharts-routstr-model', 'labcharts-ppq-model',
  'labcharts-ollama', 'labcharts-ollama-model',
  'labcharts-ollama-pii-url', 'labcharts-ollama-pii-model',
  'labcharts-cashu-wallet-mnemonic', 'labcharts-cashu-wallet-mint', 'labcharts-routstr-node',
  'labcharts-time-format', 'labcharts-theme', 'labcharts-sunset-mode', 'labcharts-crt-effects', 'labcharts-debug',
  'labcharts-pii-review', 'labcharts-ollama-pii-enabled', 'labcharts-chat-sources',
  'labcharts-active-profile'
];

const PER_PROFILE_PREF_SUFFIXES = [
  'units', 'rangeMode', 'suppOverlay', 'noteOverlay', 'phaseOverlay',
  'chatPersonality', 'chatPersonalityCustom', 'chatRailOpen'
];

// Wearable L1 IndexedDB lives outside localStorage (per-profile DB
// `labcharts-wearables-${profileId}`) — read raw daily rows for every
// connected source so backups can round-trip the full 90 days of HRV/sleep/
// RHR + manual entries. Returns { profileId: { source: rows[] } }.
async function collectWearableIDB(profileIds) {
  const out = {};
  let store;
  try { store = await import('./wearables-store.js'); } catch { return out; }
  for (const pid of profileIds) {
    try {
      // CRITICAL: read RAW (no decrypt). When encryption-at-rest is on, the
      // rows on disk are AES-GCM-wrapped envelopes. getDailyRange would
      // decrypt them into plaintext for the snapshot — silently downgrading
      // the at-rest guarantee. getDailyRangeRaw returns rows as-stored.
      const KNOWN_SOURCES = ['oura', 'whoop', 'fitbit', 'withings', 'ultrahuman', 'polar', 'apple_health', 'manual'];
      const perProfile = {};
      for (const src of KNOWN_SOURCES) {
        try {
          const srcRows = await store.getDailyRangeRaw(pid, src, '2000-01-01', '2099-12-31');
          if (Array.isArray(srcRows) && srcRows.length > 0) perProfile[src] = srcRows;
        } catch { /* db-not-yet-created → skip */ }
      }
      if (Object.keys(perProfile).length > 0) out[pid] = perProfile;
    } catch { /* per-profile failure shouldn't break the whole backup */ }
  }
  return out;
}

async function restoreWearableIDB(payload) {
  if (!payload || typeof payload !== 'object') return;
  let store;
  try { store = await import('./wearables-store.js'); } catch { return; }
  for (const [pid, sources] of Object.entries(payload)) {
    for (const [, rows] of Object.entries(sources)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      // RAW write — preserve wrappers from an encrypted backup. If the
      // destination has encryption disabled, the wrappers stay unreadable
      // until the user enables encryption with the matching passphrase, OR
      // they get rewritten in plaintext on next mutation (write-on-touch
      // via the normal upsertDaily path). NOT decrypting at restore time
      // keeps the encryption guarantee end-to-end.
      try { await store.upsertDailyBatchRaw(pid, rows); } catch { /* per-source failure shouldn't break the whole restore */ }
    }
  }
}

export function buildBackupSnapshot() {
  const profiles = localStorage.getItem('labcharts-profiles');
  if (!profiles) return null;

  let profileList;
  try {
    profileList = JSON.parse(isEncryptedValue(profiles) ? '[]' : profiles);
  } catch {
    profileList = [];
  }

  const backupProfiles = [];
  if (profileList.length > 0) {
    for (const p of profileList) {
      const keys = {};
      const imported = localStorage.getItem(profileStorageKey(p.id, 'imported'));
      if (imported) keys.imported = imported;
      const chat = localStorage.getItem(`labcharts-${p.id}-chat`);
      if (chat) keys.chat = chat;
      const threadIndex = localStorage.getItem(`labcharts-${p.id}-chat-threads`);
      if (threadIndex) {
        keys['chat-threads'] = threadIndex;
        try {
          const threads = JSON.parse(threadIndex);
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
      backupProfiles.push({ profileId: p.id, name: p.name, keys });
    }
  } else {
    const profileIds = new Set();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const match = key && key.match(/^labcharts-([^-]+)-imported$/);
      if (match) profileIds.add(match[1]);
    }
    for (const pid of profileIds) {
      const keys = {};
      const imported = localStorage.getItem(profileStorageKey(pid, 'imported'));
      if (imported) keys.imported = imported;
      const chat = localStorage.getItem(`labcharts-${pid}-chat`);
      if (chat) keys.chat = chat;
      const threadIndex = localStorage.getItem(`labcharts-${pid}-chat-threads`);
      if (threadIndex) {
        keys['chat-threads'] = threadIndex;
        try {
          const threads = JSON.parse(threadIndex);
          for (const t of threads) {
            const tk = `labcharts-${pid}-chat-t_${t.id}`;
            const tv = localStorage.getItem(tk);
            if (tv !== null) keys[`chat-t_${t.id}`] = tv;
          }
        } catch {}
      }
      for (const suffix of PER_PROFILE_PREF_SUFFIXES) {
        const v = localStorage.getItem(`labcharts-${pid}-${suffix}`);
        if (v !== null) keys[suffix] = v;
      }
      backupProfiles.push({ profileId: pid, name: pid, keys });
    }
  }

  const settings = {};
  for (const k of GLOBAL_SETTINGS_KEYS) {
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

  // buildBackupSnapshot is sync — when the profile list is encrypted (v1:),
  // it can't enumerate IDs, and the localStorage fallback finds nothing
  // because v1.6.x stores `*-imported` in IDB. Re-enumerate from the
  // decrypted profile list here.
  if (snap.profiles.length === 0 && snap.profileList && isEncryptedValue(snap.profileList)) {
    let profileList = null;
    try {
      const decrypted = await window.encryptedGetItem?.('labcharts-profiles');
      if (decrypted) profileList = JSON.parse(decrypted);
    } catch {}
    if (Array.isArray(profileList)) {
      for (const p of profileList) {
        const keys = {};
        const imported = localStorage.getItem(profileStorageKey(p.id, 'imported'));
        if (imported) keys.imported = imported;
        const chat = localStorage.getItem(`labcharts-${p.id}-chat`);
        if (chat) keys.chat = chat;
        const threadIndex = localStorage.getItem(`labcharts-${p.id}-chat-threads`);
        if (threadIndex) {
          keys['chat-threads'] = threadIndex;
          try {
            const threads = JSON.parse(threadIndex);
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
        snap.profiles.push({ profileId: p.id, name: p.name, keys });
      }
    }
  }

  for (const p of snap.profiles || []) {
    if (p.keys && p.keys.imported == null) {
      const key = profileStorageKey(p.profileId, 'imported');
      const idbBlob = await getBlob(key);
      if (idbBlob != null) p.keys.imported = idbBlob;
    }
  }
  const profileIds = (snap.profiles || []).map(p => p.profileId);
  snap.wearableIDB = await collectWearableIDB(profileIds);
  return snap;
}

export async function exportEncryptedBackup() {
  const backup = await buildFullBackupSnapshot();
  if (!backup) {
    showNotification('No data to back up', 'error');
    return;
  }

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
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

export function importEncryptedBackup(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const backup = JSON.parse(e.target.result);
      if (backup.format !== 'labcharts-backup' || !backup.profileList) {
        showNotification('Invalid backup file format', 'error');
        return;
      }

      const profileCount = backup.profiles ? backup.profiles.length : 0;
      const encMsg = backup.encrypted ? ' This backup is encrypted \u2014 you\'ll need the same passphrase.' : '';

      if (await showConfirmDialog(
        `Restore backup from ${new Date(backup.createdAt).toLocaleDateString()}? This will overwrite ${profileCount} profile(s).${encMsg}`
      )) {
        if (backup.encrypted && backup.encryptionSalt) {
          localStorage.setItem('labcharts-encryption-enabled', 'true');
          localStorage.setItem('labcharts-encryption-salt', backup.encryptionSalt);
        } else {
          localStorage.removeItem('labcharts-encryption-enabled');
          localStorage.removeItem('labcharts-encryption-salt');
        }

        if (backup.settings && typeof backup.settings === 'object') {
          for (const [k, v] of Object.entries(backup.settings)) {
            localStorage.setItem(k, v);
          }
        }

        localStorage.setItem('labcharts-profiles', backup.profileList);

        // Restore each profile's keys. Big-blob keys (`-imported`)
        // route to IndexedDB; everything else stays in localStorage.
        // writeRawStoredItem is async because of the IDB path \u2014 await
        // each so the wearable restore + reload only fires after all
        // profile keys are actually written.
        if (backup.profiles) {
          for (const p of backup.profiles) {
            for (const [suffix, value] of Object.entries(p.keys)) {
              const key = `labcharts-${p.profileId}-${suffix}`;
              await writeRawStoredItem(key, value);
            }
          }
        }

        restoreWearableIDB(backup.wearableIDB).finally(() => {
          showNotification('Backup restored \u2014 reloading...', 'success');
          setTimeout(() => location.reload(), 1000);
        });
      }
    } catch (err) {
      showNotification('Error reading backup: ' + err.message, 'error');
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
let _autoBackupTimer = null;
let _dbPromise = null;

// Folder backup state
let _folderHandle = null;
let _folderPermissionLost = false;
let _folderWriteInProgress = false;

export function openBackupDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(BACKUP_DB_NAME, 2);
    req.onupgradeneeded = (e) => {
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

export async function getAutoBackupSnapshots() {
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

export async function restoreAutoBackup(id) {
  const db = await openBackupDB();
  const tx = db.transaction(BACKUP_STORE, 'readonly');
  const store = tx.objectStore(BACKUP_STORE);
  const req = store.get(id);
  const record = await new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  if (!record || !record.snapshot) {
    showNotification('Snapshot not found', 'error');
    return;
  }
  const backup = record.snapshot;

  if (await showConfirmDialog(
    `Restore auto-backup from ${new Date(backup.createdAt).toLocaleString()}? This will overwrite all current data.`
  )) {
    if (backup.encrypted && backup.encryptionSalt) {
      localStorage.setItem('labcharts-encryption-enabled', 'true');
      localStorage.setItem('labcharts-encryption-salt', backup.encryptionSalt);
    } else {
      localStorage.removeItem('labcharts-encryption-enabled');
      localStorage.removeItem('labcharts-encryption-salt');
    }
    if (backup.settings && typeof backup.settings === 'object') {
      for (const [k, v] of Object.entries(backup.settings)) {
        localStorage.setItem(k, v);
      }
    }
    localStorage.setItem('labcharts-profiles', backup.profileList);
    if (backup.profiles) {
      for (const p of backup.profiles) {
        for (const [suffix, value] of Object.entries(p.keys)) {
          localStorage.setItem(`labcharts-${p.profileId}-${suffix}`, value);
        }
      }
    }
    // Wearable L1 IDB rows live outside localStorage \u2014 restore them
    // separately so the strip's detail-modal chart history is preserved
    // along with everything else.
    restoreWearableIDB(backup.wearableIDB).finally(() => {
      showNotification('Backup restored \u2014 reloading...', 'success');
      setTimeout(() => location.reload(), 1000);
    });
  }
}

// ═══════════════════════════════════════════════
// FOLDER BACKUP (File System Access API)
// ═══════════════════════════════════════════════
function isFolderBackupSupported() {
  return typeof window.showDirectoryPicker === 'function';
}

async function saveFolderHandle(handle) {
  const db = await openBackupDB();
  const tx = db.transaction(FOLDER_HANDLE_STORE, 'readwrite');
  tx.objectStore(FOLDER_HANDLE_STORE).put(handle, 'handle');
  await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
}

async function loadFolderHandle() {
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
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    const testFile = await handle.getFileHandle('getbased-backup-latest.json', { create: true });
    const snapshot = await buildFullBackupSnapshot();
    if (snapshot) {
      const writable = await testFile.createWritable();
      await writable.write(JSON.stringify(snapshot, null, 2));
      await writable.close();
    }
    await saveFolderHandle(handle);
    _folderHandle = handle;
    _folderPermissionLost = false;
    localStorage.setItem('labcharts-folder-backup-last', new Date().toISOString());
    showNotification(`Backup folder set: ${handle.name}`, 'success');
    refreshFolderBackupUI();
  } catch (err) {
    if (err.name === 'AbortError') return;
    showNotification('Could not set backup folder: ' + err.message, 'error');
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
    showNotification('Could not restore access: ' + err.message, 'error');
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
    const json = JSON.stringify(snapshot, null, 2);
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
    const backupFiles = [];
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
    if (err.name === 'NotAllowedError') {
      _folderPermissionLost = true;
      refreshFolderBackupUI();
    } else if (err.name === 'QuotaExceededError') {
      showNotification('Backup folder is full — free up disk space', 'error');
    } else {
      showNotification('Folder backup failed: ' + err.message, 'error');
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
    html += '<button class="import-btn import-btn-secondary" onclick="pickFolderForBackup()">Set backup folder</button>';
  } else if (st.permissionLost) {
    html += `<div class="backup-folder-status backup-folder-status-warn">Folder: ${escapeHTML(st.folderName)} — access lost</div>`;
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    html += '<button class="import-btn import-btn-primary" onclick="reauthorizeFolderBackup()">Restore access</button>';
    html += '<button class="import-btn import-btn-secondary" onclick="removeFolderBackup()">Remove</button>';
    html += '</div>';
  } else {
    const lastLabel = st.lastBackup ? new Date(st.lastBackup).toLocaleString() : 'never';
    html += `<div class="backup-folder-status backup-folder-status-ok">Folder: ${escapeHTML(st.folderName)}</div>`;
    html += `<div class="backup-folder-meta">Last folder backup: ${escapeHTML(lastLabel)}</div>`;
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    html += '<button class="import-btn import-btn-secondary" onclick="pickFolderForBackup()">Change folder</button>';
    html += '<button class="import-btn import-btn-secondary" onclick="removeFolderBackup()">Remove</button>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

Object.assign(window, {
  buildBackupSnapshot,
  exportEncryptedBackup,
  importEncryptedBackup,
  scheduleAutoBackup,
  getAutoBackupSnapshots,
  restoreAutoBackup,
  openBackupDB,
  initFolderBackup,
  pickFolderForBackup,
  reauthorizeFolderBackup,
  removeFolderBackup,
  getFolderBackupState,
  renderFolderBackupSection,
});
