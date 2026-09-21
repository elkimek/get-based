import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ wearable: vi.fn(), rows: vi.fn(), meta: vi.fn(), notify: vi.fn() }));
vi.mock('../js/utils.js', () => ({ showConfirmDialog: vi.fn(), showNotification: mocks.notify, escapeAttr: value => value, escapeHTML: value => value }));
vi.mock('../js/blob-storage.js', () => ({ getBlob: async () => null, setBlob: vi.fn(), shouldUseBlob: () => true }));
vi.mock('../js/wearables-store.js', () => ({ getDailyRangeRaw: mocks.wearable, upsertDailyBatchRaw: vi.fn() }));
vi.mock('../js/cycle-store.js', () => ({ getAllCycleObservationsRaw: mocks.rows, getAllCycleImportMetaRaw: mocks.meta, upsertCycleObservationBatchRaw: vi.fn(), upsertCycleImportMetaBatchRaw: vi.fn() }));
import { buildFullBackupSnapshot, exportEncryptedBackup, configureBackupRuntimeDeps } from '../js/backup.js';
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: 'a', name: 'Profile' }]));
  configureBackupRuntimeDeps({ encryptedGetItem: async () => null, getEncryptionEnabled: () => false });
  mocks.wearable.mockResolvedValue([]); mocks.rows.mockResolvedValue([]); mocks.meta.mockResolvedValue([]);
});
it.each(['wearable', 'rows', 'meta'])('rejects a full snapshot when %s cannot be read', async store => {
  mocks[store].mockRejectedValue(new Error('Read failed'));
  await expect(buildFullBackupSnapshot()).rejects.toThrow();
});
it.each(['wearable', 'rows', 'meta'])('reports export failure without marking a successful backup when %s cannot be read', async store => {
  mocks[store].mockRejectedValue(new Error('Read failed'));
  await expect(exportEncryptedBackup()).resolves.toBeUndefined();
  expect(mocks.notify).toHaveBeenCalledWith(expect.stringContaining('Backup could not be created'), 'error');
  expect(localStorage.getItem('labcharts-last-manual-backup')).toBeNull();
  expect(mocks.notify).not.toHaveBeenCalledWith(expect.any(String), 'success');
});
it('accepts empty stores as a complete snapshot', async () => {
  const snapshot = await buildFullBackupSnapshot();
  expect(snapshot.profiles.map(profile => profile.profileId)).toEqual(['a']);
  expect(snapshot.wearableIDB).toEqual({});
  expect(snapshot.cycleIDB).toEqual({});
  expect(snapshot.cycleImportMeta).toEqual({});
});
it('preserves raw encrypted envelopes and groups source rows by their original profile', async () => {
  localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: 'a' }, { id: 'b' }]));
  const manual = { source: 'manual', date: '2026-09-21', encrypted: 'v1:wearable-ciphertext' };
  const cycle = { source: 'manual', date: '2026-09-20', encrypted: 'v1:cycle-ciphertext' };
  const meta = { source: 'import', encrypted: 'v1:meta-ciphertext' };
  mocks.wearable.mockImplementation(async (profile, source) => profile === 'a' && source === 'manual' ? [manual] : []);
  mocks.rows.mockImplementation(async profile => profile === 'b' ? [cycle] : []);
  mocks.meta.mockImplementation(async profile => profile === 'b' ? [meta] : []);
  const snapshot = await buildFullBackupSnapshot();
  expect(snapshot.wearableIDB).toEqual({ a: { manual: [manual] } });
  expect(snapshot.cycleIDB).toEqual({ b: { manual: [cycle] } });
  expect(snapshot.cycleImportMeta).toEqual({ b: [meta] });
});

it.each([null, '{broken', '{}'])('refuses an unreadable encrypted profile index: %j', async readable => {
  localStorage.setItem('labcharts-profiles', 'v1:profile-index');
  configureBackupRuntimeDeps({ encryptedGetItem: async () => readable });
  await expect(buildFullBackupSnapshot()).rejects.toThrow('profile list');
});
it('enumerates all encrypted profiles even when only one has legacy localStorage data', async () => {
  localStorage.setItem('labcharts-profiles', 'v1:profile-index');
  localStorage.setItem('labcharts-a-imported', 'v1:legacy-data');
  configureBackupRuntimeDeps({ encryptedGetItem: async key => key === 'labcharts-profiles' ? JSON.stringify([{ id: 'a', name: 'Legacy' }, { id: 'b', name: 'Migrated' }]) : null });
  const snapshot = await buildFullBackupSnapshot();
  expect(snapshot.profiles.map(profile => profile.profileId)).toEqual(['a', 'b']);
  expect(snapshot.profiles[0].keys.imported).toBe('v1:legacy-data');
  expect(mocks.rows).toHaveBeenCalledWith('b');
});
