// @ts-check
// views-router-runtime.js - Browser runtime adapters for routing scroll/window hooks.

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

export function getViewportScrollPosition() {
  const runtime = getRuntimeWindow();
  if (!runtime) return null;
  return {
    x: Number.isFinite(runtime.scrollX) ? runtime.scrollX : (runtime.pageXOffset || 0),
    y: Number.isFinite(runtime.scrollY) ? runtime.scrollY : (runtime.pageYOffset || 0),
  };
}

export function closeMobileSidebarFromRuntime() {
  getRuntimeFunction('closeMobileSidebar')?.();
}

export function syncImportStatusFabFromRuntime() {
  getRuntimeFunction('syncImportStatusFab')?.();
}

/** @param {() => void} cancel */
export function addViewportInputCancelListeners(cancel) {
  const runtime = getRuntimeWindow();
  if (!runtime || typeof runtime.addEventListener !== 'function') return () => {};
  const inputOpts = { passive: true, capture: true };
  runtime.addEventListener('wheel', cancel, inputOpts);
  runtime.addEventListener('touchstart', cancel, inputOpts);
  runtime.addEventListener('keydown', cancel, inputOpts);
  return () => {
    if (typeof runtime.removeEventListener !== 'function') return;
    runtime.removeEventListener('wheel', cancel, inputOpts);
    runtime.removeEventListener('touchstart', cancel, inputOpts);
    runtime.removeEventListener('keydown', cancel, inputOpts);
  };
}

/** @param {{ x?: number, y?: number } | null} pos */
export function restoreViewportScroll(pos) {
  const scrollTo = getRuntimeFunction('scrollTo');
  if (!pos || !scrollTo) return;
  try { scrollTo({ left: pos.x || 0, top: pos.y || 0, behavior: 'instant' }); } catch (_) {
    try { scrollTo(pos.x || 0, pos.y || 0); } catch (__) {}
  }
}

export function getViewportHeight() {
  const runtime = getRuntimeWindow();
  if (!runtime) return 0;
  const height = Number(runtime.innerHeight);
  if (Number.isFinite(height) && height > 0) return height;
  const rootHeight = Number(runtime.document?.documentElement?.clientHeight);
  if (Number.isFinite(rootHeight) && rootHeight > 0) return rootHeight;
  const bodyHeight = Number(runtime.document?.body?.clientHeight);
  if (Number.isFinite(bodyHeight) && bodyHeight > 0) return bodyHeight;
  return 0;
}

/** @param {number} delta */
export function scrollViewportBy(delta) {
  const scrollBy = getRuntimeFunction('scrollBy');
  if (!scrollBy) return;
  try { scrollBy({ top: delta, behavior: 'instant' }); } catch (_) {
    try { scrollBy(0, delta); } catch (__) {}
  }
}
