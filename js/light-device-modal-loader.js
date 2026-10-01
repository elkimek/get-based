// @ts-check
// light-device-modal-loader.js — cold facade for Light device form modals.

import { createRetryingModuleLoader } from './retrying-module-loader.js';
import { showNotification } from './utils.js';

/** @typedef {typeof import('./light-device-setup-modal.js')} LightDeviceSetupModule */
/** @typedef {typeof import('./light-device-session-modal.js')} LightDeviceSessionModule */

/** @type {Record<string, any>} */
const setupDeps = {};
/** @type {Record<string, any>} */
const sessionDeps = {};

const sessionModuleLoader = createRetryingModuleLoader(
  retry => retry ? loadSessionRetryModule() : import('./light-device-session-modal.js'),
);

const setupModuleLoader = createRetryingModuleLoader(
  retry => retry ? loadSetupRetryModule() : import('./light-device-setup-modal.js'),
  module => {
    module.configureLightDeviceSetup(setupDeps);
    return module;
  },
);

export function configureLightDeviceModalLoader(deps = {}) {
  if (deps.setup && typeof deps.setup === 'object') Object.assign(setupDeps, deps.setup);
  if (deps.session && typeof deps.session === 'object') Object.assign(sessionDeps, deps.session);
  setupModuleLoader.module?.configureLightDeviceSetup(setupDeps);
}

export function isLightDeviceSetupModuleLoaded() {
  return setupModuleLoader.module !== null;
}

/** @returns {Promise<LightDeviceSetupModule>} */
function loadSetupRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./light-device-setup-modal.js?lazy-retry=1');
}

/** @returns {Promise<LightDeviceSetupModule>} */
export function loadLightDeviceSetupModule() {
  return setupModuleLoader.load();
}

export async function openAddDeviceDialog() {
  try {
    const module = setupModuleLoader.module || await loadLightDeviceSetupModule();
    return await module.openAddDeviceDialog();
  } catch (error) {
    console.error('[light-devices] Could not open device setup:', error);
    showNotification('Light device setup could not be loaded. Try again.', 'error');
    return false;
  }
}

export async function openCustomDeviceDialog() {
  try {
    const module = setupModuleLoader.module || await loadLightDeviceSetupModule();
    return await module.openCustomDeviceDialog();
  } catch (error) {
    console.error('[light-devices] Could not open custom device setup:', error);
    showNotification('Light device setup could not be loaded. Try again.', 'error');
    return false;
  }
}

export function isLightDeviceSessionModuleLoaded() {
  return sessionModuleLoader.module !== null;
}

/** @returns {Promise<LightDeviceSessionModule>} */
function loadSessionRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./light-device-session-modal.js?lazy-retry=1');
}

/** @returns {Promise<LightDeviceSessionModule>} */
export function loadLightDeviceSessionModule() {
  return sessionModuleLoader.load();
}

export async function openDeviceSessionDialog(deviceId) {
  try {
    const module = sessionModuleLoader.module || await loadLightDeviceSessionModule();
    return await module.openDeviceSessionDialog(deviceId, sessionDeps);
  } catch (error) {
    console.error('[light-devices] Could not open session dialog:', error);
    showNotification('Light device session tools could not be loaded. Try again.', 'error');
    return false;
  }
}
