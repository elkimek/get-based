// @ts-check
// provider-wallet-panels.js - Routstr/Cashu wallet UI and node funding actions

import { canonicalRoutstrUrl, validateLightningInvoice } from './routstr-validation.js';
import { getErrorMessage } from './caught-error.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { getRoutstrKey, saveRoutstrKey, touchRoutstrSession, fetchRoutstrModels, getRoutstrBalance } from './api.js';
import { isValidExternalUrl } from './url-safety.js';
import { installRoutstrWalletDelegates } from './provider-wallet-delegates.js';
import { createFundingMonitor, renderFundingInvoice, recoverPendingWalletFunding as recoverPendingWalletFundingImpl } from './provider-wallet-funding-recovery.js';
import { buildRoutstrNodeActions, routstrWalletActionButtons } from './provider-wallet-panel-buttons.js';
import {
  routstrNodePickerRowHtml,
  walletMintRowHtml,
  walletMintPickerHtml,
  walletSeedManagementHtml,
  walletSeedMissingHtml,
  walletSeedOnboardingHtml,
  walletWithdrawHtml,
  walletWithdrawLightningHtml,
  walletWithdrawTokenHtml,
} from './provider-wallet-panel-renderers.js';
import { clearRoutstrModelCaches } from './routstr-model-cache.js';
import {
  clearRoutstrBalanceSettlementTimers,
  installRoutstrBalanceSettlementRefresh,
} from './routstr-balance-settlement.js';
import { configureRoutstrWalletRuntime, walletRuntime } from './provider-wallet-runtime.js';

export { configureRoutstrWalletRuntime, walletRuntime };
export { buildRoutstrNodeActions, routstrWalletActionButtons };

const walletCallbacks = {
  renderAIProviderPanel: /** @type {((provider: string) => string) | null} */ (null), renderRoutstrModelDropdown: /** @type {((models: any[]) => void) | null} */ (null),
  initSettingsModelFetch: /** @type {(() => void) | null} */ (null), requestProviderActivation: /** @type {((provider: string, options?: any) => Promise<boolean>) | null} */ (null),
  returnToChatIfOnboarding: /** @type {(() => void) | null} */ (null)
};

export function configureRoutstrWalletPanels(callbacks = {}) {
  Object.assign(walletCallbacks, callbacks);
}

function _renderRoutstrPanel(provider = 'routstr') {
  return typeof walletCallbacks.renderAIProviderPanel === 'function'
    ? walletCallbacks.renderAIProviderPanel(provider)
    : '';
}

function _renderRoutstrModelDropdown(models) {
  if (typeof walletCallbacks.renderRoutstrModelDropdown === 'function') {
    walletCallbacks.renderRoutstrModelDropdown(models);
  }
}

function _returnToChatIfOnboarding() {
  if (typeof walletCallbacks.returnToChatIfOnboarding === 'function') {
    walletCallbacks.returnToChatIfOnboarding();
  }
}

let _rsCashuBackupTimer = null;
let _walletSeedThenAction = null;

function _rsBalanceHtml(sats) {
  const color = sats < 100 ? 'var(--red)' : sats < 500 ? 'var(--yellow, #f0a800)' : 'var(--green)';
  return 'Balance: <span style="color:' + color + '">\u26a1 ' + sats.toLocaleString() + ' sats</span>';
}

export function refreshCashuWalletBalance() {
  const el = document.getElementById('routstr-wallet-balance');
  if (el) el.textContent = '\u26a1 verifying...';
  refreshWalletSeedStatus();
  if (walletRuntime.cashuCheckProofStates) {
    walletRuntime.cashuCheckProofStates().then(function(bal) {
      if (el) el.textContent = '\u26a1 ' + bal.toLocaleString() + ' sats';
    }).catch(function() {
      if (el) el.textContent = '\u26a1 check failed';
    });
  }
}

export function refreshRoutstrBalance() {
  const el = document.getElementById('routstr-node-balance') || document.getElementById('routstr-balance');
  if (el) el.textContent = 'Balance: refreshing...';
  getRoutstrBalance().then(function(b) {
    if (el && b) {
      el.innerHTML = _rsBalanceHtml(b.sats);
      // Bootstrap pre-clock funded sessions without requiring another real-sats
      // deposit. A stale zero-balance peer does not claim session freshness.
      if (b.sats > 0 && !localStorage.getItem('labcharts-routstr-session-updated-at')) touchRoutstrSession();
    }
    else if (el) el.textContent = 'Balance: unavailable';
  });
}

installRoutstrBalanceSettlementRefresh(refreshRoutstrBalance);

let _fundingRequest = null;
let _fundingInvoice = null;
const fundingMonitor = createFundingMonitor(walletRuntime, () => _refreshRoutstrWalletBalance(true), result => {
  if (result.results?.some(item => item.quote === _fundingInvoice?.quote
    && (item.mint || result.mint) === _fundingInvoice?.mint
    && (item.paid || /^(EXPIRED|CANCELLED|CANCELED)$/.test(String(item.state).toUpperCase())))) _fundingInvoice = null;
});
export function startRoutstrFundingMonitor() { fundingMonitor.start(); }

