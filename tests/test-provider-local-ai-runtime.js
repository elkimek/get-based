#!/usr/bin/env node
// test-provider-local-ai-runtime.js - Local AI settings runtime adapter behavior.

import './_node-shim.js';
import {
  cacheLocalAiModelDetails,
  getCachedLocalAiModelDetails,
  updatePrivacyStatusCardFromRuntime,
} from '../js/provider-local-ai-runtime.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== Provider Local AI Runtime Tests ===\n');

const runtimeKeys = [
  'window',
  'updatePrivacyStatusCard',
  '_lastOllamaModelDetails',
  '_lastIsOllamaServer',
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
  const privacyCalls = [];
  setRuntimeValue('updatePrivacyStatusCard', (...args) => privacyCalls.push(args));

  updatePrivacyStatusCardFromRuntime(true);
  updatePrivacyStatusCardFromRuntime();
  assert('updatePrivacyStatusCardFromRuntime delegates boolean and empty calls',
    privacyCalls.length === 2 &&
      privacyCalls[0].length === 1 &&
      privacyCalls[0][0] === true &&
      privacyCalls[1].length === 0);

  const modelDetails = [{ name: 'llama3.2' }];
  cacheLocalAiModelDetails(modelDetails, true);
  const cached = getCachedLocalAiModelDetails();
  assert('cacheLocalAiModelDetails stores details and Ollama flag on runtime',
    cached.modelDetails === modelDetails && cached.isOllamaServer === true);

  setRuntimeValue('_lastOllamaModelDetails', 'not-an-array');
  setRuntimeValue('_lastIsOllamaServer', 1);
  const invalidCached = getCachedLocalAiModelDetails();
  assert('getCachedLocalAiModelDetails normalizes missing or invalid details',
    Array.isArray(invalidCached.modelDetails) &&
      invalidCached.modelDetails.length === 0 &&
      invalidCached.isOllamaServer === true);

  delete globalThis.window;
  updatePrivacyStatusCardFromRuntime(false);
  cacheLocalAiModelDetails([{ name: 'qwen2.5:14b' }], false);
  const missingRuntimeCached = getCachedLocalAiModelDetails();
  assert('runtime adapter no-ops safely when window is missing',
    privacyCalls.length === 2 &&
      missingRuntimeCached.modelDetails.length === 0 &&
      missingRuntimeCached.isOllamaServer === false);
} finally {
  restoreRuntime();
}

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
