// sync-pull-maintenance.js - one-time pull-path cleanup helpers.

// One-time cleanup: the v1.6.0-v1.6.2 hash-skip mechanism wrote
// `labcharts-{profileId}-sync-hash` keys; v1.6.3 removed the skip
// path entirely (bytes were occasionally stranding rows when local
// state went out of sync with the stored hash). Sweep the now-orphan
// keys on first pull after upgrade. Linear in localStorage keys,
// idempotent via the migration flag.
export function clearStaleSyncHashKeysOnce(debug = () => {}) {
  try {
    if (localStorage.getItem('labcharts-sync-hash-v2-migrated')) return;
    const toClear = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('labcharts-') && k.endsWith('-sync-hash')) toClear.push(k);
    }
    for (const k of toClear) localStorage.removeItem(k);
    localStorage.setItem('labcharts-sync-hash-v2-migrated', '1');
    if (toClear.length) debug(`Cleared ${toClear.length} stale -sync-hash keys (one-time migration)`);
  } catch (e) {}
}
