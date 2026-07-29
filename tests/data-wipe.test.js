import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { eraseAllLocalAppData } from '../js/data-wipe.js';

const originalIndexedDB = globalThis.indexedDB;
const originalCaches = globalThis.caches;
const originalLocalStorage = globalThis.localStorage;
const originalSessionStorage = globalThis.sessionStorage;

function openDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
}

async function databaseNames() {
  const databases = await indexedDB.databases();
  return databases.map(database => database.name).filter(Boolean).sort();
}

function asyncDeleteRequest(eventName) {
  const request = {};
  queueMicrotask(() => request[eventName]?.());
  return request;
}

describe('eraseAllLocalAppData', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    globalThis.indexedDB = new IDBFactory();
    delete globalThis.caches;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    globalThis.indexedDB = originalIndexedDB;
    if (originalCaches === undefined) delete globalThis.caches;
    else globalThis.caches = originalCaches;
    if (globalThis.localStorage !== originalLocalStorage) {
      globalThis.localStorage = originalLocalStorage;
    }
    if (globalThis.sessionStorage !== originalSessionStorage) {
      globalThis.sessionStorage = originalSessionStorage;
    }
  });

  it('removes every app-owned storage surface while preserving unrelated data', async () => {
    localStorage.setItem('labcharts-active-profile', 'active-profile');
    localStorage.setItem('labcharts-profiles', JSON.stringify([
      { id: 'saved-profile' },
      { id: 42 },
      null,
    ]));
    localStorage.setItem('labcharts-active-profile-imported', 'sensitive');
    localStorage.setItem('labcharts-api-key', 'secret');
    localStorage.setItem('unrelated-setting', 'keep');
    sessionStorage.setItem('labcharts-import-review-draft-v1', 'sensitive');
    sessionStorage.setItem('oura-oauth-pending', 'sensitive');
    sessionStorage.setItem('unrelated-session', 'keep');

    const appDatabases = [
      'labcharts-wearables-default',
      'labcharts-cycle-default',
      'labcharts-wearables-active-profile',
      'labcharts-cycle-active-profile',
      'labcharts-wearables-saved-profile',
      'labcharts-cycle-saved-profile',
      'labcharts-wearables-orphaned-profile',
      'labcharts-cycle-orphaned-profile',
      'labcharts-blobs',
      'labcharts-backups',
      'labcharts-future-store',
      'getbased-cashu',
    ];
    await Promise.all([...appDatabases, 'third-party-database'].map(openDatabase));

    const deleteCache = vi.fn(async () => true);
    globalThis.caches = {
      keys: vi.fn(async () => ['labcharts-app-v1', 'third-party-cache', 'labcharts-runtime-v2']),
      delete: deleteCache,
    };

    await eraseAllLocalAppData();

    expect(localStorage.getItem('labcharts-active-profile')).toBeNull();
    expect(localStorage.getItem('labcharts-profiles')).toBeNull();
    expect(localStorage.getItem('labcharts-active-profile-imported')).toBeNull();
    expect(localStorage.getItem('labcharts-api-key')).toBeNull();
    expect(localStorage.getItem('unrelated-setting')).toBe('keep');
    expect(sessionStorage.getItem('labcharts-import-review-draft-v1')).toBeNull();
    expect(sessionStorage.getItem('oura-oauth-pending')).toBeNull();
    expect(sessionStorage.getItem('unrelated-session')).toBe('keep');
    expect(await databaseNames()).toEqual(['third-party-database']);
    expect(deleteCache.mock.calls.map(([key]) => key).sort()).toEqual([
      'labcharts-app-v1',
      'labcharts-runtime-v2',
    ]);
  });

  it('uses known profile fallbacks when database enumeration is unavailable', async () => {
    localStorage.setItem('labcharts-active-profile', 'active-profile');
    localStorage.setItem('labcharts-profiles', 'v1:encrypted-profile-list');
    localStorage.setItem('labcharts-private', 'remove');

    const deleteDatabase = vi.fn(() => asyncDeleteRequest('onsuccess'));
    globalThis.indexedDB = { deleteDatabase };
    globalThis.caches = { keys: vi.fn(async () => []), delete: vi.fn() };

    await eraseAllLocalAppData();

    const deletedNames = deleteDatabase.mock.calls.map(([name]) => name).sort();
    expect(deletedNames).toEqual([
      'getbased-cashu',
      'labcharts-backups',
      'labcharts-blobs',
      'labcharts-cycle-active-profile',
      'labcharts-cycle-default',
      'labcharts-wearables-active-profile',
      'labcharts-wearables-default',
    ]);
    expect(localStorage.getItem('labcharts-private')).toBeNull();
  });

  it('attempts every surface but rejects blocked and failed deletions', async () => {
    const storageEntries = ['labcharts-first', 'labcharts-second', 'unrelated'];
    const removedKeys = [];
    globalThis.localStorage = {
      getItem: vi.fn(() => { throw new Error('storage read blocked'); }),
      setItem: vi.fn(),
      clear: vi.fn(),
      get length() { return storageEntries.length; },
      key: vi.fn(index => storageEntries[index] ?? null),
      removeItem: vi.fn(key => {
        removedKeys.push(key);
        if (key === 'labcharts-first') throw new Error('storage removal blocked');
      }),
    };

    const deleteDatabase = vi.fn(name => {
      if (name === 'labcharts-blobs') throw new Error('database API blocked');
      if (name.includes('wearables')) return asyncDeleteRequest('onblocked');
      if (name.includes('cycle')) return asyncDeleteRequest('onerror');
      return asyncDeleteRequest('onsuccess');
    });
    globalThis.indexedDB = {
      databases: vi.fn(async () => { throw new Error('database enumeration blocked'); }),
      deleteDatabase,
    };
    globalThis.caches = {
      keys: vi.fn(async () => { throw new Error('cache access blocked'); }),
      delete: vi.fn(),
    };

    await expect(eraseAllLocalAppData()).rejects.toThrow(/erasure was incomplete/);

    expect(removedKeys).toEqual(['labcharts-first', 'labcharts-second']);
    expect(deleteDatabase).toHaveBeenCalledWith('labcharts-wearables-default');
    expect(deleteDatabase).toHaveBeenCalledWith('labcharts-cycle-default');
    expect(deleteDatabase).toHaveBeenCalledWith('labcharts-blobs');
    expect(deleteDatabase).toHaveBeenCalledWith('getbased-cashu');
    expect(globalThis.caches.delete).not.toHaveBeenCalled();
  });

  it('fails closed when an available browser storage API is malformed', async () => {
    globalThis.localStorage = {
      getItem: vi.fn(() => '{not-json'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      get length() { throw new Error('storage enumeration blocked'); },
      key: vi.fn(),
    };
    delete globalThis.indexedDB;
    globalThis.caches = {};

    await expect(eraseAllLocalAppData()).rejects.toThrow(/erasure was incomplete/);

    expect(globalThis.localStorage.removeItem).not.toHaveBeenCalled();
  });
});
