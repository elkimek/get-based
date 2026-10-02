#!/usr/bin/env node
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// Provider panel renderer runtime adapter behavior.

import './_node-shim.js';
import {
  configureProviderPanelRendererRuntime,
  discoverRoutstrNodesFromRuntime,
  getSelectedRoutstrNodeFromRuntime,
  setSelectedRoutstrNodeFromRuntime,
} from '../js/provider-panel-renderers-runtime.js';




const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

console.log('=== Provider Panel Renderers Runtime Tests ===');

let previousRuntime: ReturnType<typeof configureProviderPanelRendererRuntime> | undefined;
try {
  const calls: Array<[string, string?]> = [];
  previousRuntime = configureProviderPanelRendererRuntime({
    getSelectedNodeUrl() {
      calls.push(['get']);
      return 'https://node.selected.test';
    },
    discoverNodes() {
      calls.push(['discover']);
      return Promise.resolve([{ online: true, urls: ['https://node.discovered.test'] }]);
    },
    setSelectedNodeUrl(nodeUrl) {
      calls.push(['set', nodeUrl]);
    },
  });

  assert('getSelectedRoutstrNodeFromRuntime delegates selected node lookup',
    getSelectedRoutstrNodeFromRuntime() === 'https://node.selected.test'
      && calls.some(call => call[0] === 'get'));

  const discovered = await discoverRoutstrNodesFromRuntime();
  assert('discoverRoutstrNodesFromRuntime delegates node discovery',
    discovered?.[0]?.urls?.[0] === 'https://node.discovered.test'
      && calls.some(call => call[0] === 'discover'));

  setSelectedRoutstrNodeFromRuntime('https://node.saved.test');
  assert('setSelectedRoutstrNodeFromRuntime delegates selected node updates',
    calls.some(call => call[0] === 'set' && call[1] === 'https://node.saved.test'));

  configureProviderPanelRendererRuntime({
    getSelectedNodeUrl: null,
    discoverNodes: null,
    setSelectedNodeUrl: null,
  });
  setSelectedRoutstrNodeFromRuntime('missing');
  assert('provider renderer runtime hooks no-op when callbacks are missing',
    getSelectedRoutstrNodeFromRuntime() === null && discoverRoutstrNodesFromRuntime() === null);

  configureProviderPanelRendererRuntime({ discoverNodes: () => [] });
  assert('discoverRoutstrNodesFromRuntime ignores non-promise discovery callbacks',
    discoverRoutstrNodesFromRuntime() === null);
} finally {
  configureProviderPanelRendererRuntime(previousRuntime);
}

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
try {
  delete (globalThis as { window?: unknown }).window;
  await import('../js/provider-panel-renderers-runtime.js?no-window-probe' as string);
  assert('provider panel renderers runtime imports without a browser window', true);
} catch (error) {
  assert('provider panel renderers runtime imports without a browser window', false, (error as { message?: unknown } | null)?.message || String(error));
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete (globalThis as { window?: unknown }).window;
}

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
