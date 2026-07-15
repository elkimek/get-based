// @ts-check
// dna-runtime.js - Browser runtime adapters for DNA import and shell refresh flows.

import { installDNAWindowBindings } from './dna-window-bindings.js';
import { isImportRunning } from './pdf-import-progress.js';
import { getLatitudeFromLocation } from './profile.js';
import { isDebugMode, showConfirmDialog } from './utils.js';
import { triggerContextCardDNAFilePickerRuntime } from './context-cards-runtime.js';

const dnaRuntimeDeps = { getLatitudeFromLocation, isDebugMode, isImportRunning, showConfirmDialog };

export function configureDnaRuntimeDeps(deps = {}) {
  const previous = { ...dnaRuntimeDeps };
  if (typeof deps.getLatitudeFromLocation === 'function') dnaRuntimeDeps.getLatitudeFromLocation = deps.getLatitudeFromLocation;
  if (typeof deps.isDebugMode === 'function') dnaRuntimeDeps.isDebugMode = deps.isDebugMode;
  if (typeof deps.isImportRunning === 'function') dnaRuntimeDeps.isImportRunning = deps.isImportRunning;
  if ('showConfirmDialog' in deps) {
    dnaRuntimeDeps.showConfirmDialog = typeof deps.showConfirmDialog === 'function'
      ? /** @type {typeof showConfirmDialog} */ (deps.showConfirmDialog)
      : null;
  }
  return previous;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : /** @type {any} */ (globalThis);
}

/**
 * @param {string} name
 * @returns {Function | null}
 */
function getRuntimeFunction(name) {
  const runtime = getRuntimeWindow();
  return typeof runtime[name] === 'function' ? runtime[name].bind(runtime) : null;
}

/** @returns {boolean} */
function isDnaDebugMode() {
  try {
    return dnaRuntimeDeps.isDebugMode() === true;
  } catch {
    return false;
  }
}

/** @param {any} data */
export function cacheDnaSnpTable(data) {
  getRuntimeWindow()._snpTableCache = data;
}

/** @param {...any} args */
export function logDnaDebugError(...args) {
  if (isDnaDebugMode()) console.error(...args);
}

/** @param {...any} args */
export function logDnaDebugWarn(...args) {
  if (isDnaDebugMode()) console.warn(...args);
}

/** @param {string} route */
export function navigateDnaRoute(route) {
  getRuntimeFunction('navigate')?.(route);
}

export function refreshDnaSidebar() {
  const buildSidebar = getRuntimeFunction('buildSidebar');
  if (!buildSidebar) return;
  try {
    buildSidebar();
  } catch {}
}

/** @param {string} route */
export function refreshDnaShell(route) {
  refreshDnaSidebar();
  navigateDnaRoute(route);
}

/** @returns {boolean} */
export function isDnaLabImportRunning() {
  try {
    return dnaRuntimeDeps.isImportRunning() === true;
  } catch {
    return true;
  }
}

/** @param {File} file */
export function callDnaFileHandler(file) {
  getRuntimeFunction('handleDNAFile')?.(file);
}

export function triggerDnaFilePicker() {
  triggerContextCardDNAFilePickerRuntime();
}

export function updateDnaChatNudge() {
  getRuntimeFunction('updateChatNudge')?.();
}

/** @returns {string | null} */
export function getDnaProfileLatitudeBand() {
  try {
    return dnaRuntimeDeps.getLatitudeFromLocation() || null;
  } catch {
    return null;
  }
}

/** @returns {Promise<boolean>} */
export async function confirmDnaDeleteDialog() {
  const confirmDialog = dnaRuntimeDeps.showConfirmDialog;
  if (!confirmDialog) return false;
  try {
    return await confirmDialog('Delete genetic data? This cannot be undone.') === true;
  } catch {
    return false;
  }
}

/** @returns {{ importedData?: any } | null} */
export function getDnaRuntimeState() {
  try {
    return getRuntimeFunction('_getState')?.() || null;
  } catch {
    return null;
  }
}

/** @returns {Promise<boolean>} */
export async function saveDnaRuntimeAndRefresh() {
  const saveAndRefresh = getRuntimeFunction('_saveAndRefresh');
  if (!saveAndRefresh) return false;
  try {
    return await saveAndRefresh() !== false;
  } catch {
    return false;
  }
}

/** @param {any} result */
export function setPendingDnaImport(result) {
  getRuntimeWindow()._pendingDNAImport = result;
}

/** @returns {any} */
export function getPendingDnaImport() {
  return getRuntimeWindow()._pendingDNAImport || null;
}

export function clearPendingDnaImport() {
  getRuntimeWindow()._pendingDNAImport = null;
}

/** @param {any} result */
export function setPendingMtDnaImport(result) {
  getRuntimeWindow()._pendingMtDNA = result;
}

/** @returns {any} */
export function getPendingMtDnaImport() {
  return getRuntimeWindow()._pendingMtDNA || null;
}

export function clearPendingMtDnaImport() {
  getRuntimeWindow()._pendingMtDNA = null;
}

/** @param {Record<string, any>} bindings */
export function publishDnaWindowBindings(bindings) {
  installDNAWindowBindings(getRuntimeWindow(), bindings);
}
