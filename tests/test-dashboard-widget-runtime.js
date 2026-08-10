#!/usr/bin/env node
// test-dashboard-widget-runtime.js - Dashboard widget runtime adapter behavior.

import './_node-shim.js';
import { state } from '../js/state.js';
import {
  askDashboardAIAboutSnp,
  configureDashboardNoteActions,
  configureDashboardWidgetRuntimeDeps,
  deleteDashboardNote,
  getDashboardDeviceSessions,
  getDashboardLightSessions,
  getDashboardSnpTableCache,
  getDashboardViewportHeight,
  navigateDashboardRoute,
  openDashboardManualLogForm,
  openDashboardMarkerDetail,
  openDashboardNoteEditor,
  openDashboardWearableDetail,
  openDashboardWearablesSettings,
  syncDashboardWearableNow,
  triggerDashboardDnaPicker,
} from '../js/dashboard-widget-runtime.js';
import { configureContextCardsRuntimeCallbacks } from '../js/context-cards-runtime.js';
import { configureSettingsModuleBridge } from '../js/settings-runtime-bridge.js';
import { configureWearablesModuleBridge } from '../js/wearables-runtime.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Dashboard Widget Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  'innerHeight',
  '_snpTableCache',
  'triggerDNAFilePicker',
];
const savedDescriptors = new Map(runtimeKeys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const savedImportedData = state.importedData;
let previousWearablesModule = null;
let previousSettingsModule = null;
const originalDashboardWidgetRuntimeDeps = configureDashboardWidgetRuntimeDeps();

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
    triggerDNAFilePicker: () => calls.push(['dna']),
  });
  const previousDashboardNoteActions = configureDashboardNoteActions({
    openNoteEditor: (...args) => calls.push(['note-editor', ...args.map(arg => arg ?? 'null')]),
    deleteNote: index => calls.push(['delete-note', index]),
  });
  setRuntimeValue('innerHeight', 720);
  assert('getDashboardViewportHeight reads runtime innerHeight',
    getDashboardViewportHeight() === 720);

  setRuntimeValue('innerHeight', 0);
  assert('getDashboardViewportHeight preserves zero-height runtime fallback',
    getDashboardViewportHeight() === 0);

  const snpTable = {
    rs4680: {
      gene: 'COMT', variant: 'Val158Met',
      evidence: { level: 'strong', scope: 'Replicated enzyme-activity effect.' },
      relevance: { level: 'trait', context: 'Biochemical context only.' },
      genotypes: { AA: { effect: 'none', valence: 'informational', note: 'Lower COMT activity association.' } },
    },
  };
  state.importedData = {
    sunSessions: [{ id: 'sun-1' }],
    deviceSessions: [{ id: 'device-1' }],
    genetics: { snps: { rs4680: { genotype: 'AA', gene: 'COMT', variant: 'Val158Met' } } },
  };
  setRuntimeValue('_snpTableCache', snpTable);
  assert('runtime adapter reads dashboard renderer data hooks',
    getDashboardLightSessions().length === 1 &&
      getDashboardLightSessions()[0].id === 'sun-1' &&
      getDashboardDeviceSessions().length === 1 &&
      getDashboardDeviceSessions()[0].id === 'device-1' &&
      getDashboardSnpTableCache() === snpTable);

  state.importedData = { sunSessions: [], deviceSessions: [] };
  setRuntimeValue('_snpTableCache', null);
  assert('runtime adapter falls back for missing renderer data hooks',
    getDashboardLightSessions().length === 0 &&
      getDashboardDeviceSessions().length === 0 &&
      getDashboardSnpTableCache() === null);

  const actionEl = { dataset: { dashboardWidgetAction: 'sync-biometric-now' } };
  const event = { type: 'click' };
  previousSettingsModule = configureSettingsModuleBridge({
    openSettingsModal: section => calls.push(['settings', section]),
  });
  previousWearablesModule = configureWearablesModuleBridge({
    syncWearableNow: el => calls.push(['sync', el?.dataset?.dashboardWidgetAction || '']),
    openWearableDetail: id => calls.push(['wearable-detail', id]),
    openManualLogForm: (id, ev) => calls.push(['manual-log', id, ev.type]),
  });
  configureDashboardWidgetRuntimeDeps({
    navigate: route => calls.push(['navigate', route]),
    openChatPanel: prompt => calls.push(['chat', prompt]),
    showDetailModal: id => calls.push(['marker-detail', id]),
  });
  state.importedData.genetics = {
    snps: { rs4680: { genotype: 'AA', gene: 'COMT', variant: 'Val158Met' } },
  };
  setRuntimeValue('_snpTableCache', snpTable);
  setRuntimeValue('triggerDNAFilePicker', () => calls.push(['legacy-dna']));

  openDashboardWearablesSettings();
  syncDashboardWearableNow(actionEl);
  const openedDetail = openDashboardWearableDetail('sleep');
  openDashboardManualLogForm('weight', event);
  openDashboardMarkerDetail('lipids_apob');
  const openedSnpChat = askDashboardAIAboutSnp('rs4680');
  navigateDashboardRoute('labs');
  triggerDashboardDnaPicker();
  openDashboardNoteEditor();
  openDashboardNoteEditor(2);
  deleteDashboardNote(1);
  assert('runtime adapter delegates dashboard widget shell callbacks',
    openedDetail &&
      calls.some(call => call.join('|') === 'settings|wearables') &&
      calls.some(call => call.join('|') === 'sync|sync-biometric-now') &&
      calls.some(call => call.join('|') === 'wearable-detail|sleep') &&
      calls.some(call => call.join('|') === 'manual-log|weight|click') &&
      calls.some(call => call.join('|') === 'marker-detail|lipids_apob') &&
      openedSnpChat &&
      calls.some(call => call[0] === 'chat'
        && call[1].includes('COMT Val158Met (rs4680)')
        && call[1].includes('broader relevant knowledge beyond this catalog')) &&
      calls.some(call => call.join('|') === 'navigate|labs') &&
      calls.some(call => call.join('|') === 'dna') &&
      calls.some(call => call.join('|') === 'note-editor') &&
      calls.some(call => call.join('|') === 'note-editor|null|2') &&
      calls.some(call => call.join('|') === 'delete-note|1'));

  configureWearablesModuleBridge({ openWearableDetail: null });
  assert('openDashboardWearableDetail reports missing callback',
    openDashboardWearableDetail('sleep') === false);

  configureContextCardsRuntimeCallbacks({ triggerDNAFilePicker: null });
  configureDashboardNoteActions({ openNoteEditor: null, deleteNote: null });
  configureWearablesModuleBridge({
    syncWearableNow: null,
    openManualLogForm: null,
  });
  configureSettingsModuleBridge({ openSettingsModal: null });
  configureDashboardWidgetRuntimeDeps({ navigate: null, openChatPanel: null, showDetailModal: null });
  delete globalThis.window;
  const callCountBeforeMissingRuntime = calls.length;
  openDashboardWearablesSettings();
  syncDashboardWearableNow(actionEl);
  openDashboardManualLogForm('weight', event);
  openDashboardMarkerDetail('lipids_apob');
  const missingSnpChat = askDashboardAIAboutSnp('rs4680');
  navigateDashboardRoute('dashboard');
  triggerDashboardDnaPicker();
  openDashboardNoteEditor(3);
  deleteDashboardNote(2);
  assert('runtime adapter no-ops safely when window is missing',
    getDashboardViewportHeight() === null &&
      getDashboardLightSessions().length === 0 &&
      getDashboardDeviceSessions().length === 0 &&
      getDashboardSnpTableCache() === null &&
      openDashboardWearableDetail('sleep') === false &&
      missingSnpChat === false &&
      calls.length === callCountBeforeMissingRuntime);
  configureDashboardNoteActions(previousDashboardNoteActions);
  configureContextCardsRuntimeCallbacks(previousContextCardsRuntime);
} finally {
  configureDashboardWidgetRuntimeDeps(originalDashboardWidgetRuntimeDeps);
  configureSettingsModuleBridge({
    openSettingsModal: null,
    ...previousSettingsModule,
  });
  configureWearablesModuleBridge({
    syncWearableNow: null,
    openWearableDetail: null,
    openManualLogForm: null,
    ...previousWearablesModule,
  });
  state.importedData = savedImportedData;
  restoreRuntime();
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
