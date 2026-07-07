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
const apiSrc = read('js/api.js');
const apiOpenAICompatibleSrc = read('js/api-openai-compatible.js');
const apiPpqSrc = read('js/api-ppq.js');
const rendererSrc = read('js/provider-panel-renderers.js');
const delegatesSrc = read('js/provider-panel-delegates.js');

console.log('1. Extraction boundary');
assert('PPQ panel module exists', ppqSrc.includes('provider-ppq-panels.js'));
assert('PPQ panel module renders no inline event attributes', !/\bon(?:click|change|input|search|keydown|keyup|submit|blur)=/.test(ppqSrc));
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
assert('PPQ key removal clears private-mode caches',
  ppqSrc.includes("localStorage.removeItem('labcharts-ppq-private-models')")
    && ppqSrc.includes("localStorage.removeItem('labcharts-ppq-private-vision-models')")
    && ppqSrc.includes("localStorage.removeItem('labcharts-ppq-private-mode')")
    && ppqSrc.includes("localStorage.removeItem('labcharts-ppq-model-private')"));
assert('PPQ Private branch uses Tinfoil wrapper', apiPpqSrc.includes("import('../vendor/ppq-private-tee.js')") && apiSrc.includes('callPpqPrivateAPI'));
assert('PPQ Tinfoil wrapper clears stale failed readiness',
  read('vendor/ppq-private-tee.js').includes('catch (e)')
    && read('vendor/ppq-private-tee.js').includes('clearPpqPrivateClient();')
    && read('vendor/ppq-private-tee.js').includes('throw e;'));
assert('PPQ Private transport uses secure fetch and attestation',
  apiPpqSrc.includes('createPpqPrivateFetch({ apiBase: \'https://api.ppq.ai\' })')
    && apiPpqSrc.includes('fetchImpl: secure.fetch')
    && apiOpenAICompatibleSrc.includes('fetchWithOptionalTimeout(fetchImpl, endpoint, requestInit, requestTimeoutMs)')
    && apiPpqSrc.includes('apiWindow._ppqAttestation = secure.verification')
    && apiPpqSrc.includes('{ ...opts, webSearch: false }')
    && apiPpqSrc.includes("'https://api.ppq.ai/private/v1/chat/completions'"));
assert('PPQ private cache is gated on API-listed private entitlement',
  apiPpqSrc.includes('const privateModels = privateFromApi')
    && !apiPpqSrc.includes('privateFromApi.length ? privateFromApi : PPQ_PRIVATE_MODELS'));
assert('PPQ Private Mode toggle renders in provider panel', rendererSrc.includes('ppq-private-toggle') && rendererSrc.includes('Private TEE Mode'));
assert('PPQ Private Mode change is delegated', delegatesSrc.includes("'ppq-private-mode': 'togglePpqPrivateMode'"));
assert('PPQ model fetch rerenders panel when private controls become available', ppqSrc.includes('_rerenderPpqPanelIfPrivateControlsAppeared') && ppqSrc.includes('fetchPpqModels(ppqKey).then(_renderPpqModelsAfterFetch)'));
assert('PPQ model fetch rerender only touches the PPQ panel', ppqSrc.includes("panel.querySelector('#ppq-model-area')"));
assert('PPQ panel rerender refreshes balance on the new DOM', ppqSrc.includes('if (rerendered) _refreshPpqBalanceDisplay();'));
assert('PPQ private transport wrapper exists', read('vendor/ppq-private-tee.js').includes('createPpqPrivateFetch'));
assert('PPQ Tinfoil browser bundle exists', read('vendor/tinfoil-browser.js').includes('var SecureClient = class'));

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
assert('service worker caches PPQ private TEE vendor files', swSrc.includes("'/vendor/ppq-private-tee.js'") && swSrc.includes("'/vendor/tinfoil-browser.js'"));

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
