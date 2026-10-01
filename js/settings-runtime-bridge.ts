// settings-runtime-bridge.js - Cycle-safe access to Settings module actions.

import { configureModuleBridge, getModuleBridgeFunction } from './runtime-callbacks.js';

const settingsModuleBridge: Record<string, unknown> = Object.create(null);

export function configureSettingsModuleBridge(api: Record<string, unknown> = {}) {
  return configureModuleBridge(settingsModuleBridge, api);
}

export function getSettingsModuleFunction(name: string) {
  return getModuleBridgeFunction(settingsModuleBridge, name);
}
