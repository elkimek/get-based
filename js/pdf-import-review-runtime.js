// @ts-check
// pdf-import-review-runtime.js - Browser runtime adapters for import review state.

import { updateHeaderDates } from './data.js';

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

const pdfImportReviewRuntimeDeps = {
  buildSidebar: /** @type {null | (() => void)} */ (null),
  confirmImport: /** @type {null | (() => unknown)} */ (null),
  navigate: /** @type {null | ((route: string) => void)} */ (null),
  updateHeaderDates,
};

export function configurePdfImportReviewRuntimeDeps(deps = {}) {
  const previous = { ...pdfImportReviewRuntimeDeps };
  if ('buildSidebar' in deps) {
    pdfImportReviewRuntimeDeps.buildSidebar = typeof deps.buildSidebar === 'function'
      ? /** @type {() => void} */ (deps.buildSidebar)
      : null;
  }
  if ('confirmImport' in deps) {
    pdfImportReviewRuntimeDeps.confirmImport = typeof deps.confirmImport === 'function'
      ? /** @type {() => unknown} */ (deps.confirmImport)
      : null;
  }
  if ('navigate' in deps) {
    pdfImportReviewRuntimeDeps.navigate = typeof deps.navigate === 'function'
      ? /** @type {(route: string) => void} */ (deps.navigate)
      : null;
  }
  if ('updateHeaderDates' in deps) {
    pdfImportReviewRuntimeDeps.updateHeaderDates = typeof deps.updateHeaderDates === 'function'
      ? /** @type {typeof updateHeaderDates} */ (deps.updateHeaderDates)
      : null;
  }
  return previous;
}

export function clearPendingImportRuntime() {
  const runtime = getRuntimeWindow();
  if (!runtime) return;
  runtime._pendingImport = null;
  runtime._pendingImportRefLookup = null;
}

export function confirmImportFromRuntime() {
  const confirmImport = pdfImportReviewRuntimeDeps.confirmImport;
  if (!getRuntimeWindow() || !confirmImport) return false;
  return confirmImport();
}

export function getPendingImportFromRuntime() {
  const runtime = getRuntimeWindow();
  return runtime?._pendingImport || null;
}

export function getPendingImportRefLookup() {
  const runtime = getRuntimeWindow();
  return runtime?._pendingImportRefLookup || null;
}

/** @param {string} route */
export function navigateImportReviewRuntime(route = 'dashboard') {
  const navigate = pdfImportReviewRuntimeDeps.navigate;
  if (!getRuntimeWindow() || !navigate) return false;
  navigate(route);
  return true;
}

/** @param {string} route */
export function refreshImportedDataViewsRuntime(route = 'dashboard') {
  if (!getRuntimeWindow()) return false;
  let refreshed = false;
  const buildSidebar = pdfImportReviewRuntimeDeps.buildSidebar;
  if (buildSidebar) {
    buildSidebar();
    refreshed = true;
  }
  if (pdfImportReviewRuntimeDeps.updateHeaderDates) {
    pdfImportReviewRuntimeDeps.updateHeaderDates();
    refreshed = true;
  }
  if (navigateImportReviewRuntime(route)) refreshed = true;
  return refreshed;
}

/**
 * @param {any} parseResult
 * @param {Record<string, any>} refLookup
 */
export function setPendingImportRuntime(parseResult, refLookup) {
  const runtime = getRuntimeWindow();
  if (!runtime) return;
  runtime._pendingImport = parseResult;
  runtime._pendingImportRefLookup = refLookup;
}

export function getBatchImportContext() {
  const runtime = getRuntimeWindow();
  return runtime?._batchImportContext || null;
}

export function hasBatchImportContext() {
  return !!getBatchImportContext();
}

export function markImportReviewDelegatesBound() {
  const runtime = getRuntimeWindow();
  if (!runtime || runtime.__importReviewDelegatesBound) return false;
  runtime.__importReviewDelegatesBound = true;
  return true;
}

/**
 * @param {any} original
 * @param {any} obfuscated
 */
export function showPIIDiffViewerFromRuntime(original, obfuscated) {
  const runtime = getRuntimeWindow();
  const showPIIDiffViewer = runtime?.showPIIDiffViewer;
  if (typeof showPIIDiffViewer === 'function') showPIIDiffViewer.call(runtime, original, obfuscated);
}

export function takeBatchImportResolve() {
  const runtime = getRuntimeWindow();
  const resolve = runtime?._batchImportResolve;
  if (typeof resolve !== 'function') return null;
  runtime._batchImportResolve = null;
  runtime._batchImportContext = null;
  return resolve;
}

/**
 * @param {(action: string) => void} resolve
 * @param {{ current: number, total: number }} context
 */
export function startBatchImport(resolve, context) {
  const runtime = getRuntimeWindow();
  if (!runtime) return;
  runtime._batchImportResolve = resolve;
  runtime._batchImportContext = context;
}
