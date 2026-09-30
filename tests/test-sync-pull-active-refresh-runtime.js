#!/usr/bin/env node
import { setRuntimeValue, captureRuntimeGlobals } from './helpers/runtime-globals.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
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

const { assert, results: legacyAssertions } = createLegacyAssertions(" - ");

console.log('=== Sync Pull Active Refresh Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  'CustomEvent',
  'dispatchEvent',
];
const restoreRuntime = captureRuntimeGlobals(runtimeKeys);

const calls = [];
const previousDeps = configureSyncPullActiveRefreshDeps({
  buildSidebar: () => calls.push(['buildSidebar']),
  loadChatHistory: () => calls.push(['loadChatHistory']),
  loadChatThreads: () => calls.push(['loadChatThreads']),
  refreshChatPersonalities: () => calls.push(['refreshChatPersonalities']),
  ensureActiveThread: () => calls.push(['ensureActiveThread']),
  navigate: (route, options) => calls.push(['navigate', route, options?.preserveScroll]),
  renderThreadList: () => calls.push(['renderThreadList']),
});

try {
  setRuntimeValue('window', globalThis);
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
      'refreshChatPersonalities',
      'loadChatThreads',
      'ensureActiveThread',
      'renderThreadList',
      'loadChatHistory',
      'buildSidebar',
      'navigate|labs|true',
      'dispatchEvent|labcharts-sync-applied',
    ].join(','));

  const asyncCalls = [];
  configureSyncPullActiveRefreshDeps({
    refreshChatPersonalities: async () => { asyncCalls.push('refreshChatPersonalities'); },
    loadChatThreads: async () => { asyncCalls.push('loadChatThreads'); return false; },
    ensureActiveThread: () => asyncCalls.push('ensureActiveThread'),
    renderThreadList: () => asyncCalls.push('renderThreadList'),
    loadChatHistory: async () => { asyncCalls.push('loadChatHistory'); return 'history-loaded'; },
  });
  const blockedRefresh = await refreshPulledChatRuntime();
  assert('async thread load failure renders the safe list without selecting or loading a thread',
    blockedRefresh === false
      && asyncCalls.join('|') === 'refreshChatPersonalities|loadChatThreads|renderThreadList');

  asyncCalls.length = 0;
  configureSyncPullActiveRefreshDeps({
    loadChatThreads: async () => { asyncCalls.push('loadChatThreads'); return true; },
  });
  const completedRefresh = await refreshPulledChatRuntime();
  assert('async thread load success preserves refresh ordering and awaits history',
    completedRefresh === 'history-loaded'
      && asyncCalls.join('|') === 'refreshChatPersonalities|loadChatThreads|ensureActiveThread|renderThreadList|loadChatHistory');

  configureSyncPullActiveRefreshDeps({ buildSidebar: () => { throw new Error('sidebar boom'); } });
  assert('sync pull active refresh runtime guards sidebar rebuild failures',
    rebuildPulledSidebarRuntime() === undefined);

  configureSyncPullActiveRefreshDeps({
    buildSidebar: null,
    loadChatHistory: () => undefined,
    loadChatThreads: () => undefined,
    refreshChatPersonalities: () => undefined,
    ensureActiveThread: () => {},
    navigate: null,
    renderThreadList: () => {},
  });
  delete globalThis.window;
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
  configureSyncPullActiveRefreshDeps(previousDeps);
  restoreRuntime();
}

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
process.exit(legacyAssertions.fail > 0 ? 1 : 0);
