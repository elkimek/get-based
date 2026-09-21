import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn(), range: vi.fn(), remove: vi.fn(), clear: vi.fn(), save: vi.fn(), saveCurrent: vi.fn(), meta: vi.fn(), batch: vi.fn(), setMeta: vi.fn() }));
vi.mock('../js/wearables-store.js', () => ({ getDaily: mocks.read, upsertDaily: mocks.write, getDailyRange: mocks.range, deleteDaily: mocks.remove, clearSource: mocks.clear, upsertDailyBatch: mocks.batch, countSource: vi.fn(), getMeta: mocks.meta, setMeta: mocks.setMeta }));
vi.mock('../js/data.js', () => ({ saveImportedData: mocks.saveCurrent, saveImportedDataForProfile: mocks.save }));
vi.mock('../js/wearables-summary.js', () => ({ syncWearableSummary: vi.fn() }));
import { state } from '../js/state.js';
import { logManualMetric, logManualBP, deleteManualMetric, deleteAllManualMetrics, migrateBiometricsToManual } from '../js/wearables-manual.js';
const day = '2026-09-21';
const originData = () => ({ entries: [], manualMetricTombstones: { [`rhr.${day}`]: 100 }, biometrics: { pulse: [{ date: day, value: 60 }] } });
const destinationData = () => ({ entries: [], manualMetricTombstones: {}, contextNotes: 'Destination' });
beforeEach(() => {
  vi.resetAllMocks(); state.currentProfile = 'a'; state.importedData = originData();
  mocks.save.mockResolvedValue(true); mocks.saveCurrent.mockResolvedValue(true); mocks.range.mockResolvedValue([]);
});
it.each(['weight', 'bp'])('keeps %s row tombstones and connection persistence scoped to the origin after a switch', async kind => {
  const destination = destinationData();
  mocks.read.mockImplementation(async () => { state.currentProfile = 'b'; state.importedData = destination; return { source: 'manual', date: day, rhr: 60 }; });
  if (kind === 'weight') await logManualMetric('a', 'weight', { date: day, value: 80 });
  else await logManualBP('a', { date: day, systolic: 120, diastolic: 80 });
  expect(mocks.write).toHaveBeenCalledWith('a', expect.not.objectContaining({ rhr: 60 }));
  expect(mocks.save).toHaveBeenCalledWith('a', expect.objectContaining({ wearableConnections: expect.objectContaining({ manual: expect.any(Object) }) }), expect.objectContaining({ baseData: expect.any(Object) }));
  expect(destination).toEqual(destinationData()); expect(mocks.saveCurrent).not.toHaveBeenCalled();
});
it('does not clear a live tombstone when the row write fails', async () => {
  mocks.write.mockRejectedValue(new Error('Quota')); const before = structuredClone(state.importedData);
  await expect(logManualMetric('a', 'rhr', { date: day, value: 65 })).rejects.toThrow('Quota');
  expect(state.importedData).toEqual(before); expect(mocks.save).not.toHaveBeenCalled();
});
it.each(['metric', 'bp'])('reports failed connection persistence for %s instead of success', async kind => {
  mocks.save.mockResolvedValue(false); mocks.saveCurrent.mockResolvedValue(false);
  const operation = kind === 'metric' ? logManualMetric('a', 'weight', { date: day, value: 80 }) : logManualBP('a', { date: day, systolic: 120 });
  await expect(operation).rejects.toThrow(/save/i);
});
it.each(['metric', 'bp', 'delete'])('rejects %s writes for an inactive profile before touching storage', async kind => {
  const operation = kind === 'metric' ? logManualMetric('b', 'weight', { date: day, value: 80 }) : kind === 'bp' ? logManualBP('b', { date: day, systolic: 120 }) : deleteManualMetric('b', 'rhr', day);
  await expect(operation).rejects.toThrow(/profile/i);
  expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.write).not.toHaveBeenCalled();
});
it('persists deletion intent to the origin even if row lookup switches profiles', async () => {
  const destination = destinationData();
  mocks.read.mockImplementation(async () => { state.currentProfile = 'b'; state.importedData = destination; return { source: 'manual', date: day, rhr: 60 }; });
  await deleteManualMetric('a', 'rhr', day);
  expect(mocks.save).toHaveBeenCalledWith('a', expect.objectContaining({ biometrics: { pulse: [] } }), expect.any(Object));
  expect(destination).toEqual(destinationData()); expect(mocks.saveCurrent).not.toHaveBeenCalled();
});
it('keeps delete-all tombstones out of a profile opened during the row scan', async () => {
  const destination = destinationData();
  mocks.range.mockImplementation(async () => { state.currentProfile = 'b'; state.importedData = destination; return [{ source: 'manual', date: day, rhr: 60 }]; });
  await deleteAllManualMetrics('a');
  expect(mocks.save).toHaveBeenCalledWith('a', expect.objectContaining({ manualMetricTombstones: expect.objectContaining({ 'rhr.all': expect.any(Number) }) }), expect.any(Object));
  expect(destination).toEqual(destinationData()); expect(mocks.saveCurrent).not.toHaveBeenCalled();
});
it('does not erase wearable rows when durable deletion intent cannot be saved', async () => {
  mocks.save.mockResolvedValue(false); mocks.saveCurrent.mockResolvedValue(false);
  await expect(deleteAllManualMetrics('a')).rejects.toThrow(/save/i);
  expect(mocks.clear).not.toHaveBeenCalled();
});

