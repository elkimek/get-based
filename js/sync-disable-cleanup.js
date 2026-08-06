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

export function clearSyncDisableStorage() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.endsWith('-sync-ts')) localStorage.removeItem(key);
  }

  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && isSyncDisableCleanupKey(key)) localStorage.removeItem(key);
  }
}
