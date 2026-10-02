import type { RoutstrNode } from './nostr-discovery.js';

// provider-panel-renderers-runtime.js - Nostr dependencies for provider panel renderers.

import { discoverNodes, getSelectedNodeUrl, setSelectedNodeUrl } from './nostr-discovery.js';

type RoutstrPanelNode = Pick<RoutstrNode, 'online' | 'urls'> & { name?: unknown };

interface ProviderPanelRendererDependencies {
  discoverNodes: (() => Promise<RoutstrPanelNode[]> | unknown[]) | null;
  getSelectedNodeUrl: (() => string | null) | null;
  setSelectedNodeUrl: ((url: string) => unknown) | null;
}

const providerPanelRendererDefaults: ProviderPanelRendererDependencies = {
  discoverNodes,
  getSelectedNodeUrl,
  setSelectedNodeUrl,
};
const providerPanelRendererRuntime = { ...providerPanelRendererDefaults };

export function configureProviderPanelRendererRuntime(overrides: Partial<ProviderPanelRendererDependencies> = {}) {
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
  return result && typeof (result as Promise<RoutstrPanelNode[]>).then === 'function' ? result as Promise<RoutstrPanelNode[]> : null;
}

/**
 * @param {string} nodeUrl
 */
export function setSelectedRoutstrNodeFromRuntime(nodeUrl: string) {
  if (typeof providerPanelRendererRuntime.setSelectedNodeUrl === 'function') {
    providerPanelRendererRuntime.setSelectedNodeUrl(nodeUrl);
  }
}