function _getWalletInput(id) {
  return /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (document.getElementById(id));
}

export function clearRoutstrWalletTimers() {
  if (_rsCashuBackupTimer) { clearTimeout(_rsCashuBackupTimer); _rsCashuBackupTimer = null; }
  clearRoutstrBalanceSettlementTimers();
  _walletSeedThenAction = null;
}

export function showRoutstrWalletFund() {
  const area = document.getElementById('routstr-wallet-fund-area');
  if (!area) return;
  if (area.style.display !== 'none' && _activeWalletAction === 'deposit') { area.style.display = 'none'; _setActiveWalletAction(null); return; }
  _setActiveWalletAction('deposit');
  _ensureWalletSeed(() => _renderWalletFundUI());
}

async function _renderWalletFundUI() {
  const area = document.getElementById('routstr-wallet-fund-area');
  if (!area) return;
  area.style.display = 'block';
  const presets = [1000, 5000, 10000, 25000];
  const feePct = typeof walletRuntime.cashuGetFeePct === 'function' ? walletRuntime.cashuGetFeePct() : 0;
  const feeNote = feePct > 0 ? `<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">${Math.round(feePct * 100)}% development fee applies</div>` : '';
  const cashuFeeLabel = feePct > 0 ? `or paste Cashu token (${Math.round(feePct * 100)}% fee)` : 'or paste Cashu token';
  area.innerHTML = `<div style="margin-top:8px">
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:2px">Deposit with Lightning</div>
    ${feeNote}
    <div style="display:flex;flex-wrap:wrap;gap:4px">
      ${presets.map(s => `<button class="import-btn import-btn-secondary" style="flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" data-routstr-wallet-action="fund-wallet-preset" data-sats="${s}">\u26a1 ${s.toLocaleString()}</button>`).join('')}<div id="routstr-wfund-custom-slot" style="display:flex"><button class="import-btn import-btn-secondary" style="color:var(--text-muted)" data-routstr-wallet-action="fund-wallet-custom-input">\u26a1\u2026</button></div>
    </div>
    <div style="font-size:10px;color:var(--text-muted);margin-top:5px;text-align:center">1,000 sats is enough for a few chats</div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:6px">Paid deposits are checked and credited automatically, even after closing this panel.</div>
    <div style="margin-top:6px"><div class="or-oauth-divider"><span>${cashuFeeLabel}</span></div>
    <div class="routstr-wallet-input-row">
      <input type="text" class="api-key-input" id="routstr-wcashu-input" placeholder="cashuA... / cashuB... / cashu:..." style="font-size:11px;flex:1;font-family:monospace">
      <button class="import-btn import-btn-primary" style="white-space:nowrap" data-routstr-wallet-action="receive-wallet-cashu">Deposit</button>
    </div></div>
    <div id="routstr-wfund-status"></div>
  </div>`;
  startRoutstrFundingMonitor();
  const invoice = _fundingInvoice;
  if (invoice && invoice.mint === await walletRuntime.cashuGetMintUrl()) {
    try { await renderFundingInvoice(invoice); }
    catch { _fundingInvoice = null; }
  }
}

export function rsWalletFundCustomInput() {
  const slot = document.getElementById('routstr-wfund-custom-slot');
  if (!slot) return;
  slot.innerHTML = '<input type="text" inputmode="numeric" id="routstr-wfund-custom" class="import-btn import-btn-secondary" style="font-size:11px;padding:3px 10px;width:80px;text-align:center;cursor:text;border:1px solid var(--accent)" placeholder="sats" data-routstr-wallet-key="wallet-fund-custom"><button class="import-btn import-btn-secondary" data-routstr-wallet-action="fund-wallet-custom">Get invoice</button>';
  document.getElementById('routstr-wfund-custom')?.focus();
}

export function doRoutstrWalletFundCustom() {
  const input = _getWalletInput('routstr-wfund-custom');
  if (!input) return;
  const amount = parseInt(input.value.replace(/[^0-9]/g, ''), 10);
  if (!amount || amount < 100) {
    const s = document.getElementById('routstr-wfund-status');
    if (s) s.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Minimum 100 sats</div>';
    return;
  }
  void doRoutstrWalletFund(amount);
}

export async function doRoutstrWalletFund(amountSats) {
  // Repeated clicks must not race to replace the displayed invoice.
  if (_fundingRequest) return false;
  const statusEl = document.getElementById('routstr-wfund-status');
  if (!statusEl) return false;
  if (_fundingInvoice?.amount === amountSats && statusEl.dataset.quote === _fundingInvoice.quote) {
    try { validateLightningInvoice(_fundingInvoice.invoice, amountSats); return true; }
    catch { _fundingInvoice = null; }
  }
  statusEl.textContent = 'Creating invoice…';
  delete statusEl.dataset.quote;
  _fundingRequest = (async () => {
    try {
      const mint = await walletRuntime.cashuGetMintUrl();
      const result = await walletRuntime.cashuCreateFundingInvoice(amountSats);
      _fundingInvoice = { ...result, amount: amountSats, mint };
      fundingMonitor.start({ recheck: true });
      // The quote is durable even if the user navigated away while creating it.
      if (statusEl === document.getElementById('routstr-wfund-status')) {
        await renderFundingInvoice(_fundingInvoice);
      }
      return true;
    } catch (e) {
      if (statusEl.isConnected) statusEl.textContent = getErrorMessage(e);
      return false;
    }
  })();
  try { return await _fundingRequest; }
  finally { _fundingRequest = null; }
}

