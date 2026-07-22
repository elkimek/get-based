import { describe, expect, it, vi } from 'vitest';

import { configureSyncActions, pushAllProfiles } from '../js/sync-actions.js';
import { state } from '../js/state.js';

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
      await pushAllProfiles({ force: true });

      expect(getProfiles).toHaveBeenCalledOnce();
      expect(createDefaultProfileData).toHaveBeenCalledOnce();
      expect(pushProfile).toHaveBeenCalledWith('seed-profile', defaultData, { force: true });
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
});
