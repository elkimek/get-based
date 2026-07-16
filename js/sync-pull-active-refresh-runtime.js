// @ts-check
// sync-pull-active-refresh-runtime.js - Browser runtime adapters for active sync pull refresh hooks.

import { getViewRuntimeFunction } from './views-runtime-bridge.js';

const syncPullActiveRefreshDeps = {
  ensureActiveThread: () => {},
  loadChatHistory: () => undefined,
  loadChatThreads: () => undefined,
  renderThreadList: () => {},
};

export function configureSyncPullActiveRefreshDeps(deps = {}) {
  const previous = { ...syncPullActiveRefreshDeps };
  if (typeof deps.ensureActiveThread === 'function') syncPullActiveRefreshDeps.ensureActiveThread = deps.ensureActiveThread;
  if (typeof deps.loadChatHistory === 'function') syncPullActiveRefreshDeps.loadChatHistory = deps.loadChatHistory;
  if (typeof deps.loadChatThreads === 'function') syncPullActiveRefreshDeps.loadChatThreads = deps.loadChatThreads;
  if (typeof deps.renderThreadList === 'function') syncPullActiveRefreshDeps.renderThreadList = deps.renderThreadList;
  return previous;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

/**
 * @param {string} name
 * @returns {Function | null}
 */
function getRuntimeFunction(name) {
  const runtime = getRuntimeWindow();
  if (!runtime) return null;
  const fn = runtime[name];
  if (typeof fn === 'function') return fn.bind(runtime);
  return name === 'navigate' ? getViewRuntimeFunction(name) : null;
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
  try { getViewRuntimeFunction('buildSidebar')?.(); } catch {}
}

/**
 * @param {string} route
 * @param {Record<string, unknown> | undefined} [options]
 */
export function navigatePulledActiveViewRuntime(route, options) {
  getRuntimeFunction('navigate')?.(route, options);
}

export function dispatchSyncAppliedRuntime() {
  const runtime = getRuntimeWindow();
  if (!runtime || typeof runtime.CustomEvent !== 'function' || typeof runtime.dispatchEvent !== 'function') return;
  try { runtime.dispatchEvent(new runtime.CustomEvent('labcharts-sync-applied')); } catch (_) {}
}
