#!/usr/bin/env node
import { captureRuntimeGlobals } from './helpers/runtime-globals.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// test-wearables-settings-runtime.js - Wearables settings runtime adapter behavior.

import './_node-shim.js';
import {
  closeWearableSettingsModal,
  configureWearableSettingsRuntimeDeps,
  confirmWearableSettingsAction,
  navigateWearablesDashboard,
} from '../js/wearables-settings-runtime.js';
import { configureSettingsModuleBridge } from '../js/settings-runtime-bridge.js';

const originalWearableSettingsRuntimeDeps = configureWearableSettingsRuntimeDeps();

const { assert, results: legacyAssertions } = createLegacyAssertions(" - ");

console.log('=== Wearables Settings Runtime Tests ===\n');

const runtimeKeys = ['window'];
const restoreRuntime = captureRuntimeGlobals(runtimeKeys);

try {
  const calls: string[][] = [];
  const previousSettingsBridge = configureSettingsModuleBridge({
    closeSettingsModal: () => calls.push(['close-settings']),
  });
  configureWearableSettingsRuntimeDeps({
    navigate: route => calls.push(['navigate', route]),
    showConfirmDialog: async message => {
      calls.push(['confirm', message]);
      return message === 'confirm me';
    },
  });

  navigateWearablesDashboard();
  closeWearableSettingsModal();
  const confirmed = await confirmWearableSettingsAction('confirm me');
  assert('navigateWearablesDashboard delegates to dashboard route',
    calls.some(call => call[0] === 'navigate' && call[1] === 'dashboard'));
  assert('closeWearableSettingsModal delegates to settings close hook',
    calls.some(call => call[0] === 'close-settings'));
  assert('confirmWearableSettingsAction delegates to runtime confirm dialog',
    confirmed && calls.some(call => call[0] === 'confirm' && call[1] === 'confirm me'));

  delete (globalThis as { window?: unknown }).window;
  configureSettingsModuleBridge({ closeSettingsModal: null });
  configureWearableSettingsRuntimeDeps({ navigate: null, showConfirmDialog: null });
  navigateWearablesDashboard();
  closeWearableSettingsModal();
  const missingConfirm = await confirmWearableSettingsAction('confirm me');
  assert('runtime adapter no-ops safely when window is missing',
    !missingConfirm);
  configureSettingsModuleBridge(previousSettingsBridge);
} finally {
  configureWearableSettingsRuntimeDeps(originalWearableSettingsRuntimeDeps);
  restoreRuntime();
}

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
process.exit(legacyAssertions.fail > 0 ? 1 : 0);
