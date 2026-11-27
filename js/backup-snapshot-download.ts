// Read-only export of a historical backup; never collects or restores current data.
import { openBackupDB, BACKUP_STORE } from './backup-storage.js';
import { serializeBackupSnapshot } from './backup-serialization.js';
import { getErrorMessage } from './caught-error.js';
import { showNotification } from './utils.js';
import type { AutoBackupRecord } from './backup.js';

async function readAutoBackupForDownload(id: IDBValidKey): Promise<AutoBackupRecord | undefined> {
  const db = await openBackupDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BACKUP_STORE, 'readonly');
    const request = tx.objectStore(BACKUP_STORE).get(id);
    let record: AutoBackupRecord | undefined;
    request.onsuccess = () => { record = request.result as AutoBackupRecord | undefined; };
    request.onerror = () => reject(request.error || new Error('The saved snapshot could not be read.'));
    tx.onabort = () => reject(tx.error || new Error('Reading the saved snapshot was interrupted.'));
    tx.onerror = () => reject(tx.error || new Error('The saved snapshot could not be read.'));
    // A successful request can still be followed by an aborted transaction.
    tx.oncomplete = () => resolve(record);
  });
}

/** Download saved bytes without restoring, unlocking, or collecting current data. */
export async function exportAutoBackup(id: IDBValidKey): Promise<void> {
  try {
    const record = await readAutoBackupForDownload(id);
    if (!record?.snapshot) {
      showNotification('Snapshot not found. Refresh the snapshot list and try again.', 'error');
      return;
    }
    const snapshot = record.snapshot;
    if (snapshot.format !== 'labcharts-backup' || snapshot.version !== 1 || typeof snapshot.profileList !== 'string') {
      throw new Error('The saved snapshot is not a supported backup.');
    }
    const serialized = serializeBackupSnapshot(snapshot);
    if (typeof serialized !== 'string') throw new Error('The saved snapshot could not be encoded.');
    const createdAt = new Date(snapshot.createdAt);
    const dateLabel = Number.isFinite(createdAt.getTime())
      ? createdAt.toISOString().slice(0, 19).replace(/[T:]/g, '-')
      : 'undated';
    const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json' }));
    const anchor = document.createElement('a');
    try {
      anchor.href = url;
      anchor.download = 'getbased-backup-snapshot-' + dateLabel + '.json';
      document.body.appendChild(anchor);
      anchor.click();
    } finally {
      anchor.remove();
      URL.revokeObjectURL(url);
    }
    // Historical exports do not acknowledge a backup of the current data.
    showNotification('Snapshot download started', 'success');
  } catch (error) {
    showNotification('Snapshot could not be downloaded: ' + getErrorMessage(error), 'error');
  }
}
