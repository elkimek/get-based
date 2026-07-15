// @ts-check
// wearables-connect-runtime.js - Browser runtime adapters for wearable connect orchestration.

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

export function getWearableOAuthSearchParamsRuntime() {
  const runtime = getRuntimeWindow();
  return new URLSearchParams(runtime?.location?.search || '');
}

export function clearWearableOAuthCallbackRuntime() {
  const runtime = getRuntimeWindow();
  if (!runtime?.history || typeof runtime.history.replaceState !== 'function') return;
  try { runtime.history.replaceState(null, '', runtime.location?.pathname || ''); } catch {}
}

export function navigateWearablesDashboardAfterConnectRuntime() {
  getRuntimeFunction('navigate')?.('dashboard');
}

/** @param {EventListenerOrEventListenerObject} handler */
export function addWearablesBeforeUnloadRuntime(handler) {
  const runtime = getRuntimeWindow();
  if (!runtime || typeof runtime.addEventListener !== 'function') return false;
  runtime.addEventListener('beforeunload', handler);
  return true;
}
