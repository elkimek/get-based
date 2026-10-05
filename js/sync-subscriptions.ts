import { configureRuntimeDependencies, type RuntimeDependencyUpdates } from './runtime-callbacks.js';
import type { SyncStatus } from './sync-state.js';

interface SubscriptionRow { id?: unknown; profileId?: unknown; syncedAt?: unknown; updatedAt?: unknown; isDeleted?: unknown; }
export interface SyncSubscriptionClient {
  subscribeQuery: (query: unknown) => (callback: () => void) => () => void;
  getQueryRows: (query: unknown) => readonly SubscriptionRow[] | null | undefined;
  subscribeError: (callback: (error: { type?: string } | null | undefined) => void) => () => void;
}
interface SyncSubscriptionDependencies {
  isSyncing: () => unknown;
  isPulling: () => unknown;
  isSyncEnabled: () => unknown;
  isStartupSettling: () => unknown;
  onSyncReceived: () => unknown;
  checkRelayConnection: () => Promise<unknown>;
  updateSyncStatus: (partial: Partial<SyncStatus>) => unknown;
  debug: (...args: unknown[]) => unknown;
}
interface SubscriptionBindings {
  evolu?: SyncSubscriptionClient | null;
  profileQuery?: unknown;
  tombstoneQuery?: unknown;
  itemRowQuery?: unknown;
}

// sync-subscriptions.ts - Evolu subscriptions and poll safety net.

const subscriptionDependencies: SyncSubscriptionDependencies = {
  isSyncing: () => false,
  isPulling: () => false,
  isSyncEnabled: () => true,
  isStartupSettling: () => false,
  onSyncReceived: () => {},
  checkRelayConnection: async () => false,
  updateSyncStatus: () => {},
  debug: () => {},
};

let _pollInterval: ReturnType<typeof setInterval> | null = null;
let _relayProbeInterval: ReturnType<typeof setInterval> | null = null;
let _pendingReceiveTimer: ReturnType<typeof setTimeout> | null = null;
let _lastPollProfileSignature = '';
let _lastPollTombstoneSignature = '';
let _subscriptionFireCount = 0;
let _unsubscribeCallbacks: Array<() => void> = [];
const RECEIVE_RETRY_MS = 500;

export function configureSyncSubscriptions({
  isSyncing,
  isPulling,
  isSyncEnabled,
  isStartupSettling,
  onSyncReceived,
  checkRelayConnection,
  updateSyncStatus,
  debug,
}: RuntimeDependencyUpdates<SyncSubscriptionDependencies> = {}) {
  configureRuntimeDependencies(subscriptionDependencies, {
    isSyncing, isPulling, isSyncEnabled, isStartupSettling, onSyncReceived,
    checkRelayConnection, updateSyncStatus, debug,
  });
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
  // Evolu 8 can publish several partial query snapshots while it replays a
  // compacted owner into an existing local database. initSync performs one
  // controlled pull after that burst becomes quiet; applying an intermediate
  // itemRow snapshot here could otherwise turn a temporary omission into a
  // durable tombstone during startup reconciliation.
  return (0, subscriptionDependencies.isSyncEnabled)() && !(0, subscriptionDependencies.isSyncing)() && !(0, subscriptionDependencies.isPulling)() && !(0, subscriptionDependencies.isStartupSettling)();
}

function requestSyncReceive(reason = 'subscription') {
  if (!(0, subscriptionDependencies.isSyncEnabled)()) {
    (0, subscriptionDependencies.debug)(`${reason}: receive ignored while sync is paused or off`);
    return;
  }
  if (canReceiveSync()) {
    (0, subscriptionDependencies.onSyncReceived)();
    return;
  }
  if (_pendingReceiveTimer) return;
  (0, subscriptionDependencies.debug)(`${reason}: receive deferred, syncing=${(0, subscriptionDependencies.isSyncing)()}, pulling=${(0, subscriptionDependencies.isPulling)()}, startupSettling=${(0, subscriptionDependencies.isStartupSettling)()}`);
  _pendingReceiveTimer = setTimeout(() => {
    _pendingReceiveTimer = null;
    requestSyncReceive('deferred receive');
  }, RECEIVE_RETRY_MS);
}

function rowsSignature(rows: readonly SubscriptionRow[] | null | undefined) {
  return (rows || [])
    .map(row => `${row?.id || ''}:${row?.profileId || ''}:${row?.syncedAt || ''}:${row?.updatedAt || ''}:${row?.isDeleted || 0}`)
    .sort()
    .join('|');
}

function noteQuerySubscriptionActivity(reason: string) {
  _subscriptionFireCount++;
  (0, subscriptionDependencies.debug)(`${reason} fired (#${_subscriptionFireCount}), syncing=${(0, subscriptionDependencies.isSyncing)()}, pulling=${(0, subscriptionDependencies.isPulling)()}`);
}

export function bindSyncSubscriptions({ evolu, profileQuery, tombstoneQuery, itemRowQuery }: SubscriptionBindings = {}) {
  if (!evolu || !profileQuery || !tombstoneQuery || !itemRowQuery) return;

  clearSyncSubscriptionTimers();

  _unsubscribeCallbacks.push(evolu.subscribeQuery(profileQuery)(() => {
    noteQuerySubscriptionActivity('profile subscription');
    requestSyncReceive('profile subscription');
  }));

  // Tombstone rows live outside profileQuery's "isDeleted is not 1"
  // filter. Evolu refreshes subscribed queries after remote mutations,
  // so this subscription is required for device B to see device A's
  // profile-delete tombstone without waiting for a full reload.
  _unsubscribeCallbacks.push(evolu.subscribeQuery(tombstoneQuery)(() => {
    noteQuerySubscriptionActivity('tombstone subscription');
    requestSyncReceive('tombstone subscription');
  }));

  // itemRow rows arriving asynchronously must also retrigger the merge
  // - without this, a per-row push from device A would only land on
  // device B after the next blob-driven pull tick (which v1.6.4's 10s
  // debounce stretches out). Subscribing here gives near-real-time
  // delta propagation, which is half the point of Phase 1.
  _unsubscribeCallbacks.push(evolu.subscribeQuery(itemRowQuery)(() => {
    noteQuerySubscriptionActivity('itemRow subscription');
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
      (0, subscriptionDependencies.debug)(`poll: row signature changed, triggering onSyncReceived`);
      _lastPollProfileSignature = profileSignature;
      _lastPollTombstoneSignature = tombstoneSignature;
      requestSyncReceive('poll');
    }
  }, 30000);

  // Subscribe to Evolu errors - catches relay connection failures.
  _unsubscribeCallbacks.push(evolu.subscribeError((error) => {
    if (!error) return;
    const type = error?.type || 'unknown';
    (0, subscriptionDependencies.debug)('Evolu error:', type);
    if (type.startsWith('WebSocket')) {
      (0, subscriptionDependencies.updateSyncStatus)({ relay: 'unreachable', lastError: { type, message: type, at: Date.now() } });
    }
  }));
}

async function runRelayProbe() {
  const ok = await (0, subscriptionDependencies.checkRelayConnection)();
  (0, subscriptionDependencies.updateSyncStatus)({ relay: ok ? 'connected' : 'unreachable', relayCheckedAt: Date.now() });
}

function onRelayProbeError(error: unknown) {
  const message = (error as { message?: string } | null | undefined)?.message || String(error);
  const at = Date.now();
  (0, subscriptionDependencies.debug)('relay probe error:', error);
  (0, subscriptionDependencies.updateSyncStatus)({
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
