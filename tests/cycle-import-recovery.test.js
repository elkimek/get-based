// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  state: { currentProfile: 'origin', profileSex: 'female', importedData: {} },
  save: vi.fn(), scopedSave: vi.fn(), clearDB: vi.fn(), setSex: vi.fn(),
  rows: vi.fn(), meta: vi.fn(), readableMeta: vi.fn(),
  upsert: vi.fn(), saveMeta: vi.fn(), clear: vi.fn(), clearSource: vi.fn(),
  restoreRows: vi.fn(), restoreMeta: vi.fn(),
}));
vi.mock('../js/state.js', () => ({ state: runtime.state }));
vi.mock('../js/data.js', () => ({ saveImportedData: runtime.save, saveImportedDataForProfile: runtime.scopedSave }));
vi.mock('../js/profile.js', () => ({
  getActiveProfileId: () => runtime.state.currentProfile,
  setProfileSex: runtime.setSex,
}));
vi.mock('../js/tour.js', () => ({ endTour: vi.fn() }));
vi.mock('../js/modal-lifecycle.js', () => ({ closeModalOverlay: vi.fn(), openModalOverlay: vi.fn() }));
vi.mock('../js/utils.js', () => ({ escapeAttr: String, escapeHTML: String, showConfirmDialog: vi.fn(), showNotification: vi.fn() }));
vi.mock('../js/context-cards-runtime.js', () => ({ recordContextCardChangeRuntime: vi.fn() }));
vi.mock('../js/cycle-runtime.js', () => ({
  loadCycleImportStylesheetRuntime: vi.fn(), navigateCycleViewRuntime: vi.fn(),
  openCycleEditorRuntime: vi.fn(), renderCycleProfileButtonRuntime: vi.fn(),
}));
vi.mock('../js/cycle-store.js', () => ({
  getAllCycleObservationsRaw: runtime.rows, getCycleImportMetaRaw: runtime.meta,
  getCycleImportMeta: runtime.readableMeta, upsertCycleObservationBatch: runtime.upsert,
  saveCycleImportMeta: runtime.saveMeta, clearCycleImport: runtime.clear,
  clearCycleSource: runtime.clearSource, clearCycleDB: runtime.clearDB,
  upsertCycleObservationBatchRaw: runtime.restoreRows,
  upsertCycleImportMetaBatchRaw: runtime.restoreMeta,
}));
const { commitCycleImport, deleteCycleImportFromProfile, deleteCycleSourceFromProfile, clearCycleProfileData } = await import('../js/cycle-import.js');
const parsed = { source: 'drip', importId: 'new-import', observations: [], periods: [{ startDate: '2026-09-01', endDate: '2026-09-03', source: 'drip', importId: 'new-import' }] };
function replacement() {
  const data = { menstrualCycle: { periods: [{ startDate: '2025-01-01', importId: 'other' }] }, changeHistory: [], _deleted: {} };
  runtime.state.currentProfile = 'other';
  runtime.state.importedData = data;
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  runtime.state.currentProfile = 'origin';
  runtime.state.profileSex = 'female';
  runtime.state.importedData = { menstrualCycle: { periods: [] }, changeHistory: [], _deleted: {} };
  runtime.save.mockResolvedValue(true);
  runtime.scopedSave.mockResolvedValue(true);
  runtime.setSex.mockResolvedValue(true);
  runtime.rows.mockResolvedValue([]);
  runtime.meta.mockResolvedValue(null);
  runtime.readableMeta.mockResolvedValue(null);
});
it('does not apply an import to a profile loaded while reading its origin rows', async () => {
  let target;
  runtime.rows.mockImplementationOnce(async () => { target = replacement(); return []; });
  await commitCycleImport(parsed).catch(() => {});
  expect(target.menstrualCycle.periods).toEqual([{ startDate: '2025-01-01', importId: 'other' }]);
  expect(runtime.save).not.toHaveBeenCalled();
});
it('does not roll back a failed origin save into the newly active profile', async () => {
  let target;
  runtime.save.mockImplementationOnce(async () => { target = replacement(); return false; });
  await expect(commitCycleImport(parsed)).rejects.toThrow();
  expect(target.menstrualCycle.periods).toEqual([{ startDate: '2025-01-01', importId: 'other' }]);
});
it('fails closed before writes if the rollback snapshot cannot be read', async () => {
  runtime.rows.mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(commitCycleImport(parsed)).rejects.toThrow('storage unavailable');
  expect(runtime.saveMeta).not.toHaveBeenCalled();
  expect(runtime.clear).not.toHaveBeenCalled();
});
it('does not delete from replacement data while reading the origin import', async () => {
  runtime.state.importedData.menstrualCycle.periods = [{ ...parsed.periods[0] }];
  let target;
  runtime.rows.mockImplementationOnce(async () => { target = replacement(); return []; });
  await deleteCycleImportFromProfile('new-import').catch(() => {});
  expect(target.menstrualCycle.periods).toEqual([{ startDate: '2025-01-01', importId: 'other' }]);
  expect(runtime.save).not.toHaveBeenCalled();
});

