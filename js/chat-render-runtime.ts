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

export function renderChatRecommendationSections(slots: unknown) {
  if (!Array.isArray(slots) || !slots.length || !isChatRenderProductRecsEnabled()) return [];
  const renderRecommendationSectionSync = getRecommendationModuleFunction('renderRecommendationSectionSync') as ((slotKey: string, options: { label: unknown; maxProducts: number }) => unknown) | null;
  const catalog = getRecommendationsCatalogCache();
  const catalogSlots = catalog?.slots as Readonly<Record<string, { label?: unknown } | null | undefined>> | null | undefined;
  if (!renderRecommendationSectionSync || !catalogSlots) return [];
  return (slots as unknown[]).map(slot => {
    const slotKey = String(slot || '');
    if (!slotKey) return '';
    const slotLabel = catalogSlots[slotKey]?.label || slotKey.split('.').pop();
    return renderRecommendationSectionSync(slotKey, { label: slotLabel, maxProducts: 2 });
  }).filter(Boolean);
}
