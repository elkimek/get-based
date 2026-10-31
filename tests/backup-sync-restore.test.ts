import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {clearSyncProfileDirty, getSyncDirtyToken, markSyncProfileDirty} from '../js/sync-dirty-state.js';

import { clearProfileDeltaSnapshots } from '../js/sync-delta-snapshot.js';
import {
  getPendingBackupRestoreProfileIds,
  prepareRestoredProfilesForSync, markBackupRestorePending, republishPendingBackupRestore,
  resetBackupRestoreRetryBudget, SYNC_BACKUP_RESTORE_PENDING_KEY,
  stageBackupRestorePending, fingerprintBackupRestoreOwner,
} from '../js/sync-backup-restore-state.js';

describe('backup restore sync handoff', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  function publisher(profiles: Array<{id: string; tags?: string[]}>) {
    return {runtime: {}, ownerId: 'synthetic-owner', isCurrent: () => true, getProfiles: () => profiles,
      pushProfilesById: vi.fn(async (ids: readonly string[]) => {
        for (const id of ids) clearSyncProfileDirty(id, getSyncDirtyToken(id));
        return {succeeded: 1, failed: 0, skipped: 0};
      })};
  }

  it('binds a staged journal to the intended identity across old tabs and partial progress', async () => {
    const mnemonic = 'synthetic intended recovery identity';
    const ownerFingerprint = await fingerprintBackupRestoreOwner(mnemonic);
    stageBackupRestorePending(['first', 'second'], {ownerFingerprint});
    expect(localStorage.getItem(SYNC_BACKUP_RESTORE_PENDING_KEY)).not.toContain(mnemonic);
    const old = {...publisher([{id: 'first'}, {id: 'second'}]), ownerMnemonic: 'synthetic retiring identity'};
    expect((await republishPendingBackupRestore(old)).reason).toBe('identity-changed');
    expect(old.pushProfilesById).not.toHaveBeenCalled();
    expect(getPendingBackupRestoreProfileIds()).toEqual(['first', 'second']);
    const next = {...publisher([{id: 'first'}]), ownerId: 'new-owner', ownerMnemonic: mnemonic};
    expect((await republishPendingBackupRestore(next)).complete).toBe(false);
    expect(getPendingBackupRestoreProfileIds()).toEqual(['second']);
    expect(JSON.parse(localStorage.getItem(SYNC_BACKUP_RESTORE_PENDING_KEY)!).at(-1).ownerFingerprint).toBe(ownerFingerprint);
    expect((await republishPendingBackupRestore(old)).reason).toBe('identity-changed');
    expect(old.pushProfilesById).not.toHaveBeenCalled();
    next.getProfiles = () => [{id: 'second'}];
    expect((await republishPendingBackupRestore(next)).complete).toBe(true);
    expect(next.pushProfilesById.mock.calls.map(([ids]) => ids)).toEqual([['first'], ['second']]);
  });

  it('normalizes identity fingerprints without retaining recovery words', async () => {
    expect(await fingerprintBackupRestoreOwner('  SYNTHETIC   target\nidentity  ')).toBe(await fingerprintBackupRestoreOwner('synthetic target identity'));
    await expect(fingerprintBackupRestoreOwner('   ')).rejects.toThrow('Sync identity is unavailable');
  });

  it.each(['unavailable', 'malformed', 'ambiguous'] as const)('retains bound recovery when its identity is %s', async kind => {
    const ownerFingerprint = await fingerprintBackupRestoreOwner('synthetic target identity');
    stageBackupRestorePending(['first'], {ownerFingerprint});
    if (kind !== 'unavailable') {
      const raw = JSON.parse(localStorage.getItem(SYNC_BACKUP_RESTORE_PENDING_KEY)!);
      if (kind === 'malformed') raw.at(-1).ownerFingerprint = 'invalid';
      else raw.push({...raw.at(-1)});
      localStorage.setItem(SYNC_BACKUP_RESTORE_PENDING_KEY, JSON.stringify(raw));
    }
    const deps = publisher([{id: 'first'}]);
    expect((await republishPendingBackupRestore(deps)).complete).toBe(false);
    expect(deps.pushProfilesById).not.toHaveBeenCalled();
    expect(getPendingBackupRestoreProfileIds()).toEqual(['first']);
  });

  it('does not roll back a newer journal when a staged owner operation fails', () => {
    markBackupRestorePending(['previous']);
    const staged = stageBackupRestorePending(['candidate']);
    markBackupRestorePending(['newer']);
    const newer = localStorage.getItem(SYNC_BACKUP_RESTORE_PENDING_KEY);
    expect(staged.rollback()).toBe(true);
    expect(localStorage.getItem(SYNC_BACKUP_RESTORE_PENDING_KEY)).toBe(newer);
    expect(getPendingBackupRestoreProfileIds()).toEqual(['newer']);
  });

  it('acknowledges each committed profile while retaining an unavailable recovery', async () => {
    prepareRestoredProfilesForSync({profiles: [{profileId: 'good'}, {profileId: 'demo'}, {profileId: 'missing'}]});
    const deps = publisher([{id: 'good'}, {id: 'demo', tags: ['demo']}, {id: 'missing'}]);
    deps.pushProfilesById.mockImplementation(async ids => {
      if (ids[0] === 'missing') return {succeeded: 0, failed: 0, skipped: 1};
      clearSyncProfileDirty(ids[0], getSyncDirtyToken(ids[0]));
      return {succeeded: 1, failed: 0, skipped: 0};
    });
    for (let i = 0; i < 20; i++) expect((await republishPendingBackupRestore(deps)).complete).toBe(false);
    expect(deps.pushProfilesById.mock.calls.map(([ids]) => ids)).toEqual([['good'], ['missing']]);
    expect(getPendingBackupRestoreProfileIds()).toEqual(['missing']);
    expect(deps.getProfiles()).toEqual([{id: 'good'}, {id: 'demo', tags: ['demo']}, {id: 'missing'}]);
  });

  it('retains a missing profile without publishing another completed profile again', async () => {
    markBackupRestorePending(['good', 'missing']);
    const deps = publisher([{id: 'good'}]);
    await republishPendingBackupRestore(deps); await republishPendingBackupRestore(deps);
    expect(deps.pushProfilesById).toHaveBeenCalledExactlyOnceWith(['good'], {force: true, completeSnapshot: true});
    expect(getPendingBackupRestoreProfileIds()).toEqual(['missing']);
  });

  it.each([false, true])('acknowledges an explicitly deleted absent profile with bound journal %s', async bound => {
    const mnemonic = 'synthetic intended recovery identity';
    if (bound) stageBackupRestorePending(['deleted'], {ownerFingerprint: await fingerprintBackupRestoreOwner(mnemonic)});
    else markBackupRestorePending(['deleted']);
    markSyncProfileDirty('deleted');
    const {markLocalProfileDeleteIntent} = await import('../js/profile-sync-policy.js');
    expect(markLocalProfileDeleteIntent('deleted')).toBe(true);
    const deps = {...publisher([]), ownerMnemonic: mnemonic};
    expect((await republishPendingBackupRestore(deps)).complete).toBe(true);
    expect(getPendingBackupRestoreProfileIds()).toEqual([]);
    expect(getSyncDirtyToken('deleted')).toBeNull();
    expect(deps.pushProfilesById).not.toHaveBeenCalled();
    expect(localStorage.getItem('labcharts-profile-delete-intent-deleted')).not.toBeNull();
  });

  it('reads old array journals and keeps new journals readable by old tabs', async () => {
    localStorage.setItem(SYNC_BACKUP_RESTORE_PENDING_KEY, JSON.stringify(['first', 'second']));
    expect((await republishPendingBackupRestore(publisher([{id: 'first'}, {id: 'second'}]))).complete).toBe(true);
    expect(getPendingBackupRestoreProfileIds()).toEqual([]);
    markBackupRestorePending(['first', 'second']);
    const oldReader = JSON.parse(localStorage.getItem(SYNC_BACKUP_RESTORE_PENDING_KEY)!).filter((id: unknown) => typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id));
    expect(oldReader).toEqual(['first', 'second']);
  });

  it('does not re-upload an acknowledged commit when its progress cannot be stored', async () => {
    markBackupRestorePending(['first', 'second']);
    const deps = publisher([{id: 'first'}, {id: 'second'}]);
    const write = localStorage.setItem.bind(localStorage);
    const failed = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === SYNC_BACKUP_RESTORE_PENDING_KEY) throw new Error('Synthetic journal write failure');
      write(key, value);
    });
    for (let i = 0; i < 10; i++) expect((await republishPendingBackupRestore(deps)).reason).toBe('progress-unavailable');
    expect(deps.pushProfilesById).toHaveBeenCalledOnce();
    expect(getPendingBackupRestoreProfileIds()).toEqual(['first', 'second']);
    failed.mockRestore();
    expect((await republishPendingBackupRestore(deps)).complete).toBe(true);
    expect(deps.pushProfilesById.mock.calls.map(([ids]) => ids)).toEqual([['first'], ['second']]);
  });

  it.each(['journal', 'owner', 'dirty'] as const)('does not acknowledge a newer %s after an old push completes', async kind => {
    prepareRestoredProfilesForSync({profiles: [{profileId: 'first'}]});
    const deps = publisher([{id: 'first'}]); let current = true;
    deps.isCurrent = () => current;
    let finish!: (value: {succeeded: number; failed: number; skipped: number}) => void;
    deps.pushProfilesById.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = republishPendingBackupRestore(deps);
    if (kind === 'journal') prepareRestoredProfilesForSync({profiles: [{profileId: 'first'}]});
    if (kind === 'owner') current = false;
    if (kind === 'dirty') markSyncProfileDirty('first');
    finish({succeeded: 1, failed: 0, skipped: 0});
    expect((await pending).complete).toBe(false);
    expect(getPendingBackupRestoreProfileIds()).toEqual(['first']);
    current = true;
    if (kind === 'owner') deps.ownerId = 'new-synthetic-owner';
    expect((await republishPendingBackupRestore(deps)).complete).toBe(true);
    expect(deps.pushProfilesById).toHaveBeenCalledTimes(2);
  });

  it('bounds automatic failures and allows explicit retry or a newer local edit', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-31T00:00:00Z'));
    prepareRestoredProfilesForSync({profiles: [{profileId: 'first'}]});
    const deps = publisher([{id: 'first'}]); deps.pushProfilesById.mockResolvedValue({succeeded: 0, failed: 1, skipped: 0});
    for (let i = 0; i < 10; i++) { await republishPendingBackupRestore(deps); vi.advanceTimersByTime(10_000); }
    expect(deps.pushProfilesById).toHaveBeenCalledTimes(3);
    expect(getPendingBackupRestoreProfileIds()).toEqual(['first']);
    markSyncProfileDirty('first'); await republishPendingBackupRestore(deps);
    expect(deps.pushProfilesById).toHaveBeenCalledTimes(4);
    resetBackupRestoreRetryBudget(); deps.pushProfilesById.mockResolvedValue({succeeded: 1, failed: 0, skipped: 0});
    expect((await republishPendingBackupRestore(deps)).complete).toBe(true);
    expect(deps.pushProfilesById).toHaveBeenCalledTimes(5);
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
