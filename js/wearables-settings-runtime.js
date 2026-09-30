// @ts-check
// wearables-settings-runtime.js - Browser runtime adapters for wearable settings hooks.

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
import { showConfirmDialog } from './utils.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';

/** @type {{ navigate: ((route: string) => void) | null, showConfirmDialog: (typeof showConfirmDialog) | null }} */
const wearableSettingsRuntimeDeps = {
  navigate: null,
  showConfirmDialog,
};

export function configureWearableSettingsRuntimeDeps(deps = {}) {
  return configureRuntimeCallbacks(wearableSettingsRuntimeDeps, deps, 'inherited');
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
