#!/usr/bin/env node
// test-sync-pull-active-refresh-runtime.js - Active sync pull refresh runtime adapter behavior.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import './_node-shim.js';
import {
  configureSyncPullActiveRefreshDeps,
  dispatchSyncAppliedRuntime,
  navigatePulledActiveViewRuntime,
  rebuildPulledSidebarRuntime,
  refreshPulledChatRuntime,
} from '../js/sync-pull-active-refresh-runtime.js';
import { configureViewRuntime } from '../js/views-runtime-bridge.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Sync Pull Active Refresh Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  'loadChatHistory',
  'navigate',
  'CustomEvent',
  'dispatchEvent',
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

const calls = [];
let previousViewRuntime = null;
const previousDeps = configureSyncPullActiveRefreshDeps({
  loadChatThreads: () => calls.push(['loadChatThreads']),
  ensureActiveThread: () => calls.push(['ensureActiveThread']),
  renderThreadList: () => calls.push(['renderThreadList']),
});

try {
  setRuntimeValue('window', globalThis);
  setRuntimeValue('loadChatHistory', () => calls.push(['loadChatHistory']));
  previousViewRuntime = configureViewRuntime({
    buildSidebar: () => calls.push(['buildSidebar']),
  });
  setRuntimeValue('navigate', (route, options) => calls.push(['navigate', route, options?.preserveScroll]));
  setRuntimeValue('CustomEvent', class CustomEvent {
    constructor(type) { this.type = type; }
  });
  setRuntimeValue('dispatchEvent', event => {
    calls.push(['dispatchEvent', event.type]);
    return true;
  });

  refreshPulledChatRuntime();
  rebuildPulledSidebarRuntime();
  navigatePulledActiveViewRuntime('labs', { preserveScroll: true });
  dispatchSyncAppliedRuntime();

  assert('sync pull active refresh runtime delegates shell hooks',
    calls.map(call => call.join('|')).join(',') === [
      'loadChatThreads',
      'ensureActiveThread',
      'renderThreadList',
      'loadChatHistory',
      'buildSidebar',
      'navigate|labs|true',
      'dispatchEvent|labcharts-sync-applied',
    ].join(','));

  configureViewRuntime({ buildSidebar: () => { throw new Error('sidebar boom'); } });
  assert('sync pull active refresh runtime guards sidebar rebuild failures',
    rebuildPulledSidebarRuntime() === undefined);

  configureSyncPullActiveRefreshDeps({
    loadChatThreads: () => undefined,
    ensureActiveThread: () => {},
    renderThreadList: () => {},
  });
  delete globalThis.window;
  configureViewRuntime({ buildSidebar: null });
  const beforeNoWindowCalls = calls.length;
  refreshPulledChatRuntime();
  rebuildPulledSidebarRuntime();
  navigatePulledActiveViewRuntime('labs', { preserveScroll: true });
  dispatchSyncAppliedRuntime();
  assert('sync pull active refresh runtime no-ops safely when window is missing',
    calls.length === beforeNoWindowCalls);

  setRuntimeValue('window', globalThis);
  delete globalThis.CustomEvent;
  delete globalThis.dispatchEvent;
  dispatchSyncAppliedRuntime();
  assert('sync pull active refresh runtime skips event dispatch when unsupported',
    calls.length === beforeNoWindowCalls);

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const refreshSrc = fs.readFileSync(path.join(root, 'js/sync-pull-active-refresh.js'), 'utf8');
  const swSrc = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  assert('sync pull active refresh delegates browser globals through runtime adapter',
    refreshSrc.includes("from './sync-pull-active-refresh-runtime.js'") &&
      !/\bwindow(?:\.|\s*\[)/.test(refreshSrc) &&
      swSrc.includes("'/js/sync-pull-active-refresh-runtime.js'"));
} finally {
  configureViewRuntime({ buildSidebar: null, ...previousViewRuntime });
  configureSyncPullActiveRefreshDeps(previousDeps);
  restoreRuntime();
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
