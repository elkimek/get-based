// @ts-check
// sync-identity.js - BIP-39/QR loading and mnemonic restore helpers.

import { loadScriptOnce, showNotification } from './utils.js';
import {
  clearSyncDisableStorage,
} from './sync-disable-cleanup.js';
import { getPendingBackupRestoreProfileIds } from './sync-backup-restore-state.js';
import { scheduleSyncRuntimeReload } from './sync-runtime.js';
import { setSyncEnabled } from './sync-settings-state.js';

/** @typedef {{ id?: unknown, mnemonic?: string }} SyncAppOwner */
/** @typedef {{ restoreAppOwner: (mnemonic: string, options?: { reload?: boolean }) => unknown, prepareHistoryReset?: () => unknown }} SyncEvolu */

let _bip39Load = null;
let _qrCodeLoad = null;
/** @type {() => SyncAppOwner | null} */
let _getAppOwner = () => null;
/** @type {() => any} */
let _getAppOwnerError = () => null;
/** @type {() => SyncEvolu | null} */
let _getEvolu = () => null;
/** @type {(...args: any[]) => Promise<any>} */
let _seedLocalProfiles = async () => {};

export const RESTORE_JOIN_PENDING_KEY = 'labcharts-sync-restore-join-pending';
export const RESTORE_NOTICE_KEY = 'labcharts-sync-restore-notice';

function setRestoreNotice(kind) {
  try { sessionStorage.setItem(RESTORE_NOTICE_KEY, kind); } catch {}
}

function clearRestoreNotice() {
  try { sessionStorage.removeItem(RESTORE_NOTICE_KEY); } catch {}
}

export function consumeSyncRestoreNotice() {
  let kind = '';
  try {
    kind = sessionStorage.getItem(RESTORE_NOTICE_KEY) || '';
    sessionStorage.removeItem(RESTORE_NOTICE_KEY);
  } catch {}
  if (kind === 'seed-local') return 'Sync identity restored and this device’s data was republished.';
  if (kind === 'join') return 'Joined existing sync identity. Syncing data from your other device…';
  return null;
}

function normalizeMnemonic(mnemonic) {
  return String(mnemonic || '').normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ');
}

/** @param {{
 *   getAppOwner?: () => SyncAppOwner | null,
 *   getAppOwnerError?: () => any,
 *   getEvolu?: () => SyncEvolu | null,
 *   seedLocalProfiles?: (...args: any[]) => Promise<any>,
 * }} [deps]
 */
export function configureSyncIdentity({
  getAppOwner,
  getAppOwnerError,
  getEvolu,
  seedLocalProfiles,
} = {}) {
  if (typeof getAppOwner === 'function') _getAppOwner = getAppOwner;
  if (typeof getAppOwnerError === 'function') _getAppOwnerError = getAppOwnerError;
  if (typeof getEvolu === 'function') _getEvolu = getEvolu;
  if (typeof seedLocalProfiles === 'function') _seedLocalProfiles = seedLocalProfiles;
}

function currentAppOwner() {
  try { return _getAppOwner?.() || null; } catch { return null; }
}

function currentEvolu() {
  try { return _getEvolu?.() || null; } catch { return null; }
}

export async function ensureBip39() {
  const w = /** @type {any} */ (window);
  if (w.bip39) return w.bip39;
  if (!_bip39Load) {
    _bip39Load = loadScriptOnce('/vendor/bip39-minimal.js').then(() => {
      if (!w.bip39) throw new Error('BIP-39 library did not initialize');
      return w.bip39;
    }).catch(err => {
      _bip39Load = null;
      throw err;
    });
  }
  return _bip39Load;
}

export async function ensureQRCode() {
  if (typeof qrcode === 'function') return qrcode;
  if (!_qrCodeLoad) {
    _qrCodeLoad = loadScriptOnce('/vendor/qrcode-generator.js').then(() => {
      if (typeof qrcode !== 'function') throw new Error('QR code library did not initialize');
      return qrcode;
    }).catch(err => {
      _qrCodeLoad = null;
      throw err;
    });
  }
  return _qrCodeLoad;
}

export function getMnemonic() {
  const appOwner = currentAppOwner();
  if (!appOwner) return null;
  return appOwner.mnemonic || null;
}

/**
 * Return a short, non-secret code for visually comparing Sync identities.
 *
 * The code is derived from Evolu's public owner ID, not from the mnemonic.
 * It therefore cannot restore or decrypt data, while still giving two
 * devices a stable value that changes when their 24-word identity differs.
 */
