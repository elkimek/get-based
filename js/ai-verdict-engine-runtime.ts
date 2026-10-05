interface AIVerdictRuntime extends Pick<Window, 'dispatchEvent'> {
  CustomEvent?: typeof CustomEvent;
  DISABLE_AI_VERDICTS?: unknown;
  _aiConcurrencyCap?: unknown;
}
interface AIVerdictRuntimeDeps { refreshSunSurfaces: ((anchor: string | null) => unknown) | null }

// ai-verdict-engine-runtime.js - Browser runtime adapters for AI verdicts.

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
const aiVerdictRuntimeDeps: AIVerdictRuntimeDeps = {
  refreshSunSurfaces: null,
};

export function configureAIVerdictRuntimeDeps(deps: Partial<AIVerdictRuntimeDeps> = {}) {
  return configureRuntimeCallbacks(aiVerdictRuntimeDeps, deps, 'inherited');
}

function getAIVerdictRuntime() {
  return typeof window !== 'undefined'
    ? (window as unknown as AIVerdictRuntime)
    : null;
}

export function hasAIVerdictRuntime() {
  return getAIVerdictRuntime() !== null;
}

export function isAIVerdictEngineDisabledRuntime() {
  return getAIVerdictRuntime()?.DISABLE_AI_VERDICTS === true;
}

export function getAIVerdictConcurrencyCapRuntime(fallback = 2) {
  const cap = getAIVerdictRuntime()?._aiConcurrencyCap;
  return Number.isFinite(cap) ? Number(cap) : fallback;
}

export function refreshSunSurfacesRuntime(anchor: string | null) {
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
