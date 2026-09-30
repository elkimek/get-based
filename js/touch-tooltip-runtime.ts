// touch-tooltip-runtime.js - Browser runtime adapters for app tooltips.

function getTouchTooltipRuntime(): Window | null {
  return typeof window !== 'undefined'
    ? (window)
    : null;
}

export function hasTouchTooltipRuntime() {
  return getTouchTooltipRuntime() !== null;
}

export function isTouchTooltipTouchRuntime() {
  const runtime = getTouchTooltipRuntime();
  const matchMedia = runtime?.matchMedia;
  if (typeof matchMedia !== 'function') return false;
  return !!(
    matchMedia.call(runtime, '(hover: none)').matches
    || matchMedia.call(runtime, '(pointer: coarse)').matches
  );
}

export function getTouchTooltipViewportRuntime() {
  const runtime = getTouchTooltipRuntime();
  const width = Number.isFinite(runtime?.innerWidth) ? runtime!.innerWidth : 1024;
  const height = Number.isFinite(runtime?.innerHeight) ? runtime!.innerHeight : 768;
  return { width, height };
}

export function addTouchTooltipWindowListenersRuntime({ onScroll, onResize }: { onScroll?: EventListener; onResize?: EventListener } = {}) {
  const runtime = getTouchTooltipRuntime();
  if (!runtime || typeof runtime.addEventListener !== 'function') return false;
  if (typeof onScroll === 'function') runtime.addEventListener('scroll', onScroll, true);
  if (typeof onResize === 'function') runtime.addEventListener('resize', onResize);
  return true;
}
