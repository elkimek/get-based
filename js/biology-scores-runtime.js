// @ts-check
// biology-scores-runtime.js - Browser runtime adapters for Biology Scores UI hooks.

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
  getRuntimeFunction('showNotification')?.(message, type);
}

export function hasBiologyScoresAIProvider() {
  const hasAIProvider = getRuntimeFunction('hasAIProvider');
  return hasAIProvider ? Boolean(hasAIProvider()) : null;
}

export function getBiologyScoresActiveData() {
  return getRuntimeFunction('getActiveData')?.() || {};
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
