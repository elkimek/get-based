#!/usr/bin/env node
// test-marker-detail-runtime.js - Marker detail runtime adapter behavior.

import './_node-shim.js';
import {
  askAIAboutMarkerRuntime,
  buildMarkerDetailSidebarRuntime,
  closeEMFInterpretationRuntime,
  configureMarkerDetailRuntime,
  getRelevantSNPsRuntime,
  hasRecommendationSectionRendererRuntime,
  isDashboardQuickMarkerPinnedRuntime,
  isProductRecsEnabledRuntime,
  navigateMarkerDetailRuntime,
  renameMarkerRuntime,
  renderRecommendationSectionRuntime,
  revertMarkerNameRuntime,
  showEmojiPickerRuntime,
  toggleDashboardQuickMarkerPinRuntime,
  uninstallWearableModalFocusTrapRuntime,
} from '../js/marker-detail-runtime.js';
import { configureDnaModuleBridge } from '../js/dna-runtime-bridge.js';
import { configureRecommendationModuleBridge } from '../js/recommendations-runtime.js';
import { configureViewRuntime } from '../js/views-runtime-bridge.js';
import { configureWearablesModuleBridge } from '../js/wearables-runtime.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Marker Detail Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  'navigate',
  'isDashboardQuickMarkerPinned',
  'toggleDashboardQuickMarkerPin',
  'renameMarker',
  'revertMarkerName',
  'showEmojiPicker',
];
const savedDescriptors = new Map(runtimeKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let previousViewRuntime = null;
let previousWearablesModule = null;
const previousDnaBridge = configureDnaModuleBridge({ getRelevantSNPs: null });

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
  const anchor = { textContent: '', dataset: {} };
  const snps = [{ rsid: 'rs1801133' }];

  setRuntimeValue('navigate', (category, data) => calls.push(['navigate', category, data?.from || '']));
  previousViewRuntime = configureViewRuntime({
    buildSidebar: () => calls.push(['sidebar']),
  });
  setRuntimeValue('isDashboardQuickMarkerPinned', id => id === 'lipids_apob');
  setRuntimeValue('toggleDashboardQuickMarkerPin', id => calls.push(['pin', id]));
  setRuntimeValue('renameMarker', id => calls.push(['rename', id]));
  setRuntimeValue('revertMarkerName', id => calls.push(['revert', id]));
  setRuntimeValue('showEmojiPicker', (el, callback, opts) => {
    calls.push(['emoji', opts?.showReset ? 'reset' : 'plain']);
    callback(':test:');
  });
  configureDnaModuleBridge({ getRelevantSNPs: dotKey => {
    calls.push(['snps', dotKey]);
    return snps;
  } });
  const previousRecommendationBridge = configureRecommendationModuleBridge({
    isProductRecsEnabled: () => true,
    renderRecommendationSection: async (markerKey, options) => {
      calls.push(['recs', markerKey, options?.markerStatus || '']);
      return '<section>recs</section>';
    },
  });
  const restoreMarkerDetailRuntime = configureMarkerDetailRuntime({
    askAIAboutMarker: id => calls.push(['ask', id]),
    closeEMFInterpretation: () => calls.push(['emf-close']),
  });
  previousWearablesModule = configureWearablesModuleBridge({
    _uninstallWearableModalFocusTrap: () => calls.push(['focus-trap']),
  });

  navigateMarkerDetailRuntime('dashboard', { from: 'marker' });
  buildMarkerDetailSidebarRuntime();
  toggleDashboardQuickMarkerPinRuntime('lipids_apob');
  renameMarkerRuntime('lipids_apob');
  revertMarkerNameRuntime('lipids_apob');
  askAIAboutMarkerRuntime('lipids_apob');
  showEmojiPickerRuntime(anchor, emoji => { anchor.textContent = emoji || ''; }, { showReset: true });
  closeEMFInterpretationRuntime();
  uninstallWearableModalFocusTrapRuntime();
  const renderedRecs = await renderRecommendationSectionRuntime('lipids.apob', { markerStatus: 'high' });

  assert('marker detail runtime delegates modal shell hooks',
    calls.some(call => call.join('|') === 'navigate|dashboard|marker') &&
      calls.some(call => call.join('|') === 'sidebar') &&
      calls.some(call => call.join('|') === 'pin|lipids_apob') &&
      calls.some(call => call.join('|') === 'rename|lipids_apob') &&
      calls.some(call => call.join('|') === 'revert|lipids_apob') &&
      calls.some(call => call.join('|') === 'ask|lipids_apob') &&
      calls.some(call => call.join('|') === 'emoji|reset') &&
      calls.some(call => call.join('|') === 'emf-close') &&
      calls.some(call => call.join('|') === 'focus-trap'));
  assert('marker detail runtime returns browser-derived values',
    isDashboardQuickMarkerPinnedRuntime('lipids_apob') === true &&
      getRelevantSNPsRuntime('lipids.apob') === snps &&
      hasRecommendationSectionRendererRuntime() === true &&
      isProductRecsEnabledRuntime() === true &&
      renderedRecs === '<section>recs</section>' &&
      anchor.textContent === ':test:');

  configureViewRuntime({ buildSidebar: () => { throw new Error('boom'); } });
  setRuntimeValue('isDashboardQuickMarkerPinned', () => { throw new Error('boom'); });
  configureDnaModuleBridge({ getRelevantSNPs: () => { throw new Error('boom'); } });
  configureRecommendationModuleBridge({ isProductRecsEnabled: () => { throw new Error('boom'); } });
  buildMarkerDetailSidebarRuntime();
  assert('marker detail runtime safe fallbacks catch optional hook errors',
    isDashboardQuickMarkerPinnedRuntime('lipids_apob') === false &&
      getRelevantSNPsRuntime('lipids.apob').length === 0 &&
      isProductRecsEnabledRuntime() === false);

  configureMarkerDetailRuntime({ askAIAboutMarker: null, closeEMFInterpretation: () => {} });

  delete globalThis.window;
  configureRecommendationModuleBridge({
    isProductRecsEnabled: null,
    renderRecommendationSection: null,
  });
  configureViewRuntime({ buildSidebar: null });
  configureWearablesModuleBridge({ _uninstallWearableModalFocusTrap: null });
  configureDnaModuleBridge({ getRelevantSNPs: null });
  const beforeMissingRuntimeCalls = calls.length;
  navigateMarkerDetailRuntime('dashboard');
  buildMarkerDetailSidebarRuntime();
  toggleDashboardQuickMarkerPinRuntime('lipids_apob');
  renameMarkerRuntime('lipids_apob');
  revertMarkerNameRuntime('lipids_apob');
  askAIAboutMarkerRuntime('lipids_apob');
  showEmojiPickerRuntime(anchor, () => {});
  closeEMFInterpretationRuntime();
  uninstallWearableModalFocusTrapRuntime();
  const missingRuntimeRecs = await renderRecommendationSectionRuntime('lipids.apob', {});
  assert('marker detail runtime no-ops safely when window is missing',
    calls.length === beforeMissingRuntimeCalls &&
      isDashboardQuickMarkerPinnedRuntime('lipids_apob') === false &&
      hasRecommendationSectionRendererRuntime() === false &&
      getRelevantSNPsRuntime('lipids.apob').length === 0 &&
      isProductRecsEnabledRuntime() === false &&
      missingRuntimeRecs === '');
  configureMarkerDetailRuntime(restoreMarkerDetailRuntime);
  configureRecommendationModuleBridge(previousRecommendationBridge);
} finally {
  configureDnaModuleBridge({ getRelevantSNPs: null, ...previousDnaBridge });
  configureWearablesModuleBridge({
    _uninstallWearableModalFocusTrap: null,
    ...previousWearablesModule,
  });
  configureRecommendationModuleBridge({
    isProductRecsEnabled: null,
    renderRecommendationSection: null,
  });
  configureViewRuntime({ buildSidebar: null, ...previousViewRuntime });
  restoreRuntime();
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
