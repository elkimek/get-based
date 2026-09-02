import { describe, expect, it, vi } from 'vitest';

import {
  configureSyncActions, prepareRelayCompaction, pushAllProfiles, pushDirtyProfiles,
  pushProfilesById, rebuildOwnerRelayState, syncNow, onDataSaved,
} from '../js/sync-actions.js';
import { encryptedRemoveItem, encryptedSetItem } from '../js/crypto.js';
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

  it('skips an inactive profile whose persisted data is unavailable', async () => {
    const previousProfile = state.currentProfile;
    const profileId = 'unavailable-seed-profile';
    const storageKey = profileStorageKey(profileId, 'imported');
    const pushProfile = vi.fn().mockResolvedValue({ ok: true });
    await encryptedRemoveItem(storageKey);
    state.currentProfile = 'different-active-profile';
    configureSyncActions({
      pushProfile,
      getProfiles: () => [{ id: profileId }],
      createDefaultProfileData: () => ({ entries: [] }),
    });

    try {
      await expect(pushAllProfiles()).resolves.toEqual({
        total: 1,
        succeeded: 0,
        failed: 0,
        skipped: 1,
      });
      expect(pushProfile).not.toHaveBeenCalled();
    } finally {
      state.currentProfile = previousProfile;
      await encryptedRemoveItem(storageKey);
      configureSyncActions({
        pushProfile: async () => {},
        getProfiles: () => [],
        createDefaultProfileData: () => ({ entries: [] }),
      });
    }
  });

  it('never seeds tagged demo profiles into cross-device sync', async () => {
    const previousProfile = state.currentProfile;
    const previousImportedData = state.importedData;
    const pushProfile = vi.fn().mockResolvedValue({ ok: true });
    state.currentProfile = 'normal-profile';
    state.importedData = { entries: [], contextNotes: 'sync me' };
    configureSyncActions({
      pushProfile,
      getProfiles: () => [
        { id: 'normal-profile', tags: [] },
        { id: 'demo-profile', tags: ['demo'] },
      ],
    });
    markSyncProfileDirty('demo-profile');

    try {
      await expect(pushAllProfiles()).resolves.toEqual({
        total: 2, succeeded: 1, failed: 0, skipped: 1,
      });
      expect(pushProfile).toHaveBeenCalledOnce();
      expect(pushProfile).toHaveBeenCalledWith('normal-profile', state.importedData, {});
      await expect(pushDirtyProfiles()).resolves.toEqual({
        total: 0, succeeded: 0, failed: 0, skipped: 0,
      });
      expect(getSyncDirtyToken('demo-profile')).toBeNull();
    } finally {
      localStorage.removeItem('labcharts-demo-profile-sync-dirty');
      state.currentProfile = previousProfile;
      state.importedData = previousImportedData;
      configureSyncActions({ pushProfile: async () => {}, getProfiles: () => [] });
    }
  });

  it('never queues later saves from an already-created demo profile', () => {
    const previousProfile = state.currentProfile;
    const previousImportedData = state.importedData;
    const profileId = 'saved-demo-profile';
    const pushProfile = vi.fn().mockResolvedValue({ ok: true });
    state.currentProfile = profileId;
    state.importedData = { entries: [], contextNotes: 'local demo data' };
    localStorage.removeItem(`labcharts-${profileId}-sync-dirty`);
    configureSyncActions({
      pushProfile,
      isSyncEnabled: () => true,
      isEvoluReady: () => true,
      isSyncing: () => false,
      getProfiles: () => [{ id: profileId, tags: ['Demo'] }],
    });

    try {
      onDataSaved({ immediate: true });
      expect(getSyncDirtyToken(profileId)).toBeNull();
      expect(pushProfile).not.toHaveBeenCalled();
    } finally {
      state.currentProfile = previousProfile;
      state.importedData = previousImportedData;
      localStorage.removeItem(`labcharts-${profileId}-sync-dirty`);
      configureSyncActions({
        pushProfile: async () => {},
        isSyncEnabled: () => false,
        isEvoluReady: () => false,
        isSyncing: () => false,
        getProfiles: () => [],
      });
    }
  });

  it('retains a dirty generation while a remote delete awaits confirmation', async () => {
    const profileId = 'pending-delete-profile';
    const pushProfile = vi.fn().mockResolvedValue({ ok: true });
    configureSyncActions({
      pushProfile,
      getProfiles: () => [{ id: profileId, tags: [] }],
    });
    markSyncProfileDirty(profileId);
    localStorage.setItem(`labcharts-tombstone-pending-${profileId}`, JSON.stringify({ source: 'remote' }));

    try {
      await expect(pushDirtyProfiles({ force: true })).resolves.toEqual({
        total: 0, succeeded: 0, failed: 0, skipped: 0,
      });
      expect(pushProfile).not.toHaveBeenCalled();
      expect(getSyncDirtyToken(profileId)).not.toBeNull();
    } finally {
      localStorage.removeItem(`labcharts-${profileId}-sync-dirty`);
      localStorage.removeItem(`labcharts-tombstone-pending-${profileId}`);
      configureSyncActions({ pushProfile: async () => {}, getProfiles: () => [] });
    }
  });

  it('publishes requested restore profiles and every dirty profile selectively', async () => {
    const previousProfile = state.currentProfile;
    const previousImportedData = state.importedData;
    const restoredId = 'requested-restored-profile';
    const cleanId = 'clean-profile';
    const pushProfile = vi.fn(async profileId => {
      clearSyncProfileDirty(profileId, getSyncDirtyToken(profileId));
      return { ok: true };
    });
    state.currentProfile = restoredId;
    state.importedData = { entries: [], supplements: [{ id: 'restored-supplement' }] };
    markSyncProfileDirty(restoredId);
    configureSyncActions({
      pushProfile,
      getProfiles: () => [{ id: restoredId }, { id: cleanId }],
    });

    try {
      await expect(pushProfilesById([restoredId], { force: true })).resolves.toEqual({
        total: 1, succeeded: 1, failed: 0, skipped: 0,
      });
      expect(pushProfile).toHaveBeenCalledWith(restoredId, state.importedData, { force: true });

      markSyncProfileDirty(restoredId);
      pushProfile.mockClear();
      await expect(pushDirtyProfiles({ force: true })).resolves.toEqual({
        total: 1, succeeded: 1, failed: 0, skipped: 0,
      });
      expect(pushProfile).toHaveBeenCalledOnce();
      expect(pushProfile).toHaveBeenCalledWith(restoredId, state.importedData, { force: true });
    } finally {
      localStorage.removeItem(`labcharts-${restoredId}-sync-dirty`);
      state.currentProfile = previousProfile;
      state.importedData = previousImportedData;
      configureSyncActions({ pushProfile: async () => {}, getProfiles: () => [] });
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

  it('waits and retries when a pull-side rebroadcast wins the manual-push race', async () => {
    const pushProfile = vi.fn()
      .mockResolvedValueOnce({ ok: false, skipped: true, reason: 'in-flight' })
      .mockResolvedValueOnce({ ok: true });
    configureSyncActions({
      forcePull: async () => {},
      pushProfile,
      isSyncing: () => false,
    });

    try {
      await expect(syncNow()).resolves.toEqual({ ok: true });
      expect(pushProfile).toHaveBeenCalledTimes(2);
    } finally {
      configureSyncActions({
        forcePull: async () => {},
        pushProfile: async () => {},
        isSyncing: () => false,
      });
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

  it('flushes dirty profiles and the pull-side union before compaction returns', async () => {
    const previousProfile = state.currentProfile;
    const previousImportedData = state.importedData;
    const activeId = 'compact-dirty-active';
    const inactiveId = 'compact-dirty-inactive';
    const inactiveKey = profileStorageKey(inactiveId, 'imported');
    const order = [];
    state.currentProfile = activeId;
    state.importedData = { entries: [], contextNotes: 'fresh active edit' };
    await encryptedSetItem(inactiveKey, JSON.stringify({ entries: [], contextNotes: 'fresh inactive edit' }));
    markSyncProfileDirty(activeId);
    markSyncProfileDirty(inactiveId);
    configureSyncActions({
      forcePull: async () => {
        order.push('pull');
        state.importedData = { entries: [], contextNotes: 'merged pull union' };
        markSyncProfileDirty(activeId);
      },
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
        `push:${activeId}:merged pull union`,
      ]);
    } finally {
      await encryptedRemoveItem(inactiveKey);
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

  it('fails compaction before pulling or pushing when inactive dirty profile data is unavailable', async () => {
    const inactiveId = 'compact-dirty-failed';
    const forcePull = vi.fn();
    const pushProfile = vi.fn(async () => ({ ok: true }));
    await encryptedRemoveItem(profileStorageKey(inactiveId, 'imported'));
    markSyncProfileDirty(inactiveId);
    configureSyncActions({
      forcePull,
      pushProfile,
      isSyncEnabled: () => true,
      isEvoluReady: () => true,
      isSyncing: () => false,
      getProfiles: () => [{ id: inactiveId }],
    });

    try {
      await expect(prepareRelayCompaction()).rejects.toThrow('Could not read local data');
      expect(forcePull).not.toHaveBeenCalled();
      expect(pushProfile).not.toHaveBeenCalled();
    } finally {
      await encryptedRemoveItem(profileStorageKey(inactiveId, 'imported'));
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
    const resetLocalSyncHistoryForRelayRebuild = vi.fn(async () => {
      // Evolu reset callbacks may replace live state before rebuild pushing.
      // The captured pre-reset snapshot must remain authoritative.
      state.importedData = { entries: [], notes: [{ id: 'regressed-during-reset' }] };
      return true;
    });
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
      expect(pushProfile).toHaveBeenCalledWith(
        profileId,
        { entries: [], notes: [] },
        { force: true },
      );
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
