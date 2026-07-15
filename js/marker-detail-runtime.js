// @ts-check
// marker-detail-runtime.js - Browser runtime adapters for marker detail modal hooks.

import { closeEMFInterpretation } from './emf-runtime.js';
import { getViewRuntimeFunction } from './views-runtime-bridge.js';

const markerDetailRuntimeDeps = {
  closeEMFInterpretation,
};

export function configureMarkerDetailRuntime(deps = {}) {
  const previous = { ...markerDetailRuntimeDeps };
  if (typeof deps.closeEMFInterpretation === 'function') {
    markerDetailRuntimeDeps.closeEMFInterpretation = deps.closeEMFInterpretation;
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
  if (runtime && typeof runtime[name] === 'function') return runtime[name].bind(runtime);
  return getViewRuntimeFunction(name);
}

/**
 * @param {string | undefined} category
 * @param {any} [data]
 */
export function navigateMarkerDetailRuntime(category, data) {
  getRuntimeFunction('navigate')?.(category, data);
}

export function buildMarkerDetailSidebarRuntime() {
  try {
    getRuntimeFunction('buildSidebar')?.();
  } catch {
    // Best-effort shell refresh.
  }
}

/**
 * @param {string | undefined} id
 * @returns {boolean}
 */
export function isDashboardQuickMarkerPinnedRuntime(id) {
  try {
    return getRuntimeFunction('isDashboardQuickMarkerPinned')?.(id) === true;
  } catch {
    return false;
  }
}

/** @param {string | undefined} id */
export function toggleDashboardQuickMarkerPinRuntime(id) {
  getRuntimeFunction('toggleDashboardQuickMarkerPin')?.(id);
}

/** @param {string | undefined} id */
export function renameMarkerRuntime(id) {
  getRuntimeFunction('renameMarker')?.(id);
}

/** @param {string | undefined} id */
export function revertMarkerNameRuntime(id) {
  getRuntimeFunction('revertMarkerName')?.(id);
}

/** @param {string | undefined} id */
export function askAIAboutMarkerRuntime(id) {
  getRuntimeFunction('askAIAboutMarker')?.(id);
}

/**
 * @param {Element} el
 * @param {(emoji?: string | null) => void} callback
 * @param {any} [opts]
 */
export function showEmojiPickerRuntime(el, callback, opts) {
  getRuntimeFunction('showEmojiPicker')?.(el, callback, opts);
}

/**
 * @param {string} dotKey
 * @returns {any[]}
 */
export function getRelevantSNPsRuntime(dotKey) {
  try {
    const snps = getRuntimeFunction('_getRelevantSNPs')?.(dotKey);
    return Array.isArray(snps) ? snps : [];
  } catch {
    return [];
  }
}

export function isProductRecsEnabledRuntime() {
  try {
    return getRuntimeFunction('isProductRecsEnabled')?.() === true;
  } catch {
    return false;
  }
}

export function hasRecommendationSectionRendererRuntime() {
  return getRuntimeFunction('renderRecommendationSection') !== null;
}

/**
 * @param {string} markerKey
 * @param {any} options
 * @returns {Promise<string>}
 */
export async function renderRecommendationSectionRuntime(markerKey, options) {
  const renderRecommendations = getRuntimeFunction('renderRecommendationSection');
  if (!renderRecommendations) return '';
  const html = await renderRecommendations(markerKey, options);
  return typeof html === 'string' ? html : '';
}

export function closeEMFInterpretationRuntime() {
  void markerDetailRuntimeDeps.closeEMFInterpretation();
}

export function uninstallWearableModalFocusTrapRuntime() {
  getRuntimeFunction('_uninstallWearableModalFocusTrap')?.();
}
