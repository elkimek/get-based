import { configureRuntimeFunctions } from './runtime-callbacks.js';
// nav-runtime.js - Browser runtime hooks for sidebar navigation.

import { openEMFAssessmentEditor } from './emf-runtime.js';
import { openReportBuilder } from './export-loader.js';
import { openContextModalRuntime } from './context-cards-runtime.js';

interface NavRuntimeDeps {
  navigate(route: string): unknown;
  openEMFAssessmentEditor(): unknown;
  openCreateMarkerModal(): unknown;
  openReportBuilder(): unknown;
}

const navRuntimeDeps: NavRuntimeDeps = {
  navigate: (_route) => {},
  openEMFAssessmentEditor,
  openCreateMarkerModal: () => {},
  openReportBuilder,
};

export function configureNavRuntime(deps: Partial<NavRuntimeDeps> = {}) {
  return configureRuntimeFunctions(navRuntimeDeps, deps, ["openEMFAssessmentEditor","navigate","openCreateMarkerModal","openReportBuilder"]);
}

export function navigateFromNavRuntime(route: string) {
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
