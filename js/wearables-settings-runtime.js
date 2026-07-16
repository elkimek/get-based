// @ts-check
// wearables-settings-runtime.js - Browser runtime adapters for wearable settings hooks.

import { showConfirmDialog } from './utils.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';
import { getViewRuntimeFunction } from './views-runtime-bridge.js';

const wearableSettingsRuntimeDeps = { showConfirmDialog };

export function configureWearableSettingsRuntimeDeps(deps = {}) {
  const previous = { ...wearableSettingsRuntimeDeps };
  if ('showConfirmDialog' in deps) {
    wearableSettingsRuntimeDeps.showConfirmDialog = typeof deps.showConfirmDialog === 'function'
      ? /** @type {typeof showConfirmDialog} */ (deps.showConfirmDialog)
      : null;
  }
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

export function closeWearableSettingsModal() {
  getSettingsModuleFunction('closeSettingsModal')?.();
}

export function navigateWearablesDashboard() {
  getRuntimeFunction('navigate')?.('dashboard');
}

/** @param {string} message */
export async function confirmWearableSettingsAction(message) {
  const confirm = wearableSettingsRuntimeDeps.showConfirmDialog;
  return confirm ? !!await confirm(message) : false;
}
