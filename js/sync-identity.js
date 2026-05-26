// sync-identity.js - BIP-39/QR loading and mnemonic restore helpers.

import { loadScriptOnce, showNotification } from './utils.js';
import {
  clearSyncDisableStorage,
} from './sync-disable-cleanup.js';

let _bip39Load = null;
let _qrCodeLoad = null;
let _getAppOwner = () => null;
let _getAppOwnerError = () => null;
let _getEvolu = () => null;
let _seedLocalProfiles = async () => {};

export const RESTORE_JOIN_PENDING_KEY = 'labcharts-sync-restore-join-pending';

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
  if (window.bip39) return window.bip39;
  if (!_bip39Load) {
    _bip39Load = loadScriptOnce('/vendor/bip39-minimal.js').then(() => {
      if (!window.bip39) throw new Error('BIP-39 library did not initialize');
      return window.bip39;
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

export async function restoreFromMnemonic(mnemonic, options = {}) {
  const evolu = currentEvolu();
  if (!evolu) return false;
  try {
    await evolu.restoreAppOwner(mnemonic);
    // After mnemonic restore, the new Evolu owner has zero rows; the old
    // delta snapshot would tell the planner "I already pushed these items",
    // leaving the new owner's relay empty. Drop snapshots so the first push
    // under the new identity re-emits everything as inserts.
    clearSyncDisableStorage();
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
    setTimeout(() => window.location.reload(), 500);
    return true;
  } catch (e) {
    console.error('[sync] Restore failed:', e);
    showNotification('Invalid mnemonic', 'error');
    return false;
  }
}
