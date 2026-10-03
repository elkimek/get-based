// export-loader.js - cold-safe lazy facade for export, import, demo, and report actions

import { createRetryingModuleLoader, invokeCachedModule } from './retrying-module-loader.js';
import { showNotification } from './utils.js';

interface ExportFacadeLoaderDeps {
  buildSidebar: (() => unknown) | null;
  navigate: ((route: string) => unknown) | null;
}
interface ExportFacadeActions {
  clearAllData(): unknown;
  closeReportBuilder(): unknown;
  exportAllDataJSON(): unknown;
  exportClientJSON(profileId: string, includeChat?: boolean): unknown;
  importDataJSON(file: File): unknown;
  loadDemoData(sex?: string): unknown;
  openReportBuilder(presetId?: string): unknown;
}
interface ExportFacadeModule extends ExportFacadeActions {
  configureExportRuntimeDeps(deps: ExportFacadeLoaderDeps): unknown;
  [name: string]: unknown;
}

const exportFacadeModuleLoader = createRetryingModuleLoader<ExportFacadeModule>(
  (retry): Promise<typeof import('./export.js')> => retry ? loadExportFacadeRetryModule() : import('./export.js' as string),
  module => {
    return applyExportFacadeLoaderDeps(module);
  },
);

const exportFacadeLoaderDeps: ExportFacadeLoaderDeps = {
  buildSidebar: null,
  navigate: null,
};

function applyExportFacadeLoaderDeps(module: ExportFacadeModule) {
  module.configureExportRuntimeDeps(exportFacadeLoaderDeps);
  return module;
}

export function configureExportFacadeLoaderDeps(deps: Partial<ExportFacadeLoaderDeps> | null = {}) {
  const previous = { ...exportFacadeLoaderDeps };
  for (const key of (Object.keys(exportFacadeLoaderDeps) as Array<keyof ExportFacadeLoaderDeps>)) {
    const value = deps?.[key];
    if (value === null || typeof value === 'function') (exportFacadeLoaderDeps as Record<keyof ExportFacadeLoaderDeps, unknown>)[key] = value;
  }
  if (exportFacadeModuleLoader.promise) {
    void exportFacadeModuleLoader.promise.then(applyExportFacadeLoaderDeps).catch(() => {});
  }
  return previous;
}

export function isExportFacadeModuleLoaded() {
  return exportFacadeModuleLoader.module !== null;
}

function loadExportFacadeRetryModule(): Promise<typeof import('./export.js')> {
  return import('./export.js?lazy-retry=1' as string);
}

export function loadExportFacadeModule() {
  return exportFacadeModuleLoader.load();
}

function runExportFacadeAction<K extends keyof ExportFacadeActions>(name: K, args: Parameters<ExportFacadeActions[K]>) {
  const run = (module: ExportFacadeModule): unknown => {
    const action = module[name];
    if (typeof action !== 'function') {
      throw new Error(`Export action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, args);
  };
  const reportFailure = (error: unknown) => {
    console.error(`[export] Could not run ${String(name)}:`, error);
    showNotification('Data export tools could not be loaded. Try again.', 'error');
    return false;
  };
  return invokeCachedModule(exportFacadeModuleLoader, loadExportFacadeModule, run, reportFailure);
}

export function clearAllData() {
  return runExportFacadeAction('clearAllData', []);
}

export function closeReportBuilder() {
  if (!exportFacadeModuleLoader.module) return undefined;
  return runExportFacadeAction('closeReportBuilder', []);
}

export function exportAllDataJSON() {
  return runExportFacadeAction('exportAllDataJSON', []);
}

export function exportClientJSON(profileId: string, includeChat = false) {
  return runExportFacadeAction('exportClientJSON', [profileId, includeChat]);
}

export function importDataJSON(file: File) {
  return runExportFacadeAction('importDataJSON', [file]);
}

export function loadDemoData(sex = 'male') {
  return runExportFacadeAction('loadDemoData', [sex]);
}

export function openReportBuilder(presetId?: string) {
  return runExportFacadeAction('openReportBuilder', [presetId]);
}
