interface LabContextDependencies {
  buildBiologyScoresAIContext: ((data: unknown, options: { limit: number; ignoreContextToggles?: boolean }) => string) | null;
  buildSunContext: ((options: { tier: string; ignoreContextToggles?: boolean }) => string) | null;
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
  skipGroupFilter?: boolean;
  ignoreContextToggles?: boolean;
  queryText?: string;
  nutritionHistoryLabel?: string;
  supplementContextMode?: 'compact' | 'detail';
}
