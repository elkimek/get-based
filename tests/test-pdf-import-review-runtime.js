#!/usr/bin/env node
// test-pdf-import-review-runtime.js - Import review browser-runtime adapter coverage.

import './_node-shim.js';

import {
  clearPendingImportRuntime,
  configurePdfImportReviewRuntimeDeps,
  confirmImportFromRuntime,
  getBatchImportContext,
  getPendingImportFromRuntime,
  getPendingImportRefLookup,
  hasBatchImportContext,
  markImportReviewDelegatesBound,
  refreshImportedDataViewsRuntime,
  setPendingImportRuntime,
  showPIIDiffViewerFromRuntime,
  startBatchImport,
  takeBatchImportResolve,
} from '../js/pdf-import-review-runtime.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

const RUNTIME_FIELDS = [
  '_pendingImport',
  '_pendingImportRefLookup',
  '_batchImportResolve',
  '_batchImportContext',
  '__importReviewDelegatesBound',
  'showPIIDiffViewer',
];

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalReviewRuntimeDeps = configurePdfImportReviewRuntimeDeps();
const originalFieldDescriptors = new Map(
  RUNTIME_FIELDS.map(field => [field, Object.getOwnPropertyDescriptor(globalThis, field)])
);

function restoreDescriptor(target, key, descriptor) {
  if (descriptor) {
    Object.defineProperty(target, key, descriptor);
    return;
  }
  delete target[key];
}

function resetRuntimeWindow() {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: globalThis,
  });
  for (const field of RUNTIME_FIELDS) delete globalThis[field];
}

console.log('=== PDF Import Review Runtime Tests ===\n');

try {
  resetRuntimeWindow();

  const parseResult = { date: '2026-01-01', markers: [] };
  const refLookup = { 'biochemistry.glucose': { name: 'Glucose' } };
  setPendingImportRuntime(parseResult, refLookup);
  assert('pending import stored in runtime', getPendingImportFromRuntime() === parseResult);
  assert('pending import ref lookup stored in runtime', getPendingImportRefLookup() === refLookup);
  assert('unconfigured confirm callback is a safe no-op', confirmImportFromRuntime() === false);

  const viewCalls = [];
  configurePdfImportReviewRuntimeDeps({
    buildSidebar: () => viewCalls.push(['sidebar']),
    navigate: route => viewCalls.push(['navigate', route]),
    updateHeaderDates: () => viewCalls.push(['dates', true]),
  });
  assert('import persistence view refresh delegates through runtime hooks',
    refreshImportedDataViewsRuntime('labs') === true &&
      JSON.stringify(viewCalls) === JSON.stringify([
        ['sidebar'],
        ['dates', true],
        ['navigate', 'labs'],
      ]));

  clearPendingImportRuntime();
  assert('pending import clears to null', globalThis._pendingImport === null);
  assert('pending import ref lookup clears to null', globalThis._pendingImportRefLookup === null);
  assert('cleared pending import reads as null', getPendingImportFromRuntime() === null);
  assert('cleared pending ref lookup reads as null', getPendingImportRefLookup() === null);

  let resolvedAction = '';
  const context = { current: 2, total: 5 };
  startBatchImport(action => { resolvedAction = action; }, context);
  assert('batch import context is available', getBatchImportContext() === context);
  assert('batch import context predicate is true', hasBatchImportContext());
  const resolve = takeBatchImportResolve();
  assert('batch import resolver can be taken', typeof resolve === 'function');
  assert('taking resolver clears batch context', globalThis._batchImportContext === null);
  assert('taking resolver clears runtime resolver', globalThis._batchImportResolve === null);
  resolve?.('import');
  assert('taken resolver remains callable', resolvedAction === 'import');
  assert('missing batch resolver returns null', takeBatchImportResolve() === null);

  assert('delegate binding marker sets once', markImportReviewDelegatesBound() === true);
  assert('delegate binding marker rejects second bind', markImportReviewDelegatesBound() === false);
  assert('delegate binding flag stored in runtime', globalThis.__importReviewDelegatesBound === true);

  let confirmCalls = 0;
  configurePdfImportReviewRuntimeDeps({
    confirmImport: () => { confirmCalls++; },
  });
  confirmImportFromRuntime();
  assert('confirm callback uses configured module dependency', confirmCalls === 1);
  configurePdfImportReviewRuntimeDeps({ confirmImport: null });
  assert('confirm callback can be cleared safely', confirmImportFromRuntime() === false);

  let diffArgs = null;
  let diffThis = null;
  globalThis.showPIIDiffViewer = function(original, obfuscated) {
    diffArgs = [original, obfuscated];
    diffThis = this;
  };
  showPIIDiffViewerFromRuntime('raw', 'safe');
  assert('PII diff callback receives payload', diffArgs?.[0] === 'raw' && diffArgs?.[1] === 'safe');
  assert('PII diff callback preserves window receiver', diffThis === globalThis);

  delete globalThis.window;
  assert('no-window view refresh returns false', refreshImportedDataViewsRuntime('labs') === false);
  assert('no-window pending import reads as null', getPendingImportFromRuntime() === null);
  assert('no-window ref lookup reads as null', getPendingImportRefLookup() === null);
  assert('no-window batch context reads as null', getBatchImportContext() === null);
  assert('no-window batch predicate is false', hasBatchImportContext() === false);
  assert('no-window delegate bind is false', markImportReviewDelegatesBound() === false);
  assert('no-window resolver take returns null', takeBatchImportResolve() === null);
  let noWindowResolveCalled = false;
  setPendingImportRuntime({ markers: [] }, {});
  clearPendingImportRuntime();
  startBatchImport(() => { noWindowResolveCalled = true; }, { current: 1, total: 1 });
  confirmImportFromRuntime();
  showPIIDiffViewerFromRuntime('raw', 'safe');
  assert('no-window writes are no-ops', noWindowResolveCalled === false);
} finally {
  configurePdfImportReviewRuntimeDeps(originalReviewRuntimeDeps);
  for (const field of RUNTIME_FIELDS) {
    restoreDescriptor(globalThis, field, originalFieldDescriptors.get(field));
  }
  restoreDescriptor(globalThis, 'window', originalWindowDescriptor);
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
if (fail) process.exit(1);
