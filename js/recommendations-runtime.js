// @ts-check
// recommendations-runtime.js - Browser runtime adapters for recommendation hooks.

import { openEMFAssessmentEditor } from './emf-runtime.js';
import { getViewRuntimeFunction } from './views-runtime-bridge.js';

const recommendationsRuntimeDeps = {
  openEMFAssessmentEditor,
  openChatPanel: /** @type {null | ((prompt?: string) => unknown)} */ (null),
  openProfileLocationEditor: null,
};

/** @type {Record<string, (...args: any[]) => any>} */
const recommendationModuleBridge = Object.create(null);
let recommendationsCatalogCache = null;

/** @param {Record<string, unknown>} api */
export function configureRecommendationModuleBridge(api = {}) {
  /** @type {Record<string, ((...args: any[]) => any) | null>} */
  const previous = { ...recommendationModuleBridge };
  for (const name of Object.keys(api)) {
    if (!(name in previous)) previous[name] = null;
  }
  for (const [name, value] of Object.entries(api)) {
    if (typeof value === 'function') {
      recommendationModuleBridge[name] = /** @type {(...args: any[]) => any} */ (value);
    } else if (value === null) {
      delete recommendationModuleBridge[name];
    }
  }
  return previous;
}

/** @param {string} name */
export function getRecommendationModuleFunction(name) {
  return typeof recommendationModuleBridge[name] === 'function'
    ? recommendationModuleBridge[name]
    : null;
}

export function getRecommendationsCatalogCache() {
  return recommendationsCatalogCache;
}

/** @param {any} catalog */
export function setRecommendationsCatalogCache(catalog) {
  recommendationsCatalogCache = catalog || null;
  return recommendationsCatalogCache;
}

export function configureRecommendationsRuntime(deps = {}) {
  const previous = { ...recommendationsRuntimeDeps };
  if (typeof deps.openEMFAssessmentEditor === 'function') {
    recommendationsRuntimeDeps.openEMFAssessmentEditor = deps.openEMFAssessmentEditor;
  }
  if ('openChatPanel' in deps) {
    recommendationsRuntimeDeps.openChatPanel = typeof deps.openChatPanel === 'function'
      ? /** @type {(prompt?: string) => unknown} */ (deps.openChatPanel)
      : null;
  }
  if ('openProfileLocationEditor' in deps) {
    recommendationsRuntimeDeps.openProfileLocationEditor = typeof deps.openProfileLocationEditor === 'function'
      ? deps.openProfileLocationEditor
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
  const fn = runtime[name];
  return typeof fn === 'function' ? fn.bind(runtime) : getViewRuntimeFunction(name);
}

export function getRecommendationsSnpTable() {
  const runtime = getRuntimeWindow();
  return runtime?._snpTableCache || null;
}

export function isRecommendationsProductRecsEnabled() {
  try {
    return Boolean(getRecommendationModuleFunction('isProductRecsEnabled')?.());
  } catch {
    return false;
  }
}

export async function loadRecommendationsCatalogRuntime() {
  const loadCatalog = getRecommendationModuleFunction('loadCatalog');
  if (!loadCatalog) return null;
  return await loadCatalog();
}

export async function renderRecommendationsDetailSection(slotKey, options) {
  const renderRecommendationSection = getRecommendationModuleFunction('renderRecommendationSection');
  if (!renderRecommendationSection) return '';
  return await renderRecommendationSection(slotKey, options);
}

export function closeRecommendationsModal() {
  const closeModal = getRuntimeFunction('closeModal');
  if (!closeModal) return false;
  closeModal();
  return true;
}

export function openRecommendationsChatPanel(prompt) {
  const openChatPanel = recommendationsRuntimeDeps.openChatPanel;
  if (!openChatPanel) return false;
  openChatPanel(prompt);
  return true;
}

export function openRecommendationsEmfAssessment() {
  void recommendationsRuntimeDeps.openEMFAssessmentEditor();
  return true;
}

export function openRecommendationsLocationEditor() {
  const openProfileLocationEditor = recommendationsRuntimeDeps.openProfileLocationEditor;
  if (!openProfileLocationEditor) return false;
  openProfileLocationEditor();
  return true;
}

export function openRecommendationsPrivacySettings() {
  const openSettingsTab = getRuntimeFunction('openSettingsTab');
  if (!openSettingsTab) return false;
  openSettingsTab('privacy');
  return true;
}

/**
 * @param {() => void} callback
 * @param {number} delayMs
 */
export function scheduleRecommendationsTask(callback, delayMs = 0) {
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
