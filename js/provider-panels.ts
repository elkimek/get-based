import { createRoutstrAccountController } from './routstr-account-controller.js';
import { getChatBackend } from './agent-chat-settings.js';
import { getSelectedRoutstrNodeFromRuntime } from './provider-panel-renderers-runtime.js';
import { setAiSettingsEnabled } from './ai-settings-actions.js';
import { getAiSettingsView,setAiSettingsSelection } from './ai-settings-component.js';
import { disposeLocalAiSettings } from './local-ai-settings-component.js';
import { getCustomSettingsView, mountCustomSettings, disposeCustomSettings } from './custom-settings-component.js';
import { buildCustomSettingsSnapshot, buildCustomModelState } from './custom-settings-view.js';
import { createCustomSettingsController } from './custom-settings-controller.js';
import { getRoutstrSettingsView, disposeRoutstrSettings } from './routstr-settings-component.js';
import { getRoutstrModelSettingsView, disposeRoutstrModelSettings } from './routstr-model-settings-component.js';
// provider-panels.js - AI provider settings behavior, balance display, key validation, and wallet flows

import type { ProviderPanelOperations, ProviderPanelDependencies, ProviderPanelActionReader, ProviderPanelWalletOperations } from '../types/provider-panels.js';
import { disposePpqSettings } from './ppq-settings-component.js';
import { getVeniceSettingsView, mountVeniceSettings, disposeVeniceSettings } from './venice-settings-component.js';
import { buildVeniceSettingsSnapshot, veniceBalance } from './venice-settings-view.js';
import { saveVeniceSettingsKey, isVeniceKeySavePending } from './venice-key-controller.js';
import { getOpenRouterSettingsView, mountOpenRouterSettings, disposeOpenRouterSettings } from './openrouter-settings-component.js';
import { buildOpenRouterSettingsSnapshot, openRouterBalance } from './openrouter-settings-view.js';
import { saveOpenRouterSettingsKey, isOpenRouterKeySavePending } from './openrouter-key-controller.js';
import { getErrorMessage } from './caught-error.js';
import { showNotification } from './utils.js';
import {
  getAppExtensionAIInsufficientBalanceView,
  hasAppExtensionAIModelSurface,
  notifyAppExtensionAIModelsLoaded,
} from './app-extension-runtime.js';
import {
  getVeniceKey, saveVeniceKey, getOpenRouterKey, saveOpenRouterKey, getAIProvider, setAIProvider,
  validateVeniceKey, validateOpenRouterKey, fetchVeniceModels, fetchOpenRouterModels,
  getOpenRouterBalance, getVeniceBalance,
  getRoutstrKey, saveRoutstrKey,
  fetchRoutstrModels, validateRoutstrKey, createRoutstrAccount,
  clearVeniceE2EESession, hasAIProvider,
  setCustomApiModel, setOllamaMainModel, setPpqModel,
  getCustomApiUrl, getCustomApiKey, saveCustomApiConnection,
  fetchCustomApiModels, validateCustomApiKey,
  rememberOpenRouterOAuthPreviousProvider, clearOpenRouterOAuthSession, startOpenRouterOAuth
} from './api.js';
import { updateKeyCache } from './crypto.js';
import { openChatPanel } from './chat-loader.js';
import { loadFocusCard } from './focus-card.js';
import { showAiActionDialog } from './ai-action-dialog-component.js';
import { clearRoutstrModelCaches } from './routstr-model-cache.js';
import { installProviderPanelDelegates } from './provider-panel-delegates.js';
import { renderAIProviderPanel } from './provider-panel-renderers.js';
import {
  configureLocalAiControls, hydrateLocalAiSettings,
  initSettingsOllamaCheck,
  refreshModelAdvisor,
  testOllamaConnection,
} from './provider-local-ai-controls.js';
import {
  applyCustomApiManualModel,
  applyCustomOpenRouterModel,
  onOpenRouterDropdownChange, onRoutstrModelDropdownChange, onVeniceModelDropdownChange,
  refreshRoutstrPrivateControls, hydrateRoutstrModelSettings,
  renderOpenRouterModelDropdown,
  renderRoutstrModelDropdown,
  togglePpqPrivateMode,
  toggleRoutstrPrivateMode,
  toggleVeniceE2EE,
  updateCustomModelPricing,
  updatePpqModelPricing,
} from './provider-model-controls.js';
import {
  cancelPpqTopup,
  clearPpqTopupTimers,
  configurePpqPanels,
  copyPpqKeyReveal,
  copyPpqPayment,
  dismissPpqKeyReveal,
  handlePpqTopupPreset,
  handleCreatePpqAccount,
  handleRemovePpqKey,
  handleSavePpqKey,
  handleSelectPpqMethod,
  initSettingsPpqPanel,
  hydratePpqSettings,
  ppqShowCustomInput,
  refreshPpqBalance,
  showPpqTopup,
} from './provider-ppq-panels.js';
import {
  configureRoutstrWalletPanels, hydrateRoutstrSettings,
  clearRoutstrWalletTimers,
  startRoutstrFundingMonitor,
  refreshCashuWalletBalance,
  refreshWalletSeedStatus,
  refreshRoutstrBalance,
  showRoutstrMintEdit,
  _setActiveNodeAction,
  walletRuntime
} from './provider-wallet-panels.js';
function openProviderPanelExternal(...args: unknown[]) {
  const open = (globalThis as { open?: unknown }).open;
  return typeof open === 'function' ? (open as (...args: unknown[]) => unknown).apply(globalThis, args) : null;
}

