// @ts-check
// sync-disable-cleanup.js - local cleanup helpers for disabling sync.

export function isSyncDisableCleanupKey(key) {
  return !!key
    && (key.includes('-delta-')
      || key.includes('-sync-cutover-v2')
      || key.endsWith('-sync-dirty')
      || key.includes('-relay-bytes-')
      || key.startsWith('labcharts-relay-cap-')
      || key === 'labcharts-sync-restore-join-pending'
      || key === 'labcharts-relay-quota-warned');
}

/** @param {{ preserveDirtyProfileIds?: string[] }} [options] */
export function clearSyncDisableStorage(options = {}) {
  const preservedDirtyKeys = new Set(
    (Array.isArray(options.preserveDirtyProfileIds) ? options.preserveDirtyProfileIds : [])
      .filter(profileId => typeof profileId === 'string' && /^[a-zA-Z0-9_-]+$/.test(profileId))
      .map(profileId => `labcharts-${profileId}-sync-dirty`),
  );
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.endsWith('-sync-ts')) localStorage.removeItem(key);
  }

  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && isSyncDisableCleanupKey(key) && !preservedDirtyKeys.has(key)) localStorage.removeItem(key);
  }
}
