// Shared automatic-snapshot and folder-permission database.
const BACKUP_DB_NAME = 'labcharts-backups';
export const BACKUP_STORE = 'snapshots';
export const FOLDER_HANDLE_STORE = 'folder-handle';
let _dbPromise: Promise<IDBDatabase> | null = null;
let _dbFactory: IDBFactory | null = null;

export function openBackupDB() {
  const factory = indexedDB;
  if (_dbPromise && _dbFactory === factory) return _dbPromise;
  let blocked = false;
  const pending = new Promise<IDBDatabase>((resolve, reject) => {
    const req = factory.open(BACKUP_DB_NAME, 2);
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
      if (blocked || factory !== indexedDB) {
        db.close();
        if (_dbPromise === pending) { _dbPromise = null; _dbFactory = null; }
        if (!blocked) reject(new Error('Backup storage changed while opening.'));
        return;
      }
      db.onversionchange = () => { db.close(); if (_dbPromise === pending) { _dbPromise = null; _dbFactory = null; } };
      resolve(db);
    };
    req.onblocked = () => { blocked = true; reject(new Error('Backup storage is blocked by another open tab.')); };
    req.onerror = () => { if (_dbPromise === pending) { _dbPromise = null; _dbFactory = null; } reject(req.error); };
  });
  _dbPromise = pending;
  _dbFactory = factory;
  void pending.catch(() => { if (!blocked && _dbPromise === pending) { _dbPromise = null; _dbFactory = null; } });
  return pending;
}