function reloadProviderPanelPage() {
  const location = (globalThis as { location?: { reload?: unknown } }).location;
  if (typeof location?.reload === 'function') (location as { reload(): unknown }).reload();
}

const providerPanelDeps: ProviderPanelDependencies = {
  clearE2EESession: clearVeniceE2EESession,
  closeSettingsModal: () => {},
  hadProviderBeforeSettings: () => false,
  hasAIProvider,
  loadFocusCard,
  openChatPanel,
  openExternal: openProviderPanelExternal,
  openSettingsModal: () => {},
  reloadPage: reloadProviderPanelPage,
};

const providerPanelClipboardTimers = new Map<unknown, ReturnType<typeof setTimeout>>();

export function configureProviderPanelDeps(deps: unknown = {}) {
  const previous = { ...providerPanelDeps };
  for (const name of Object.keys(providerPanelDeps)) {
    if (typeof (deps as Record<string, unknown>)[name] === 'function') providerPanelDeps[name as keyof ProviderPanelDependencies] = (deps as Record<string, unknown>)[name];
  }
  return previous;
}

export { renderAIProviderPanel } from './provider-panel-renderers.js';
export {
  applyHardwareOverride,
  clearHardwareOverride,
  copyOllamaPullCmd,
  initSettingsOllamaCheck,
  refreshModelAdvisor,
  testOllamaConnection,
  testPIIOllamaConnection,
} from './provider-local-ai-controls.js';
export {
  applyCustomApiManualModel,
  applyCustomOpenRouterModel,
  onOpenRouterDropdownChange,
  onVeniceModelDropdownChange,
  renderCustomApiModelDropdown,
  renderOpenRouterModelDropdown,
  renderPpqModelDropdown,
  renderRoutstrModelDropdown,
  renderVeniceModelDropdown,
  togglePpqPrivateMode,
  toggleVeniceE2EE,
  updateCustomModelPricing,
  updateOpenRouterModelPricing,
  updatePpqModelPricing,
  updateRoutstrModelPricing,
  updateVeniceModelPricing,
} from './provider-model-controls.js';

export {
  cancelPpqTopup,
  dismissPpqKeyReveal,
  doPpqTopup,
  doPpqTopupCustom,
  handleCreatePpqAccount,
  handleRemovePpqKey,
  handleSavePpqKey,
  ppqShowCustomInput,
  refreshPpqBalance,
  selectPpqMethod,
  showPpqTopup,
} from './provider-ppq-panels.js';

