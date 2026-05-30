#!/usr/bin/env node
// test-ppq-provider.js - PPQ provider panel extraction and export checks
//
// Run: node tests/test-ppq-provider.js

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== PPQ Provider Panel Tests ===\n');

await import('../js/provider-panels.js');

const panelsSrc = read('js/provider-panels.js');
const ppqSrc = read('js/provider-ppq-panels.js');
const swSrc = read('service-worker.js');

console.log('1. Extraction boundary');
assert('PPQ panel module exists', ppqSrc.includes('provider-ppq-panels.js'));
assert('provider-panels imports PPQ module', panelsSrc.includes("from './provider-ppq-panels.js'"));
assert('provider-panels configures PPQ onboarding callback', panelsSrc.includes('configurePpqPanels({'));
assert('provider-panels delegates PPQ init', panelsSrc.includes('initSettingsPpqPanel();'));
assert('provider-panels delegates PPQ timer cleanup', panelsSrc.includes('clearPpqTopupTimers();'));
assert('provider-panels no longer owns PPQ poll timer', !panelsSrc.includes('_ppqTopupPollTimer'));

console.log('\n2. PPQ workflow ownership');
assert('PPQ module owns account creation', ppqSrc.includes('function handleCreatePpqAccount()'));
assert('PPQ module owns key save', ppqSrc.includes('function handleSavePpqKey()'));
assert('PPQ module owns key removal', ppqSrc.includes('function handleRemovePpqKey()'));
assert('PPQ module owns balance refresh', ppqSrc.includes('function refreshPpqBalance()'));
assert('PPQ module owns top-up picker', ppqSrc.includes('function showPpqTopup()'));
assert('PPQ module owns invoice polling', ppqSrc.includes('checkPpqTopupStatus(invoiceId)'));
assert('PPQ module owns QR generation', ppqSrc.includes('ensureQRCode()'));
assert('PPQ key removal keeps balance warning', ppqSrc.includes('This account has $') && ppqSrc.includes('showConfirmDialog(msg)'));

console.log('\n3. Runtime exports');
assert('window.handleCreatePpqAccount exported', typeof window.handleCreatePpqAccount === 'function');
assert('window.handleSavePpqKey exported', typeof window.handleSavePpqKey === 'function');
assert('window.handleRemovePpqKey exported', typeof window.handleRemovePpqKey === 'function');
assert('window.refreshPpqBalance exported', typeof window.refreshPpqBalance === 'function');
assert('window.showPpqTopup exported', typeof window.showPpqTopup === 'function');
assert('window.doPpqTopup exported', typeof window.doPpqTopup === 'function');
assert('window.cancelPpqTopup exported', typeof window.cancelPpqTopup === 'function');

console.log('\n4. App shell');
assert('service worker caches PPQ module', swSrc.includes("'/js/provider-ppq-panels.js'"));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
