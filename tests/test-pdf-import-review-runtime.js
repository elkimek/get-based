#!/usr/bin/env node
// test-pdf-import-review-runtime.js - Import review browser-runtime adapter coverage.

import './_node-shim.js';

import {
  clearPendingImportRuntime,
  confirmImportFromRuntime,
  getBatchImportContext,
  getPendingImportFromRuntime,
  getPendingImportRefLookup,
  hasBatchImportContext,
  markImportReviewDelegatesBound,
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
  'confirmImport',
  'showPIIDiffViewer',
];

const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
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
  let confirmThis = null;
  globalThis.confirmImport = function() {
    confirmCalls++;
    confirmThis = this;
  };
  confirmImportFromRuntime();
  assert('confirm callback is called from runtime', confirmCalls === 1);
  assert('confirm callback preserves window receiver', confirmThis === globalThis);

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
  for (const field of RUNTIME_FIELDS) {
    restoreDescriptor(globalThis, field, originalFieldDescriptors.get(field));
  }
  restoreDescriptor(globalThis, 'window', originalWindowDescriptor);
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
if (fail) process.exit(1);
