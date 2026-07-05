// @ts-check
// wearables-runtime.js - Browser runtime adapters for wearable dashboard hooks.

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
 * @param {unknown} value
 * @param {number} fallback
 */
function normalizeViewportDimension(value, fallback) {
  const dimension = Number(value);
  return Number.isFinite(dimension) ? dimension : fallback;
}

/** @param {string} route */
export function navigateWearables(route = 'dashboard') {
  getRuntimeFunction('navigate')?.(route || 'dashboard');
}

export function closeWearablesModal() {
  getRuntimeFunction('closeModal')?.();
}

export function openWearablesSettings() {
  getRuntimeFunction('openSettingsModal')?.('wearables');
}

/** @param {number} delayMs */
export function openEMFAssessmentAfterWearablesModalClose(delayMs = 100) {
  closeWearablesModal();
  const runtime = getRuntimeWindow();
  if (!runtime) return;
  const schedule = runtime && typeof runtime.setTimeout === 'function'
    ? runtime.setTimeout.bind(runtime)
    : setTimeout;
  schedule(() => getRuntimeFunction('openEMFAssessmentEditor')?.(), delayMs);
}

export function getWearablesViewportSize() {
  const runtime = getRuntimeWindow();
  return {
    width: normalizeViewportDimension(runtime?.innerWidth, 1024),
    height: normalizeViewportDimension(runtime?.innerHeight, 768),
  };
}

/** @param {Record<string, unknown>} bindings */
export function exposeWearablesBindings(bindings) {
  const runtime = getRuntimeWindow();
  if (runtime) Object.assign(runtime, bindings);
}