export {
  refreshCashuWalletBalance,
  refreshRoutstrBalance,
  showRoutstrWalletFund,
  rsWalletFundCustomInput,
  doRoutstrWalletFundCustom,
  doRoutstrWalletFund,
  doRoutstrWalletReceiveCashu,
  showRoutstrMintEdit,
  doRoutstrMintChange,
  showRoutstrWalletBackup,
  showRoutstrNodePicker,
  connectRoutstrNode,
  doRoutstrNodeDeposit,
  doRoutstrNodeWithdraw,
  _setActiveNodeAction,
  walletSeedAcknowledged,
  setupRoutstrWalletSeed,
  showWalletSeedPhrase,
  showRoutstrWithdraw,
  showRoutstrWithdrawLightning,
  showRoutstrWithdrawToken,
  doRoutstrSendToken,
  doRoutstrWithdrawQuote,
  doRoutstrWithdrawExecute,
  doRoutstrWalletRestore
} from './provider-wallet-panels.js';

async function requestProviderActivation(provider: unknown, options: NonNullable<Parameters<typeof import('./cloud-ai-consent.js').requestAIProviderActivation>[1]> = {}) {
  const { requestAIProviderActivation } = await import('./cloud-ai-consent.js');
  return (requestAIProviderActivation as (provider: unknown, options: Parameters<typeof requestAIProviderActivation>[1]) => ReturnType<typeof requestAIProviderActivation>)(provider, options);
}

export function hydrateOpenRouterSettings(): void {
  const host = document.querySelector<HTMLElement>('[data-openrouter-settings-host]');
  if (!host) { disposeOpenRouterSettings(); return; }
  const existing = getOpenRouterSettingsView();
  const view = mountOpenRouterSettings(host, buildOpenRouterSettingsSnapshot());
  if (view !== existing) view.setStoredKey(getOpenRouterKey());
}

export function hydrateVeniceSettings(): void {
  const host = document.querySelector<HTMLElement>('[data-venice-settings-host]');
  if (!host) { disposeVeniceSettings(); return; }
  const existing = getVeniceSettingsView();
  const view = mountVeniceSettings(host, buildVeniceSettingsSnapshot());
  if (view !== existing) view.setStoredKey(getVeniceKey());
}
export function hydrateOwnedProviderSettings(): void {
  hydrateLocalAiSettings();
  hydrateCustomSettings();
  hydrateRoutstrSettings();
  hydrateOpenRouterSettings();
  hydrateVeniceSettings();
  hydratePpqSettings();
  hydrateRoutstrModelSettings();
}
function disposeOwnedProviderSettings(): void {
  disposeLocalAiSettings();
  disposeCustomSettings();
  disposeRoutstrSettings();
  disposeRoutstrModelSettings();
  disposeOpenRouterSettings();
  disposeVeniceSettings();
  disposePpqSettings();
}

// ═══════════════════════════════════════════════
// AI PAUSE / PROVIDER SWITCH
// ═══════════════════════════════════════════════
export function toggleAIPause(enabled: unknown) {
  setAiSettingsEnabled(enabled,() => (providerPanelDeps as ProviderPanelOperations).loadFocusCard());
}

