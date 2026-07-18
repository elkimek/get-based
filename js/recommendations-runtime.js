// @ts-check
// recommendations-runtime.js - Browser runtime adapters for recommendation hooks.

import { openEMFAssessmentEditor } from './emf-runtime.js';

const recommendationsRuntimeDeps = {
  closeModal: /** @type {null | (() => unknown)} */ (null),
  openEMFAssessmentEditor,
  openChatPanel: /** @type {null | ((prompt?: string) => unknown)} */ (null),
  openProfileLocationEditor: null,
  openSettingsModal: /** @type {null | ((tab?: string) => unknown)} */ (null),
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
  if ('closeModal' in deps) {
    recommendationsRuntimeDeps.closeModal = typeof deps.closeModal === 'function'
      ? /** @type {() => unknown} */ (deps.closeModal)
      : null;
  }
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
  if ('openSettingsModal' in deps) {
    recommendationsRuntimeDeps.openSettingsModal = typeof deps.openSettingsModal === 'function'
      ? /** @type {(tab?: string) => unknown} */ (deps.openSettingsModal)
      : null;
  }
  return previous;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
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
  const closeModal = recommendationsRuntimeDeps.closeModal;
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
  const openSettingsModal = recommendationsRuntimeDeps.openSettingsModal;
  if (!openSettingsModal) return false;
  openSettingsModal('privacy');
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
