// @ts-check
// lab-context-runtime.js — injectable heavy context builders

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
/** @type {{
 *   buildBiologyScoresAIContext: ((data: any, options: { limit: number, ignoreContextToggles?: boolean }) => string) | null,
 *   buildSunContext: ((options: { tier: string, ignoreContextToggles?: boolean }) => string) | null,
 * }} */
export const labContextDeps = {
  buildBiologyScoresAIContext: null,
  buildSunContext: null,
};

export function configureLabContext(deps = {}) {
  return configureRuntimeCallbacks(labContextDeps, deps);
}
