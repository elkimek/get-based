import { beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
const mocks = vi.hoisted(() => ({ wearable: vi.fn(), cycle: vi.fn(), notify: vi.fn() }));
vi.mock('../js/utils.js', () => ({ showConfirmDialog: async () => true, showNotification: mocks.notify, escapeAttr: value => value, escapeHTML: value => value }));
vi.mock('../js/wearables-store.js', () => ({ getDailyRangeRaw: vi.fn(), upsertDailyBatchRaw: mocks.wearable }));
vi.mock('../js/backup-cycle.js', () => ({ restoreCycleBackup: mocks.cycle }));
import { openBackupDB, restoreAutoBackup } from '../js/backup.js';
beforeEach(() => { vi.resetAllMocks(); localStorage.clear(); globalThis.indexedDB = new IDBFactory(); });
it('waits for the remaining store after one dependency fails and never announces success', async () => {
  const db = await openBackupDB();
  const id = await new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    const request = tx.objectStore('snapshots').add({ snapshot: { createdAt: '2026-09-21', profileList: '[]', profiles: [], wearableIDB: { a: { manual: [{ date: '2026-09-21' }] } } } });
    tx.oncomplete = () => resolve(request.result); tx.onabort = () => reject(tx.error);
  });
  let release;
  mocks.wearable.mockRejectedValue(new Error('Quota'));
  mocks.cycle.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  let settled = false;
  const restore = restoreAutoBackup(id).finally(() => { settled = true; });
  const rejection = expect(restore).rejects.toThrow('Backup restore incomplete');
  await vi.waitFor(() => expect(mocks.cycle).toHaveBeenCalled());
  expect(settled).toBe(false); expect(mocks.notify).not.toHaveBeenCalled();
  release(); await rejection;
  expect(mocks.notify).not.toHaveBeenCalledWith(expect.stringContaining('Backup restored'), 'success');
  db.close();
});
