// @ts-check
// nav-runtime.js - Browser runtime hooks for sidebar navigation.

import { openEMFAssessmentEditor } from './emf-runtime.js';
import { openReportBuilder } from './export-loader.js';
import { openContextModalRuntime } from './context-cards-runtime.js';

const navRuntimeDeps = {
  navigate: (_route) => {},
  openEMFAssessmentEditor,
  openCreateMarkerModal: () => {},
  openReportBuilder,
};

export function configureNavRuntime(deps = {}) {
  const previous = { ...navRuntimeDeps };
  if (typeof deps.openEMFAssessmentEditor === 'function') {
    navRuntimeDeps.openEMFAssessmentEditor = deps.openEMFAssessmentEditor;
  }
  if (typeof deps.navigate === 'function') {
    navRuntimeDeps.navigate = deps.navigate;
  }
  if (typeof deps.openCreateMarkerModal === 'function') {
    navRuntimeDeps.openCreateMarkerModal = deps.openCreateMarkerModal;
  }
  if (typeof deps.openReportBuilder === 'function') {
    navRuntimeDeps.openReportBuilder = deps.openReportBuilder;
  }
  return previous;
}

/**
 * @param {string} route
 */
export function navigateFromNavRuntime(route) {
  navRuntimeDeps.navigate(route);
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
  navRuntimeDeps.openCreateMarkerModal();
}
