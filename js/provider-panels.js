// provider-panels.js - AI provider settings behavior, balance display, key validation, and wallet flows

import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import {
  getVeniceKey, saveVeniceKey, getOpenRouterKey, saveOpenRouterKey, getAIProvider, setAIProvider,
  validateVeniceKey, validateOpenRouterKey, fetchVeniceModels, fetchOpenRouterModels,
  getOpenRouterBalance, getVeniceBalance,
  getRoutstrKey, saveRoutstrKey,
  fetchRoutstrModels, validateRoutstrKey, createRoutstrAccount,
  setAIPaused,
  getVeniceE2EE,
  getCustomApiUrl, setCustomApiUrl, getCustomApiKey, saveCustomApiKey,
  fetchCustomApiModels, validateCustomApiKey,
  rememberOpenRouterOAuthPreviousProvider, clearOpenRouterOAuthSession
} from './api.js';
import { updateKeyCache, encryptedSetItem } from './crypto.js';
import { renderAIProviderPanel } from './provider-panel-renderers.js';
import {
  applyHardwareOverride,
  clearHardwareOverride,
  configureLocalAiControls,
  copyOllamaPullCmd,
  initSettingsOllamaCheck,
  refreshModelAdvisor,
  testOllamaConnection,
  testPIIOllamaConnection,
} from './provider-local-ai-controls.js';
import {
  applyCustomApiManualModel,
  applyCustomOpenRouterModel,
  onOpenRouterDropdownChange,
  onVeniceModelDropdownChange,
  renderCustomApiModelDropdown,
  renderOpenRouterModelDropdown,
  renderPpqModelDropdown,
  renderRoutstrModelDropdown,
  renderVeniceModelDropdown,
  toggleVeniceE2EE,
  updateCustomModelPricing,
  updateOpenRouterModelPricing,
  updatePpqModelPricing,
  updateRoutstrModelPricing,
  updateVeniceModelPricing,
} from './provider-model-controls.js';
import {
  cancelPpqTopup,
  clearPpqTopupTimers,
  configurePpqPanels,
  dismissPpqKeyReveal,
  doPpqTopup,
  doPpqTopupCustom,
  handleCreatePpqAccount,
  handleRemovePpqKey,
  handleSavePpqKey,
  initSettingsPpqPanel,
  ppqShowCustomInput,
  refreshPpqBalance,
  selectPpqMethod,
  showPpqTopup,
} from './provider-ppq-panels.js';
import {
  configureRoutstrWalletPanels,
  clearRoutstrWalletTimers,
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
  showWalletSeedPhrase,
  showRoutstrWithdraw,
  showRoutstrWithdrawLightning,
  showRoutstrWithdrawToken,
  doRoutstrSendToken,
  doRoutstrWithdrawQuote,
  doRoutstrWithdrawExecute,
  doRoutstrWalletRestore
} from './provider-wallet-panels.js';

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
  if (window.loadFocusCard) window.loadFocusCard();
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
    modal.querySelectorAll('.ai-provider-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.provider === provider));
  }
  initSettingsOllamaCheck();
  initSettingsModelFetch();
}


