// Shared automatic-snapshot and folder-permission database.
const BACKUP_DB_NAME = 'labcharts-backups';
export const BACKUP_STORE = 'snapshots';
export const FOLDER_HANDLE_STORE = 'folder-handle';
let _dbPromise: Promise<IDBDatabase> | null = null;

export function openBackupDB() {
  if (_dbPromise) return _dbPromise;
  let blocked = false;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(BACKUP_DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BACKUP_STORE)) {
        db.createObjectStore(BACKUP_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(FOLDER_HANDLE_STORE)) {
        db.createObjectStore(FOLDER_HANDLE_STORE);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      if (blocked) { db.close(); if (_dbPromise === pending) _dbPromise = null; return; }
      db.onversionchange = () => { db.close(); if (_dbPromise === pending) _dbPromise = null; };
      resolve(db);
    };
    req.onblocked = () => { blocked = true; reject(new Error('Backup storage is blocked by another open tab.')); };
    req.onerror = () => { if (_dbPromise === pending) _dbPromise = null; reject(req.error); };
  });
  _dbPromise = pending;
  void pending.catch(() => { if (!blocked && _dbPromise === pending) _dbPromise = null; });
  return pending;
}
