// @ts-check
// wearables-runtime.js - Browser runtime adapters for wearable dashboard hooks.

import { openEMFAssessmentEditor } from './emf-runtime.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';

/** @type {{
 *   closeModal: (() => void) | null,
 *   navigate: ((route: string) => void) | null,
 *   openEMFAssessmentEditor: typeof openEMFAssessmentEditor,
 * }} */
const wearablesRuntimeDeps = {
  closeModal: null,
  navigate: null,
  openEMFAssessmentEditor,
};

/** @type {Record<string, (...args: any[]) => any>} */
const wearableModuleBridge = Object.create(null);

/** @param {Record<string, unknown>} api */
export function configureWearablesModuleBridge(api = {}) {
  /** @type {Record<string, ((...args: any[]) => any) | null>} */
  const previous = { ...wearableModuleBridge };
  for (const name of Object.keys(api)) {
    if (!(name in previous)) previous[name] = null;
  }
  for (const [name, value] of Object.entries(api)) {
    if (typeof value === 'function') {
      wearableModuleBridge[name] = /** @type {(...args: any[]) => any} */ (value);
    } else if (value === null) {
      delete wearableModuleBridge[name];
    }
  }
  return previous;
}

/** @param {string} name */
export function getWearablesModuleFunction(name) {
  return typeof wearableModuleBridge[name] === 'function'
    ? wearableModuleBridge[name]
    : null;
}

export function configureWearablesRuntime(deps = {}) {
  const previous = { ...wearablesRuntimeDeps };
  if (Object.hasOwn(deps, 'closeModal')) {
    wearablesRuntimeDeps.closeModal = typeof deps.closeModal === 'function' ? deps.closeModal : null;
  }
  if (Object.hasOwn(deps, 'navigate')) {
    wearablesRuntimeDeps.navigate = typeof deps.navigate === 'function' ? deps.navigate : null;
  }
  if (Object.hasOwn(deps, 'openEMFAssessmentEditor') && typeof deps.openEMFAssessmentEditor === 'function') {
    wearablesRuntimeDeps.openEMFAssessmentEditor = deps.openEMFAssessmentEditor;
  }
  return previous;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function normalizeViewportDimension(value, fallback) {
  const dimension = Number(value);
  return Number.isFinite(dimension) ? dimension : fallback;
}

/** @param {string} route */
export function navigateWearables(route = 'dashboard') {
  wearablesRuntimeDeps.navigate?.(route || 'dashboard');
}

export function closeWearablesModal() {
  wearablesRuntimeDeps.closeModal?.();
}

export function openWearablesSettings() {
  getSettingsModuleFunction('openSettingsModal')?.('wearables');
}

/** @param {number} delayMs */
export function openEMFAssessmentAfterWearablesModalClose(delayMs = 100) {
  closeWearablesModal();
  const runtime = getRuntimeWindow();
  if (!runtime) return;
  const schedule = runtime && typeof runtime.setTimeout === 'function'
    ? runtime.setTimeout.bind(runtime)
    : setTimeout;
  schedule(() => { void wearablesRuntimeDeps.openEMFAssessmentEditor(); }, delayMs);
}

export function getWearablesViewportSize() {
  const runtime = getRuntimeWindow();
  return {
    width: normalizeViewportDimension(runtime?.innerWidth, 1024),
    height: normalizeViewportDimension(runtime?.innerHeight, 768),
  };
}
