import { createRetryingStylesheetLoader } from './retrying-module-loader.js';
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

export function setDetailModalShell(...classes: unknown[]) {
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

export function loadMarkerDetailStylesheet() {
  return markerDetailStylesheetLoadCache.load();
}

export function openWithMarkerDetailStylesheet<Result>(open: () => Result) {
  return loadMarkerDetailStylesheet()
    .catch(err => {
      console.error('[marker-detail] Could not load stylesheet:', err);
      showNotification('Could not open marker details. Reload the app to finish updating, then try again.', 'error');
      return null;
    })
    .then(link => link ? open() : false);
}

type MarkerIdAction = ((id?: string) => unknown) | null;
type MarkerDetailCalls = {
  askAIAboutMarker: MarkerIdAction; buildSidebar: (() => unknown) | null;
  closeEMFInterpretation: (() => unknown) | null;
  isDashboardQuickMarkerPinned: MarkerIdAction;
  navigate: ((category?: string, data?: unknown) => unknown) | null;
  renameMarker: MarkerIdAction; revertMarkerName: MarkerIdAction;
  showEmojiPicker: ((el: unknown, callback: (emoji?: string | null) => void, opts?: unknown) => unknown) | null;
  toggleDashboardQuickMarkerPin: MarkerIdAction;
};
export type MarkerDetailRuntimeSnapshot = { [Key in keyof MarkerDetailCalls]: unknown };
const markerDetailRuntimeDeps: MarkerDetailCalls = {
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

export function configureMarkerDetailRuntime(deps: unknown = {}): MarkerDetailRuntimeSnapshot {
  return configureValidRuntimeCallbacks(markerDetailRuntimeDeps, deps as Partial<MarkerDetailCalls>);
}

export function navigateMarkerDetailRuntime(category: string | undefined, data?: unknown) {
  markerDetailRuntimeDeps.navigate?.(category, data);
}

export function buildMarkerDetailSidebarRuntime() {
  try {
    markerDetailRuntimeDeps.buildSidebar?.();
  } catch {
    // Best-effort shell refresh.
  }
}

export function isDashboardQuickMarkerPinnedRuntime(id: string | undefined) {
  try {
    return markerDetailRuntimeDeps.isDashboardQuickMarkerPinned?.(id) === true;
  } catch {
    return false;
  }
}

export function toggleDashboardQuickMarkerPinRuntime(id: string | undefined) {
  markerDetailRuntimeDeps.toggleDashboardQuickMarkerPin?.(id);
}

export function renameMarkerRuntime(id: string | undefined) {
  markerDetailRuntimeDeps.renameMarker?.(id);
}

export function revertMarkerNameRuntime(id: string | undefined) {
  markerDetailRuntimeDeps.revertMarkerName?.(id);
}

export function askAIAboutMarkerRuntime(id: string | undefined) {
  markerDetailRuntimeDeps.askAIAboutMarker?.(id);
}

export function showEmojiPickerRuntime(el: unknown, callback: (emoji?: string | null) => void, opts?: unknown) {
  markerDetailRuntimeDeps.showEmojiPicker?.(el, callback, opts);
}

export function getRelevantSNPsRuntime(dotKey: string): unknown[] {
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

export async function renderRecommendationSectionRuntime(markerKey: string, options: unknown) {
  const renderRecommendations = getRecommendationModuleFunction('renderRecommendationSection');
  if (!renderRecommendations) return '';
  const html = await (renderRecommendations as (markerKey: string, options: unknown) => unknown)(markerKey, options);
  return typeof html === 'string' ? html : '';
}

export function closeEMFInterpretationRuntime() {
  void markerDetailRuntimeDeps.closeEMFInterpretation?.();
}

export function uninstallWearableModalFocusTrapRuntime() {
  getWearablesModuleFunction('_uninstallWearableModalFocusTrap')?.();
}
