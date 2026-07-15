// @ts-check
// sync-pull-active-refresh-runtime.js - Browser runtime adapters for active sync pull refresh hooks.

import { getViewRuntimeFunction } from './views-runtime-bridge.js';

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
      getRuntimeFunction('renderThreadList')?.();
      return false;
    }
    getRuntimeFunction('ensureActiveThread')?.();
    getRuntimeFunction('renderThreadList')?.();
    return getRuntimeFunction('loadChatHistory')?.();
  };

  const loaded = getRuntimeFunction('loadChatThreads')?.();
  if (loaded && typeof loaded.then === 'function') {
    return loaded.then(finishRefresh);
  }
  return finishRefresh(loaded);
}

export function rebuildPulledSidebarRuntime() {
  try { getRuntimeFunction('buildSidebar')?.(); } catch {}
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
