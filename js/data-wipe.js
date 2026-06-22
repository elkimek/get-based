// @ts-check
// data-wipe.js — destructive local storage cleanup helpers

async function deleteIndexedDBDatabase(name) {
  if (!name || typeof indexedDB === 'undefined') return;
  await new Promise((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      // If another open connection blocks deletion, resolve so callers can
      // continue to reload; the browser completes the delete when handles close.
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

function collectKnownProfileIds() {
  const ids = new Set(['default']);
  try {
    const active = localStorage.getItem('labcharts-active-profile');
    if (active) ids.add(active);
  } catch {}
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
  } catch {}
  return [...ids];
}

async function deleteIndexedDBDatabasesByPrefix(prefixes, fallbackNames = []) {
  const names = new Set(fallbackNames);
  try {
    if (typeof indexedDB?.databases === 'function') {
      const dbs = await indexedDB.databases();
      for (const db of dbs || []) {
        const name = db?.name || '';
        if (prefixes.some(prefix => name.startsWith(prefix))) names.add(name);
      }
    }
  } catch {}
  await Promise.all([...names].map(deleteIndexedDBDatabase));
}

async function deleteAppCaches() {
  try {
    if (typeof caches === 'undefined' || typeof caches.keys !== 'function') return;
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('labcharts-'))
      .map(key => caches.delete(key)));
  } catch {}
}

export async function eraseAllLocalAppData() {
  const profileIds = collectKnownProfileIds();
  const keysToRemove = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('labcharts')) keysToRemove.push(key);
    }
  } catch {}

  for (const key of keysToRemove) {
    try { localStorage.removeItem(key); } catch {}
  }

  await deleteIndexedDBDatabasesByPrefix(
    ['labcharts-wearables-'],
    profileIds.map(id => `labcharts-wearables-${id}`),
  );
  await deleteIndexedDBDatabase('labcharts-blobs');
  await deleteIndexedDBDatabase('getbased-cashu');
  await deleteAppCaches();
}

