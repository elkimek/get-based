#!/usr/bin/env node
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// test-dna-runtime.js — DNA runtime adapter behavior.

import './_node-shim.js';
import type { PendingDnaImport } from '../js/dna-runtime.js';
import type { PendingMtDnaImport } from '../js/dna-mtdna.js';
type RuntimeTestGlobals = typeof globalThis & {
  _pendingDNAImport?: Partial<PendingDnaImport> | null;
  _pendingMtDNA?: { resolved?: Partial<PendingMtDnaImport['resolved']> } | null;
  _snpTableCache?: unknown; triggerDNAFilePicker?: () => unknown;
} & Record<string, unknown>;
import {
  cacheDnaSnpTable,
  clearPendingDnaImport,
  configureDnaRuntimeDeps,
  confirmDnaDeleteDialog,
  clearPendingMtDnaImport,
  getDnaProfileLatitudeBand,
  getPendingMtDnaImport,
  getPendingDnaImport,
  isDnaLabImportRunning,
  logDnaDebugError,
  logDnaDebugWarn,
  navigateDnaRoute,
  openDnaChatPrompt,
  refreshDnaShell,
  refreshDnaSidebar,
  setPendingMtDnaImport,
  setPendingDnaImport,
  triggerDnaFilePicker,
  updateDnaChatNudge,
} from '../js/dna-runtime.js';
import { configureContextCardsRuntimeCallbacks } from '../js/context-cards-runtime.js';
import { configureChatRuntimeCallbacks } from '../js/chat-runtime.js';
import {
  configureDnaModuleBridge,
  getDnaModuleFunction,
  getDnaModuleValue,
} from '../js/dna-runtime-bridge.js';




const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

console.log('=== DNA Runtime Adapters ===');

const runtimeKeys = [
  '_pendingDNAImport',
  '_pendingMtDNA',
  '_snpTableCache',
  'isDebugMode',
  'showConfirmDialog',
  'triggerDNAFilePicker',
];
const originals = Object.fromEntries(runtimeKeys.map(key => [key, (globalThis as RuntimeTestGlobals)[key]]));
const originalError = console.error;
const originalWarn = console.warn;
const originalDnaRuntimeDeps = configureDnaRuntimeDeps();
const originalContextCardsRuntime = configureContextCardsRuntimeCallbacks();
const originalChatRuntime = configureChatRuntimeCallbacks();
const previousDnaBridge = configureDnaModuleBridge({
  handleDNAFile: null,
  HAPLOGROUP_LIST: null,
});

