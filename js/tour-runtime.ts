// tour-runtime.js - Browser runtime adapters for guided tour hooks.

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
const tourRuntimeDeps: { openChatPanel: (() => unknown) | null } = {
  openChatPanel: null,
};

export function configureTourRuntimeDeps(deps: Partial<typeof tourRuntimeDeps> = {}) {
  return configureRuntimeCallbacks(tourRuntimeDeps, deps);
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? window
    : null;
}

function getRuntimeFunction(name: 'getComputedStyle') {
  const runtime = getRuntimeWindow();
  return runtime && typeof runtime[name] === 'function' ? runtime[name].bind(runtime) : null;
}

function normalizeViewportDimension(value: unknown, fallback: number) {
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

export function getTourComputedStyle(element: Element | null) {
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
  tourRuntimeDeps.openChatPanel?.();
}

export function scheduleTourTask(callback: () => void, delayMs = 0): number | ReturnType<typeof setTimeout> | null {
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
