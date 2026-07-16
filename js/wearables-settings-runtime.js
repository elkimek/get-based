// @ts-check
// wearables-settings-runtime.js - Browser runtime adapters for wearable settings hooks.

import { showConfirmDialog } from './utils.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';

const wearableSettingsRuntimeDeps = {
  navigate: null,
  showConfirmDialog,
};

export function configureWearableSettingsRuntimeDeps(deps = {}) {
  const previous = { ...wearableSettingsRuntimeDeps };
  if ('navigate' in deps) {
    wearableSettingsRuntimeDeps.navigate = typeof deps.navigate === 'function'
      ? deps.navigate
      : null;
  }
  if ('showConfirmDialog' in deps) {
    wearableSettingsRuntimeDeps.showConfirmDialog = typeof deps.showConfirmDialog === 'function'
      ? /** @type {typeof showConfirmDialog} */ (deps.showConfirmDialog)
      : null;
  }
  return previous;
}

export function closeWearableSettingsModal() {
  getSettingsModuleFunction('closeSettingsModal')?.();
}

export function navigateWearablesDashboard() {
  wearableSettingsRuntimeDeps.navigate?.('dashboard');
}

/** @param {string} message */
export async function confirmWearableSettingsAction(message) {
  const confirm = wearableSettingsRuntimeDeps.showConfirmDialog;
  return confirm ? !!await confirm(message) : false;
}
