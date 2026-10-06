#!/usr/bin/env node
import { readServiceWorkerSource } from '../scripts/service-worker-source.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// test-ppq-provider.js - PPQ provider panel extraction and export checks
//
// Run: node tests/test-ppq-provider.js

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');


const { assert, results: legacyAssertions } = createLegacyAssertions(" - ");

console.log('=== PPQ Provider Panel Tests ===\n');

const providerPanels = await import('../js/provider-panels.js');

const panelsSrc = read('js/provider-panels.js');
const ppqSrc = read('js/provider-ppq-panels.js');
const topupSrc = read('js/ppq-topup-controller.js');
const ppqComponentSrc = read('js/components/PpqSettings.svelte');
const swSrc = readServiceWorkerSource(relative => read(relative));
const apiSrc = read('js/api.js');
const apiOpenAICompatibleSrc = read('js/api-openai-compatible.js');
const apiPpqSrc = read('js/api-ppq.js');
const rendererSrc = read('js/provider-panel-renderers.js');
const delegatesSrc = read('js/provider-panel-delegates.js');
const tinfoilModule = await import('../vendor/tinfoil-browser.js');
const ehbpModule = await import('../vendor/ehbp-browser.js');

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
assert('PPQ module owns invoice polling', ppqSrc.includes('status: checkPpqTopupStatus') && topupSrc.includes('services.status(invoice.invoice_id') && topupSrc.includes('setInterval(async'));
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
assert('PPQ Private Mode toggle renders in provider panel', rendererSrc.includes('return PPQ_SETTINGS_HOST') && ppqComponentSrc.includes('ppq-private-toggle') && ppqComponentSrc.includes('Private TEE Mode'));
assert('PPQ Private Mode change is delegated', delegatesSrc.includes("'ppq-private-mode': 'togglePpqPrivateMode'"));
assert('PPQ model fetch refreshes owned private controls without replacing the panel', ppqSrc.includes('view.refresh(buildPpqSettingsSnapshot())') && !ppqSrc.includes('innerHTML'));
assert('PPQ catalog updates require the originating view, provider and account', ppqSrc.includes("view?.isCurrent() && getAIProvider() === 'ppq' && accountCurrent()"));
assert('PPQ owned catalog refresh preserves separately owned balance and credential fields', ppqComponentSrc.includes('snapshot = next') && !ppqComponentSrc.includes('balance = next') && !ppqComponentSrc.includes('key = next'));
assert('PPQ private transport wrapper exists', read('vendor/ppq-private-tee.js').includes('createPpqPrivateFetch'));
assert('Tinfoil browser bundle exports SecureClient', typeof tinfoilModule.SecureClient === 'function');
assert('EHBP browser bundle exports request primitives', typeof ehbpModule.Identity === 'function' && typeof ehbpModule.decryptResponseWithToken === 'function');

console.log('\n3. Runtime exports');
assert('providerPanels.handleCreatePpqAccount exported', typeof providerPanels.handleCreatePpqAccount === 'function');
assert('providerPanels.handleSavePpqKey exported', typeof providerPanels.handleSavePpqKey === 'function');
assert('providerPanels.handleRemovePpqKey exported', typeof providerPanels.handleRemovePpqKey === 'function');
assert('providerPanels.refreshPpqBalance exported', typeof providerPanels.refreshPpqBalance === 'function');
assert('providerPanels.showPpqTopup exported', typeof providerPanels.showPpqTopup === 'function');
assert('providerPanels.doPpqTopup exported', typeof providerPanels.doPpqTopup === 'function');
assert('providerPanels.cancelPpqTopup exported', typeof providerPanels.cancelPpqTopup === 'function');
assert('PPQ panel handlers stay off window', !('handleCreatePpqAccount' in window));

console.log('\n4. App shell');
assert('service worker caches PPQ module', swSrc.includes("'/js/provider-ppq-panels.js'"));
assert('service worker caches private TEE vendor files',
  swSrc.includes("'/vendor/ppq-private-tee.js'")
    && swSrc.includes("'/vendor/tinfoil-browser.js'")
    && swSrc.includes("'/vendor/ehbp-browser.js'"));

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
process.exit(legacyAssertions.fail > 0 ? 1 : 0);
