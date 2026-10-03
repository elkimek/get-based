#!/usr/bin/env node
import { readServiceWorkerSource } from '../scripts/service-worker-source.js';
import { setRuntimeValue, captureRuntimeGlobals } from './helpers/runtime-globals.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
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

const { assert, results: legacyAssertions } = createLegacyAssertions(" - ");

console.log('=== Wearables Connect Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  'location',
  'history',
  'addEventListener',
];
const restoreRuntime = captureRuntimeGlobals(runtimeKeys);

try {
  const calls: unknown[][] = [];
  setRuntimeValue('window', globalThis);
  setRuntimeValue('location', { search: '?state=abc&code=def', pathname: '/app' });
  setRuntimeValue('history', {
    replaceState: (state: unknown, title: unknown, pathValue: unknown) => calls.push(['replaceState', String(state), title, pathValue]),
  });
  configureWearablesConnectRuntimeDeps({ navigate: route => calls.push(['navigate', route]) });
  setRuntimeValue('addEventListener', (eventName: unknown, handler: () => unknown) => {
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
    ].join(',') && addedUnload === true && (unloaded as boolean) === true);

  delete (globalThis as {window?: unknown}).window;
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
  const connectLoaderSrc = fs.readFileSync(path.join(root, 'js/wearables-connect-loader.js'), 'utf8');
  const connectRuntimeSrc = fs.readFileSync(path.join(root, 'js/wearables-connect-runtime.js'), 'utf8');
  const settingsRuntimeSrc = fs.readFileSync(path.join(root, 'js/wearables-settings-runtime.js'), 'utf8');
  const appShellHooksSrc = fs.readFileSync(path.join(root, 'js/app-shell-hooks.js'), 'utf8');
  const swSrc = readServiceWorkerSource(relative => fs.readFileSync(path.join(root, relative), 'utf8'));
  assert('wearables connect delegates browser globals through runtime adapter',
    connectSrc.includes("from './wearables-connect-runtime.js'") &&
      !/\bwindow(?:\.|\s*\[)/.test(connectSrc) &&
      swSrc.includes("'/js/wearables-connect-runtime.js'"));
  assert('wearables connect loader is retryable and available offline',
    connectLoaderSrc.includes("import('./wearables-connect.js')") &&
      connectLoaderSrc.includes("import('./wearables-connect.js?lazy-retry=1')") &&
      swSrc.includes("'/js/wearables-connect-loader.js'"));
  assert('wearable navigation stays dependency-injected from the app shell',
    !connectRuntimeSrc.includes('getViewRuntimeFunction') &&
      !settingsRuntimeSrc.includes('getViewRuntimeFunction') &&
      appShellHooksSrc.includes('configureWearablesConnectRuntimeDeps({ navigate });') &&
      appShellHooksSrc.includes('configureWearableSettingsRuntimeDeps({ navigate });'));
} finally {
  configureWearablesConnectRuntimeDeps(originalWearablesConnectRuntimeDeps);
  restoreRuntime();
}

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
process.exit(legacyAssertions.fail > 0 ? 1 : 0);