try {
  for (const key of runtimeKeys) delete (globalThis as RuntimeTestGlobals)[key];

  const calls: Array<[string, ...(string | undefined)[]]> = [];
  configureDnaRuntimeDeps({
    buildSidebar: () => calls.push(['sidebar']),
    navigate: route => calls.push(['navigate', route]),
    openChatPanel: prompt => calls.push(['chat', prompt]),
  });
  refreshDnaShell('dashboard');
  assert('refreshDnaShell refreshes sidebar then navigates',
    JSON.stringify(calls.slice(0, 2)) === JSON.stringify([['sidebar'], ['navigate', 'dashboard']]));

  calls.length = 0;
  navigateDnaRoute('genome');
  assert('navigateDnaRoute delegates route changes',
    calls.length === 1 && calls[0]![0] === 'navigate' && calls[0]![1] === 'genome');

  assert('openDnaChatPrompt delegates an explicit editable AI handoff',
    openDnaChatPrompt('Interpret this SNP') === true &&
    calls.some(call => call[0] === 'chat' && call[1] === 'Interpret this SNP'));

  configureDnaRuntimeDeps({ buildSidebar: () => { throw new Error('sidebar failed'); } });
  let sidebarThrew = false;
  try { refreshDnaSidebar(); } catch (_) { sidebarThrew = true; }
  assert('refreshDnaSidebar swallows sidebar refresh errors', !sidebarThrew);

  configureDnaRuntimeDeps({ buildSidebar: null, navigate: null, openChatPanel: null });
  let missingCallbacksThrew = false;
  try { refreshDnaShell('dashboard'); } catch (_) { missingCallbacksThrew = true; }
  assert('DNA view callbacks are safe no-ops before shell wiring', !missingCallbacksThrew);
  assert('DNA AI handoff no-ops without a configured chat host', openDnaChatPrompt('Interpret this SNP') === false);

  configureDnaRuntimeDeps({ isImportRunning: () => true });
  assert('isDnaLabImportRunning delegates true state', isDnaLabImportRunning() === true);
  configureDnaRuntimeDeps({
    isImportRunning: () => { throw new Error('import status failed'); },
  });
  assert('isDnaLabImportRunning fails closed on runtime errors', isDnaLabImportRunning() === true);

  configureDnaModuleBridge({
    handleDNAFile: (file: { name: string }) => calls.push(['handleDNAFile', file.name]),
    HAPLOGROUP_LIST: ['H', 'J'],
  });
  getDnaModuleFunction('handleDNAFile')?.({ name: 'dna.txt' } as File);
  assert('DNA module bridge delegates file handling and values',
    calls.some(call => call[0] === 'handleDNAFile' && call[1] === 'dna.txt') &&
      (getDnaModuleValue('HAPLOGROUP_LIST') as string[] | null)?.includes('J'));

  (globalThis as RuntimeTestGlobals).triggerDNAFilePicker = () => calls.push(['legacyTriggerDNAFilePicker']);
  configureContextCardsRuntimeCallbacks({
    triggerDNAFilePicker: () => calls.push(['triggerDNAFilePicker']),
  });
  triggerDnaFilePicker();
  assert('triggerDnaFilePicker delegates picker opening',
    calls.some(call => call[0] === 'triggerDNAFilePicker'));

  configureChatRuntimeCallbacks({
    updateChatNudge: () => calls.push(['updateChatNudge']),
  });
  updateDnaChatNudge();
  assert('updateDnaChatNudge delegates chat nudge refresh',
    calls.some(call => call[0] === 'updateChatNudge'));

  configureDnaRuntimeDeps({ getLatitudeFromLocation: () => '40-50° (temperate)' });
  assert('getDnaProfileLatitudeBand delegates profile latitude lookup',
    getDnaProfileLatitudeBand() === '40-50° (temperate)');
  configureDnaRuntimeDeps({ getLatitudeFromLocation: () => { throw new Error('location failed'); } });
  assert('getDnaProfileLatitudeBand reports null on runtime errors',
    getDnaProfileLatitudeBand() === null);

  configureDnaRuntimeDeps({ showConfirmDialog: async message => {
    calls.push(['confirm', message]);
    return true;
  } });
  assert('confirmDnaDeleteDialog delegates confirmation',
    await confirmDnaDeleteDialog() === true &&
      calls.some(call => call[0] === 'confirm' && call[1]!.includes('Delete genetic data')));
  configureDnaRuntimeDeps({ showConfirmDialog: async () => {
    throw new Error('dialog failed');
  } });
  assert('confirmDnaDeleteDialog reports false on dialog errors',
    await confirmDnaDeleteDialog() === false);

  const table = { rs1801133: { gene: 'MTHFR' } };
  cacheDnaSnpTable(table);
  assert('cacheDnaSnpTable publishes SNP table cache',
    (globalThis as RuntimeTestGlobals)._snpTableCache === table);

  setPendingDnaImport({ source: 'AncestryDNA' } as PendingDnaImport);
  assert('pending DNA import is published for browser flows',
    getPendingDnaImport()?.source === 'AncestryDNA' &&
      (globalThis as RuntimeTestGlobals)._pendingDNAImport?.source === 'AncestryDNA');
  clearPendingDnaImport();
  assert('clearPendingDnaImport clears published pending import',
    getPendingDnaImport() === null && (globalThis as RuntimeTestGlobals)._pendingDNAImport === null);

  setPendingMtDnaImport({ resolved: { haplogroup: 'J' } } as PendingMtDnaImport);
  assert('pending mtDNA import is published for browser flows',
    getPendingMtDnaImport()?.resolved?.haplogroup === 'J' &&
      (globalThis as RuntimeTestGlobals)._pendingMtDNA?.resolved?.haplogroup === 'J');
  clearPendingMtDnaImport();
  assert('clearPendingMtDnaImport clears published pending mtDNA import',
    getPendingMtDnaImport() === null && (globalThis as RuntimeTestGlobals)._pendingMtDNA === null);

  let errorLogged = false;
  let warnLogged = false;
  console.error = () => { errorLogged = true; };
  console.warn = () => { warnLogged = true; };
  configureDnaRuntimeDeps({ isDebugMode: () => false });
  logDnaDebugError('hidden');
  logDnaDebugWarn('hidden');
  assert('debug logs are gated off when debug mode is false',
    !errorLogged && !warnLogged);
  configureDnaRuntimeDeps({ isDebugMode: () => true });
  logDnaDebugError('shown');
  logDnaDebugWarn('shown');
  assert('debug logs are emitted when debug mode is true',
    errorLogged && warnLogged);

  assert('DNA bridge does not publish legacy exports',
    !('handleDNAFile' in globalThis) &&
      !('_getState' in globalThis) &&
      !('_saveAndRefresh' in globalThis));
} finally {
  configureDnaModuleBridge({
    handleDNAFile: null,
    HAPLOGROUP_LIST: null,
    ...previousDnaBridge,
  });
  configureDnaRuntimeDeps(originalDnaRuntimeDeps);
  configureContextCardsRuntimeCallbacks(originalContextCardsRuntime);
  configureChatRuntimeCallbacks(originalChatRuntime);
  console.error = originalError;
  console.warn = originalWarn;
  for (const key of runtimeKeys) {
    if (originals[key] === undefined) delete (globalThis as RuntimeTestGlobals)[key];
    else (globalThis as RuntimeTestGlobals)[key] = originals[key];
  }
}

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
