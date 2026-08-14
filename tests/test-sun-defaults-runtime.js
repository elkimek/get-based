#!/usr/bin/env node
// test-sun-defaults-runtime.js - Light setup browser adapter behavior.

import './_node-shim.js';
import {
  clearSunSetupCurrentLocationRuntime,
  configureSunDefaultsRuntimeDeps,
  getSunSetupCoords,
  getSunSetupProfileLocation,
  hasSunSetupPreciseLocationRequester,
  navigateSunDefaultsRoute,
  openSunSetupProfileLocationRuntime,
  requestSunSetupPreciseLocationRuntime,
} from '../js/sun-defaults-runtime.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Sun Defaults Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  'getProfileLocation',
];
const savedDescriptors = new Map(runtimeKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const originalSunDefaultsRuntimeDeps = configureSunDefaultsRuntimeDeps();

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
  configureSunDefaultsRuntimeDeps({
    getSunCoords: () => ({ lat: 50.08, lon: 14.42, source: 'profile-precise' }),
    getProfileLocation: () => ({ country: 'Czech Republic', zip: '' }),
    requestPreciseLocation: () => {
      calls.push(['precise']);
      return Promise.resolve({ lat: 50.1, lon: 14.4 });
    },
    clearCurrentLocation: () => calls.push(['clear-current']),
    navigate: route => calls.push(['navigate', route]),
    openProfileLocationEditor: () => calls.push(['profile-location']),
    openClientList: () => calls.push(['client-list']),
  });

  assert('getSunSetupCoords delegates to runtime coords provider',
    getSunSetupCoords()?.source === 'profile-precise');
  assert('getSunSetupProfileLocation delegates to profile location provider',
    getSunSetupProfileLocation().country === 'Czech Republic');
  assert('openSunSetupProfileLocationRuntime prefers profile editor',
    openSunSetupProfileLocationRuntime() === true &&
    calls.some(call => call[0] === 'profile-location'));

  configureSunDefaultsRuntimeDeps({ openProfileLocationEditor: null });
  assert('openSunSetupProfileLocationRuntime falls back to client list',
    openSunSetupProfileLocationRuntime() === true &&
    calls.some(call => call[0] === 'client-list'));

  assert('hasSunSetupPreciseLocationRequester detects location requester',
    hasSunSetupPreciseLocationRequester() === true);
  const coords = await requestSunSetupPreciseLocationRuntime();
  assert('requestSunSetupPreciseLocationRuntime delegates to precise requester',
    coords?.lat === 50.1 && calls.some(call => call[0] === 'precise'));
  assert('clearSunSetupCurrentLocationRuntime delegates to the temporary-location clearer',
    clearSunSetupCurrentLocationRuntime() === true && calls.some(call => call[0] === 'clear-current'));

  navigateSunDefaultsRoute('light');
  assert('navigateSunDefaultsRoute delegates route navigation',
    calls.some(call => call[0] === 'navigate' && call[1] === 'light'));

  configureSunDefaultsRuntimeDeps({
    getSunCoords: null,
    getProfileLocation: () => ({ country: '', zip: '' }),
    navigate: null,
    requestPreciseLocation: null,
    clearCurrentLocation: null,
    openClientList: null,
  });
  assert('missing runtime functions return safe fallbacks',
    getSunSetupCoords() === null &&
    getSunSetupProfileLocation().country === '' &&
    openSunSetupProfileLocationRuntime() === false &&
    hasSunSetupPreciseLocationRequester() === false &&
    requestSunSetupPreciseLocationRuntime() === null &&
    clearSunSetupCurrentLocationRuntime() === false);

  delete globalThis.window;
  const beforeNoWindowCalls = calls.length;
  navigateSunDefaultsRoute('light');
  assert('runtime adapter no-ops safely when window is missing',
    getSunSetupCoords() === null &&
    getSunSetupProfileLocation().country === '' &&
    openSunSetupProfileLocationRuntime() === false &&
    hasSunSetupPreciseLocationRequester() === false &&
    requestSunSetupPreciseLocationRuntime() === null &&
    clearSunSetupCurrentLocationRuntime() === false &&
    calls.length === beforeNoWindowCalls);
} finally {
  configureSunDefaultsRuntimeDeps(originalSunDefaultsRuntimeDeps);
  restoreRuntime();
}

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
try {
  delete globalThis.window;
  await import('../js/sun-defaults-runtime.js?no-window-probe');
  assert('sun-defaults runtime imports without a browser window', true);
} catch (error) {
  assert('sun-defaults runtime imports without a browser window', false, error?.message || String(error));
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