export async function recoverPendingWalletFunding() {
  return recoverPendingWalletFundingImpl(walletRuntime, _refreshRoutstrWalletBalance);
}

export async function doRoutstrWalletReceiveCashu() {
  const input = _getWalletInput('routstr-wcashu-input');
  const statusEl = document.getElementById('routstr-wfund-status');
  if (!input || !statusEl) return;
  let token = input.value.trim();
  if (token.startsWith('cashu:')) token = token.slice(6);
  if (!token || !token.startsWith('cashuA') && !token.startsWith('cashuB')) { statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Paste a valid Cashu token (starts with cashuA or cashuB)</div>'; return; }
  if (!await walletRuntime.cashuHasWalletSeed?.()) {
    await _ensureWalletSeed(() => {
      _renderWalletFundUI();
      return _receiveRoutstrWalletCashu(token);
    });
    return;
  }
  await _receiveRoutstrWalletCashu(token, input, statusEl);
}

async function _receiveRoutstrWalletCashu(
  token,
  input = /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (null),
  statusEl = /** @type {HTMLElement | null} */ (null)
) {
  statusEl = statusEl || document.getElementById('routstr-wfund-status');
  input = input || _getWalletInput('routstr-wcashu-input');
  if (statusEl) statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Depositing to wallet\u2026</div>';
  try {
    const result = await walletRuntime.cashuReceiveToken(token);
    if (input) input.value = '';
    const fundArea = document.getElementById('routstr-wallet-fund-area');
    if (fundArea) { fundArea.style.display = 'none'; _setActiveWalletAction(null); }
    showNotification('Wallet funded \u26a1 +' + result.received + ' sats' + (result.fee > 0 ? ' (' + result.fee + ' fee)' : ''), 'success');
    _refreshRoutstrWalletBalance();
  } catch (e) {
    if (statusEl) statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(getErrorMessage(e)) + '</div>';
    else showNotification(getErrorMessage(e, String(e)), 'error');
  }
}

export async function showRoutstrMintEdit() {
  const area = document.getElementById('routstr-mint-edit');
  if (!area) return;
  if (area.style.display !== 'none') { area.style.display = 'none'; return; }
  const currentMint = await walletRuntime.cashuGetMintUrl();
  const nodeUrl = walletRuntime.nostrGetSelectedNode?.() || '';
  let nodeMints = [];
  if (nodeUrl) {
    try {
      nodeMints = await getNodeMints(nodeUrl);
    } catch {}
  }
  const savedMints = await walletRuntime.cashuGetWalletMints();
  area.style.display = 'block';
  area.innerHTML = walletMintPickerHtml(currentMint, savedMints, nodeMints);
}

export async function chooseRoutstrNodeMint(mint) {
  const area = document.getElementById('routstr-mint-edit');
  if (area) area.style.display = 'none';
  await showRoutstrMintEdit();
  const input = _getWalletInput('routstr-mint-input');
  if (input) { input.value = mint; input.dispatchEvent(new Event('input', { bubbles: true })); }
  area?.scrollIntoView({ block: 'nearest' });
  /** @type {HTMLElement | null} */ (area?.querySelector('[data-routstr-wallet-action="save-mint"]'))?.focus({ preventScroll: true });
}

export async function doRoutstrMintChange() {
  const input = _getWalletInput('routstr-mint-input');
  const statusEl = document.getElementById('routstr-mint-status');
  if (!input || !statusEl) return;
  const url = input.value.trim().replace(/\/+$/, '');
  // Mint URL must be public HTTPS - block loopback / RFC1918 / link-local so
  // a malicious paste can't make the browser probe internal services.
  if (!url || !isValidExternalUrl(url)) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Enter a valid public mint URL (https://...)</div>';
    return;
  }
  statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Checking mint\u2026</div>';
  try {
    const savedMints = await walletRuntime.cashuGetWalletMints();
    // Saved balances and token exports must remain accessible while offline.
    if (!savedMints.some(entry => entry.mint === url)) {
      const res = await fetch(url + '/v1/info', { redirect: 'error', signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error('Mint not reachable');
      const info = await res.json();
      if (!info.nuts) throw new Error('Not a valid Cashu mint');
    }
    await walletRuntime.cashuSetMintUrl(url);
    const label = document.getElementById('routstr-mint-label');
    if (label) label.textContent = url.replace(/^https?:\/\//, '');
    const mintEdit = document.getElementById('routstr-mint-edit'); if (mintEdit) mintEdit.style.display = 'none';
    const fundArea = document.getElementById('routstr-wallet-fund-area');
    if (fundArea) { fundArea.innerHTML = ''; fundArea.style.display = 'none'; }
    _setActiveWalletAction(null);
    await _refreshRoutstrWalletBalance();
    const nodePicker = document.getElementById('routstr-node-picker');
    if (nodePicker) { nodePicker.innerHTML = ''; nodePicker.style.display = 'none'; }
    _setActiveNodeAction(null);
    showNotification('Mint selected: ' + url.replace(/^https?:\/\//, ''), 'success');
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(getErrorMessage(e)) + '</div>';
  }
}

export async function showRoutstrWalletBackup() {
  _setActiveWalletAction('backup');
  try {
    const token = await walletRuntime.cashuExportWallet();
    if (!token) { showNotification('Wallet is empty', 'info'); _setActiveWalletAction(null); return; }
    await navigator.clipboard.writeText(token);
    showNotification('Wallet backup copied to clipboard (clears in 60s)', 'success');
    clearTimeout(_rsCashuBackupTimer);
    _rsCashuBackupTimer = setTimeout(() => navigator.clipboard.writeText(''), 60000);
  } catch (e) {
    showNotification('Backup failed: ' + getErrorMessage(e), 'error');
  }
  setTimeout(() => _setActiveWalletAction(null), 500);
}

export async function showRoutstrNodePicker() {
  const area = document.getElementById('routstr-node-picker');
  if (!area) return;
  if (area.style.display !== 'none' && area.dataset.mode === 'browse') { area.style.display = 'none'; return; }
  area.dataset.mode = 'browse';
  area.style.display = 'block';
  area.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">Searching Nostr relays\u2026</div>';
  try {
    const allNodes = await walletRuntime.nostrDiscoverNodes(true);
    const nodes = allNodes.filter(n => n.online);
    if (!nodes.length) {
      area.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--red)">No online nodes found (' + allNodes.length + ' discovered). Try again later.</div>';
      return;
    }
    area.innerHTML = '<div style="margin-top:8px">' + nodes.map(routstrNodePickerRowHtml).join('') + '</div>';
  } catch (e) {
    area.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--red)">' + escapeHTML(getErrorMessage(e)) + '</div>';
  }
}

let _nodeSelectionInFlight = false;
export async function connectRoutstrNode(nodeUrl) {
  if (_nodeSelectionInFlight) return;
  _nodeSelectionInFlight = true;
  try {
    nodeUrl = canonicalRoutstrUrl(nodeUrl);
    if (typeof walletCallbacks.requestProviderActivation === 'function' && !await walletCallbacks.requestProviderActivation('routstr', { endpoint: nodeUrl })) return;
    const previousNode = walletRuntime.nostrGetSelectedNode?.();
    const previousKey = previousNode && getRoutstrKey(previousNode);
    if (previousKey && previousNode !== nodeUrl) await saveRoutstrKey(previousKey, previousNode);
    walletRuntime.nostrSetSelectedNode(nodeUrl);
    clearRoutstrModelCaches();
    const models = await fetchRoutstrModels();
    const panel = document.getElementById('ai-provider-panel');
    const html = _renderRoutstrPanel('routstr');
    if (panel && html) panel.innerHTML = html;
    if (models.length) _renderRoutstrModelDropdown(models);
    await _refreshRoutstrWalletBalance();
    refreshRoutstrBalance();
    const picker = document.getElementById('routstr-node-picker');
    if (picker) picker.style.display = 'none';
    showNotification('Selected ' + nodeUrl.replace(/^https?:\/\//, ''), 'success');
    if (!getRoutstrKey(nodeUrl)) await showRoutstrNodeDeposit(nodeUrl);
  } catch (e) {
    showNotification(getErrorMessage(e), 'error');
  } finally { _nodeSelectionInFlight = false; }
}

async function getNodeMints(nodeUrl) {
  const response = await fetch(canonicalRoutstrUrl(nodeUrl) + '/v1/info', { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Could not check this node’s accepted mints. Try again.');
  const info = await response.json();
  if (info.mints == null) return [];
  if (!Array.isArray(info.mints) || info.mints.some(mint => typeof mint !== 'string' || !isValidExternalUrl(mint))) throw new Error('Node returned an invalid mint list.');
  return [...new Set(info.mints.map(mint => mint.trim().replace(/\/+$/, '')))];
}

export async function showRoutstrNodeDeposit(nodeUrl) {
  nodeUrl = canonicalRoutstrUrl(nodeUrl);
  const picker = document.getElementById('routstr-node-picker');
  if (picker) { picker.style.display = 'block'; picker.dataset.mode = 'deposit'; }
  const nodeLabel = escapeHTML(nodeUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''));
  if (picker) picker.innerHTML = `<div style="margin-top:8px;padding:10px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--accent)">
    <div style="font-size:11px;color:var(--text-muted)">Checking ${nodeLabel}\u2026</div>
  </div>`;

  let nodeMints;
  try { nodeMints = await getNodeMints(nodeUrl); }
  catch (e) { if (picker) picker.textContent = getErrorMessage(e); return; }
  const currentMint = (await walletRuntime.cashuGetMintUrl()).replace(/\/+$/, '');
  const walletBalance = await walletRuntime.cashuGetBalance();
  if (nodeMints.length > 0 && !nodeMints.includes(currentMint)) {
    const savedMints = await walletRuntime.cashuGetWalletMints();
    if (picker) picker.innerHTML = `<div class="routstr-mint-panel">
      <div class="routstr-mint-heading">Choose a mint for this node</div>
      <p class="routstr-mint-help">This node accepts a different mint. Select one below to continue.</p>
      <div class="routstr-mint-preserved"><span class="routstr-mint-row-copy"><span class="routstr-mint-section-label">Your current mint</span><span class="routstr-mint-name">${escapeHTML(currentMint.replace(/^https?:\/\//, ''))}</span></span><span class="routstr-mint-amount">${walletBalance.toLocaleString()} <span>sats</span></span></div>
      <p class="routstr-mint-help">These funds stay available in Mints &amp; balances.</p>
      <div class="routstr-mint-section-label">Accepted mints</div>
      <div class="routstr-mint-list">${nodeMints.map(mint => walletMintRowHtml(mint, { balance: savedMints.find(entry => entry.mint === mint)?.balance ?? null, action: 'choose-node-mint' })).join('')}</div>
      <p class="routstr-mint-help">You can review your choice before switching. Fund the selected mint if its balance is empty.</p>
    </div>`;
    return;
  }
  if (walletBalance < 1) {
    if (picker) picker.innerHTML = '<div class="routstr-mint-panel"><p class="routstr-mint-help">This mint has no funds yet. Use <strong>Deposit</strong> in the Wallet section above to add sats.</p></div>';
    return;
  }
  const presets = [500, 1000, 2500, 5000].filter(v => v <= walletBalance);
  if (picker) picker.innerHTML = `<div style="margin-top:8px;padding:10px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--accent)">
    <div style="font-size:12px;margin-bottom:6px">Deposit to <strong>${nodeLabel}</strong></div>
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Wallet: \u26a1 ${walletBalance.toLocaleString()} sats</div>
    <div style="display:flex;gap:4px;align-items:center;margin-bottom:4px">
      <input type="number" class="api-key-input" id="routstr-deposit-amount" placeholder="sats" style="font-size:11px;flex:1" min="1" max="${walletBalance}">
      <button class="import-btn import-btn-primary" style="white-space:nowrap" data-routstr-wallet-action="deposit-node-input" data-node-url="${escapeAttr(nodeUrl)}">Deposit</button>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:4px">
      ${presets.map(v => `<button class="import-btn import-btn-secondary" style="flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" data-routstr-wallet-action="deposit-node-preset" data-node-url="${escapeAttr(nodeUrl)}" data-amount="${v}">\u26a1 ${v.toLocaleString()}</button>`).join('')}
      ${walletBalance > 0 ? `<button class="import-btn import-btn-secondary" style="flex:1;background:rgba(99,135,255,0.12);color:var(--accent);border-color:rgba(99,135,255,0.25)" data-routstr-wallet-action="deposit-node-preset" data-node-url="${escapeAttr(nodeUrl)}" data-amount="${walletBalance}">All (${walletBalance.toLocaleString()})</button>` : ''}
    </div>
    <div id="routstr-deposit-status" style="margin-top:6px"></div>
  </div>`;
}

let _rsConnecting = false;

export async function doRoutstrNodeDeposit(nodeUrl, amount) {
  if (_rsConnecting) return;
  _rsConnecting = true;
  const statusEl = document.getElementById('routstr-deposit-status');
  if (!amount || amount < 1 || isNaN(amount)) {
    _rsConnecting = false;
    if (statusEl) statusEl.innerHTML = '<div style="font-size:11px;color:var(--red)">Enter a valid amount</div>';
    return;
  }
  if (statusEl) statusEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted)">Depositing ' + amount.toLocaleString() + ' sats\u2026</div>';
  try {
    const nodeMints = await getNodeMints(nodeUrl);
    const currentMint = (await walletRuntime.cashuGetMintUrl()).replace(/\/+$/, '');
    if (nodeMints.length > 0 && !nodeMints.includes(currentMint)) throw new Error('Select a mint accepted by this node before depositing. Your other balances remain available.');
  } catch (e) {
    _rsConnecting = false;
    if (statusEl) statusEl.textContent = getErrorMessage(e);
    return;
  }
  if (typeof walletCallbacks.requestProviderActivation === 'function' && !await walletCallbacks.requestProviderActivation('routstr', { endpoint: nodeUrl })) { if (statusEl) statusEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted)">Node verified — AI not activated</div>'; _rsConnecting = false; return; }
  try {
    nodeUrl = canonicalRoutstrUrl(nodeUrl);
    const existingKey = getRoutstrKey(nodeUrl);
    const result = await walletRuntime.cashuDepositToNode(nodeUrl, amount, existingKey);
    walletRuntime.nostrSetSelectedNode(nodeUrl);
    if (result.api_key) {
      clearRoutstrModelCaches();
    }
    const models = await fetchRoutstrModels();
    showNotification('Connected to ' + nodeUrl.replace(/^https?:\/\//, '') + ' \u26a1 ' + amount.toLocaleString() + ' sats', 'success');
    const panel = document.getElementById('ai-provider-panel');
    const panelHtml = _renderRoutstrPanel('routstr');
    if (panel && panelHtml) panel.innerHTML = panelHtml;
    if (models.length) _renderRoutstrModelDropdown(models);
    _refreshRoutstrWalletBalance();
    refreshRoutstrBalance();
    _returnToChatIfOnboarding();
  } catch (e) {
    if (statusEl) statusEl.innerHTML = '<div style="font-size:11px;color:var(--red)">' + escapeHTML(getErrorMessage(e)) + '</div>';
    _refreshRoutstrWalletBalance();
    if (walletRuntime.cashuRecoverPendingDeposit) walletRuntime.cashuRecoverPendingDeposit().then(function(token) {
      if (!token) return;
      const area = document.getElementById('routstr-wallet-fund-area');
      if (!area) return;
      area.style.display = 'block';
      area.innerHTML = '<div style="padding:8px;background:rgba(255,160,0,0.1);border:1px solid var(--yellow, #f0a800);border-radius:6px;margin-top:8px">' +
        '<div style="font-size:11px;color:var(--yellow, #f0a800);margin-bottom:4px">\u26a0 Deposit outcome unconfirmed</div>' +
        '<div style="font-size:10px;color:var(--text-muted);margin-bottom:6px">The node may have received this deposit. Check the node account or reclaim this token only if it remains unspent:</div>' +
        '<div style="display:flex;gap:4px">' +
        '<button class="import-btn import-btn-primary" style="flex:1" data-routstr-wallet-action="recover-pending-deposit" data-token="' + escapeAttr(token) + '">Recover to Wallet</button>' +
        '<button class="import-btn import-btn-secondary"  data-routstr-wallet-action="copy-clipboard" data-clipboard-text="' + escapeAttr(token) + '" data-copied-text="\u2713 Copied">Copy Token</button>' +
        '</div></div>';
    });
  }
  _rsConnecting = false;
}

let _nodeRefundInFlight = false;
export async function doRoutstrNodeWithdraw(nodeUrl) {
  if (_nodeRefundInFlight) return;
  const target = typeof nodeUrl === 'string' ? nodeUrl : walletRuntime.nostrGetSelectedNode?.();
  if (!await walletRuntime.cashuHasWalletSeed?.()) {
    await _ensureWalletSeed(() => doRoutstrNodeWithdraw(target));
    return;
  }
  if (_nodeRefundInFlight) return;
  _nodeRefundInFlight = true;
  const picker = document.getElementById('routstr-node-picker');
  if (picker) { picker.style.display = 'block'; picker.textContent = 'Checking node refund…'; }
  let token = '';
  try {
    const refund = await walletRuntime.cashuRefundNodeToToken(target);
    token = refund.token;
    const result = await walletRuntime.cashuReceiveToken(token);
    await walletRuntime.cashuFinishNodeRefund(token);
    showNotification('Withdrawn ⚡ ' + Number(result.received).toLocaleString() + ' sats to wallet', 'success');
    if (picker) picker.textContent = 'Node refund received in your wallet.';
    _refreshRoutstrWalletBalance();
    refreshRoutstrBalance();
  } catch (error) {
    token = token || /** @type {{recoveryToken?: string}} */ (error)?.recoveryToken || '';
    if (picker) {
      picker.innerHTML = '<div class="routstr-wallet-message routstr-wallet-message-error" role="status">' + escapeHTML(getErrorMessage(error)) + '</div>';
      if (token) picker.innerHTML += '<p class="routstr-wallet-help" id="routstr-refund-token-hint">Keep this refund token until recovery succeeds.</p><textarea class="api-key-input routstr-refund-token" aria-label="Node refund recovery token" aria-describedby="routstr-refund-token-hint" readonly>' + escapeHTML(token) + '</textarea>';
      picker.innerHTML += '<button class="import-btn import-btn-primary" data-routstr-wallet-action="resume-node-refund" data-node-url="' + escapeAttr(target || '') + '">Retry refund recovery</button>';
    }
  } finally { _nodeRefundInFlight = false; }
}

let _walletBalanceRefresh = 0;
async function _refreshRoutstrWalletBalance(localOnly = false) {
  const request = ++_walletBalanceRefresh;
  refreshWalletSeedStatus();
  const el = document.getElementById('routstr-wallet-balance');
  if (!el) return;
  try {
    const mint = await walletRuntime.cashuGetMintUrl?.();
    const balance = await (localOnly ? walletRuntime.cashuGetLocalBalance() : walletRuntime.cashuGetBalance());
    const currentMint = await walletRuntime.cashuGetMintUrl?.();
    if (request !== _walletBalanceRefresh || el !== document.getElementById('routstr-wallet-balance')) return;
    if (mint !== currentMint) return _refreshRoutstrWalletBalance(localOnly);
    el.textContent = '\u26a1 ' + balance.toLocaleString() + ' sats';
    const mintEl = document.getElementById('routstr-mint-label');
    if (mintEl && mint) mintEl.textContent = mint.replace(/^https?:\/\//, '').replace(/\/$/, '');
  } catch {
    if (request === _walletBalanceRefresh) el.textContent = '\u26a1 balance unavailable';
  }
}

export async function refreshWalletSeedStatus() {
  const el = document.getElementById('routstr-wallet-device-status');
  if (!el || typeof walletRuntime.cashuHasWalletSeed !== 'function') return;
  try {
    const ready = await walletRuntime.cashuHasWalletSeed();
    el.textContent = ready ? '12-word wallet seed set up on this device' : 'No 12-word wallet seed on this device';
    el.style.color = ready ? 'var(--green)' : 'var(--yellow, #f0a800)';
  } catch {
    el.textContent = 'Local wallet setup unavailable';
    el.style.color = 'var(--red)';
  }
}

export function _setActiveNodeAction(actionId) {
  const el = document.getElementById('routstr-node-actions');
  const nodeUrl = walletRuntime.nostrGetSelectedNode?.() || '';
  const hasKey = !!getRoutstrKey();
  if (el) el.innerHTML = buildRoutstrNodeActions(nodeUrl, hasKey, actionId);
}

let _activeWalletAction = null;

function _setActiveWalletAction(actionId) {
  _activeWalletAction = actionId;
  const el = document.getElementById('routstr-wallet-actions');
  if (el) el.innerHTML = routstrWalletActionButtons(actionId);
}

async function _ensureWalletSeed(thenAction) {
  const hasSeed = await walletRuntime.cashuHasWalletSeed?.();
  if (hasSeed) { await thenAction(); return true; }
  const area = document.getElementById('routstr-wallet-fund-area');
  if (!area) return false;
  area.style.display = 'block';
  const { mnemonic } = await walletRuntime.cashuGenerateWalletSeed();
  area.innerHTML = walletSeedOnboardingHtml(mnemonic);
  _walletSeedThenAction = thenAction;
  return false;
}

export function walletSeedAcknowledged() {
  const area = document.getElementById('routstr-wallet-fund-area');
  if (area) area.style.display = 'none';
  if (_walletSeedThenAction) {
    const thenAction = _walletSeedThenAction;
    _walletSeedThenAction = null;
    Promise.resolve(thenAction()).catch(e => showNotification(e?.message || String(e), 'error'));
  }
  refreshWalletSeedStatus();
}

export async function setupRoutstrWalletSeed() {
  await _ensureWalletSeed(async () => {
    showNotification('Local Cashu wallet is ready', 'success');
    await showWalletSeedPhrase();
  });
}

export async function showWalletSeedPhrase() {
  const area = document.getElementById('routstr-wallet-fund-area');
  if (!area) return;
  if (area.style.display !== 'none' && _activeWalletAction === 'seed') { area.style.display = 'none'; _setActiveWalletAction(null); return; }
  _setActiveWalletAction('seed');
  area.style.display = 'block';
  const mnemonic = await walletRuntime.cashuGetWalletMnemonic?.();
  area.innerHTML = mnemonic ? walletSeedManagementHtml(mnemonic) : walletSeedMissingHtml();
}

export async function showRoutstrWithdraw() {
  const area = document.getElementById('routstr-wallet-fund-area');
  if (!area) return;
  if (area.style.display !== 'none' && _activeWalletAction === 'withdraw') { area.style.display = 'none'; _setActiveWalletAction(null); return; }
  _setActiveWalletAction('withdraw');
  area.style.display = 'block';
  const balance = await walletRuntime.cashuGetBalance();
  area.innerHTML = walletWithdrawHtml(balance);
}

export function showRoutstrWithdrawLightning() {
  const statusEl = document.getElementById('routstr-withdraw-status');
  if (!statusEl) return;
  statusEl.innerHTML = walletWithdrawLightningHtml();
  const input = _getWalletInput('routstr-withdraw-input');
  input?.addEventListener('input', () => {
    const val = input.value.trim();
    const needsAmount = val.includes('@') && !val.match(/^ln(bc|tb|bcrt)/);
    const amount = document.getElementById('routstr-withdraw-ln-amount');
    if (amount) amount.style.display = needsAmount ? 'block' : 'none';
  });
}

export async function showRoutstrWithdrawToken() {
  const statusEl = document.getElementById('routstr-withdraw-status');
  if (!statusEl) return;
  const balance = await walletRuntime.cashuGetBalance();
  const presets = [100, 500, 1000, 2500].filter(v => v <= balance);
  statusEl.innerHTML = walletWithdrawTokenHtml(balance, presets);
}

export async function doRoutstrSendToken(amount) {
  const resultEl = document.getElementById('routstr-token-result');
  if (!resultEl) return;
  if (!amount || amount < 1 || isNaN(amount)) {
    resultEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Enter a valid amount</div>';
    return;
  }
  resultEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Creating token\u2026</div>';
  try {
    const result = await walletRuntime.cashuSendAsToken(amount);
    resultEl.innerHTML = `<div style="margin-top:6px">
      <div style="font-size:11px;color:var(--green);margin-bottom:4px">\u2713 Token created \u2014 \u26a1 ${result.amount.toLocaleString()} sats</div>
      <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">Copy and share. Sats are deducted from your wallet now.</div>
      <textarea class="api-key-input" style="font-size:10px;font-family:monospace;height:60px;resize:none;user-select:all" readonly data-routstr-wallet-action="select-textarea">${escapeHTML(result.token)}</textarea>
      <button class="import-btn import-btn-secondary" style="margin-top:4px;width:100%" data-routstr-wallet-action="copy-clipboard" data-clipboard-text="${escapeAttr(result.token)}" data-copied-text="\u2713 Copied (60s)" data-clear-timer="_tokenClipTimer">Copy Token</button>
    </div>`;
    // Rendering/copying is not delivery. Retain the journal until spent or reclaimed.
    showNotification('\u26a1 ' + result.amount.toLocaleString() + ' sats token ready', 'success');
    _refreshRoutstrWalletBalance();
  } catch (e) {
    resultEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(getErrorMessage(e)) + '</div>';
  }
}

export async function doRoutstrWithdrawQuote() {
  const input = _getWalletInput('routstr-withdraw-input');
  const statusEl = document.getElementById('routstr-withdraw-status');
  if (!input || !statusEl) return;
  const val = input.value.trim();
  if (!val) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Enter a Lightning invoice or address</div>';
    return;
  }
  const isAddress = val.includes('@') && !val.match(/^ln(bc|tb|bcrt)/);
  if (isAddress) {
    const amountInput = _getWalletInput('routstr-withdraw-amount');
    const amount = parseInt(amountInput?.value || '', 10) || 0;
    if (!amount || amount < 1) {
      statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Enter an amount in sats</div>';
      return;
    }
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Withdrawing to ' + escapeHTML(val) + '\u2026</div>';
    try {
      const withdrawal = await walletRuntime.cashuWithdrawToAddress(val, amount);
      if (!withdrawal.paid) throw new Error('Payment is still awaiting confirmation');
      statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--green)">\u2713 Sent ' + withdrawal.amount.toLocaleString() + ' sats to ' + escapeHTML(val) + '</div>';
      showNotification('Withdrawal complete', 'success');
      _refreshRoutstrWalletBalance();
    } catch (e) {
      statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(getErrorMessage(e)) + '</div>';
    }
    return;
  }
  if (!val.match(/^ln(bc|tb|bcrt)/)) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Enter a Lightning invoice (lnbc\u2026) or address (user@domain)</div>';
    return;
  }
  statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Checking fee\u2026</div>';
  try {
    const quote = await walletRuntime.cashuCreateWithdrawQuote(val);
    statusEl.innerHTML = `<div style="margin-top:6px;padding:8px;background:var(--bg-primary);border-radius:6px;border:1px solid var(--border)">
      <div style="font-size:11px;color:var(--text-muted)">Amount: <strong>${quote.amount.toLocaleString()} sats</strong></div>
      <div style="font-size:11px;color:var(--text-muted)">Fee reserve: <strong>${quote.fee_reserve.toLocaleString()} sats</strong></div>
      <div style="font-size:11px;color:var(--text-muted)">Total: <strong>${(quote.amount + quote.fee_reserve).toLocaleString()} sats</strong></div>
      <button class="import-btn import-btn-primary" style="margin-top:6px;width:100%" data-routstr-wallet-action="withdraw-execute" data-quote-id="${escapeAttr(quote.quote)}">Confirm Withdraw</button>
    </div>`;
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(getErrorMessage(e)) + '</div>';
  }
}

export async function doRoutstrWithdrawExecute(quoteId) {
  const statusEl = document.getElementById('routstr-withdraw-status');
  if (!statusEl) return;
  statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Withdrawing\u2026</div>';
  try {
    const result = await walletRuntime.cashuExecuteWithdraw(quoteId);
    if (!result.paid) throw new Error('Payment is still awaiting confirmation');
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--green)">\u2713 Withdrawn! Lightning payment sent.</div>';
    showNotification('Withdrawal complete', 'success');
    _refreshRoutstrWalletBalance();
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(getErrorMessage(e)) + '</div>';
  }
}

export async function doRoutstrWalletRestore() {
  const input = _getWalletInput('routstr-restore-seed');
  const statusEl = document.getElementById('routstr-restore-status');
  if (!input || !statusEl) return;
  const mnemonic = input.value.trim().toLowerCase();
  const words = mnemonic.split(/\s+/);
  if (words.length !== 12) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">Enter exactly 12 words</div>';
    return;
  }
  statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--text-muted)">Restoring from mint\u2026 (this may take a moment)</div>';
  try {
    const result = await walletRuntime.cashuRestoreWalletFromSeed(mnemonic);
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--green)">\u2713 Restored! Balance: \u26a1 ' + result.balance.toLocaleString() + ' sats</div>';
    showNotification('Wallet restored', 'success');
    _refreshRoutstrWalletBalance();
  } catch (e) {
    statusEl.innerHTML = '<div style="margin-top:4px;font-size:11px;color:var(--red)">' + escapeHTML(getErrorMessage(e)) + '</div>';
  }
}

installRoutstrWalletDelegates({
  showRoutstrWalletFund,
  rsWalletFundCustomInput,
  doRoutstrWalletFundCustom,
  doRoutstrWalletFund,
  recoverPendingWalletFunding,
  doRoutstrWalletReceiveCashu,
  doRoutstrMintChange,
  showRoutstrWalletBackup,
  showRoutstrNodePicker,
  connectRoutstrNode,
  showRoutstrNodeDeposit,
  chooseRoutstrNodeMint,
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
  clearRoutstrNodeSession: () => saveRoutstrKey(''),
  doRoutstrWalletRestore
});
