import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearSyncProfileDirty, getSyncDirtyToken, markSyncProfileDirty,
} from '../js/sync-dirty-state.js';

describe('sync dirty generations', () => {
  const profileId = 'dirty-generation-test';

  beforeEach(() => {
    localStorage.removeItem(`labcharts-${profileId}-sync-dirty`);
  });

  it('clears only the generation captured by the completed push', () => {
    const first = markSyncProfileDirty(profileId);
    const second = markSyncProfileDirty(profileId);

    expect(first).not.toBe(second);
    expect(clearSyncProfileDirty(profileId, first)).toBe(false);
    expect(getSyncDirtyToken(profileId)).toBe(second);
    expect(clearSyncProfileDirty(profileId, second)).toBe(true);
    expect(getSyncDirtyToken(profileId)).toBeNull();
  });
});
