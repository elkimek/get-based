// @ts-check
// sync-settings-state.js - persisted configured / active / paused sync state.

export const SYNC_STORAGE_KEY = 'labcharts-sync-enabled';
export const SYNC_PAUSED_STORAGE_KEY = 'labcharts-sync-paused';

let _syncConfigured = false;
let _syncPaused = false;
let _syncStatePrimed = false;

export function primeSyncState() {
  if (!_syncStatePrimed) {
    _syncConfigured = localStorage.getItem(SYNC_STORAGE_KEY) === 'true';
    _syncPaused = _syncConfigured && localStorage.getItem(SYNC_PAUSED_STORAGE_KEY) === 'true';
    _syncStatePrimed = true;
  }
  return _syncConfigured && !_syncPaused;
}

export function isSyncEnabled() {
  if (!_syncStatePrimed) primeSyncState();
  return _syncConfigured && !_syncPaused;
}

export function isSyncConfigured() {
  if (!_syncStatePrimed) primeSyncState();
  return _syncConfigured;
}

export function isSyncPaused() {
  if (!_syncStatePrimed) primeSyncState();
  return _syncConfigured && _syncPaused;
}

/** @param {{ persist?: boolean }} [options] */
export function setSyncEnabled(enabled, options = {}) {
  const { persist = true } = options;
  if (persist) {
    localStorage.setItem(SYNC_STORAGE_KEY, enabled ? 'true' : 'false');
    localStorage.removeItem(SYNC_PAUSED_STORAGE_KEY);
  }
  _syncConfigured = !!enabled;
  _syncPaused = false;
  _syncStatePrimed = true;
  return _syncConfigured;
}

export function setSyncPaused(paused) {
  if (!_syncStatePrimed) primeSyncState();
  if (!_syncConfigured) return false;
  _syncPaused = !!paused;
  if (_syncPaused) localStorage.setItem(SYNC_PAUSED_STORAGE_KEY, 'true');
  else localStorage.removeItem(SYNC_PAUSED_STORAGE_KEY);
  return _syncPaused;
}
