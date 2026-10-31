import type { Bip39Runtime } from './cashu-wallet-runtime-types.js';
import type { QRCodeFactory } from './provider-qr.js';
// sync-identity.js - BIP-39/QR loading and mnemonic restore helpers.

import { loadScriptOnce, showNotification } from './utils.js';
import {
  clearSyncDisableStorage,
} from './sync-disable-cleanup.js';
import { getPendingBackupRestoreProfileIds, type BackupRestoreStage } from './sync-backup-restore-state.js';
import { scheduleSyncRuntimeReload } from './sync-runtime.js';
import { setSyncEnabled, setSyncPublishingSuspended } from './sync-settings-state.js';

interface SyncAppOwner { id?: unknown; mnemonic?: string }
interface SyncEvolu { appOwner?: Promise<SyncAppOwner | null | undefined>; restoreAppOwner: (mnemonic: string, options?: { reload?: boolean }) => unknown }

declare const qrcode: QRCodeFactory | undefined;

let _bip39Load: Promise<Bip39Runtime> | null = null;
let _qrCodeLoad: Promise<QRCodeFactory> | null = null;
let _getAppOwner: () => SyncAppOwner | null = () => null;
let _getAppOwnerError: () => unknown = () => null;
let _getEvolu: () => SyncEvolu | null = () => null;
let _seedLocalProfiles: () => Promise<BackupRestoreStage | void> = async () => {};
let _pendingRecoveryRollback: {runtime: SyncEvolu; recovery: BackupRestoreStage} | null = null;

export const RESTORE_JOIN_PENDING_KEY = 'labcharts-sync-restore-join-pending';
export const RESTORE_NOTICE_KEY = 'labcharts-sync-restore-notice';

function setRestoreNotice(kind: string) {
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
  if (kind === 'seed-local') return 'Sync identity restored. Publishing this device’s data…';
  if (kind === 'join') return 'Joined existing sync identity. Syncing data from your other device…';
  return null;
}

function normalizeMnemonic(mnemonic: unknown) {
  return String(mnemonic || '').normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ');
}

interface SyncIdentityDeps {
  getAppOwner: typeof _getAppOwner;
  getAppOwnerError: typeof _getAppOwnerError;
  getEvolu: typeof _getEvolu;
  seedLocalProfiles: typeof _seedLocalProfiles;
}
export function configureSyncIdentity({
  getAppOwner,
  getAppOwnerError,
  getEvolu,
  seedLocalProfiles,
}: Partial<SyncIdentityDeps> = {}) {
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
  const w = (window as Window & { bip39?: Bip39Runtime });
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

/** Public owner identity for operation guards; never exposes recovery words. */
export function getSyncIdentityOwnerId(): string | null {
  const id = currentAppOwner()?.id;
  return id ? String(id) : null;
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
    if (String(currentAppOwner()?.id || '') !== ownerId) return null;
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

function setRestoreJoinPending(enabled: boolean) {
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

export async function restoreFromMnemonic(mnemonic: string, options: { seedLocal?: boolean } = {}) {
  const evolu = currentEvolu();
  if (!evolu) {
    showNotification('Sync is still starting. Wait a moment and try again.', 'error');
    return false;
  }
  if (_pendingRecoveryRollback) {
    if (_pendingRecoveryRollback.runtime === evolu) {
      if (!_pendingRecoveryRollback.recovery.rollback()) {
        showNotification('Sync recovery progress could not be restored. Your local data is retained. Retry after browser storage is available.', 'error');
        return false;
      }
      setSyncPublishingSuspended(false);
    }
    _pendingRecoveryRollback = null;
  }
  const normalizedMnemonic = normalizeMnemonic(mnemonic);
  const previousOwner = currentAppOwner();
  const previousMnemonic = normalizeMnemonic(previousOwner?.mnemonic || '');
  const identityChanged = !previousMnemonic || previousMnemonic !== normalizedMnemonic;
  setRestoreNotice(options?.seedLocal ? 'seed-local' : 'join');
  let recovery: BackupRestoreStage | void = undefined;
  let ownerRestored = false;
  if (options?.seedLocal) {
    if (setSyncPublishingSuspended(true)) return false;
    try {
      // Confirm durable recovery before resetting the owner or its database.
      recovery = await _seedLocalProfiles();
    } catch {
      if (currentEvolu() !== evolu) return false;
      setSyncPublishingSuspended(false);
      clearRestoreNotice();
      showNotification('Could not save sync recovery progress. Your identity and local data are unchanged. Free browser storage, then retry.', 'error');
      return false;
    }
    if (currentEvolu() !== evolu) { recovery?.rollback(); return false; }
  }
  try {
    // Keep Evolu 7 from reloading before join/seed finalization. Evolu 8 also
    // accepts this option; GetBased schedules the controlled reload below.
    await evolu.restoreAppOwner(normalizedMnemonic, { reload: false });
    ownerRestored = true;
    if (currentEvolu() !== evolu) return false;
    if (identityChanged) {
      const reset = await import('./clear-all-profile-reset.js');
      if (currentEvolu() !== evolu) return false;
      reset.clearAllProfileSyncDeleteState();
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
      // The retiring owner/query cache stays suspended until the reload.
      setRestoreJoinPending(false);
      showNotification('Restored mnemonic — reloading to publish this device’s data…', 'success');
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
  } catch {
    if (currentEvolu() !== evolu) return false;
    if (recovery && !ownerRestored) {
      // Query the SDK rather than the app's cached owner: v8 can have changed
      // its durable identity before a replacement-runtime failure is reported.
      let actualOwner = currentAppOwner();
      try { if (evolu.appOwner) actualOwner = await evolu.appOwner || null; } catch { actualOwner = null; }
      if (currentEvolu() !== evolu) return false;
      if (actualOwner && typeof actualOwner.id === 'string' && actualOwner.id && actualOwner.id === previousOwner?.id) {
        if (!recovery.rollback()) {
          _pendingRecoveryRollback = {runtime: evolu, recovery};
          clearRestoreNotice();
          showNotification('Sync recovery progress could not be restored. Your local data is retained. Retry after browser storage is available.', 'error');
          return false;
        }
      } else {
        clearRestoreNotice();
        showNotification('Sync identity startup did not finish. Your local data is retained. Reload to finish recovery.', 'error');
        return false;
      }
    }
    if (options?.seedLocal && ownerRestored) {
      clearRestoreNotice();
      showNotification('Sync identity startup did not finish. Your local data is retained. Reload to finish recovery.', 'error');
      return false;
    }
    if (options?.seedLocal) setSyncPublishingSuspended(false);
    clearRestoreNotice();
    console.error('[sync] Restore failed: invalid or unavailable identity');
    showNotification('Invalid mnemonic', 'error');
    return false;
  }
}
