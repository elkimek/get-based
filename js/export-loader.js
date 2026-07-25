// @ts-check
// export-loader.js - cold-safe lazy facade for export, import, demo, and report actions

import { showNotification } from './utils.js';

/** @typedef {typeof import('./export.js')} ExportFacadeModule */
/** @type {Promise<ExportFacadeModule> | null} */
let exportFacadeModulePromise = null;
/** @type {ExportFacadeModule | null} */
let exportFacadeModule = null;
let useExportFacadeRetryUrl = false;

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
  if (exportFacadeModulePromise) {
    void exportFacadeModulePromise.then(applyExportFacadeLoaderDeps).catch(() => {});
  }
  return previous;
}

export function isExportFacadeModuleLoaded() {
  return exportFacadeModule !== null;
}

/** @returns {Promise<ExportFacadeModule>} */
function loadExportFacadeRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./export.js?lazy-retry=1');
}

/** @returns {Promise<ExportFacadeModule>} */
export function loadExportFacadeModule() {
  if (!exportFacadeModulePromise) {
    const load = useExportFacadeRetryUrl
      ? loadExportFacadeRetryModule()
      : import('./export.js');
    exportFacadeModulePromise = load
      .then(module => {
        exportFacadeModule = module;
        return applyExportFacadeLoaderDeps(module);
      })
      .catch(error => {
        exportFacadeModulePromise = null;
        exportFacadeModule = null;
        useExportFacadeRetryUrl = true;
        throw error;
      });
  }
  return exportFacadeModulePromise;
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
  try {
    if (exportFacadeModule) return run(exportFacadeModule);
    return loadExportFacadeModule().then(run).catch(reportFailure);
  } catch (error) {
    return reportFailure(error);
  }
}

export function clearAllData() {
  return runExportFacadeAction('clearAllData', []);
}

export function closeReportBuilder() {
  if (!exportFacadeModule) return undefined;
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