it.each(['rows', 'meta'])('does not mutate when %s snapshot reads fail', async key => {
  runtime[key].mockRejectedValueOnce(new Error('cannot read'));
  await expect(commitCycleImport(parsed)).rejects.toThrow('cannot read');
  expect(runtime.upsert).not.toHaveBeenCalled();
  expect(runtime.saveMeta).not.toHaveBeenCalled();
});
it('restores all previous rows of a reused import, including dates outside the new input', async () => {
  const rows = [{ importId: 'new-import', source: 'drip', date: '2020-01-01' }, { importId: 'unrelated', date: '2020-01-02' }];
  runtime.rows.mockResolvedValue(rows);
  runtime.save.mockResolvedValueOnce(false);
  await expect(commitCycleImport(parsed)).rejects.toThrow('could not be saved');
  expect(runtime.restoreRows).toHaveBeenCalledWith('origin', [rows[0]]);
});
it('retains both the import error and raw rollback failure', async () => {
  runtime.saveMeta.mockRejectedValueOnce(new Error('metadata unavailable'));
  runtime.clear.mockRejectedValueOnce(new Error('cleanup unavailable'));
  await expect(commitCycleImport(parsed)).rejects.toThrow('metadata unavailable Rollback also failed: cleanup unavailable');
  expect(runtime.state.importedData.menstrualCycle.periods).toEqual([]);
});
it('restores sex metadata after navigation during its update without changing the destination sex', async () => {
  runtime.state.profileSex = null;
  let target;
  runtime.setSex.mockImplementationOnce(async () => {
    target = replacement(); runtime.state.profileSex = 'male'; return true;
  });
  await expect(commitCycleImport(parsed)).rejects.toThrow('Profile changed');
  expect(runtime.setSex.mock.calls).toEqual([['origin', 'female'], ['origin', null]]);
  expect(runtime.state.profileSex).toBe('male');
  expect(target.menstrualCycle.periods[0].importId).toBe('other');
});
it('does not apply counts computed after navigation', async () => {
  let target;
  runtime.rows.mockResolvedValueOnce([]).mockImplementationOnce(async () => { target = replacement(); return []; });
  await expect(commitCycleImport(parsed)).rejects.toThrow('Profile changed');
  expect(target.menstrualCycle.periods[0].importId).toBe('other');
  expect(runtime.save).not.toHaveBeenCalled();
});

const deletions = [
  ['import', () => deleteCycleImportFromProfile('new-import'), 'clear'],
  ['source', () => deleteCycleSourceFromProfile('drip'), 'clearSource'],
  ['profile', () => clearCycleProfileData(), 'clearDB'],
];
it.each(deletions)('%s deletion restores only origin memory on failed save after navigation', async (_name, remove, clearKey) => {
  runtime.state.importedData.menstrualCycle.periods = [{ ...parsed.periods[0] }];
  const origin = runtime.state.importedData;
  let target;
  runtime.save.mockImplementationOnce(async () => { target = replacement(); return false; });
  await expect(remove()).rejects.toThrow('could not be saved');
  expect(target.menstrualCycle.periods[0].importId).toBe('other');
  expect(origin.menstrualCycle.periods[0].importId).toBe('new-import');
  expect(runtime[clearKey]).not.toHaveBeenCalled();
});
it.each(deletions)('%s deletion rolls back a committed save using origin scope after cleanup failure', async (_name, remove, clearKey) => {
  runtime.state.importedData.menstrualCycle.periods = [{ ...parsed.periods[0] }];
  const origin = runtime.state.importedData;
  let target;
  runtime[clearKey].mockImplementationOnce(async () => { target = replacement(); throw new Error('cleanup failed'); });
  await expect(remove()).rejects.toThrow('cleanup failed');
  expect(target.menstrualCycle.periods[0].importId).toBe('other');
  expect(runtime.scopedSave).toHaveBeenCalledWith('origin', origin, expect.objectContaining({ forceProfileScope: true, baseData: expect.any(Object) }));
  expect(runtime.save).toHaveBeenCalledTimes(1);
});
it.each(deletions)('%s deletion reports rollback persistence failure', async (_name, remove, clearKey) => {
  runtime.state.importedData.menstrualCycle.periods = [{ ...parsed.periods[0] }];
  runtime[clearKey].mockRejectedValueOnce(new Error('cleanup failed'));
  runtime.scopedSave.mockResolvedValueOnce(false);
  await expect(remove()).rejects.toThrow('previous cycle state could not be restored');
});
it('serializes mutations and permits retry after a rejected operation', async () => {
  let release;
  runtime.saveMeta.mockImplementationOnce(() => new Promise((_, reject) => { release = reject; }));
  const first = commitCycleImport(parsed);
  const firstResult = expect(first).rejects.toThrow('first failed');
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  const second = commitCycleImport({ ...parsed, importId: 'retry' });
  expect(runtime.saveMeta).toHaveBeenCalledTimes(1);
  release(new Error('first failed'));
  await firstResult;
  await expect(second).resolves.toMatchObject({ periods: 1 });
  expect(runtime.saveMeta).toHaveBeenCalledTimes(2);
});
it('rejects queued old-profile work before writing after navigation', async () => {
  let release;
  runtime.saveMeta.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const firstResult = expect(commitCycleImport(parsed)).rejects.toThrow('Profile changed');
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  const secondResult = expect(commitCycleImport({ ...parsed, importId: 'queued' })).rejects.toThrow('Profile changed');
  replacement();
  release();
  await firstResult;
  await secondResult;
  expect(runtime.saveMeta).toHaveBeenCalledTimes(1);
});

