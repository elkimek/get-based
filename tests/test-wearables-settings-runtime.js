#!/usr/bin/env node
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

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Wearables Settings Runtime Tests ===\n');

const runtimeKeys = ['window'];
const savedDescriptors = new Map(runtimeKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));

function restoreRuntime() {
  for (const key of runtimeKeys) {
    const descriptor = savedDescriptors.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}

try {
  const calls = [];
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

  delete globalThis.window;
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

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
