import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearCycleDB, clearCycleImport, clearCycleSource, deleteCycleDB, deleteCycleMeta,
  getAllCycleImportMetaRaw, getAllCycleObservationsRaw, getCycleMeta, openCycleDB,
  saveCycleImportMeta, setCycleMeta, upsertCycleImportMetaBatchRaw, upsertCycleObservation,
  upsertCycleObservationBatch, upsertCycleObservationBatchRaw,
} from '../js/cycle-store.js';

afterEach(() => vi.restoreAllMocks());

describe('cycle storage transaction durability', () => {
  const operations: readonly [string, (profileId: string) => Promise<unknown>, 'put' | 'delete' | 'clear' | 'cursor'][] = [
    ['single observation', id => upsertCycleObservation(id, { source: 'drip', date: '2026-09-29', importId: 'before', note: 'after' }), 'put'],
    ['observation batch', id => upsertCycleObservationBatch(id, [{ source: 'drip', date: '2026-09-29', importId: 'before', note: 'after' }]), 'put'],
    ['raw observation restore', id => upsertCycleObservationBatchRaw(id, [{ source: 'drip', date: '2026-09-29', importId: 'before', note: 'after' }]), 'put'],
    ['import metadata', id => saveCycleImportMeta(id, { source: 'drip', importId: 'before', sourceFile: 'after.csv' }), 'put'],
    ['raw import metadata restore', id => upsertCycleImportMetaBatchRaw(id, [{ source: 'drip', importId: 'before', sourceFile: 'after.csv' }]), 'put'],
    ['plain metadata', id => setCycleMeta(id, 'record', { status: 'after' }), 'put'],
    ['source deletion', id => clearCycleSource(id, 'drip'), 'cursor'],
    ['import deletion', id => clearCycleImport(id, 'before'), 'delete'],
    ['plain metadata deletion', id => deleteCycleMeta(id, 'record'), 'delete'],
    ['database clearing', id => clearCycleDB(id), 'clear'],
  ];

  it.each(operations)('rejects %s when request success is followed by transaction abort', async (_name, operation, method) => {
    const profileId = `cycle-durability-${crypto.randomUUID()}`;
    const db = await openCycleDB(profileId);
    await upsertCycleObservationBatchRaw(profileId, [
      { source: 'drip', date: '2026-09-29', importId: 'before', note: 'private before' },
      { source: 'clue', date: '2026-09-29', importId: 'other', note: 'retain other source' },
    ]);
    await saveCycleImportMeta(profileId, { source: 'drip', importId: 'before', sourceFile: 'before.csv' });
    await setCycleMeta(profileId, 'record', { status: 'before' });
    const previousRows = await getAllCycleObservationsRaw(profileId);
    const previousImports = await getAllCycleImportMetaRaw(profileId);
    let requestSucceeded = false;
    const abortAfterSuccess = <T>(request: IDBRequest<T>, tx: IDBTransaction) => {
      if (tx.db === db) request.addEventListener('success', () => {
        requestSucceeded = true;
        tx.abort();
      }, { once: true });
      return request;
    };
    if (method === 'put') {
      const realPut = IDBObjectStore.prototype.put;
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
        const request = realPut.call(this, value, key);
        abortAfterSuccess(request, this.transaction);
        return request;
      });
    } else if (method === 'delete') {
      const realDelete = IDBObjectStore.prototype.delete;
      vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
        const request = realDelete.call(this, key);
        abortAfterSuccess(request, this.transaction);
        return request;
      });
    } else if (method === 'clear') {
      const realClear = IDBObjectStore.prototype.clear;
      vi.spyOn(IDBObjectStore.prototype, 'clear').mockImplementation(function (this: IDBObjectStore) {
        const request = realClear.call(this);
        abortAfterSuccess(request, this.transaction);
        return request;
      });
    } else {
      const realDelete = IDBCursor.prototype.delete;
      vi.spyOn(IDBCursor.prototype, 'delete').mockImplementation(function (this: IDBCursor) {
        const request = realDelete.call(this);
        const store = this.source instanceof IDBIndex ? this.source.objectStore : this.source;
        abortAfterSuccess(request, store.transaction);
        return request;
      });
    }
    try {
      await expect(operation(profileId)).rejects.toBeDefined();
      expect(requestSucceeded).toBe(true);
      vi.restoreAllMocks();
      await expect(getAllCycleObservationsRaw(profileId)).resolves.toEqual(previousRows);
      await expect(getAllCycleImportMetaRaw(profileId)).resolves.toEqual(previousImports);
      await expect(getCycleMeta(profileId, 'record')).resolves.toEqual({ status: 'before' });
    } finally {
      vi.restoreAllMocks();
      await deleteCycleDB(profileId);
    }
  });
});
