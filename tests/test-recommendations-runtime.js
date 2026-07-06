#!/usr/bin/env node
// Recommendations runtime adapter behavior.

import './_node-shim.js';
import {
  closeRecommendationsModal,
  getRecommendationsSnpTable,
  openRecommendationsEmfAssessment,
  openRecommendationsLocationEditor,
  openRecommendationsPrivacySettings,
  registerRecommendationsRuntimeExports,
  scheduleRecommendationsTask,
} from '../js/recommendations-runtime.js';

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

console.log('=== Recommendations Runtime Tests ===');

const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

function setRuntime(value) {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    writable: true,
    enumerable: true,
    value,
  });
}

function restoreWindow() {
  if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow);
  else delete globalThis.window;
}

try {
  const snpTable = { rs123: { snpHints: {} } };
  const calls = [];
  const runtime = {
    _snpTableCache: snpTable,
    closeModal() { calls.push(['close', this === runtime]); },
    openEMFAssessmentEditor() { calls.push(['emf', this === runtime]); },
    openProfileLocationEditor() { calls.push(['location', this === runtime]); },
    openSettingsTab(tab) { calls.push(['settings', tab, this === runtime]); },
    setTimeout(callback, delay) {
      calls.push(['timeout', delay, this === runtime]);
      callback();
      return 17;
    },
  };
  setRuntime(runtime);

  const timerId = scheduleRecommendationsTask(() => calls.push(['task']), 125);
  const registered = registerRecommendationsRuntimeExports({ recommendationProbe: () => 'ok' });

  assert('recommendations runtime reads SNP table cache',
    getRecommendationsSnpTable() === snpTable);
  assert('recommendations runtime delegates host modal and editor hooks',
    closeRecommendationsModal() &&
      openRecommendationsEmfAssessment() &&
      openRecommendationsLocationEditor() &&
      openRecommendationsPrivacySettings() &&
      calls.some(call => call[0] === 'close' && call[1] === true) &&
      calls.some(call => call[0] === 'emf' && call[1] === true) &&
      calls.some(call => call[0] === 'location' && call[1] === true) &&
      calls.some(call => call[0] === 'settings' && call[1] === 'privacy' && call[2] === true));
  assert('recommendations runtime delegates timers with browser binding',
    timerId === 17 &&
      calls.some(call => call[0] === 'timeout' && call[1] === 125 && call[2] === true) &&
      calls.some(call => call[0] === 'task'));
  assert('recommendations runtime registers window exports',
    registered && runtime.recommendationProbe?.() === 'ok');

  delete runtime.closeModal;
  delete runtime.openEMFAssessmentEditor;
  delete runtime.openProfileLocationEditor;
  delete runtime.openSettingsTab;
  delete runtime._snpTableCache;
  assert('recommendations runtime handles missing optional browser hooks',
    getRecommendationsSnpTable() === null &&
      closeRecommendationsModal() === false &&
      openRecommendationsEmfAssessment() === false &&
      openRecommendationsLocationEditor() === false &&
      openRecommendationsPrivacySettings() === false);

  delete globalThis.window;
  assert('recommendations runtime no-ops without browser window',
    getRecommendationsSnpTable() === null &&
      registerRecommendationsRuntimeExports({ missingWindowProbe: true }) === false);
} finally {
  restoreWindow();
}

try {
  delete globalThis.window;
  await import('../js/recommendations-runtime.js?no-window-probe');
  assert('recommendations runtime imports without a browser window', true);
} catch (error) {
  assert('recommendations runtime imports without a browser window', false, error?.message || String(error));
} finally {
  restoreWindow();
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
