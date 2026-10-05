import { beforeEach, describe, expect, it } from 'vitest';

import { clearProfileDeltaSnapshots } from '../js/sync-delta-snapshot.js';
import {
  getPendingBackupRestoreProfileIds,
  prepareRestoredProfilesForSync,
} from '../js/sync-backup-restore-state.js';

describe('backup restore sync handoff', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('clears planner state while preserving telemetry', () => {
    const profileId = 'restore-profile';
    localStorage.setItem(`labcharts-${profileId}-delta-supplements`, '{"s_old":"hash"}');
    localStorage.setItem(`labcharts-${profileId}-delta-supplements-meta`, '{"plannedAt":1}');
    localStorage.setItem(`labcharts-${profileId}-delta-telemetry`, '{"pushes":1}');
    localStorage.setItem('labcharts-other-delta-supplements', '{"other":"hash"}');

    expect(clearProfileDeltaSnapshots(profileId)).toBe(2);
    expect(localStorage.getItem(`labcharts-${profileId}-delta-supplements`)).toBeNull();
    expect(localStorage.getItem(`labcharts-${profileId}-delta-supplements-meta`)).toBeNull();
    expect(localStorage.getItem(`labcharts-${profileId}-delta-telemetry`)).toBe('{"pushes":1}');
    expect(localStorage.getItem('labcharts-other-delta-supplements')).toBe('{"other":"hash"}');
  });

  it('marks each restored profile dirty and disables stale lean-sync state', () => {
    const profileId = 'restored-profile';
    localStorage.setItem(`labcharts-${profileId}-delta-supplements`, '{"s_old":"hash"}');
    localStorage.setItem(`labcharts-${profileId}-sync-cutover-v2`, '1');
    localStorage.setItem(`labcharts-${profileId}-sync-ts`, '123');
    localStorage.setItem(`labcharts-profile-delete-intent-${profileId}`, '{"source":"local"}');
    localStorage.setItem(`labcharts-tombstone-pending-${profileId}`, '{"source":"remote"}');

    const prepared = prepareRestoredProfilesForSync({
      profiles: [
        { profileId },
        { profileId },
        { profileId: '../unsafe' },
      ],
    });

    expect(prepared).toBe(1);
    expect(localStorage.getItem(`labcharts-${profileId}-delta-supplements`)).toBeNull();
    expect(localStorage.getItem(`labcharts-${profileId}-sync-cutover-v2`)).toBeNull();
    expect(localStorage.getItem(`labcharts-${profileId}-sync-ts`)).toBeNull();
    expect(localStorage.getItem(`labcharts-profile-delete-intent-${profileId}`)).toBeNull();
    expect(localStorage.getItem(`labcharts-tombstone-pending-${profileId}`)).toBeNull();
    expect(localStorage.getItem(`labcharts-${profileId}-sync-dirty`)).toMatch(/^\d+:\d+$/);
    expect(getPendingBackupRestoreProfileIds()).toEqual([profileId]);
    expect(localStorage.getItem('labcharts-../unsafe-sync-dirty')).toBeNull();
  });
});
