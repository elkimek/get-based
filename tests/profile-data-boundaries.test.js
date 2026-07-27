// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createDefaultProfileData,
  getProfiles,
  initProfilesCache,
  migrateProfileData,
} from '../js/profile.js';
import { state } from '../js/state.js';

const PROFILES_KEY = 'labcharts-profiles';
let savedProfiles;
let savedStoredProfiles;

beforeEach(() => {
  savedProfiles = state.profiles;
  savedStoredProfiles = localStorage.getItem(PROFILES_KEY);
});

afterEach(() => {
  state.profiles = savedProfiles;
  if (savedStoredProfiles == null) localStorage.removeItem(PROFILES_KEY);
  else localStorage.setItem(PROFILES_KEY, savedStoredProfiles);
});

describe('profile data boundaries', () => {
  it('rejects non-array profile payloads from both storage paths', async () => {
    state.profiles = null;
    localStorage.setItem(PROFILES_KEY, JSON.stringify({ id: 'not-a-list' }));

    expect(getProfiles()).toEqual([]);

    await initProfilesCache();

    expect(state.profiles).toEqual([]);
  });

  it('migrates every legacy light practice into the structured format', () => {
    const data = createDefaultProfileData();
    data.lightCircadian = {
      timing: 'legacy',
      practices: [
        'morning sunlight',
        'blue light blockers',
        'no screens before bed',
        'red light therapy',
        'UVB exposure',
      ],
      mealTiming: ['early dinner'],
      note: '',
    };

    const migrated = migrateProfileData(data);

    expect(migrated.lightCircadian).toMatchObject({
      amLight: 'morning outdoor (after sunrise)',
      uvExposure: 'UVB lamp',
      evening: ['blue blockers after sunset', 'no screens 1-2h before bed'],
      mealTiming: ['early dinner'],
      note: 'red light therapy',
    });

    const lampData = createDefaultProfileData();
    lampData.lightCircadian = {
      timing: 'legacy',
      practices: ['light therapy lamp'],
      mealTiming: [],
      note: '',
    };

    expect(migrateProfileData(lampData).lightCircadian.amLight).toBe('light therapy lamp');
  });
});
