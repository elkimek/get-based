// @ts-check
// import-drop-zone-runtime.js - Browser runtime adapters for drop-zone imports.

import { isImportRunning } from './pdf-import-progress.js';
import { getDnaModuleFunction } from './dna-runtime-bridge.js';
import { showNotification } from './utils.js';
import { importDataJSON } from './export-loader.js';

const importDropZoneRuntimeDeps = {
  importDataJSON,
  isImportRunning,
  showNotification: /** @type {null | typeof showNotification} */ (showNotification),
};

export function configureImportDropZoneRuntimeDeps(deps = {}) {
  const previous = { ...importDropZoneRuntimeDeps };
  if (typeof deps.importDataJSON === 'function') importDropZoneRuntimeDeps.importDataJSON = deps.importDataJSON;
  if (typeof deps.isImportRunning === 'function') importDropZoneRuntimeDeps.isImportRunning = deps.isImportRunning;
  if ('showNotification' in deps) {
    importDropZoneRuntimeDeps.showNotification = typeof deps.showNotification === 'function'
      ? /** @type {typeof showNotification} */ (deps.showNotification)
      : null;
  }
  return previous;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

function getRuntimeDocument() {
  return typeof document !== 'undefined'
    ? /** @type {Document} */ (document)
    : null;
}

/**
 * @param {string} name
 * @returns {Function}
 */
function requireDnaModuleFunction(name) {
  const fn = getDnaModuleFunction(name);
  if (!fn) throw new TypeError(`${name} is not available`);
  return fn;
}

export function isDropZoneImportRunning() {
  if (!getRuntimeWindow()) return false;
  return Boolean(importDropZoneRuntimeDeps.isImportRunning());
}

export function openDropZoneFilePicker() {
  const picker = getRuntimeDocument()?.getElementById('pdf-input');
  if (picker && typeof picker.click === 'function') picker.click();
}

/**
 * @param {string} message
 * @param {string} [type]
 */
export function showDropZoneImportNotification(message, type = 'info') {
  importDropZoneRuntimeDeps.showNotification?.(message, type);
}

/** @param {File} file */
export function importDropZoneJSONFile(file) {
  return importDropZoneRuntimeDeps.importDataJSON(file);
}

/** @param {string} header */
export function detectDropZoneDNAFile(header) {
  const detectDNAFile = getDnaModuleFunction('detectDNAFile');
  return detectDNAFile ? detectDNAFile(header) : null;
}

export function hasDropZoneMtDNAHandler() {
  return Boolean(getDnaModuleFunction('handleMtDNAFile'));
}

/** @param {File} file */
export async function handleDropZoneMtDNAFile(file) {
  return await requireDnaModuleFunction('handleMtDNAFile')(file);
}

/** @param {File} file */
export async function handleDropZoneDNAFile(file) {
  return await requireDnaModuleFunction('handleDNAFile')(file);
}
