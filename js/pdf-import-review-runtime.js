// @ts-check
// pdf-import-review-runtime.js - Browser runtime adapters for import review state.

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

const pdfImportReviewRuntimeDeps = {
  confirmImport: () => import('./pdf-import-commit.js').then(module => module.confirmImport()),
};

export function configurePdfImportReviewRuntimeDeps(deps = {}) {
  const previous = { ...pdfImportReviewRuntimeDeps };
  if (typeof deps.confirmImport === 'function') pdfImportReviewRuntimeDeps.confirmImport = deps.confirmImport;
  return previous;
}

/**
 * @param {string} name
 * @returns {Function | null}
 */
function getRuntimeFunction(name) {
  const runtime = getRuntimeWindow();
  const fn = runtime?.[name];
  return typeof fn === 'function' ? fn.bind(runtime) : null;
}

export function clearPendingImportRuntime() {
  const runtime = getRuntimeWindow();
  if (!runtime) return;
  runtime._pendingImport = null;
  runtime._pendingImportRefLookup = null;
}

export function confirmImportFromRuntime() {
  if (!getRuntimeWindow()) return;
  return pdfImportReviewRuntimeDeps.confirmImport();
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
  const navigate = getRuntimeFunction('navigate');
  if (!navigate) return false;
  navigate(route);
  return true;
}

/** @param {string} route */
export function refreshImportedDataViewsRuntime(route = 'dashboard') {
  let refreshed = false;
  const buildSidebar = getRuntimeFunction('buildSidebar');
  if (buildSidebar) {
    buildSidebar();
    refreshed = true;
  }
  const updateHeaderDates = getRuntimeFunction('updateHeaderDates');
  if (updateHeaderDates) {
    updateHeaderDates();
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
