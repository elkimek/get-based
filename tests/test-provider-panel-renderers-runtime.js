#!/usr/bin/env node
// Provider panel renderer runtime adapter behavior.

import './_node-shim.js';
import {
  configureProviderPanelRendererRuntime,
  discoverRoutstrNodesFromRuntime,
  getSelectedRoutstrNodeFromRuntime,
  setSelectedRoutstrNodeFromRuntime,
} from '../js/provider-panel-renderers-runtime.js';

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

console.log('=== Provider Panel Renderers Runtime Tests ===');

let previousRuntime;
try {
  const calls = [];
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
  delete globalThis.window;
  await import('../js/provider-panel-renderers-runtime.js?no-window-probe');
  assert('provider panel renderers runtime imports without a browser window', true);
} catch (error) {
  assert('provider panel renderers runtime imports without a browser window', false, error?.message || String(error));
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