let providerSwitchSequence = 0;
export async function switchAIProvider(provider: unknown, { previousProvider = getAIProvider(), isCurrent = () => true }: { previousProvider?: unknown; isCurrent?: () => boolean } = {}) {
  if (!isCurrent()) return false;
  const sequence = ++providerSwitchSequence;
  if (provider === 'openrouter' && previousProvider !== 'openrouter' && !getOpenRouterKey()) {
    (rememberOpenRouterOAuthPreviousProvider as (provider: unknown) => ReturnType<typeof rememberOpenRouterOAuthPreviousProvider>)(previousProvider);
  } else if (provider !== 'openrouter') {
    clearOpenRouterOAuthSession();
  }
  (setAIProvider as (provider: unknown) => ReturnType<typeof setAIProvider>)(provider);
  clearPpqTopupTimers();
  clearRoutstrWalletTimers();
  const panel = document.getElementById('ai-provider-panel');
  if (panel) { disposeOwnedProviderSettings(); panel.innerHTML = renderAIProviderPanel(provider); hydrateOwnedProviderSettings(); }
  setAiSettingsSelection(provider);
  getAiSettingsView()?.setProviderStatus('ready');
  initSettingsOllamaCheck();
  initSettingsModelFetch();
  if (provider !== previousProvider && provider !== 'ollama' && (hasAIProvider as (provider: unknown) => ReturnType<typeof hasAIProvider>)(provider)) {
    const activated = await requestProviderActivation(provider);
    if (sequence !== providerSwitchSequence || getAIProvider() !== provider) return false;
    if (!activated || !isCurrent()) {
      (setAIProvider as (provider: unknown) => ReturnType<typeof setAIProvider>)(previousProvider);
      const restoredPanel = isCurrent() ? document.getElementById('ai-provider-panel') : null;
      if (restoredPanel) { disposeOwnedProviderSettings(); restoredPanel.innerHTML = renderAIProviderPanel(previousProvider); hydrateOwnedProviderSettings(); }
      if (isCurrent()) setAiSettingsSelection(previousProvider);
      if (isCurrent()) showNotification('Provider was not changed because AI activation was not approved.', 'info');
      return false;
    }
  }
  return true;
}

// ═══════════════════════════════════════════════
// MODEL FETCH / BALANCE INIT
// ═══════════════════════════════════════════════
export function initSettingsModelFetch() {
  hydrateRoutstrSettings();
  hydrateRoutstrModelSettings();
  const orKey = getOpenRouterKey();
  const openRouterView = getOpenRouterSettingsView();
  const openRouterExtension = hasAppExtensionAIModelSurface('openrouter');
  if (orKey && (openRouterView || openRouterExtension)) {
    fetchOpenRouterModels(orKey).then(models => {
      if (getOpenRouterKey() !== orKey) return;
      if (openRouterView?.isCurrent() && models.length) renderOpenRouterModelDropdown(models);
      notifyAppExtensionAIModelsLoaded({ provider: 'openrouter', models });
    });
    void refreshOpenRouterBalance();
  }
  const veniceKey = getVeniceKey();
  const veniceView = getVeniceSettingsView();
  if (veniceKey && veniceView && getAIProvider() === 'venice') {
    fetchVeniceModels(veniceKey, { isCurrent: () => getVeniceKey() === veniceKey }).then(() => {
      if (veniceView.isCurrent() && getVeniceKey() === veniceKey && getAIProvider() === 'venice') veniceView.refresh(buildVeniceSettingsSnapshot());
    });
    void refreshVeniceBalance();
  }
  const rsKey = getRoutstrKey();
  if (rsKey && document.getElementById('routstr-model-area')) {
    const view = getRoutstrModelSettingsView(), provider = getAIProvider();
    fetchRoutstrModels({ isCurrent: () => !!view?.isCurrent() && getRoutstrKey() === rsKey && getAIProvider() === provider }).then(function(models) {
      if (!view?.isCurrent() || getRoutstrKey() !== rsKey) return;
      if (models.length) renderRoutstrModelDropdown(models);
      refreshRoutstrPrivateControls();
    });
    refreshRoutstrBalance();
  }
  if (getRoutstrSettingsView()) { startRoutstrFundingMonitor(); refreshWalletSeedStatus(); }
  initSettingsPpqPanel();
  const customUrl = getCustomApiUrl(), customKey = getCustomApiKey(), customView = getCustomSettingsView();
  if (customUrl && customKey && customView && getAIProvider() === 'custom') {
    const current = () => customView.isCurrent() && getAIProvider() === 'custom' && getCustomApiUrl() === customUrl && getCustomApiKey() === customKey;
    void fetchCustomApiModels(customUrl, customKey, { isCurrent: current }).then(models => { if (current() && models.length) customView.setModels(buildCustomModelState(models)); });
  }
}


