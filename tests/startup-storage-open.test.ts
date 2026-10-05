// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let factory: IDBFactory;
const opened = new Set<IDBDatabase>();
let picker: PropertyDescriptor | undefined;
beforeEach(() => {
  vi.resetModules(); factory = new IDBFactory(); vi.stubGlobal('indexedDB', factory);
  picker = Object.getOwnPropertyDescriptor(window, 'showDirectoryPicker');
  Object.defineProperty(window, 'showDirectoryPicker', { value: () => Promise.resolve(), configurable: true });
});
afterEach(() => {
  for (const db of opened) db.close(); opened.clear();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (picker) Object.defineProperty(window, 'showDirectoryPicker', picker); else Reflect.deleteProperty(window, 'showDirectoryPicker');
});
function seed(name: string, version: number, store: string, keyPath: string, row: unknown): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, version);
    request.onupgradeneeded = () => request.result.createObjectStore(store, { keyPath }).put(row);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => { opened.add(request.result); resolve(request.result); };
  });
}
function observeOpen(name: string) {
  let signal!: () => void;
  const blocked = new Promise<void>(resolve => { signal = resolve; });
  let finish!: () => void;
  const lateSuccess = new Promise<void>(resolve => { finish = resolve; });
  const requests: IDBOpenDBRequest[] = [];
  const lateCloses: Array<{ db: IDBDatabase; count: () => number }> = [];
  const open = factory.open.bind(factory);
  vi.spyOn(factory, 'open').mockImplementation((dbName, version) => {
    const request = version === undefined ? open(dbName) : open(dbName, version);
    if (dbName === name) {
      requests.push(request); request.addEventListener('blocked', signal);
      request.addEventListener('success', () => {
        const db = request.result; opened.add(db);
        const close = vi.fn(db.close.bind(db)); vi.spyOn(db, 'close').mockImplementation(close);
        lateCloses.push({ db, count: () => close.mock.calls.length }); finish();
      });
    }
    return request;
  });
  return { blocked, requests, lateCloses, lateSuccess };
}
async function read(db: IDBDatabase, store: string, key: IDBValidKey): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result as unknown); request.onerror = () => reject(request.error);
  });
}
const cases = [
  { name: 'labcharts-backups', store: 'snapshots', keyPath: 'id', key: 1, row: { id: 1, value: 'retained backup' },
    load: async () => { const module = await import('../js/backup.js'); return () => module.openBackupDB(); } },
  { name: 'getbased-nutrition-startup-blocked', store: 'meta', keyPath: 'k', key: 'retained', row: { k: 'retained', value: 'retained meal metadata' },
    load: async () => { const module = await import('../js/nutrition-store.js'); return () => module.openNutritionDB('startup-blocked'); } },

];
it.each(cases)('rejects a blocked $name upgrade, retries and closes the rejected late connection without losing records', async fixture => {
  const old = await seed(fixture.name, 1, fixture.store, fixture.keyPath, fixture.row);
  const observed = observeOpen(fixture.name), open = await fixture.load();
  const first = open(); let failure: unknown;
  const settled = first.catch(error => { failure = error; });
  try {
    await observed.blocked; await Promise.resolve(); await Promise.resolve();
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain('blocked');
    const whileBlocked = open(); expect(whileBlocked).toBe(first);
    await expect(whileBlocked).rejects.toThrow('blocked');
    old.close(); await observed.lateSuccess;
    const retry = open(); expect(retry).not.toBe(first);
    const db = await retry; opened.add(db);
    await settled;
    expect(observed.requests).toHaveLength(2);
    expect(observed.lateCloses[0]!.count()).toBe(1);
    expect(await read(db, fixture.store, fixture.key)).toEqual(fixture.row);
  } finally { old.close(); await settled; }
});
it('does not hold optional folder-backup startup behind another open tab', async () => {
  const old = await seed('labcharts-backups', 1, 'snapshots', 'id', { id: 1, value: 'retained' });
  const observed = observeOpen('labcharts-backups'), module = await import('../js/backup.js');
  let completed = false; const startup = module.initFolderBackup().then(() => { completed = true; });
  try {
    await observed.blocked; for (let i = 0; i < 8; i += 1) await Promise.resolve();
    expect(completed).toBe(true);
  } finally { old.close(); await startup; }
});
it('releases the backup database connection for a newer build upgrade', async () => {
  const module = await import('../js/backup.js'); const db = await module.openBackupDB(); opened.add(db);
  let blocked = false;
  const newer = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('labcharts-backups', 3);
    request.onblocked = () => { blocked = true; db.close(); };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  opened.add(newer); expect(blocked).toBe(false);
});

it('finishes nutrition hydration retries while an uncancellable upgrade is blocked', async () => {
  const old = await seed('getbased-nutrition-startup-blocked', 1, 'meta', 'k', { k: 'retained', value: 'retained meal metadata' });
  const observed = observeOpen('getbased-nutrition-startup-blocked');
  const module = await import('../js/nutrition-store.js'), { state } = await import('../js/state.js');
  state.currentProfile = 'startup-blocked';
  const hydration = module.hydrateNutritionSummary('startup-blocked');
  const failure = expect(hydration).rejects.toThrow('blocked');
  try {
    await observed.blocked; await failure;
    expect(observed.requests).toHaveLength(1);
    expect(await read(old, 'meta', 'retained')).toEqual({ k: 'retained', value: 'retained meal metadata' });
    old.close(); await observed.lateSuccess;
    const db = await module.openNutritionDB('startup-blocked'); opened.add(db);
    expect(await read(db, 'meta', 'retained')).toEqual({ k: 'retained', value: 'retained meal metadata' });
  } finally { old.close(); await hydration.catch(() => {}); }
});
