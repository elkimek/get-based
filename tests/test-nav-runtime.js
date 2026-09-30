#!/usr/bin/env node
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// Runtime sidebar nav adapter behavior.

import './_node-shim.js';
import {
  configureNavRuntime,
  navigateFromNavRuntime,
  openContextFromNavRuntime,
  openCreateMarkerFromNavRuntime,
  openEMFAssessmentFromNavRuntime,
  openReportBuilderFromNavRuntime,
} from '../js/nav-runtime.js';
import { configureContextCardsRuntimeCallbacks } from '../js/context-cards-runtime.js';




const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

console.log('=== Nav Runtime Tests ===');

const calls = [];
const previousContextCardsRuntime = configureContextCardsRuntimeCallbacks({
  openContextModal: () => calls.push(['context', true]),
});
const restoreNavRuntime = configureNavRuntime({
  navigate: route => calls.push(['navigate', route, true]),
  openEMFAssessmentEditor: () => calls.push(['emf', true]),
  openCreateMarkerModal: () => calls.push(['marker', true]),
  openReportBuilder: () => calls.push(['report', true]),
});
try {
  navigateFromNavRuntime('labs');
  openEMFAssessmentFromNavRuntime();
  openReportBuilderFromNavRuntime();
  openContextFromNavRuntime();
  openCreateMarkerFromNavRuntime();

  assert('nav runtime delegates all browser callbacks',
    calls.length === 5
      && calls.some(call => call[0] === 'navigate' && call[1] === 'labs' && call[2] === true)
      && ['emf', 'report', 'context', 'marker'].every(name => calls.some(call => call[0] === name && call[1] === true)));

  configureContextCardsRuntimeCallbacks({ openContextModal: null });
  configureNavRuntime({
    navigate: () => {},
    openEMFAssessmentEditor: () => {},
    openCreateMarkerModal: () => {},
    openReportBuilder: () => {},
  });
  navigateFromNavRuntime('missing');
  openEMFAssessmentFromNavRuntime();
  openReportBuilderFromNavRuntime();
  openContextFromNavRuntime();
  openCreateMarkerFromNavRuntime();
  assert('nav runtime tolerates safe configured no-op callbacks', calls.length === 5);
} finally {
  configureNavRuntime(restoreNavRuntime);
  configureContextCardsRuntimeCallbacks(previousContextCardsRuntime);
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

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
