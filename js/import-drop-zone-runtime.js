// @ts-check
// import-drop-zone-runtime.js - Browser runtime adapters for drop-zone imports.

import { isImportRunning } from './pdf-import-progress.js';

const importDropZoneRuntimeDeps = { isImportRunning };

export function configureImportDropZoneRuntimeDeps(deps = {}) {
  const previous = { ...importDropZoneRuntimeDeps };
  if (typeof deps.isImportRunning === 'function') importDropZoneRuntimeDeps.isImportRunning = deps.isImportRunning;
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
 * @returns {Function | null}
 */
function getRuntimeFunction(name) {
  const runtime = getRuntimeWindow();
  return runtime && typeof runtime[name] === 'function' ? runtime[name].bind(runtime) : null;
}

/**
 * @param {string} name
 * @returns {Function}
 */
function requireRuntimeFunction(name) {
  const fn = getRuntimeFunction(name);
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
  getRuntimeFunction('showNotification')?.(message, type);
}

/** @param {File} file */
export function importDropZoneJSONFile(file) {
  return requireRuntimeFunction('importDataJSON')(file);
}

/** @param {string} header */
export function detectDropZoneDNAFile(header) {
  const detectDNAFile = getRuntimeFunction('detectDNAFile');
  return detectDNAFile ? detectDNAFile(header) : null;
}

export function hasDropZoneMtDNAHandler() {
  return Boolean(getRuntimeFunction('handleMtDNAFile'));
}

/** @param {File} file */
export async function handleDropZoneMtDNAFile(file) {
  return await requireRuntimeFunction('handleMtDNAFile')(file);
}

/** @param {File} file */
export async function handleDropZoneDNAFile(file) {
  return await requireRuntimeFunction('handleDNAFile')(file);
}