it('rolls back if the post-write count read fails instead of committing incomplete coverage', async () => {
  runtime.rows.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('count read failed'));
  await expect(commitCycleImport(parsed)).rejects.toThrow('count read failed');
  expect(runtime.save).not.toHaveBeenCalled();
  expect(runtime.clear).toHaveBeenCalledWith('origin', 'new-import');
});
it.each(['rows', 'meta', 'readableMeta'])('deletion fails closed on %s read failure', async key => {
  runtime.state.importedData.menstrualCycle.periods = [{ ...parsed.periods[0] }];
  runtime[key].mockRejectedValueOnce(new Error('read failed'));
  await expect(deleteCycleImportFromProfile('new-import')).rejects.toThrow('read failed');
  expect(runtime.clear).not.toHaveBeenCalled();
  expect(runtime.save).not.toHaveBeenCalled();
  expect(runtime.state.importedData.menstrualCycle.periods).toHaveLength(1);
});
it('source deletion preserves both storage and live data after snapshot read failure', async () => {
  runtime.rows.mockRejectedValueOnce(new Error('read failed'));
  await expect(deleteCycleSourceFromProfile('drip')).rejects.toThrow('read failed');
  expect(runtime.clearSource).not.toHaveBeenCalled();
  expect(runtime.save).not.toHaveBeenCalled();
});
it('rejects replacement data even when the profile ID did not change', async () => {
  let target;
  runtime.rows.mockImplementationOnce(async () => {
    target = replacement(); runtime.state.currentProfile = 'origin'; return [];
  });
  await expect(commitCycleImport(parsed)).rejects.toThrow('Profile changed');
  expect(target.menstrualCycle.periods[0].importId).toBe('other');
  expect(runtime.saveMeta).not.toHaveBeenCalled();
});
it('restores previous metadata when a reused import fails', async () => {
  const previous = { importId: 'new-import', source: 'drip', sourceFile: 'earlier.csv' };
  runtime.meta.mockResolvedValueOnce(previous);
  runtime.save.mockResolvedValueOnce(false);
  await expect(commitCycleImport(parsed)).rejects.toThrow();
  expect(runtime.restoreMeta).toHaveBeenCalledWith('origin', [previous]);
});
it('does not change an explicitly male profile without consent', async () => {
  runtime.state.profileSex = 'male';
  await expect(commitCycleImport(parsed)).rejects.toMatchObject({ code: 'profile-sex-confirmation-required' });
  expect(runtime.rows).not.toHaveBeenCalled();
  expect(runtime.setSex).not.toHaveBeenCalled();
});
it.each(deletions)('%s deletion can be retried after failed persistence', async (_name, remove, clearKey) => {
  runtime.state.importedData.menstrualCycle.periods = [{ ...parsed.periods[0] }];
  runtime.save.mockResolvedValueOnce(false);
  await expect(remove()).rejects.toThrow();
  await expect(remove()).resolves.toBe(true);
  expect(runtime[clearKey]).toHaveBeenCalledTimes(1);
});
