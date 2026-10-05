import { getChatProviderAttestation } from './chat-runtime.js';
// chat-send-runtime.js - Browser runtime adapters for chat send hooks.

import { getRecommendationModuleFunction } from './recommendations-runtime.js';

export function getChatSendProviderAttestation(provider: string) {
  return getChatProviderAttestation(provider);
}

export function isChatSendProductRecsEnabled() {
  return Boolean(getRecommendationModuleFunction('isProductRecsEnabled')?.());
}

export function detectChatSendSupplementSlots(text: string) {
  if (!isChatSendProductRecsEnabled()) return [];
  const detectSupplementSlots = getRecommendationModuleFunction('detectSupplementSlots');
  if (!detectSupplementSlots) return [];
  const slots = detectSupplementSlots(text);
  return Array.isArray(slots) ? slots : [];
}

export function isChatSendEMFRelevant(text: string) {
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
