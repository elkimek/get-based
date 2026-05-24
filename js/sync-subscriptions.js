// sync-subscriptions.js - Evolu subscriptions and poll safety net.

let _isSyncing = () => false;
let _isPulling = () => false;
let _onSyncReceived = () => {};
let _checkRelayConnection = async () => false;
let _updateSyncStatus = () => {};
let _debug = () => {};

let _pollInterval = null;
let _relayProbeInterval = null;
let _lastPollRowCount = -1;
let _lastPollTombstoneCount = -1;
let _subscriptionFireCount = 0;

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
  _lastPollRowCount = -1;
  _lastPollTombstoneCount = -1;
  _subscriptionFireCount = 0;
}

function canReceiveSync() {
  return !_isSyncing() && !_isPulling();
}

export function bindSyncSubscriptions({ evolu, profileQuery, tombstoneQuery, itemRowQuery } = {}) {
  if (!evolu || !profileQuery || !tombstoneQuery || !itemRowQuery) return;

  clearSyncSubscriptionTimers();

  evolu.subscribeQuery(profileQuery)(() => {
    _subscriptionFireCount++;
    const syncing = _isSyncing();
    const pulling = _isPulling();
    _debug(`subscription fired (#${_subscriptionFireCount}), syncing: ${syncing}, pulling: ${pulling}`);
    if (!syncing && !pulling) _onSyncReceived();
  });

  // Tombstone rows live outside profileQuery's "isDeleted is not 1"
  // filter. Evolu refreshes subscribed queries after remote mutations,
  // so this subscription is required for device B to see device A's
  // profile-delete tombstone without waiting for a full reload.
  evolu.subscribeQuery(tombstoneQuery)(() => {
    if (canReceiveSync()) _onSyncReceived();
  });

  // itemRow rows arriving asynchronously must also retrigger the merge
  // - without this, a per-row push from device A would only land on
  // device B after the next blob-driven pull tick (which v1.6.4's 10s
  // debounce stretches out). Subscribing here gives near-real-time
  // delta propagation, which is half the point of Phase 1.
  evolu.subscribeQuery(itemRowQuery)(() => {
    if (canReceiveSync()) _onSyncReceived();
  });

  // Poll every 30s as safety net - subscribeQuery may miss remote changes.
  _pollInterval = setInterval(() => {
    if (!evolu || !profileQuery || !tombstoneQuery || !canReceiveSync()) return;
    const rows = evolu.getQueryRows(profileQuery);
    const tombstones = evolu.getQueryRows(tombstoneQuery);
    const count = rows?.length ?? 0;
    const tombstoneCount = tombstones?.length ?? 0;
    if (count !== _lastPollRowCount || tombstoneCount !== _lastPollTombstoneCount) {
      _debug(`poll: row/tombstone count changed ${_lastPollRowCount}/${_lastPollTombstoneCount} -> ${count}/${tombstoneCount}, triggering onSyncReceived`);
      _lastPollRowCount = count;
      _lastPollTombstoneCount = tombstoneCount;
      _onSyncReceived();
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