// ═══════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════
/** After a successful key save, auto-close settings and return to chat if we came from onboarding. */
function _returnToChatIfOnboarding() {
  if ((providerPanelDeps as ProviderPanelOperations).hadProviderBeforeSettings()) return; // already had a provider — user is just reconfiguring
  if (!(providerPanelDeps as ProviderPanelOperations).hasAIProvider()) return;
  (providerPanelDeps as ProviderPanelOperations).closeSettingsModal();
  setTimeout(() => (providerPanelDeps as ProviderPanelOperations).openChatPanel(), 300);
}

function _setActionText(actionEl: unknown) {
  if (actionEl instanceof HTMLElement) {
    actionEl.textContent = actionEl.dataset.copiedText || '✓ Copied';
  }
}

function _clipboardTextFromAction(actionEl: unknown) {
  return (actionEl as ProviderPanelActionReader | null | undefined)?.dataset?.clipboardText || (actionEl as ProviderPanelActionReader | null | undefined)?.dataset?.token || '';
}

async function _copyProviderPanelText(text: unknown, actionEl: unknown) {
  if (!text) return;
  try {
    await (navigator.clipboard.writeText as (text: unknown) => Promise<void>)(text);
    _setActionText(actionEl);
    const timerKey = (actionEl as ProviderPanelActionReader | null | undefined)?.dataset?.clearTimerKey || '';
    const clearMs = Number((actionEl as ProviderPanelActionReader | null | undefined)?.dataset?.clearClipboardAfter || 0);
    if (timerKey && clearMs > 0) {
      clearTimeout(providerPanelClipboardTimers.get(timerKey));
      const timer = setTimeout(() => {
        providerPanelClipboardTimers.delete(timerKey);
        navigator.clipboard?.writeText?.('');
      }, clearMs);
      providerPanelClipboardTimers.set(timerKey, timer);
    }
  } catch (e) {
    showNotification(`Copy failed: ${getErrorMessage(e, e)}`, 'error');
  }
}

export function copyProviderPanelClipboard(actionEl: unknown) {
  void _copyProviderPanelText(_clipboardTextFromAction(actionEl), actionEl);
}

export function selectProviderPanelText(actionEl: unknown) {
  if (typeof (actionEl as ProviderPanelActionReader | null | undefined)?.select === 'function') (actionEl as { select(): unknown }).select();
}

async function _recoverPendingToken(actionEl: unknown, clearName: 'cashuClearPendingDeposit' | 'cashuClearPendingWithdraw') {
  const fallbackInput = /** @type {HTMLTextAreaElement | null} */ (
    document.querySelector('#routstr-wallet-fund-area textarea')
  ) as HTMLTextAreaElement | null;
  const token = (actionEl as ProviderPanelActionReader | null | undefined)?.dataset?.token || fallbackInput?.value || '';
  try {
    const clearPendingToken = walletRuntime[clearName];
    if (typeof walletRuntime.cashuReceiveToken !== 'function' || typeof clearPendingToken !== 'function') {
      throw new Error('Wallet recovery is unavailable');
    }
    await (walletRuntime as unknown as ProviderPanelWalletOperations).cashuReceiveToken(token);
    await (clearPendingToken as () => unknown)();
    showNotification('Recovered!', 'success');
    (providerPanelDeps as ProviderPanelOperations).reloadPage();
  } catch (e) {
    showNotification(getErrorMessage(e, String(e)), 'error');
  }
}

export function recoverPendingDeposit(actionEl: unknown) {
  void _recoverPendingToken(actionEl, 'cashuClearPendingDeposit');
}

export function recoverPendingWithdraw(actionEl: unknown) {
  void _recoverPendingToken(actionEl, 'cashuClearPendingWithdraw');
}

