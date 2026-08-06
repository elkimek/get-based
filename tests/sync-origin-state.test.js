import { afterEach, describe, expect, it } from 'vitest';

import {
  clearLocalSyncCommits, isLocalSyncCommitEcho, noteLocalSyncCommit,
} from '../js/sync-origin-state.js';

afterEach(() => clearLocalSyncCommits());

describe('local sync commit origins', () => {
  it('matches recent commits only for the source profile and keeps burst history', () => {
    expect(noteLocalSyncCommit('profile-a', '2026-08-06T12:00:00.000Z')).toBe(true);
    expect(noteLocalSyncCommit('profile-a', '2026-08-06T12:00:01.000Z')).toBe(true);

    expect(isLocalSyncCommitEcho('profile-a', Date.parse('2026-08-06T12:00:00.000Z'))).toBe(true);
    expect(isLocalSyncCommitEcho('profile-a', Date.parse('2026-08-06T12:00:01.000Z'))).toBe(true);
    expect(isLocalSyncCommitEcho('profile-b', Date.parse('2026-08-06T12:00:01.000Z'))).toBe(false);
    expect(isLocalSyncCommitEcho('profile-a', Date.parse('2026-08-06T12:00:02.000Z'))).toBe(false);
  });

  it('rejects incomplete markers and can be reset', () => {
    expect(noteLocalSyncCommit('', Date.now())).toBe(false);
    expect(noteLocalSyncCommit('profile-a', 'not-a-date')).toBe(false);
    noteLocalSyncCommit('profile-a', Date.now());
    clearLocalSyncCommits();
    expect(isLocalSyncCommitEcho('profile-a', Date.now())).toBe(false);
  });
});
