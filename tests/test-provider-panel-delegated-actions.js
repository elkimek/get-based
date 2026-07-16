#!/usr/bin/env node
// Static provider panel delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const renderSrc = fs.readFileSync(path.join(root, 'js/provider-panel-renderers.js'), 'utf8');
const renderRuntimeSrc = fs.readFileSync(path.join(root, 'js/provider-panel-renderers-runtime.js'), 'utf8');
const modelControlsSrc = fs.readFileSync(path.join(root, 'js/provider-model-controls.js'), 'utf8');
const delegatesSrc = fs.readFileSync(path.join(root, 'js/provider-panel-delegates.js'), 'utf8');
const panelsSrc = fs.readFileSync(path.join(root, 'js/provider-panels.js'), 'utf8');
const ppqSrc = fs.readFileSync(path.join(root, 'js/provider-ppq-panels.js'), 'utf8');
const swSrc = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

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

console.log('=== Provider Panel Delegated Actions ===');

const inlineHandlerRe = /\bon(?:click|change|input|search|keydown|keyup|submit|blur)=/;
assert('provider-panel-renderers.js renders no inline event attributes',
  !inlineHandlerRe.test(renderSrc));
assert('provider-model-controls.js renders no inline event attributes',
  !inlineHandlerRe.test(modelControlsSrc));
assert('provider-panels.js renders no inline event attributes',
  !inlineHandlerRe.test(panelsSrc));
assert('provider-ppq-panels.js renders no inline event attributes',
  !inlineHandlerRe.test(ppqSrc));
assert('provider panel renderers emit delegated action attributes',
  renderSrc.includes('data-provider-panel-action') &&
    renderSrc.includes('data-provider-panel-change') &&
    renderSrc.includes('data-provider-panel-key'));
