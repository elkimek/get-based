import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getCustomApiKey, getCustomApiUrl, saveCustomApiConnection } from '../js/api-provider-storage.js';
import { configureApiProviderStorageRuntimeDeps } from '../js/api-provider-storage-runtime.js';
import { clearKeyCache, updateKeyCache } from '../js/crypto-key-cache.js';
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
beforeEach(() => { localStorage.clear(); clearKeyCache(); localStorage.setItem('labcharts-custom-url','https://old.test'); updateKeyCache('labcharts-custom-key','OLD'); });
afterEach(() => { vi.restoreAllMocks(); clearKeyCache(); localStorage.clear(); });
it('publishes endpoint and key together only after encrypted persistence succeeds', async () => {
  const write = deferred(); const previous = configureApiProviderStorageRuntimeDeps({ encryptedSetItem: vi.fn(() => write.promise) });
  try { const pending = saveCustomApiConnection('https://new.test','NEW'); await Promise.resolve(); expect(getCustomApiUrl()).toBe('https://old.test'); expect(getCustomApiKey()).toBe('OLD'); write.resolve(); await pending; expect(getCustomApiUrl()).toBe('https://new.test'); expect(getCustomApiKey()).toBe('NEW'); }
  finally { configureApiProviderStorageRuntimeDeps(previous); }
});
it('does not change endpoint, cache or model metadata after a failed encrypted save/removal', async () => {
  const previous = configureApiProviderStorageRuntimeDeps({ encryptedSetItem: vi.fn(async () => { throw new Error('write failed'); }) }); localStorage.setItem('labcharts-custom-models','KEEP');
  try { await expect(saveCustomApiConnection('https://new.test','NEW')).rejects.toThrow('write failed'); await expect(saveCustomApiConnection('','')).rejects.toThrow('write failed'); expect(getCustomApiUrl()).toBe('https://old.test'); expect(getCustomApiKey()).toBe('OLD'); expect(localStorage.getItem('labcharts-custom-models')).toBe('KEEP'); }
  finally { configureApiProviderStorageRuntimeDeps(previous); }
});
it('clears connection, model and vision metadata only after durable credential removal', async () => {
  const previous = configureApiProviderStorageRuntimeDeps({ encryptedSetItem: vi.fn(async () => {}) }); for (const key of ['model','models','vision-models']) localStorage.setItem('labcharts-custom-'+key,'KEEP');
  try { await saveCustomApiConnection('',''); expect(getCustomApiUrl()).toBe(''); expect(getCustomApiKey()).toBe(''); for (const key of ['url','model','models','vision-models']) expect(localStorage.getItem('labcharts-custom-'+key)).toBeNull(); }
  finally { configureApiProviderStorageRuntimeDeps(previous); }
});
it('serializes connection writes and rolls back credential persistence if endpoint publication fails', async () => {
  const writes = vi.fn(async (_name: string, _value: unknown) => {}); const previous = configureApiProviderStorageRuntimeDeps({ encryptedSetItem: writes });
  const savedSet = localStorage.setItem.bind(localStorage); vi.spyOn(localStorage,'setItem').mockImplementation((name, value) => { if (name === 'labcharts-custom-url') throw new Error('quota'); savedSet(name,value); });
  try { await expect(saveCustomApiConnection('https://new.test','NEW')).rejects.toThrow('quota'); expect(writes.mock.calls.map(call => call[1])).toEqual(['NEW','OLD']); expect(getCustomApiKey()).toBe('OLD'); expect(getCustomApiUrl()).toBe('https://old.test'); }
  finally { configureApiProviderStorageRuntimeDeps(previous); }
});

it('invalidates old endpoint capabilities while preserving the user selected model', async () => {
  const previous = configureApiProviderStorageRuntimeDeps({ encryptedSetItem: vi.fn(async () => {}) });
  for (const key of ['model','models','vision-models']) localStorage.setItem('labcharts-custom-'+key,'KEEP');
  try { await saveCustomApiConnection('https://new.test','NEW'); expect(localStorage.getItem('labcharts-custom-model')).toBe('KEEP'); expect(localStorage.getItem('labcharts-custom-models')).toBeNull(); expect(localStorage.getItem('labcharts-custom-vision-models')).toBeNull(); }
  finally { configureApiProviderStorageRuntimeDeps(previous); }
});
