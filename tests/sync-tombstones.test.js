// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  configureSyncTombstones,
  applyPendingTombstone,
  applyRemoteTombstones,
  deleteProfileFromRelay,
  listPendingTombstones,
} from '../js/sync-tombstones.js';
import { configureProfileStorageCleanupDeps } from '../js/profile-storage-cleanup.js';
import { state } from '../js/state.js';

describe('sync tombstone profile dependencies', () => {
  afterEach(() => {
    localStorage.removeItem('labcharts-tombstone-pending-injected-profile');
    for (const id of ['batch-a', 'batch-b', 'stale-profile', 'lastonly']) {
      localStorage.removeItem(`labcharts-tombstone-pending-${id}`);
      localStorage.removeItem(`labcharts-profile-delete-intent-${id}`);
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

  it('treats a newer live row as Keep and clears its obsolete pending delete', async () => {
    localStorage.setItem('labcharts-tombstone-pending-stale-profile', JSON.stringify({ at: 1 }));
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
      expect(saveProfiles).not.toHaveBeenCalled();
    } finally {
      configureSyncTombstones(previous);
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
      expect(loadProfile).toHaveBeenCalledWith(replacement.id);
      expect(localStorage.getItem('labcharts-profile-delete-intent-lastonly')).not.toBeNull();
    } finally {
      state.currentProfile = oldCurrent;
      configureSyncTombstones(previous);
      configureProfileStorageCleanupDeps(cleanupPrevious);
    }
  });
});
