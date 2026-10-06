// provider-panels.js - AI provider settings behavior, balance display, key validation, and wallet flows

import type { ProviderPanelOperations, ProviderPanelDependencies, ProviderPanelActionReader, ProviderPanelWalletOperations } from '../types/provider-panels.js';
import { getVeniceSettingsView, mountVeniceSettings, disposeVeniceSettings } from './venice-settings-component.js';
import { buildVeniceSettingsSnapshot, veniceBalance } from './venice-settings-view.js';
import { saveVeniceSettingsKey, isVeniceKeySavePending } from './venice-key-controller.js';
import { getOpenRouterSettingsView, mountOpenRouterSettings, disposeOpenRouterSettings } from './openrouter-settings-component.js';
import { buildOpenRouterSettingsSnapshot, openRouterBalance } from './openrouter-settings-view.js';
import { saveOpenRouterSettingsKey, isOpenRouterKeySavePending } from './openrouter-key-controller.js';
import { getErrorMessage } from './caught-error.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
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
  setAIPaused,
  setCustomApiModel, setOllamaMainModel, setPpqModel,
  getCustomApiUrl, setCustomApiUrl, getCustomApiKey, saveCustomApiKey,
  fetchCustomApiModels, validateCustomApiKey,
  rememberOpenRouterOAuthPreviousProvider, clearOpenRouterOAuthSession, startOpenRouterOAuth
} from './api.js';
import { updateKeyCache, encryptedSetItem } from './crypto.js';
import { openChatPanel } from './chat-loader.js';
import { loadFocusCard } from './focus-card.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { clearRoutstrModelCaches } from './routstr-model-cache.js';
import { installProviderPanelDelegates } from './provider-panel-delegates.js';
import { renderAIProviderPanel } from './provider-panel-renderers.js';
import {
  configureLocalAiControls,
  initSettingsOllamaCheck,
  refreshModelAdvisor,
  testOllamaConnection,
} from './provider-local-ai-controls.js';
import {
  applyCustomApiManualModel,
  applyCustomOpenRouterModel,
  onOpenRouterDropdownChange, onRoutstrModelDropdownChange, onVeniceModelDropdownChange,
  refreshRoutstrPrivateControls,
  renderCustomApiModelDropdown,
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
  ppqShowCustomInput,
  refreshPpqBalance,
  showPpqTopup,
} from './provider-ppq-panels.js';
import {
  configureRoutstrWalletPanels,
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
  hydrateOpenRouterSettings();
  hydrateVeniceSettings();
}
function disposeOwnedProviderSettings(): void {
  disposeOpenRouterSettings();
  disposeVeniceSettings();
}