it('keeps migration connection metadata attached to its origin after a profile switch', async () => {
  state.importedData.manualMetricTombstones = {};
  const destination = destinationData();
  mocks.meta.mockImplementation(async () => { state.currentProfile = 'b'; state.importedData = destination; });
  await migrateBiometricsToManual('a', { weight: [{ date: day, value: 80 }] });
  expect(mocks.batch).toHaveBeenCalledWith('a', [expect.objectContaining({ weight: 80 })]);
  expect(mocks.save).toHaveBeenCalledWith('a', expect.objectContaining({ wearableConnections: expect.any(Object) }), expect.any(Object));
  expect(destination).toEqual(destinationData());
});
it('does not mark migration complete when its metadata failed to commit', async () => {
  state.importedData.manualMetricTombstones = {};
  mocks.save.mockResolvedValue(false);
  await expect(migrateBiometricsToManual('a', { weight: [{ date: day, value: 80 }] })).rejects.toThrow(/save/i);
  expect(mocks.setMeta).not.toHaveBeenCalled();
});

it('serializes same-day read/modify/write operations without Web Locks', async () => {
  let row = null;
  mocks.read.mockImplementation(async () => {
    const snapshot = structuredClone(row);
    await new Promise(resolve => setTimeout(resolve, 0));
    return snapshot;
  });
  mocks.write.mockImplementation(async (_profile, next) => { row = structuredClone(next); });
  await Promise.all([
    logManualMetric('a', 'weight', { date: day, value: 80 }),
    logManualBP('a', { date: day, systolic: 120, diastolic: 80 }),
  ]);
  expect(row).toMatchObject({ weight: 80, bp_systolic: 120, bp_diastolic: 80 });
});
it('releases a failed row operation so the next queued write can succeed', async () => {
  mocks.write.mockRejectedValueOnce(new Error('Write failed')).mockResolvedValueOnce(undefined);
  const results = await Promise.allSettled([
    logManualMetric('a', 'weight', { date: day, value: 80 }),
    logManualBP('a', { date: day, systolic: 120 }),
  ]);
  expect(results.map(result => result.status)).toEqual(['rejected', 'fulfilled']);
  expect(mocks.write).toHaveBeenCalledTimes(2);
  expect(mocks.save).toHaveBeenCalledTimes(1);
});

it('seeds missing legacy metrics without replacing newer manual readings on the same day', async () => {
  state.importedData.manualMetricTombstones = {};
  mocks.read.mockResolvedValue({ source: 'manual', date: day, weight: 82, rhr: 61, note: 'New manual entry' });
  await migrateBiometricsToManual('a', { weight: [{ date: day, value: 70 }], bp: [{ date: day, systolic: 120, diastolic: 80 }] });
  expect(mocks.batch).toHaveBeenCalledExactlyOnceWith('a', [{ source: 'manual', date: day, weight: 82, rhr: 61, bp_systolic: 120, bp_diastolic: 80, note: 'New manual entry' }]);
});
it('preserves a newer reading when retrying migration after metadata commit failure', async () => {
  state.importedData.manualMetricTombstones = {};
  let stored = null;
  mocks.read.mockImplementation(async () => stored);
  mocks.batch.mockImplementation(async (_profile, rows) => { stored = rows[0]; });
  mocks.save.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const legacy = { weight: [{ date: day, value: 70 }] };
  await expect(migrateBiometricsToManual('a', legacy)).rejects.toThrow(/save/i);
  expect(mocks.setMeta).not.toHaveBeenCalled();
  stored = { ...stored, weight: 82, rhr: 61 };
  await migrateBiometricsToManual('a', legacy);
  expect(stored).toMatchObject({ weight: 82, rhr: 61 });
  expect(mocks.setMeta).toHaveBeenCalledOnce();
});
