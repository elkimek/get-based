#!/usr/bin/env node
// Apple Health import runtime adapter behavior.

import './_node-shim.js';
import {
  configureAppleHealthRuntimeDeps,
  getAppleHealthJSZip,
  parseAppleHealthCycleRuntime,
  showAppleHealthCyclePreviewRuntime,
} from '../js/wearables-apple-health-runtime.js';

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

console.log('=== Wearables Apple Health Runtime Tests ===');

const runtimeKeys = ['window'];
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
  const fakeJSZip = { loadAsync: () => Promise.resolve({}) };
  const browserRuntime = { JSZip: fakeJSZip };
  setRuntimeValue('window', browserRuntime);

  assert('getAppleHealthJSZip reads the browser JSZip binding',
    getAppleHealthJSZip() === fakeJSZip);

  assert('Apple Health debug helpers stay module-only',
    typeof browserRuntime._appleHealth === 'undefined');

  delete browserRuntime.JSZip;
  assert('getAppleHealthJSZip returns null when JSZip is unavailable',
    getAppleHealthJSZip() === null);

  delete globalThis.window;
  assert('Apple Health runtime adapter no-ops without a browser window',
    getAppleHealthJSZip() === null && typeof globalThis._appleHealth === 'undefined');

  const runtimeCalls = [];
  const parsed = { observations: [{ date: '2026-07-22' }] };
  const previousRuntime = configureAppleHealthRuntimeDeps({
    parseCycleBlob: async (blob, fileName, onProgress) => {
      runtimeCalls.push(['parse', blob.size, fileName]);
      onProgress?.({ stage: 'parsing-cycle' });
      return parsed;
    },
    showCyclePreview: async value => {
      runtimeCalls.push(['preview', value]);
      return { periods: 1 };
    },
  });
  let progressStage = '';
  const parsedResult = await parseAppleHealthCycleRuntime(
    new Blob(['cycle']),
    'export.xml',
    event => { progressStage = event.stage; }
  );
  const previewResult = await showAppleHealthCyclePreviewRuntime(parsedResult);
  configureAppleHealthRuntimeDeps({ parseCycleBlob: null, showCyclePreview: null });
  const missingParsedResult = await parseAppleHealthCycleRuntime(new Blob(), 'missing.xml');
  const missingPreviewResult = await showAppleHealthCyclePreviewRuntime(parsed);
  configureAppleHealthRuntimeDeps(previousRuntime);
  assert('Apple Health runtime invokes injected cycle import callbacks',
    parsedResult === parsed
      && previewResult?.periods === 1
      && progressStage === 'parsing-cycle'
      && JSON.stringify(runtimeCalls) === JSON.stringify([
        ['parse', 5, 'export.xml'],
        ['preview', parsed],
      ]));
  assert('Apple Health cycle runtime safely no-ops without callbacks',
    missingParsedResult === null && missingPreviewResult === null);
} finally {
  restoreRuntime();
}

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
try {
  delete globalThis.window;
  await import('../js/wearables-apple-health-runtime.js?no-window-probe');
  assert('Apple Health runtime imports without a browser window', true);
} catch (error) {
  assert('Apple Health runtime imports without a browser window', false, error?.message || String(error));
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