export function acknowledgeRoutstrKey(): void { routstrAccount.acknowledge(); }

// ═══════════════════════════════════════════════
// VENICE HANDLERS
// ═══════════════════════════════════════════════
const veniceBalanceReads = new WeakMap<object, number>();
export async function refreshVeniceBalance(): Promise<void> {
  const view = getVeniceSettingsView();
  if (!view || getAIProvider() !== 'venice') return;
  const key = getVeniceKey();
  const sequence = (veniceBalanceReads.get(view) || 0) + 1;
  veniceBalanceReads.set(view, sequence);
  const current = () => view.isCurrent() && getAIProvider() === 'venice' && getVeniceKey() === key && veniceBalanceReads.get(view) === sequence;
  view.setBalance({ text: 'Balance: refreshing...', tone: 'secondary' });
  try {
    const balance = await getVeniceBalance();
    if (current()) view.setBalance(veniceBalance(balance));
  } catch {
    if (current()) view.setBalance({ text: 'Balance: unavailable', tone: 'secondary' });
  }
}
export async function handleSaveVeniceKey(): Promise<void> {
  await saveVeniceSettingsKey(getVeniceSettingsView(), {
    currentProvider: getAIProvider,
    currentKey: getVeniceKey,
    validate: validateVeniceKey,
    activate: () => requestProviderActivation('venice'),
    save: saveVeniceKey,
    loadModels: key => fetchVeniceModels(key, { isCurrent: () => getVeniceKey() === key }),
    snapshot: buildVeniceSettingsSnapshot,
    committed: () => { showNotification('Venice API key saved', 'success'); _returnToChatIfOnboarding(); },
  });
}

export function handleRemoveVeniceKey() {
  if (isVeniceKeySavePending()) return;
  localStorage.removeItem('labcharts-venice-key');
  updateKeyCache('labcharts-venice-key', null);
  localStorage.removeItem('labcharts-venice-models');
  localStorage.removeItem('labcharts-venice-models-fetched-at');
  localStorage.removeItem('labcharts-venice-model');
  localStorage.removeItem('labcharts-venice-e2ee');
  localStorage.removeItem('labcharts-venice-e2ee-models');
  localStorage.removeItem('labcharts-venice-model-regular');
  localStorage.removeItem('labcharts-venice-model-e2ee');
  (providerPanelDeps as ProviderPanelOperations).clearE2EESession();
  showNotification('Venice API key removed', 'info');
  (providerPanelDeps as ProviderPanelOperations).openSettingsModal();
}


// ═══════════════════════════════════════════════
// OPENROUTER HANDLERS
// ═══════════════════════════════════════════════
export async function handleSaveOpenRouterKey(): Promise<void> {
  await saveOpenRouterSettingsKey(getOpenRouterSettingsView(), {
    currentProvider: getAIProvider,
    currentKey: getOpenRouterKey,
    validate: validateOpenRouterKey,
    activate: () => requestProviderActivation('openrouter'),
    save: saveOpenRouterKey,
    loadModels: fetchOpenRouterModels,
    snapshot: buildOpenRouterSettingsSnapshot,
    clearOAuth: clearOpenRouterOAuthSession,
    committed: () => { showNotification('OpenRouter API key saved', 'success'); _returnToChatIfOnboarding(); },
  });
}

export function handleRemoveOpenRouterKey() {
  if (isOpenRouterKeySavePending()) return;
  localStorage.removeItem('labcharts-openrouter-key');
  updateKeyCache('labcharts-openrouter-key', null);
  localStorage.removeItem('labcharts-openrouter-models');
  localStorage.removeItem('labcharts-openrouter-model');
  localStorage.removeItem('labcharts-openrouter-pricing');
  showNotification('OpenRouter API key removed', 'info');
  (providerPanelDeps as ProviderPanelOperations).openSettingsModal();
}

