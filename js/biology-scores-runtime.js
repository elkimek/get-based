// @ts-check
// biology-scores-runtime.js - Browser runtime adapters for Biology Scores UI hooks.

import { hasAIProvider } from './api.js';
import { getActiveData } from './data.js';
import { showNotification } from './utils.js';

const biologyScoresRuntimeDeps = { getActiveData, showNotification };

export function configureBiologyScoresRuntimeDeps(deps = {}) {
  const previous = { ...biologyScoresRuntimeDeps };
  if ('getActiveData' in deps) {
    biologyScoresRuntimeDeps.getActiveData = typeof deps.getActiveData === 'function'
      ? /** @type {typeof getActiveData} */ (deps.getActiveData)
      : null;
  }
  if ('showNotification' in deps) {
    biologyScoresRuntimeDeps.showNotification = typeof deps.showNotification === 'function'
      ? /** @type {typeof showNotification} */ (deps.showNotification)
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
  return runtime && typeof runtime[name] === 'function' ? runtime[name].bind(runtime) : null;
}

/** @param {string} route */
export function navigateBiologyScoresRoute(route = 'biology-scores') {
  getRuntimeFunction('navigate')?.(route || 'biology-scores');
}

export function canOpenBiologyScoresChatPanel() {
  return Boolean(getRuntimeFunction('openChatPanel'));
}

/** @param {string=} prompt */
export function openBiologyScoresChatPanel(prompt) {
  const openChatPanel = getRuntimeFunction('openChatPanel');
  if (!openChatPanel) return false;
  if (prompt === undefined) openChatPanel();
  else openChatPanel(prompt);
  return true;
}

/** @param {string} prompt */
export function useBiologyScoresChatPrompt(prompt) {
  getRuntimeFunction('useChatPrompt')?.(prompt);
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
    return Boolean(hasAIProvider());
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
  const showDetailModal = getRuntimeFunction('showDetailModal');
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
