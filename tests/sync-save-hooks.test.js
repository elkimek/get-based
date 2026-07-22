import { describe, expect, it, vi } from 'vitest';

import {
  configureSyncSaveHooks,
  readProfileImportedData,
} from '../js/sync-save-hooks.js';

describe('sync save-hook profile data dependencies', () => {
  it('normalizes fallback data and creates missing profile data through configured helpers', async () => {
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
      await expect(readProfileImportedData('missing-profile')).resolves.toEqual({
        entries: [],
        created: true,
      });
      expect(createDefaultProfileData).toHaveBeenCalledOnce();
    } finally {
      configureSyncSaveHooks(previous);
    }
  });
});
