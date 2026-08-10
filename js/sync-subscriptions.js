// @ts-check
// sync-subscriptions.js - Evolu subscriptions and poll safety net.

/** @typedef {{ subscribeQuery: (query: any) => (callback: () => void) => any, getQueryRows: (query: any) => any[], subscribeError: (callback: (error: any) => void) => any }} SyncEvoluLike */

/** @type {() => boolean} */
let _isSyncing = () => false;
/** @type {() => boolean} */
let _isPulling = () => false;
let _isSyncEnabled = () => true;
/** @type {() => any} */
let _onSyncReceived = () => {};
/** @type {() => Promise<boolean>} */
let _checkRelayConnection = async () => false;
/** @type {(partial: any) => void} */
let _updateSyncStatus = () => {};
/** @type {(...args: any[]) => void} */
let _debug = () => {};

/** @type {number | null} */
let _pollInterval = null;
/** @type {number | null} */
let _relayProbeInterval = null;
/** @type {number | null} */
let _pendingReceiveTimer = null;
let _lastPollProfileSignature = '';
let _lastPollTombstoneSignature = '';
let _subscriptionFireCount = 0;
/** @type {Array<() => void>} */
let _unsubscribeCallbacks = [];
const RECEIVE_RETRY_MS = 500;

/** @param {{
 *   isSyncing?: () => boolean,
 *   isPulling?: () => boolean,
 *   isSyncEnabled?: () => boolean,
 *   onSyncReceived?: () => any,
 *   checkRelayConnection?: () => Promise<boolean>,
 *   updateSyncStatus?: (partial: any) => void,
 *   debug?: (...args: any[]) => void,
 * }} [deps]
 */
export function configureSyncSubscriptions({
  isSyncing,
  isPulling,
  isSyncEnabled,
  onSyncReceived,
  checkRelayConnection,
  updateSyncStatus,
  debug,
} = {}) {
  if (typeof isSyncing === 'function') _isSyncing = isSyncing;
  if (typeof isPulling === 'function') _isPulling = isPulling;
  if (typeof isSyncEnabled === 'function') _isSyncEnabled = isSyncEnabled;
  if (typeof onSyncReceived === 'function') _onSyncReceived = onSyncReceived;
  if (typeof checkRelayConnection === 'function') _checkRelayConnection = checkRelayConnection;
  if (typeof updateSyncStatus === 'function') _updateSyncStatus = updateSyncStatus;
  if (typeof debug === 'function') _debug = debug;
}

export function getSyncSubscriptionFireCount() {
  return _subscriptionFireCount;
}

export function clearSyncSubscriptionTimers() {
  for (const unsubscribe of _unsubscribeCallbacks) {
    try { unsubscribe(); } catch {}
  }
  _unsubscribeCallbacks = [];
  if (_pollInterval) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
  if (_relayProbeInterval) {
    clearInterval(_relayProbeInterval);
    _relayProbeInterval = null;
  }
  if (_pendingReceiveTimer) {
    clearTimeout(_pendingReceiveTimer);
    _pendingReceiveTimer = null;
  }
  _lastPollProfileSignature = '';
  _lastPollTombstoneSignature = '';
  _subscriptionFireCount = 0;
}

function canReceiveSync() {
  return _isSyncEnabled() && !_isSyncing() && !_isPulling();
}

/** @param {string} [reason] */
function requestSyncReceive(reason = 'subscription') {
  if (!_isSyncEnabled()) {
    _debug(`${reason}: receive ignored while sync is paused or off`);
    return;
  }
  if (canReceiveSync()) {
    _onSyncReceived();
    return;
  }
  if (_pendingReceiveTimer) return;
  _debug(`${reason}: receive deferred, syncing=${_isSyncing()}, pulling=${_isPulling()}`);
  _pendingReceiveTimer = setTimeout(() => {
    _pendingReceiveTimer = null;
    requestSyncReceive('deferred receive');
  }, RECEIVE_RETRY_MS);
}

