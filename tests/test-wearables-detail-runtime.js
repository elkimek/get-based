#!/usr/bin/env node
// test-wearables-detail-runtime.js - Wearable detail modal runtime adapter behavior.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import './_node-shim.js';
import {
  closeWearableDetailModalRuntime,
  configureWearableDetailRuntimeDeps,
  confirmWearableDetailActionRuntime,
  createWearableDetailChartRuntime,
  hasWearableDetailChartRuntime,
  navigateWearableDetailRuntime,
  rememberWearableDetailModalTriggerRuntime,
} from '../js/wearables-detail-runtime.js';

const originalWearableDetailRuntimeDeps = configureWearableDetailRuntimeDeps();

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Wearables Detail Runtime Tests ===\n');

const runtimeKeys = ['window', 'Chart'];
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
  configureWearableDetailRuntimeDeps({
    closeModal: () => calls.push(['close']),
    navigate: route => calls.push(['navigate', route]),
    rememberModalTrigger: () => calls.push(['remember']),
    showConfirmDialog: async message => {
      calls.push(['confirm', message]);
      return message === 'delete';
    },
  });
  setRuntimeValue('Chart', function Chart(canvas, config) {
    this.canvas = canvas;
    this.config = config;
    calls.push(['chart', canvas.id, config.type]);
  });

  rememberWearableDetailModalTriggerRuntime();
  navigateWearableDetailRuntime('dashboard');
  closeWearableDetailModalRuntime();
  const confirmed = await confirmWearableDetailActionRuntime('delete');
  const cancelled = await confirmWearableDetailActionRuntime('keep');
  const chart = createWearableDetailChartRuntime({ id: 'chart-modal' }, { type: 'line' });

  assert('wearable detail runtime delegates shell hooks',
    calls.some(call => call.join('|') === 'remember') &&
      calls.some(call => call.join('|') === 'navigate|dashboard') &&
      calls.some(call => call.join('|') === 'close') &&
      calls.some(call => call.join('|') === 'confirm|delete') &&
      confirmed === true &&
      cancelled === false);
  assert('wearable detail runtime constructs Chart instances',
    hasWearableDetailChartRuntime() === true &&
      chart?.canvas?.id === 'chart-modal' &&
      chart?.config?.type === 'line' &&
      calls.some(call => call.join('|') === 'chart|chart-modal|line'));

  configureWearableDetailRuntimeDeps({
    closeModal: null,
    navigate: null,
    rememberModalTrigger: null,
    showConfirmDialog: null,
  });
  delete globalThis.Chart;
  const missingConfirm = await confirmWearableDetailActionRuntime('delete');
  const missingChart = createWearableDetailChartRuntime({ id: 'chart-modal' }, { type: 'line' });
  assert('wearable detail runtime handles missing optional hooks',
    missingConfirm === false &&
      hasWearableDetailChartRuntime() === false &&
      missingChart === null);

  delete globalThis.window;
  const beforeNoWindowCalls = calls.length;
  rememberWearableDetailModalTriggerRuntime();
  navigateWearableDetailRuntime('dashboard');
  closeWearableDetailModalRuntime();
  const noWindowConfirm = await confirmWearableDetailActionRuntime('delete');
  const noWindowChart = createWearableDetailChartRuntime({ id: 'chart-modal' }, { type: 'line' });
  assert('wearable detail runtime no-ops safely when window is missing',
    calls.length === beforeNoWindowCalls &&
      noWindowConfirm === false &&
      noWindowChart === null);

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const detailSrc = fs.readFileSync(path.join(root, 'js/wearables-detail-modal.js'), 'utf8');
  const runtimeSrc = fs.readFileSync(path.join(root, 'js/wearables-detail-runtime.js'), 'utf8');
  const appShellHooksSrc = fs.readFileSync(path.join(root, 'js/app-shell-hooks.js'), 'utf8');
  const swSrc = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  assert('wearable detail modal delegates browser globals through runtime adapter',
    detailSrc.includes("from './wearables-detail-runtime.js'") &&
      !/\bwindow(?:\.|\s*\[)/.test(detailSrc) &&
      swSrc.includes("'/js/wearables-detail-runtime.js'"));
  assert('wearable detail shell actions use explicit app-shell dependencies',
    !runtimeSrc.includes("from './views-runtime-bridge.js'") &&
      !runtimeSrc.includes('getViewRuntimeFunction') &&
      runtimeSrc.includes('wearableDetailRuntimeDeps.rememberModalTrigger?.();') &&
      runtimeSrc.includes("wearableDetailRuntimeDeps.navigate?.(route || 'dashboard');") &&
      runtimeSrc.includes('wearableDetailRuntimeDeps.closeModal?.();') &&
      appShellHooksSrc.includes("import { configureWearableDetailRuntimeDeps } from './wearables-detail-runtime.js';") &&
      appShellHooksSrc.includes('configureWearableDetailRuntimeDeps({ closeModal, navigate, rememberModalTrigger });'));
} finally {
  configureWearableDetailRuntimeDeps(originalWearableDetailRuntimeDeps);
  restoreRuntime();
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
