// sync-identity.js - BIP-39/QR loading and mnemonic restore helpers.

import { loadScriptOnce, showNotification } from './utils.js';

let _bip39Load = null;
let _qrCodeLoad = null;
let _getAppOwner = () => null;
let _getAppOwnerError = () => null;
let _getEvolu = () => null;

export function configureSyncIdentity({ getAppOwner, getAppOwnerError, getEvolu } = {}) {
  if (typeof getAppOwner === 'function') _getAppOwner = getAppOwner;
  if (typeof getAppOwnerError === 'function') _getAppOwnerError = getAppOwnerError;
  if (typeof getEvolu === 'function') _getEvolu = getEvolu;
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

export async function restoreFromMnemonic(mnemonic) {
  const evolu = currentEvolu();
  if (!evolu) return false;
  try {
    await evolu.restoreAppOwner(mnemonic);
    // Clear sync timestamps + per-array delta snapshots + cutover flag.
    // After mnemonic restore, the new Evolu owner has zero rows; the old
    // delta snapshot would tell the planner "I already pushed these items",
    // leaving the new owner's relay empty. Drop snapshots so the first push
    // under the new identity re-emits everything as inserts.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.endsWith('-sync-ts') || key.includes('-delta-') || key.includes('-sync-cutover-v2') || key.includes('-relay-bytes-') || key === 'labcharts-relay-quota-warned') {
        localStorage.removeItem(key);
      }
    }
    showNotification('Restored from mnemonic — reloading…', 'success');
    // Reload so the app re-initializes from the restored CRDT identity.
    setTimeout(() => window.location.reload(), 500);
    return true;
  } catch (e) {
    console.error('[sync] Restore failed:', e);
    showNotification('Invalid mnemonic', 'error');
    return false;
  }
}
