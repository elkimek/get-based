import { beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange as TestKeyRange } from 'fake-indexeddb';
import { showNotification } from '../js/utils.js';
vi.mock('../js/utils.js', () => ({ showConfirmDialog: async () => true, showNotification: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  globalThis.indexedDB = new IDBFactory();
  vi.stubGlobal('IDBKeyRange', TestKeyRange);
});

async function storeBackup(snapshot: Record<string, unknown>) {
  const { openBackupDB } = await import('../js/backup.js');
  const db = await openBackupDB();
  return new Promise<IDBValidKey>((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    const record = tx.objectStore('snapshots').add({ snapshot });
    tx.oncomplete = () => resolve(record.result);
    tx.onabort = () => reject(tx.error);
  });
}

const profileList = JSON.stringify([{ id: 'test-person', name: 'Fictional' }]);
const snapshot = {
  profileList, profiles: [{ profileId: 'test-person', keys: {} }],
  wearableIDB: { 'test-person': { manual: [{ source: 'manual', date: '2026-01-01', rhr: 61 }] } },
  cycleIDB: {}, cycleImportMeta: {},
};

it('replaces an entire backed-up side store and retains device metadata', async () => {
  const [wear, cycle, backup] = await Promise.all([import('../js/wearables-store.js'), import('../js/cycle-store.js'), import('../js/backup.js')]);
  await wear.upsertDailyBatchRaw('test-person', [{ source: 'manual', date: '2026-06-01', rhr: 65 }]);
  await cycle.upsertCycleObservationBatchRaw('test-person', [{ source: 'manual', date: '2026-06-01' }]);
  await cycle.setCycleMeta('test-person', 'device-setting', 'keep');
  await backup.restoreAutoBackup(await storeBackup(snapshot));
  expect((await wear.getAllDailyRaw('test-person')).map(row => row.date)).toEqual(['2026-01-01']);
  expect(await cycle.getAllCycleObservationsRaw('test-person')).toEqual([]);
  expect(await cycle.getCycleMeta('test-person', 'device-setting')).toBe('keep');
  expect(localStorage.getItem('labcharts-backup-restore-pending')).toBeNull();
  expect(localStorage.getItem('labcharts-profiles')).toBe(profileList);
});

it('restores prior side rows and settings when the final profile publication fails', async () => {
  const [wear, backup] = await Promise.all([import('../js/wearables-store.js'), import('../js/backup.js')]);
  const original = { source: 'manual', date: '2026-06-01', rhr: 65 };
  await wear.upsertDailyBatchRaw('test-person', [original]);
  localStorage.setItem('labcharts-profiles', 'previous-index');
  localStorage.setItem('labcharts-theme', 'light');
  const id = await storeBackup({ ...snapshot, settings: { 'labcharts-theme': 'dark' } });
  const set = localStorage.setItem.bind(localStorage);
  const failure = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
    if (key === 'labcharts-profiles' && value === profileList) throw new Error('Fixture storage unavailable');
    set(key, value);
  });
  try { await expect(backup.restoreAutoBackup(id)).rejects.toThrow('Fixture storage unavailable'); }
  finally { failure.mockRestore(); }
  expect(await wear.getAllDailyRaw('test-person')).toEqual([original]);
  expect(localStorage.getItem('labcharts-theme')).toBe('light');
  expect(localStorage.getItem('labcharts-profiles')).toBe('previous-index');
  expect(localStorage.getItem('labcharts-backup-restore-pending')).toBeNull();
});

it('preserves recipient credentials and ignores settings outside the backup schema', async () => {
  const backup = await import('../js/backup.js');
  localStorage.setItem('labcharts-custom-url', 'https://original.invalid');
  localStorage.setItem('labcharts-custom-key', 'd1:fixture');
  await backup.restoreAutoBackup(await storeBackup({ ...snapshot, settings: {
    'labcharts-custom-url': 'https://different.invalid', 'labcharts-theme': 'dark', 'fixture-unrecognized': 'unused',
  } }));
  expect(localStorage.getItem('labcharts-custom-url')).toBe('https://original.invalid');
  expect(localStorage.getItem('labcharts-custom-key')).toBe('d1:fixture');
  expect(localStorage.getItem('fixture-unrecognized')).toBeNull();
  expect(localStorage.getItem('labcharts-theme')).toBe('dark');
  expect(showNotification).toHaveBeenCalledWith(expect.stringContaining('Backup restored'), 'success');
});

it('restores a custom endpoint on an empty device and accepts only an endpoint-bound bearer', async () => {
  const backup = await import('../js/backup.js');
  const { getCustomApiKey } = await import('../js/api-provider-storage.js');
  const { updateKeyCache } = await import('../js/crypto-key-cache.js');
  const endpoint = 'https://fixture.invalid';
  backup.configureBackupRuntimeDeps({ isCredentialKey: key => key === 'labcharts-custom-key' });
  await backup.restoreAutoBackup(await storeBackup({
    ...snapshot, encrypted: true, encryptionSalt: btoa('0'.repeat(16)), profileList: 'v1:synthetic',
    settings: { 'labcharts-custom-url': endpoint, 'labcharts-custom-key': 'v1:synthetic' },
  }));
  expect(localStorage.getItem('labcharts-custom-url')).toBe(endpoint);
  expect(localStorage.getItem('labcharts-custom-key')).toBe('v1:synthetic');
  updateKeyCache('labcharts-custom-key', 'unbound-test-value');
  expect(getCustomApiKey()).toBe('');
  updateKeyCache('labcharts-custom-key', 'getbased-custom-credential-v1:' + JSON.stringify([endpoint, 'test-only-bound']));
  expect(getCustomApiKey()).toBe('test-only-bound');
});
