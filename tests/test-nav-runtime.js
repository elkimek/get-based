#!/usr/bin/env node
// Runtime sidebar nav adapter behavior.

import './_node-shim.js';
import {
  configureNavRuntime,
  exposeNavRuntimeGlobals,
  navigateFromNavRuntime,
  openContextFromNavRuntime,
  openCreateMarkerFromNavRuntime,
  openEMFAssessmentFromNavRuntime,
  openReportBuilderFromNavRuntime,
} from '../js/nav-runtime.js';
import { configureContextCardsRuntimeCallbacks } from '../js/context-cards-runtime.js';
import { configureViewRuntime } from '../js/views-runtime-bridge.js';

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
  'openContextModal',
  'openCreateMarkerModal',
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
  const previousContextCardsRuntime = configureContextCardsRuntimeCallbacks({
    openContextModal: () => calls.push(['context', true]),
  });
  const browserRuntime = {
    navigate(route) { calls.push(['navigate', route, this === browserRuntime]); },
    openContextModal() { calls.push(['legacy-context']); },
    openCreateMarkerModal() { calls.push(['marker', this === browserRuntime]); },
  };
  setRuntimeValue('window', browserRuntime);
  const restoreNavRuntime = configureNavRuntime({
    openEMFAssessmentEditor: () => calls.push(['emf', true]),
    openReportBuilder: () => calls.push(['report', true]),
  });

  navigateFromNavRuntime('labs');
  openEMFAssessmentFromNavRuntime();
  openReportBuilderFromNavRuntime();
  openContextFromNavRuntime();
  openCreateMarkerFromNavRuntime();

  assert('nav runtime delegates all browser callbacks',
    calls.length === 5
      && calls.some(call => call[0] === 'navigate' && call[1] === 'labs' && call[2] === true)
      && ['emf', 'report', 'context', 'marker'].every(name => calls.some(call => call[0] === name && call[1] === true)));

  exposeNavRuntimeGlobals({ runtimeProbe: 42 });
  assert('exposeNavRuntimeGlobals assigns exports to the browser runtime',
    browserRuntime.runtimeProbe === 42);

  for (const key of ['navigate', 'openContextModal', 'openCreateMarkerModal']) {
    delete browserRuntime[key];
  }
  const previousViewRuntime = configureViewRuntime({
    navigate: route => calls.push(['module-navigate', route]),
  });
  configureContextCardsRuntimeCallbacks({ openContextModal: null });
  configureNavRuntime({ openEMFAssessmentEditor: () => {}, openReportBuilder: () => {} });
  navigateFromNavRuntime('missing');
  openEMFAssessmentFromNavRuntime();
  openReportBuilderFromNavRuntime();
  openContextFromNavRuntime();
  openCreateMarkerFromNavRuntime();
  assert('nav runtime falls back to module navigation when the browser callback is missing',
    calls.length === 6 && calls.some(call => call[0] === 'module-navigate' && call[1] === 'missing'));

  delete globalThis.window;
  let globalRoute = '';
  setRuntimeValue('navigate', route => { globalRoute = route; });
  navigateFromNavRuntime('recommendations');
  exposeNavRuntimeGlobals({ runtimeProbe: 'global' });
  assert('nav runtime falls back to globalThis without window',
    globalRoute === 'recommendations' && globalThis.runtimeProbe === 'global');
  configureViewRuntime(previousViewRuntime);
  configureNavRuntime(restoreNavRuntime);
  configureContextCardsRuntimeCallbacks(previousContextCardsRuntime);
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
