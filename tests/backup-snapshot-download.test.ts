// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import type { BackupSnapshot } from '../js/backup.js';

const mocks = vi.hoisted(() => ({ notify: vi.fn(), decrypt: vi.fn() }));
vi.mock('../js/utils.js', () => ({
  showNotification: mocks.notify, showConfirmDialog: vi.fn(),
  escapeAttr: (value: unknown) => value, escapeHTML: (value: unknown) => value,
}));
import { configureBackupRuntimeDeps, exportAutoBackup, openBackupDB, parseBackupSnapshot } from '../js/backup.js';

let blobs: Blob[];
let downloads: Array<{ filename: string; href: string }>;
function snapshot(encrypted = false): BackupSnapshot {
  return {
    format: 'labcharts-backup', version: 1, createdAt: '2026-11-01T09:08:07.000Z',
    encrypted, encryptionSalt: encrypted ? 'synthetic-salt' : null,
    settings: { 'labcharts-theme': 'light' },
    profileList: encrypted ? 'v1:synthetic-profile-list' : JSON.stringify([{ id: 'saved', name: 'Saved profile' }]),
    profiles: [{ profileId: 'saved', name: 'Saved profile', keys: { imported: encrypted ? 'v1:synthetic-records' : '{"entries":[],"contextNotes":"Saved note"}' } }],
    wearableIDB: null, cycleIDB: null, cycleImportMeta: null,
  };
}
async function save(value: unknown, id: IDBValidKey = 1) {
  const db = await openBackupDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    tx.objectStore('snapshots').put({ id, createdAt: '2026-11-01T09:08:07.000Z', snapshot: value });
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
}
async function readSaved(id: IDBValidKey = 1) {
  const db = await openBackupDB();
  return new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readonly');
    const req = tx.objectStore('snapshots').get(id);
    req.onsuccess = () => resolve(req.result as unknown);
    req.onerror = () => reject(req.error);
  });
}
async function readDownload() {
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blobs[0]!);
  });
  return parseBackupSnapshot(text);
}
beforeEach(async () => {
  vi.restoreAllMocks();
  mocks.notify.mockReset();
  mocks.decrypt.mockReset().mockRejectedValue(new Error('Current data must not be decrypted.'));
  configureBackupRuntimeDeps({ encryptedGetItem: mocks.decrypt });
  localStorage.clear();
  localStorage.setItem('labcharts-profiles', '{"current":"untouched"}');
  localStorage.setItem('labcharts-last-manual-backup', 'previous-current-backup');
  document.body.replaceChildren();
  blobs = []; downloads = [];
  vi.stubGlobal('URL', class extends URL {
    static override createObjectURL(blob: Blob | MediaSource) {
      if (!(blob instanceof Blob)) throw new Error('Expected a backup Blob.');
      blobs.push(blob); return 'blob:saved-snapshot';
    }
    static override revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ filename: this.download, href: this.href });
  });
  const db = await openBackupDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite');
    tx.objectStore('snapshots').clear();
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('downloads the selected historical snapshot without collecting or overwriting current data', async () => {
  const saved = { ...snapshot(), futureField: { retained: true } };
  await save(saved);
  const before = await readSaved();
  await exportAutoBackup(1);
  expect(await readDownload()).toEqual(saved);
  expect(downloads).toEqual([{ filename: 'getbased-backup-snapshot-2026-11-01-09-08-07.json', href: 'blob:saved-snapshot' }]);
  expect(await readSaved()).toEqual(before);
  expect(localStorage.getItem('labcharts-profiles')).toBe('{"current":"untouched"}');
  expect(localStorage.getItem('labcharts-last-manual-backup')).toBe('previous-current-backup');
  expect(mocks.decrypt).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:saved-snapshot');
  expect(document.querySelector('a')).toBeNull();
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith('Snapshot download started', 'success');
});

it('retains encrypted profiles, salt and typed-array envelopes without requiring an unlock', async () => {
  const saved = snapshot(true);
  saved.wearableIDB = { saved: { manual: [{
    source: 'manual', date: '2026-11-01',
    _enc: 'v1', iv: new Uint8Array([1, 2, 3]), ct: new Uint8Array([4, 5, 6]),
  }] } };
  await save(saved, 'encrypted-snapshot');
  await exportAutoBackup('encrypted-snapshot');
  expect(await readDownload()).toEqual(saved);
  expect(mocks.decrypt).not.toHaveBeenCalled();
  expect(localStorage.getItem('labcharts-encryption-salt')).toBeNull();
  expect(localStorage.getItem('labcharts-encryption-enabled')).toBeNull();
});

it('uses an undated filename while preserving a snapshot whose timestamp is unreadable', async () => {
  const saved = { ...snapshot(), createdAt: 'invalid-date' };
  await save(saved);
  await exportAutoBackup(1);
  expect(downloads[0]!.filename).toBe('getbased-backup-snapshot-undated.json');
  expect(await readDownload()).toEqual(saved);
});

it('reports a snapshot removed since the list was opened without downloading current data instead', async () => {
  await exportAutoBackup(999);
  expect(downloads).toEqual([]);
  expect(blobs).toEqual([]);
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Snapshot not found'), 'error');
});

it.each([null, { ...snapshot(), version: 2 }, { ...snapshot(), profileList: null }])('refuses an unsupported saved payload: %j', async saved => {
  await save(saved);
  await exportAutoBackup(1);
  expect(blobs).toEqual([]);
  expect(mocks.notify).toHaveBeenCalledWith(expect.any(String), 'error');
  expect(mocks.notify).not.toHaveBeenCalledWith(expect.any(String), 'success');
});

it('does not download a request result when the read transaction subsequently aborts', async () => {
  await save(snapshot());
  const original = IDBObjectStore.prototype.get;
  vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(function (this: IDBObjectStore, key) {
    const request = original.call(this, key);
    request.addEventListener('success', () => this.transaction.abort(), { once: true });
    return request;
  });
  await exportAutoBackup(1);
  expect(downloads).toEqual([]);
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Snapshot could not be downloaded'), 'error');
});

it('cleans up a failed browser download without acknowledging a backup of current data', async () => {
  await save(snapshot());
  vi.mocked(HTMLAnchorElement.prototype.click).mockImplementation(() => { throw new Error('Download blocked'); });
  await exportAutoBackup(1);
  expect(document.querySelector('a')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:saved-snapshot');
  expect(localStorage.getItem('labcharts-last-manual-backup')).toBe('previous-current-backup');
  expect(mocks.notify).toHaveBeenCalledExactlyOnceWith('Snapshot could not be downloaded: Download blocked', 'error');
});
