// @ts-check
// wearables-detail-runtime.js - Browser runtime adapters for wearable detail modal hooks.

import { showConfirmDialog } from './utils.js';
import { getViewRuntimeFunction } from './views-runtime-bridge.js';

const wearableDetailRuntimeDeps = { showConfirmDialog };

export function configureWearableDetailRuntimeDeps(deps = {}) {
  const previous = { ...wearableDetailRuntimeDeps };
  if ('showConfirmDialog' in deps) {
    wearableDetailRuntimeDeps.showConfirmDialog = typeof deps.showConfirmDialog === 'function'
      ? /** @type {typeof showConfirmDialog} */ (deps.showConfirmDialog)
      : null;
  }
  return previous;
}

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
  if (!runtime) return null;
  if (runtime && typeof runtime[name] === 'function') return runtime[name].bind(runtime);
  return getViewRuntimeFunction(name);
}

export function rememberWearableDetailModalTriggerRuntime() {
  getRuntimeFunction('rememberModalTrigger')?.();
}

export function hasWearableDetailChartRuntime() {
  const runtime = getRuntimeWindow();
  return typeof runtime?.Chart === 'function';
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Record<string, unknown>} config
 * @returns {unknown}
 */
export function createWearableDetailChartRuntime(canvas, config) {
  const runtime = getRuntimeWindow();
  const ChartCtor = runtime?.Chart;
  return typeof ChartCtor === 'function' ? new ChartCtor(canvas, config) : null;
}

/** @param {string} [route] */
export function navigateWearableDetailRuntime(route = 'dashboard') {
  getRuntimeFunction('navigate')?.(route || 'dashboard');
}

export function closeWearableDetailModalRuntime() {
  getRuntimeFunction('closeModal')?.();
}

/** @param {string} message */
export async function confirmWearableDetailActionRuntime(message) {
  const confirm = wearableDetailRuntimeDeps.showConfirmDialog;
  return confirm ? !!await confirm(message) : false;
}
