#!/usr/bin/env node
// test-wearables-settings-runtime.js - Wearables settings runtime adapter behavior.

import './_node-shim.js';
import {
  closeWearableSettingsModal,
  confirmWearableSettingsAction,
  exposeWearableSettingsBindings,
  navigateWearablesDashboard,
} from '../js/wearables-settings-runtime.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Wearables Settings Runtime Tests ===\n');

const runtimeKeys = ['window', 'navigate', 'closeSettingsModal', 'showConfirmDialog', 'wearableProbe'];
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
  setRuntimeValue('navigate', route => calls.push(['navigate', route]));
  setRuntimeValue('closeSettingsModal', () => calls.push(['close-settings']));
  setRuntimeValue('showConfirmDialog', async message => {
    calls.push(['confirm', message]);
    return message === 'confirm me';
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

  const probe = () => 'ok';
  exposeWearableSettingsBindings({ wearableProbe: probe });
  assert('exposeWearableSettingsBindings assigns bindings to runtime window',
    globalThis.wearableProbe === probe);

  delete globalThis.window;
  navigateWearablesDashboard();
  closeWearableSettingsModal();
  const missingConfirm = await confirmWearableSettingsAction('confirm me');
  exposeWearableSettingsBindings({ wearableProbe: null });
  assert('runtime adapter no-ops safely when window is missing',
    !missingConfirm && globalThis.wearableProbe === probe);
} finally {
  restoreRuntime();
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
