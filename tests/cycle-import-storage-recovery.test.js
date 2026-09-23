// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
const runtime = vi.hoisted(() => ({
  state: { currentProfile: '', profileSex: 'female', importedData: {} },
  save: vi.fn(),
}));
vi.mock('../js/state.js', () => ({ state: runtime.state }));
vi.mock('../js/data.js', () => ({ saveImportedData: runtime.save, saveImportedDataForProfile: vi.fn() }));
vi.mock('../js/profile.js', () => ({ getActiveProfileId: () => runtime.state.currentProfile, setProfileSex: vi.fn(async () => true) }));
vi.mock('../js/context-cards-runtime.js', () => ({ recordContextCardChangeRuntime: vi.fn() }));
vi.mock('../js/cycle-runtime.js', () => ({ renderCycleProfileButtonRuntime: vi.fn() }));
import { commitCycleImport } from '../js/cycle-import-mutations.js';
import {
  configureCycleStoreCrypto, deleteCycleDB, getAllCycleObservationsRaw,
  getCycleImportMetaRaw, saveCycleImportMeta, upsertCycleObservationBatch,
} from '../js/cycle-store.js';
let sequence = 0;
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  runtime.state.currentProfile = `cycle-rollback-${++sequence}`;
  runtime.state.importedData = { menstrualCycle: { periods: [] }, changeHistory: [], _deleted: {} };
  runtime.save.mockReset().mockResolvedValue(false);
  configureCycleStoreCrypto({ getEncryptionEnabled: () => false });
});
it.each([false, true])('restores the entire previous import after profile persistence failure (throw=%s)', async throws => {
  const profile = runtime.state.currentProfile;
  const before = [
    { source: 'drip', date: '2020-01-01', importId: 'reused', note: 'old untouched date' },
    { source: 'drip', date: '2026-09-01', importId: 'reused', note: 'old replaced date' },
    { source: 'drip', date: '2026-09-01', importId: 'unrelated', note: 'keep separate batch' },
  ];
  try {
    await upsertCycleObservationBatch(profile, before);
    await saveCycleImportMeta(profile, { importId: 'reused', source: 'drip', sourceFile: 'original.csv' });
    const originalRows = await getAllCycleObservationsRaw(profile);
    const originalMeta = await getCycleImportMetaRaw(profile, 'reused');
    if (throws) runtime.save.mockRejectedValueOnce(new Error('save interrupted'));
    await expect(commitCycleImport({
      source: 'drip', importId: 'reused', observations: [
        { date: '2026-09-01', note: 'replacement' }, { date: '2026-09-02', note: 'new' },
      ], periods: [],
    })).rejects.toThrow();
    expect(await getAllCycleObservationsRaw(profile)).toEqual(originalRows);
    expect(await getCycleImportMetaRaw(profile, 'reused')).toEqual(originalMeta);
    expect(runtime.state.importedData.menstrualCycle.periods).toEqual([]);
  } finally { await deleteCycleDB(profile); }
});
it('removes a failed new batch without losing unrelated stored observations, then retries', async () => {
  const profile = runtime.state.currentProfile;
  try {
    await upsertCycleObservationBatch(profile, [{ source: 'clue', date: '2020-01-01', importId: 'existing', note: 'keep' }]);
    const before = await getAllCycleObservationsRaw(profile);
    const parsed = { source: 'drip', importId: 'new', observations: [{ date: '2026-09-01', note: 'retry' }], periods: [] };
    await expect(commitCycleImport(parsed)).rejects.toThrow();
    expect(await getAllCycleObservationsRaw(profile)).toEqual(before);
    expect(await getCycleImportMetaRaw(profile, 'new')).toBeNull();
    runtime.save.mockResolvedValue(true);
    await expect(commitCycleImport(parsed)).resolves.toMatchObject({ observations: 1 });
    const stored = await getAllCycleObservationsRaw(profile);
    expect(stored).toHaveLength(2);
    expect(stored).toEqual(expect.arrayContaining(before));
    expect(await getCycleImportMetaRaw(profile, 'new')).toMatchObject({ observationCount: 1 });
  } finally { await deleteCycleDB(profile); }
});
