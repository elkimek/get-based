// @ts-check
// provider-panel-renderers-runtime.js - Browser runtime hooks for provider panel renderers.

/**
 * @returns {Record<string, any>}
 */
function getProviderPanelRendererRuntimeScope() {
  return typeof window !== 'undefined'
    ? /** @type {Record<string, any>} */ (window)
    : /** @type {Record<string, any>} */ (globalThis);
}

/**
 * @param {string} name
 * @returns {((...args: any[]) => any) | null}
 */
function getProviderPanelRendererRuntimeFunction(name) {
  const runtime = getProviderPanelRendererRuntimeScope();
  const fn = runtime[name];
  return typeof fn === 'function' ? fn.bind(runtime) : null;
}

export function getSelectedRoutstrNodeFromRuntime() {
  return getProviderPanelRendererRuntimeFunction('nostrGetSelectedNode')?.() || null;
}

export function discoverRoutstrNodesFromRuntime() {
  const discover = getProviderPanelRendererRuntimeFunction('nostrDiscoverNodes');
  if (!discover) return null;
  const result = discover();
  return result && typeof result.then === 'function' ? result : null;
}

/**
 * @param {string} nodeUrl
 */
export function setSelectedRoutstrNodeFromRuntime(nodeUrl) {
  getProviderPanelRendererRuntimeFunction('nostrSetSelectedNode')?.(nodeUrl);
}
