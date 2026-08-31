// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearAllProfileSyncDeleteState,
  createClearedProfileRecord,
  markClearedProfilesForSync,
  propagateClearedProfilesToRelay,
} from '../js/clear-all-profile-reset.js';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('clear-all profile reset', () => {
  it('drops delete state from the previous sync owner only', () => {
    localStorage.setItem('labcharts-profile-delete-intent-old-profile', '{}');
    localStorage.setItem('labcharts-tombstone-pending-old-profile', '{}');
    localStorage.setItem('labcharts-unrelated-setting', 'keep');

    expect(clearAllProfileSyncDeleteState()).toBe(2);
    expect(localStorage.getItem('labcharts-profile-delete-intent-old-profile')).toBeNull();
    expect(localStorage.getItem('labcharts-tombstone-pending-old-profile')).toBeNull();
    expect(localStorage.getItem('labcharts-unrelated-setting')).toBe('keep');
  });

  it('creates a fresh empty profile identity instead of reusing a cleared id', () => {
    const profile = createClearedProfileRecord('Primary', 1234);

    expect(profile).toMatchObject({
      name: 'Primary',
      createdAt: 1234,
      lastUpdated: 1234,
      status: 'active',
    });
    expect(profile.id).toMatch(/^p_[A-Za-z0-9_-]+$/);
    expect(profile.id).not.toBe('default');
  });

  it('durably blocks every unique cleared profile before relay propagation', () => {
    const marked = markClearedProfilesForSync([
      'profile-a',
      'profile-b',
      'profile-a',
      '',
      '../invalid',
    ]);

    expect(marked).toEqual(['profile-a', 'profile-b']);
    for (const profileId of marked) {
      expect(JSON.parse(localStorage.getItem(`labcharts-profile-delete-intent-${profileId}`)))
        .toMatchObject({ source: 'clear-all' });
    }
    expect(localStorage.getItem('labcharts-profile-delete-intent-../invalid')).toBeNull();
  });

  it('attempts every old relay profile even when one deletion fails', async () => {
    const deleteProfileFromRelay = vi.fn(async profileId => {
      if (profileId === 'profile-a') throw new Error('offline');
      return { ok: true };
    });

    const results = await propagateClearedProfilesToRelay(
      ['profile-a', 'profile-b'],
      deleteProfileFromRelay,
    );

    expect(deleteProfileFromRelay).toHaveBeenCalledTimes(2);
    expect(results.map(result => result.status)).toEqual(['rejected', 'fulfilled']);
  });
});
