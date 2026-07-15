// @ts-check
// nav-runtime.js - Browser runtime hooks for sidebar navigation.

import { openEMFAssessmentEditor } from './emf-runtime.js';
import { openReportBuilder } from './export.js';
import { openContextModalRuntime } from './context-cards-runtime.js';
import { getViewRuntimeFunction } from './views-runtime-bridge.js';

const navRuntimeDeps = {
  openEMFAssessmentEditor,
  openReportBuilder,
};

export function configureNavRuntime(deps = {}) {
  const previous = { ...navRuntimeDeps };
  if (typeof deps.openEMFAssessmentEditor === 'function') {
    navRuntimeDeps.openEMFAssessmentEditor = deps.openEMFAssessmentEditor;
  }
  if (typeof deps.openReportBuilder === 'function') {
    navRuntimeDeps.openReportBuilder = deps.openReportBuilder;
  }
  return previous;
}

/**
 * @returns {Record<string, any>}
 */
function getNavRuntimeScope() {
  return typeof window !== 'undefined'
    ? /** @type {Record<string, any>} */ (window)
    : /** @type {Record<string, any>} */ (globalThis);
}

/**
 * @param {string} name
 * @returns {((...args: any[]) => any) | null}
 */
function getNavRuntimeFunction(name) {
  const runtime = getNavRuntimeScope();
  const fn = runtime[name];
  if (typeof fn === 'function') return fn.bind(runtime);
  return typeof window !== 'undefined' ? getViewRuntimeFunction(name) : null;
}

/**
 * @param {string} route
 */
export function navigateFromNavRuntime(route) {
  getNavRuntimeFunction('navigate')?.(route);
}

export function openEMFAssessmentFromNavRuntime() {
  void navRuntimeDeps.openEMFAssessmentEditor();
}

export function openReportBuilderFromNavRuntime() {
  navRuntimeDeps.openReportBuilder();
}

export function openContextFromNavRuntime() {
  openContextModalRuntime();
}

export function openCreateMarkerFromNavRuntime() {
  getNavRuntimeFunction('openCreateMarkerModal')?.();
}
