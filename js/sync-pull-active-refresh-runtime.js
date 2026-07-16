// @ts-check
// sync-pull-active-refresh-runtime.js - Browser runtime adapters for active sync pull refresh hooks.

const syncPullActiveRefreshDeps = {
  buildSidebar: null,
  ensureActiveThread: () => {},
  loadChatHistory: () => undefined,
  loadChatThreads: () => undefined,
  navigate: null,
  renderThreadList: () => {},
};

export function configureSyncPullActiveRefreshDeps(deps = {}) {
  const previous = { ...syncPullActiveRefreshDeps };
  if ('buildSidebar' in deps) syncPullActiveRefreshDeps.buildSidebar = typeof deps.buildSidebar === 'function' ? deps.buildSidebar : null;
  if (typeof deps.ensureActiveThread === 'function') syncPullActiveRefreshDeps.ensureActiveThread = deps.ensureActiveThread;
  if (typeof deps.loadChatHistory === 'function') syncPullActiveRefreshDeps.loadChatHistory = deps.loadChatHistory;
  if (typeof deps.loadChatThreads === 'function') syncPullActiveRefreshDeps.loadChatThreads = deps.loadChatThreads;
  if ('navigate' in deps) syncPullActiveRefreshDeps.navigate = typeof deps.navigate === 'function' ? deps.navigate : null;
  if (typeof deps.renderThreadList === 'function') syncPullActiveRefreshDeps.renderThreadList = deps.renderThreadList;
  return previous;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

export function refreshPulledChatRuntime() {
  const finishRefresh = (threadsLoaded) => {
    if (threadsLoaded === false) {
      syncPullActiveRefreshDeps.renderThreadList();
      return false;
    }
    syncPullActiveRefreshDeps.ensureActiveThread();
    syncPullActiveRefreshDeps.renderThreadList();
    return syncPullActiveRefreshDeps.loadChatHistory();
  };

  const loaded = syncPullActiveRefreshDeps.loadChatThreads();
  if (loaded && typeof loaded.then === 'function') {
    return loaded.then(finishRefresh);
  }
  return finishRefresh(loaded);
}

export function rebuildPulledSidebarRuntime() {
  try { syncPullActiveRefreshDeps.buildSidebar?.(); } catch {}
}

/**
 * @param {string} route
 * @param {Record<string, unknown> | undefined} [options]
 */
export function navigatePulledActiveViewRuntime(route, options) {
  syncPullActiveRefreshDeps.navigate?.(route, options);
}

export function dispatchSyncAppliedRuntime() {
  const runtime = getRuntimeWindow();
  if (!runtime || typeof runtime.CustomEvent !== 'function' || typeof runtime.dispatchEvent !== 'function') return;
  try { runtime.dispatchEvent(new runtime.CustomEvent('labcharts-sync-applied')); } catch (_) {}
}
