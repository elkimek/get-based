#!/usr/bin/env node
// Apple Health import runtime adapter behavior.

import './_node-shim.js';
import {
  exposeAppleHealthDebugBindings,
  getAppleHealthJSZip,
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

  const debugBindings = { _appleHealth: { probe: true } };
  exposeAppleHealthDebugBindings(debugBindings);
  assert('exposeAppleHealthDebugBindings publishes debug bindings to the browser runtime',
    browserRuntime._appleHealth === debugBindings._appleHealth);

  delete browserRuntime.JSZip;
  assert('getAppleHealthJSZip returns null when JSZip is unavailable',
    getAppleHealthJSZip() === null);

  delete globalThis.window;
  exposeAppleHealthDebugBindings({ _appleHealth: { ignored: true } });
  assert('Apple Health runtime adapter no-ops without a browser window',
    getAppleHealthJSZip() === null && typeof globalThis._appleHealth === 'undefined');
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
