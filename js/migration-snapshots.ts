// The recovery list retains labels only; snapshot bodies are read on demand.
import {openExistingMigrationDatabase} from './migration-database.js';
export interface MigrationSnapshotLabel {key: IDBValidKey; createdAt?: unknown; encrypted?: unknown}
export async function migrationSnapshotCatalog(): Promise<MigrationSnapshotLabel[]> {
  const db = await openExistingMigrationDatabase('labcharts-backups');
  try {return await new Promise((resolve, reject) => {
    const labels: MigrationSnapshotLabel[] = [], tx = db.transaction('snapshots', 'readonly');
    const request = tx.objectStore('snapshots').openCursor();
    request.onsuccess = () => {
      const cursor = request.result; if (!cursor) return;
      const row = cursor.value as {createdAt?: unknown; encrypted?: unknown};
      labels.push({key: cursor.primaryKey, createdAt: row.createdAt, encrypted: row.encrypted}); cursor.continue();
    };
    tx.oncomplete = () => resolve(labels);
    tx.onabort = () => reject(tx.error || new Error('Saved snapshot labels could not be read.'));
  });} finally {db.close();}
}
export async function readMigrationSnapshot(key: IDBValidKey): Promise<{snapshot?: {format?: unknown; version?: unknown}} | undefined> {
  const db = await openExistingMigrationDatabase('labcharts-backups');
  try {return await new Promise((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readonly'), request = tx.objectStore('snapshots').get(key);
    tx.oncomplete = () => resolve(request.result as {snapshot?: {format?: unknown; version?: unknown}} | undefined);
    tx.onabort = () => reject(tx.error || new Error('The saved snapshot could not be read.'));
  });} finally {db.close();}
}
