#!/usr/bin/env node
import { importFreshModule } from './helpers/fresh-module.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// Wearable OAuth runtime adapter behavior.

import './_node-shim.js';
import {
  exposeWearableAuthDebug,
  getWearableAuthLocation,
  redirectWearableAuth,
} from '../js/wearables-auth-runtime.js';




const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

console.log('=== Wearables Auth Runtime Tests ===');

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function setRuntime(value: unknown) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    enumerable: true,
    value,
  });
}

function restoreWindow() {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete (globalThis as {window?: unknown}).window;
}

try {
  const location = { origin: 'https://app.example', pathname: '/app', href: 'https://app.example/app' };
  const runtime: {location?: typeof location; _testAuth?: unknown} = {
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
      (runtime._testAuth as {ok?: unknown}).ok === true);

  delete runtime.location;
  assert('wearables auth runtime handles missing optional browser globals',
    getWearableAuthLocation() === null &&
      redirectWearableAuth('https://provider.example/auth') === false);

  delete (globalThis as {window?: unknown}).window;
  assert('wearables auth runtime no-ops without browser window',
    getWearableAuthLocation() === null &&
      exposeWearableAuthDebug('_missingWindowAuth', { ok: true }, true) === false);
} finally {
  restoreWindow();
}

try {
  delete (globalThis as {window?: unknown}).window;
  await importFreshModule(new URL('../js/wearables-auth-runtime.js?no-window-probe', import.meta.url));
  assert('wearables auth runtime imports without a browser window', true);
} catch (error) {
  assert('wearables auth runtime imports without a browser window', false, (error as {message?: unknown} | null | undefined)?.message || String(error));
} finally {
  restoreWindow();
}

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
