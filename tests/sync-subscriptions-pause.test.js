import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bindSyncSubscriptions, clearSyncSubscriptionTimers, configureSyncSubscriptions,
} from '../js/sync-subscriptions.js';

afterEach(() => {
  clearSyncSubscriptionTimers();
  vi.restoreAllMocks();
});

describe('paused sync subscriptions', () => {
  it('ignores inbound query notifications while paused and unsubscribes cleanly', () => {
    let enabled = false;
    const callbacks = [];
    const unsubscriptions = [];
    const onSyncReceived = vi.fn();
    const subscribe = callback => {
      callbacks.push(callback);
      const unsubscribe = vi.fn();
      unsubscriptions.push(unsubscribe);
      return unsubscribe;
    };
    const evolu = {
      subscribeQuery: () => subscribe,
      subscribeError: subscribe,
      getQueryRows: () => [],
    };
    configureSyncSubscriptions({
      isSyncEnabled: () => enabled,
      isSyncing: () => false,
      isPulling: () => false,
      onSyncReceived,
      checkRelayConnection: async () => true,
      updateSyncStatus: vi.fn(),
      debug: vi.fn(),
    });
    bindSyncSubscriptions({
      evolu,
      profileQuery: { name: 'profile' },
      tombstoneQuery: { name: 'tombstone' },
      itemRowQuery: { name: 'item' },
    });

    callbacks[0]();
    callbacks[1]();
    callbacks[2]();
    expect(onSyncReceived).not.toHaveBeenCalled();

    enabled = true;
    callbacks[0]();
    expect(onSyncReceived).toHaveBeenCalledOnce();

    clearSyncSubscriptionTimers();
    expect(unsubscriptions).toHaveLength(4);
    expect(unsubscriptions.every(unsubscribe => unsubscribe.mock.calls.length === 1)).toBe(true);
  });
});
