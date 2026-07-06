#!/usr/bin/env node
// test-dashboard-widget-runtime.js - Dashboard widget runtime adapter behavior.

import './_node-shim.js';
import {
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

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Dashboard Widget Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  'innerHeight',
  'getSessions',
  'getDeviceSessions',
  '_snpTableCache',
  'openSettingsModal',
  'syncWearableNow',
  'openWearableDetail',
  'openManualLogForm',
  'showDetailModal',
  'navigate',
  'triggerDNAFilePicker',
  'openNoteEditor',
  'deleteNote',
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
  setRuntimeValue('innerHeight', 720);
  assert('getDashboardViewportHeight reads runtime innerHeight',
    getDashboardViewportHeight() === 720);

  setRuntimeValue('innerHeight', 0);
  assert('getDashboardViewportHeight preserves zero-height runtime fallback',
    getDashboardViewportHeight() === 0);

  const snpTable = { rs123: { rsid: 'rs123' } };
  setRuntimeValue('getSessions', () => [{ id: 'sun-1' }]);
  setRuntimeValue('getDeviceSessions', () => [{ id: 'device-1' }]);
  setRuntimeValue('_snpTableCache', snpTable);
  assert('runtime adapter reads dashboard renderer data hooks',
    getDashboardLightSessions().length === 1 &&
      getDashboardLightSessions()[0].id === 'sun-1' &&
      getDashboardDeviceSessions().length === 1 &&
      getDashboardDeviceSessions()[0].id === 'device-1' &&
      getDashboardSnpTableCache() === snpTable);

  setRuntimeValue('getSessions', () => { throw new Error('boom'); });
  setRuntimeValue('getDeviceSessions', () => ({ id: 'not-array' }));
  setRuntimeValue('_snpTableCache', null);
  assert('runtime adapter falls back for missing renderer data hooks',
    getDashboardLightSessions().length === 0 &&
      getDashboardDeviceSessions().length === 0 &&
      getDashboardSnpTableCache() === null);

  const actionEl = { dataset: { dashboardWidgetAction: 'sync-biometric-now' } };
  const event = { type: 'click' };
  setRuntimeValue('openSettingsModal', section => calls.push(['settings', section]));
  setRuntimeValue('syncWearableNow', el => calls.push(['sync', el?.dataset?.dashboardWidgetAction || '']));
  setRuntimeValue('openWearableDetail', id => calls.push(['wearable-detail', id]));
  setRuntimeValue('openManualLogForm', (id, ev) => calls.push(['manual-log', id, ev.type]));
  setRuntimeValue('showDetailModal', id => calls.push(['marker-detail', id]));
  setRuntimeValue('navigate', route => calls.push(['navigate', route]));
  setRuntimeValue('triggerDNAFilePicker', () => calls.push(['dna']));
  setRuntimeValue('openNoteEditor', (...args) => calls.push(['note-editor', ...args.map(arg => arg ?? 'null')]));
  setRuntimeValue('deleteNote', index => calls.push(['delete-note', index]));

  openDashboardWearablesSettings();
  syncDashboardWearableNow(actionEl);
  const openedDetail = openDashboardWearableDetail('sleep');
  openDashboardManualLogForm('weight', event);
  openDashboardMarkerDetail('lipids_apob');
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
      calls.some(call => call.join('|') === 'navigate|labs') &&
      calls.some(call => call.join('|') === 'dna') &&
      calls.some(call => call.join('|') === 'note-editor') &&
      calls.some(call => call.join('|') === 'note-editor|null|2') &&
      calls.some(call => call.join('|') === 'delete-note|1'));

  delete globalThis.openWearableDetail;
  assert('openDashboardWearableDetail reports missing callback',
    openDashboardWearableDetail('sleep') === false);

  delete globalThis.window;
  const callCountBeforeMissingRuntime = calls.length;
  openDashboardWearablesSettings();
  syncDashboardWearableNow(actionEl);
  openDashboardManualLogForm('weight', event);
  openDashboardMarkerDetail('lipids_apob');
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
      calls.length === callCountBeforeMissingRuntime);
} finally {
  restoreRuntime();
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
