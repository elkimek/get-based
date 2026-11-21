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

it('withholds obsolete Withings classifications through partial resync while retaining the raw backup row', async () => {
  const profile = `withings-classification-${crypto.randomUUID()}`, source = 'withings', date = '2026-05-01';
  const { getDaily } = await import('../js/wearables-store.js');
  try {
    await upsertDailyBatchRaw(profile, [{ source, date, weight: 72, vascular_age: 1, nerve_health_score: 18 }]);
    const raw = await getAllDailyRaw(profile);
    expect(raw[0]).toMatchObject({ vascular_age: 1 });
    const previous = await getDaily(profile, source, date);
    expect(previous).toMatchObject({ weight: 72 });
    expect(previous).not.toHaveProperty('vascular_age');
    await upsertDailyBatch(profile, [{ source, date, withingsMeasurementVersion: 2, vascular_age: 55, nerve_health_score: null }]);
    expect(await getDaily(profile, source, date)).toMatchObject({ weight: 72, vascular_age: 55 });
    expect((await getDaily(profile, source, date))?.nerve_health_score).toBeFalsy();
  } finally { await deleteWearablesDB(profile); }
});
