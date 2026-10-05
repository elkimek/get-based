import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiProviderStorageRuntimeDeps } from '../js/api-provider-storage-runtime.js';
import { clearKeyCache, getCachedKey } from '../js/crypto-key-cache.js';
import { _setTestSessionKey, decryptKeyCache, encryptedGetItem, encryptedSetCredentialItem } from '../js/crypto.js';
import { encodeMergedRoutstrSessions, getArchivedRoutstrSessionKeys, getRoutstrSessionKey, parseRoutstrSessions, ROUTSTR_SESSIONS_KEY, saveRoutstrSessionKey } from '../js/routstr-session.js';
import { collectAISettings } from '../js/sync-payload-collectors.js';

const NODE = 'https://history-node.test';
const OTHER = 'https://other-history-node.test';
let previousStorage: ReturnType<typeof configureApiProviderStorageRuntimeDeps>;
const raw = (key: string, updatedAt: number, archivedKeys?: unknown) => JSON.stringify({ version: 1, sessions: {
  [NODE]: { key, updatedAt, ...(archivedKeys === undefined ? {} : { archivedKeys }) },
} });

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); clearKeyCache();
  localStorage.setItem('labcharts-routstr-node', NODE);
  previousStorage = configureApiProviderStorageRuntimeDeps({ encryptedSetItem: encryptedSetCredentialItem });
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Unexpected network request'); }));
  vi.stubGlobal('__WEARABLES_TEST', true);
});
afterEach(async () => {
  await _setTestSessionKey(null);
  configureApiProviderStorageRuntimeDeps(previousStorage);
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  localStorage.clear(); sessionStorage.clear(); clearKeyCache();
});

async function persisted() {
  return parseRoutstrSessions(await encryptedGetItem(ROUTSTR_SESSIONS_KEY), NODE);
}