// ═══════════════════════════════════════════════
// MODEL FETCH / BALANCE INIT
// ═══════════════════════════════════════════════
export function initSettingsModelFetch() {
  const orKey = getOpenRouterKey();
  if (orKey && document.getElementById('openrouter-model-area')) {
    fetchOpenRouterModels(orKey).then(function(models) { if (models.length) renderOpenRouterModelDropdown(models); });
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
    fetchRoutstrModels(rsKey).then(function(models) { if (models.length) renderRoutstrModelDropdown(models); });
    refreshRoutstrBalance();
  }
  // Cashu wallet balance + mint label + pending recovery (always, even without node connection)
  if (document.getElementById('routstr-wallet-balance') && window.cashuGetBalance) {
    window.cashuGetBalance().then(function(bal) {
      const el = document.getElementById('routstr-wallet-balance');
      if (el) el.textContent = '\u26a1 ' + bal.toLocaleString() + ' sats';
    });
    if (window.cashuGetMintUrl) window.cashuGetMintUrl().then(function(url) {
      const el = document.getElementById('routstr-mint-label');
      if (el) el.textContent = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
    });
    // H6: Check for pending deposit recovery
    if (window.cashuRecoverPendingDeposit) window.cashuRecoverPendingDeposit().then(function(token) {
      if (!token) return;
      const area = document.getElementById('routstr-wallet-fund-area');
      if (area) {
        area.style.display = 'block';
        area.innerHTML = '<div style="margin-top:8px;padding:8px;background:rgba(255,160,0,0.1);border:1px solid var(--yellow, #f0a800);border-radius:6px">' +
          '<div style="font-size:11px;color:var(--yellow, #f0a800);margin-bottom:4px">\u26a0 Pending deposit recovery</div>' +
          '<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">A previous node deposit failed. Your sats are safe in this token:</div>' +
          '<textarea class="api-key-input" style="font-size:10px;font-family:monospace;height:40px;resize:none;user-select:all" readonly onclick="this.select()">' + escapeHTML(token) + '</textarea>' +
          '<div style="display:flex;gap:4px;margin-top:4px">' +
          '<button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;flex:1" onclick="cashuImportWallet(document.querySelector(\'#routstr-wallet-fund-area textarea\').value).then(()=>{cashuClearPendingDeposit();showNotification(\'Recovered!\',\'success\');location.reload()}).catch(e=>showNotification(e.message,\'error\'))">Recover to Wallet</button>' +
          '<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px" data-token="' + escapeAttr(token) + '" onclick="navigator.clipboard.writeText(this.dataset.token);this.textContent=\'\u2713 Copied\'">Copy Token</button>' +
          '</div></div>';
      }
    });
    // Check for pending withdraw recovery
    if (window.cashuRecoverPendingWithdraw) window.cashuRecoverPendingWithdraw().then(function(token) {
      if (!token) return;
      const area = document.getElementById('routstr-wallet-fund-area');
      if (!area || area.style.display === 'block') return; // don't overwrite deposit recovery
      area.style.display = 'block';
      area.innerHTML = '<div style="margin-top:8px;padding:8px;background:rgba(255,160,0,0.1);border:1px solid var(--yellow, #f0a800);border-radius:6px">' +
        '<div style="font-size:11px;color:var(--yellow, #f0a800);margin-bottom:4px">\u26a0 Pending withdraw recovery</div>' +
        '<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">A previous Lightning withdrawal failed mid-operation. Your sats are safe in this token:</div>' +
        '<textarea class="api-key-input" style="font-size:10px;font-family:monospace;height:40px;resize:none;user-select:all" readonly onclick="this.select()">' + escapeHTML(token) + '</textarea>' +
        '<div style="display:flex;gap:4px;margin-top:4px">' +
        '<button class="import-btn import-btn-primary" style="font-size:11px;padding:3px 10px;flex:1" onclick="cashuImportWallet(document.querySelector(\'#routstr-wallet-fund-area textarea\').value).then(()=>{cashuClearPendingWithdraw();showNotification(\'Recovered!\',\'success\');location.reload()}).catch(e=>showNotification(e.message,\'error\'))">Recover to Wallet</button>' +
        '<button class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px" onclick="navigator.clipboard.writeText(document.querySelector(\'#routstr-wallet-fund-area textarea\').value);this.textContent=\'\u2713 Copied\'">Copy Token</button>' +
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
  if (window._settingsHadProvider) return; // already had a provider — user is just reconfiguring
  if (!window.hasAIProvider?.()) return;
  window.closeSettingsModal?.();
  setTimeout(() => window.openChatPanel?.(), 300);
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
  const input = document.getElementById('venice-key-input');
  const btn = document.getElementById('save-venice-key-btn');
  const status = document.getElementById('venice-key-status');
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
  window.clearE2EESession?.();
  showNotification('Venice API key removed', 'info');
  window.openSettingsModal?.();
}


// ═══════════════════════════════════════════════
// OPENROUTER HANDLERS
// ═══════════════════════════════════════════════
export async function handleSaveOpenRouterKey() {
  const input = document.getElementById('openrouter-key-input');
  const btn = document.getElementById('save-openrouter-key-btn');
  const status = document.getElementById('openrouter-key-status');
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
  window.openSettingsModal?.();
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
  overlay.innerHTML = '<div class="confirm-dialog ai-needed-dialog" role="dialog" aria-modal="true" aria-label="OpenRouter balance empty" style="max-width:480px">' +
    '<p class="confirm-message"><strong>Your OpenRouter balance is empty</strong></p>' +
    '<p style="font-size:13px;color:var(--text-muted);margin:0 0 14px">Add credits at OpenRouter to keep using AI. $10 covers weeks of typical use — chat, lab interpretation, and PDF imports.</p>' +
    '<button class="chat-quiz-option chat-quiz-recommended" id="or-add-credits" style="margin-bottom:8px">' +
      '<span class="chat-quiz-icon" aria-hidden="true">&#128179;</span>' +
      '<span class="chat-quiz-body"><strong>Add credits at openrouter.ai</strong>' +
      '<span>Opens in a new tab. Come back to getbased when done — the page picks up automatically.</span></span>' +
      '<span class="chat-quiz-arrow" aria-hidden="true">&rarr;</span>' +
    '</button>' +
    '<div style="text-align:right;margin-top:14px">' +
      '<button class="confirm-btn confirm-btn-cancel" id="or-nb-cancel">Not now</button>' +
    '</div>' +
  '</div>';
  overlay.classList.add('show');
  const close = function() { overlay.classList.remove('show'); };
  document.getElementById('or-add-credits').onclick = function() {
    close();
    window.open('https://openrouter.ai/settings/credits', '_blank', 'noopener');
  };
  document.getElementById('or-nb-cancel').onclick = close;
  overlay.onclick = function(e) { if (e.target === overlay) close(); };
}

// ─── Routstr mode toggle ───
// Direct mode removed — wallet-only

// ─── Routstr handlers ───
export async function handleSaveRoutstrKey() {
  const input = document.getElementById('routstr-key-input');
  const btn = document.getElementById('save-routstr-key-btn');
  const status = document.getElementById('routstr-key-status');
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
        status.innerHTML = '<span style="color:var(--red)">' + escapeHTML(e.message) + '</span>';
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
              <button class="import-btn import-btn-primary" style="font-size:12px" onclick="navigator.clipboard.writeText('${escapeAttr(finalKey)}');this.textContent='\u2713 Copied (clears in 60s)';clearTimeout(window._rsClipTimer);window._rsClipTimer=setTimeout(()=>navigator.clipboard.writeText(''),60000)">Copy Key</button>
              <button class="import-btn import-btn-secondary" style="font-size:12px" onclick="var p=document.getElementById('ai-provider-panel');if(p)p.innerHTML=renderAIProviderPanel('routstr');initSettingsModelFetch()">I\u2019ve saved it</button>
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
  localStorage.removeItem('labcharts-routstr-models');
  localStorage.removeItem('labcharts-routstr-model');
  localStorage.removeItem('labcharts-routstr-pricing');
  localStorage.removeItem('labcharts-routstr-vision-models');
  showNotification('Routstr key removed', 'info');
  window.openSettingsModal?.();
}

// ─── Custom API handlers ───
async function handleSaveCustomApi() {
  const urlInput = document.getElementById('custom-url-input');
  const keyInput = document.getElementById('custom-key-input');
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

function handleRemoveCustomApi() {
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


// ═══════════════════════════════════════════════
// WINDOW EXPORTS (for HTML onclick handlers)
// ═══════════════════════════════════════════════
Object.assign(window, {
  renderAIProviderPanel,
  toggleAIPause,
  switchAIProvider,
  initSettingsModelFetch,
  initSettingsOllamaCheck,
  testOllamaConnection,
  testPIIOllamaConnection,
  refreshVeniceBalance,
  updateVeniceModelPricing,
  onVeniceModelDropdownChange,
  toggleVeniceE2EE,
  updateOpenRouterModelPricing,
  updateRoutstrModelPricing,
  handleSaveVeniceKey,
  handleRemoveVeniceKey,
  renderVeniceModelDropdown,
  handleSaveOpenRouterKey,
  handleRemoveOpenRouterKey,
  renderOpenRouterModelDropdown,
  applyCustomOpenRouterModel,
  onOpenRouterDropdownChange,
  handleSaveRoutstrKey,
  handleRemoveRoutstrKey,
  renderRoutstrModelDropdown,
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
  showWalletSeedPhrase,
  showRoutstrWithdraw,
  showRoutstrWithdrawLightning,
  showRoutstrWithdrawToken,
  doRoutstrSendToken,
  doRoutstrWithdrawQuote,
  doRoutstrWithdrawExecute,
  doRoutstrWalletRestore,
  handleCreatePpqAccount,
  dismissPpqKeyReveal,
  handleSavePpqKey,
  handleRemovePpqKey,
  renderPpqModelDropdown,
  updatePpqModelPricing,
  refreshPpqBalance,
  showPpqTopup,
  selectPpqMethod,
  doPpqTopup,
  ppqShowCustomInput,
  doPpqTopupCustom,
  cancelPpqTopup,
  refreshOpenRouterBalance,
  showInsufficientBalanceDialog,
  handleSaveCustomApi,
  handleRemoveCustomApi,
  renderCustomApiModelDropdown,
  applyCustomApiManualModel,
  updateCustomModelPricing,
  copyOllamaPullCmd,
  refreshModelAdvisor,
  applyHardwareOverride,
  clearHardwareOverride,
});
