import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { clearCycleImport, configureCycleStoreCrypto, countCycleSource, deleteCycleDB, getAllCycleObservationsRaw, getCycleImportMeta, getCycleObservationRange, resetCycleDB, saveCycleImportMeta, upsertCycleObservationBatch } from '../js/cycle-store.js';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  sessionStorage.clear();
});

describe('cycle storage', () => {
  it('stores raw cycle observations locally by source and import id', async () => {
    const profileId = 'cycle-store-test';
    await deleteCycleDB(profileId).catch(() => {});

    await upsertCycleObservationBatch(profileId, [
      { source: 'drip', importId: 'imp1', date: '2026-01-01', bleeding: { flow: 'light' }, note: 'local note' },
      { source: 'drip', importId: 'imp1', date: '2026-01-02', bleeding: { flow: 'heavy' } },
      { source: 'apple_health', importId: 'imp2', date: '2026-01-02', bleeding: { flow: 'moderate' } },
    ]);
    await saveCycleImportMeta(profileId, {
      importId: 'imp1',
      source: 'drip',
      sourceFile: 'drip.csv',
      observationCount: 2,
    });

    const dripRows = await getCycleObservationRange(profileId, 'drip', '2026-01-01', '2026-01-31');
    expect(dripRows).toHaveLength(2);
    expect(dripRows[0]!.note).toBe('local note');
    expect(await countCycleSource(profileId, 'drip')).toBe(2);
    expect(await getCycleImportMeta(profileId, 'imp1')).toMatchObject({ source: 'drip', observationCount: 2 });

    await clearCycleImport(profileId, 'imp1');
    expect(await countCycleSource(profileId, 'drip')).toBe(0);
    expect(await countCycleSource(profileId, 'apple_health')).toBe(1);
    expect(await getCycleImportMeta(profileId, 'imp1')).toBeNull();

    await deleteCycleDB(profileId).catch(() => {});
  });

  it('migrates v1 source-date rows to batch-aware observation identities', async () => {
    const profileId = 'cycle-store-v1-migration';
    const legacyDb = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`labcharts-cycle-${profileId}`, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('daily-observations', { keyPath: ['source', 'date'] });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = legacyDb.transaction('daily-observations', 'readwrite');
    tx.objectStore('daily-observations').put({
      source: 'drip', date: '2025-12-31', importId: 'legacy-import', note: 'preserve me',
    });
    await new Promise<Event>((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    legacyDb.close();
    resetCycleDB(profileId);

    expect(await getAllCycleObservationsRaw(profileId)).toEqual([
      expect.objectContaining({ source: 'drip', date: '2025-12-31', importId: 'legacy-import', note: 'preserve me' }),
    ]);
    await deleteCycleDB(profileId);
  });

  it('fails closed when cycle encryption is enabled without an unlocked provider', async () => {
    const profileId = 'cycle-encryption-provider-locked';
    const previous = configureCycleStoreCrypto({
      getEncryptionEnabled: () => true,
      encryptObject: async () => null,
      isEncryptedObject: value => (value as { _enc?: unknown } | null)?._enc === 'v1',
      decryptObject: async () => null,
    });

    try {
      await expect(upsertCycleObservationBatch(profileId, [{
        source: 'drip',
        importId: 'locked-import',
        date: '2026-01-01',
        note: 'must not land as plaintext',
      }])).rejects.toMatchObject({ code: 'session-locked' });
      expect(await getAllCycleObservationsRaw(profileId)).toEqual([]);
    } finally {
      configureCycleStoreCrypto(previous);
      await deleteCycleDB(profileId).catch(() => {});
    }
  });
});
