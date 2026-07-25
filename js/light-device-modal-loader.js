// @ts-check
// light-device-modal-loader.js — cold facade for Light device form modals.

import { showNotification } from './utils.js';

/** @typedef {typeof import('./light-device-setup-modal.js')} LightDeviceSetupModule */
/** @typedef {typeof import('./light-device-session-modal.js')} LightDeviceSessionModule */

/** @type {Record<string, any>} */
const setupDeps = {};
/** @type {Record<string, any>} */
const sessionDeps = {};

/** @type {Promise<LightDeviceSetupModule> | null} */
let setupModulePromise = null;
/** @type {LightDeviceSetupModule | null} */
let setupModule = null;
let useSetupRetryUrl = false;

/** @type {Promise<LightDeviceSessionModule> | null} */
let sessionModulePromise = null;
/** @type {LightDeviceSessionModule | null} */
let sessionModule = null;
let useSessionRetryUrl = false;

export function configureLightDeviceModalLoader(deps = {}) {
  if (deps.setup && typeof deps.setup === 'object') Object.assign(setupDeps, deps.setup);
  if (deps.session && typeof deps.session === 'object') Object.assign(sessionDeps, deps.session);
  setupModule?.configureLightDeviceSetup(setupDeps);
}

export function isLightDeviceSetupModuleLoaded() {
  return setupModule !== null;
}

/** @returns {Promise<LightDeviceSetupModule>} */
function loadSetupRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./light-device-setup-modal.js?lazy-retry=1');
}

/** @returns {Promise<LightDeviceSetupModule>} */
export function loadLightDeviceSetupModule() {
  if (!setupModulePromise) {
    const load = useSetupRetryUrl
      ? loadSetupRetryModule()
      : import('./light-device-setup-modal.js');
    setupModulePromise = load
      .then(module => {
        setupModule = module;
        module.configureLightDeviceSetup(setupDeps);
        return module;
      })
      .catch(error => {
        setupModulePromise = null;
        setupModule = null;
        useSetupRetryUrl = true;
        throw error;
      });
  }
  return setupModulePromise;
}

export async function openAddDeviceDialog() {
  try {
    const module = setupModule || await loadLightDeviceSetupModule();
    return await module.openAddDeviceDialog();
  } catch (error) {
    console.error('[light-devices] Could not open device setup:', error);
    showNotification('Light device setup could not be loaded. Try again.', 'error');
    return false;
  }
}

export async function openCustomDeviceDialog() {
  try {
    const module = setupModule || await loadLightDeviceSetupModule();
    return await module.openCustomDeviceDialog();
  } catch (error) {
    console.error('[light-devices] Could not open custom device setup:', error);
    showNotification('Light device setup could not be loaded. Try again.', 'error');
    return false;
  }
}

export function isLightDeviceSessionModuleLoaded() {
  return sessionModule !== null;
}

/** @returns {Promise<LightDeviceSessionModule>} */
function loadSessionRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./light-device-session-modal.js?lazy-retry=1');
}

/** @returns {Promise<LightDeviceSessionModule>} */
export function loadLightDeviceSessionModule() {
  if (!sessionModulePromise) {
    const load = useSessionRetryUrl
      ? loadSessionRetryModule()
      : import('./light-device-session-modal.js');
    sessionModulePromise = load
      .then(module => (sessionModule = module))
      .catch(error => {
        sessionModulePromise = null;
        sessionModule = null;
        useSessionRetryUrl = true;
        throw error;
      });
  }
  return sessionModulePromise;
}

export async function openDeviceSessionDialog(deviceId) {
  try {
    const module = sessionModule || await loadLightDeviceSessionModule();
    return await module.openDeviceSessionDialog(deviceId, sessionDeps);
  } catch (error) {
    console.error('[light-devices] Could not open session dialog:', error);
    showNotification('Light device session tools could not be loaded. Try again.', 'error');
    return false;
  }
}
