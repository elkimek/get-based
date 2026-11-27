import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';

import { _setTestSessionKey, encryptObject } from '../js/crypto.js';
import {
  EVOLU8_IDENTITY_TOKEN_KEY,
  createEvolu8IdentityVault as createVault,
} from '../js/sync-evolu8-identity-vault.js';

function createEvolu8IdentityVault(options: Parameters<typeof createVault>[0]) {
  return createVault({lockManager:{request:(_name,operation)=>operation()},...options});
}

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string): unknown => values.set(key, value)),
    removeItem: vi.fn((key: string): unknown => values.delete(key)),
    values,
  };
}

interface IdentityRecord {
  version: number;
  token: string;
  ownerId: string;
  mnemonic?: string;
  envelope?: unknown;
}

function accessIdentityRecord(indexedDb: IDBFactory, replacement?: IdentityRecord) {
  return new Promise<IdentityRecord>((resolve, reject) => {
    const open = indexedDb.open('getbased-evolu8-identity', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction('identity', replacement ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('identity');
      const request = replacement ? store.put(replacement, 'app-owner') : store.get('app-owner');
      transaction.oncomplete = () => {
        database.close();
        resolve(replacement ?? request.result as IdentityRecord);
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error);
      };
    };
  });
}

function protectionFixture() {
  const indexedDb = new IDBFactory();
  const storage = createStorage();
  const record = { version: 1, token: 'fixture-token', ownerId: 'fixture-owner' };
  const identity = { ownerId: record.ownerId, mnemonic: 'alpha beta gamma' };
  const vault = createEvolu8IdentityVault({ storage, indexedDb, tokenFactory: () => record.token });
  return { indexedDb, storage, record, identity, vault };
}

async function withPassphraseProtection(check: () => Promise<void>) {
  const testWindow = window as Window & { __WEARABLES_TEST?: boolean };
  testWindow.__WEARABLES_TEST = true;
  const enabledKey = 'labcharts-encryption-enabled';
  const previous = localStorage.getItem(enabledKey);
  localStorage.setItem(enabledKey, 'true');
  try {
    await _setTestSessionKey('Fictional vault passphrase');
    await check();
  } finally {
    await _setTestSessionKey(null);
    delete testWindow.__WEARABLES_TEST;
    if (previous === null) localStorage.removeItem(enabledKey);
    else localStorage.setItem(enabledKey, previous);
  }
}

describe('Evolu 8 identity vault', () => {
  it('migrates a legacy mnemonic into a device-protected record on first read', async () => {
    const { indexedDb, storage, record, identity, vault } = protectionFixture();
    await vault.write(identity);
    await accessIdentityRecord(indexedDb, { ...record, mnemonic: identity.mnemonic });
    await expect(vault.read()).resolves.toEqual(identity);

    const protectedRecord = await accessIdentityRecord(indexedDb);
    expect(storage.getItem(EVOLU8_IDENTITY_TOKEN_KEY)).toBe(record.token);
    expect(protectedRecord).toEqual({ ...record, envelope: expect.stringMatching(/^d1:/) });
    await vault.reprotect();
    await vault.reprotect('plain');
    expect(await accessIdentityRecord(indexedDb)).toEqual(protectedRecord);
  });

  it('rewraps the same identity as encryption is enabled and disabled', async () => {
    const { indexedDb, record, identity, vault } = protectionFixture();
    await vault.write(identity);
    await withPassphraseProtection(async () => {
      await vault.reprotect('encrypted');
      const encrypted = await accessIdentityRecord(indexedDb);
      expect(encrypted).toEqual({ ...record, envelope: expect.objectContaining({ _enc: 'v1' }) });
      await expect(vault.read()).resolves.toEqual(identity);
      await vault.reprotect('encrypted');
      expect(await accessIdentityRecord(indexedDb)).toEqual(encrypted);

      await vault.reprotect('plain');
      expect(await accessIdentityRecord(indexedDb)).toEqual({ ...record, envelope: expect.stringMatching(/^d1:/) });
      await expect(vault.read()).resolves.toEqual(identity);
    });
  });

  it('keeps the encrypted record intact when storage locks', async () => {
    const { indexedDb, identity, vault } = protectionFixture();
    await withPassphraseProtection(async () => {
      await vault.write(identity);
      const before = await accessIdentityRecord(indexedDb);
      await _setTestSessionKey(null);
      await expect(vault.read()).rejects.toThrow('could not be unlocked');
      await expect(vault.reprotect('plain')).rejects.toThrow('could not be unlocked');
      await expect(vault.write(identity)).rejects.toThrow('Unlock storage');
      expect(await accessIdentityRecord(indexedDb)).toEqual(before);
    });
  });

  it.each([
    { token: 'previous-token', mnemonic: 'alpha beta gamma' },
    { token: 'fixture-token', mnemonic: null },
  ])('refuses an encrypted identity with invalid internal fields', async invalid => {
    const { indexedDb, record, identity, vault } = protectionFixture();
    await withPassphraseProtection(async () => {
      await vault.write(identity);
      const envelope = await encryptObject(invalid);
      expect(envelope).toMatchObject({ _enc: 'v1' });
      await accessIdentityRecord(indexedDb, { ...record, envelope });
      await expect(vault.read()).rejects.toThrow('could not be unlocked');
    });
  });

  it('leaves records that cannot be verified untouched when switching protection', async () => {
    const { indexedDb, storage, record, identity, vault } = protectionFixture();
    await vault.reprotect();
    await createEvolu8IdentityVault({ storage, indexedDb: null }).reprotect();
    await vault.write(identity);
    const invalid = { ...record, version: 999, mnemonic: identity.mnemonic };
    await accessIdentityRecord(indexedDb, invalid);
    await vault.reprotect('plain');
    expect(await accessIdentityRecord(indexedDb)).toEqual(invalid);
    await expect(vault.read()).rejects.toThrow('could not be verified');
    storage.values.set(EVOLU8_IDENTITY_TOKEN_KEY, 'different-token');
    await vault.reprotect('plain');
    expect(await accessIdentityRecord(indexedDb)).toEqual(invalid);
  });

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

it('revokes the local commit token even when IndexedDB is unavailable', async () => {
  const storage = createStorage();
  storage.values.set(EVOLU8_IDENTITY_TOKEN_KEY, 'previous-owner-token');
  const vault = createEvolu8IdentityVault({storage, indexedDb: null});
  const invalidation = vault.invalidate();
  expect(storage.getItem(EVOLU8_IDENTITY_TOKEN_KEY)).toBeNull();
  expect(storage.removeItem).toHaveBeenCalledWith(EVOLU8_IDENTITY_TOKEN_KEY);
  await expect(invalidation).resolves.toBeUndefined();
  await expect(vault.read()).resolves.toBeNull();
});
