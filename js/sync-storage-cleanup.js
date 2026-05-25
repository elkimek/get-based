// sync-storage-cleanup.js - emergency localStorage compaction for sync.

import { state } from './state.js';
import { showNotification } from './utils.js';
import { logSyncEvent } from './sync-state.js';

// "Clean storage" - emergency localStorage compaction. The 'imported'
// blob can grow past the browser's 5 MB localStorage cap (caps were
// bypassed by the cross-device merge before the data-merge.js fix).
// When that happens every saveImportedData() throws QuotaExceededError
// and pushes wedge silently. This trims changeHistory to its intended
// 200-cap, drops cached model lists (re-fetched on demand), and reports
// before/after sizes via showNotification. Reachable from the sync
// popover so a phone user can run it without dev-tools access.
export async function cleanStorage() {
  let beforeBytes = 0;
  for (const key of Object.keys(localStorage)) beforeBytes += new Blob([localStorage.getItem(key) || '']).size;

  // 1. Drop ephemeral model-list caches - safe, will re-fetch on next API use.
  const cacheKeys = [
    'labcharts-openrouter-models',
    'labcharts-venice-models',
    'labcharts-ppq-models',
    'labcharts-routstr-models',
    'labcharts-venice-e2ee-models',
  ];
  let cachesCleared = 0;
  for (const k of cacheKeys) {
    if (localStorage.getItem(k) != null) { localStorage.removeItem(k); cachesCleared++; }
  }

  // 2. Cap changeHistory in state.importedData if it's grown past 200.
  let historyTrimmed = 0;
  if (Array.isArray(state.importedData?.changeHistory) && state.importedData.changeHistory.length > 200) {
    historyTrimmed = state.importedData.changeHistory.length - 200;
    state.importedData.changeHistory = state.importedData.changeHistory.slice(-200);
    try {
      const { saveImportedData } = await import('./data.js');
      await saveImportedData();
    } catch (e) {
      console.warn('[sync] cleanStorage: saveImportedData failed:', e?.message || e);
    }
  }

  let afterBytes = 0;
  for (const key of Object.keys(localStorage)) afterBytes += new Blob([localStorage.getItem(key) || '']).size;
  const freedKB = ((beforeBytes - afterBytes) / 1024).toFixed(0);
  const beforeMB = (beforeBytes / 1024 / 1024).toFixed(2);
  const afterMB = (afterBytes / 1024 / 1024).toFixed(2);

  const msg = `Storage: ${beforeMB} MB → ${afterMB} MB (freed ${freedKB} KB). ` +
              `Caches cleared: ${cachesCleared}. ` +
              `History trimmed: ${historyTrimmed}.`;
  logSyncEvent('cleanup', msg);
  showNotification(msg, freedKB > 0 ? 'success' : 'info');
  return { beforeBytes, afterBytes, freedKB: +freedKB, cachesCleared, historyTrimmed };
}
