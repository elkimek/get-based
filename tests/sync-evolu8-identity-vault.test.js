import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';

import {
  EVOLU8_IDENTITY_TOKEN_KEY,
  createEvolu8IdentityVault,
} from '../js/sync-evolu8-identity-vault.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: vi.fn(key => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, value)),
    removeItem: vi.fn(key => values.delete(key)),
    values,
  };
}

describe('Evolu 8 identity vault', () => {
  it('commits and reads an identity without putting its mnemonic in localStorage', async () => {
    const storage = createStorage();
    const vault = createEvolu8IdentityVault({
      storage,
      indexedDb: new IDBFactory(),
      tokenFactory: () => 'commit-token',
    });

    await vault.write({ ownerId: 'owner-1', mnemonic: 'alpha beta gamma' });

    await expect(vault.read()).resolves.toEqual({
      ownerId: 'owner-1',
      mnemonic: 'alpha beta gamma',
    });
    expect(storage.values.get(EVOLU8_IDENTITY_TOKEN_KEY)).toBe('commit-token');
    expect(JSON.stringify([...storage.values])).not.toContain('alpha beta gamma');
  });

  it('invalidates synchronously before deleting the IndexedDB record', async () => {
    const storage = createStorage();
    const vault = createEvolu8IdentityVault({
      storage,
      indexedDb: new IDBFactory(),
      tokenFactory: () => 'commit-token',
    });
    await vault.write({ ownerId: 'owner-1', mnemonic: 'alpha beta gamma' });

    const deletion = vault.invalidate();
    expect(storage.getItem(EVOLU8_IDENTITY_TOKEN_KEY)).toBeNull();
    await expect(vault.read()).resolves.toBeNull();
    await deletion;
  });

  it('rejects a commit when localStorage does not retain its token', async () => {
    const storage = createStorage();
    storage.setItem.mockImplementation(() => {});
    const vault = createEvolu8IdentityVault({
      storage,
      indexedDb: new IDBFactory(),
      tokenFactory: () => 'lost-token',
    });

    await expect(vault.write({ ownerId: 'owner-1', mnemonic: 'alpha beta gamma' }))
      .rejects.toThrow('commit was not retained');
    await expect(vault.read()).resolves.toBeNull();
  });

  it('fails closed when invalidation cannot be retained', () => {
    const storage = createStorage();
    storage.values.set(EVOLU8_IDENTITY_TOKEN_KEY, 'old-token');
    storage.removeItem.mockImplementation(() => {});
    const vault = createEvolu8IdentityVault({ storage, indexedDb: new IDBFactory() });

    expect(() => vault.invalidate()).toThrow('invalidation was not retained');
  });

  it('ignores missing browser storage and mismatched commit tokens', async () => {
    const storage = createStorage();
    const indexedDb = new IDBFactory();
    const vault = createEvolu8IdentityVault({
      storage,
      indexedDb,
      tokenFactory: () => 'first-token',
    });
    await vault.write({ ownerId: 'owner-1', mnemonic: 'alpha beta gamma' });
    storage.values.set(EVOLU8_IDENTITY_TOKEN_KEY, 'different-token');

    await expect(vault.read()).resolves.toBeNull();
    await expect(createEvolu8IdentityVault({ storage, indexedDb: null }).read())
      .resolves.toBeNull();
  });
});
