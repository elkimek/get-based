import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  STORAGE_CATEGORIES,
  classifyCacheName,
  classifyDatabaseName,
  classifyLocalStorageKey,
  compareStorageIntegrityManifests,
  createStorageIntegritySession,
} from '../js/storage-integrity-manifest.js';

function testFingerprint(value) {
  return Promise.resolve(createHash('sha256').update(`test-only-key\u0000${value}`).digest('hex'));
}

function storageSnapshot({ profileValue = 'encrypted-profile-v1', walletValue = 'encrypted-wallet-v1' } = {}) {
  return {
    localStorage: [
      { key: 'labcharts-profile_alpha-imported', value: profileValue },
      { key: 'labcharts-openrouter-key', value: 'sk-user-secret' },
      { key: 'labcharts-sync-enabled', value: 'true' },
      { key: 'labcharts-routstr-key', value: walletValue },
    ],
    indexedDB: [
      {
        name: 'labcharts-blobs',
        stores: [{
          name: 'kv',
          count: 1,
          records: [{ key: 'labcharts-profile_alpha-imported', value: profileValue }],
        }],
      },
      {
        name: 'getbased-cashu',
        stores: [
          { name: 'proofs', count: 2 },
          { name: 'meta', count: 3 },
        ],
      },
    ],
    caches: [
      {
        name: 'labcharts-v1.11.0',
        requests: ['/app', '/js/main.js'],
      },
    ],
  };
}

describe('storage integrity policy', () => {
  it('classifies migration-sensitive and protected surfaces', () => {
    expect(classifyLocalStorageKey('labcharts-profile_alpha-imported'))
      .toBe(STORAGE_CATEGORIES.PROFILE_DATA);
    expect(classifyLocalStorageKey('labcharts-openrouter-key'))
      .toBe(STORAGE_CATEGORIES.CREDENTIALS);
    expect(classifyLocalStorageKey('labcharts-routstr-key'))
      .toBe(STORAGE_CATEGORIES.WALLET);
    expect(classifyLocalStorageKey('labcharts-sync-enabled'))
      .toBe(STORAGE_CATEGORIES.SYNC);
    expect(classifyDatabaseName('getbased-cashu')).toBe(STORAGE_CATEGORIES.WALLET);
    expect(classifyDatabaseName('labcharts-wearables-profile_alpha'))
      .toBe(STORAGE_CATEGORIES.RAW_HEALTH);
    expect(classifyCacheName('labcharts-v1.11.0')).toBe(STORAGE_CATEGORIES.APP_CACHE);
  });
});

describe('privacy-safe storage integrity manifests', () => {
  it('produces stable comparisons without exposing raw identifiers or values', async () => {
    const session = await createStorageIntegritySession({ fingerprint: testFingerprint });
    const first = await session.capture(storageSnapshot());
    const second = await session.capture(storageSnapshot());

    expect(second).toEqual(first);
    expect(compareStorageIntegrityManifests(first, second)).toEqual({
      unchanged: true,
      changes: [],
    });

    const serialized = JSON.stringify(first);
    for (const sensitiveText of [
      'profile_alpha',
      'sk-user-secret',
      'encrypted-profile-v1',
      'encrypted-wallet-v1',
      '/js/main.js',
    ]) {
      expect(serialized).not.toContain(sensitiveText);
    }
  });

  it('allows the migration target while detecting protected-store changes', async () => {
    const session = await createStorageIntegritySession({ fingerprint: testFingerprint });
    const before = await session.capture(storageSnapshot());
    const profileChanged = await session.capture(storageSnapshot({
      profileValue: 'encrypted-profile-v2',
    }));
    const protectedChange = await session.capture(storageSnapshot({
      walletValue: 'encrypted-wallet-v2',
    }));

    expect(compareStorageIntegrityManifests(before, profileChanged, {
      allowedCategories: [STORAGE_CATEGORIES.PROFILE_DATA],
    })).toEqual({ unchanged: true, changes: [] });

    const comparison = compareStorageIntegrityManifests(before, protectedChange, {
      allowedCategories: [STORAGE_CATEGORIES.PROFILE_DATA],
    });
    expect(comparison.unchanged).toBe(false);
    expect(comparison.changes).toHaveLength(1);
    expect(comparison.changes[0].change).toBe('changed');
    expect(JSON.stringify(comparison)).not.toContain('encrypted-wallet-v2');
  });
});
