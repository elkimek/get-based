#!/usr/bin/env node
// test-dna-runtime.js — DNA runtime adapter behavior.

import {
  cacheDnaSnpTable,
  callDnaFileHandler,
  clearPendingDnaImport,
  confirmDnaDeleteDialog,
  getDnaRuntimeState,
  getPendingDnaImport,
  isDnaLabImportRunning,
  logDnaDebugError,
  logDnaDebugWarn,
  navigateDnaRoute,
  publishDnaWindowBindings,
  refreshDnaShell,
  refreshDnaSidebar,
  saveDnaRuntimeAndRefresh,
  setPendingDnaImport,
  triggerDnaFilePicker,
  updateDnaChatNudge,
} from '../js/dna-runtime.js';

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

console.log('=== DNA Runtime Adapters ===');

const runtimeKeys = [
  '_buildGeneticsContext',
  '_getRelevantSNPs',
  '_getState',
  '_pendingDNAImport',
  '_saveAndRefresh',
  '_snpTableCache',
  'buildSidebar',
  'handleDNAFile',
  'isDebugMode',
  'isImportRunning',
  'navigate',
  'showConfirmDialog',
  'triggerDNAFilePicker',
  'updateChatNudge',
];
const originals = Object.fromEntries(runtimeKeys.map(key => [key, globalThis[key]]));
const originalError = console.error;
const originalWarn = console.warn;

try {
  for (const key of runtimeKeys) delete globalThis[key];

  const calls = [];
  globalThis.navigate = route => calls.push(['navigate', route]);
  globalThis.buildSidebar = () => calls.push(['sidebar']);
  refreshDnaShell('dashboard');
  assert('refreshDnaShell refreshes sidebar then navigates',
    JSON.stringify(calls.slice(0, 2)) === JSON.stringify([['sidebar'], ['navigate', 'dashboard']]));

  calls.length = 0;
  navigateDnaRoute('genome');
  assert('navigateDnaRoute delegates route changes',
    calls.length === 1 && calls[0][0] === 'navigate' && calls[0][1] === 'genome');

  globalThis.buildSidebar = () => {
    throw new Error('sidebar failed');
  };
  let sidebarThrew = false;
  try { refreshDnaSidebar(); } catch (_) { sidebarThrew = true; }
  assert('refreshDnaSidebar swallows sidebar refresh errors', !sidebarThrew);

  globalThis.isImportRunning = () => true;
  assert('isDnaLabImportRunning delegates true state', isDnaLabImportRunning() === true);
  globalThis.isImportRunning = () => {
    throw new Error('import status failed');
  };
  assert('isDnaLabImportRunning reports false on runtime errors', isDnaLabImportRunning() === false);

  globalThis.handleDNAFile = file => calls.push(['handleDNAFile', file.name]);
  callDnaFileHandler({ name: 'dna.txt' });
  assert('callDnaFileHandler delegates file handling',
    calls.some(call => call[0] === 'handleDNAFile' && call[1] === 'dna.txt'));

  globalThis.triggerDNAFilePicker = () => calls.push(['triggerDNAFilePicker']);
  triggerDnaFilePicker();
  assert('triggerDnaFilePicker delegates picker opening',
    calls.some(call => call[0] === 'triggerDNAFilePicker'));

  globalThis.updateChatNudge = () => calls.push(['updateChatNudge']);
  updateDnaChatNudge();
  assert('updateDnaChatNudge delegates chat nudge refresh',
    calls.some(call => call[0] === 'updateChatNudge'));

  globalThis.showConfirmDialog = async message => {
    calls.push(['confirm', message]);
    return true;
  };
  assert('confirmDnaDeleteDialog delegates confirmation',
    await confirmDnaDeleteDialog() === true &&
      calls.some(call => call[0] === 'confirm' && call[1].includes('Delete genetic data')));
  globalThis.showConfirmDialog = async () => {
    throw new Error('dialog failed');
  };
  assert('confirmDnaDeleteDialog reports false on dialog errors',
    await confirmDnaDeleteDialog() === false);

  const state = { importedData: { genetics: {} } };
  globalThis._getState = () => state;
  assert('getDnaRuntimeState delegates state lookup',
    getDnaRuntimeState() === state);
  globalThis._saveAndRefresh = async () => calls.push(['saveAndRefresh']);
  await saveDnaRuntimeAndRefresh();
  assert('saveDnaRuntimeAndRefresh delegates persistence',
    calls.some(call => call[0] === 'saveAndRefresh'));

  const table = { rs1801133: { gene: 'MTHFR' } };
  cacheDnaSnpTable(table);
  assert('cacheDnaSnpTable publishes SNP table cache',
    globalThis._snpTableCache === table);

  setPendingDnaImport({ source: 'AncestryDNA' });
  assert('pending DNA import is published for browser flows',
    getPendingDnaImport()?.source === 'AncestryDNA' &&
      globalThis._pendingDNAImport?.source === 'AncestryDNA');
  clearPendingDnaImport();
  assert('clearPendingDnaImport clears published pending import',
    getPendingDnaImport() === null && globalThis._pendingDNAImport === null);

  let errorLogged = false;
  let warnLogged = false;
  console.error = () => { errorLogged = true; };
  console.warn = () => { warnLogged = true; };
  globalThis.isDebugMode = () => false;
  logDnaDebugError('hidden');
  logDnaDebugWarn('hidden');
  assert('debug logs are gated off when debug mode is false',
    !errorLogged && !warnLogged);
  globalThis.isDebugMode = () => true;
  logDnaDebugError('shown');
  logDnaDebugWarn('shown');
  assert('debug logs are emitted when debug mode is true',
    errorLogged && warnLogged);

  publishDnaWindowBindings({
    state,
    saveImportedData: async () => true,
    buildGeneticsContext: () => '',
    getRelevantSNPs: () => [],
    handleDNAFile: () => {},
  });
  assert('publishDnaWindowBindings installs legacy exports',
    typeof globalThis.handleDNAFile === 'function' &&
      globalThis._getState() === state &&
      typeof globalThis._saveAndRefresh === 'function');
} finally {
  console.error = originalError;
  console.warn = originalWarn;
  for (const key of runtimeKeys) {
    if (originals[key] === undefined) delete globalThis[key];
    else globalThis[key] = originals[key];
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
