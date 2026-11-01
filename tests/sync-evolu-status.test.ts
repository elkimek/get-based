import {afterEach, expect, it, vi} from 'vitest';
import {bindSyncSubscriptions, clearSyncSubscriptionTimers, configureSyncSubscriptions, type SyncSubscriptionClient} from '../js/sync-subscriptions.js';
import {getSyncDisplayState, getSyncStatus, getSyncStatusNotice, resetSyncStatus, updateSyncStatus, type OwnerReplicationStatus, type DevicePersistenceStatus} from '../js/sync-state.js';

afterEach(() => {clearSyncSubscriptionTimers(); resetSyncStatus();});

it('keeps replication, database persistence and owner-storage push confirmation independent', () => {
  let ownerStatus!: (status: OwnerReplicationStatus) => void;
  let persistence!: (status: DevicePersistenceStatus) => void;
  let error!: Parameters<SyncSubscriptionClient['subscribeError']>[0];
  const unsubscribers = Array.from({length: 3}, () => vi.fn());
  const client: SyncSubscriptionClient = {
    subscribeQuery: () => () => () => {}, getQueryRows: () => [],
    subscribeError: callback => {error = callback; return unsubscribers[0]!;},
    subscribeOwnerSyncStatus: callback => {ownerStatus = callback; return unsubscribers[1]!;},
    subscribeDevicePersistence: callback => {persistence = callback; return unsubscribers[2]!;},
  };
  configureSyncSubscriptions({updateSyncStatus, isSyncEnabled: () => true});
  bindSyncSubscriptions({evolu: client, profileQuery: {}, tombstoneQuery: {}, itemRowQuery: {}});
  updateSyncStatus({relay: 'connected', push: 'pending', pushStartedAt: Date.now()});
  ownerStatus({type: 'Synced'});
  expect(getSyncStatus().push).toBe('pending'); expect(getSyncDisplayState(true)).toBe('syncing');
  expect(getSyncStatus().pushConfirmedAt).toBeNull();
  persistence('Unknown'); expect(getSyncStatusNotice(getSyncStatus())).toContain('may clear');
  persistence('NotPersisted'); expect(getSyncStatusNotice(getSyncStatus())).toContain('temporary');
  persistence('Persisted'); expect(getSyncStatusNotice(getSyncStatus())).toBeNull();
  ownerStatus({type: 'Offline'}); expect(getSyncDisplayState(true)).toBe('offline');
  ownerStatus({type: 'Error', error: {type: 'ProtocolQuotaError', at: 100}});
  expect(getSyncDisplayState(true)).toBe('error'); expect(getSyncStatusNotice(getSyncStatus())).toContain('Relay storage is full');
  persistence('NotPersisted'); expect(getSyncStatusNotice(getSyncStatus())).toContain('temporary');
  expect(getSyncStatusNotice(getSyncStatus())).toContain('Relay storage is full');
  persistence('Persisted');
  ownerStatus({type: 'Synced'}); expect(getSyncStatus().push).toBe('pending');
  error({type: 'DatabaseHeldError'}); expect(getSyncDisplayState(true)).toBe('error');
  expect(getSyncStatusNotice(getSyncStatus())).toContain('restart the browser');
  error(null); expect(getSyncDisplayState(true)).toBe('syncing');
  clearSyncSubscriptionTimers(); expect(unsubscribers.every(callback => callback.mock.calls.length === 1)).toBe(true);
});

it.each([
  ['OtherBuildRunningError', 'Another app version'],
  ['UnsupportedDbVersionError', 'newer app version'],
  ['UnknownError', 'Keep your recovery phrase'],
  ['ReloadRequired', 'Finish your edits'],
] as const)('shows actionable guidance for %s without resetting the database', (databaseError, text) => {
  updateSyncStatus({databaseError, relay: 'connected'});
  expect(getSyncDisplayState(true)).toBe('error');
  expect(getSyncStatusNotice(getSyncStatus())).toContain(text);
  expect(getSyncDisplayState(false)).toBe('disabled');
});
