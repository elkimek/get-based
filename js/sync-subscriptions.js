// sync-subscriptions.js - Evolu subscriptions and poll safety net.

let _isSyncing = () => false;
let _isPulling = () => false;
let _onSyncReceived = () => {};
let _checkRelayConnection = async () => false;
let _updateSyncStatus = () => {};
let _debug = () => {};

let _pollInterval = null;
let _relayProbeInterval = null;
let _pendingReceiveTimer = null;
let _lastPollProfileSignature = '';
let _lastPollTombstoneSignature = '';
let _subscriptionFireCount = 0;
const RECEIVE_RETRY_MS = 500;

export function configureSyncSubscriptions({
  isSyncing,
  isPulling,
  onSyncReceived,
  checkRelayConnection,
  updateSyncStatus,
  debug,
} = {}) {
  if (typeof isSyncing === 'function') _isSyncing = isSyncing;
  if (typeof isPulling === 'function') _isPulling = isPulling;
  if (typeof onSyncReceived === 'function') _onSyncReceived = onSyncReceived;
  if (typeof checkRelayConnection === 'function') _checkRelayConnection = checkRelayConnection;
  if (typeof updateSyncStatus === 'function') _updateSyncStatus = updateSyncStatus;
  if (typeof debug === 'function') _debug = debug;
}

export function getSyncSubscriptionFireCount() {
  return _subscriptionFireCount;
}

export function clearSyncSubscriptionTimers() {
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
  return !_isSyncing() && !_isPulling();
}

function requestSyncReceive(reason = 'subscription') {
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

function rowsSignature(rows) {
  return (rows || [])
    .map(row => `${row?.id || ''}:${row?.profileId || ''}:${row?.syncedAt || ''}:${row?.updatedAt || ''}:${row?.isDeleted || 0}`)
    .sort()
    .join('|');
}

export function bindSyncSubscriptions({ evolu, profileQuery, tombstoneQuery, itemRowQuery } = {}) {
  if (!evolu || !profileQuery || !tombstoneQuery || !itemRowQuery) return;

  clearSyncSubscriptionTimers();

  evolu.subscribeQuery(profileQuery)(() => {
    _subscriptionFireCount++;
    const syncing = _isSyncing();
    const pulling = _isPulling();
    _debug(`subscription fired (#${_subscriptionFireCount}), syncing: ${syncing}, pulling: ${pulling}`);
    requestSyncReceive('profile subscription');
  });

  // Tombstone rows live outside profileQuery's "isDeleted is not 1"
  // filter. Evolu refreshes subscribed queries after remote mutations,
  // so this subscription is required for device B to see device A's
  // profile-delete tombstone without waiting for a full reload.
  evolu.subscribeQuery(tombstoneQuery)(() => {
    requestSyncReceive('tombstone subscription');
  });

  // itemRow rows arriving asynchronously must also retrigger the merge
  // - without this, a per-row push from device A would only land on
  // device B after the next blob-driven pull tick (which v1.6.4's 10s
  // debounce stretches out). Subscribing here gives near-real-time
  // delta propagation, which is half the point of Phase 1.
  evolu.subscribeQuery(itemRowQuery)(() => {
    requestSyncReceive('itemRow subscription');
  });

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
  evolu.subscribeError((error) => {
    if (!error) return;
    const type = error?.type || 'unknown';
    _debug('Evolu error:', type);
    if (type.startsWith('WebSocket')) {
      _updateSyncStatus({ relay: 'unreachable', lastError: { type, message: type, at: Date.now() } });
    }
  });
}

async function runRelayProbe() {
  const ok = await _checkRelayConnection();
  _updateSyncStatus({ relay: ok ? 'connected' : 'unreachable', relayCheckedAt: Date.now() });
}

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
