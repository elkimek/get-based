// @ts-check
// settings-provider-bridge.js - lazy bridge from Settings to provider panel modules.

import {
  clearOpenRouterOAuthSession,
  getAIProvider,
  getOpenRouterKey,
  rememberOpenRouterOAuthPreviousProvider,
  setAIProvider,
} from './api.js';

/** @typedef {Window & typeof globalThis & Record<string, any>} SettingsProviderBridgeWindow */

const settingsWindow = /** @type {SettingsProviderBridgeWindow} */ (window);

let _providerPanelsLoad = null;

function loadProviderPanels() {
  if (!_providerPanelsLoad) _providerPanelsLoad = import('./provider-panels.js');
  return _providerPanelsLoad;
}

export function renderAIProviderPanelBridge(provider) {
  loadProviderPanels().then(() => {
    const panel = document.getElementById('ai-provider-panel');
    if (panel && typeof settingsWindow.renderAIProviderPanel === 'function' && settingsWindow.renderAIProviderPanel !== renderAIProviderPanelBridge) {
      panel.innerHTML = settingsWindow.renderAIProviderPanel(provider || getAIProvider());
    }
  }).catch(() => {});
  return '<div class="ai-provider-panel"><div class="ai-provider-desc">Loading provider settings...</div></div>';
}

/** @param {string} name */
function installProviderPanelBridge(name) {
  const registry = /** @type {Record<string, any>} */ (settingsWindow);
  if (typeof registry[name] === 'function') return;
  const bridge = async function(...args) {
    await loadProviderPanels();
    const fn = registry[name];
    if (typeof fn !== 'function' || fn === bridge) return undefined;
    return fn(...args);
  };
  registry[name] = bridge;
}

function setProviderButtonState(provider) {
  const buttons = /** @type {HTMLElement[]} */ (Array.from(document.querySelectorAll('.ai-provider-btn')));
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.provider === provider);
  });
}

export function switchAIProviderBridge(provider) {
  const previousProvider = getAIProvider();
  if (provider === 'openrouter' && previousProvider !== 'openrouter' && !getOpenRouterKey()) {
    rememberOpenRouterOAuthPreviousProvider(previousProvider);
  } else if (provider !== 'openrouter') {
    clearOpenRouterOAuthSession();
  }
  setAIProvider(provider);
  setProviderButtonState(provider);
  const panel = document.getElementById('ai-provider-panel');
  if (panel) panel.innerHTML = '<div class="ai-provider-panel"><div class="ai-provider-desc">Loading provider settings...</div></div>';
  loadProviderPanels().then(() => {
    const fn = settingsWindow.switchAIProvider;
    if (typeof fn === 'function' && fn !== switchAIProviderBridge) return fn(provider);
    if (panel && typeof settingsWindow.renderAIProviderPanel === 'function') panel.innerHTML = settingsWindow.renderAIProviderPanel(provider);
  }).catch(() => {});
}

const PROVIDER_PANEL_BRIDGE_NAMES = [
  'toggleAIPause',
  'initSettingsModelFetch',
  'initSettingsOllamaCheck',
  'testOllamaConnection',
  'testPIIOllamaConnection',
  'refreshVeniceBalance',
  'updateVeniceModelPricing',
  'onVeniceModelDropdownChange',
  'toggleVeniceE2EE',
  'updateOpenRouterModelPricing',
  'updateRoutstrModelPricing',
  'handleSaveVeniceKey',
  'handleRemoveVeniceKey',
  'renderVeniceModelDropdown',
  'handleSaveOpenRouterKey',
  'handleRemoveOpenRouterKey',
  'renderOpenRouterModelDropdown',
  'applyCustomOpenRouterModel',
  'onOpenRouterDropdownChange',
  'handleSaveRoutstrKey',
  'handleRemoveRoutstrKey',
  'renderRoutstrModelDropdown',
  'refreshCashuWalletBalance',
  'refreshRoutstrBalance',
  'showRoutstrWalletFund',
  'rsWalletFundCustomInput',
  'doRoutstrWalletFundCustom',
  'doRoutstrWalletFund',
  'doRoutstrWalletReceiveCashu',
  'showRoutstrMintEdit',
  'doRoutstrMintChange',
  'showRoutstrWalletBackup',
  'showRoutstrNodePicker',
  'connectRoutstrNode',
  'doRoutstrNodeDeposit',
  'doRoutstrNodeWithdraw',
  '_setActiveNodeAction',
  'walletSeedAcknowledged',
  'showWalletSeedPhrase',
  'showRoutstrWithdraw',
  'showRoutstrWithdrawLightning',
  'showRoutstrWithdrawToken',
  'doRoutstrSendToken',
  'doRoutstrWithdrawQuote',
  'doRoutstrWithdrawExecute',
  'doRoutstrWalletRestore',
  'handleCreatePpqAccount',
  'dismissPpqKeyReveal',
  'handleSavePpqKey',
  'handleRemovePpqKey',
  'renderPpqModelDropdown',
  'updatePpqModelPricing',
  'refreshPpqBalance',
  'showPpqTopup',
  'selectPpqMethod',
  'doPpqTopup',
  'ppqShowCustomInput',
  'doPpqTopupCustom',
  'cancelPpqTopup',
  'refreshOpenRouterBalance',
  'showInsufficientBalanceDialog',
  'handleSaveCustomApi',
  'handleRemoveCustomApi',
  'renderCustomApiModelDropdown',
  'applyCustomApiManualModel',
  'updateCustomModelPricing',
  'copyOllamaPullCmd',
  'refreshModelAdvisor',
  'applyHardwareOverride',
  'clearHardwareOverride',
];

export function installSettingsProviderBridge() {
  settingsWindow.renderAIProviderPanel = renderAIProviderPanelBridge;
  settingsWindow.switchAIProvider = switchAIProviderBridge;
  PROVIDER_PANEL_BRIDGE_NAMES.forEach(installProviderPanelBridge);
}
