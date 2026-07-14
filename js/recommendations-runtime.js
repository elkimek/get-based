// @ts-check
// recommendations-runtime.js - Browser runtime adapters for recommendation hooks.

import { openEMFAssessmentEditor } from './emf-runtime.js';

const recommendationsRuntimeDeps = {
  openEMFAssessmentEditor,
};

export function configureRecommendationsRuntime(deps = {}) {
  const previous = { ...recommendationsRuntimeDeps };
  if (typeof deps.openEMFAssessmentEditor === 'function') {
    recommendationsRuntimeDeps.openEMFAssessmentEditor = deps.openEMFAssessmentEditor;
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
  return runtime && typeof runtime[name] === 'function' ? runtime[name].bind(runtime) : null;
}

export function getRecommendationsSnpTable() {
  const runtime = getRuntimeWindow();
  return runtime?._snpTableCache || null;
}

export function isRecommendationsProductRecsEnabled() {
  try {
    return Boolean(getRuntimeFunction('isProductRecsEnabled')?.());
  } catch {
    return false;
  }
}

export async function loadRecommendationsCatalogRuntime() {
  const loadCatalog = getRuntimeFunction('loadCatalog');
  if (!loadCatalog) return null;
  return await loadCatalog();
}

export async function renderRecommendationsDetailSection(slotKey, options) {
  const renderRecommendationSection = getRuntimeFunction('renderRecommendationSection');
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
  const openChatPanel = getRuntimeFunction('openChatPanel');
  if (!openChatPanel) return false;
  openChatPanel(prompt);
  return true;
}

export function openRecommendationsEmfAssessment() {
  void recommendationsRuntimeDeps.openEMFAssessmentEditor();
  return true;
}

export function openRecommendationsLocationEditor() {
  const openProfileLocationEditor = getRuntimeFunction('openProfileLocationEditor');
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

/** @param {Record<string, unknown>} exports */
export function registerRecommendationsRuntimeExports(exports) {
  const runtime = getRuntimeWindow();
  if (!runtime) return false;
  Object.assign(runtime, exports);
  return true;
}
