#!/usr/bin/env node
// test-sun-defaults-runtime.js - Light setup browser adapter behavior.

import './_node-shim.js';
import {
  exposeSunDefaultsBindings,
  getSunSetupCoords,
  getSunSetupProfileLocation,
  hasSunDefaultsBrowserRuntime,
  hasSunSetupPreciseLocationRequester,
  invokeSunDefaultsBinding,
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
  'getSunCoords',
  'getProfileLocation',
  'openProfileLocationEditor',
  'openClientList',
  'requestPreciseLocation',
  'navigate',
  'saveSunSetup',
  'sunDefaultsProbe',
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
  setRuntimeValue('getSunCoords', () => ({ lat: 50.08, lon: 14.42, source: 'profile-precise' }));
  setRuntimeValue('getProfileLocation', () => ({ country: 'Czech Republic' }));
  setRuntimeValue('openProfileLocationEditor', () => calls.push(['profile-location']));
  setRuntimeValue('openClientList', () => calls.push(['client-list']));
  setRuntimeValue('requestPreciseLocation', () => {
    calls.push(['precise']);
    return Promise.resolve({ lat: 50.1, lon: 14.4 });
  });
  setRuntimeValue('navigate', route => calls.push(['navigate', route]));

  assert('hasSunDefaultsBrowserRuntime detects browser runtime',
    hasSunDefaultsBrowserRuntime() === true);
  assert('getSunSetupCoords delegates to runtime coords provider',
    getSunSetupCoords()?.source === 'profile-precise');
  assert('getSunSetupProfileLocation delegates to profile location provider',
    getSunSetupProfileLocation().country === 'Czech Republic');
  assert('openSunSetupProfileLocationRuntime prefers profile editor',
    openSunSetupProfileLocationRuntime() === true &&
    calls.some(call => call[0] === 'profile-location'));

  delete globalThis.openProfileLocationEditor;
  assert('openSunSetupProfileLocationRuntime falls back to client list',
    openSunSetupProfileLocationRuntime() === true &&
    calls.some(call => call[0] === 'client-list'));

  assert('hasSunSetupPreciseLocationRequester detects location requester',
    hasSunSetupPreciseLocationRequester() === true);
  const coords = await requestSunSetupPreciseLocationRuntime();
  assert('requestSunSetupPreciseLocationRuntime delegates to precise requester',
    coords?.lat === 50.1 && calls.some(call => call[0] === 'precise'));

  navigateSunDefaultsRoute('light');
  assert('navigateSunDefaultsRoute delegates route navigation',
    calls.some(call => call[0] === 'navigate' && call[1] === 'light'));

  const probe = () => 'ok';
  exposeSunDefaultsBindings({ sunDefaultsProbe: probe });
  assert('exposeSunDefaultsBindings publishes runtime bindings',
    globalThis.sunDefaultsProbe === probe);

  let localCalls = 0;
  let runtimeCalls = 0;
  const localSave = () => { localCalls++; return 'local'; };
  const runtimeSave = () => { runtimeCalls++; return 'runtime'; };
  setRuntimeValue('saveSunSetup', runtimeSave);
  assert('invokeSunDefaultsBinding prefers current runtime binding when replaced',
    invokeSunDefaultsBinding('saveSunSetup', localSave) === 'runtime' &&
    runtimeCalls === 1 &&
    localCalls === 0);
  setRuntimeValue('saveSunSetup', localSave);
  assert('invokeSunDefaultsBinding uses local function when it is current',
    invokeSunDefaultsBinding('saveSunSetup', localSave) === 'local' &&
    runtimeCalls === 1 &&
    localCalls === 1);

  delete globalThis.getSunCoords;
  delete globalThis.getProfileLocation;
  delete globalThis.openClientList;
  delete globalThis.requestPreciseLocation;
  delete globalThis.navigate;
  assert('missing runtime functions return safe fallbacks',
    getSunSetupCoords() === null &&
    Object.keys(getSunSetupProfileLocation()).length === 0 &&
    openSunSetupProfileLocationRuntime() === false &&
    hasSunSetupPreciseLocationRequester() === false &&
    requestSunSetupPreciseLocationRuntime() === null);

  delete globalThis.window;
  const beforeNoWindowCalls = calls.length;
  navigateSunDefaultsRoute('light');
  exposeSunDefaultsBindings({ sunDefaultsProbe: null });
  assert('runtime adapter no-ops safely when window is missing',
    hasSunDefaultsBrowserRuntime() === false &&
    getSunSetupCoords() === null &&
    Object.keys(getSunSetupProfileLocation()).length === 0 &&
    openSunSetupProfileLocationRuntime() === false &&
    hasSunSetupPreciseLocationRequester() === false &&
    requestSunSetupPreciseLocationRuntime() === null &&
    calls.length === beforeNoWindowCalls &&
    globalThis.sunDefaultsProbe === probe);
} finally {
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
