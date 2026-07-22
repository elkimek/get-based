// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import {
  configureSyncTombstones,
  listPendingTombstones,
} from '../js/sync-tombstones.js';

describe('sync tombstone profile dependencies', () => {
  afterEach(() => {
    localStorage.removeItem('labcharts-tombstone-pending-injected-profile');
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
});
