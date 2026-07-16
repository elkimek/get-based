// @ts-check
// ai-verdict-engine-runtime.js - Browser runtime adapters for AI verdicts.

const aiVerdictRuntimeDeps = {
  refreshSunSurfaces: null,
};

/** @param {{ refreshSunSurfaces?: ((anchor: string | null) => any) | null }} deps */
export function configureAIVerdictRuntimeDeps(deps = {}) {
  const previous = { ...aiVerdictRuntimeDeps };
  if ('refreshSunSurfaces' in deps) {
    aiVerdictRuntimeDeps.refreshSunSurfaces = typeof deps.refreshSunSurfaces === 'function'
      ? deps.refreshSunSurfaces
      : null;
  }
  return previous;
}

function getAIVerdictRuntime() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

export function hasAIVerdictRuntime() {
  return getAIVerdictRuntime() !== null;
}

export function isAIVerdictEngineDisabledRuntime() {
  return getAIVerdictRuntime()?.DISABLE_AI_VERDICTS === true;
}

/**
 * @param {number} fallback
 */
export function getAIVerdictConcurrencyCapRuntime(fallback = 2) {
  const cap = getAIVerdictRuntime()?._aiConcurrencyCap;
  return Number.isFinite(cap) ? Number(cap) : fallback;
}

/**
 * @param {string | null} anchor
 */
export function refreshSunSurfacesRuntime(anchor) {
  const refreshSunSurfaces = aiVerdictRuntimeDeps.refreshSunSurfaces;
  if (typeof refreshSunSurfaces !== 'function') return false;
  try {
    refreshSunSurfaces(anchor);
    return true;
  } catch (_) {
    return false;
  }
}

export function dispatchAIVerdictUpdatedRuntime() {
  const runtime = getAIVerdictRuntime();
  const CustomEventCtor = runtime?.CustomEvent;
  if (!runtime || typeof runtime.dispatchEvent !== 'function' || typeof CustomEventCtor !== 'function') return false;
  try {
    runtime.dispatchEvent(new CustomEventCtor('labcharts-ai-verdict-updated'));
    return true;
  } catch (_) {
    return false;
  }
}