const openRouterBalanceReads = new WeakMap<object, number>();
export async function refreshOpenRouterBalance(): Promise<void> {
  const view = getOpenRouterSettingsView();
  if (!view) return;
  const key = getOpenRouterKey();
  const sequence = (openRouterBalanceReads.get(view) || 0) + 1;
  openRouterBalanceReads.set(view, sequence);
  view.setBalance({ text: 'Balance: refreshing...', tone: 'secondary' });
  try {
    const balance = await getOpenRouterBalance();
    if (view.isCurrent() && getOpenRouterKey() === key && openRouterBalanceReads.get(view) === sequence) view.setBalance(openRouterBalance(balance?.remaining));
  } catch {
    if (view.isCurrent() && getOpenRouterKey() === key && openRouterBalanceReads.get(view) === sequence) view.setBalance({ text: 'Balance: unavailable', tone: 'secondary' });
  }
}

// Persistent modal shown when an OpenRouter API call returns 402 (out of
// credit). Previously this surfaced as a toast that vanished in seconds
// and left the user stuck. Single actionable path: add credits via OR's
// settings page in a new tab. The "switch to a free model" branch was
// removed — OpenRouter's free tier has no vision-capable models so
// image-mode imports broke silently, and the privacy story (free
// providers log + may train on prompts) is bad for medical data.
export function showInsufficientBalanceDialog() {
  const extensionView = getAppExtensionAIInsufficientBalanceView({ provider: 'openrouter' });
  showAiActionDialog({
    overlayId: 'or-no-balance-overlay',
    ariaLabel: String(extensionView?.ariaLabel || 'OpenRouter balance empty'),
    title: String(extensionView?.title || 'Your OpenRouter balance is empty'),
    description: String(extensionView?.description || 'Add credits at OpenRouter to keep using AI. $10 covers weeks of typical use — chat, lab interpretation, and PDF imports.'),
    options: [{
      id: 'or-add-credits', icon: '💳', recommended: true,
      label: String(extensionView?.primaryLabel || 'Add credits at openrouter.ai'),
      description: String(extensionView?.primaryDescription || 'Opens in a new tab. Come back to getbased when done — the page picks up automatically.'),
    }],
    cancelId: 'or-nb-cancel',
  }, () => {
    if (typeof extensionView?.onPrimary === 'function') return extensionView.onPrimary();
    return (providerPanelDeps as ProviderPanelOperations).openExternal('https://openrouter.ai/settings/credits', '_blank', 'noopener');
  });
}

// ─── Routstr mode toggle ───
// Direct mode removed — wallet-only

// ─── Routstr handlers ───
const routstrAccount = createRoutstrAccountController({
  view: getRoutstrSettingsView, provider: getAIProvider, backend: getChatBackend,
  node: () => getSelectedRoutstrNodeFromRuntime() || '', key: getRoutstrKey,
  validate: validateRoutstrKey, activate: () => requestProviderActivation('routstr'),
  save: saveRoutstrKey, redeem: createRoutstrAccount,
  models: async current => { const models = await fetchRoutstrModels({ isCurrent: current }); if (current() && models.length) renderRoutstrModelDropdown(models); },
  connected: warning => { showNotification(warning || 'Routstr key saved', warning ? 'info' : 'success'); _returnToChatIfOnboarding(); },
  removed: () => { clearRoutstrModelCaches(); hydrateRoutstrModelSettings(); showNotification('Routstr key removed', 'info'); (providerPanelDeps as ProviderPanelOperations).openSettingsModal(); },
  writeClipboard: value => navigator.clipboard.writeText(value),
  scheduleClear: clear => { const name = '_rsClipTimer'; const previous = providerPanelClipboardTimers.get(name); if (previous) clearTimeout(previous); providerPanelClipboardTimers.set(name, setTimeout(clear, 60000)); },
});
export function handleSaveRoutstrKey(): Promise<void> { return routstrAccount.save(); }
export function handleRemoveRoutstrKey(): Promise<void> { return routstrAccount.remove(); }

