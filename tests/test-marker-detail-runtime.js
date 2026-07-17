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
import { configureWearablesModuleBridge } from '../js/wearables-runtime.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Marker Detail Runtime Tests ===\n');

const runtimeKeys = ['window'];
const savedDescriptors = new Map(runtimeKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
let previousWearablesModule = null;
const previousDnaBridge = configureDnaModuleBridge({ getRelevantSNPs: null });
const originalMarkerDetailRuntimeDeps = configureMarkerDetailRuntime();

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

  configureMarkerDetailRuntime({
    askAIAboutMarker: id => calls.push(['ask', id]),
    buildSidebar: () => calls.push(['sidebar']),
    closeEMFInterpretation: () => calls.push(['emf-close']),
    isDashboardQuickMarkerPinned: id => id === 'lipids_apob',
    navigate: (category, data) => calls.push(['navigate', category, data?.from || '']),
    renameMarker: id => calls.push(['rename', id]),
    revertMarkerName: id => calls.push(['revert', id]),
    showEmojiPicker: (el, callback, opts) => {
      calls.push(['emoji', opts?.showReset ? 'reset' : 'plain']);
      callback(':test:');
    },
    toggleDashboardQuickMarkerPin: id => calls.push(['pin', id]),
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
  assert('marker detail runtime returns injected values',
    isDashboardQuickMarkerPinnedRuntime('lipids_apob') === true &&
      getRelevantSNPsRuntime('lipids.apob') === snps &&
      hasRecommendationSectionRendererRuntime() === true &&
      isProductRecsEnabledRuntime() === true &&
      renderedRecs === '<section>recs</section>' &&
      anchor.textContent === ':test:');

  configureMarkerDetailRuntime({
    buildSidebar: () => { throw new Error('boom'); },
    isDashboardQuickMarkerPinned: () => { throw new Error('boom'); },
  });
  configureDnaModuleBridge({ getRelevantSNPs: () => { throw new Error('boom'); } });
  configureRecommendationModuleBridge({ isProductRecsEnabled: () => { throw new Error('boom'); } });
  buildMarkerDetailSidebarRuntime();
  assert('marker detail runtime safe fallbacks catch optional hook errors',
    isDashboardQuickMarkerPinnedRuntime('lipids_apob') === false &&
      getRelevantSNPsRuntime('lipids.apob').length === 0 &&
      isProductRecsEnabledRuntime() === false);

  configureMarkerDetailRuntime({
    askAIAboutMarker: null,
    buildSidebar: null,
    closeEMFInterpretation: () => {},
    isDashboardQuickMarkerPinned: null,
    navigate: null,
    renameMarker: null,
    revertMarkerName: null,
    showEmojiPicker: null,
    toggleDashboardQuickMarkerPin: null,
  });

  delete globalThis.window;
  configureRecommendationModuleBridge({
    isProductRecsEnabled: null,
    renderRecommendationSection: null,
  });
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
  configureRecommendationModuleBridge(previousRecommendationBridge);
} finally {
  configureMarkerDetailRuntime(originalMarkerDetailRuntimeDeps);
  configureDnaModuleBridge({ getRelevantSNPs: null, ...previousDnaBridge });
  configureWearablesModuleBridge({
    _uninstallWearableModalFocusTrap: null,
    ...previousWearablesModule,
  });
  configureRecommendationModuleBridge({
    isProductRecsEnabled: null,
    renderRecommendationSection: null,
  });
  restoreRuntime();
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
