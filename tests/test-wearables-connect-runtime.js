#!/usr/bin/env node
// test-wearables-connect-runtime.js - Wearables connect runtime adapter behavior.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import './_node-shim.js';
import {
  addWearablesBeforeUnloadRuntime,
  clearWearableOAuthCallbackRuntime,
  configureWearablesConnectRuntimeDeps,
  getWearableOAuthSearchParamsRuntime,
  navigateWearablesDashboardAfterConnectRuntime,
} from '../js/wearables-connect-runtime.js';

const originalWearablesConnectRuntimeDeps = configureWearablesConnectRuntimeDeps();

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Wearables Connect Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  'location',
  'history',
  'addEventListener',
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
  setRuntimeValue('window', globalThis);
  setRuntimeValue('location', { search: '?state=abc&code=def', pathname: '/app' });
  setRuntimeValue('history', {
    replaceState: (state, title, pathValue) => calls.push(['replaceState', String(state), title, pathValue]),
  });
  configureWearablesConnectRuntimeDeps({ navigate: route => calls.push(['navigate', route]) });
  setRuntimeValue('addEventListener', (eventName, handler) => {
    calls.push(['addEventListener', eventName]);
    if (eventName === 'beforeunload') handler();
  });

  const params = getWearableOAuthSearchParamsRuntime();
  clearWearableOAuthCallbackRuntime();
  navigateWearablesDashboardAfterConnectRuntime();
  let unloaded = false;
  const addedUnload = addWearablesBeforeUnloadRuntime(() => { unloaded = true; });

  assert('wearables connect runtime reads callback search params',
    params.get('state') === 'abc' && params.get('code') === 'def');
  assert('wearables connect runtime delegates history and dashboard hooks',
    calls.map(call => call.join('|')).join(',') === [
      'replaceState|null||/app',
      'navigate|dashboard',
      'addEventListener|beforeunload',
    ].join(',') && addedUnload === true && unloaded === true);

  delete globalThis.window;
  configureWearablesConnectRuntimeDeps({ navigate: null });
  const beforeNoWindowCalls = calls.length;
  const emptyParams = getWearableOAuthSearchParamsRuntime();
  clearWearableOAuthCallbackRuntime();
  navigateWearablesDashboardAfterConnectRuntime();
  const noUnload = addWearablesBeforeUnloadRuntime(() => calls.push(['unexpected']));
  assert('wearables connect runtime no-ops safely when window is missing',
    emptyParams.toString() === '' &&
      noUnload === false &&
      calls.length === beforeNoWindowCalls);

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const connectSrc = fs.readFileSync(path.join(root, 'js/wearables-connect.js'), 'utf8');
  const connectRuntimeSrc = fs.readFileSync(path.join(root, 'js/wearables-connect-runtime.js'), 'utf8');
  const settingsRuntimeSrc = fs.readFileSync(path.join(root, 'js/wearables-settings-runtime.js'), 'utf8');
  const appShellHooksSrc = fs.readFileSync(path.join(root, 'js/app-shell-hooks.js'), 'utf8');
  const swSrc = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  assert('wearables connect delegates browser globals through runtime adapter',
    connectSrc.includes("from './wearables-connect-runtime.js'") &&
      !/\bwindow(?:\.|\s*\[)/.test(connectSrc) &&
      swSrc.includes("'/js/wearables-connect-runtime.js'"));
  assert('wearable navigation stays dependency-injected from the app shell',
    !connectRuntimeSrc.includes('getViewRuntimeFunction') &&
      !settingsRuntimeSrc.includes('getViewRuntimeFunction') &&
      appShellHooksSrc.includes('configureWearablesConnectRuntimeDeps({ navigate });') &&
      appShellHooksSrc.includes('configureWearableSettingsRuntimeDeps({ navigate });'));
} finally {
  configureWearablesConnectRuntimeDeps(originalWearablesConnectRuntimeDeps);
  restoreRuntime();
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
