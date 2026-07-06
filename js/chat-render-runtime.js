// @ts-check
// chat-render-runtime.js - Browser runtime adapters for chat render hooks.

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

export function isChatRenderProductRecsEnabled() {
  try {
    return Boolean(getRuntimeFunction('isProductRecsEnabled')?.());
  } catch {
    return false;
  }
}

/** @param {unknown} slots */
export function renderChatRecommendationSections(slots) {
  if (!Array.isArray(slots) || !slots.length || !isChatRenderProductRecsEnabled()) return [];
  const renderRecommendationSectionSync = getRuntimeFunction('renderRecommendationSectionSync');
  const catalog = getRuntimeValue('_cachedCatalog');
  const catalogSlots = catalog?.slots;
  if (!renderRecommendationSectionSync || !catalogSlots) return [];
  return slots.map(slot => {
    const slotKey = String(slot || '');
    if (!slotKey) return '';
    const slotLabel = catalogSlots[slotKey]?.label || slotKey.split('.').pop();
    return renderRecommendationSectionSync(slotKey, { label: slotLabel, maxProducts: 2 });
  }).filter(Boolean);
}
