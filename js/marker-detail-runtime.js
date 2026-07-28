// @ts-check
// marker-detail-runtime.js - Browser runtime adapters for marker detail modal hooks.

import { closeEMFInterpretation } from './emf-runtime.js';
import { getDnaModuleFunction } from './dna-runtime-bridge.js';
import { getRecommendationModuleFunction } from './recommendations-runtime.js';
import { getWearablesModuleFunction } from './wearables-runtime.js';
import { showNotification } from './utils.js';

const MARKER_DETAIL_STYLESHEET_URL = new URL('../css/marker-detail-modal.css', import.meta.url).href;

/** @type {Promise<HTMLLinkElement> | null} */
let _markerDetailStylesheetLoad = null;
let _useMarkerDetailStylesheetRetryUrl = false;

export function setDetailModalShell(...classes) {
  const modal = document.getElementById('detail-modal');
  if (!modal) return null;
  modal.className = ['modal', ...classes.filter(Boolean)].join(' ');
  return modal;
}

function markerDetailStylesheetUrl() {
  if (!_useMarkerDetailStylesheetRetryUrl) return MARKER_DETAIL_STYLESHEET_URL;
  const retryUrl = new URL(MARKER_DETAIL_STYLESHEET_URL);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

/** @returns {Promise<HTMLLinkElement>} */
export function loadMarkerDetailStylesheet() {
  if (!_markerDetailStylesheetLoad) {
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('Marker Detail stylesheet requires a document'));
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = markerDetailStylesheetUrl();
    link.dataset.markerDetailStylesheet = '';
    _markerDetailStylesheetLoad = new Promise((resolve, reject) => {
      link.addEventListener('load', () => resolve(link), { once: true });
      link.addEventListener('error', () => {
        reject(new Error('Marker Detail stylesheet could not be loaded'));
      }, { once: true });
      const anchor = document.querySelector('[data-marker-detail-stylesheet-anchor]');
      const parent = anchor?.parentNode || document.head;
      parent.insertBefore(link, anchor || null);
    }).catch(err => {
      link.remove();
      _markerDetailStylesheetLoad = null;
      _useMarkerDetailStylesheetRetryUrl = true;
      throw err;
    });
  }
  return _markerDetailStylesheetLoad;
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
  const previous = { ...markerDetailRuntimeDeps };
  if (Object.hasOwn(deps, 'askAIAboutMarker') && (deps.askAIAboutMarker === null || typeof deps.askAIAboutMarker === 'function')) {
    markerDetailRuntimeDeps.askAIAboutMarker = deps.askAIAboutMarker;
  }
  if (Object.hasOwn(deps, 'buildSidebar') && (deps.buildSidebar === null || typeof deps.buildSidebar === 'function')) {
    markerDetailRuntimeDeps.buildSidebar = deps.buildSidebar;
  }
  if (Object.hasOwn(deps, 'closeEMFInterpretation') && (deps.closeEMFInterpretation === null || typeof deps.closeEMFInterpretation === 'function')) {
    markerDetailRuntimeDeps.closeEMFInterpretation = deps.closeEMFInterpretation;
  }
  if (Object.hasOwn(deps, 'isDashboardQuickMarkerPinned') && (deps.isDashboardQuickMarkerPinned === null || typeof deps.isDashboardQuickMarkerPinned === 'function')) {
    markerDetailRuntimeDeps.isDashboardQuickMarkerPinned = deps.isDashboardQuickMarkerPinned;
  }
  if (Object.hasOwn(deps, 'navigate') && (deps.navigate === null || typeof deps.navigate === 'function')) {
    markerDetailRuntimeDeps.navigate = deps.navigate;
  }
  if (Object.hasOwn(deps, 'renameMarker') && (deps.renameMarker === null || typeof deps.renameMarker === 'function')) {
    markerDetailRuntimeDeps.renameMarker = deps.renameMarker;
  }
  if (Object.hasOwn(deps, 'revertMarkerName') && (deps.revertMarkerName === null || typeof deps.revertMarkerName === 'function')) {
    markerDetailRuntimeDeps.revertMarkerName = deps.revertMarkerName;
  }
  if (Object.hasOwn(deps, 'showEmojiPicker') && (deps.showEmojiPicker === null || typeof deps.showEmojiPicker === 'function')) {
    markerDetailRuntimeDeps.showEmojiPicker = deps.showEmojiPicker;
  }
  if (Object.hasOwn(deps, 'toggleDashboardQuickMarkerPin') && (deps.toggleDashboardQuickMarkerPin === null || typeof deps.toggleDashboardQuickMarkerPin === 'function')) {
    markerDetailRuntimeDeps.toggleDashboardQuickMarkerPin = deps.toggleDashboardQuickMarkerPin;
  }
  return previous;
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
