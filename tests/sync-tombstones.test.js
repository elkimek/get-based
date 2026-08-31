// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  configureSyncTombstones,
  applyPendingTombstone,
  applyRemoteTombstones,
  deleteProfileFromRelay,
  listPendingTombstones,
  rejectPendingTombstone,
} from '../js/sync-tombstones.js';
import { configureProfileStorageCleanupDeps } from '../js/profile-storage-cleanup.js';
import { getSyncDirtyToken, markSyncProfileDirty } from '../js/sync-dirty-state.js';
import { state } from '../js/state.js';

describe('sync tombstone profile dependencies', () => {
  afterEach(() => {
    localStorage.removeItem('labcharts-tombstone-pending-injected-profile');
    for (const id of ['batch-a', 'batch-b', 'stale-profile', 'lastonly', 'replaced-old', 'replacement-new', 'dirty-local', 'active-restore']) {
      localStorage.removeItem(`labcharts-tombstone-pending-${id}`);
      localStorage.removeItem(`labcharts-profile-delete-intent-${id}`);
      localStorage.removeItem(`labcharts-${id}-sync-dirty`);
    }
  });

  it('uses the configured profile reader for pending tombstones', () => {
    const previous = configureSyncTombstones({
      getProfiles: () => [{ id: 'injected-profile', name: 'Injected' }],
    });
    localStorage.setItem(
      'labcharts-tombstone-pending-injected-profile',
      JSON.stringify({ at: 123, source: 'remote' })
    );

    try {
      expect(listPendingTombstones()).toEqual([{
        id: 'injected-profile',
        name: 'Injected',
        at: 123,
        source: 'remote',
      }]);
    } finally {
      configureSyncTombstones(previous);
    }
  });

  it('soft-deletes every duplicate live row for one profile id', async () => {
    const updates = [];
    const previous = configureSyncTombstones({
      getEvolu: () => ({
        getQueryRows: () => [
          { id: 'row-old', profileId: 'duplicate-profile', syncedAt: '2026-08-20T10:00:00.000Z' },
          { id: 'row-new', profileId: 'duplicate-profile', syncedAt: '2026-08-21T10:00:00.000Z' },
        ],
        update: (table, args) => updates.push({ table, args }),
      }),
      getProfileQuery: () => 'profiles',
      isSyncEnabled: () => true,
    });

    try {
      await expect(deleteProfileFromRelay('duplicate-profile')).resolves.toMatchObject({ ok: true, deletedRows: 2 });
      expect(updates).toHaveLength(2);
      expect(updates.map(update => update.args.id).sort()).toEqual(['row-new', 'row-old']);
      expect(updates.every(update => update.args.isDeleted === 1)).toBe(true);
    } finally {
      configureSyncTombstones(previous);
    }
  });

  it('quarantines a tombstone batch once without repeating the notification', async () => {
    const notify = vi.fn();
    const tombs = [
      { id: 'tomb-a', profileId: 'batch-a', syncedAt: '2026-08-22T10:00:00.000Z' },
      { id: 'tomb-b', profileId: 'batch-b', syncedAt: '2026-08-22T10:00:01.000Z' },
    ];
    const previous = configureSyncTombstones({
      getEvolu: () => ({ getQueryRows: query => query === 'tombstones' ? tombs : [] }),
      getProfileQuery: () => 'profiles',
      getTombstoneQuery: () => 'tombstones',
      getProfiles: () => [{ id: 'batch-a', name: 'A', tags: [] }, { id: 'batch-b', name: 'B', tags: [] }],
      notify,
    });

    try {
      await applyRemoteTombstones();
      await applyRemoteTombstones();
      expect(notify).toHaveBeenCalledOnce();
      expect(notify).toHaveBeenCalledWith(
        '2 profiles deleted on another device. Open Settings → Data → Cross-Device Sync to choose Apply delete or Restore.',
        'info',
        6000
      );
      expect(listPendingTombstones().map(item => item.id).sort()).toEqual(['batch-a', 'batch-b']);
    } finally {
      configureSyncTombstones(previous);
    }
  });

  it('treats a newer live row as Keep and retires obsolete local delete state', async () => {
    localStorage.setItem('labcharts-tombstone-pending-stale-profile', JSON.stringify({ at: 1 }));
    localStorage.setItem('labcharts-profile-delete-intent-stale-profile', JSON.stringify({ at: 1 }));
    const saveProfiles = vi.fn();
    const previous = configureSyncTombstones({
      getEvolu: () => ({
        getQueryRows: query => query === 'tombstones'
          ? [{ id: 'old-tomb', profileId: 'stale-profile', syncedAt: '2026-08-20T10:00:00.000Z' }]
          : [{ id: 'new-live', profileId: 'stale-profile', syncedAt: '2026-08-21T10:00:00.000Z' }],
      }),
      getProfileQuery: () => 'profiles',
      getTombstoneQuery: () => 'tombstones',
      getProfiles: () => [{ id: 'stale-profile', name: 'Kept', tags: [] }],
      saveProfiles,
    });

    try {
      await applyRemoteTombstones();
      expect(localStorage.getItem('labcharts-tombstone-pending-stale-profile')).toBeNull();
      expect(localStorage.getItem('labcharts-profile-delete-intent-stale-profile')).toBeNull();
      expect(saveProfiles).not.toHaveBeenCalled();
    } finally {
      configureSyncTombstones(previous);
    }
  });

  it('quarantines a single tombstone instead of erasing unsynced local edits', async () => {
    const profileId = 'dirty-local';
    const notify = vi.fn();
    const saveProfiles = vi.fn();
    const cleanupPrevious = configureProfileStorageCleanupDeps({
      encryptedRemoveItem: async () => {},
      getBlobKeys: async () => [],
      getDatabaseNames: async () => [],
      deleteWearablesDB: async () => {},
      deleteCycleDB: async () => {},
      deleteNutritionDB: async () => {},
    });
    const previous = configureSyncTombstones({
      getEvolu: () => ({
        getQueryRows: query => query === 'tombstones'
          ? [{ id: 'remote-delete', profileId, syncedAt: '2026-08-25T10:00:00.000Z' }]
          : [],
      }),
      getProfileQuery: () => 'profiles',
      getTombstoneQuery: () => 'tombstones',
      getProfiles: () => [{ id: profileId, name: 'Locally edited', tags: [] }],
      saveProfiles,
      notify,
    });
    markSyncProfileDirty(profileId);

    try {
      await applyRemoteTombstones();
      expect(saveProfiles).not.toHaveBeenCalled();
      expect(getSyncDirtyToken(profileId)).not.toBeNull();
      expect(localStorage.getItem(`labcharts-tombstone-pending-${profileId}`)).not.toBeNull();
      expect(localStorage.getItem(`labcharts-profile-delete-intent-${profileId}`)).toBeNull();
      expect(notify).toHaveBeenCalledWith(
        '1 profile deleted on another device with unsynced local changes. Open Settings → Data → Cross-Device Sync to choose Apply delete or Restore.',
        'info',
        6000
      );

      // The pending confirmation is itself a durable deletion gate. Even if
      // a legacy path or another tab loses the auxiliary dirty marker, the
      // next pull must not erase the profile behind the user's back.
      localStorage.removeItem(`labcharts-${profileId}-sync-dirty`);
      await applyRemoteTombstones();
      expect(saveProfiles).not.toHaveBeenCalled();
      expect(localStorage.getItem(`labcharts-tombstone-pending-${profileId}`)).not.toBeNull();
    } finally {
      configureSyncTombstones(previous);
      configureProfileStorageCleanupDeps(cleanupPrevious);
    }
  });

  it('replaces a confirmed last-profile deletion with a fresh blank id', async () => {
    const oldCurrent = state.currentProfile;
    state.currentProfile = 'lastonly';
    localStorage.setItem('labcharts-tombstone-pending-lastonly', JSON.stringify({ at: 1 }));
    const saveProfiles = vi.fn().mockResolvedValue(undefined);
    const loadProfile = vi.fn().mockResolvedValue(undefined);
    const cleanupPrevious = configureProfileStorageCleanupDeps({
      encryptedRemoveItem: async () => {},
      getBlobKeys: async () => [],
      getDatabaseNames: async () => [],
      deleteWearablesDB: async () => {},
      deleteCycleDB: async () => {},
      deleteNutritionDB: async () => {},
    });
    const previous = configureSyncTombstones({
      getProfiles: () => [{ id: 'lastonly', name: 'Deleted', tags: [] }],
      saveProfiles,
      loadProfile,
    });

    try {
      await expect(applyPendingTombstone('lastonly')).resolves.toEqual({ ok: true });
      const replacement = saveProfiles.mock.calls[0][0][0];
      expect(replacement.id).not.toBe('lastonly');
      expect(replacement.tags).toEqual([]);
      expect(replacement._syncReplacementFallbackFor).toBe('lastonly');
      expect(replacement._syncReplacementFallbackAt).toBe(replacement.createdAt);
      expect(loadProfile).toHaveBeenCalledWith(replacement.id);
      expect(localStorage.getItem('labcharts-profile-delete-intent-lastonly')).not.toBeNull();
    } finally {
      state.currentProfile = oldCurrent;
      configureSyncTombstones(previous);
      configureProfileStorageCleanupDeps(cleanupPrevious);
    }
  });

  it('adopts a fresh relay profile when clear-all tombstones the last old id', async () => {
    const oldCurrent = state.currentProfile;
    state.currentProfile = 'replaced-old';
    const saveProfiles = vi.fn().mockResolvedValue(undefined);
    const loadProfile = vi.fn().mockResolvedValue(undefined);
    const cleanupPrevious = configureProfileStorageCleanupDeps({
      encryptedRemoveItem: async () => {},
      getBlobKeys: async () => [],
      getDatabaseNames: async () => [],
      deleteWearablesDB: async () => {},
      deleteCycleDB: async () => {},
      deleteNutritionDB: async () => {},
    });
    const rows = {
      tombstones: [{
        id: 'old-tombstone',
        profileId: 'replaced-old',
        syncedAt: '2026-08-31T08:00:00.000Z',
      }],
      profiles: [{
        id: 'fresh-row',
        profileId: 'replacement-new',
        syncedAt: '2026-08-31T08:00:01.000Z',
        dataJson: JSON.stringify({
          _v: 3,
          importedData: { entries: [] },
          profile: { id: 'replacement-new', name: 'Primary', pinned: true },
        }),
      }],
    };
    const previous = configureSyncTombstones({
      getEvolu: () => ({ getQueryRows: query => rows[query] || [] }),
      getProfileQuery: () => 'profiles',
      getTombstoneQuery: () => 'tombstones',
      getProfiles: () => [{ id: 'replaced-old', name: 'Primary', tags: [] }],
      saveProfiles,
      loadProfile,
    });

    try {
      await applyRemoteTombstones();
      expect(saveProfiles).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'replacement-new', name: 'Primary', pinned: true }),
      ]);
      expect(loadProfile).toHaveBeenCalledWith('replacement-new');
      expect(localStorage.getItem('labcharts-profile-delete-intent-replaced-old')).not.toBeNull();
    } finally {
      state.currentProfile = oldCurrent;
      configureSyncTombstones(previous);
      configureProfileStorageCleanupDeps(cleanupPrevious);
    }
  });

  it('restores the active profile from newer in-memory edits', async () => {
    const profileId = 'active-restore';
    const oldCurrent = state.currentProfile;
    const oldImportedData = state.importedData;
    const currentData = { entries: [{ id: 'new-unsaved-edit' }] };
    const pushProfile = vi.fn().mockResolvedValue({ ok: true });
    state.currentProfile = profileId;
    state.importedData = currentData;
    localStorage.setItem(
      `labcharts-tombstone-pending-${profileId}`,
      JSON.stringify({ at: 123, source: 'remote' })
    );
    const previous = configureSyncTombstones({
      getEvolu: () => ({}),
      isSyncEnabled: () => true,
      getProfiles: () => [{ id: profileId, name: 'Active' }],
      pushProfile,
    });

    try {
      await expect(rejectPendingTombstone(profileId)).resolves.toEqual({ ok: true });
      expect(pushProfile).toHaveBeenCalledWith(
        profileId,
        currentData,
        { allowTombstoneResurrection: true }
      );
      expect(localStorage.getItem(`labcharts-tombstone-pending-${profileId}`)).toBeNull();
    } finally {
      state.currentProfile = oldCurrent;
      state.importedData = oldImportedData;
      configureSyncTombstones(previous);
    }
  });
});
