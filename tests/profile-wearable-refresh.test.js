// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { configureProfileRuntimeDeps, loadProfile } from '../js/profile.js';
import { state } from '../js/state.js';

const PROFILE_ID = 'injected-wearable-refresh';
const IMPORTED_KEY = `labcharts-${PROFILE_ID}-imported`;

describe('profile wearable refresh dependency', () => {
  afterEach(() => {
    localStorage.removeItem(IMPORTED_KEY);
  });

  it('passes the loaded profile and its biometrics to the runtime seam', async () => {
    const previousProfile = state.currentProfile;
    const previousImportedData = state.importedData;
    const previousActiveProfile = localStorage.getItem('labcharts-active-profile');
    const refreshProfileWearables = vi.fn();
    const previousDeps = configureProfileRuntimeDeps({
      reloadProfileRuntimeShell: async () => {},
      refreshProfileWearables,
    });
    localStorage.setItem(IMPORTED_KEY, JSON.stringify({
      entries: [],
      biometrics: { weight: 72 },
    }));

    try {
      await loadProfile(PROFILE_ID);

      expect(refreshProfileWearables).toHaveBeenCalledWith(
        PROFILE_ID,
        expect.objectContaining({ weight: 72 })
      );
    } finally {
      configureProfileRuntimeDeps(previousDeps);
      state.currentProfile = previousProfile;
      state.importedData = previousImportedData;
      if (previousActiveProfile == null) localStorage.removeItem('labcharts-active-profile');
      else localStorage.setItem('labcharts-active-profile', previousActiveProfile);
    }
  });
});
