// @ts-check
// lab-context-runtime.js — injectable heavy context builders

/** @type {{
 *   buildBiologyScoresAIContext: ((data: any, options: { limit: number, ignoreContextToggles?: boolean }) => string) | null,
 *   buildSunContext: ((options: { tier: string, ignoreContextToggles?: boolean }) => string) | null,
 * }} */
export const labContextDeps = {
  buildBiologyScoresAIContext: null,
  buildSunContext: null,
};

export function configureLabContext(deps = {}) {
  const previous = { ...labContextDeps };
  if (Object.prototype.hasOwnProperty.call(deps, 'buildBiologyScoresAIContext')) {
    labContextDeps.buildBiologyScoresAIContext = typeof deps.buildBiologyScoresAIContext === 'function'
      ? deps.buildBiologyScoresAIContext
      : null;
  }
  if (Object.prototype.hasOwnProperty.call(deps, 'buildSunContext')) {
    labContextDeps.buildSunContext = typeof deps.buildSunContext === 'function'
      ? deps.buildSunContext
      : null;
  }
  return previous;
}
