import { beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
const mocks = vi.hoisted(() => ({ wearable: vi.fn(), cycle: vi.fn(), notify: vi.fn() }));
vi.mock('../js/utils.js', () => ({ showConfirmDialog: async () => true, showNotification: mocks.notify, escapeAttr: (value: unknown) => value, escapeHTML: (value: unknown) => value }));
vi.mock('../js/wearables-store.js', () => ({ getDailyRangeRaw: vi.fn(), upsertDailyBatchRaw: mocks.wearable }));
vi.mock('../js/backup-cycle.js', () => ({ restoreCycleBackup: mocks.cycle }));
import { openBackupDB, restoreAutoBackup } from '../js/backup.js';
import { LENS_CONFIG_STORAGE_KEY, LENS_CONFIG_COMMIT_KEY } from '../js/lens-config-store.js';
beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); globalThis.indexedDB = new IDBFactory(); });
it('waits for the remaining store after one dependency fails and never announces success', async () => {
  const db = await openBackupDB();
  const id = await new Promise<IDBValidKey>((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    const request = tx.objectStore('snapshots').add({ snapshot: { createdAt: '2026-09-21', profileList: '[]', profiles: [], wearableIDB: { a: { manual: [{ date: '2026-09-21' }] } } } });
    tx.oncomplete = () => resolve(request.result); tx.onabort = () => reject(tx.error);
  });
  let release: (() => void) | undefined;
  mocks.wearable.mockRejectedValue(new Error('Quota'));
  mocks.cycle.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
  let settled = false;
  const restore = restoreAutoBackup(id).finally(() => { settled = true; });
  const rejection = expect(restore).rejects.toThrow('Backup restore incomplete');
  await vi.waitFor(() => expect(mocks.cycle).toHaveBeenCalled());
  expect(settled).toBe(false); expect(mocks.notify).not.toHaveBeenCalled();
  release!(); await rejection;
  expect(mocks.notify).not.toHaveBeenCalledWith(expect.stringContaining('Backup restored'), 'success');
  db.close();
});
it('restores Knowledge Base configuration through the committed settings owner', async () => {
  vi.resetModules();
  const [{ openBackupDB: open, restoreAutoBackup: restore }, { getBlob: read }] = await Promise.all([import('../js/backup.js'), import('../js/blob-storage.js')]);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    const raw = JSON.stringify({ enabled: false, backend: 'external-server', topK: 3, multiQuery: false, url: 'https://synthetic.invalid/query' }), db = await open();
    const id = await new Promise<IDBValidKey>((resolve, reject) => { const tx = db.transaction('snapshots', 'readwrite'), request = tx.objectStore('snapshots').add({ snapshot: { createdAt: '2026-10-25', profileList: '[]', profiles: [], settings: { [LENS_CONFIG_STORAGE_KEY]: raw } } }); tx.oncomplete = () => resolve(request.result); tx.onabort = () => reject(tx.error); });
    await restore(id); expect(localStorage.getItem(LENS_CONFIG_STORAGE_KEY)).toBe(raw); expect(await read(LENS_CONFIG_COMMIT_KEY)).toMatchObject({ version: 1, raw }); db.close();
  } finally { vi.clearAllTimers(); vi.useRealTimers(); }
});
