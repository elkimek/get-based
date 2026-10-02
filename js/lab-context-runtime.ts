interface LabContextDependencies {
  buildBiologyScoresAIContext: ((data: unknown, options: { limit: number; ignoreContextToggles?: boolean | undefined }) => string) | null;
  buildSunContext: ((options: { tier: string; ignoreContextToggles?: boolean | undefined }) => string) | null;
}

// lab-context-runtime.js — injectable heavy context builders

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
export const labContextDeps: LabContextDependencies = {
  buildBiologyScoresAIContext: null,
  buildSunContext: null,
};

export function configureLabContext(deps: Partial<LabContextDependencies> = {}) {
  return configureRuntimeCallbacks(labContextDeps, deps);
}

export interface LabContextOptions {
  skipGroupFilter?: boolean | undefined;
  ignoreContextToggles?: boolean | undefined;
  queryText?: string | undefined;
  nutritionHistoryLabel?: string | undefined;
  supplementContextMode?: 'compact' | 'detail' | undefined;
}
