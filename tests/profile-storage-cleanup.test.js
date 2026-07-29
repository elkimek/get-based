// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearProfileStorage,
  configureProfileStorageCleanupDeps,
  listStoredProfileIds,
} from '../js/profile-storage-cleanup.js';

let previousDeps;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  previousDeps = configureProfileStorageCleanupDeps({
    encryptedRemoveItem: async key => {
      localStorage.removeItem(key);
    },
    getBlobKeys: async () => [],
    getDatabaseNames: async () => [],
    deleteWearablesDB: async () => {},
    deleteCycleDB: async () => {},
  });
});

afterEach(() => {
  configureProfileStorageCleanupDeps(previousDeps);
  localStorage.clear();
  sessionStorage.clear();
});

describe('profile storage cleanup', () => {
  it('awaits dedicated database deletion and removes every profile-scoped key', async () => {
    const events = [];
    const encryptedRemoveItem = vi.fn(async key => {
      await Promise.resolve();
      events.push(`blob:${key}`);
      localStorage.removeItem(key);
    });
    const deleteWearablesDB = vi.fn(async profileId => {
      await Promise.resolve();
      events.push(`wearables:${profileId}`);
    });
    const deleteCycleDB = vi.fn(async profileId => {
      await Promise.resolve();
      events.push(`cycle:${profileId}`);
    });
    configureProfileStorageCleanupDeps({
      encryptedRemoveItem,
      deleteWearablesDB,
      deleteCycleDB,
    });

    const profileId = 'target-profile';
    const targetKeys = [
      `labcharts-${profileId}-imported`,
      `labcharts-${profileId}-imported-corrupt`,
      `labcharts-${profileId}-units`,
      `labcharts-${profileId}-showAltUnits`,
      `labcharts-${profileId}-chat-threads`,
      `labcharts-${profileId}-chat-t_orphan`,
      `labcharts-${profileId}-ai-ctx-summary`,
      `labcharts-${profileId}-delta-last-sync`,
      `labcharts-${profileId}-sync-ts`,
      `labcharts-onboard-provider-skipped-${profileId}`,
      `labcharts-onboard-extras-done-${profileId}`,
      `labcharts-onboard-context-cards-skipped-${profileId}`,
      `labcharts-onboard-context-cards-done-${profileId}`,
      `labcharts-chat-nudge-dismissed-${profileId}`,
      `labcharts-wearable-stub-dismissed-${profileId}`,
      `labcharts-tombstone-pending-${profileId}`,
    ];
    for (const key of targetKeys) localStorage.setItem(key, 'private');
    localStorage.setItem('labcharts-other-profile-chat-t_keep', 'keep');
    sessionStorage.setItem(`chat-onboard-intro-${profileId}`, 'private');
    sessionStorage.setItem('chat-onboard-intro-other-profile', 'keep');

    await clearProfileStorage(profileId);

    expect(deleteWearablesDB).toHaveBeenCalledWith(profileId);
    expect(deleteCycleDB).toHaveBeenCalledWith(profileId);
    expect(encryptedRemoveItem.mock.calls.map(([key]) => key)).toEqual([
      `labcharts-${profileId}-imported`,
      `labcharts-${profileId}-imported-corrupt`,
    ]);
    expect(events.slice(0, 2).sort()).toEqual([
      `cycle:${profileId}`,
      `wearables:${profileId}`,
    ]);
    for (const key of targetKeys) expect(localStorage.getItem(key), key).toBeNull();
    expect(sessionStorage.getItem(`chat-onboard-intro-${profileId}`)).toBeNull();
    expect(localStorage.getItem('labcharts-other-profile-chat-t_keep')).toBe('keep');
    expect(sessionStorage.getItem('chat-onboard-intro-other-profile')).toBe('keep');
  });

  it('keeps canonical local data when a dedicated database deletion is blocked', async () => {
    const encryptedRemoveItem = vi.fn();
    configureProfileStorageCleanupDeps({
      encryptedRemoveItem,
      deleteWearablesDB: async () => {
        throw new Error('blocked by another tab');
      },
      deleteCycleDB: async () => {},
    });
    localStorage.setItem('labcharts-blocked-imported', 'keep-until-retry');
    localStorage.setItem('labcharts-blocked-units', 'US');

    await expect(clearProfileStorage('blocked')).rejects.toThrow('blocked by another tab');

    expect(encryptedRemoveItem).not.toHaveBeenCalled();
    expect(localStorage.getItem('labcharts-blocked-imported')).toBe('keep-until-retry');
    expect(localStorage.getItem('labcharts-blocked-units')).toBe('US');
  });

  it('keeps local keys and rejects when canonical blob deletion fails', async () => {
    const encryptedRemoveItem = vi.fn(async (_key, options) => {
      expect(options).toEqual({ throwOnBlobError: true });
      throw new Error('blob deletion failed');
    });
    configureProfileStorageCleanupDeps({ encryptedRemoveItem });
    localStorage.setItem('labcharts-blob-failure-imported', 'keep-until-retry');
    localStorage.setItem('labcharts-blob-failure-chat-t_orphan', 'keep-until-retry');

    await expect(clearProfileStorage('blob-failure')).rejects.toThrow('blob deletion failed');

    expect(localStorage.getItem('labcharts-blob-failure-imported')).toBe('keep-until-retry');
    expect(localStorage.getItem('labcharts-blob-failure-chat-t_orphan')).toBe('keep-until-retry');
  });

  it('discovers orphaned imported blobs without accepting malformed IDs', async () => {
    configureProfileStorageCleanupDeps({
      getBlobKeys: async () => [
        'labcharts-idb-orphan-imported-corrupt',
        'labcharts-idb-regular-imported',
        'labcharts-invalid.profile-imported',
        'third-party-imported',
      ],
      getDatabaseNames: async () => [
        'labcharts-wearables-wearable-orphan',
        'labcharts-cycle-cycle-orphan',
        'labcharts-backups',
        'third-party-database',
      ],
    });
    localStorage.setItem('labcharts-local-orphan-imported', '{}');
    localStorage.setItem('labcharts-local-corrupt-imported-corrupt', '{}');
    localStorage.setItem('labcharts-not-an-imported-profile-units', 'US');

    await expect(listStoredProfileIds(['listed', 'bad.profile', '', 42])).resolves.toEqual([
      'listed',
      'local-orphan',
      'local-corrupt',
      'idb-orphan',
      'idb-regular',
      'wearable-orphan',
      'cycle-orphan',
    ]);
  });

  it('rejects invalid profile IDs before touching storage', async () => {
    await expect(clearProfileStorage('../other')).rejects.toThrow('Invalid profile id');
  });

  it('surfaces orphan-discovery failures instead of falsely reporting a complete wipe', async () => {
    configureProfileStorageCleanupDeps({
      getBlobKeys: async () => {
        throw new Error('blob enumeration failed');
      },
    });

    await expect(listStoredProfileIds(['listed'])).rejects.toThrow('blob enumeration failed');
  });
});