/** @param {any[] | null | undefined} rows */
function rowsSignature(rows) {
  return (rows || [])
    .map(row => `${row?.id || ''}:${row?.profileId || ''}:${row?.syncedAt || ''}:${row?.updatedAt || ''}:${row?.isDeleted || 0}`)
    .sort()
    .join('|');
}

/** @param {{ evolu?: SyncEvoluLike | null, profileQuery?: any, tombstoneQuery?: any, itemRowQuery?: any }} [deps] */
export function bindSyncSubscriptions({ evolu, profileQuery, tombstoneQuery, itemRowQuery } = {}) {
  if (!evolu || !profileQuery || !tombstoneQuery || !itemRowQuery) return;

  clearSyncSubscriptionTimers();

  _unsubscribeCallbacks.push(evolu.subscribeQuery(profileQuery)(() => {
    _subscriptionFireCount++;
    const syncing = _isSyncing();
    const pulling = _isPulling();
    _debug(`subscription fired (#${_subscriptionFireCount}), syncing: ${syncing}, pulling: ${pulling}`);
    requestSyncReceive('profile subscription');
  }));

  // Tombstone rows live outside profileQuery's "isDeleted is not 1"
  // filter. Evolu refreshes subscribed queries after remote mutations,
  // so this subscription is required for device B to see device A's
  // profile-delete tombstone without waiting for a full reload.
  _unsubscribeCallbacks.push(evolu.subscribeQuery(tombstoneQuery)(() => {
    requestSyncReceive('tombstone subscription');
  }));

  // itemRow rows arriving asynchronously must also retrigger the merge
  // - without this, a per-row push from device A would only land on
  // device B after the next blob-driven pull tick (which v1.6.4's 10s
  // debounce stretches out). Subscribing here gives near-real-time
  // delta propagation, which is half the point of Phase 1.
  _unsubscribeCallbacks.push(evolu.subscribeQuery(itemRowQuery)(() => {
    requestSyncReceive('itemRow subscription');
  }));

  // Poll every 30s as safety net - subscribeQuery may miss remote changes.
  // Compare a row signature, not just counts: chat/profile pushes update the
  // same profileData row, so row-count-only polling misses exactly the update
  // shape that users expect to sync in place.
  _pollInterval = setInterval(() => {
    if (!evolu || !profileQuery || !tombstoneQuery) return;
    const rows = evolu.getQueryRows(profileQuery);
    const tombstones = evolu.getQueryRows(tombstoneQuery);
    const profileSignature = rowsSignature(rows);
    const tombstoneSignature = rowsSignature(tombstones);
    if (profileSignature !== _lastPollProfileSignature || tombstoneSignature !== _lastPollTombstoneSignature) {
      _debug(`poll: row signature changed, triggering onSyncReceived`);
      _lastPollProfileSignature = profileSignature;
      _lastPollTombstoneSignature = tombstoneSignature;
      requestSyncReceive('poll');
    }
  }, 30000);

  // Subscribe to Evolu errors - catches relay connection failures.
  _unsubscribeCallbacks.push(evolu.subscribeError((error) => {
    if (!error) return;
    const type = error?.type || 'unknown';
    _debug('Evolu error:', type);
    if (type.startsWith('WebSocket')) {
      _updateSyncStatus({ relay: 'unreachable', lastError: { type, message: type, at: Date.now() } });
    }
  }));
}

async function runRelayProbe() {
  const ok = await _checkRelayConnection();
  _updateSyncStatus({ relay: ok ? 'connected' : 'unreachable', relayCheckedAt: Date.now() });
}

/** @param {any} error */
function onRelayProbeError(error) {
  const message = error?.message || String(error);
  const at = Date.now();
  _debug('relay probe error:', error);
  _updateSyncStatus({
    relay: 'unreachable',
    relayCheckedAt: at,
    lastError: { type: 'RelayProbeError', message, at },
  });
}

export function startRelayProbe() {
  runRelayProbe().catch(onRelayProbeError);
  if (_relayProbeInterval) clearInterval(_relayProbeInterval);
  _relayProbeInterval = setInterval(() => {
    runRelayProbe().catch(onRelayProbeError);
  }, 60000);
}
