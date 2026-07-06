// @ts-check
// tour-runtime.js - Browser runtime adapters for guided tour hooks.

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

/**
 * @param {string} name
 * @returns {Function | null}
 */
function getRuntimeFunction(name) {
  const runtime = getRuntimeWindow();
  return runtime && typeof runtime[name] === 'function' ? runtime[name].bind(runtime) : null;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function normalizeViewportDimension(value, fallback) {
  const dimension = Number(value);
  return Number.isFinite(dimension) ? dimension : fallback;
}

const DEFAULT_STYLE = Object.freeze({ display: '', visibility: '', opacity: '' });
const HIDDEN_STYLE = Object.freeze({ display: 'none', visibility: 'hidden', opacity: '0' });

export function getTourViewportSize() {
  const runtime = getRuntimeWindow();
  return {
    width: normalizeViewportDimension(runtime?.innerWidth, 1024),
    height: normalizeViewportDimension(runtime?.innerHeight, 768),
  };
}

/**
 * @param {Element | null} element
 * @returns {{ display?: string, visibility?: string, opacity?: string }}
 */
export function getTourComputedStyle(element) {
  if (!element) return HIDDEN_STYLE;
  const readStyle = getRuntimeFunction('getComputedStyle');
  if (!readStyle) return DEFAULT_STYLE;
  try {
    return readStyle(element) || DEFAULT_STYLE;
  } catch (_) {
    return DEFAULT_STYLE;
  }
}

export function openTourChatPanel() {
  getRuntimeFunction('openChatPanel')?.();
}

/**
 * @param {() => void} callback
 * @param {number} delayMs
 */
export function scheduleTourTask(callback, delayMs = 0) {
  const runtime = getRuntimeWindow();
  const schedule = runtime && typeof runtime.setTimeout === 'function'
    ? runtime.setTimeout.bind(runtime)
    : (typeof setTimeout === 'function' ? setTimeout : null);
  if (!schedule) {
    callback();
    return null;
  }
  return schedule(callback, delayMs);
}
