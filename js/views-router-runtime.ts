// views-router-runtime.js - Browser runtime adapters for routing scroll/window hooks.

import { configureRuntimeDependencies } from './runtime-callbacks.js';
import { syncImportStatusFab } from './pdf-import-progress.js';

type ViewsRouterCalls = {
  closeMobileSidebar: (() => unknown) | null;
  navigate: ((view: string) => unknown) | null;
  syncImportStatusFab: typeof syncImportStatusFab;
};
export type ViewsRouterRuntimeSnapshot = { [Key in keyof ViewsRouterCalls]: unknown };
interface RuntimeWindowReader extends Record<string, unknown> {
  document?: { documentElement?: { clientHeight?: unknown } | null; body?: {clientHeight?: unknown} | null } | null;
  addEventListener?: ((type: string, callback: unknown, options: {passive: boolean; capture: boolean}) => unknown) | null;
  removeEventListener?: ((type: string, callback: unknown, options: {passive: boolean; capture: boolean}) => unknown) | null;
}
type ScrollFunction = (...args: unknown[]) => unknown;
const viewsRouterRuntimeDeps: ViewsRouterCalls = {
  closeMobileSidebar: (null),
  navigate: (null),
  syncImportStatusFab,
};

export function configureViewsRouterRuntimeDeps(deps: unknown = {}): ViewsRouterRuntimeSnapshot {
  return configureRuntimeDependencies(viewsRouterRuntimeDeps, deps as Partial<ViewsRouterCalls>, ['closeMobileSidebar', 'navigate']);
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? (window as unknown as RuntimeWindowReader)
    : null;
}

function getRuntimeFunction(name: string): ScrollFunction | null {
  const runtime = getRuntimeWindow();
  if (!runtime) return null;
  const fn = runtime[name];
  return typeof fn === 'function' ? fn.bind(runtime) as ScrollFunction : null;
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
  viewsRouterRuntimeDeps.closeMobileSidebar?.();
}

export function syncImportStatusFabFromRuntime() {
  if (!getRuntimeWindow()) return;
  viewsRouterRuntimeDeps.syncImportStatusFab();
}

export function navigateViewportRuntime(view: string) {
  viewsRouterRuntimeDeps.navigate?.(view);
}

export function addViewportInputCancelListeners(cancel: unknown) {
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

export function restoreViewportScroll(pos: {x?: unknown; y?: unknown} | null | undefined) {
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

export function scrollViewportBy(delta: unknown) {
  const scrollBy = getRuntimeFunction('scrollBy');
  if (!scrollBy) return;
  try { scrollBy({ top: delta, behavior: 'instant' }); } catch (_) {
    try { scrollBy(0, delta); } catch (__) {}
  }
}
