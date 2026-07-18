#!/usr/bin/env node
// Wearable OAuth runtime adapter behavior.

import './_node-shim.js';
import {
  exposeWearableAuthDebug,
  getWearableAuthLocation,
  redirectWearableAuth,
} from '../js/wearables-auth-runtime.js';

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

console.log('=== Wearables Auth Runtime Tests ===');

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function setRuntime(value) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    enumerable: true,
    value,
  });
}

function restoreWindow() {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
}

try {
  const location = { origin: 'https://app.example', pathname: '/app', href: 'https://app.example/app' };
  const runtime = {
    location,
  };
  setRuntime(runtime);

  assert('wearables auth runtime reads browser location',
    getWearableAuthLocation() === location);
  assert('wearables auth runtime redirects through location href',
    redirectWearableAuth('https://provider.example/auth') &&
      location.href === 'https://provider.example/auth');
  assert('wearables auth runtime skips debug export when disabled',
    exposeWearableAuthDebug('_testAuth', { ok: true }, false) === false &&
      runtime._testAuth === undefined);
  assert('wearables auth runtime exports debug API when enabled',
    exposeWearableAuthDebug('_testAuth', { ok: true }, true) === true &&
      runtime._testAuth.ok === true);

  delete runtime.location;
  assert('wearables auth runtime handles missing optional browser globals',
    getWearableAuthLocation() === null &&
      redirectWearableAuth('https://provider.example/auth') === false);

  delete globalThis.window;
  assert('wearables auth runtime no-ops without browser window',
    getWearableAuthLocation() === null &&
      exposeWearableAuthDebug('_missingWindowAuth', { ok: true }, true) === false);
} finally {
  restoreWindow();
}

try {
  delete globalThis.window;
  await import('../js/wearables-auth-runtime.js?no-window-probe');
  assert('wearables auth runtime imports without a browser window', true);
} catch (error) {
  assert('wearables auth runtime imports without a browser window', false, error?.message || String(error));
} finally {
  restoreWindow();
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