describe('explicit Routstr session history', () => {
  it('keeps ordinary replacements and clears free of new history', async () => {
    await saveRoutstrSessionKey('sk-original', NODE);
    await saveRoutstrSessionKey('sk-replacement', NODE);
    await saveRoutstrSessionKey('', NODE);
    expect((await persisted())[NODE]).toEqual({ key: '', updatedAt: expect.any(Number) });
    expect(getArchivedRoutstrSessionKeys()).toEqual([]);
  });
  it('archives an explicit reset and preserves it when a new active account is created', async () => {
    await saveRoutstrSessionKey('sk-original', NODE);
    await saveRoutstrSessionKey('', NODE, 'sk-original', true);
    expect(getRoutstrSessionKey()).toBe('');
    expect(getArchivedRoutstrSessionKeys()).toEqual(['sk-original']);
    await saveRoutstrSessionKey('sk-new', NODE, '');
    expect((await persisted())[NODE]).toEqual({ key: 'sk-new', updatedAt: expect.any(Number), archivedKeys: ['sk-original'] });
    expect(getRoutstrSessionKey()).toBe('sk-new');
  });
  it('deduplicates history and removes a key restored as the active account', async () => {
    await saveRoutstrSessionKey('sk-a', NODE);
    await saveRoutstrSessionKey('sk-b', NODE, 'sk-a', true);
    await saveRoutstrSessionKey('sk-a', NODE, 'sk-b', true);
    await saveRoutstrSessionKey('sk-a', NODE, 'sk-a', true);
    expect(getArchivedRoutstrSessionKeys()).toEqual(['sk-b']);
  });
  it('does not create history when explicitly resetting an empty session', async () => {
    await saveRoutstrSessionKey('', NODE, '', true);
    expect((await persisted())[NODE]).not.toHaveProperty('archivedKeys');
  });
  it('isolates archives by node and returns a fresh cache projection', async () => {
    await saveRoutstrSessionKey('sk-a', NODE);
    await saveRoutstrSessionKey('sk-b', OTHER);
    await saveRoutstrSessionKey('', NODE, 'sk-a', true);
    const history = getArchivedRoutstrSessionKeys(`${NODE}/`);
    history.push('sk-not-persisted');
    expect(getArchivedRoutstrSessionKeys()).toEqual(['sk-a']);
    expect(getArchivedRoutstrSessionKeys(OTHER)).toEqual([]);
    expect(getRoutstrSessionKey(OTHER)).toBe('sk-b');
    expect(getArchivedRoutstrSessionKeys('not a public URL')).toEqual([]);
  });
  it('encrypts both active and archived keys and restores them through cache reload and sync collection', async () => {
    localStorage.setItem('labcharts-encryption-enabled', 'true');
    await _setTestSessionKey('SessionHistoryTestPassword1!');
    await saveRoutstrSessionKey('sk-private-old', NODE);
    await saveRoutstrSessionKey('', NODE, 'sk-private-old', true);
    await saveRoutstrSessionKey('sk-private-new', NODE, '');
    const ciphertext = localStorage.getItem(ROUTSTR_SESSIONS_KEY);
    expect(ciphertext).toMatch(/^v1:/);
    expect(ciphertext).not.toContain('sk-private-old');
    expect(ciphertext).not.toContain('sk-private-new');
    clearKeyCache();
    expect(getArchivedRoutstrSessionKeys()).toEqual([]);
    await decryptKeyCache();
    expect(getRoutstrSessionKey()).toBe('sk-private-new');
    expect(getArchivedRoutstrSessionKeys()).toEqual(['sk-private-old']);
    const outbound = await collectAISettings();
    expect(parseRoutstrSessions(outbound[ROUTSTR_SESSIONS_KEY], NODE)[NODE]).toEqual((await persisted())[NODE]);
    expect(await encryptedGetItem('labcharts-routstr-key')).toBe('');
    expect(outbound['labcharts-routstr-key']).toBeNull();
  });
  it.each([true, false])('retains both histories regardless of the LWW input direction (%s)', localIsNewer => {
    const older = raw('sk-older-active', 10, ['sk-old-archive', 'sk-new-active']);
    const newer = raw('sk-new-active', 20, ['cashuAarchived', 'sk-old-archive']);
    const merged = encodeMergedRoutstrSessions(localIsNewer ? newer : older, NODE, localIsNewer ? older : newer, NODE, 0, 0);
    expect(parseRoutstrSessions(merged, NODE)[NODE]).toEqual({ key: 'sk-new-active', updatedAt: 20, archivedKeys: ['cashuAarchived', 'sk-old-archive'] });
  });
  it('retains the incoming-wins tie rule without automatically archiving the losing active key', () => {
    const merged = encodeMergedRoutstrSessions(raw('sk-local', 10, ['sk-a']), NODE, raw('sk-remote', 10, ['sk-b']), NODE, 0, 0);
    expect(parseRoutstrSessions(merged, NODE)[NODE]).toEqual({ key: 'sk-remote', updatedAt: 10, archivedKeys: ['sk-a', 'sk-b'] });
  });
  it('retains history when a newer empty legacy remote record wins', () => {
    const merged = encodeMergedRoutstrSessions(raw('sk-local', 10, ['sk-archived']), NODE, null, NODE, 0, 20);
    expect(parseRoutstrSessions(merged, NODE)[NODE]).toEqual({ key: '', updatedAt: 20, archivedKeys: ['sk-archived'] });
  });
  it.each([null, 'sk-string-not-array', {}, [null, 3, {}, '', 'invalid', 'sk-current']])('ignores invalid archive metadata while keeping the validated active key (%j)', value => {
    expect(parseRoutstrSessions(raw('sk-current', 10, value), NODE)[NODE]).toEqual({ key: 'sk-current', updatedAt: 10 });
  });
  it('validates and deduplicates mixed archive entries without trusting raw JSON types', () => {
    expect(parseRoutstrSessions(raw('sk-current', 10, ['sk-z', false, 'cashuAold', 'sk-z', 'sk-current', 'bad']), NODE)[NODE])
      .toEqual({ key: 'sk-current', updatedAt: 10, archivedKeys: ['cashuAold', 'sk-z'] });
  });
  it('preserves durable credentials and cache on an expected-key mismatch', async () => {
    await saveRoutstrSessionKey('sk-a', NODE);
    await saveRoutstrSessionKey('sk-b', NODE, 'sk-a', true);
    const before = await encryptedGetItem(ROUTSTR_SESSIONS_KEY);
    const cached = getCachedKey(ROUTSTR_SESSIONS_KEY);
    const clock = localStorage.getItem('labcharts-routstr-session-updated-at');
    await expect(saveRoutstrSessionKey('', NODE, 'sk-stale', true)).rejects.toThrow('Node session changed');
    expect(await encryptedGetItem(ROUTSTR_SESSIONS_KEY)).toBe(before);
    expect(getCachedKey(ROUTSTR_SESSIONS_KEY)).toBe(cached);
    expect(localStorage.getItem('labcharts-routstr-session-updated-at')).toBe(clock);
    expect(getArchivedRoutstrSessionKeys()).toEqual(['sk-a']);
  });
  it('keeps the existing same-key expected-key retry exception', async () => {
    await saveRoutstrSessionKey('sk-current', NODE);
    await expect(saveRoutstrSessionKey('sk-current', NODE, 'sk-stale', true)).resolves.toBeUndefined();
    expect(getArchivedRoutstrSessionKeys()).toEqual([]);
  });
  it('publishes the cache only after the encrypted map write completes', async () => {
    await saveRoutstrSessionKey('sk-original', NODE);
    let release: () => void = () => {};
    let entered: () => void = () => {};
    const writing = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    configureApiProviderStorageRuntimeDeps({ encryptedSetItem: async (key, value) => {
      if (key === ROUTSTR_SESSIONS_KEY) { entered(); await gate; }
      await encryptedSetCredentialItem(key, value);
    } });
    const saving = saveRoutstrSessionKey('', NODE, 'sk-original', true);
    await writing;
    expect(getRoutstrSessionKey()).toBe('sk-original');
    expect(getArchivedRoutstrSessionKeys()).toEqual([]);
    expect((await persisted())[NODE]?.key).toBe('sk-original');
    release(); await saving;
    expect(getArchivedRoutstrSessionKeys()).toEqual(['sk-original']);
  });
  it('keeps cache and durable history intact when the primary write fails, and permits a later retry', async () => {
    await saveRoutstrSessionKey('sk-original', NODE);
    const before = await encryptedGetItem(ROUTSTR_SESSIONS_KEY);
    configureApiProviderStorageRuntimeDeps({ encryptedSetItem: async () => { throw new Error('Credential write failed'); } });
    await expect(saveRoutstrSessionKey('', NODE, 'sk-original', true)).rejects.toThrow('Credential write failed');
    expect(await encryptedGetItem(ROUTSTR_SESSIONS_KEY)).toBe(before);
    expect(getRoutstrSessionKey()).toBe('sk-original');
    expect(getArchivedRoutstrSessionKeys()).toEqual([]);
    configureApiProviderStorageRuntimeDeps({ encryptedSetItem: encryptedSetCredentialItem });
    await saveRoutstrSessionKey('', NODE, 'sk-original', true);
    expect(getArchivedRoutstrSessionKeys()).toEqual(['sk-original']);
  });
});
