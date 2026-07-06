// @ts-check
// sync-pull-active-refresh-runtime.js - Browser runtime adapters for active sync pull refresh hooks.

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
  return runtime && typeof runtime[name] === 'function' ? runtime[name].bind(runtime) : null;
}

export function refreshPulledChatRuntime() {
  getRuntimeFunction('loadChatThreads')?.();
  getRuntimeFunction('ensureActiveThread')?.();
  getRuntimeFunction('renderThreadList')?.();
  getRuntimeFunction('loadChatHistory')?.();
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
