// provider-panel-delegates.js - Delegated AI provider settings panel actions

const PROVIDER_PANEL_ROOTS = '#ai-provider-panel';

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
  if (el.matches('a, button')) event.preventDefault();
  const action = el.dataset.providerPanelAction;

  if (action === 'start-openrouter-oauth') return _call('startOpenRouterOAuth');
  if (action === 'save-openrouter-key') return _call('handleSaveOpenRouterKey');
  if (action === 'remove-openrouter-key') return _call('handleRemoveOpenRouterKey');
  if (action === 'refresh-openrouter-balance') return _call('refreshOpenRouterBalance');
  if (action === 'refresh-cashu-wallet-balance') return _call('refreshCashuWalletBalance');
  if (action === 'show-routstr-mint-edit') return _call('showRoutstrMintEdit');
  if (action === 'refresh-routstr-balance') return _call('refreshRoutstrBalance');
  if (action === 'save-venice-key') return _call('handleSaveVeniceKey');
  if (action === 'remove-venice-key') return _call('handleRemoveVeniceKey');
  if (action === 'refresh-venice-balance') return _call('refreshVeniceBalance');
  if (action === 'refresh-ppq-balance') return _call('refreshPpqBalance');
  if (action === 'show-ppq-topup') return _call('showPpqTopup');
  if (action === 'create-ppq-account') return _call('handleCreatePpqAccount');
  if (action === 'save-ppq-key') return _call('handleSavePpqKey');
  if (action === 'remove-ppq-key') return _call('handleRemovePpqKey');
  if (action === 'apply-custom-api-model') return _call('applyCustomApiManualModel');
  if (action === 'save-custom-api') return _call('handleSaveCustomApi');
  if (action === 'remove-custom-api') return _call('handleRemoveCustomApi');
  if (action === 'test-ollama-connection') return _call('testOllamaConnection');
}

function _handleProviderPanelChange(event) {
  const el = _closestProviderPanelEl(event, '[data-provider-panel-change]');
  if (!el) return;
  const action = el.dataset.providerPanelChange;

  if (action === 'openrouter-model') return _call('onOpenRouterDropdownChange', el.value);
  if (action === 'routstr-model') return _setModelAndPricing('setRoutstrModel', 'updateRoutstrModelPricing', el.value);
  if (action === 'venice-model') return _call('onVeniceModelDropdownChange', el.value);
  if (action === 'venice-e2ee') return _call('toggleVeniceE2EE', !!el.checked);
  if (action === 'ppq-model') return _setModelAndPricing('setPpqModel', 'updatePpqModelPricing', el.value);
  if (action === 'custom-model') return _setModelAndPricing('setCustomApiModel', 'updateCustomModelPricing', el.value);
  if (action === 'local-ai-model') {
    _call('setOllamaMainModel', el.value);
    return _call('refreshModelAdvisor');
  }
}

function _handleProviderPanelKeydown(event) {
  if (event.key !== 'Enter') return;
  const el = _closestProviderPanelEl(event, '[data-provider-panel-key]');
  if (!el) return;
  event.preventDefault();
  const action = el.dataset.providerPanelKey;

  if (action === 'openrouter-custom-model') return _call('applyCustomOpenRouterModel', el.value);
  if (action === 'custom-manual-model') return _call('applyCustomApiManualModel');
}

function _setModelAndPricing(setterName, pricingName, value) {
  _call(setterName, value);
  return _call(pricingName, value);
}
