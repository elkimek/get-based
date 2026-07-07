// @ts-check
// utils-runtime.js - Browser runtime adapters for shared utilities.

function getUtilsRuntime() {
  return typeof window !== 'undefined'
    ? /** @type {Window & typeof globalThis} */ (window)
    : null;
}

export function hasUtilsRuntime() {
  return getUtilsRuntime() !== null;
}

/** @param {string} [fallback] */
export function getAppVersionRuntime(fallback = '') {
  const version = getUtilsRuntime()?.APP_VERSION;
  return typeof version === 'string' && version ? version : fallback;
}

/** @param {string} [fallback] */
export function getUtilsRuntimeHostname(fallback = '') {
  const hostname = getUtilsRuntime()?.location?.hostname;
  return typeof hostname === 'string' ? hostname : fallback;
}

/**
 * @param {string} name
 * @param {any} [fallback]
 */
export function getUtilsRuntimeValue(name, fallback = null) {
  const runtime = getUtilsRuntime();
  if (!runtime || !(name in runtime)) return fallback;
  return runtime[name];
}

/**
 * @param {string} name
 * @returns {Function | null}
 */
export function getUtilsRuntimeFunction(name) {
  const runtime = getUtilsRuntime();
  const fn = runtime?.[name];
  return typeof fn === 'function' ? fn.bind(runtime) : null;
}

/** @param {Record<string, any>} exportsByName */
export function registerUtilsRuntimeExports(exportsByName) {
  const runtime = getUtilsRuntime();
  if (!runtime || !exportsByName) return false;
  Object.assign(runtime, exportsByName);
  return true;
}

/**
 * @param {string} name
 * @param {...any} args
 */
export function callUtilsRuntimeFunction(name, ...args) {
  const runtime = getUtilsRuntime();
  const fn = runtime?.[name];
  return typeof fn === 'function' ? fn.apply(runtime, args) : undefined;
}

/**
 * @param {string} name
 * @param {Record<string, any>} [detail]
 */
export function dispatchUtilsRuntimeEvent(name, detail) {
  const runtime = getUtilsRuntime();
  const CustomEventCtor = runtime?.CustomEvent;
  if (!runtime || typeof runtime.dispatchEvent !== 'function' || typeof CustomEventCtor !== 'function') return false;
  runtime.dispatchEvent(new CustomEventCtor(name, detail === undefined ? undefined : { detail }));
  return true;
}

/**
 * @param {string | URL} url
 * @param {string} [target]
 * @param {string} [features]
 * @returns {WindowProxy | null}
 */
export function openUtilsRuntimeWindow(url, target = '_blank', features) {
  const runtime = getUtilsRuntime();
  const open = runtime?.open;
  if (typeof open !== 'function') return null;
  if (features === undefined) return open.call(runtime, url, target);
  return open.call(runtime, url, target, features);
}

/** @param {() => void} fn */
export function scheduleUtilsAfterNextPaint(fn) {
  const runtime = getUtilsRuntime();
  const requestAnimationFrame = runtime?.requestAnimationFrame;
  if (typeof requestAnimationFrame !== 'function') {
    setTimeout(fn, 0);
    return false;
  }
  requestAnimationFrame.call(runtime, () => setTimeout(fn, 0));
  return true;
}

/**
 * @param {EventListenerOrEventListenerObject} listener
 */
function isEventListener(listener) {
  return typeof listener === 'function'
    || (listener && typeof listener.handleEvent === 'function');
}

/**
 * @param {string} name
 * @param {EventListenerOrEventListenerObject} listener
 * @param {boolean | AddEventListenerOptions} [options]
 */
export function addUtilsRuntimeListener(name, listener, options) {
  const runtime = getUtilsRuntime();
  if (!runtime || typeof runtime.addEventListener !== 'function' || !isEventListener(listener)) return false;
  runtime.addEventListener(name, listener, options);
  return true;
}

/**
 * @param {string} name
 * @param {EventListenerOrEventListenerObject} listener
 * @param {boolean | EventListenerOptions} [options]
 */
export function removeUtilsRuntimeListener(name, listener, options) {
  const runtime = getUtilsRuntime();
  if (!runtime || typeof runtime.removeEventListener !== 'function' || !isEventListener(listener)) return false;
  runtime.removeEventListener(name, listener, options);
  return true;
}

/**
 * @param {Element} el
 * @returns {CSSStyleDeclaration | null}
 */
export function getUtilsElementStyleRuntime(el) {
  const runtime = getUtilsRuntime();
  const getComputedStyle = runtime?.getComputedStyle;
  return typeof getComputedStyle === 'function' ? getComputedStyle.call(runtime, el) : null;
}
