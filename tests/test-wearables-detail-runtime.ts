#!/usr/bin/env node
import { readServiceWorkerSource } from '../scripts/service-worker-source.js';
import { setRuntimeValue, captureRuntimeGlobals } from './helpers/runtime-globals.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
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

const { assert, results: legacyAssertions } = createLegacyAssertions(" - ");

console.log('=== Wearables Detail Runtime Tests ===\n');

const runtimeKeys = ['window', 'Chart'];
const restoreRuntime = captureRuntimeGlobals(runtimeKeys);

try {
  const calls: unknown[][] = [];
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
  setRuntimeValue('Chart', function Chart(this: {canvas: unknown; config: unknown}, canvas: {id: unknown}, config: {type: unknown}) {
    this.canvas = canvas;
    this.config = config;
    calls.push(['chart', canvas.id, config.type]);
  });

  rememberWearableDetailModalTriggerRuntime();
  navigateWearableDetailRuntime('dashboard');
  closeWearableDetailModalRuntime();
  const confirmed = await confirmWearableDetailActionRuntime('delete');
  const cancelled = await confirmWearableDetailActionRuntime('keep');
  const chart = (createWearableDetailChartRuntime as unknown as (canvas: {id: unknown}, config: Parameters<typeof createWearableDetailChartRuntime>[1]) => ReturnType<typeof createWearableDetailChartRuntime>)({ id: 'chart-modal' }, { type: 'line' });

  assert('wearable detail runtime delegates shell hooks',
    calls.some(call => call.join('|') === 'remember') &&
      calls.some(call => call.join('|') === 'navigate|dashboard') &&
      calls.some(call => call.join('|') === 'close') &&
      calls.some(call => call.join('|') === 'confirm|delete') &&
      confirmed === true &&
      cancelled === false);
  assert('wearable detail runtime constructs Chart instances',
    hasWearableDetailChartRuntime() === true &&
      (chart as {canvas?: {id?: unknown}} | null | undefined)?.canvas?.id === 'chart-modal' &&
      (chart as {config?: {type?: unknown}} | null | undefined)?.config?.type === 'line' &&
      calls.some(call => call.join('|') === 'chart|chart-modal|line'));

  configureWearableDetailRuntimeDeps({
    closeModal: null,
    navigate: null,
    rememberModalTrigger: null,
    showConfirmDialog: null,
  });
  delete (globalThis as {Chart?: unknown}).Chart;
  const missingConfirm = await confirmWearableDetailActionRuntime('delete');
  const missingChart = (createWearableDetailChartRuntime as unknown as (canvas: {id: unknown}, config: Parameters<typeof createWearableDetailChartRuntime>[1]) => ReturnType<typeof createWearableDetailChartRuntime>)({ id: 'chart-modal' }, { type: 'line' });
  assert('wearable detail runtime handles missing optional hooks',
    missingConfirm === false &&
      hasWearableDetailChartRuntime() === false &&
      missingChart === null);

  delete (globalThis as {window?: unknown}).window;
  const beforeNoWindowCalls = calls.length;
  rememberWearableDetailModalTriggerRuntime();
  navigateWearableDetailRuntime('dashboard');
  closeWearableDetailModalRuntime();
  const noWindowConfirm = await confirmWearableDetailActionRuntime('delete');
  const noWindowChart = (createWearableDetailChartRuntime as unknown as (canvas: {id: unknown}, config: Parameters<typeof createWearableDetailChartRuntime>[1]) => ReturnType<typeof createWearableDetailChartRuntime>)({ id: 'chart-modal' }, { type: 'line' });
  assert('wearable detail runtime no-ops safely when window is missing',
    calls.length === beforeNoWindowCalls &&
      noWindowConfirm === false &&
      noWindowChart === null);

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const detailSrc = fs.readFileSync(path.join(root, 'js/wearables-detail-modal.js'), 'utf8');
  const runtimeSrc = fs.readFileSync(path.join(root, 'js/wearables-detail-runtime.js'), 'utf8');
  const appShellHooksSrc = fs.readFileSync(path.join(root, 'js/app-shell-hooks.js'), 'utf8');
  const swSrc = readServiceWorkerSource(relative => fs.readFileSync(path.join(root, relative), 'utf8'));
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

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
process.exit(legacyAssertions.fail > 0 ? 1 : 0);
