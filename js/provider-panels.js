// @ts-check
// provider-panels.js - AI provider settings behavior, balance display, key validation, and wallet flows

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
  getVeniceE2EE,
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
  renderVeniceModelDropdown,
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
  refreshCashuWalletBalance,
  refreshWalletSeedStatus,
  refreshRoutstrBalance,
  showRoutstrMintEdit,
  _setActiveNodeAction,
  walletRuntime
} from './provider-wallet-panels.js';
function openProviderPanelExternal(...args) {
  const open = /** @type {any} */ (globalThis).open;
  return typeof open === 'function' ? open.apply(globalThis, args) : null;
}

function reloadProviderPanelPage() {
  const location = /** @type {any} */ (globalThis).location;
  if (typeof location?.reload === 'function') location.reload();
}

const providerPanelDeps = {
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

const providerPanelClipboardTimers = new Map();

export function configureProviderPanelDeps(deps = {}) {
  const previous = { ...providerPanelDeps };
  for (const name of Object.keys(providerPanelDeps)) {
    if (typeof deps[name] === 'function') providerPanelDeps[name] = deps[name];
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

// ═══════════════════════════════════════════════
// AI PAUSE / PROVIDER SWITCH
// ═══════════════════════════════════════════════
export function toggleAIPause(enabled) {
  setAIPaused(!enabled);
  showNotification(enabled ? 'AI features enabled' : 'AI features paused', 'info');
  // Refresh focus card — show cached content when paused, fetch new when enabled
  providerPanelDeps.loadFocusCard();
}

export function switchAIProvider(provider) {
  const previousProvider = getAIProvider();
  if (provider === 'openrouter' && previousProvider !== 'openrouter' && !getOpenRouterKey()) {
    rememberOpenRouterOAuthPreviousProvider(previousProvider);
  } else if (provider !== 'openrouter') {
    clearOpenRouterOAuthSession();
  }
  setAIProvider(provider);
  clearPpqTopupTimers();
  clearRoutstrWalletTimers();
  const panel = document.getElementById('ai-provider-panel');
  if (panel) panel.innerHTML = renderAIProviderPanel(provider);
  const modal = document.getElementById('settings-modal');
  if (modal) {
    modal.querySelectorAll('.ai-provider-btn').forEach(btn => {
      const providerBtn = /** @type {HTMLElement} */ (btn);
      providerBtn.classList.toggle('active', providerBtn.dataset.provider === provider);
    });
  }
  initSettingsOllamaCheck();
  initSettingsModelFetch();
}

// ═══════════════════════════════════════════════
// MODEL FETCH / BALANCE INIT
// ═══════════════════════════════════════════════
export function initSettingsModelFetch() {
  const orKey = getOpenRouterKey();
  const openRouterModelArea = document.getElementById('openrouter-model-area');
  if (orKey && (openRouterModelArea || hasAppExtensionAIModelSurface('openrouter'))) {
    fetchOpenRouterModels(orKey).then(function(models) {
      if (models.length && openRouterModelArea) renderOpenRouterModelDropdown(models);
      notifyAppExtensionAIModelsLoaded({ provider: 'openrouter', models });
    });
    getOpenRouterBalance().then(function(b) {
      const el = document.getElementById('or-balance');
      if (el && b) el.innerHTML = _orBalanceHtml(b.remaining);
      else if (el) el.textContent = 'Balance: unavailable';
    });
  }
  const veniceKey = getVeniceKey();
  if (veniceKey && document.getElementById('venice-model-area')) {
    fetchVeniceModels(veniceKey).then(function() {
      // After fetch, render the right list based on E2EE state
      const listKey = getVeniceE2EE() ? 'labcharts-venice-e2ee-models' : 'labcharts-venice-models';
      let models = []; try { models = JSON.parse(localStorage.getItem(listKey) || '[]'); } catch(e) {}
      if (models.length) renderVeniceModelDropdown(models);
    });
    getVeniceBalance().then(function(b) {
      const el = document.getElementById('venice-balance');
      if (el && b) el.innerHTML = _veniceBalanceHtml(b);
      else if (el) el.textContent = 'Balance: unavailable';
    });
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
    walletRuntime.cashuGetBalance().then(function(bal) {
      const el = document.getElementById('routstr-wallet-balance');
      if (el) el.textContent = '\u26a1 ' + bal.toLocaleString() + ' sats';
    });
    refreshWalletSeedStatus();
    if (typeof walletRuntime.cashuGetMintUrl === 'function') Promise.resolve(walletRuntime.cashuGetMintUrl()).then(function(url) {
      const el = document.getElementById('routstr-mint-label');
      if (el && url) el.textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    });
    // H6: Check for pending deposit recovery
    if (typeof walletRuntime.cashuRecoverPendingDeposit === 'function') walletRuntime.cashuRecoverPendingDeposit().then(function(token) {
      if (!token) return;
      const area = document.getElementById('routstr-wallet-fund-area');
      if (area) {
        area.style.display = 'block';
        area.innerHTML = '<div style="margin-top:8px;padding:8px;background:rgba(255,160,0,0.1);border:1px solid var(--yellow, #f0a800);border-radius:6px">' +
          '<div style="font-size:11px;color:var(--yellow, #f0a800);margin-bottom:4px">\u26a0 Pending deposit recovery</div>' +
          '<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">A previous node deposit failed. Your sats are safe in this token:</div>' +
          '<textarea class="api-key-input" style="font-size:10px;font-family:monospace;height:40px;resize:none;user-select:all" readonly data-provider-panel-action="select-provider-panel-text">' + escapeHTML(token) + '</textarea>' +
          '<div style="display:flex;gap:4px;margin-top:4px">' +
          '<button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;flex:1" data-provider-panel-action="recover-pending-deposit" data-token="' + escapeAttr(token) + '">Recover to Wallet</button>' +
          '<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px" data-provider-panel-action="copy-provider-panel-clipboard" data-clipboard-text="' + escapeAttr(token) + '" data-copied-text="\u2713 Copied">Copy Token</button>' +
          '</div></div>';
      }
    });
    // Check for pending withdraw recovery
    if (typeof walletRuntime.cashuRecoverPendingWithdraw === 'function') walletRuntime.cashuRecoverPendingWithdraw().then(function(token) {
      if (!token) return;
      const area = document.getElementById('routstr-wallet-fund-area');
      if (!area || area.style.display === 'block') return; // don't overwrite deposit recovery
      area.style.display = 'block';
      area.innerHTML = '<div style="margin-top:8px;padding:8px;background:rgba(255,160,0,0.1);border:1px solid var(--yellow, #f0a800);border-radius:6px">' +
        '<div style="font-size:11px;color:var(--yellow, #f0a800);margin-bottom:4px">\u26a0 Pending withdraw recovery</div>' +
        '<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">A previous Lightning withdrawal failed mid-operation. Your sats are safe in this token:</div>' +
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
  if (providerPanelDeps.hadProviderBeforeSettings()) return; // already had a provider — user is just reconfiguring
  if (!providerPanelDeps.hasAIProvider()) return;
  providerPanelDeps.closeSettingsModal();
  setTimeout(() => providerPanelDeps.openChatPanel(), 300);
}

function _setActionText(actionEl) {
  if (actionEl instanceof HTMLElement) {
    actionEl.textContent = actionEl.dataset.copiedText || '✓ Copied';
  }
}

function _clipboardTextFromAction(actionEl) {
  return actionEl?.dataset?.clipboardText || actionEl?.dataset?.token || '';
}

async function _copyProviderPanelText(text, actionEl) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    _setActionText(actionEl);
    const timerKey = actionEl?.dataset?.clearTimerKey || '';
    const clearMs = Number(actionEl?.dataset?.clearClipboardAfter || 0);
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

export function copyProviderPanelClipboard(actionEl) {
  void _copyProviderPanelText(_clipboardTextFromAction(actionEl), actionEl);
}

export function selectProviderPanelText(actionEl) {
  if (typeof actionEl?.select === 'function') actionEl.select();
}

async function _recoverPendingToken(actionEl, clearName) {
  const fallbackInput = /** @type {HTMLTextAreaElement | null} */ (
    document.querySelector('#routstr-wallet-fund-area textarea')
  );
  const token = actionEl?.dataset?.token || fallbackInput?.value || '';
  try {
    const clearPendingToken = walletRuntime[clearName];
    if (typeof walletRuntime.cashuReceiveToken !== 'function' || typeof clearPendingToken !== 'function') {
      throw new Error('Wallet recovery is unavailable');
    }
    await walletRuntime.cashuReceiveToken(token);
    await clearPendingToken();
    showNotification('Recovered!', 'success');
    providerPanelDeps.reloadPage();
  } catch (e) {
    showNotification(getErrorMessage(e, String(e)), 'error');
  }
}

export function recoverPendingDeposit(actionEl) {
  void _recoverPendingToken(actionEl, 'cashuClearPendingDeposit');
}

export function recoverPendingWithdraw(actionEl) {
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
function _veniceBalanceHtml(b) {
  if (b.diem != null) {
    const v = parseFloat(b.diem); // 1 DIEM = 1 USD
    const color = v < 0.10 ? 'var(--red)' : v < 0.50 ? 'var(--yellow, #f0a800)' : 'var(--green)';
    return 'Balance: <span style="color:' + color + '">$' + v.toFixed(2) + '</span>';
  }
  return 'Balance: <span style="color:' + (b.canConsume ? 'var(--green)' : 'var(--red)') + '">' + (b.canConsume ? 'Active' : 'No balance') + '</span>';
}
export function refreshVeniceBalance() {
  const el = document.getElementById('venice-balance');
  if (el) el.textContent = 'Balance: refreshing...';
  getVeniceBalance().then(function(b) {
    if (el && b) el.innerHTML = _veniceBalanceHtml(b);
    else if (el) el.textContent = 'Balance: unavailable';
  });
}

export async function handleSaveVeniceKey() {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('venice-key-input'));
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('save-venice-key-btn'));
  const status = document.getElementById('venice-key-status');
  if (!input || !btn || !status) return;
  const key = input.value.trim();
  if (!key) { status.innerHTML = '<span style="color:var(--red)">Please enter an API key</span>'; return; }
  btn.disabled = true; btn.textContent = 'Validating...';
  const result = await validateVeniceKey(key);
  if (result.valid) {
    await saveVeniceKey(key);
    status.innerHTML = '<span style="color:var(--green)">Connected — loading models…</span>';
    await fetchVeniceModels(key);
    // Render the right list based on E2EE state
    const listKey = getVeniceE2EE() ? 'labcharts-venice-e2ee-models' : 'labcharts-venice-models';
    let models = []; try { models = JSON.parse(localStorage.getItem(listKey) || '[]'); } catch(e) {}
    if (models.length) {
      renderVeniceModelDropdown(models);
      status.innerHTML = '<span style="color:var(--green)">&#10003; Connected</span>';
    } else {
      status.innerHTML = '<span style="color:var(--green)">&#10003; Connected</span>';
    }
    showNotification('Venice API key saved', 'success');
    _returnToChatIfOnboarding();
  } else {
    status.innerHTML = `<span style="color:var(--red)">${escapeHTML(result.error)}</span>`;
  }
  btn.disabled = false; btn.textContent = 'Save & Validate';
}

export function handleRemoveVeniceKey() {
  localStorage.removeItem('labcharts-venice-key');
  updateKeyCache('labcharts-venice-key', null);
  localStorage.removeItem('labcharts-venice-models');
  localStorage.removeItem('labcharts-venice-models-fetched-at');
  localStorage.removeItem('labcharts-venice-model');
  localStorage.removeItem('labcharts-venice-e2ee');
  localStorage.removeItem('labcharts-venice-e2ee-models');
  localStorage.removeItem('labcharts-venice-model-regular');
  localStorage.removeItem('labcharts-venice-model-e2ee');
  providerPanelDeps.clearE2EESession();
  showNotification('Venice API key removed', 'info');
  providerPanelDeps.openSettingsModal();
}


// ═══════════════════════════════════════════════
// OPENROUTER HANDLERS
// ═══════════════════════════════════════════════
export async function handleSaveOpenRouterKey() {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('openrouter-key-input'));
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('save-openrouter-key-btn'));
  const status = document.getElementById('openrouter-key-status');
  if (!input || !btn || !status) return;
  const key = input.value.trim();
  if (!key) { status.innerHTML = '<span style="color:var(--red)">Please enter an API key</span>'; return; }
  btn.disabled = true; btn.textContent = 'Validating...';
  const result = await validateOpenRouterKey(key);
  if (result.valid) {
    await saveOpenRouterKey(key);
    clearOpenRouterOAuthSession();
    status.innerHTML = '<span style="color:var(--green)">Connected — loading models\u2026</span>';
    const models = await fetchOpenRouterModels(key);
    if (models.length) {
      renderOpenRouterModelDropdown(models);
      status.innerHTML = '<span style="color:var(--green)">&#10003; Connected</span>';
    } else {
      status.innerHTML = '<span style="color:var(--green)">&#10003; Connected</span>';
    }
    showNotification('OpenRouter API key saved', 'success');
    _returnToChatIfOnboarding();
  } else {
    status.innerHTML = `<span style="color:var(--red)">${escapeHTML(result.error)}</span>`;
  }
  btn.disabled = false; btn.textContent = 'Save & Validate';
}

export function handleRemoveOpenRouterKey() {
  localStorage.removeItem('labcharts-openrouter-key');
  updateKeyCache('labcharts-openrouter-key', null);
  localStorage.removeItem('labcharts-openrouter-models');
  localStorage.removeItem('labcharts-openrouter-model');
  localStorage.removeItem('labcharts-openrouter-pricing');
  showNotification('OpenRouter API key removed', 'info');
  providerPanelDeps.openSettingsModal();
}

function _orBalanceHtml(remaining) {
  const v = parseFloat(remaining);
  const color = v < 0.10 ? 'var(--red)' : v < 0.50 ? 'var(--yellow, #f0a800)' : 'var(--green)';
  return 'Balance: <span style="color:' + color + '">$' + v.toFixed(2) + '</span>';
}
export function refreshOpenRouterBalance() {
  const el = document.getElementById('or-balance');
  if (el) el.textContent = 'Balance: refreshing...';
  getOpenRouterBalance().then(function(b) {
    if (el && b) el.innerHTML = _orBalanceHtml(b.remaining);
    else if (el) el.textContent = 'Balance: unavailable';
  });
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
    else providerPanelDeps.openExternal('https://openrouter.ai/settings/credits', '_blank', 'noopener');
  };
  cancel.onclick = close;
  overlay.onclick = function(e) { if (e.target === overlay) close(); };
}

// ─── Routstr mode toggle ───
// Direct mode removed — wallet-only

// ─── Routstr handlers ───
export async function handleSaveRoutstrKey() {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById('routstr-key-input'));
  const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('save-routstr-key-btn'));
  const status = document.getElementById('routstr-key-status');
  if (!input || !btn || !status) return;
  let key = input.value.trim();
  if (key.startsWith('cashu:')) key = key.slice(6); // strip URI prefix
  if (!key) { status.innerHTML = '<span style="color:var(--red)">Please enter a key or Cashu token</span>'; return; }
  btn.disabled = true; btn.textContent = 'Validating...';
  const result = await validateRoutstrKey(key);
  if (result.valid) {
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
      // Cashu token is now spent — user MUST save the session key
      await saveRoutstrKey(finalKey);
      await fetchRoutstrModels();
      const panel = document.getElementById('ai-provider-panel');
      if (panel) {
        panel.innerHTML = `<div class="ai-provider-panel">
          <div style="padding:12px;background:var(--bg-secondary);border-radius:8px;border:1px solid var(--accent)">
            <div style="font-size:13px;font-weight:600;color:var(--accent);margin-bottom:6px">\u26a0 Save your session key</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Your Cashu token has been redeemed. This session key is the <strong>only way to access your balance</strong>. Copy it now \u2014 there is no recovery.</div>
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

export function handleRemoveRoutstrKey() {
  localStorage.removeItem('labcharts-routstr-key');
  updateKeyCache('labcharts-routstr-key', null);
  clearRoutstrModelCaches();
  showNotification('Routstr key removed', 'info');
  providerPanelDeps.openSettingsModal();
}

// ─── Custom API handlers ───
export async function handleSaveCustomApi() {
  const urlInput = /** @type {HTMLInputElement | null} */ (document.getElementById('custom-url-input'));
  const keyInput = /** @type {HTMLInputElement | null} */ (document.getElementById('custom-key-input'));
  if (!urlInput || !keyInput) return;
  const url = urlInput.value.trim().replace(/\/+$/, '');
  const key = keyInput.value.trim();
  if (!url) { showNotification('Please enter a base URL', 'error'); return; }
  if (!key) { showNotification('Please enter an API key', 'error'); return; }
  const result = await validateCustomApiKey(url, key);
  if (!result.valid) { showNotification(result.error, 'error'); return; }
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
  returnToChatIfOnboarding: _returnToChatIfOnboarding
});

configurePpqPanels({
  returnToChatIfOnboarding: _returnToChatIfOnboarding
});

configureRoutstrWalletPanels({
  renderAIProviderPanel,
  renderRoutstrModelDropdown,
  initSettingsModelFetch,
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
