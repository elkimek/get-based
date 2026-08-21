// @ts-check
// settings-runtime.js - Browser runtime adapters for Settings and Tweaks flows.

import { getMeteoConfig, saveMeteoConfig } from './sun-uvdata-config.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';

const DEFAULT_METEO_CONFIG = Object.freeze({
  mode: 'auto',
  selfhostUrl: '',
  selfhostBearer: '',
  privacyRounding: 0.1,
});

/** @type {{
 *   getMeteoConfig: (() => Record<string, any>) | null,
 *   saveMeteoConfig: ((config: Record<string, any>) => boolean | void | Promise<boolean | void>) | null,
 * }} */
const settingsRuntimeDeps = {
  getMeteoConfig: /** @type {null | typeof getMeteoConfig} */ (getMeteoConfig),
  saveMeteoConfig: /** @type {null | typeof saveMeteoConfig} */ (saveMeteoConfig),
};

/**
 * @param {{
 *   getMeteoConfig?: (() => Record<string, any>) | null,
 *   saveMeteoConfig?: ((config: Record<string, any>) => boolean | void | Promise<boolean | void>) | null,
 * }} [deps]
 */
export function configureSettingsRuntimeDeps(deps = {}) {
  const previous = { ...settingsRuntimeDeps };
  if ('getMeteoConfig' in deps) {
    settingsRuntimeDeps.getMeteoConfig = typeof deps.getMeteoConfig === 'function'
      ? deps.getMeteoConfig
      : null;
  }
  if ('saveMeteoConfig' in deps) {
    settingsRuntimeDeps.saveMeteoConfig = typeof deps.saveMeteoConfig === 'function'
      ? deps.saveMeteoConfig
      : null;
  }
  return previous;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : /** @type {any} */ (globalThis);
}

/**
 * @param {string} name
 * @returns {Function | null}
 */
function getRuntimeFunction(name) {
  const runtime = getRuntimeWindow();
  return typeof runtime[name] === 'function' ? runtime[name].bind(runtime) : null;
}

/**
 * @param {FrameRequestCallback} callback
 * @returns {number | null}
 */
export function requestSettingsFrame(callback) {
  const requestFrame = getRuntimeFunction('requestAnimationFrame');
  return requestFrame ? requestFrame(callback) : null;
}

/** @param {number} frameId */
export function cancelSettingsFrame(frameId) {
  const cancelFrame = getRuntimeFunction('cancelAnimationFrame');
  if (cancelFrame) cancelFrame(frameId);
}

/**
 * @param {string} query
 * @returns {boolean}
 */
export function settingsMediaMatches(query) {
  const matchMedia = getRuntimeFunction('matchMedia');
  if (!matchMedia) return false;
  try {
    return matchMedia(query)?.matches === true;
  } catch {
    return false;
  }
}

/**
 * @param {string} type
 * @param {EventListenerOrEventListenerObject} listener
 */
export function addSettingsRuntimeEventListener(type, listener) {
  const addEventListener = getRuntimeFunction('addEventListener');
  if (addEventListener) addEventListener(type, listener);
}

/**
 * @param {{
 *   settingsVisible?: boolean,
 *   updateSettingsUI?: () => void,
 *   updateTweaksUI?: () => void,
 * }} [options]
 */
export function refreshSettingsRuntimeSurfaces(options = {}) {
  const runtime = getRuntimeWindow();
  (options.updateSettingsUI || getSettingsModuleFunction('updateSettingsUI'))?.();
  (options.updateTweaksUI || getSettingsModuleFunction('updateTweaksUI'))?.();
  if (options.settingsVisible) runtime.refreshSettingsWearables?.();
}

export function getSettingsMeteoConfig() {
  const readMeteoConfig = settingsRuntimeDeps.getMeteoConfig;
  if (!readMeteoConfig) return { ...DEFAULT_METEO_CONFIG };
  try {
    return readMeteoConfig() || { ...DEFAULT_METEO_CONFIG };
  } catch {
    return { ...DEFAULT_METEO_CONFIG };
  }
}

/**
 * @param {Record<string, any>} config
 * @returns {Promise<boolean>}
 */
export async function saveSettingsMeteoConfig(config) {
  const writeMeteoConfig = settingsRuntimeDeps.saveMeteoConfig;
  if (!writeMeteoConfig) return false;
  try {
    return await writeMeteoConfig(config) !== false;
  } catch {
    return false;
  }
}
