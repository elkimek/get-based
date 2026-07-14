#!/usr/bin/env node
// Runtime sidebar nav adapter behavior.

import './_node-shim.js';
import {
  configureNavRuntime,
  exposeNavRuntimeGlobals,
  navigateFromNavRuntime,
  openClientListFromNavRuntime,
  openContextFromNavRuntime,
  openCreateMarkerFromNavRuntime,
  openEMFAssessmentFromNavRuntime,
  openReportBuilderFromNavRuntime,
} from '../js/nav-runtime.js';

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

console.log('=== Nav Runtime Tests ===');

const runtimeKeys = [
  'window',
  'navigate',
  'openReportBuilder',
  'openContextModal',
  'openCreateMarkerModal',
  'openClientList',
  'runtimeProbe',
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

try {
  const calls = [];
  const browserRuntime = {
    navigate(route) { calls.push(['navigate', route, this === browserRuntime]); },
    openReportBuilder() { calls.push(['report', this === browserRuntime]); },
    openContextModal() { calls.push(['context', this === browserRuntime]); },
    openCreateMarkerModal() { calls.push(['marker', this === browserRuntime]); },
    openClientList() { calls.push(['client', this === browserRuntime]); },
  };
  setRuntimeValue('window', browserRuntime);
  const restoreNavRuntime = configureNavRuntime({
    openEMFAssessmentEditor: () => calls.push(['emf', true]),
  });

  navigateFromNavRuntime('labs');
  openEMFAssessmentFromNavRuntime();
  openReportBuilderFromNavRuntime();
  openContextFromNavRuntime();
  openCreateMarkerFromNavRuntime();
  openClientListFromNavRuntime();

  assert('nav runtime delegates all browser callbacks',
    calls.length === 6
      && calls.some(call => call[0] === 'navigate' && call[1] === 'labs' && call[2] === true)
      && ['emf', 'report', 'context', 'marker', 'client'].every(name => calls.some(call => call[0] === name && call[1] === true)));

  exposeNavRuntimeGlobals({ runtimeProbe: 42 });
  assert('exposeNavRuntimeGlobals assigns exports to the browser runtime',
    browserRuntime.runtimeProbe === 42);

  for (const key of ['navigate', 'openReportBuilder', 'openContextModal', 'openCreateMarkerModal', 'openClientList']) {
    delete browserRuntime[key];
  }
  configureNavRuntime({ openEMFAssessmentEditor: () => {} });
  navigateFromNavRuntime('missing');
  openEMFAssessmentFromNavRuntime();
  openReportBuilderFromNavRuntime();
  openContextFromNavRuntime();
  openCreateMarkerFromNavRuntime();
  openClientListFromNavRuntime();
  assert('nav runtime hooks no-op when browser callbacks are missing', calls.length === 6);

  delete globalThis.window;
  let globalRoute = '';
  setRuntimeValue('navigate', route => { globalRoute = route; });
  navigateFromNavRuntime('recommendations');
  exposeNavRuntimeGlobals({ runtimeProbe: 'global' });
  assert('nav runtime falls back to globalThis without window',
    globalRoute === 'recommendations' && globalThis.runtimeProbe === 'global');
  configureNavRuntime(restoreNavRuntime);
} finally {
  restoreRuntime();
}

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
try {
  delete globalThis.window;
  await import('../js/nav-runtime.js?no-window-probe');
  assert('nav runtime imports without a browser window', true);
} catch (error) {
  assert('nav runtime imports without a browser window', false, error?.message || String(error));
} finally {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
