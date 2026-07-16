// @ts-check
// category-customization-runtime.js - Browser runtime hooks for category customization.

import { showPromptDialog } from './utils.js';

const categoryCustomizationRuntimeDeps = {
  buildSidebar: null,
  navigate: null,
  showPromptDialog,
};

export function configureCategoryCustomizationRuntimeDeps(deps = {}) {
  const previous = { ...categoryCustomizationRuntimeDeps };
  if ('buildSidebar' in deps) {
    categoryCustomizationRuntimeDeps.buildSidebar = typeof deps.buildSidebar === 'function'
      ? deps.buildSidebar
      : null;
  }
  if ('navigate' in deps) {
    categoryCustomizationRuntimeDeps.navigate = typeof deps.navigate === 'function'
      ? deps.navigate
      : null;
  }
  if ('showPromptDialog' in deps) {
    categoryCustomizationRuntimeDeps.showPromptDialog = typeof deps.showPromptDialog === 'function'
      ? /** @type {typeof showPromptDialog} */ (deps.showPromptDialog)
      : null;
  }
  return previous;
}

/**
 * @returns {Record<string, any>}
 */
function getRuntimeScope() {
  return typeof window !== 'undefined'
    ? /** @type {Record<string, any>} */ (window)
    : /** @type {Record<string, any>} */ (globalThis);
}

/**
 * @param {string} route
 * @param {any} [data]
 */
export function navigateCategoryCustomizationRuntime(route, data) {
  categoryCustomizationRuntimeDeps.navigate?.(route, data);
}

/**
 * @returns {((data?: any) => void) | null}
 */
export function getCategoryCustomizationBuildSidebar() {
  return categoryCustomizationRuntimeDeps.buildSidebar;
}

/**
 * @param {string} message
 * @param {{ defaultValue?: string, okLabel?: string }} [options]
 * @returns {Promise<string | null | undefined> | string | null | undefined}
 */
export function showCategoryCustomizationPrompt(message, options) {
  return categoryCustomizationRuntimeDeps.showPromptDialog?.(message, options);
}

/**
 * @returns {{ width: number, height: number }}
 */
export function getCategoryCustomizationViewportSize() {
  const runtime = getRuntimeScope();
  const width = Number(runtime.innerWidth);
  const height = Number(runtime.innerHeight);
  return {
    width: Number.isFinite(width) ? width : 1024,
    height: Number.isFinite(height) ? height : 768,
  };
}
