import { expect, it, vi } from 'vitest';
import { configureSyncRecovery, bindSyncRecoveryEvents } from '../js/sync-recovery.js';
import { configureSyncActions, syncNow } from '../js/sync-actions.js';
import { state } from '../js/state.js';
import { discardSyncProfileDirty, markSyncProfileDirty } from '../js/sync-dirty-state.js';

it('reconnect pulls clean state, flushes dirty edits first, and respects pause during the delay', async () => {
  const previousProfile = state.currentProfile;
  state.currentProfile = 'recovery-events';
  const win = new EventTarget();
  let enabled = true;
  const order = [];
  configureSyncActions({
    forcePull: async () => { order.push('pull'); },
    pushProfile: async () => {
      order.push('push');
      discardSyncProfileDirty(state.currentProfile);
      return { ok: true };
    },
    isSyncing: () => false,
  });
  configureSyncRecovery({ isSyncEnabled: () => enabled, isEvoluReady: () => true, syncNow });
  bindSyncRecoveryEvents({ win, doc: null, nav: null });
  vi.useFakeTimers();
  try {
    win.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual(['pull']);

    order.length = 0;
    await vi.advanceTimersByTimeAsync(30_000);
    markSyncProfileDirty(state.currentProfile);
    win.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual(['push', 'pull', 'push']);

    order.length = 0;
    await vi.advanceTimersByTimeAsync(30_000);
    win.dispatchEvent(new Event('online'));
    enabled = false;
    await vi.advanceTimersByTimeAsync(100);
    expect(order).toEqual([]);
  } finally {
    vi.useRealTimers();
    discardSyncProfileDirty(state.currentProfile);
    state.currentProfile = previousProfile;
    configureSyncActions({ forcePull: async () => {}, pushProfile: async () => {} });
    configureSyncRecovery({ isSyncEnabled: () => false, syncNow: async () => {} });
  }
});
