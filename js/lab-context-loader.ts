import { createRetryingModuleLoader } from './retrying-module-loader.js';

export type LabContextBuilder = typeof import('./lab-context.js')['buildLabContext'];

// Keep automatic consumers cold until their existing eligibility checks pass.
// Direct callers retain the public, synchronous lab-context module contract.
const builder = createRetryingModuleLoader<LabContextBuilder>(retry => retry
  ? import('./lab-context.js?lazy-retry=1' as './lab-context.js').then(module => module.buildLabContext)
  : import('./lab-context.js').then(module => module.buildLabContext));

export function getLoadedLabContextBuilder() {
  return builder.module;
}

export function loadLabContextBuilder() {
  return builder.load();
}
