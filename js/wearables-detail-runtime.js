// @ts-check
// wearables-detail-runtime.js - Browser runtime adapters for wearable detail modal hooks.

import { showConfirmDialog } from './utils.js';

/** @type {{
 *   closeModal: (() => void) | null,
 *   navigate: ((route: string) => void) | null,
 *   rememberModalTrigger: (() => void) | null,
 *   showConfirmDialog: typeof showConfirmDialog | null,
 * }} */
const wearableDetailRuntimeDeps = {
  closeModal: null,
  navigate: null,
  rememberModalTrigger: null,
  showConfirmDialog,
};

export function configureWearableDetailRuntimeDeps(deps = {}) {
  const previous = { ...wearableDetailRuntimeDeps };
  if (Object.hasOwn(deps, 'closeModal')) {
    wearableDetailRuntimeDeps.closeModal = typeof deps.closeModal === 'function' ? deps.closeModal : null;
  }
  if (Object.hasOwn(deps, 'navigate')) {
    wearableDetailRuntimeDeps.navigate = typeof deps.navigate === 'function' ? deps.navigate : null;
  }
  if (Object.hasOwn(deps, 'rememberModalTrigger')) {
    wearableDetailRuntimeDeps.rememberModalTrigger = typeof deps.rememberModalTrigger === 'function'
      ? deps.rememberModalTrigger
      : null;
  }
  if (Object.hasOwn(deps, 'showConfirmDialog')) {
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

export function rememberWearableDetailModalTriggerRuntime() {
  wearableDetailRuntimeDeps.rememberModalTrigger?.();
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
  wearableDetailRuntimeDeps.navigate?.(route || 'dashboard');
}

export function closeWearableDetailModalRuntime() {
  wearableDetailRuntimeDeps.closeModal?.();
}

/** @param {string} message */
export async function confirmWearableDetailActionRuntime(message) {
  const confirm = wearableDetailRuntimeDeps.showConfirmDialog;
  return confirm ? !!await confirm(message) : false;
}
