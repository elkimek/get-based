import type { PromptDialogOptions } from './utils.js';
interface CategoryCustomizationRuntimeDeps {
  buildSidebar: ((data?: unknown) => void) | null;
  navigate: ((route: string, data?: unknown) => void) | null;
  showPromptDialog: typeof showPromptDialog | null;
}

// category-customization-runtime.js - Browser runtime hooks for category customization.

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
import { showPromptDialog } from './utils.js';

const categoryCustomizationRuntimeDeps: CategoryCustomizationRuntimeDeps = {
  buildSidebar: null,
  navigate: null,
  showPromptDialog,
};

export function configureCategoryCustomizationRuntimeDeps(deps: Partial<CategoryCustomizationRuntimeDeps> = {}) {
  return configureRuntimeCallbacks(categoryCustomizationRuntimeDeps, deps, 'inherited');
}

function getRuntimeScope() {
  return typeof window !== 'undefined'
    ? window
    : (globalThis as unknown as { innerWidth?: unknown; innerHeight?: unknown });
}

export function navigateCategoryCustomizationRuntime(route: string, data?: unknown) {
  categoryCustomizationRuntimeDeps.navigate?.(route, data);
}

export function getCategoryCustomizationBuildSidebar() {
  return categoryCustomizationRuntimeDeps.buildSidebar;
}

export function showCategoryCustomizationPrompt(message: string, options?: PromptDialogOptions) {
  return categoryCustomizationRuntimeDeps.showPromptDialog?.(message, options);
}

export function getCategoryCustomizationViewportSize() {
  const runtime = getRuntimeScope();
  const width = Number(runtime.innerWidth);
  const height = Number(runtime.innerHeight);
  return {
    width: Number.isFinite(width) ? width : 1024,
    height: Number.isFinite(height) ? height : 768,
  };
}
