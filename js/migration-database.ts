export interface MigrationIndex { name: string; keyPath: string | string[]; unique: boolean; multiEntry: boolean }
export interface MigrationRecord {
  key: IDBValidKey; value: unknown;
  protection?: 'wearable-row' | 'wearable-meta' | 'nutrition' | 'nutrition-meta' | 'evolu-identity'; passphraseWrapped?: boolean;
}
export interface MigrationStore {
  name: string; keyPath: string | string[] | null; autoIncrement: boolean;
  indexes: MigrationIndex[]; records: MigrationRecord[];
}
export interface MigrationDatabase { name: string; version: number; stores: MigrationStore[] }
export const MIGRATION_PENDING_KEY = 'labcharts-migration-pending';
export const MIGRATION_DATABASE = 'getbased-migration';

export interface MigrationDatabaseContract {
  version: number; minVersion: number; stores: string[]; legacyStores?: string[];
}
export function migrationDatabaseContract(name: string): MigrationDatabaseContract | null {
  if (name === 'labcharts-blobs') return {version: 1, minVersion: 1, stores: ['kv']};
  if (name === 'labcharts-backups') return {version: 2, minVersion: 1, stores: ['snapshots', 'folder-handle']};
  if (name === 'getbased-cashu') return {version: 2, minVersion: 1, stores: ['proofs', 'meta', 'fee-proofs']};
  if (name === 'getbased-evolu8-identity') return {version: 1, minVersion: 1, stores: ['identity']};
  if (/^labcharts-wearables-[A-Za-z0-9_-]{1,128}$/.test(name)) return {version: 1, minVersion: 1, stores: ['daily-metrics', 'meta']};
  if (/^labcharts-cycle-[A-Za-z0-9_-]{1,128}$/.test(name)) return {version: 2, minVersion: 1, stores: ['daily-observations', 'imports', 'meta']};
  if (/^getbased-nutrition-[A-Za-z0-9_-]{1,128}$/.test(name)) return {version: 3, minVersion: 1, stores: ['meals', 'meta'], legacyStores: ['food-cache']};
  return null;
}
export async function existingMigrationDatabases(): Promise<string[]> {
  if (!indexedDB.databases) throw new Error('This browser cannot inventory its saved data. Use a current supported browser without clearing this browser profile.');
  const inventory = await indexedDB.databases();
  const names: string[] = [];
  for (const {name} of inventory) {
    if (!name || name === MIGRATION_DATABASE) continue;
    if (migrationDatabaseContract(name)) names.push(name);
    else if (/^(?:labcharts-|getbased-)/.test(name)) throw new Error('An unrecognized application database needs recovery support before this installation can be migrated: ' + name);
  }
  return names.sort();
}

export function openExistingMigrationDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onupgradeneeded = () => { request.transaction?.abort(); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('A saved database could not be read.'));
    request.onblocked = () => reject(new Error('Close other getbased tabs and installed windows, then retry.'));
  });
}

function normalizeMigrationDatabase(name: string, version: number, stores: MigrationStore[], contract: MigrationDatabaseContract): MigrationDatabase {
  if (version === contract.version) return {name, version, stores};
  const byName = new Map(stores.map(store => [store.name, store]));
  const ordered = (list: MigrationStore[]) => ({
    name, version: contract.version,
    stores: list.map(store => ({...store, indexes: [...store.indexes].sort((a, b) => a.name.localeCompare(b.name))}))
      .sort((a, b) => a.name.localeCompare(b.name)),
  });
  const empty = (storeName: string, keyPath: string | string[] | null, indexes: MigrationIndex[] = []): MigrationStore =>
    ({name: storeName, keyPath, autoIncrement: false, indexes, records: []});
  if (name === 'labcharts-backups') {
    const snapshots = byName.get('snapshots') ?? {name: 'snapshots', keyPath: 'id', autoIncrement: true, indexes: [], records: []};
    const handles = byName.get('folder-handle') ?? empty('folder-handle', null);
    return ordered([snapshots, handles]);
  }
  if (name === 'getbased-cashu') {
    const proofs = byName.get('proofs') ?? empty('proofs', 'secret');
    const meta = byName.get('meta') ?? empty('meta', 'key');
    const fees = byName.get('fee-proofs') ?? empty('fee-proofs', 'secret');
    return ordered([proofs, meta, fees]);
  }
  if (name.startsWith('labcharts-cycle-')) {
    const legacyDaily = byName.get('daily-observations');
    const dailyRecords: MigrationRecord[] = [];
    for (const entry of legacyDaily?.records ?? []) {
      const row = entry.value as Record<string, unknown> | null;
      if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.source !== 'string' || typeof row.date !== 'string') {
        throw new Error('A legacy cycle record has an unsupported shape.');
      }
      const importId = String(row.importId || '').trim() || `legacy:${row.date || 'unknown'}`;
      const normalized = row.importId === importId ? row : {...row, importId};
      dailyRecords.push({key: [row.source, row.date, importId], value: normalized});
    }
    const daily: MigrationStore = {
      name: 'daily-observations', keyPath: ['source', 'date', 'importId'], autoIncrement: false,
      indexes: [
        {name: 'by_source', keyPath: 'source', unique: false, multiEntry: false},
        {name: 'by_source_date', keyPath: ['source', 'date'], unique: false, multiEntry: false},
        {name: 'by_date', keyPath: 'date', unique: false, multiEntry: false},
        {name: 'by_import', keyPath: 'importId', unique: false, multiEntry: false},
      ],
      records: dailyRecords,
    };
    const imports = byName.get('imports') ?? empty('imports', 'importId', [{name: 'by_source', keyPath: 'source', unique: false, multiEntry: false}]);
    const meta = byName.get('meta') ?? empty('meta', 'k');
    return ordered([daily, imports, meta]);
  }
  if (name.startsWith('getbased-nutrition-')) {
    const meals = byName.get('meals') ?? empty('meals', 'id', [{name: 'by_eaten_at', keyPath: 'eatenAt', unique: false, multiEntry: false}]);
    const meta = byName.get('meta') ?? empty('meta', 'k');
    return ordered([meals, meta]);
  }
  throw new Error('The saved database schema needs a newer recovery tool: ' + name);
}

