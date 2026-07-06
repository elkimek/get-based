#!/usr/bin/env node
// Provider panel renderer runtime adapter behavior.

import './_node-shim.js';
import {
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

const runtimeKeys = [
  'window',
  'nostrGetSelectedNode',
  'nostrDiscoverNodes',
  'nostrSetSelectedNode',
];
const savedDescriptors = new Map(runtimeKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

function setRuntimeValue(key, value) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    enumerable: true,
    value,
  });
}

function restoreRuntime() {
  for (const key of runtimeKeys) {
    const descriptor = savedDescriptors.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

try {
  const calls = [];
  const browserRuntime = {
    nostrGetSelectedNode() {
      calls.push(['get', this === browserRuntime]);
      return 'https://node.selected.test';
    },
    nostrDiscoverNodes() {
      calls.push(['discover', this === browserRuntime]);
      return Promise.resolve([{ online: true, urls: ['https://node.discovered.test'] }]);
    },
    nostrSetSelectedNode(nodeUrl) {
      calls.push(['set', nodeUrl, this === browserRuntime]);
    },
  };
  setRuntimeValue('window', browserRuntime);

  assert('getSelectedRoutstrNodeFromRuntime delegates selected node lookup',
    getSelectedRoutstrNodeFromRuntime() === 'https://node.selected.test'
      && calls.some(call => call[0] === 'get' && call[1] === true));

  const discovered = await discoverRoutstrNodesFromRuntime();
  assert('discoverRoutstrNodesFromRuntime delegates node discovery',
    discovered?.[0]?.urls?.[0] === 'https://node.discovered.test'
      && calls.some(call => call[0] === 'discover' && call[1] === true));

  setSelectedRoutstrNodeFromRuntime('https://node.saved.test');
  assert('setSelectedRoutstrNodeFromRuntime delegates selected node updates',
    calls.some(call => call[0] === 'set' && call[1] === 'https://node.saved.test' && call[2] === true));

  delete browserRuntime.nostrGetSelectedNode;
  delete browserRuntime.nostrDiscoverNodes;
  delete browserRuntime.nostrSetSelectedNode;
  setSelectedRoutstrNodeFromRuntime('missing');
  assert('provider renderer runtime hooks no-op when callbacks are missing',
    getSelectedRoutstrNodeFromRuntime() === null && discoverRoutstrNodesFromRuntime() === null);

  browserRuntime.nostrDiscoverNodes = () => [];
  assert('discoverRoutstrNodesFromRuntime ignores non-promise discovery callbacks',
    discoverRoutstrNodesFromRuntime() === null);

  delete globalThis.window;
  setRuntimeValue('nostrGetSelectedNode', () => 'https://global.node.test');
  assert('provider renderer runtime falls back to globalThis without window',
    getSelectedRoutstrNodeFromRuntime() === 'https://global.node.test');
} finally {
  restoreRuntime();
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
