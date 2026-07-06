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
