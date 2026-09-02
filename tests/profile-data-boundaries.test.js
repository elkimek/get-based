// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createDefaultProfileData,
  getProfiles,
  initProfilesCache,
  migrateProfileData,
} from '../js/profile.js';
import { localHasRowsRemoteLacks, mergeImportedData } from '../js/data-merge.js';
import { mergeArrayRowsIntoImported } from '../js/sync-delta-array-merge.js';
import { configureSyncDelta } from '../js/sync-delta.js';
import { mergePulledImportedData } from '../js/sync-pull-merge.js';
import { state } from '../js/state.js';

const PROFILES_KEY = 'labcharts-profiles';
let savedProfiles;
let savedStoredProfiles;
let savedCurrentProfile;
let savedImportedData;

beforeEach(() => {
  savedProfiles = state.profiles;
  savedStoredProfiles = localStorage.getItem(PROFILES_KEY);
  savedCurrentProfile = state.currentProfile;
  savedImportedData = state.importedData;
});

afterEach(() => {
  configureSyncDelta({
    getEvolu: () => null,
    getItemRowQuery: () => null,
  });
  state.profiles = savedProfiles;
  state.currentProfile = savedCurrentProfile;
  state.importedData = savedImportedData;
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

  it('upgrades therapy records additively without rewriting health history', () => {
    const data = createDefaultProfileData();
    data.supplements = [{
      name: 'Legacy medication',
      type: 'medication',
      startDate: '2025-01-01',
      endDate: '2025-02-01',
      dosage: 'original directions',
      ingredients: [{ name: 'Active', amount: 'unstructured amount', extra: 'keep' }],
      futureClientField: { keep: true },
    }];

    const migrated = migrateProfileData(data);
    const firstPass = structuredClone(migrated.supplements[0]);
    migrateProfileData(data);

    expect(migrated.supplements[0]).toEqual(firstPass);
    expect(migrated.supplements[0]).toMatchObject({
      id: expect.stringMatching(/^s_/),
      schemaVersion: 2,
      dosage: 'original directions',
      ingredients: [{ amount: 'unstructured amount', extra: 'keep' }],
      futureClientField: { keep: true },
    });
  });

  it('reconciles a dismissed proposal to applied when its idempotent session exists', () => {
    const data = createDefaultProfileData();
    data.agentProposals = [{
      id: 'proposal_cross_device',
      actionId: 'sun.session.log',
      status: 'dismissed',
      updatedAt: '2026-09-01T10:40:00.000Z',
    }];
    data.sunSessions = [{
      id: 'sun_cross_device',
      startedAt: 1,
      endedAt: 2,
      createdBy: {
        type: 'agent',
        actionId: 'sun.session.log',
        idempotencyKey: 'proposal_cross_device',
      },
    }];

    const migrated = migrateProfileData(data);
    expect(migrated.agentProposals[0]).toMatchObject({
      id: 'proposal_cross_device',
      status: 'applied',
    });

    const firstPass = structuredClone(migrated.agentProposals);
    migrateProfileData(data);
    expect(migrated.agentProposals).toEqual(firstPass);
  });

  it('keeps terminal proposal status when a blob contains a newer pending copy', () => {
    for (const status of ['dismissed', 'applied']) {
      const id = `proposal_blob_${status}`;
      const local = {
        agentProposals: [{ id, status, updatedAt: '2026-09-02T10:40:00.000Z' }],
      };
      const remote = {
        agentProposals: [{ id, status: 'pending', updatedAt: '2026-09-02T11:10:00.000Z' }],
      };

      const merged = mergeImportedData(local, remote);

      expect(merged.agentProposals[0].status).toBe(status);
      expect(localHasRowsRemoteLacks(local, remote)).toBe(true);
    }
  });

  it('keeps terminal proposal status when a row contains a newer pending copy', async () => {
    for (const status of ['dismissed', 'applied']) {
      const id = `proposal_row_${status}`;
      const importedData = {
        agentProposals: [{ id, status, updatedAt: '2026-09-02T10:40:00.000Z' }],
      };

      await mergeArrayRowsIntoImported(importedData, 'agentProposals', [{
        itemId: id,
        isDeleted: 0,
        syncedAt: '2026-09-02T11:11:00.000Z',
        payload: JSON.stringify({ id, status: 'pending', updatedAt: '2026-09-02T11:10:00.000Z' }),
      }]);

      expect(importedData.agentProposals[0].status).toBe(status);
    }
  });

  it('keeps the strongest status among duplicate remote rows in one pull', async () => {
    const id = 'proposal_duplicate_rows';
    const importedData = { agentProposals: [] };

    await mergeArrayRowsIntoImported(importedData, 'agentProposals', [
      {
        itemId: id,
        isDeleted: 0,
        syncedAt: '2026-09-02T10:41:00.000Z',
        payload: JSON.stringify({ id, status: 'applied', updatedAt: '2026-09-02T10:40:00.000Z' }),
      },
      {
        itemId: id,
        isDeleted: 0,
        syncedAt: '2026-09-02T11:11:00.000Z',
        payload: JSON.stringify({ id, status: 'pending', updatedAt: '2026-09-02T11:10:00.000Z' }),
      },
    ]);

    expect(importedData.agentProposals).toEqual([
      expect.objectContaining({ id, status: 'applied' }),
    ]);
  });

  it('uses terminal timestamps to merge equal-status proposal rows', async () => {
    for (const status of ['applied', 'dismissed']) {
      const id = `proposal_equal_status_row_${status}`;
      const terminalField = status === 'applied' ? 'appliedAt' : 'dismissedAt';
      const importedData = {
        agentProposals: [{
          id,
          status,
          issuedAt: '2026-09-02T09:00:00.000Z',
          [terminalField]: '2026-09-02T10:00:00.000Z',
          tag: 'older',
        }],
      };

      await mergeArrayRowsIntoImported(importedData, 'agentProposals', [{
        itemId: id,
        isDeleted: 0,
        syncedAt: '2026-09-02T11:01:00.000Z',
        payload: JSON.stringify({
          id,
          status,
          issuedAt: '2026-09-02T09:00:00.000Z',
          [terminalField]: '2026-09-02T11:00:00.000Z',
          tag: 'newer',
        }),
      }]);

      expect(importedData.agentProposals).toEqual([
        expect.objectContaining({ id, status, tag: 'newer' }),
      ]);
    }
  });

  it('deduplicates proposal ids during profile migration using the strongest status', () => {
    const id = 'proposal_migration_duplicate';
    const data = createDefaultProfileData();
    data.agentProposals = [
      { id, status: 'pending', updatedAt: '2026-09-02T11:10:00.000Z' },
      { id, status: 'applied', updatedAt: '2026-09-02T10:40:00.000Z' },
    ];

    const migrated = migrateProfileData(data);

    expect(migrated.agentProposals).toEqual([
      expect.objectContaining({ id, status: 'applied' }),
    ]);
  });

  it('deduplicates proposal ids when only a remote blob exists', () => {
    const id = 'proposal_remote_only_duplicate';
    const merged = mergeImportedData(null, {
      agentProposals: [
        { id, status: 'pending', updatedAt: '2026-09-02T11:10:00.000Z' },
        { id, status: 'applied', updatedAt: '2026-09-02T10:40:00.000Z' },
      ],
    });

    expect(merged.agentProposals).toEqual([
      expect.objectContaining({ id, status: 'applied' }),
    ]);
  });

  it('canonicalizes duplicate proposal ids on the remote-only pull path', async () => {
    const profileId = 'profile_remote_proposal_duplicate';
    const id = 'proposal_remote_pull_duplicate';
    state.currentProfile = profileId;
    state.importedData = null;

    const result = await mergePulledImportedData(profileId, {
      agentProposals: [
        { id, status: 'pending', updatedAt: '2026-09-02T11:10:00.000Z' },
        { id, status: 'applied', updatedAt: '2026-09-02T10:40:00.000Z' },
      ],
    });

    expect(result.merged.agentProposals).toEqual([
      expect.objectContaining({ id, status: 'applied' }),
    ]);
    expect(result.needsRebroadcast).toBe(true);
  });

  it('rebroadcasts remote proposal duplicate repairs in either order when local state is canonical', async () => {
    const profileId = 'profile_local_canonical_remote_duplicate';
    const id = 'proposal_local_canonical_remote_duplicate';
    const applied = {
      id,
      actionId: 'sun.session.log',
      status: 'applied',
      updatedAt: '2026-09-02T10:40:00.000Z',
    };
    const pending = {
      id,
      actionId: 'sun.session.log',
      status: 'pending',
      updatedAt: '2026-09-02T11:10:00.000Z',
    };
    state.currentProfile = profileId;

    for (const remoteProposals of [[pending, applied], [applied, pending]]) {
      state.importedData = { agentProposals: [structuredClone(applied)] };
      const result = await mergePulledImportedData(profileId, {
        agentProposals: structuredClone(remoteProposals),
      });

      expect(result.merged.agentProposals).toEqual([
        expect.objectContaining({ id, status: 'applied' }),
      ]);
      expect(result.needsRebroadcast).toBe(true);
    }
  });

  it('keeps terminal proposals in either remote-only blob order when a newer pending item row overlays them', async () => {
    const profileId = 'profile_remote_proposal_row_duplicate';
    state.currentProfile = profileId;

    for (const terminalStatus of ['dismissed', 'applied']) {
      for (const terminalFirst of [false, true]) {
        const id = `proposal_remote_pull_row_${terminalStatus}_${terminalFirst ? 'first' : 'last'}`;
        const pending = {
          id,
          actionId: 'sun.session.log',
          status: 'pending',
          updatedAt: '2026-09-02T11:10:00.000Z',
        };
        const terminal = {
          id,
          actionId: 'sun.session.log',
          status: terminalStatus,
          updatedAt: '2026-09-02T10:40:00.000Z',
        };
        const pendingRow = {
          profileId,
          arrayName: 'agentProposals',
          itemId: id,
          isDeleted: 0,
          syncedAt: '2026-09-02T12:01:00.000Z',
          payload: JSON.stringify({
            ...pending,
            updatedAt: '2026-09-02T12:00:00.000Z',
          }),
        };
        configureSyncDelta({
          getEvolu: () => ({ getQueryRows: () => [pendingRow] }),
          getItemRowQuery: () => ({}),
        });
        state.importedData = null;

        const result = await mergePulledImportedData(profileId, {
          agentProposals: structuredClone(terminalFirst
            ? [terminal, pending]
            : [pending, terminal]),
        });

        expect(result.merged.agentProposals).toEqual([
          expect.objectContaining({ id, status: terminalStatus }),
        ]);
        expect(result.needsRebroadcast).toBe(true);
      }
    }
  });

  it('uses legacy terminal timestamps to canonicalize remote-only proposal duplicates', async () => {
    const profileId = 'profile_remote_terminal_timestamp';
    state.currentProfile = profileId;

    for (const status of ['applied', 'dismissed']) {
      const id = `proposal_remote_${status}_timestamp`;
      const terminalField = status === 'applied' ? 'appliedAt' : 'dismissedAt';
      const older = {
        id,
        status,
        issuedAt: '2026-09-02T09:00:00.000Z',
        [terminalField]: '2026-09-02T10:00:00.000Z',
        tag: 'older',
      };
      const newer = {
        id,
        status,
        issuedAt: '2026-09-02T09:00:00.000Z',
        [terminalField]: '2026-09-02T11:00:00.000Z',
        tag: 'newer',
      };

      for (const agentProposals of [[older, newer], [newer, older]]) {
        state.importedData = null;
        const result = await mergePulledImportedData(profileId, {
          agentProposals: structuredClone(agentProposals),
        });

        expect(result.merged.agentProposals).toEqual([
          expect.objectContaining({ id, status, tag: 'newer' }),
        ]);
        expect(result.needsRebroadcast).toBe(true);
      }
    }
  });

  it('bounds migrated terminal proposal history', () => {
    const data = createDefaultProfileData();
    data.agentProposals = Array.from({ length: 101 }, (_, index) => ({
      id: `proposal_terminal_${index}`,
      status: 'dismissed',
      updatedAt: new Date(Date.parse('2025-01-01T00:00:00.000Z') + index * 1000).toISOString(),
    }));

    const migrated = migrateProfileData(data);

    expect(migrated.agentProposals).toHaveLength(100);
    expect(migrated.agentProposals.some(({ id }) => id === 'proposal_terminal_100')).toBe(true);
    expect(migrated.agentProposals.some(({ id }) => id === 'proposal_terminal_0')).toBe(false);
  });
});
