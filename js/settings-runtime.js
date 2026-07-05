// @ts-check
// settings-runtime.js - Browser runtime adapters for Settings and Tweaks flows.

const DEFAULT_METEO_CONFIG = Object.freeze({
  mode: 'auto',
  selfhostUrl: '',
  selfhostBearer: '',
  privacyRounding: 0.1,
});

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

/** @param {{ settingsVisible?: boolean }} [options] */
export function refreshSettingsRuntimeSurfaces(options = {}) {
  const runtime = getRuntimeWindow();
  runtime.updateSettingsUI?.();
  runtime.updateTweaksUI?.();
  if (options.settingsVisible) runtime.refreshSettingsWearables?.();
}

/** @param {{ batchSize?: number }} [options] */
export function refreshSettingsChartThemeColors(options = {}) {
  getRuntimeFunction('refreshChartThemeColors')?.(options);
}

export function getSettingsMeteoConfig() {
  const getMeteoConfig = getRuntimeFunction('getMeteoConfig');
  if (!getMeteoConfig) return { ...DEFAULT_METEO_CONFIG };
  try {
    return getMeteoConfig() || { ...DEFAULT_METEO_CONFIG };
  } catch {
    return { ...DEFAULT_METEO_CONFIG };
  }
}

/**
 * @param {Record<string, any>} config
 * @returns {boolean}
 */
export function saveSettingsMeteoConfig(config) {
  const saveMeteoConfig = getRuntimeFunction('saveMeteoConfig');
  if (!saveMeteoConfig) return false;
  saveMeteoConfig(config);
  return true;
}

/** @param {Record<string, any>} api */
export function publishSettingsGlobals(api) {
  Object.assign(getRuntimeWindow(), api);
}
