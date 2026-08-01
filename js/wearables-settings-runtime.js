// @ts-check
// wearables-settings-runtime.js - Browser runtime adapters for wearable settings hooks.

import { showConfirmDialog } from './utils.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';

/** @type {{ navigate: ((route: string) => void) | null, showConfirmDialog: (typeof showConfirmDialog) | null }} */
const wearableSettingsRuntimeDeps = {
  navigate: null,
  showConfirmDialog,
};

export function configureWearableSettingsRuntimeDeps(deps = {}) {
  const previous = { ...wearableSettingsRuntimeDeps };
  if ('navigate' in deps) {
    wearableSettingsRuntimeDeps.navigate = typeof deps.navigate === 'function'
      ? /** @type {(route: string) => void} */ (deps.navigate)
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

/**
 * @param {string} message
 * @param {{ confirmLabel?: string, cancelLabel?: string, tone?: 'danger' | 'primary', ariaLabel?: string }} [options]
 */
export async function confirmWearableSettingsAction(message, options = {}) {
  const confirm = wearableSettingsRuntimeDeps.showConfirmDialog;
  return confirm ? !!await confirm(message, options) : false;
}
