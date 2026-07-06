// @ts-check
// nav-runtime.js - Browser runtime hooks for sidebar navigation.

/**
 * @returns {Record<string, any>}
 */
function getNavRuntimeScope() {
  return typeof window !== 'undefined'
    ? /** @type {Record<string, any>} */ (window)
    : /** @type {Record<string, any>} */ (globalThis);
}

/**
 * @param {string} name
 * @returns {((...args: any[]) => any) | null}
 */
function getNavRuntimeFunction(name) {
  const runtime = getNavRuntimeScope();
  const fn = runtime[name];
  return typeof fn === 'function' ? fn.bind(runtime) : null;
}

/**
 * @param {string} route
 */
export function navigateFromNavRuntime(route) {
  getNavRuntimeFunction('navigate')?.(route);
}

export function openEMFAssessmentFromNavRuntime() {
  getNavRuntimeFunction('openEMFAssessmentEditor')?.();
}

export function openKnowledgeBaseFromNavRuntime() {
  getNavRuntimeFunction('openKnowledgeBaseModal')?.();
}

export function openReportBuilderFromNavRuntime() {
  getNavRuntimeFunction('openReportBuilder')?.();
}

export function openContextFromNavRuntime() {
  getNavRuntimeFunction('openContextModal')?.();
}

export function openCreateMarkerFromNavRuntime() {
  getNavRuntimeFunction('openCreateMarkerModal')?.();
}

export function openClientListFromNavRuntime() {
  getNavRuntimeFunction('openClientList')?.();
}

/**
 * @param {Record<string, any>} globals
 */
export function exposeNavRuntimeGlobals(globals) {
  Object.assign(getNavRuntimeScope(), globals);
}
