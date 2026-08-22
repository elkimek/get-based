import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ProfileShareStoreConflictError,
  createSqliteProfileShareStore,
} from '../lib/profile-share-sqlite-store.js';
import { maintainProfileShareStorage } from '../lib/profile-share-service.js';

const cleanups = [];

afterEach(() => {
  while (cleanups.length) cleanups.pop()();
});

function makeStore() {
  const directory = mkdtempSync(join(tmpdir(), 'getbased-profile-share-'));
  const store = createSqliteProfileShareStore({
    databasePath: join(directory, 'shares.sqlite'),
    rateLimitHmacKey: 'test-only-rate-limit-key-that-is-long-enough',
    maxDatabaseBytes: 64 * 1024 * 1024,
  });
  cleanups.push(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  return store;
}

describe('SQLite profile-share object store', () => {
  it('provides atomic create, ordered listing, overwrite, and deletion', async () => {
    const store = makeStore();
    store.check();
    await store.put('profile-shares/v2/share-a.json', '{"value":1}', { allowOverwrite: false });
    await expect(store.put(
      'profile-shares/v2/share-a.json',
      '{"value":2}',
      { allowOverwrite: false },
    )).rejects.toBeInstanceOf(ProfileShareStoreConflictError);
    expect(await store.get('profile-shares/v2/share-a.json')).toBe('{"value":1}');

    await store.put('profile-shares/v2/share-b.json', '{"value":2}', { allowOverwrite: true });
    await store.put('profile-shares/v2/share-b.json', '{"value":3}', { allowOverwrite: true });
    expect(await store.get('profile-shares/v2/share-b.json')).toBe('{"value":3}');

    const firstPage = await store.list({ prefix: 'profile-shares/v2/', limit: 1 });
    expect(firstPage.blobs.map(item => item.pathname)).toEqual(['profile-shares/v2/share-a.json']);
    expect(firstPage.hasMore).toBe(true);
    const secondPage = await store.list({
      prefix: 'profile-shares/v2/',
      cursor: firstPage.cursor,
      limit: 1,
    });
    expect(secondPage.blobs.map(item => item.pathname)).toEqual(['profile-shares/v2/share-b.json']);

    await store.delete(['profile-shares/v2/share-a.json', 'profile-shares/v2/share-b.json']);
    expect(await store.get('profile-shares/v2/share-a.json')).toBeNull();
    expect(await store.get('profile-shares/v2/share-b.json')).toBeNull();
  });

  it('uses a keyed identifier and rejects unsafe or oversized objects', async () => {
    const store = makeStore();
    const subject = '192.0.2.45';
    const identifier = await store.hashRateLimitSubject(subject);
    expect(identifier).toMatch(/^[a-f0-9]{64}$/);
    expect(identifier).not.toContain(subject);
    await expect(store.put('../escape', '{}')).rejects.toThrow('Invalid profile-share storage pathname');
    await expect(store.put('profile-shares/v2/large.json', 'x'.repeat((4 * 1024 * 1024) + 1)))
      .rejects.toThrow('too large');
  });

  it('removes expired ciphertext and its expiry marker during maintenance', async () => {
    const store = makeStore();
    const id = 'expiredShareId0123456789';
    const expiresAt = Date.now() - 1_000;
    await store.put(`profile-shares/v2/${id}.json`, JSON.stringify({
      id,
      expiresAt: new Date(expiresAt).toISOString(),
      envelope: { ciphertext: 'synthetic-only' },
    }), { allowOverwrite: false });
    await store.put(`profile-share-expiry/v1/${expiresAt}/${id}.json`, '{}', {
      allowOverwrite: true,
    });

    await maintainProfileShareStorage(store, Date.now() + (2 * 60 * 60 * 1000));

    expect(await store.get(`profile-shares/v2/${id}.json`)).toBeNull();
    expect(await store.get(`profile-share-expiry/v1/${expiresAt}/${id}.json`)).toBeNull();
  });
});
