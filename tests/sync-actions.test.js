import { describe, expect, it, vi } from 'vitest';

import {
  configureSyncActions, prepareRelayCompaction, pushAllProfiles, rebuildOwnerRelayState, syncNow,
} from '../js/sync-actions.js';
import { state } from '../js/state.js';
import {
  clearSyncProfileDirty, getSyncDirtyToken, markSyncProfileDirty,
} from '../js/sync-dirty-state.js';
import { profileStorageKey } from '../js/profile-storage-key.js';

describe('sync action profile dependencies', () => {
  it('uses configured profile metadata and default data when seeding sync', async () => {
    const previousProfile = state.currentProfile;
    const previousImportedData = state.importedData;
    const pushProfile = vi.fn().mockResolvedValue({ ok: true });
    const getProfiles = vi.fn(() => [{ id: 'seed-profile' }]);
    const defaultData = { entries: [], seeded: true };
    const createDefaultProfileData = vi.fn(() => defaultData);
    state.currentProfile = 'seed-profile';
    state.importedData = null;
    configureSyncActions({ pushProfile, getProfiles, createDefaultProfileData });

    try {
      const result = await pushAllProfiles({ force: true });

      expect(getProfiles).toHaveBeenCalledOnce();
      expect(createDefaultProfileData).toHaveBeenCalledOnce();
      expect(pushProfile).toHaveBeenCalledWith('seed-profile', defaultData, { force: true });
      expect(result).toEqual({ total: 1, succeeded: 1, failed: 0, skipped: 0 });
    } finally {
      state.currentProfile = previousProfile;
      state.importedData = previousImportedData;
      configureSyncActions({
        pushProfile: async () => {},
        getProfiles: () => [],
        createDefaultProfileData: () => ({ entries: [] }),
      });
    }
  });

  it('pulls before pushing on manual sync', async () => {
    const order = [];
    configureSyncActions({
      forcePull: async () => { order.push('pull'); },
      pushProfile: async () => { order.push('push'); return { ok: true }; },
    });

    try {
      await syncNow();
      expect(order).toEqual(['pull', 'push']);
    } finally {
      configureSyncActions({ forcePull: async () => {}, pushProfile: async () => {} });
    }
  });

  it('still pushes local state when the manual pull fails', async () => {
    const pushProfile = vi.fn().mockResolvedValue({ ok: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    configureSyncActions({
      forcePull: async () => { throw new Error('pull unavailable'); },
      pushProfile,
    });

    try {
      await expect(syncNow()).resolves.toEqual({ ok: true });
      expect(pushProfile).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Manual pull failed'),
        expect.any(Error),
      );
    } finally {
      configureSyncActions({ forcePull: async () => {}, pushProfile: async () => {} });
    }
  });

  it('flushes dirty local state before pulling, then publishes the merge', async () => {
    const previousProfile = state.currentProfile;
    const profileId = 'dirty-manual-sync';
    const order = [];
    state.currentProfile = profileId;
    markSyncProfileDirty(profileId);
    configureSyncActions({
      forcePull: async () => { order.push('pull'); },
      pushProfile: async () => {
        order.push('push');
        return order.length === 1
          ? { ok: true }
          : { ok: true, skipped: true, reason: 'unchanged' };
      },
      isSyncing: () => false,
    });

    try {
      await expect(syncNow()).resolves.toMatchObject({ ok: true, skipped: true });
      expect(order).toEqual(['push', 'pull', 'push']);
    } finally {
      localStorage.removeItem(`labcharts-${profileId}-sync-dirty`);
      state.currentProfile = previousProfile;
      configureSyncActions({
        forcePull: async () => {},
        pushProfile: async () => {},
        isSyncing: () => false,
      });
    }
  });

  it('does not pull stale remote state when the dirty preflight push fails', async () => {
    const previousProfile = state.currentProfile;
    const profileId = 'dirty-manual-sync-failed';
    const forcePull = vi.fn();
    state.currentProfile = profileId;
    markSyncProfileDirty(profileId);
    configureSyncActions({
      forcePull,
      pushProfile: async () => ({ ok: false, reason: 'timeout' }),
      isSyncing: () => false,
    });

    try {
      await expect(syncNow()).resolves.toEqual({ ok: false, reason: 'timeout' });
      expect(forcePull).not.toHaveBeenCalled();
    } finally {
      localStorage.removeItem(`labcharts-${profileId}-sync-dirty`);
      state.currentProfile = previousProfile;
      configureSyncActions({
        forcePull: async () => {},
        pushProfile: async () => {},
        isSyncing: () => false,
      });
    }
  });

  it('flushes active and inactive dirty profiles before compaction pulls all rows', async () => {
    const previousProfile = state.currentProfile;
    const previousImportedData = state.importedData;
    const activeId = 'compact-dirty-active';
    const inactiveId = 'compact-dirty-inactive';
    const inactiveKey = profileStorageKey(inactiveId, 'imported');
    const order = [];
    state.currentProfile = activeId;
    state.importedData = { entries: [], contextNotes: 'fresh active edit' };
    localStorage.setItem(inactiveKey, JSON.stringify({ entries: [], contextNotes: 'fresh inactive edit' }));
    markSyncProfileDirty(activeId);
    markSyncProfileDirty(inactiveId);
    configureSyncActions({
      forcePull: async () => { order.push('pull'); },
      pushProfile: async (profileId, importedData) => {
        order.push(`push:${profileId}:${importedData.contextNotes}`);
        clearSyncProfileDirty(profileId, getSyncDirtyToken(profileId));
        return { ok: true };
      },
      isSyncEnabled: () => true,
      isEvoluReady: () => true,
      isSyncing: () => false,
      getProfiles: () => [{ id: activeId }, { id: inactiveId }],
    });

    try {
      await expect(prepareRelayCompaction()).resolves.toBeUndefined();
      expect(order).toEqual([
        `push:${activeId}:fresh active edit`,
        `push:${inactiveId}:fresh inactive edit`,
        'pull',
      ]);
    } finally {
      localStorage.removeItem(inactiveKey);
      localStorage.removeItem(`labcharts-${activeId}-sync-dirty`);
      localStorage.removeItem(`labcharts-${inactiveId}-sync-dirty`);
      state.currentProfile = previousProfile;
      state.importedData = previousImportedData;
      configureSyncActions({
        forcePull: async () => {},
        pushProfile: async () => {},
        isSyncEnabled: () => false,
        isEvoluReady: () => false,
        isSyncing: () => false,
        getProfiles: () => [],
      });
    }
  });

  it('fails compaction before pulling when an inactive dirty profile cannot commit', async () => {
    const inactiveId = 'compact-dirty-failed';
    const forcePull = vi.fn();
    markSyncProfileDirty(inactiveId);
    configureSyncActions({
      forcePull,
      pushProfile: async () => ({ ok: false, reason: 'timeout' }),
      isSyncEnabled: () => true,
      isEvoluReady: () => true,
      isSyncing: () => false,
      getProfiles: () => [{ id: inactiveId }],
    });

    try {
      await expect(prepareRelayCompaction()).rejects.toThrow('Could not commit pending changes');
      expect(forcePull).not.toHaveBeenCalled();
    } finally {
      localStorage.removeItem(`labcharts-${inactiveId}-sync-dirty`);
      configureSyncActions({
        forcePull: async () => {},
        pushProfile: async () => {},
        isSyncEnabled: () => false,
        isEvoluReady: () => false,
        isSyncing: () => false,
        getProfiles: () => [],
      });
    }
  });

  it('disables lean cutover, clears snapshots, and force-pushes a complete relay rebuild', async () => {
    const previousProfile = state.currentProfile;
    const previousImportedData = state.importedData;
    const profileId = 'rebuild-profile';
    const pushProfile = vi.fn().mockResolvedValue({ ok: true });
    const resetLocalSyncHistoryForRelayRebuild = vi.fn().mockResolvedValue(true);
    state.currentProfile = profileId;
    state.importedData = { entries: [], notes: [] };
    localStorage.setItem(`labcharts-${profileId}-sync-cutover-v2`, '1');
    localStorage.setItem(`labcharts-${profileId}-delta-entries`, '{"old":"hash"}');
    configureSyncActions({
      pushProfile,
      resetLocalSyncHistoryForRelayRebuild,
      getProfiles: () => [{ id: profileId }],
    });

    try {
      const result = await rebuildOwnerRelayState();
      expect(result).toEqual({ total: 1, succeeded: 1, failed: 0, skipped: 0 });
      expect(localStorage.getItem(`labcharts-${profileId}-sync-cutover-v2`)).toBeNull();
      expect(localStorage.getItem(`labcharts-${profileId}-delta-entries`)).toBeNull();
      expect(pushProfile).toHaveBeenCalledWith(profileId, state.importedData, { force: true });
      expect(resetLocalSyncHistoryForRelayRebuild).toHaveBeenCalledOnce();
      expect(resetLocalSyncHistoryForRelayRebuild.mock.invocationCallOrder[0])
        .toBeLessThan(pushProfile.mock.invocationCallOrder[0]);
    } finally {
      state.currentProfile = previousProfile;
      state.importedData = previousImportedData;
      localStorage.removeItem(`labcharts-${profileId}-sync-cutover-v2`);
      localStorage.removeItem(`labcharts-${profileId}-delta-entries`);
      configureSyncActions({
        pushProfile: async () => {},
        resetLocalSyncHistoryForRelayRebuild: async () => {},
        getProfiles: () => [],
      });
    }
  });
});
