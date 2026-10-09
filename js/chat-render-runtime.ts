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

type SectionRenderer<View> = (slotKey: string, options: {label: unknown; maxProducts: number}) => View;

function recommendationSections<View>(slots: unknown, rendererName: string): NonNullable<View>[] {
  if (!Array.isArray(slots) || !slots.length || !isChatRenderProductRecsEnabled()) return [];
  const render = getRecommendationModuleFunction(rendererName) as SectionRenderer<View> | null;
  const catalog = getRecommendationsCatalogCache();
  const catalogSlots = catalog?.slots as Readonly<Record<string, {label?: unknown} | null | undefined>> | null | undefined;
  if (!render || !catalogSlots) return [];
  return (slots as unknown[]).map(slot => {
    const slotKey = String(slot || '');
    if (!slotKey) return null;
    const slotLabel = catalogSlots[slotKey]?.label || slotKey.split('.').pop();
    return render(slotKey, {label: slotLabel, maxProducts: 2});
  }).filter(Boolean) as NonNullable<View>[];
}

/** Retained HTML facade for callers outside authored transcript composition. */
export function renderChatRecommendationSections(slots: unknown) {
  return recommendationSections<string>(slots, 'renderRecommendationSectionSync');
}

export function getChatRecommendationSectionViews(slots: unknown) {
  return recommendationSections<import('./tips-presentation.js').TipsSectionView | null>(slots, 'getRecommendationSectionViewSync');
}
