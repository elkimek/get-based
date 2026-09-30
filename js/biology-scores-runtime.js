// @ts-check
// biology-scores-runtime.js - Browser runtime adapters for Biology Scores UI hooks.

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
import { hasAssistantFeatureProvider } from './ai-feature-routing.js';
import { getActiveData } from './data.js';
import { showNotification } from './utils.js';

const biologyScoresRuntimeDeps = {
  prepareContext: /** @type {null | (() => Promise<unknown>)} */ (null),
  getActiveData: /** @type {null | typeof getActiveData} */ (getActiveData),
  navigate: /** @type {null | ((route: string) => unknown)} */ (null),
  openChatPanel: /** @type {null | ((prompt?: string) => unknown)} */ (null),
  showDetailModal: /** @type {null | ((markerId: string) => unknown)} */ (null),
  showNotification: /** @type {null | typeof showNotification} */ (showNotification),
  useChatPrompt: /** @type {null | ((prompt: string) => unknown)} */ (null),
};

export function configureBiologyScoresRuntimeDeps(deps = {}) {
  return configureRuntimeCallbacks(biologyScoresRuntimeDeps, deps, 'inherited');
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

/** @param {string} route */
export function navigateBiologyScoresRoute(route = 'biology-scores') {
  biologyScoresRuntimeDeps.navigate?.(route || 'biology-scores');
}

export function canOpenBiologyScoresChatPanel() {
  return Boolean(biologyScoresRuntimeDeps.openChatPanel);
}

/** @param {string=} prompt */
export function openBiologyScoresChatPanel(prompt) {
  const openChatPanel = biologyScoresRuntimeDeps.openChatPanel;
  if (!openChatPanel) return false;
  if (prompt === undefined) openChatPanel();
  else openChatPanel(prompt);
  return true;
}

/** @param {string} prompt */
export function useBiologyScoresChatPrompt(prompt) {
  biologyScoresRuntimeDeps.useChatPrompt?.(prompt);
}

/**
 * @param {string} message
 * @param {string} type
 */
export function showBiologyScoresNotification(message, type = 'info') {
  biologyScoresRuntimeDeps.showNotification?.(message, type);
}

export function hasBiologyScoresAIProvider() {
  try {
    return Boolean(hasAssistantFeatureProvider());
  } catch {
    return false;
  }
}

export function getBiologyScoresActiveData() {
  return biologyScoresRuntimeDeps.getActiveData?.() || {};
}

/** @param {string} markerId */
export function openBiologyScoreMarkerDetail(markerId) {
  if (!markerId) return false;
  const showDetailModal = biologyScoresRuntimeDeps.showDetailModal;
  if (!showDetailModal) return false;
  showDetailModal(markerId);
  return true;
}

/**
 * @param {() => void} callback
 * @param {number} delayMs
 */
export function scheduleBiologyScoresTask(callback, delayMs = 0) {
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

export async function prepareBiologyScoresContext() {
  await biologyScoresRuntimeDeps.prepareContext?.();
}