export async function readMigrationDatabase(name: string): Promise<MigrationDatabase> {
  const contract = migrationDatabaseContract(name);
  if (!contract) throw new Error('Unsupported migration database.');
  const db = await openExistingMigrationDatabase(name);
  try {
    const allowedStores = db.version < contract.version && contract.legacyStores
      ? [...contract.stores, ...contract.legacyStores]
      : contract.stores;
    if (db.version < contract.minVersion || db.version > contract.version
      || [...db.objectStoreNames].some(store => !allowedStores.includes(store))) {
      throw new Error('The saved database schema needs a newer recovery tool: ' + name);
    }
    const names = [...db.objectStoreNames].filter(store => contract.stores.includes(store));
    if (!names.length) return normalizeMigrationDatabase(name, db.version, [], contract);
    const raw = await new Promise<MigrationStore[]>((resolve, reject) => {
      const tx = db.transaction(names, 'readonly');
      const stores = names.map(storeName => {
        const store = tx.objectStore(storeName);
        const values = store.getAll(), keys = store.getAllKeys();
        const snapshot: MigrationStore = {name: storeName, keyPath: store.keyPath, autoIncrement: store.autoIncrement,
          indexes: [...store.indexNames].map(indexName => {
            const index = store.index(indexName);
            return {name: indexName, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry};
          }), records: []};
        return {snapshot, values, keys};
      });
      tx.oncomplete = () => {
        try {
          for (const {snapshot, values, keys} of stores) {
            if (values.result.length !== keys.result.length) throw new Error('A saved database read was incomplete.');
            snapshot.records = keys.result.map((key, index) => ({key, value: values.result[index] as unknown}));
          }
          resolve(stores.map(store => store.snapshot));
        } catch (error) { reject(error); }
      };
      tx.onabort = () => reject(tx.error || new Error('A saved database read was interrupted.'));
      // Request failures abort this readonly transaction; only its terminal
      // abort reports failure, including an abort after request success.
      tx.onerror = () => {};
    });
    return normalizeMigrationDatabase(name, db.version, raw, contract);
  } finally { db.close(); }
}

export async function writeMigrationDatabase(snapshot: MigrationDatabase): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(snapshot.name, snapshot.version);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const store of snapshot.stores) {
        const created = database.createObjectStore(store.name, {keyPath: store.keyPath, autoIncrement: store.autoIncrement});
        for (const index of store.indexes) created.createIndex(index.name, index.keyPath, {unique: index.unique, multiEntry: index.multiEntry});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('The destination database could not be opened.'));
    request.onblocked = () => reject(new Error('Close other destination tabs and installed windows, then retry.'));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(snapshot.stores.map(store => store.name), 'readwrite');
      try {
        for (const store of snapshot.stores) {
          const destination = tx.objectStore(store.name);
          if (JSON.stringify(destination.keyPath) !== JSON.stringify(store.keyPath) || destination.autoIncrement !== store.autoIncrement) throw new Error('Destination database schema differs.');
          destination.clear();
          for (const record of store.records) {
            if (store.keyPath === null) destination.put(record.value, record.key);
            else destination.put(record.value);
          }
        }
      } catch (error) { tx.abort(); reject(error); }
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error('The destination database write was interrupted.'));
      tx.onerror = () => reject(tx.error || new Error('The destination database write failed.'));
    });
  } finally { db.close(); }
}
