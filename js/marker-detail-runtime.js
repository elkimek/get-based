import { createRetryingStylesheetLoader } from './retrying-module-loader.js';
// @ts-check
// marker-detail-runtime.js - Browser runtime adapters for marker detail modal hooks.

import { configureValidRuntimeCallbacks } from './runtime-callbacks.js';
import { closeEMFInterpretation } from './emf-runtime.js';
import { getDnaModuleFunction } from './dna-runtime-bridge.js';
import { getRecommendationModuleFunction } from './recommendations-runtime.js';
import { getWearablesModuleFunction } from './wearables-runtime.js';
import { showNotification } from './utils.js';

const MARKER_DETAIL_STYLESHEET_URL = new URL('../css/marker-detail-modal.css', import.meta.url).href;
const markerDetailStylesheetLoadCache = createRetryingStylesheetLoader({
  createLink: () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = markerDetailStylesheetUrl();
    link.dataset.markerDetailStylesheet = '';
    return link;
  },
  insertLink: link => {
    const anchor = document.querySelector('[data-marker-detail-stylesheet-anchor]');
    const parent = anchor?.parentNode || document.head;
    parent.insertBefore(link, anchor || null);
  },
  requireDocument: "Marker Detail stylesheet requires a document",
  failedLoad: "Marker Detail stylesheet could not be loaded",
});

export function setDetailModalShell(...classes) {
  const modal = document.getElementById('detail-modal');
  if (!modal) return null;
  modal.className = ['modal', ...classes.filter(Boolean)].join(' ');
  return modal;
}

function markerDetailStylesheetUrl() {
  if (!markerDetailStylesheetLoadCache.retry) return MARKER_DETAIL_STYLESHEET_URL;
  const retryUrl = new URL(MARKER_DETAIL_STYLESHEET_URL);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

/** @returns {Promise<HTMLLinkElement>} */
export function loadMarkerDetailStylesheet() {
  return markerDetailStylesheetLoadCache.load();
}

/**
 * @template T
 * @param {() => T} open
 * @returns {Promise<T | false>}
 */
export function openWithMarkerDetailStylesheet(open) {
  return loadMarkerDetailStylesheet()
    .catch(err => {
      console.error('[marker-detail] Could not load stylesheet:', err);
      showNotification('Could not open marker details. Reload the app to finish updating, then try again.', 'error');
      return null;
    })
    .then(link => link ? open() : false);
}

/**
 * @typedef {{
 *   askAIAboutMarker: null | ((id?: string) => any),
 *   buildSidebar: null | (() => void),
 *   closeEMFInterpretation: null | (() => any),
 *   isDashboardQuickMarkerPinned: null | ((id?: string) => boolean),
 *   navigate: null | ((category?: string, data?: any) => any),
 *   renameMarker: null | ((id?: string) => any),
 *   revertMarkerName: null | ((id?: string) => any),
 *   showEmojiPicker: null | ((el: Element, callback: (emoji?: string | null) => void, opts?: any) => any),
 *   toggleDashboardQuickMarkerPin: null | ((id?: string) => any),
 * }} MarkerDetailRuntimeDeps
 */

/** @type {MarkerDetailRuntimeDeps} */
const markerDetailRuntimeDeps = {
  askAIAboutMarker: null,
  buildSidebar: null,
  closeEMFInterpretation,
  isDashboardQuickMarkerPinned: null,
  navigate: null,
  renameMarker: null,
  revertMarkerName: null,
  showEmojiPicker: null,
  toggleDashboardQuickMarkerPin: null,
};

/** @param {Partial<MarkerDetailRuntimeDeps>} [deps] */
export function configureMarkerDetailRuntime(deps = {}) {
  return configureValidRuntimeCallbacks(markerDetailRuntimeDeps, deps);
}

/**
 * @param {string | undefined} category
 * @param {any} [data]
 */
export function navigateMarkerDetailRuntime(category, data) {
  markerDetailRuntimeDeps.navigate?.(category, data);
}

export function buildMarkerDetailSidebarRuntime() {
  try {
    markerDetailRuntimeDeps.buildSidebar?.();
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
    return markerDetailRuntimeDeps.isDashboardQuickMarkerPinned?.(id) === true;
  } catch {
    return false;
  }
}

/** @param {string | undefined} id */
export function toggleDashboardQuickMarkerPinRuntime(id) {
  markerDetailRuntimeDeps.toggleDashboardQuickMarkerPin?.(id);
}

/** @param {string | undefined} id */
export function renameMarkerRuntime(id) {
  markerDetailRuntimeDeps.renameMarker?.(id);
}

/** @param {string | undefined} id */
export function revertMarkerNameRuntime(id) {
  markerDetailRuntimeDeps.revertMarkerName?.(id);
}

/** @param {string | undefined} id */
export function askAIAboutMarkerRuntime(id) {
  markerDetailRuntimeDeps.askAIAboutMarker?.(id);
}

/**
 * @param {Element} el
 * @param {(emoji?: string | null) => void} callback
 * @param {any} [opts]
 */
export function showEmojiPickerRuntime(el, callback, opts) {
  markerDetailRuntimeDeps.showEmojiPicker?.(el, callback, opts);
}

/**
 * @param {string} dotKey
 * @returns {any[]}
 */
export function getRelevantSNPsRuntime(dotKey) {
  try {
    const snps = getDnaModuleFunction('getRelevantSNPs')?.(dotKey);
    return Array.isArray(snps) ? snps : [];
  } catch {
    return [];
  }
}

export function isProductRecsEnabledRuntime() {
  try {
    return getRecommendationModuleFunction('isProductRecsEnabled')?.() === true;
  } catch {
    return false;
  }
}

export function hasRecommendationSectionRendererRuntime() {
  return getRecommendationModuleFunction('renderRecommendationSection') !== null;
}

/**
 * @param {string} markerKey
 * @param {any} options
 * @returns {Promise<string>}
 */
export async function renderRecommendationSectionRuntime(markerKey, options) {
  const renderRecommendations = getRecommendationModuleFunction('renderRecommendationSection');
  if (!renderRecommendations) return '';
  const html = await renderRecommendations(markerKey, options);
  return typeof html === 'string' ? html : '';
}

export function closeEMFInterpretationRuntime() {
  void markerDetailRuntimeDeps.closeEMFInterpretation?.();
}

export function uninstallWearableModalFocusTrapRuntime() {
  getWearablesModuleFunction('_uninstallWearableModalFocusTrap')?.();
}