// ═══════════════════════════════════════════════
// AI PAUSE / PROVIDER SWITCH
// ═══════════════════════════════════════════════
export function toggleAIPause(enabled: unknown) {
  setAIPaused(!enabled);
  showNotification(enabled ? 'AI features enabled' : 'AI features paused', 'info');
  // Refresh focus card — show cached content when paused, fetch new when enabled
  (providerPanelDeps as ProviderPanelOperations).loadFocusCard();
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
  const modal = document.getElementById('settings-modal');
  if (modal) {
    modal.querySelectorAll('.ai-provider-btn').forEach(btn => {
      const providerBtn = /** @type {HTMLElement} */ (btn) as HTMLElement;
      providerBtn.classList.toggle('active', providerBtn.dataset.provider === provider);
    });
  }
  initSettingsOllamaCheck();
  initSettingsModelFetch();
  if (provider !== previousProvider && provider !== 'ollama' && (hasAIProvider as (provider: unknown) => ReturnType<typeof hasAIProvider>)(provider)) {
    const activated = await requestProviderActivation(provider);
    if (sequence !== providerSwitchSequence || getAIProvider() !== provider) return false;
    if (!activated || !isCurrent()) {
      (setAIProvider as (provider: unknown) => ReturnType<typeof setAIProvider>)(previousProvider);
      const restoredPanel = isCurrent() ? document.getElementById('ai-provider-panel') : null;
      if (restoredPanel) { disposeOwnedProviderSettings(); restoredPanel.innerHTML = renderAIProviderPanel(previousProvider); hydrateOwnedProviderSettings(); }
      if (isCurrent()) modal?.querySelectorAll('.ai-provider-btn').forEach(btn => {
        const providerBtn = /** @type {HTMLElement} */ (btn) as HTMLElement;
        providerBtn.classList.toggle('active', providerBtn.dataset.provider === previousProvider);
      });
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
    fetchRoutstrModels().then(function(models) {
      if (models.length) renderRoutstrModelDropdown(models);
      refreshRoutstrPrivateControls();
    });
    refreshRoutstrBalance();
  }
  // Cashu wallet balance + mint label + pending recovery (always, even without node connection)
  if (document.getElementById('routstr-wallet-balance') && typeof walletRuntime.cashuGetBalance === 'function') {
    startRoutstrFundingMonitor();
    (walletRuntime as unknown as ProviderPanelWalletOperations).cashuGetBalance().then(function(bal) {
      const el = document.getElementById('routstr-wallet-balance');
      if (el) el.textContent = '\u26a1 ' + bal.toLocaleString() + ' sats';
    });
    refreshWalletSeedStatus();
    if (typeof walletRuntime.cashuGetMintUrl === 'function') Promise.resolve((walletRuntime as unknown as ProviderPanelWalletOperations).cashuGetMintUrl()).then(function(url) {
      const el = document.getElementById('routstr-mint-label');
      if (el && url) el.textContent = (url as { replace(pattern: RegExp, value: string): { replace(pattern: RegExp, value: string): unknown } }).replace(/^https?:\/\//, '').replace(/\/$/, '') as string;
    });
    // H6: Check for pending deposit recovery
    if (typeof walletRuntime.cashuRecoverPendingDeposit === 'function') (walletRuntime as unknown as ProviderPanelWalletOperations).cashuRecoverPendingDeposit().then(function(token) {
      if (!token) return;
      const area = document.getElementById('routstr-wallet-fund-area');
      if (area) {
        area.style.display = 'block';
        area.innerHTML = '<div style="margin-top:8px;padding:8px;background:rgba(255,160,0,0.1);border:1px solid var(--yellow, #f0a800);border-radius:6px">' +
          '<div style="font-size:11px;color:var(--yellow, #f0a800);margin-bottom:4px">\u26a0 Pending deposit recovery</div>' +
          '<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">A previous node deposit has an unconfirmed outcome. This token may be unspent. Reconcile the node account before reclaiming it:</div>' +
          '<textarea class="api-key-input" style="font-size:10px;font-family:monospace;height:40px;resize:none;user-select:all" readonly data-provider-panel-action="select-provider-panel-text">' + escapeHTML(token) + '</textarea>' +
          '<div style="display:flex;gap:4px;margin-top:4px">' +
          '<button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;flex:1" data-provider-panel-action="recover-pending-deposit" data-token="' + escapeAttr(token) + '">Recover to Wallet</button>' +
          '<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px" data-provider-panel-action="copy-provider-panel-clipboard" data-clipboard-text="' + escapeAttr(token) + '" data-copied-text="\u2713 Copied">Copy Token</button>' +
          '</div></div>';
      }
    });
    const pendingRefundArea = document.getElementById('routstr-node-picker');
    (walletRuntime.cashuGetPendingNodeRefund as ProviderPanelWalletOperations['cashuGetPendingNodeRefund'])?.().then(function(refund) {
      if (!refund) return;
      const area = pendingRefundArea;
      if (!area || area !== document.getElementById('routstr-node-picker') || area.dataset.mode) return;
      area.dataset.mode = 'refund-notice';
      area.style.display = 'block';
      area.innerHTML = '<div>Saved refund for this node: ' + escapeHTML(refund.nodeUrl) + '</div><button class="import-btn import-btn-primary" data-routstr-wallet-action="saved-node-refunds" data-node-url="' + escapeAttr(refund.nodeUrl) + '">Check refund recovery</button>';
    }).catch(() => {});
    // Check for pending withdraw recovery
    if (typeof walletRuntime.cashuRecoverPendingWithdraw === 'function') (walletRuntime as unknown as ProviderPanelWalletOperations).cashuRecoverPendingWithdraw().then(function(token) {
      if (!token) return;
      const area = document.getElementById('routstr-wallet-fund-area');
      if (!area || area.style.display === 'block') return; // don't overwrite deposit recovery
      area.style.display = 'block';
      area.innerHTML = '<div style="margin-top:8px;padding:8px;background:rgba(255,160,0,0.1);border:1px solid var(--yellow, #f0a800);border-radius:6px">' +
        '<div style="font-size:11px;color:var(--yellow, #f0a800);margin-bottom:4px">\u26a0 Pending withdraw recovery</div>' +
        '<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">An outgoing transfer needs reconciliation. Check its payment status or contact its recipient before reclaiming this token:</div>' +
        '<textarea class="api-key-input" style="font-size:10px;font-family:monospace;height:40px;resize:none;user-select:all" readonly data-provider-panel-action="select-provider-panel-text">' + escapeHTML(token) + '</textarea>' +
        '<div style="display:flex;gap:4px;margin-top:4px">' +
        '<button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;flex:1" data-provider-panel-action="recover-pending-withdraw" data-token="' + escapeAttr(token) + '">Recover to Wallet</button>' +
        '<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px" data-provider-panel-action="copy-provider-panel-clipboard" data-clipboard-text="' + escapeAttr(token) + '" data-copied-text="\u2713 Copied">Copy Token</button>' +
        '</div></div>';
    });
  }
  initSettingsPpqPanel();
  const customUrl = getCustomApiUrl();
  const customKey = getCustomApiKey();
  if (customUrl && customKey && document.getElementById('custom-model-area')) {
    fetchCustomApiModels(customUrl, customKey).then(function(models) {
      if (models.length) renderCustomApiModelDropdown(models);
    });
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

export function acknowledgeRoutstrKey() {
  const panel = document.getElementById('ai-provider-panel');
  if (panel) panel.innerHTML = renderAIProviderPanel('routstr');
  initSettingsModelFetch();
}

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
  let overlay = document.getElementById('or-no-balance-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'or-no-balance-overlay';
    overlay.className = 'confirm-overlay';
    document.body.appendChild(overlay);
  }
  const extensionView = getAppExtensionAIInsufficientBalanceView({ provider: 'openrouter' });
  const title = extensionView?.title || 'Your OpenRouter balance is empty';
  const description = extensionView?.description || 'Add credits at OpenRouter to keep using AI. $10 covers weeks of typical use — chat, lab interpretation, and PDF imports.';
  const primaryLabel = extensionView?.primaryLabel || 'Add credits at openrouter.ai';
  const primaryDescription = extensionView?.primaryDescription || 'Opens in a new tab. Come back to getbased when done — the page picks up automatically.';
  overlay.innerHTML = '<div class="confirm-dialog ai-needed-dialog" role="dialog" aria-modal="true" aria-label="' + escapeAttr(extensionView?.ariaLabel || 'OpenRouter balance empty') + '" style="max-width:480px">' +
    '<p class="confirm-message"><strong>' + escapeHTML(title) + '</strong></p>' +
    '<p style="font-size:13px;color:var(--text-muted);margin:0 0 14px">' + escapeHTML(description) + '</p>' +
    '<button class="chat-quiz-option chat-quiz-recommended" id="or-add-credits" style="margin-bottom:8px">' +
      '<span class="chat-quiz-icon" aria-hidden="true">&#128179;</span>' +
      '<span class="chat-quiz-body"><strong>' + escapeHTML(primaryLabel) + '</strong>' +
      '<span>' + escapeHTML(primaryDescription) + '</span></span>' +
      '<span class="chat-quiz-arrow" aria-hidden="true">&rarr;</span>' +
    '</button>' +
    '<div style="text-align:right;margin-top:14px">' +
      '<button class="confirm-btn confirm-btn-cancel" id="or-nb-cancel">Not now</button>' +
    '</div>' +
  '</div>';
  openModalOverlay(overlay, { initialFocus: '#or-add-credits', focusDelay: 50 });
  const close = function() { closeModalOverlay(overlay); };
  const addCredits = document.getElementById('or-add-credits');
  const cancel = document.getElementById('or-nb-cancel');
  if (!(addCredits instanceof HTMLButtonElement) || !(cancel instanceof HTMLButtonElement)) {
    close();
    return;
  }
  addCredits.onclick = function() {
    close();
    if (typeof extensionView?.onPrimary === 'function') extensionView.onPrimary();
    else (providerPanelDeps as ProviderPanelOperations).openExternal('https://openrouter.ai/settings/credits', '_blank', 'noopener');
  };
  cancel.onclick = close;
  overlay.onclick = function(e) { if (e.target === overlay) close(); };
}

// ─── Routstr mode toggle ───
// Direct mode removed — wallet-only

// ─── Routstr handlers ───
export async function handleSaveRoutstrKey() {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('routstr-key-input')) as HTMLInputElement | null;
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('save-routstr-key-btn')) as HTMLButtonElement | null;
  const status = document.getElementById('routstr-key-status');
  if (!input || !btn || !status) return;
  let key = input.value.trim();
  if (key.startsWith('cashu:')) key = key.slice(6); // strip URI prefix
  if (!key) { status.innerHTML = '<span style="color:var(--red)">Please enter a key or Cashu token</span>'; return; }
  btn.disabled = true; btn.textContent = 'Validating...';
  const result = await validateRoutstrKey(key);
  if (result.valid) {
    status.innerHTML = '<span style="color:var(--text-muted)">Key format accepted — waiting for activation…</span>';
    if (!await requestProviderActivation('routstr')) {
      status.innerHTML = '<span style="color:var(--text-muted)">Key format accepted — AI not activated</span>';
      btn.disabled = false; btn.textContent = 'Save & Validate';
      return;
    }
    let finalKey = key;
    // Convert Cashu token to a session key so Lightning topup works
    if (key.startsWith('cashu')) {
      status.innerHTML = '<span style="color:var(--text-muted)">Converting token to session key\u2026</span>';
      try {
        const wallet = await createRoutstrAccount(key);
        if (wallet.api_key) finalKey = wallet.api_key;
      } catch (e) {
        status.innerHTML = '<span style="color:var(--red)">' + escapeHTML(getErrorMessage(e)) + '</span>';
        btn.disabled = false; btn.textContent = 'Save & Validate';
        return;
      }
      // The payment layer has already durably saved the node-bound key.
      await fetchRoutstrModels();
      const panel = document.getElementById('ai-provider-panel');
      if (panel) {
        panel.innerHTML = `<div class="ai-provider-panel">
          <div style="padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--accent)">
            <div style="font-size:13px;font-weight:600;color:var(--accent);margin-bottom:6px">\u26a0 Save your session key</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Your Cashu token has been redeemed. This session key is the <strong>only way to access your balance</strong>. It is saved on this device. Keep your own backup as well.</div>
            <label style="font-size:11px;color:var(--text-muted)">Session Key</label>
            <div style="font-family:monospace;font-size:11px;word-break:break-all;background:var(--bg-primary);padding:8px;border-radius:6px;border:1px solid var(--border);color:var(--text-primary);user-select:all;cursor:text">${escapeHTML(finalKey)}</div>
            <div style="display:flex;gap:8px;margin-top:8px">
              <button class="import-btn import-btn-primary" style="font-size:12px" data-provider-panel-action="copy-provider-panel-clipboard" data-clipboard-text="${escapeAttr(finalKey)}" data-copied-text="\u2713 Copied (clears in 60s)" data-clear-timer-key="_rsClipTimer" data-clear-clipboard-after="60000">Copy Key</button>
              <button class="import-btn import-btn-secondary" style="font-size:12px" data-provider-panel-action="acknowledge-routstr-key">I\u2019ve saved it</button>
            </div>
          </div>
        </div>`;
      }
      btn.disabled = false; btn.textContent = 'Save & Validate';
      return;
    }
    await saveRoutstrKey(finalKey);
    status.innerHTML = '<span style="color:var(--green)">Connected \u2014 loading models\u2026</span>';
    const models = await fetchRoutstrModels();
    if (models.length) {
      renderRoutstrModelDropdown(models);
      status.innerHTML = '<span style="color:var(--green)">\u2713 Connected</span>';
    } else {
      status.innerHTML = '<span style="color:var(--green)">\u2713 Connected</span>';
    }
    if (result.warning) showNotification(result.warning, 'info', 5000);
    else showNotification('Routstr key saved', 'success');
    _returnToChatIfOnboarding();
  } else {
    status.innerHTML = `<span style="color:var(--red)">${escapeHTML(result.error)}</span>`;
  }
  btn.disabled = false; btn.textContent = 'Save & Validate';
}

export async function handleRemoveRoutstrKey() {
  try { await saveRoutstrKey(''); }
  catch { showNotification('Could not remove the Routstr key. Try again.', 'error'); return; }
  clearRoutstrModelCaches();
  showNotification('Routstr key removed', 'info');
  (providerPanelDeps as ProviderPanelOperations).openSettingsModal();
}

// ─── Custom API handlers ───
export async function handleSaveCustomApi() {
  const urlInput = /** @type {HTMLInputElement | null} */ (document.getElementById('custom-url-input')) as HTMLInputElement | null;
  const keyInput = /** @type {HTMLInputElement | null} */ (document.getElementById('custom-key-input')) as HTMLInputElement | null;
  if (!urlInput || !keyInput) return;
  const url = urlInput.value.trim().replace(/\/+$/, '');
  const key = keyInput.value.trim();
  if (!url) { showNotification('Please enter a base URL', 'error'); return; }
  if (!key) { showNotification('Please enter an API key', 'error'); return; }
  const result = await validateCustomApiKey(url, key);
  if (!result.valid) { showNotification(result.error, 'error'); return; }
  if (!await requestProviderActivation('custom', { endpoint: url })) {
    showNotification('Connection verified; AI was not activated.', 'info');
    return;
  }
  setCustomApiUrl(url);
  await saveCustomApiKey(key);
  showNotification('Connected', 'success');
  const models = await fetchCustomApiModels(url, key);
  // Re-render the full panel to show connected state
  const panel = document.getElementById('ai-provider-panel');
  if (panel) panel.innerHTML = renderAIProviderPanel('custom');
  if (models.length) renderCustomApiModelDropdown(models);
}

export function handleRemoveCustomApi() {
  localStorage.removeItem('labcharts-custom-url');
  localStorage.removeItem('labcharts-custom-model');
  localStorage.removeItem('labcharts-custom-models');
  encryptedSetItem('labcharts-custom-key', '').then(function() { updateKeyCache('labcharts-custom-key', ''); });
  const panel = document.getElementById('ai-provider-panel');
  if (panel) panel.innerHTML = renderAIProviderPanel('custom');
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
  renderAIProviderPanel,
  renderRoutstrModelDropdown,
  initSettingsModelFetch,
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
