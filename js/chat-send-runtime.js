// @ts-check
// chat-send-runtime.js - Browser runtime adapters for chat send hooks.

import { getRecommendationModuleFunction } from './recommendations-runtime.js';

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
  const key = provider === 'ppq' ? '_ppqAttestation'
    : provider === 'routstr' ? '_routstrAttestation'
    : '_veniceAttestation';
  return getRuntimeValue(key);
}

export function isChatSendProductRecsEnabled() {
  return Boolean(getRecommendationModuleFunction('isProductRecsEnabled')?.());
}

/** @param {string} text */
export function detectChatSendSupplementSlots(text) {
  if (!isChatSendProductRecsEnabled()) return [];
  const detectSupplementSlots = getRecommendationModuleFunction('detectSupplementSlots');
  if (!detectSupplementSlots) return [];
  const slots = detectSupplementSlots(text);
  return Array.isArray(slots) ? slots : [];
}

/** @param {string} text */
export function isChatSendEMFRelevant(text) {
  if (!isChatSendProductRecsEnabled()) return false;
  return Boolean(getRecommendationModuleFunction('detectEMFRelevance')?.(text));
}

export function getChatSendRecommendationRuntime() {
  const renderRecommendationSection = getRecommendationModuleFunction('renderRecommendationSection');
  const renderRecommendationSectionSync = getRecommendationModuleFunction('renderRecommendationSectionSync');
  const loadCatalog = getRecommendationModuleFunction('loadCatalog');
  if (!renderRecommendationSection || !renderRecommendationSectionSync || !loadCatalog) return null;
  return {
    renderRecommendationSection,
    renderRecommendationSectionSync,
    loadCatalog,
  };
}
