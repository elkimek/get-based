// provider-panel-delegates.js - Delegated AI provider settings panel actions


// Registry values remain opaque until the original callable guard. Object.assign
// permits callback replacement and explicit undefined without changing dispatch.
export type ProviderPanelActionRegistry = Record<string, unknown>;
interface ProviderPanelElement {
  dataset: DOMStringMap;
  closest(selector: string): unknown;
  matches(selector: string): boolean;
  value?: unknown;
  checked?: unknown;
}
type ClosestTarget = EventTarget & { closest?: unknown };
type CallbackResult = NonNullable<unknown> | null | undefined | void;
type ActionMapReader = Readonly<Record<string, unknown>>;

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
  'copy-ppq-key-reveal': 'copyPpqKeyReveal',
  'dismiss-ppq-key-reveal': 'dismissPpqKeyReveal',
  'select-ppq-method': 'handleSelectPpqMethod',
  'ppq-topup-preset': 'handlePpqTopupPreset',
  'show-ppq-custom-input': 'ppqShowCustomInput',
  'copy-ppq-payment': 'copyPpqPayment',
  'cancel-ppq-topup': 'cancelPpqTopup',
  'recover-pending-deposit': 'recoverPendingDeposit',
  'recover-pending-withdraw': 'recoverPendingWithdraw',
  'copy-provider-panel-clipboard': 'copyProviderPanelClipboard',
  'select-provider-panel-text': 'selectProviderPanelText',
  'acknowledge-routstr-key': 'acknowledgeRoutstrKey',
  'apply-custom-api-model': 'applyCustomApiManualModel',
  'save-custom-api': 'handleSaveCustomApi',
  'remove-custom-api': 'handleRemoveCustomApi',
  'test-ollama-connection': 'testOllamaConnection'
});

const CHANGE_ACTIONS = Object.freeze({
  'openrouter-model': 'onOpenRouterDropdownChange',
  'routstr-model': 'onRoutstrModelDropdownChange',
  'venice-model': 'onVeniceModelDropdownChange',
  'venice-e2ee': 'toggleVeniceE2EE',
  'routstr-private-mode': 'toggleRoutstrPrivateMode',
  'ppq-private-mode': 'togglePpqPrivateMode'
});

const MODEL_PRICING_ACTIONS = Object.freeze({
  'ppq-model': ['setPpqModel', 'updatePpqModelPricing'],
  'custom-model': ['setCustomApiModel', 'updateCustomModelPricing']
});

const KEY_ACTIONS = Object.freeze({
  'openrouter-custom-model': 'applyCustomOpenRouterModel',
  'custom-manual-model': 'applyCustomApiManualModel'
});

let providerPanelDelegatesInstalled = false;
let providerPanelActions: ProviderPanelActionRegistry = {};

export function installProviderPanelDelegates(actions: ProviderPanelActionRegistry = {}) {
  Object.assign(providerPanelActions, actions);
  if (providerPanelDelegatesInstalled || typeof document === 'undefined') return;
  providerPanelDelegatesInstalled = true;
  document.addEventListener('click', _handleProviderPanelClick);
  document.addEventListener('change', _handleProviderPanelChange);
  document.addEventListener('keydown', _handleProviderPanelKeydown);
}

function _call(name: unknown, ...args: unknown[]): CallbackResult {
  const fn = providerPanelActions[name as string];
  if (typeof fn === 'function') return (fn as (...args: unknown[]) => CallbackResult)(...args);
  _warnProviderPanelDelegate(`Missing provider panel callback: ${name}`);
}

function _warnProviderPanelDelegate(message: string) {
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(message);
  }
}

function _closestProviderPanelEl(event: Event, selector: string) {
  const target = event.target as ClosestTarget | null;
  if (!target || typeof target.closest !== 'function') return null;
  const el = (target.closest as (selector: string) => ProviderPanelElement | null)(selector);
  return el && el.closest(PROVIDER_PANEL_ROOTS) ? el : null;
}

function _handleProviderPanelClick(event: Event): CallbackResult {
  const el = _closestProviderPanelEl(event, '[data-provider-panel-action]');
  if (!el) return;
  const action = el.dataset.providerPanelAction;
  const callbackName = (CLICK_ACTIONS as ActionMapReader)[action as string];

  if (!callbackName) return _warnProviderPanelDelegate(`Unknown provider panel click action: ${action}`);
  if (el.matches('a, button')) event.preventDefault();
  return _call(callbackName, el);
}

function _handleProviderPanelChange(event: Event): CallbackResult {
  const el = _closestProviderPanelEl(event, '[data-provider-panel-change]');
  if (!el) return;
  const action = el.dataset.providerPanelChange;
  const pricingActions = (MODEL_PRICING_ACTIONS as ActionMapReader)[action as string];

  if (pricingActions) return _setModelAndPricing((pricingActions as { [index: number]: unknown })[0], (pricingActions as { [index: number]: unknown })[1], el.value);
  if (action === 'venice-e2ee' || action === 'routstr-private-mode' || action === 'ppq-private-mode') return _call((CHANGE_ACTIONS as ActionMapReader)[action as string], !!el.checked);
  if ((CHANGE_ACTIONS as ActionMapReader)[action as string]) return _call((CHANGE_ACTIONS as ActionMapReader)[action as string], el.value);
  if (action === 'local-ai-model') {
    _call('setOllamaMainModel', el.value);
    return _call('refreshModelAdvisor');
  }
  return _warnProviderPanelDelegate(`Unknown provider panel change action: ${action}`);
}

function _handleProviderPanelKeydown(event: KeyboardEvent): CallbackResult {
  if (event.key !== 'Enter') return;
  const el = _closestProviderPanelEl(event, '[data-provider-panel-key]');
  if (!el) return;
  const action = el.dataset.providerPanelKey;
  const callbackName = (KEY_ACTIONS as ActionMapReader)[action as string];

  if (!callbackName) return _warnProviderPanelDelegate(`Unknown provider panel key action: ${action}`);
  event.preventDefault();
  if (action === 'openrouter-custom-model') return _call(callbackName, el.value);
  return _call(callbackName);
}

function _setModelAndPricing(setterName: unknown, pricingName: unknown, value: unknown): CallbackResult {
  _call(setterName, value);
  return _call(pricingName, value);
}
