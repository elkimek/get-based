// @ts-check
// chat-render-runtime.js - Browser runtime adapters for chat render hooks.

import {
  getRecommendationModuleFunction,
  getRecommendationsCatalogCache,
} from './recommendations-runtime.js';

export function isChatRenderProductRecsEnabled() {
  try {
    return Boolean(getRecommendationModuleFunction('isProductRecsEnabled')?.());
  } catch {
    return false;
  }
}

/** @param {unknown} slots */
export function renderChatRecommendationSections(slots) {
  if (!Array.isArray(slots) || !slots.length || !isChatRenderProductRecsEnabled()) return [];
  const renderRecommendationSectionSync = getRecommendationModuleFunction('renderRecommendationSectionSync');
  const catalog = getRecommendationsCatalogCache();
  const catalogSlots = catalog?.slots;
  if (!renderRecommendationSectionSync || !catalogSlots) return [];
  return slots.map(slot => {
    const slotKey = String(slot || '');
    if (!slotKey) return '';
    const slotLabel = catalogSlots[slotKey]?.label || slotKey.split('.').pop();
    return renderRecommendationSectionSync(slotKey, { label: slotLabel, maxProducts: 2 });
  }).filter(Boolean);
}
