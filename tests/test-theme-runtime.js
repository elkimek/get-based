#!/usr/bin/env node
// test-theme-runtime.js - Theme browser-runtime adapter coverage.

import './_node-shim.js';

import {
  dispatchThemeChange,
  refreshThemeDependentsFromRuntime,
  registerThemeRuntimeExports,
} from '../js/theme-runtime.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

const RUNTIME_FIELDS = [
  'CustomEvent',
  'dispatchEvent',
  'applyAccentOverride',
  'updateSettingsUI',
  'updateTweaksUI',
  'scheduleChartThemeRefresh',
  'refreshChartThemeColors',
  'refreshSettingsWearables',
  '__themeRuntimeProbe',
];

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalFieldDescriptors = new Map(
  RUNTIME_FIELDS.map(field => [field, Object.getOwnPropertyDescriptor(globalThis, field)])
);

function restoreDescriptor(target, key, descriptor) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }
  delete target[key];
}

function resetRuntimeWindow() {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: globalThis,
  });
  for (const field of RUNTIME_FIELDS) delete globalThis[field];
}

console.log('=== Theme Runtime Tests ===\n');

try {
  resetRuntimeWindow();

  const events = [];
  globalThis.CustomEvent = class {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.dispatchEvent = event => {
    events.push(event);
    return true;
  };

  dispatchThemeChange({ theme: 'glass', sunsetMode: true });
  assert('theme change dispatches browser event', events.length === 1);
  assert('theme change event has expected type', events[0]?.type === 'labcharts-themechange');
  assert('theme change event carries detail', events[0]?.detail?.theme === 'glass' && events[0]?.detail?.sunsetMode === true);

  const calls = [];
  globalThis.applyAccentOverride = () => calls.push('accent');
  globalThis.updateSettingsUI = () => calls.push('settings');
  globalThis.updateTweaksUI = () => calls.push('tweaks');
  globalThis.scheduleChartThemeRefresh = () => calls.push('schedule');
  globalThis.refreshSettingsWearables = () => calls.push('wearables');
  refreshThemeDependentsFromRuntime({ settingsModalOpen: true });
  assert('theme dependents refresh accent/settings/tweaks', calls.includes('accent') && calls.includes('settings') && calls.includes('tweaks'));
  assert('theme dependents prefer scheduled chart refresh', calls.includes('schedule'));
  assert('theme dependents refresh wearables when settings modal is open', calls.includes('wearables'));

  delete globalThis.scheduleChartThemeRefresh;
  let chartRefreshOptions = null;
  globalThis.refreshChartThemeColors = options => { chartRefreshOptions = options; };
  refreshThemeDependentsFromRuntime({ settingsModalOpen: false });
  assert('theme dependents fall back to chart color refresh', chartRefreshOptions?.batchSize === 4);

  const probe = () => 'ok';
  registerThemeRuntimeExports({ __themeRuntimeProbe: probe });
  assert('theme runtime exports assign to window', globalThis.__themeRuntimeProbe === probe);

  delete globalThis.window;
  assert('no-window dispatch is safe', (() => {
    dispatchThemeChange({ theme: 'dark' });
    return true;
  })());
  assert('no-window dependent refresh is safe', (() => {
    refreshThemeDependentsFromRuntime({ settingsModalOpen: true });
    return true;
  })());
  registerThemeRuntimeExports({ __themeRuntimeProbe: 'no-window' });
  assert('no-window exports are no-ops', globalThis.__themeRuntimeProbe === probe);
} finally {
  for (const field of RUNTIME_FIELDS) {
    restoreDescriptor(globalThis, field, originalFieldDescriptors.get(field));
  }
  restoreDescriptor(globalThis, 'window', originalWindowDescriptor);
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
if (fail) process.exit(1);
