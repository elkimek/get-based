// @ts-check
// chat-send-runtime.js - Browser runtime adapters for chat send hooks.

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

/**
 * @param {string} name
 * @returns {any}
 */
function getRuntimeValue(name) {
  const runtime = getRuntimeWindow();
  return runtime ? runtime[name] : undefined;
}

/** @param {string} provider */
export function getChatSendProviderAttestation(provider) {
  return getRuntimeValue(provider === 'ppq' ? '_ppqAttestation' : '_veniceAttestation');
}

export function isChatSendProductRecsEnabled() {
  return Boolean(getRuntimeFunction('isProductRecsEnabled')?.());
}

/** @param {string} text */
export function detectChatSendSupplementSlots(text) {
  if (!isChatSendProductRecsEnabled()) return [];
  const detectSupplementSlots = getRuntimeFunction('detectSupplementSlots');
  if (!detectSupplementSlots) return [];
  const slots = detectSupplementSlots(text);
  return Array.isArray(slots) ? slots : [];
}

/** @param {string} text */
export function isChatSendEMFRelevant(text) {
  if (!isChatSendProductRecsEnabled()) return false;
  return Boolean(getRuntimeFunction('detectEMFRelevance')?.(text));
}

export function getChatSendRecommendationRuntime() {
  const renderRecommendationSection = getRuntimeFunction('renderRecommendationSection');
  const renderRecommendationSectionSync = getRuntimeFunction('renderRecommendationSectionSync');
  const loadCatalog = getRuntimeFunction('loadCatalog');
  if (!renderRecommendationSection || !renderRecommendationSectionSync || !loadCatalog) return null;
  return {
    renderRecommendationSection,
    renderRecommendationSectionSync,
    loadCatalog,
  };
}