export async function getSyncIdentityFingerprint() {
  const appOwner = currentAppOwner();
  const ownerId = appOwner?.id ? String(appOwner.id) : '';
  if (!ownerId || !globalThis.crypto?.subtle) return null;
  try {
    const input = new TextEncoder().encode(`getbased-sync-identity-v1:${ownerId}`);
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', input));
    const shortHex = Array.from(digest.slice(0, 6), byte => byte.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    return `${shortHex.slice(0, 4)}-${shortHex.slice(4, 8)}-${shortHex.slice(8, 12)}`;
  } catch {
    return null;
  }
}

/**
 * Returns the last Evolu owner-resolution error, or null. The Settings UI
 * uses this to show an actionable message instead of looping on "Resolving..."
 * for 30s when Evolu's worker fails to start (OPFS contention, locked
 * IndexedDB, missing relay, etc.).
 */
export function getMnemonicResolutionError() {
  try { return _getAppOwnerError?.() || null; } catch { return null; }
}

function setRestoreJoinPending(enabled) {
  try {
    if (enabled) localStorage.setItem(RESTORE_JOIN_PENDING_KEY, String(Date.now()));
    else localStorage.removeItem(RESTORE_JOIN_PENDING_KEY);
  } catch {}
}

export function isRestoreJoinPending() {
  try { return !!localStorage.getItem(RESTORE_JOIN_PENDING_KEY); } catch { return false; }
}

export function clearRestoreJoinPending() {
  setRestoreJoinPending(false);
}

/**
 * Reset Evolu's append-only local history while retaining the current owner.
 *
 * Relay compaction deliberately rejects every message timestamp that existed
 * before the compaction. Reopening the same local Evolu database would replay
 * that old history, so rebuild from an empty database and emit one fresh
 * canonical application snapshot instead.
 */
export async function resetLocalSyncHistoryForRelayRebuild() {
  const evolu = currentEvolu();
  const mnemonic = getMnemonic();
  if (!evolu || !mnemonic) throw new Error('Sync identity is not ready on this device');
  await evolu.restoreAppOwner(mnemonic, { reload: false });
  clearSyncDisableStorage();
  return true;
}

/**
 * Reserve a fresh local history generation before the relay log is deleted.
 * Evolu 7 performs its normal reset later; the Evolu 8 candidate uses this
 * hook to prove the generation boundary is durable before compaction begins.
 */
export async function prepareLocalSyncHistoryForRelayRebuild() {
  const evolu = currentEvolu();
  const mnemonic = getMnemonic();
  if (!evolu || !mnemonic) throw new Error('Sync identity is not ready on this device');
  if (typeof evolu.prepareHistoryReset === 'function') evolu.prepareHistoryReset();
  return true;
}

/** @param {string} mnemonic
 * @param {{ seedLocal?: boolean }} [options]
 */
export async function restoreFromMnemonic(mnemonic, options = {}) {
  const evolu = currentEvolu();
  if (!evolu) {
    showNotification('Sync is still starting. Wait a moment and try again.', 'error');
    return false;
  }
  const normalizedMnemonic = normalizeMnemonic(mnemonic);
  setRestoreNotice(options?.seedLocal ? 'seed-local' : 'join');
  try {
    if (options?.seedLocal) {
      await evolu.restoreAppOwner(normalizedMnemonic);
    } else {
      // Evolu defaults restoreAppOwner to reload immediately from inside its
      // worker. That navigation happens before the returned promise resolves,
      // so none of the join-finalization below would run. In particular, a
      // first-time join starts with persist:false and would reload with sync
      // still disabled, leaving the restored owner unable to pull relay data.
      // Keep the reset in this page long enough to commit our application
      // state, then use the controlled reload at the end of this function.
      await evolu.restoreAppOwner(normalizedMnemonic, { reload: false });
    }
    // First-time joins initialize Evolu provisionally. Persist sync only once
    // the requested identity has actually been accepted.
    setSyncEnabled(true);
    // sessionStorage survives the reload below. Locks created under the old
    // owner must not veto provider settings pulled from the restored owner.
    sessionStorage.removeItem('labcharts-ai-settings-local-lock-until');
    sessionStorage.removeItem('or_oauth_local_settings_lock_until');
    // After mnemonic restore, the new Evolu owner has zero rows; the old
    // delta snapshot would tell the planner "I already pushed these items",
    // leaving the new owner's relay empty. Drop snapshots so the first push
    // under the new identity re-emits everything as inserts.
    const restoredProfileIds = getPendingBackupRestoreProfileIds();
    if (restoredProfileIds.length > 0) {
      clearSyncDisableStorage({ preserveDirtyProfileIds: restoredProfileIds });
    } else {
      clearSyncDisableStorage();
    }
    if (options?.seedLocal) {
      setRestoreJoinPending(false);
      await _seedLocalProfiles();
      showNotification('Restored mnemonic and seeded this device — reloading…', 'success');
    } else {
      // This device is joining an existing owner. On first pull, old local
      // tombstones from the previous owner must not veto the source device's
      // rows, or a stale "deleted May" marker can re-delete valid data.
      setRestoreJoinPending(true);
      showNotification('Restored from mnemonic — reloading…', 'success');
    }
    // Reload so the app re-initializes from the restored CRDT identity.
    scheduleSyncRuntimeReload(500);
    return true;
  } catch (e) {
    clearRestoreNotice();
    console.error('[sync] Restore failed:', e);
    showNotification('Invalid mnemonic', 'error');
    return false;
  }
}
