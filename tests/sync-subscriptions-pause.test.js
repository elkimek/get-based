import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bindSyncSubscriptions, clearSyncSubscriptionTimers, configureSyncSubscriptions,
  getSyncSubscriptionFireCount,
} from '../js/sync-subscriptions.js';

afterEach(() => {
  clearSyncSubscriptionTimers();
  vi.useRealTimers();
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

  it('counts every query notification and defers pulls while the startup replica settles', () => {
    vi.useFakeTimers();
    let settling = true;
    const callbacks = [];
    const onSyncReceived = vi.fn();
    const evolu = {
      subscribeQuery: () => callback => {
        callbacks.push(callback);
        return () => {};
      },
      subscribeError: () => () => {},
      getQueryRows: () => [],
    };
    configureSyncSubscriptions({
      isSyncEnabled: () => true,
      isSyncing: () => false,
      isPulling: () => false,
      isStartupSettling: () => settling,
      onSyncReceived,
    });
    bindSyncSubscriptions({
      evolu,
      profileQuery: { name: 'profile' },
      tombstoneQuery: { name: 'tombstone' },
      itemRowQuery: { name: 'item' },
    });

    callbacks.forEach(callback => callback());
    expect(getSyncSubscriptionFireCount()).toBe(3);
    expect(onSyncReceived).not.toHaveBeenCalled();

    settling = false;
    vi.advanceTimersByTime(500);
    expect(onSyncReceived).toHaveBeenCalledOnce();
  });
});
