import { afterEach, describe, expect, it, vi } from 'vitest';

import { encryptedRemoveItem, encryptedSetItem } from '../js/crypto.js';
import * as cryptoStore from '../js/crypto.js';
import { profileStorageKey } from '../js/profile-storage-key.js';
import { state } from '../js/state.js';
import {
  clearSyncSaveTimers,
  configureSyncSaveHooks,
  onDataSaved,
  onProfileSaved,
  readProfileImportedData,
} from '../js/sync-save-hooks.js';
import { clearSyncProfileDirty, getSyncDirtyToken, markSyncProfileDirty } from '../js/sync-dirty-state.js';

describe('sync save-hook profile data dependencies', () => {
  afterEach(() => {
    clearSyncSaveTimers();
    vi.restoreAllMocks();
  });

  it('normalizes explicit fallback data but fails closed for a missing named profile', async () => {
    const fallback = { entries: [] };
    const createDefaultProfileData = vi.fn(() => ({ entries: [], created: true }));
    const migrateProfileData = vi.fn(data => {
      data.migrated = true;
      return data;
    });
    const previous = configureSyncSaveHooks({ createDefaultProfileData, migrateProfileData });

    try {
      await expect(readProfileImportedData('fallback-profile', fallback)).resolves.toBe(fallback);
      expect(fallback.migrated).toBe(true);
      expect(migrateProfileData).toHaveBeenCalledWith(fallback);

      localStorage.removeItem('labcharts-missing-profile-imported');
      await expect(readProfileImportedData('missing-profile')).resolves.toBeNull();
      expect(createDefaultProfileData).not.toHaveBeenCalled();

      await expect(readProfileImportedData(null)).resolves.toEqual({
        entries: [],
        created: true,
      });
      expect(createDefaultProfileData).toHaveBeenCalledOnce();
    } finally {
      configureSyncSaveHooks(previous);
    }
  });

  it('reads an inactive unencrypted profile blob from IndexedDB, including genome data', async () => {
    const profileId = 'inactive-genome-profile';
    const storageKey = profileStorageKey(profileId, 'imported');
    const previousCurrentProfile = state.currentProfile;
    const previousImportedData = state.importedData;
    const previousEncryptionEnabled = localStorage.getItem('labcharts-encryption-enabled');
    const stored = {
      entries: [],
      genetics: {
        snps: [
          { rsid: 'rs123', chromosome: '1', position: 12345, genotype: 'AG' },
        ],
      },
    };

    localStorage.removeItem('labcharts-encryption-enabled');
    await encryptedRemoveItem(storageKey);
    await encryptedSetItem(storageKey, JSON.stringify(stored));
    state.currentProfile = 'different-active-profile';
    state.importedData = { entries: [] };

    try {
      // The imported blob is intentionally absent from localStorage; it is
      // always IDB-backed even when encryption itself is disabled.
      expect(localStorage.getItem(storageKey)).toBeNull();
      await expect(readProfileImportedData(profileId)).resolves.toEqual(stored);
    } finally {
      state.currentProfile = previousCurrentProfile;
      state.importedData = previousImportedData;
      if (previousEncryptionEnabled === null) localStorage.removeItem('labcharts-encryption-enabled');
      else localStorage.setItem('labcharts-encryption-enabled', previousEncryptionEnabled);
      await encryptedRemoveItem(storageKey);
    }
  });

  it('does not publish a blank replacement when an inactive profile blob is unavailable', async () => {
    const profileId = 'unavailable-inactive-profile';
    const storageKey = profileStorageKey(profileId, 'imported');
    const previousCurrentProfile = state.currentProfile;
    const previousImportedData = state.importedData;
    const pushProfile = vi.fn(async () => ({}));
    const previous = configureSyncSaveHooks({
      pushProfile,
      isSyncEnabled: () => true,
      isEvoluReady: () => true,
      isSyncing: () => false,
    });

    await encryptedRemoveItem(storageKey);
    state.currentProfile = 'different-active-profile';
    state.importedData = { entries: [] };

    try {
      onProfileSaved(profileId);
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(pushProfile).not.toHaveBeenCalled();
    } finally {
      configureSyncSaveHooks(previous);
      state.currentProfile = previousCurrentProfile;
      state.importedData = previousImportedData;
      localStorage.removeItem(`labcharts-${profileId}-sync-dirty`);
      await encryptedRemoveItem(storageKey);
    }
  });

  for (const switchedProfile of [false, true]) {
    it(`delayed saves use the latest ${switchedProfile ? 'stored' : 'active'} profile after an incoming merge`, async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const profileId = 'delayed-merge-profile';
      const storageKey = profileStorageKey(profileId, 'imported');
      const previousProfile = state.currentProfile;
      const previousData = state.importedData;
      const pushProfile = vi.fn(async () => ({ ok: true }));
      const previous = configureSyncSaveHooks({
        pushProfile, isSyncConfigured: () => true, isSyncEnabled: () => true,
        isEvoluReady: () => true, isSyncing: () => false,
        getProfiles: () => [{ id: profileId }],
      });
      const fresh = { entries: [], notes: [{ id: 'local' }, { id: 'received' }] };
      try {
        state.currentProfile = profileId;
        state.importedData = { entries: [], notes: [{ id: 'local' }] };
        onDataSaved();
        if (switchedProfile) {
          await encryptedSetItem(storageKey, JSON.stringify(fresh));
          state.currentProfile = 'other-profile';
          state.importedData = { entries: [] };
        } else state.importedData = fresh;
        await vi.advanceTimersByTimeAsync(10_000);
        vi.useRealTimers();
        await vi.waitFor(() => expect(pushProfile).toHaveBeenCalledTimes(1));
        expect(pushProfile.mock.calls[0][1].notes).toEqual(fresh.notes);
      } finally {
        clearSyncSaveTimers();
        vi.useRealTimers();
        configureSyncSaveHooks(previous);
        state.currentProfile = previousProfile;
        state.importedData = previousData;
        localStorage.removeItem(`labcharts-${profileId}-sync-dirty`);
        await encryptedRemoveItem(storageKey);
      }
    });
  }

  it('re-reads an inactive snapshot when a newer save arrives during its storage read', async () => {
    const profileId = 'save-during-read';
    const storageKey = profileStorageKey(profileId, 'imported');
    const previousProfile = state.currentProfile, previousData = state.importedData;
    const oldData = { entries: [], contextNotes: 'old' };
    const newData = { entries: [], contextNotes: 'newer saved edit' };
    const pushProfile = vi.fn(async id => {
      clearSyncProfileDirty(id, getSyncDirtyToken(id));
      return { ok: true };
    });
    const previous = configureSyncSaveHooks({
      pushProfile, isSyncConfigured: () => true, isSyncEnabled: () => true,
      isEvoluReady: () => true, isSyncing: () => false, getProfiles: () => [{ id: profileId }],
    });
    let finishRead;
    const pendingRead = new Promise(resolve => { finishRead = resolve; });
    const read = vi.spyOn(cryptoStore, 'encryptedGetItem').mockImplementationOnce(() => pendingRead);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      state.currentProfile = profileId;
      state.importedData = oldData;
      onDataSaved();
      state.currentProfile = 'other-profile';
      state.importedData = { entries: [] };
      await vi.advanceTimersByTimeAsync(10_000);
      expect(read).toHaveBeenCalledWith(storageKey);
      await encryptedSetItem(storageKey, JSON.stringify(newData));
      markSyncProfileDirty(profileId);
      finishRead(JSON.stringify(oldData));
      vi.useRealTimers();
      await vi.waitFor(() => expect(pushProfile).toHaveBeenCalledOnce());
      expect(pushProfile.mock.calls[0][1]).toEqual(newData);
      expect(getSyncDirtyToken(profileId)).toBeNull();
    } finally {
      finishRead(JSON.stringify(oldData));
      clearSyncSaveTimers(); vi.useRealTimers(); read.mockRestore();
      configureSyncSaveHooks(previous);
      state.currentProfile = previousProfile; state.importedData = previousData;
      localStorage.removeItem(`labcharts-${profileId}-sync-dirty`);
      await encryptedRemoveItem(storageKey);
    }
  });

  it('does not replay a delayed save after manual sync already committed it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const previousProfile = state.currentProfile, previousData = state.importedData;
    const pushProfile = vi.fn(async () => ({ ok: true }));
    const previous = configureSyncSaveHooks({
      pushProfile, isSyncConfigured: () => true, isSyncEnabled: () => true,
      isEvoluReady: () => true, isSyncing: () => false, getProfiles: () => [{ id: 'already-synced' }],
    });
    try {
      state.currentProfile = 'already-synced';
      state.importedData = { entries: [], contextNotes: 'edited locally' };
      onDataSaved();
      clearSyncProfileDirty('already-synced', getSyncDirtyToken('already-synced'));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(pushProfile).not.toHaveBeenCalled();
    } finally {
      clearSyncSaveTimers(); vi.useRealTimers(); configureSyncSaveHooks(previous);
      state.currentProfile = previousProfile; state.importedData = previousData;
    }
  });

  it('keeps paused edits dirty without starting a push', () => {
    const previousCurrentProfile = state.currentProfile;
    const previousImportedData = state.importedData;
    const profileId = 'paused-edit-profile';
    const pushProfile = vi.fn();
    const previous = configureSyncSaveHooks({
      pushProfile,
      isSyncConfigured: () => true,
      isSyncEnabled: () => false,
      isEvoluReady: () => false,
    });
    state.currentProfile = profileId;
    state.importedData = { entries: [], supplements: [{ id: 'supplement-1' }] };

    try {
      onDataSaved({ immediate: true });
      expect(localStorage.getItem(`labcharts-${profileId}-sync-dirty`)).toMatch(/^\d+:\d+$/);
      expect(pushProfile).not.toHaveBeenCalled();
    } finally {
      configureSyncSaveHooks(previous);
      localStorage.removeItem(`labcharts-${profileId}-sync-dirty`);
      state.currentProfile = previousCurrentProfile;
      state.importedData = previousImportedData;
    }
  });

  it('keeps the dirty generation while a remote delete awaits confirmation', () => {
    const previousCurrentProfile = state.currentProfile;
    const previousImportedData = state.importedData;
    const profileId = 'pending-delete-save-profile';
    const pushProfile = vi.fn();
    const previous = configureSyncSaveHooks({
      pushProfile,
      isSyncConfigured: () => true,
      isSyncEnabled: () => true,
      isEvoluReady: () => true,
      getProfiles: () => [{ id: profileId, tags: [] }],
    });
    state.currentProfile = profileId;
    state.importedData = { entries: [], notes: [{ id: 'newer-local-edit' }] };
    markSyncProfileDirty(profileId);
    const dirtyToken = getSyncDirtyToken(profileId);
    localStorage.setItem(`labcharts-tombstone-pending-${profileId}`, JSON.stringify({ source: 'remote' }));

    try {
      onDataSaved({ immediate: true });
      expect(getSyncDirtyToken(profileId)).toBe(dirtyToken);
      expect(pushProfile).not.toHaveBeenCalled();
    } finally {
      configureSyncSaveHooks(previous);
      localStorage.removeItem(`labcharts-${profileId}-sync-dirty`);
      localStorage.removeItem(`labcharts-tombstone-pending-${profileId}`);
      state.currentProfile = previousCurrentProfile;
      state.importedData = previousImportedData;
    }
  });
});
