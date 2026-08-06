import { afterEach, describe, expect, it, vi } from 'vitest';

import { encryptedGetItem, encryptedRemoveItem } from '../js/crypto.js';
import { saveImportedData } from '../js/data.js';
import { profileStorageKey } from '../js/profile.js';
import { state } from '../js/state.js';

const PROFILE_ID = 'save-dedup-profile';
const IMPORTED_KEY = profileStorageKey(PROFILE_ID, 'imported');

describe('profile data persistence deduplication', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await encryptedRemoveItem(IMPORTED_KEY);
    localStorage.clear();
  });

  it('does not advance profile metadata when an equivalent snapshot is saved again', async () => {
    const previous = {
      currentProfile: state.currentProfile,
      importedData: state.importedData,
      profiles: state.profiles,
    };
    state.currentProfile = PROFILE_ID;
    state.importedData = { entries: [], notes: [], supplements: [] };
    state.profiles = [{
      id: PROFILE_ID,
      name: 'Stable profile',
      location: { country: '', zip: '' },
      tags: [],
      createdAt: 100,
      lastUpdated: 100,
    }];

    try {
      const now = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-08-06T10:00:00Z').getTime());
      await expect(saveImportedData({ skipSync: true })).resolves.toBe(true);
      const firstTimestamp = state.profiles[0].lastUpdated;
      expect(await encryptedGetItem(IMPORTED_KEY)).toBe(JSON.stringify(state.importedData));

      now.mockReturnValue(new Date('2026-08-06T10:05:00Z').getTime());
      await expect(saveImportedData({ skipSync: true })).resolves.toBe(true);
      expect(state.profiles[0].lastUpdated).toBe(firstTimestamp);
    } finally {
      state.currentProfile = previous.currentProfile;
      state.importedData = previous.importedData;
      state.profiles = previous.profiles;
    }
  });
});
