import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bumpMetaVersionAndDelete, deleteWearablesDB, getAllDailyRaw, getMeta,
  openWearablesDB, setMeta, setMetaVersioned, upsertDaily, upsertDailyBatch, upsertDailyBatchRaw,
} from '../js/wearables-store.js';

afterEach(() => vi.restoreAllMocks());

describe('wearable storage transaction durability', () => {
  const writes: readonly [string, (profileId: string) => Promise<unknown>][] = [
    ['single daily row', profileId => upsertDaily(profileId, { source: 'oura', date: '2026-09-29', rhr: 54 })],
    ['merged daily batch', profileId => upsertDailyBatch(profileId, [{ source: 'oura', date: '2026-09-29', rhr: 54 }])],
    ['raw restore batch', profileId => upsertDailyBatchRaw(profileId, [{ source: 'manual', date: '2026-09-29', rhr: 54 }])],
    ['metadata', profileId => setMeta(profileId, 'record', { token: 'opaque' })],
    ['guarded metadata', profileId => setMetaVersioned(profileId, 'record', { token: 'opaque' }, 'generation', 0)],
    ['atomic revocation', profileId => bumpMetaVersionAndDelete(profileId, 'record', 'generation', { source: 'oura' })],
  ];

  it.each(writes)('rejects %s when a successful put is followed by transaction abort', async (_name, write) => {
    const profileId = `durability-${crypto.randomUUID()}`;
    const db = await openWearablesDB(profileId);
    await upsertDailyBatchRaw(profileId, [
      { source: 'oura', date: '2026-09-29', rhr: 50 },
      { source: 'manual', date: '2026-09-29', rhr: 48 },
    ]);
    await setMeta(profileId, 'record', { token: 'before' });
    await setMeta(profileId, 'generation', 0);
    const previousRows = await getAllDailyRaw(profileId);
    const realPut = IDBObjectStore.prototype.put;
    let requestSucceeded = false;
    const interception = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const request = realPut.call(this, value, key);
      if (this.transaction.db === db) {
        request.addEventListener('success', () => {
          requestSucceeded = true;
          this.transaction.abort();
        }, { once: true });
      }
      return request;
    });
    try {
      await expect(write(profileId)).rejects.toBeDefined();
      expect(requestSucceeded).toBe(true);
      interception.mockRestore();
      await expect(getAllDailyRaw(profileId)).resolves.toEqual(previousRows);
      await expect(getMeta(profileId, 'record')).resolves.toEqual({ token: 'before' });
      await expect(getMeta(profileId, 'generation')).resolves.toBe(0);
    } finally {
      interception.mockRestore();
      await deleteWearablesDB(profileId);
    }
  });
});
