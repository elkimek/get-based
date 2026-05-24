// sync-state.js - in-memory sync status, activity log, and rebroadcast guard

// Ring buffer of recent sync events - surfaced in the sync popover so phone
// users can see push/pull payload counts without USB-debugging the console.
// Each entry: { at: ms, kind: 'push'|'pull'|'skip'|'rebroadcast', text }.
const _syncEvents = [];
const _SYNC_EVENT_CAP = 12;

// Per-profile rebroadcast counters with a 5-minute reset window.
// Caps runaway rebroadcast loops if two devices' clocks skew enough
// that same-id timestamp comparisons keep flipping which side "won".
const _rebroadcastCounts = new Map(); // profileId -> { count, since: ms }
const _REBROADCAST_CAP = 3;
const _REBROADCAST_WINDOW_MS = 5 * 60 * 1000;

const DEFAULT_SYNC_STATUS = Object.freeze({
  relay: 'unknown',        // 'unknown' | 'connected' | 'unreachable'
  relayCheckedAt: null,
  push: 'idle',            // 'idle' | 'pending' | 'confirmed' | 'error'
  pushStartedAt: null,
  pushConfirmedAt: null,
  pull: 'idle',            // 'idle' | 'pulling' | 'received'
  pullReceivedAt: null,
  lastError: null,
});

const _syncStatus = { ...DEFAULT_SYNC_STATUS };
const _syncStatusListeners = new Set();

function _emitSyncStatus() {
  for (const fn of _syncStatusListeners) fn(_syncStatus);
}

export function consumeRebroadcastBudget(profileId) {
  const now = Date.now();
  let entry = _rebroadcastCounts.get(profileId);
  if (!entry || (now - entry.since) > _REBROADCAST_WINDOW_MS) {
    entry = { count: 0, since: now };
    _rebroadcastCounts.set(profileId, entry);
  }
  if (entry.count >= _REBROADCAST_CAP) return false;
  entry.count++;
  return true;
}

export function logSyncEvent(kind, text) {
  _syncEvents.push({ at: Date.now(), kind, text });
  if (_syncEvents.length > _SYNC_EVENT_CAP) _syncEvents.shift();
}

export function getRecentSyncEvents() {
  return _syncEvents.slice();
}

export function getSyncStatus() {
  return { ..._syncStatus };
}

export function updateSyncStatus(partial) {
  Object.assign(_syncStatus, partial);
  _emitSyncStatus();
}

export function resetSyncStatus() {
  for (const key of Object.keys(_syncStatus)) delete _syncStatus[key];
  Object.assign(_syncStatus, DEFAULT_SYNC_STATUS);
  _emitSyncStatus();
}

export function subscribeSyncStatus(fn) {
  _syncStatusListeners.add(fn);
  return () => _syncStatusListeners.delete(fn);
}

export function getSyncDisplayState(syncEnabled) {
  if (!syncEnabled) return 'disabled';
  if (_syncStatus.lastError && _syncStatus.push === 'error') return 'error';
  if (_syncStatus.push === 'pending' && _syncStatus.pushStartedAt && Date.now() - _syncStatus.pushStartedAt > 8000) return 'error';
  if (_syncStatus.relay === 'unreachable') return 'offline';
  if (_syncStatus.push === 'pending' || _syncStatus.pull === 'pulling') return 'syncing';
  return 'synced';
}