// Custom API save/remove share one lifecycle across Settings replacements.
const customSettings = createCustomSettingsController();
const customServices = {
  provider: getAIProvider, url: getCustomApiUrl, key: getCustomApiKey,
  validate: validateCustomApiKey,
  activate: (url: string) => requestProviderActivation('custom', { endpoint: url }),
  persist: saveCustomApiConnection,
  load: (url: string, key: string, isCurrent: () => boolean) => fetchCustomApiModels(url, key, { isCurrent }),
  snapshot: buildCustomSettingsSnapshot, notify: showNotification,
};
export function handleSaveCustomApi(): Promise<void> { return customSettings.save(getCustomSettingsView(), customServices); }
export function handleRemoveCustomApi(): Promise<void> { return customSettings.remove(getCustomSettingsView(), customServices); }
export function hydrateCustomSettings(): void {
  const host = document.querySelector<HTMLElement>('#ai-provider-panel [data-custom-settings-host]');
  if (!host) { disposeCustomSettings(); return; }
  const previous = getCustomSettingsView();
  const view = mountCustomSettings(host, buildCustomSettingsSnapshot(), {
    save: handleSaveCustomApi, remove: handleRemoveCustomApi,
    select: model => { if (!customSettings.isPending() && getAIProvider() === 'custom') { setCustomApiModel(model); view.setModels(buildCustomModelState()); } },
    apply: () => { if (!customSettings.isPending()) applyCustomApiManualModel(); },
  });
  if (view !== previous) view.setConnection({ url: getCustomApiUrl(), key: getCustomApiKey() });
}

configureLocalAiControls({
  requestProviderActivation,
  returnToChatIfOnboarding: _returnToChatIfOnboarding
});

configurePpqPanels({
  requestProviderActivation,
  returnToChatIfOnboarding: _returnToChatIfOnboarding
});

configureRoutstrWalletPanels({
  account: { save: handleSaveRoutstrKey, remove: handleRemoveRoutstrKey, copy: () => routstrAccount.copy(), acknowledge: acknowledgeRoutstrKey },
  renderAIProviderPanel,
  renderRoutstrModelDropdown,
  initSettingsModelFetch,
  hydrateRoutstrSettings,
  hydrateRoutstrModelSettings,
  requestProviderActivation,
  returnToChatIfOnboarding: _returnToChatIfOnboarding
});

installProviderPanelDelegates({
  startOpenRouterOAuth,
  handleSaveOpenRouterKey,
  handleRemoveOpenRouterKey,
  refreshOpenRouterBalance,
  refreshCashuWalletBalance,
  showRoutstrMintEdit,
  refreshRoutstrBalance,
  handleSaveVeniceKey,
  handleRemoveVeniceKey,
  refreshVeniceBalance,
  refreshPpqBalance,
  showPpqTopup,
  handleCreatePpqAccount,
  handleSavePpqKey,
  handleRemovePpqKey,
  copyPpqKeyReveal,
  dismissPpqKeyReveal,
  handleSelectPpqMethod,
  handlePpqTopupPreset,
  ppqShowCustomInput,
  copyPpqPayment,
  cancelPpqTopup,
  recoverPendingDeposit,
  recoverPendingWithdraw,
  copyProviderPanelClipboard,
  selectProviderPanelText,
  acknowledgeRoutstrKey,
  applyCustomApiManualModel,
  handleSaveCustomApi,
  handleRemoveCustomApi,
  testOllamaConnection,
  onOpenRouterDropdownChange,
  onRoutstrModelDropdownChange,
  onVeniceModelDropdownChange,
  toggleVeniceE2EE,
  toggleRoutstrPrivateMode,
  togglePpqPrivateMode,
  setPpqModel,
  updatePpqModelPricing,
  setCustomApiModel,
  updateCustomModelPricing,
  setOllamaMainModel,
  refreshModelAdvisor,
  applyCustomOpenRouterModel
});
