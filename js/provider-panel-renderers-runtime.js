// @ts-check
// provider-panel-renderers-runtime.js - Nostr dependencies for provider panel renderers.

import { discoverNodes, getSelectedNodeUrl, setSelectedNodeUrl } from './nostr-discovery.js';

const providerPanelRendererDefaults = {
  discoverNodes,
  getSelectedNodeUrl,
  setSelectedNodeUrl,
};
const providerPanelRendererRuntime = { ...providerPanelRendererDefaults };

export function configureProviderPanelRendererRuntime(overrides = {}) {
  const previous = { ...providerPanelRendererRuntime };
  Object.assign(providerPanelRendererRuntime, providerPanelRendererDefaults, overrides);
  return previous;
}

export function getSelectedRoutstrNodeFromRuntime() {
  return typeof providerPanelRendererRuntime.getSelectedNodeUrl === 'function'
    ? providerPanelRendererRuntime.getSelectedNodeUrl() || null
    : null;
}

export function discoverRoutstrNodesFromRuntime() {
  const discover = providerPanelRendererRuntime.discoverNodes;
  if (typeof discover !== 'function') return null;
  const result = discover();
  return result && typeof result.then === 'function' ? result : null;
}

/**
 * @param {string} nodeUrl
 */
export function setSelectedRoutstrNodeFromRuntime(nodeUrl) {
  if (typeof providerPanelRendererRuntime.setSelectedNodeUrl === 'function') {
    providerPanelRendererRuntime.setSelectedNodeUrl(nodeUrl);
  }
}
