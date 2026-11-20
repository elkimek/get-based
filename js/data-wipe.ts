// data-wipe.ts — destructive local storage cleanup helpers
import { releaseAppStorageForErasure } from './app-erasure-hooks.js';

const APP_SESSION_KEY_RE = /^(?:labcharts|chat-onboard-|or_|welcome-details-open$|(?:oura|withings|ultrahuman|polar|whoop|fitbit|google_health)-oauth-pending$)/;
const SHARE_MANAGEMENT_KEY = 'getbased-profile-shares-v1';
const EVOLU_OPFS_NAME = /^\.(?:getbased4|getbased8g[1-9]\d*)(?:-[A-Za-z0-9_-]+)?$/;

function failure(label: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'unknown error');
  return new Error(`${label}: ${message}`, { cause: error });
}

async function deleteIndexedDBDatabase(name: string) {
  if (!name || typeof indexedDB === 'undefined') return;
  if (typeof indexedDB.deleteDatabase !== 'function') {
    throw new Error('IndexedDB deletion is unavailable.');
  }
  await new Promise<void>((resolve, reject) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve(undefined);
      request.onerror = () => reject(request.error || new Error('IndexedDB deletion failed.'));
      request.onblocked = () => reject(
        new Error('Deletion is blocked by another open Get Based tab. Close it and try again.'),
      );
    } catch (error) {
      reject(error);
    }
  });
}

function collectKnownProfileIds(errors: Error[]) {
  const ids = new Set(['default']);
  try {
    const active = localStorage.getItem('labcharts-active-profile');
    if (active) ids.add(active);
  } catch (error) {
    errors.push(failure('Could not read the active profile id', error));
  }
  try {
    const raw = localStorage.getItem('labcharts-profiles');
    if (raw && !raw.startsWith('v1:')) {
      const profiles = JSON.parse(raw);
      if (Array.isArray(profiles)) {
        for (const profile of profiles) {
          if (profile?.id && typeof profile.id === 'string') ids.add(profile.id);
        }
      }
    }
  } catch (error) {
    errors.push(failure('Could not read the stored profile list', error));
  }
  return [...ids];
}

function collectStorageKeys(storage: Storage | null | undefined, ownsKey: (key: string) => boolean, label: string, errors: Error[]): string[] {
  const keys: string[] = [];
  if (!storage) return keys;
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key && ownsKey(key)) keys.push(key);
    }
  } catch (error) {
    errors.push(failure(`Could not enumerate ${label}`, error));
  }
  return keys;
}

function removeStorageKeys(storage: Storage, keys: string[], label: string, errors: Error[]) {
  for (const key of keys) {
    try {
      storage.removeItem(key);
    } catch (error) {
      errors.push(failure(`Could not remove ${label} key ${key}`, error));
    }
  }
}

async function deleteIndexedDBDatabasesByPrefix(prefixes: string[], fallbackNames: string[], errors: Error[]) {
  if (typeof indexedDB === 'undefined') return;
  const names = new Set(fallbackNames);
  if (typeof indexedDB.databases === 'function') {
    try {
      const databases = await indexedDB.databases();
      for (const database of databases || []) {
        const name = database?.name || '';
        if (prefixes.some(prefix => name.startsWith(prefix))) names.add(name);
      }
    } catch (error) {
      errors.push(failure('Could not enumerate IndexedDB databases', error));
    }
  }
  const results = await Promise.allSettled([...names].map(deleteIndexedDBDatabase));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      errors.push(failure(`Could not delete IndexedDB database ${[...names][index]}`, result.reason));
    }
  });
}

async function deleteAppCaches(errors: Error[]) {
  if (typeof caches === 'undefined' || typeof caches.keys !== 'function') return;
  let keys;
  try {
    keys = await caches.keys();
  } catch (error) {
    errors.push(failure('Could not enumerate application caches', error));
    return;
  }
  const appKeys = keys.filter(key => key.startsWith('labcharts-'));
  const results = await Promise.allSettled(appKeys.map(async key => {
    const deleted = await caches.delete(key);
    if (!deleted) throw new Error('Cache was not deleted.');
  }));
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      errors.push(failure(`Could not delete application cache ${appKeys[index]}`, result.reason));
    }
  });
}

async function eraseAppFiles(errors: Error[]) {
  if (typeof globalThis.navigator?.storage?.getDirectory !== 'function') return;
  try {
    const directory = await navigator.storage.getDirectory() as FileSystemDirectoryHandle & {
      entries(): AsyncIterable<[string, FileSystemHandle]>;
    };
    for await (const [name, handle] of directory.entries()) {
      if (handle.kind !== 'directory' || (name !== 'lens-local' && !EVOLU_OPFS_NAME.test(name))) continue;
      try {
        await directory.removeEntry(name, { recursive: true });
      } catch (error) {
        if ((error as { name?: string })?.name !== 'NotFoundError') errors.push(failure(`Could not erase application files in ${name}`, error));
      }
    }
  } catch (error) {
    errors.push(failure('Could not erase origin-private application files', error));
  }
}

export async function eraseAllLocalAppData() {
  const errors: Error[] = [];
  const profileIds = collectKnownProfileIds(errors);
  const localKeys = collectStorageKeys(
    globalThis.localStorage,
    key => key.startsWith('labcharts') || key === SHARE_MANAGEMENT_KEY || key.startsWith(SHARE_MANAGEMENT_KEY + ':'),
    'local storage',
    errors,
  );
  const sessionKeys = collectStorageKeys(
    globalThis.sessionStorage,
    key => APP_SESSION_KEY_RE.test(key),
    'session storage',
    errors,
  );

  try { await releaseAppStorageForErasure(); } catch (error) { errors.push(failure('Could not close application data owners', error)); }
  await eraseAppFiles(errors);
  removeStorageKeys(globalThis.localStorage, localKeys, 'local storage', errors);
  removeStorageKeys(globalThis.sessionStorage, sessionKeys, 'session storage', errors);
  await deleteIndexedDBDatabasesByPrefix(
    ['labcharts-', 'getbased-nutrition-', 'getbased-evolu8-'],
    [
      ...profileIds.flatMap(id => [
        `labcharts-wearables-${id}`,
        `labcharts-cycle-${id}`,
        `getbased-nutrition-${id}`,
      ]),
      'labcharts-backups',
      'labcharts-blobs',
      'labcharts-wearables-credential-vault',
      'getbased-evolu8-identity',
    ],
    errors,
  );
  for (const name of ['getbased-cashu']) {
    try {
      await deleteIndexedDBDatabase(name);
    } catch (error) {
      errors.push(failure(`Could not delete IndexedDB database ${name}`, error));
    }
  }
  await deleteAppCaches(errors);

  if (errors.length) {
    throw new AggregateError(
      errors,
      `Local data erasure was incomplete (${errors.length} operation${errors.length === 1 ? '' : 's'} failed).`,
    );
  }
}
