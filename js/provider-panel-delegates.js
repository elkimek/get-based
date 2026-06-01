// provider-panel-delegates.js - Delegated AI provider settings panel actions

const PROVIDER_PANEL_ROOTS = '#ai-provider-panel';

const CLICK_ACTIONS = Object.freeze({
  'start-openrouter-oauth': 'startOpenRouterOAuth',
  'save-openrouter-key': 'handleSaveOpenRouterKey',
  'remove-openrouter-key': 'handleRemoveOpenRouterKey',
  'refresh-openrouter-balance': 'refreshOpenRouterBalance',
  'refresh-cashu-wallet-balance': 'refreshCashuWalletBalance',
  'show-routstr-mint-edit': 'showRoutstrMintEdit',
  'refresh-routstr-balance': 'refreshRoutstrBalance',
  'save-venice-key': 'handleSaveVeniceKey',
  'remove-venice-key': 'handleRemoveVeniceKey',
  'refresh-venice-balance': 'refreshVeniceBalance',
  'refresh-ppq-balance': 'refreshPpqBalance',
  'show-ppq-topup': 'showPpqTopup',
  'create-ppq-account': 'handleCreatePpqAccount',
  'save-ppq-key': 'handleSavePpqKey',
  'remove-ppq-key': 'handleRemovePpqKey',
  'apply-custom-api-model': 'applyCustomApiManualModel',
  'save-custom-api': 'handleSaveCustomApi',
  'remove-custom-api': 'handleRemoveCustomApi',
  'test-ollama-connection': 'testOllamaConnection'
});

const CHANGE_ACTIONS = Object.freeze({
  'openrouter-model': 'onOpenRouterDropdownChange',
  'venice-model': 'onVeniceModelDropdownChange',
  'venice-e2ee': 'toggleVeniceE2EE'
});

const MODEL_PRICING_ACTIONS = Object.freeze({
  'routstr-model': ['setRoutstrModel', 'updateRoutstrModelPricing'],
  'ppq-model': ['setPpqModel', 'updatePpqModelPricing'],
  'custom-model': ['setCustomApiModel', 'updateCustomModelPricing']
});

const KEY_ACTIONS = Object.freeze({
  'openrouter-custom-model': 'applyCustomOpenRouterModel',
  'custom-manual-model': 'applyCustomApiManualModel'
});

let providerPanelDelegatesInstalled = false;
let providerPanelActions = {};

export function installProviderPanelDelegates(actions = {}) {
  Object.assign(providerPanelActions, actions);
  if (providerPanelDelegatesInstalled || typeof document === 'undefined') return;
  providerPanelDelegatesInstalled = true;
  document.addEventListener('click', _handleProviderPanelClick);
  document.addEventListener('change', _handleProviderPanelChange);
  document.addEventListener('keydown', _handleProviderPanelKeydown);
}

function _call(name, ...args) {
  const fn = providerPanelActions[name];
  if (typeof fn === 'function') return fn(...args);
  _warnProviderPanelDelegate(`Missing provider panel callback: ${name}`);
}

function _warnProviderPanelDelegate(message) {
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(message);
  }
}

function _closestProviderPanelEl(event, selector) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return null;
  const el = target.closest(selector);
  return el && el.closest(PROVIDER_PANEL_ROOTS) ? el : null;
}

function _handleProviderPanelClick(event) {
  const el = _closestProviderPanelEl(event, '[data-provider-panel-action]');
  if (!el) return;
  const action = el.dataset.providerPanelAction;
  const callbackName = CLICK_ACTIONS[action];

  if (!callbackName) return _warnProviderPanelDelegate(`Unknown provider panel click action: ${action}`);
  if (el.matches('a, button')) event.preventDefault();
  return _call(callbackName);
}

function _handleProviderPanelChange(event) {
  const el = _closestProviderPanelEl(event, '[data-provider-panel-change]');
  if (!el) return;
  const action = el.dataset.providerPanelChange;
  const pricingActions = MODEL_PRICING_ACTIONS[action];

  if (pricingActions) return _setModelAndPricing(pricingActions[0], pricingActions[1], el.value);
  if (action === 'venice-e2ee') return _call(CHANGE_ACTIONS[action], !!el.checked);
  if (CHANGE_ACTIONS[action]) return _call(CHANGE_ACTIONS[action], el.value);
  if (action === 'local-ai-model') {
    _call('setOllamaMainModel', el.value);
    return _call('refreshModelAdvisor');
  }
  return _warnProviderPanelDelegate(`Unknown provider panel change action: ${action}`);
}

function _handleProviderPanelKeydown(event) {
  if (event.key !== 'Enter') return;
  const el = _closestProviderPanelEl(event, '[data-provider-panel-key]');
  if (!el) return;
  const action = el.dataset.providerPanelKey;
  const callbackName = KEY_ACTIONS[action];

  if (!callbackName) return _warnProviderPanelDelegate(`Unknown provider panel key action: ${action}`);
  event.preventDefault();
  if (action === 'openrouter-custom-model') return _call(callbackName, el.value);
  return _call(callbackName);
}

function _setModelAndPricing(setterName, pricingName, value) {
  _call(setterName, value);
  return _call(pricingName, value);
}
