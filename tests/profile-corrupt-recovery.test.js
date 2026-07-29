// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteBlob, getBlob, setBlob } from '../js/blob-storage.js';
import {
  _setTestSessionKey,
  encryptedSetItem,
} from '../js/crypto.js';
import {
  configureProfileDeps,
  configureProfileRuntimeDeps,
  loadProfile,
} from '../js/profile.js';
import { state } from '../js/state.js';

const PROFILE_ID = 'corrupt-recovery';
const IMPORTED_KEY = `labcharts-${PROFILE_ID}-imported`;
const CORRUPT_KEY = `labcharts-${PROFILE_ID}-imported-corrupt`;

let previousProfileDeps;
let previousRuntimeDeps;
let previousState;
let previousActiveProfile;
let previousEncryptionEnabled;
let showNotification;

beforeEach(async () => {
  previousState = {
    currentProfile: state.currentProfile,
    importedData: state.importedData,
  };
  previousActiveProfile = localStorage.getItem('labcharts-active-profile');
  previousEncryptionEnabled = localStorage.getItem('labcharts-encryption-enabled');
  localStorage.removeItem('labcharts-encryption-enabled');
  globalThis.__WEARABLES_TEST = true;
  await _setTestSessionKey(null);
  await Promise.all([deleteBlob(IMPORTED_KEY), deleteBlob(CORRUPT_KEY)]);
  localStorage.removeItem(IMPORTED_KEY);
  localStorage.removeItem(CORRUPT_KEY);
  showNotification = vi.fn();
  previousProfileDeps = configureProfileDeps({ showNotification });
  previousRuntimeDeps = configureProfileRuntimeDeps({
    invalidateProfileContextCache: async () => {},
    reloadProfileRuntimeShell: async () => {},
    refreshProfileWearables: () => {},
  });
});

afterEach(async () => {
  configureProfileDeps(previousProfileDeps);
  configureProfileRuntimeDeps(previousRuntimeDeps);
  state.currentProfile = previousState.currentProfile;
  state.importedData = previousState.importedData;
  if (previousActiveProfile === null) localStorage.removeItem('labcharts-active-profile');
  else localStorage.setItem('labcharts-active-profile', previousActiveProfile);
  if (previousEncryptionEnabled === null) localStorage.removeItem('labcharts-encryption-enabled');
  else localStorage.setItem('labcharts-encryption-enabled', previousEncryptionEnabled);
  await _setTestSessionKey(null);
  delete globalThis.__WEARABLES_TEST;
  await Promise.all([deleteBlob(IMPORTED_KEY), deleteBlob(CORRUPT_KEY)]);
  localStorage.removeItem(IMPORTED_KEY);
  localStorage.removeItem(CORRUPT_KEY);
});

describe('corrupt profile recovery', () => {
  it('awaits a blob-backed recovery copy and never leaves a localStorage duplicate', async () => {
    const malformed = '{"entries":[';
    await encryptedSetItem(IMPORTED_KEY, malformed);

    await loadProfile(PROFILE_ID);

    expect(await getBlob(CORRUPT_KEY)).toBe(malformed);
    expect(localStorage.getItem(CORRUPT_KEY)).toBeNull();
    expect(state.importedData.entries).toEqual([]);
    expect(showNotification).toHaveBeenCalledWith(
      expect.stringContaining('saved as a recovery copy'),
      'error',
      12000,
    );
  });

  it('preserves the first recovery copy when later data is also malformed', async () => {
    await encryptedSetItem(CORRUPT_KEY, 'first recoverable bytes');
    await encryptedSetItem(IMPORTED_KEY, '{"newer":');

    await loadProfile(PROFILE_ID);

    expect(await getBlob(CORRUPT_KEY)).toBe('first recoverable bytes');
  });

  it('refuses to write malformed plaintext while encryption is enabled but locked', async () => {
    await setBlob(IMPORTED_KEY, '{"locked":');
    localStorage.setItem('labcharts-encryption-enabled', 'true');

    await loadProfile(PROFILE_ID);

    expect(await getBlob(CORRUPT_KEY)).toBeNull();
    expect(localStorage.getItem(CORRUPT_KEY)).toBeNull();
    expect(showNotification).toHaveBeenCalledWith(
      expect.stringContaining('recovery copy could not be saved'),
      'error',
      12000,
    );
  });
});
