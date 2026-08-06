// @ts-check
// sync-state.js - in-memory sync status, activity log, and rebroadcast guard

// Ring buffer of recent sync events - surfaced in the sync popover so phone
// users can see push/pull payload counts without USB-debugging the console.
// Each entry: { at: ms, kind: 'push'|'pull'|'skip'|'rebroadcast', text }.
/** @type {{ at: number, kind: string, text: string }[]} */
const _syncEvents = [];
const _SYNC_EVENT_CAP = 12;

// Per-profile rebroadcast counters with a 5-minute reset interval.
// Caps runaway rebroadcast loops if two devices' clocks skew enough
// that same-id timestamp comparisons keep flipping which side "won".
/** @type {Map<string, { count: number, since: number }>} */
const _rebroadcastCounts = new Map(); // profileId -> { count, since: ms }
const _REBROADCAST_CAP = 3;
const _REBROADCAST_WINDOW_MS = 5 * 60 * 1000;

/**
 * @typedef {'unknown' | 'connected' | 'unreachable'} SyncRelayState
 * @typedef {'idle' | 'pending' | 'confirmed' | 'error'} SyncPushState
 * @typedef {'idle' | 'pulling' | 'received'} SyncPullState
 * @typedef {{ type: string, message?: string, at: number } | null} SyncLastError
 * @typedef {{
 *   relay: SyncRelayState,
 *   relayCheckedAt: number | null,
 *   push: SyncPushState,
 *   pushStartedAt: number | null,
 *   pushConfirmedAt: number | null,
 *   pull: SyncPullState,
 *   pullReceivedAt: number | null,
 *   lastError: SyncLastError,
 * }} SyncStatus
 */

const DEFAULT_SYNC_STATUS = Object.freeze(/** @type {SyncStatus} */ ({
  relay: 'unknown',        // 'unknown' | 'connected' | 'unreachable'
  relayCheckedAt: null,
  push: 'idle',            // 'idle' | 'pending' | 'confirmed' | 'error'
  pushStartedAt: null,
  pushConfirmedAt: null,
  pull: 'idle',            // 'idle' | 'pulling' | 'received'
  pullReceivedAt: null,
  lastError: null,
}));

/** @type {SyncStatus} */
const _syncStatus = { ...DEFAULT_SYNC_STATUS };
/** @type {Set<(status: SyncStatus) => void>} */
const _syncStatusListeners = new Set();

function _emitSyncStatus() {
  for (const fn of _syncStatusListeners) fn(_syncStatus);
}

/** @param {string} profileId */
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

/** @param {string} kind
 * @param {string} text
 */
export function logSyncEvent(kind, text) {
  _syncEvents.push({ at: Date.now(), kind, text });
  if (_syncEvents.length > _SYNC_EVENT_CAP) _syncEvents.shift();
}

export function getRecentSyncEvents() {
  return _syncEvents.slice();
}

/** @returns {SyncStatus} */
export function getSyncStatus() {
  return { ..._syncStatus };
}

/** @param {Partial<SyncStatus>} partial */
export function updateSyncStatus(partial) {
  Object.assign(_syncStatus, partial);
  _emitSyncStatus();
}

export function resetSyncStatus() {
  for (const key of Object.keys(_syncStatus)) delete /** @type {Record<string, any>} */ (_syncStatus)[key];
  Object.assign(_syncStatus, DEFAULT_SYNC_STATUS);
  _emitSyncStatus();
}

/** @param {(status: SyncStatus) => void} fn */
export function subscribeSyncStatus(fn) {
  _syncStatusListeners.add(fn);
  return () => _syncStatusListeners.delete(fn);
}

/** @param {boolean} syncEnabled */
export function getSyncDisplayState(syncEnabled) {
  if (!syncEnabled) return 'disabled';
  if (_syncStatus.lastError && _syncStatus.push === 'error') return 'error';
  if (_syncStatus.push === 'pending' && _syncStatus.pushStartedAt && Date.now() - _syncStatus.pushStartedAt > 8000) return 'error';
  if (_syncStatus.relay === 'unreachable') return 'offline';
  if (_syncStatus.relay === 'unknown') return 'syncing';
  if (_syncStatus.push === 'pending' || _syncStatus.pull === 'pulling') return 'syncing';
  return 'synced';
}
