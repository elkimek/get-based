// @ts-check
// dna-runtime.js - Browser runtime adapters for DNA import and shell refresh flows.

import { isImportRunning } from './pdf-import-progress.js';
import { getLatitudeFromLocation } from './profile.js';
import { isDebugMode, showConfirmDialog, showNotification } from './utils.js';
import { triggerContextCardDNAFilePickerRuntime } from './context-cards-runtime.js';
import { updateChatNudgeRuntime } from './chat-runtime.js';

const GENETICS_STYLESHEET_URL = new URL('../css/genetics.css', import.meta.url).href;

/** @type {Promise<HTMLLinkElement> | null} */
let geneticsStylesheetPromise = null;
let geneticsStylesheetLoaded = false;
let useGeneticsStylesheetRetryUrl = false;

const dnaRuntimeDeps = {
  buildSidebar: /** @type {null | (() => void)} */ (null),
  getLatitudeFromLocation,
  isDebugMode,
  isImportRunning,
  navigate: /** @type {null | ((route: string) => void)} */ (null),
  openChatPanel: /** @type {null | ((prompt?: string) => unknown)} */ (null),
  showConfirmDialog: /** @type {null | typeof showConfirmDialog} */ (showConfirmDialog),
};

function geneticsStylesheetUrl() {
  if (!useGeneticsStylesheetRetryUrl) return GENETICS_STYLESHEET_URL;
  const retryUrl = new URL(GENETICS_STYLESHEET_URL);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

export function isGeneticsStylesheetLoaded() {
  return geneticsStylesheetLoaded;
}

/** @returns {Promise<HTMLLinkElement>} */
export function loadGeneticsStylesheet() {
  if (!geneticsStylesheetPromise) {
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('Genetics stylesheet requires a document'));
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = geneticsStylesheetUrl();
    link.dataset.geneticsStylesheet = '';
    geneticsStylesheetPromise = new Promise((resolve, reject) => {
      link.addEventListener('load', () => {
        geneticsStylesheetLoaded = true;
        resolve(link);
      }, { once: true });
      link.addEventListener('error', () => {
        reject(new Error('Genetics stylesheet could not be loaded'));
      }, { once: true });
      const anchor = document.querySelector('[data-genetics-stylesheet-anchor]');
      const parent = anchor?.parentNode || document.head;
      parent.insertBefore(link, anchor || null);
    }).catch(err => {
      link.remove();
      geneticsStylesheetPromise = null;
      geneticsStylesheetLoaded = false;
      useGeneticsStylesheetRetryUrl = true;
      throw err;
    });
  }
  return geneticsStylesheetPromise;
}

/** @returns {Promise<HTMLLinkElement | false>} */
export async function loadGeneticsStylesheetForAction() {
  try {
    return await loadGeneticsStylesheet();
  } catch (err) {
    console.error('[dna] Could not load stylesheet:', err);
    showNotification('Could not open DNA tools. Reload the app to finish updating, then try again.', 'error');
    return false;
  }
}

export function configureDnaRuntimeDeps(deps = {}) {
  const previous = { ...dnaRuntimeDeps };
  if ('buildSidebar' in deps) {
    dnaRuntimeDeps.buildSidebar = typeof deps.buildSidebar === 'function'
      ? /** @type {() => void} */ (deps.buildSidebar)
      : null;
  }
  if (typeof deps.getLatitudeFromLocation === 'function') dnaRuntimeDeps.getLatitudeFromLocation = deps.getLatitudeFromLocation;
  if (typeof deps.isDebugMode === 'function') dnaRuntimeDeps.isDebugMode = deps.isDebugMode;
  if (typeof deps.isImportRunning === 'function') dnaRuntimeDeps.isImportRunning = deps.isImportRunning;
  if ('navigate' in deps) {
    dnaRuntimeDeps.navigate = typeof deps.navigate === 'function'
      ? /** @type {(route: string) => void} */ (deps.navigate)
      : null;
  }
  if ('openChatPanel' in deps) {
    dnaRuntimeDeps.openChatPanel = typeof deps.openChatPanel === 'function'
      ? /** @type {(prompt?: string) => unknown} */ (deps.openChatPanel)
      : null;
  }
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

/** @param {any} data */
export function cacheDnaHaplogroupTable(data) {
  getRuntimeWindow()._haplogroupTableCache = data;
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
  dnaRuntimeDeps.navigate?.(route);
}

/** @param {string} prompt */
export function openDnaChatPrompt(prompt) {
  const openChatPanel = dnaRuntimeDeps.openChatPanel;
  if (!openChatPanel || !String(prompt || '').trim()) return false;
  void Promise.resolve(openChatPanel(prompt)).catch(() => {});
  return true;
}

export function refreshDnaSidebar() {
  const buildSidebar = dnaRuntimeDeps.buildSidebar;
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

export function triggerDnaFilePicker() {
  triggerContextCardDNAFilePickerRuntime();
}

export function updateDnaChatNudge() {
  updateChatNudgeRuntime();
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
