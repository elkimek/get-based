// @ts-check
// wearables-settings-runtime.js - Browser runtime adapters for wearable settings hooks.

import { showConfirmDialog } from './utils.js';

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
  return runtime && typeof runtime[name] === 'function' ? runtime[name].bind(runtime) : null;
}

export function closeWearableSettingsModal() {
  getRuntimeFunction('closeSettingsModal')?.();
}

export function navigateWearablesDashboard() {
  getRuntimeFunction('navigate')?.('dashboard');
}

/** @param {string} message */
export async function confirmWearableSettingsAction(message) {
  const confirm = wearableSettingsRuntimeDeps.showConfirmDialog;
  return confirm ? !!await confirm(message) : false;
}

/** @param {Record<string, unknown>} bindings */
export function exposeWearableSettingsBindings(bindings) {
  const runtime = getRuntimeWindow();
  if (runtime) Object.assign(runtime, bindings);
}
