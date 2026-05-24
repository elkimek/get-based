// sync-settings-state.js - persisted sync enabled flag.

export const SYNC_STORAGE_KEY = 'labcharts-sync-enabled';

let _syncEnabled = false;
let _syncStatePrimed = false;

export function primeSyncState() {
  if (!_syncStatePrimed) {
    _syncEnabled = localStorage.getItem(SYNC_STORAGE_KEY) === 'true';
    _syncStatePrimed = true;
  }
  return _syncEnabled;
}

export function isSyncEnabled() {
  return _syncStatePrimed ? _syncEnabled : primeSyncState();
}

export function setSyncEnabled(enabled, { persist = true } = {}) {
  if (persist) localStorage.setItem(SYNC_STORAGE_KEY, enabled ? 'true' : 'false');
  _syncEnabled = !!enabled;
  _syncStatePrimed = true;
  return _syncEnabled;
}
