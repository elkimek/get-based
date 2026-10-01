// @ts-check
// export-loader.js - cold-safe lazy facade for export, import, demo, and report actions

import { createRetryingModuleLoader, invokeCachedModule } from './retrying-module-loader.js';
import { showNotification } from './utils.js';

/** @typedef {typeof import('./export.js')} ExportFacadeModule */

const exportFacadeModuleLoader = createRetryingModuleLoader(
  retry => retry ? loadExportFacadeRetryModule() : import('./export.js'),
  module => {
    return applyExportFacadeLoaderDeps(module);
  },
);

const exportFacadeLoaderDeps = {
  buildSidebar: /** @type {AnyFunction | null} */ (null),
  navigate: /** @type {AnyFunction | null} */ (null),
};

function applyExportFacadeLoaderDeps(module) {
  module.configureExportRuntimeDeps(exportFacadeLoaderDeps);
  return module;
}

export function configureExportFacadeLoaderDeps(deps = {}) {
  const previous = { ...exportFacadeLoaderDeps };
  for (const key of Object.keys(exportFacadeLoaderDeps)) {
    const value = deps?.[key];
    if (value === null || typeof value === 'function') exportFacadeLoaderDeps[key] = value;
  }
  if (exportFacadeModuleLoader.promise) {
    void exportFacadeModuleLoader.promise.then(applyExportFacadeLoaderDeps).catch(() => {});
  }
  return previous;
}

export function isExportFacadeModuleLoaded() {
  return exportFacadeModuleLoader.module !== null;
}

/** @returns {Promise<ExportFacadeModule>} */
function loadExportFacadeRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./export.js?lazy-retry=1');
}

/** @returns {Promise<ExportFacadeModule>} */
export function loadExportFacadeModule() {
  return exportFacadeModuleLoader.load();
}

/**
 * @param {keyof ExportFacadeModule} name
 * @param {any[]} args
 */
function runExportFacadeAction(name, args) {
  const run = (/** @type {ExportFacadeModule} */ module) => {
    const action = module[name];
    if (typeof action !== 'function') {
      throw new Error(`Export action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, args);
  };
  const reportFailure = error => {
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

/** @param {string} profileId @param {boolean} [includeChat] */
export function exportClientJSON(profileId, includeChat = false) {
  return runExportFacadeAction('exportClientJSON', [profileId, includeChat]);
}

/** @param {File} file */
export function importDataJSON(file) {
  return runExportFacadeAction('importDataJSON', [file]);
}

/** @param {string} [sex] */
export function loadDemoData(sex = 'male') {
  return runExportFacadeAction('loadDemoData', [sex]);
}

/** @param {string} [presetId] */
export function openReportBuilder(presetId) {
  return runExportFacadeAction('openReportBuilder', [presetId]);
}
