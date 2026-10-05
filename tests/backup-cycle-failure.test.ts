import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rows: vi.fn(), meta: vi.fn() }));
vi.mock('../js/cycle-store.js', () => ({ getAllCycleImportMetaRaw: vi.fn(), getAllCycleObservationsRaw: vi.fn(), upsertCycleObservationBatchRaw: mocks.rows, upsertCycleImportMetaBatchRaw: mocks.meta }));
import { restoreCycleBackup } from '../js/backup-cycle.js';
beforeEach(() => vi.resetAllMocks());
it('reports an observation failure after attempting remaining sources and metadata', async () => {
  mocks.rows.mockRejectedValueOnce(new Error('Quota'));
  await expect(restoreCycleBackup({ a: { first: [{ id: 1 }], second: [{ id: 2 }] } }, { a: [{ importId: 'source' }] })).rejects.toThrow('1 cycle data batch');
  expect(mocks.rows).toHaveBeenCalledTimes(2); expect(mocks.meta).toHaveBeenCalledTimes(1);
});
it('reports a metadata failure instead of treating preserved rows as a complete restore', async () => {
  mocks.meta.mockRejectedValue(new Error('Quota'));
  await expect(restoreCycleBackup({ a: { first: [{ id: 1 }] } }, { a: [{ importId: 'source' }] })).rejects.toThrow('1 cycle data batch');
  expect(mocks.rows).toHaveBeenCalledTimes(1);
});