assert('provider panel renderers route Nostr module dependencies through runtime adapter',
  renderSrc.includes("from './provider-panel-renderers-runtime.js'") &&
    renderSrc.includes('getSelectedRoutstrNodeFromRuntime()') &&
    renderSrc.includes('discoverRoutstrNodesFromRuntime()') &&
    renderSrc.includes('setSelectedRoutstrNodeFromRuntime(bestUrl)') &&
    !/\bwindow(?:\.|\s*\[)/.test(renderSrc) &&
    renderRuntimeSrc.includes("from './nostr-discovery.js'") &&
    renderRuntimeSrc.includes('configureProviderPanelRendererRuntime') &&
    !/\bwindow(?:\.|\s*\[)/.test(renderRuntimeSrc));
assert('provider model controls emit delegated model attributes',
  modelControlsSrc.includes('data-provider-panel-change') &&
    modelControlsSrc.includes('data-provider-panel-key'));
assert('provider-panels installs provider panel delegates',
  panelsSrc.includes("import { installProviderPanelDelegates } from './provider-panel-delegates.js'") &&
    panelsSrc.includes('installProviderPanelDelegates({') &&
    panelsSrc.includes('handleSaveOpenRouterKey') &&
    panelsSrc.includes('setOllamaMainModel'));
assert('provider panel handlers stay module-only',
  !panelsSrc.includes('Object.assign(window') &&
    !panelsSrc.includes('WINDOW EXPORTS'));
assert('provider panel delegates install idempotent listeners',
  delegatesSrc.includes('let providerPanelDelegatesInstalled = false') &&
    delegatesSrc.includes("document.addEventListener('click', _handleProviderPanelClick)") &&
    delegatesSrc.includes("document.addEventListener('change', _handleProviderPanelChange)") &&
    delegatesSrc.includes("document.addEventListener('keydown', _handleProviderPanelKeydown)"));
assert('provider panel delegates are scoped to the provider panel',
  delegatesSrc.includes('PROVIDER_PANEL_ROOTS') &&
    delegatesSrc.includes('el.closest(PROVIDER_PANEL_ROOTS)'));
assert('provider panel delegates dispatch through explicit action maps',
  delegatesSrc.includes('const CLICK_ACTIONS = Object.freeze({') &&
    delegatesSrc.includes('const CHANGE_ACTIONS = Object.freeze({') &&
    delegatesSrc.includes('const MODEL_PRICING_ACTIONS = Object.freeze({') &&
    delegatesSrc.includes('const KEY_ACTIONS = Object.freeze({'));
assert('provider panel delegates warn on missing registry callbacks',
  delegatesSrc.includes('Missing provider panel callback') &&
    delegatesSrc.includes('console.warn(message)'));
assert('provider panel delegates avoid preemptive default prevention',
  delegatesSrc.indexOf('if (!callbackName) return _warnProviderPanelDelegate(`Unknown provider panel click action: ${action}`);') <
    delegatesSrc.indexOf("if (el.matches('a, button')) event.preventDefault();") &&
  delegatesSrc.indexOf('if (!callbackName) return _warnProviderPanelDelegate(`Unknown provider panel key action: ${action}`);') <
    delegatesSrc.lastIndexOf('event.preventDefault();'));
assert('service worker precaches provider panel delegate module',
  swSrc.includes('/js/provider-panel-delegates.js'));

[
  'start-openrouter-oauth',
  'save-openrouter-key',
  'remove-openrouter-key',
  'refresh-openrouter-balance',
  'refresh-cashu-wallet-balance',
  'show-routstr-mint-edit',
  'refresh-routstr-balance',
  'save-venice-key',
  'remove-venice-key',
  'refresh-venice-balance',
  'refresh-ppq-balance',
  'show-ppq-topup',
  'create-ppq-account',
  'save-ppq-key',
  'remove-ppq-key',
  'copy-ppq-key-reveal',
  'dismiss-ppq-key-reveal',
  'select-ppq-method',
  'ppq-topup-preset',
  'show-ppq-custom-input',
  'copy-ppq-payment',
  'cancel-ppq-topup',
  'recover-pending-deposit',
  'recover-pending-withdraw',
  'copy-provider-panel-clipboard',
  'select-provider-panel-text',
  'acknowledge-routstr-key',
  'apply-custom-api-model',
  'save-custom-api',
  'remove-custom-api',
  'test-ollama-connection',
].forEach(action => {
  assert(`provider panel click action ${action} is handled`, delegatesSrc.includes(`'${action}'`));
});

[
  'openrouter-model',
  'routstr-model',
  'routstr-private-mode',
  'venice-model',
  'venice-e2ee',
  'ppq-model',
  'custom-model',
  'local-ai-model',
].forEach(action => {
  assert(`provider panel change action ${action} is handled`, delegatesSrc.includes(`'${action}'`));
});

[
  'openrouter-custom-model',
  'custom-manual-model',
].forEach(action => {
  assert(`provider panel key action ${action} is handled`, delegatesSrc.includes(`'${action}'`));
});

assert('provider panel recovery uses mint-aware receiveToken instead of wallet import',
  panelsSrc.includes("typeof walletRuntime.cashuReceiveToken !== 'function'") &&
    panelsSrc.includes('await walletRuntime.cashuReceiveToken(token)') &&
    !panelsSrc.includes('await appWindow.cashuImportWallet(token)'));
assert('provider panel recovery awaits pending-token clear before reload',
  /await walletRuntime\.cashuReceiveToken\(token\);[\s\S]*await clearPendingToken\(\);[\s\S]*reloadProviderPanelRuntime\(\);/.test(panelsSrc));
assert('provider panel onboarding return uses module Chat dependency',
  panelsSrc.includes("getProviderPanelRuntimeValue('_settingsHadProvider')") &&
    panelsSrc.includes("callProviderPanelRuntime('hasAIProvider')") &&
    panelsSrc.includes("callProviderPanelRuntime('closeSettingsModal')") &&
    panelsSrc.includes('providerPanelDeps.openChatPanel()') &&
    !panelsSrc.includes("callProviderPanelRuntime('openChatPanel')"));
assert('provider panel focus-card refresh uses runtime helper call',
  panelsSrc.includes("callProviderPanelRuntime('loadFocusCard')"));
assert('provider panel E2EE clear and settings reopen use runtime helper calls',
  panelsSrc.includes("callProviderPanelRuntime('clearE2EESession')") &&
    panelsSrc.includes("callProviderPanelRuntime('openSettingsModal')"));
assert('provider panel OpenRouter credits link uses runtime helper open',
  panelsSrc.includes("callProviderPanelRuntime('open', 'https://openrouter.ai/settings/credits', '_blank', 'noopener')"));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
