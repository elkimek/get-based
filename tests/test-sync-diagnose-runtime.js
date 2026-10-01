#!/usr/bin/env node
import { readServiceWorkerSource } from '../scripts/service-worker-source.js';
import { setRuntimeValue, captureRuntimeGlobals } from './helpers/runtime-globals.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// test-sync-diagnose-runtime.js - Sync Diagnose runtime adapter behavior.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import './_node-shim.js';
import {
  configureSyncDiagnoseRuntimeDeps,
  confirmSyncDiagnoseActionRuntime,
} from '../js/sync-diagnose-runtime.js';

const originalSyncDiagnoseRuntimeDeps = configureSyncDiagnoseRuntimeDeps();

const { assert, results: legacyAssertions } = createLegacyAssertions(" - ");

console.log('=== Sync Diagnose Runtime Tests ===\n');

const runtimeKeys = ['window', 'showConfirmDialog'];
const restoreRuntime = captureRuntimeGlobals(runtimeKeys);

try {
  const calls = [];
  setRuntimeValue('window', globalThis);
  configureSyncDiagnoseRuntimeDeps({ showConfirmDialog: async message => {
    calls.push(message);
    return message === 'confirm';
  } });

  const confirmed = await confirmSyncDiagnoseActionRuntime('confirm');
  const cancelled = await confirmSyncDiagnoseActionRuntime('cancel');
  assert('sync diagnose runtime delegates confirm dialog',
    confirmed === true && cancelled === false && calls.join('|') === 'confirm|cancel');

  configureSyncDiagnoseRuntimeDeps({ showConfirmDialog: null });
  const defaultFallback = await confirmSyncDiagnoseActionRuntime('missing');
  const explicitFallback = await confirmSyncDiagnoseActionRuntime('missing', { fallback: false });
  assert('sync diagnose runtime preserves missing-confirm fallback',
    defaultFallback === true && explicitFallback === false);

  delete globalThis.window;
  const noWindowFallback = await confirmSyncDiagnoseActionRuntime('missing');
  assert('sync diagnose runtime no-ops safely when window is missing',
    noWindowFallback === true);

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const cutoverSrc = fs.readFileSync(path.join(root, 'js/sync-diagnose-cutover-actions.js'), 'utf8');
  const relaySrc = fs.readFileSync(path.join(root, 'js/sync-diagnose-relay-actions.js'), 'utf8');
  const identitySrc = fs.readFileSync(path.join(root, 'js/sync-diagnose-identity-actions.js'), 'utf8');
  const swSrc = readServiceWorkerSource(relative => fs.readFileSync(path.join(root, relative), 'utf8'));
  assert('sync diagnose action modules delegate browser globals through runtime adapter',
    cutoverSrc.includes("from './sync-diagnose-runtime.js'") &&
      relaySrc.includes("from './sync-diagnose-runtime.js'") &&
      identitySrc.includes("from './sync-diagnose-runtime.js'") &&
      !/\bwindow(?:\.|\s*\[)/.test(cutoverSrc) &&
      !/\bwindow(?:\.|\s*\[)/.test(relaySrc) &&
      !/\bwindow(?:\.|\s*\[)/.test(identitySrc) &&
      swSrc.includes("'/js/sync-diagnose-runtime.js'"));
} finally {
  configureSyncDiagnoseRuntimeDeps(originalSyncDiagnoseRuntimeDeps);
  restoreRuntime();
}

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
process.exit(legacyAssertions.fail > 0 ? 1 : 0);
