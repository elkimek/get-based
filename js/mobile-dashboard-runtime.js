// @ts-check
// mobile-dashboard-runtime.js - Browser runtime adapters for mobile dashboard shell hooks.

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

function finitePositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** @param {string} query */
export function isMobileDashboardRuntimeViewport(query) {
  const runtime = getRuntimeWindow();
  return Boolean(runtime && typeof runtime.matchMedia === 'function' && runtime.matchMedia(query).matches);
}

export function getMobileDashboardVisualBottomOffset() {
  const runtime = getRuntimeWindow();
  const visualViewport = runtime?.visualViewport;
  if (!runtime || !visualViewport) return 0;
  const root = typeof document !== 'undefined' ? document.documentElement : null;
  const layoutHeight = finitePositiveNumber(runtime.innerHeight) || finitePositiveNumber(root?.clientHeight);
  const offsetTop = finiteNumber(visualViewport.offsetTop);
  const visualHeight = finitePositiveNumber(visualViewport.height);
  if (layoutHeight == null || offsetTop == null || visualHeight == null) return 0;
  const visualBottom = offsetTop + visualHeight;
  return Math.max(0, Math.ceil(layoutHeight - visualBottom));
}

/**
 * @param {string} type
 * @param {EventListenerOrEventListenerObject} listener
 * @param {AddEventListenerOptions | boolean} [options]
 */
export function addMobileDashboardWindowListener(type, listener, options) {
  const runtime = getRuntimeWindow();
  if (runtime && typeof runtime.addEventListener === 'function') {
    runtime.addEventListener(type, listener, options);
  }
}

/**
 * @param {string} type
 * @param {EventListenerOrEventListenerObject} listener
 * @param {AddEventListenerOptions | boolean} [options]
 */
export function addMobileDashboardVisualViewportListener(type, listener, options) {
  const visualViewport = getRuntimeWindow()?.visualViewport;
  if (visualViewport && typeof visualViewport.addEventListener === 'function') {
    visualViewport.addEventListener(type, listener, options);
  }
}

/**
 * @param {string} query
 * @param {(event?: any) => void} listener
 */
export function addMobileDashboardBreakpointListener(query, listener) {
  const runtime = getRuntimeWindow();
  if (!runtime || typeof runtime.matchMedia !== 'function') return false;
  const media = runtime.matchMedia(query);
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', listener);
  } else if (typeof media.addListener === 'function') {
    media.addListener(listener);
  } else {
    return false;
  }
  return true;
}

export function scrollMobileDashboardToTop() {
  const runtime = getRuntimeWindow();
  if (runtime && typeof runtime.scrollTo === 'function') runtime.scrollTo(0, 0);
}
