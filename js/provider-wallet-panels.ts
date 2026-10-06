import type { WalletOperations, FundingMonitorReader, FundingRecoveryReader, MintInventoryOperations, NodeCatalogOperations, WalletCallbacks, PanelHTMLWriter } from '../types/provider-wallet-panels.js';
// provider-wallet-panels.js - Routstr/Cashu wallet UI and node funding actions

import { canonicalRoutstrUrl } from './routstr-validation.js';
import { nodeSessionRejectedHtml, startNewNodeSessionView, withdrawNodeToWallet, showSavedNodeRefunds } from './provider-wallet-refund-recovery.js';
import { getErrorMessage } from './caught-error.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { getAIProvider, getRoutstrKey, saveRoutstrKey, touchRoutstrSession, fetchRoutstrModels, getRoutstrBalance } from './api.js';
import { getChatBackend } from './agent-chat-settings.js';
import { isValidExternalUrl } from './url-safety.js';
import { installRoutstrWalletDelegates } from './provider-wallet-delegates.js';
import { createFundingMonitor, renderFundingInvoice, recoverPendingWalletFunding as recoverPendingWalletFundingImpl } from './provider-wallet-funding-recovery.js';
import { mountWalletFunding, getWalletFundingView, disposeWalletFunding } from './wallet-funding-component.js';
import { createWalletFundingController } from './wallet-funding-controller.js';
import type { WalletFundingView } from './wallet-funding-contract.js';
import { mountWalletSeed, getWalletSeedView, disposeWalletSeed } from './wallet-seed-component.js';
import { createWalletSeedController } from './wallet-seed-controller.js';
import type { WalletSeedView } from './wallet-seed-contract.js';
import { mountWalletMint, getWalletMintView, disposeWalletMint } from './wallet-mint-component.js';
import { createWalletMintController } from './wallet-mint-controller.js';
import { mountWalletExport, getWalletExportView, disposeWalletExport } from './wallet-export-component.js';
import { createWalletExportController } from './wallet-export-controller.js';
import { mountWalletWithdraw, getWalletWithdrawView, disposeWalletWithdraw } from './wallet-withdraw-component.js';
import { createWalletWithdrawController } from './wallet-withdraw-controller.js';
import { buildRoutstrNodeActions, routstrWalletActionButtons } from './provider-wallet-panel-buttons.js';
import {
  routstrNodePickerRowHtml,
  walletMintRowHtml,
} from './provider-wallet-panel-renderers.js';
import { clearRoutstrModelCaches } from './routstr-model-cache.js';
import {
  clearRoutstrBalanceSettlementTimers,
  installRoutstrBalanceSettlementRefresh,
} from './routstr-balance-settlement.js';
import { configureRoutstrWalletRuntime, walletRuntime } from './provider-wallet-runtime.js';

export { configureRoutstrWalletRuntime, walletRuntime };
export { buildRoutstrNodeActions, routstrWalletActionButtons };

const walletCallbacks: WalletCallbacks = {
  renderAIProviderPanel: null, renderRoutstrModelDropdown: null,
  initSettingsModelFetch: null, requestProviderActivation: null,
  returnToChatIfOnboarding: null
};

export function configureRoutstrWalletPanels(callbacks: unknown = {}) {
  Object.assign(walletCallbacks, callbacks);
}

function _renderRoutstrPanel(provider = 'routstr') {
  return typeof walletCallbacks.renderAIProviderPanel === 'function'
    ? (walletCallbacks.renderAIProviderPanel as (provider: string) => unknown)(provider)
    : '';
}

function _renderRoutstrModelDropdown(models: unknown) {
  if (typeof walletCallbacks.renderRoutstrModelDropdown === 'function') {
    (walletCallbacks.renderRoutstrModelDropdown as (models: unknown) => unknown)(models);
  }
}

function _returnToChatIfOnboarding() {
  if (typeof walletCallbacks.returnToChatIfOnboarding === 'function') {
    (walletCallbacks.returnToChatIfOnboarding as () => unknown)();
  }
}

let withdrawClipboardTimer: ReturnType<typeof setTimeout> | null = null;
let exportClipboardTimer: ReturnType<typeof setTimeout> | null = null;
let walletAreaRevision = 0;
let seedClipboardTimer: ReturnType<typeof setTimeout> | null = null;
function invalidateWalletArea(): void {
  ++walletAreaRevision; seed.reset(); disposeWalletSeed(); disposeWalletFunding(); disposeWalletExport(); disposeWalletWithdraw();
}

function _rsBalanceHtml(sats: number) {
  const color = sats < 100 ? 'var(--red)' : sats < 500 ? 'var(--yellow, #f0a800)' : 'var(--green)';
  return 'Balance: <span style="color:' + color + '">\u26a1 ' + sats.toLocaleString() + ' sats</span>';
}

function ownsWalletBalance(el: HTMLElement, request: number): boolean {
  return request === _walletBalanceRefresh && isRoutstrActive() && el.isConnected && document.getElementById('routstr-wallet-balance') === el;
}
function walletBalanceText(value: unknown): string {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('Invalid wallet balance');
  return '\u26a1 ' + value.toLocaleString() + ' sats';
}
export async function refreshCashuWalletBalance() {
  const el = document.getElementById('routstr-wallet-balance');
  if (!el || !isRoutstrActive()) return;
  const request = ++_walletBalanceRefresh;
  el.textContent = '\u26a1 verifying...'; refreshWalletSeedStatus();
  try {
    const mint = await (walletRuntime as WalletOperations).cashuGetMintUrl();
    if (!ownsWalletBalance(el, request)) return;
    if (typeof mint !== 'string' || !isValidExternalUrl(mint)) throw new Error('Invalid wallet mint');
    const balance = await (walletRuntime as WalletOperations).cashuCheckProofStates(mint);
    const selected = await (walletRuntime as WalletOperations).cashuGetMintUrl();
    if (!ownsWalletBalance(el, request)) return;
    if (mint !== selected) { await _refreshRoutstrWalletBalance(true); return; }
    el.textContent = walletBalanceText(balance);
  } catch {
    // The selected mint may have changed while a verification waited for the
    // wallet lock. Read its local balance without issuing a new forced check.
    if (ownsWalletBalance(el, request)) await _refreshRoutstrWalletBalance(true, '⚡ check failed');
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

function isRoutstrActive() {
  return getAIProvider() === 'routstr' && getChatBackend() === 'direct';
}
const withdraw = createWalletWithdrawController({
  view: getWalletWithdrawView, isActive: isRoutstrActive,
  mint: async () => String(await (walletRuntime as WalletOperations).cashuGetMintUrl()),
  balance: () => (walletRuntime as WalletOperations).cashuGetBalance(),
  maximum: mint => (walletRuntime as WalletOperations).cashuGetMaxWithdrawable(mint),
  quote: (invoice, mint) => (walletRuntime as WalletOperations).cashuCreateWithdrawQuote(invoice, mint),
  execute: (quote, mint) => (walletRuntime as WalletOperations).cashuExecuteWithdraw(quote, mint),
  address: (address, amount, mint) => (walletRuntime as WalletOperations).cashuWithdrawToAddress(address, amount, mint),
  send: (amount, mint) => (walletRuntime as WalletOperations).cashuSendAsToken(amount, mint),
  recover: () => (walletRuntime as WalletOperations).cashuRecoverPendingWithdraw(),
  tokenMint: token => (walletRuntime as WalletOperations).cashuGetTokenMintUrl(token),
  receive: token => (walletRuntime as WalletOperations).cashuReceiveToken(token),
  clearRecovery: () => (walletRuntime as WalletOperations).cashuClearPendingWithdraw(),
  writeClipboard: text => navigator.clipboard.writeText(text),
  scheduleClear: clear => { if (withdrawClipboardTimer) clearTimeout(withdrawClipboardTimer); withdrawClipboardTimer = setTimeout(clear, 60000); },
  refreshBalance: () => _refreshRoutstrWalletBalance(), notify: showNotification,
});
const funding = createWalletFundingController({
  view: getWalletFundingView, isActive: isRoutstrActive,
  mint: async () => String(await (walletRuntime as WalletOperations).cashuGetMintUrl()),
  createInvoice: amount => (walletRuntime as WalletOperations).cashuCreateFundingInvoice(amount),
  receiveToken: token => (walletRuntime as WalletOperations).cashuReceiveToken(token),
  renderInvoice: renderFundingInvoice, startMonitor: () => startRoutstrFundingMonitor({ recheck: true }),
  refreshBalance: () => _refreshRoutstrWalletBalance(), notify: showNotification,
  writeClipboard: text => navigator.clipboard.writeText(text),
  close: view => closeWalletFunding(view),
});
const fundingMonitor = (createFundingMonitor as FundingMonitorReader)(walletRuntime as WalletOperations, () => _refreshRoutstrWalletBalance(true), result => funding.acceptResult(result), isRoutstrActive);
function closeWalletFunding(view: WalletFundingView): void {
  if (view !== getWalletFundingView()) return;
  invalidateWalletArea();
  const area = document.getElementById('routstr-wallet-fund-area'); if (area) area.style.display = 'none';
  _setActiveWalletAction(null);
}
export function startRoutstrFundingMonitor(options: Parameters<ReturnType<typeof createFundingMonitor>['start']>[0] = {}) {
  if (isRoutstrActive()) fundingMonitor.start(options);
  else fundingMonitor.stop();
}
for (const event of ['labcharts-ai-settings-local-changed', 'labcharts-ai-settings-synced', 'getbased:chat-backend-changed', 'storage']) {
  globalThis.addEventListener?.(event, () => startRoutstrFundingMonitor());
}

export function clearRoutstrWalletTimers() {
  ++_walletBalanceRefresh; invalidateWalletArea();
  const area = document.getElementById('routstr-wallet-fund-area'); if (area) area.style.display = 'none';
  _setActiveWalletAction(null);
  disposeWalletMint(); const mintArea = document.getElementById('routstr-mint-edit'); if (mintArea) mintArea.style.display = 'none';
  clearRoutstrBalanceSettlementTimers();
}

export function showRoutstrWalletFund() {
  const area = document.getElementById('routstr-wallet-fund-area');
  if (!area) return;
  if (area.style.display !== 'none' && _activeWalletAction === 'deposit') { invalidateWalletArea(); area.style.display = 'none'; _setActiveWalletAction(null); return; }
  invalidateWalletArea();
  _setActiveWalletAction('deposit');
  _ensureWalletSeed(() => _renderWalletFundUI());
}

async function _renderWalletFundUI() {
  const area = document.getElementById('routstr-wallet-fund-area'); if (!area) return;
  area.style.display = 'block';
  ++walletAreaRevision; disposeWalletExport();
  const fee = Number((walletRuntime as WalletOperations).cashuGetFeePct?.()) || 0;
  const view = mountWalletFunding(area, fee, {
    submitCustom: () => funding.custom(),
    cancelCustom: () => { const current = getWalletFundingView(); if (current && !current.getState().pending) current.setState({ ...current.getState(), custom: false }); },
  });
  startRoutstrFundingMonitor();
  await funding.showCached(view);
}
export function rsWalletFundCustomInput() {
  const view = getWalletFundingView(); if (!view || view.getState().pending) return;
  view.setState({ ...view.getState(), custom: true }); view.focusCustomAmount();
}
export function doRoutstrWalletFundCustom() { funding.custom(); }
export function doRoutstrWalletFund(amountSats: number) { return funding.fund(amountSats); }
export function copyRoutstrFundingInvoice() { return funding.copy(); }
export async function recoverPendingWalletFunding() {
  return (recoverPendingWalletFundingImpl as FundingRecoveryReader)(walletRuntime as WalletOperations, _refreshRoutstrWalletBalance, result => funding.acceptResult(result));
}
export async function doRoutstrWalletReceiveCashu() {
  const view = getWalletFundingView(); if (!view) return;
  const token = view.readToken().trim().replace(/^cashu:/, '');
  if (!/^cashu[AB]/.test(token)) { await funding.receive(token); return; }
  if (!await (walletRuntime as WalletOperations).cashuHasWalletSeed?.()) {
    if (view !== getWalletFundingView()) return;
    await _ensureWalletSeed(async () => { await _renderWalletFundUI(); await funding.receive(token); }); return;
  }
  if (view === getWalletFundingView()) await funding.receive(token);
}

const mints = createWalletMintController({
  view: getWalletMintView, isActive: isRoutstrActive,
  node: () => String((walletRuntime as WalletOperations).nostrGetSelectedNode?.() || ''),
  mint: async () => String(await (walletRuntime as WalletOperations).cashuGetMintUrl()),
  inventory: () => (walletRuntime as WalletOperations).cashuGetWalletMints(), accepted: getNodeMints,
  checkMint: async mint => {
    try { const response = await fetch(mint + '/v1/info', { redirect: 'error', signal: AbortSignal.timeout(20000) });
      if (!response.ok) return 'unreachable'; const info = await response.json() as { nuts?: unknown } | null;
      return info?.nuts && typeof info.nuts === 'object' ? 'valid' : 'invalid';
    } catch { return 'unreachable'; }
  },
  select: (mint, expectedMint) => (walletRuntime as WalletOperations).cashuSetMintUrl(mint, expectedMint),
  captureSelection: () => {
    const area = document.getElementById('routstr-wallet-fund-area'), revision = walletAreaRevision;
    const picker = document.getElementById('routstr-node-picker'), contents = picker?.firstChild, mode = picker?.dataset.mode;
    const node = (walletRuntime as WalletOperations).nostrGetSelectedNode?.();
    return async () => {
      if (!isRoutstrActive()) return;
      if (revision === walletAreaRevision && area?.isConnected && document.getElementById('routstr-wallet-fund-area') === area) {
        invalidateWalletArea(); area.replaceChildren(); area.style.display = 'none'; _setActiveWalletAction(null);
      }
      await _refreshRoutstrWalletBalance();
      const pendingRefund = await (walletRuntime as WalletOperations).cashuGetPendingNodeRefund?.();
      if (!pendingRefund && isRoutstrActive() && picker?.isConnected && picker === document.getElementById('routstr-node-picker') && picker.firstChild === contents && picker.dataset.mode === mode && node === (walletRuntime as WalletOperations).nostrGetSelectedNode?.()) {
        picker.replaceChildren(); picker.style.display = 'none'; _setActiveNodeAction(null);
      }
    };
  },
  close: () => closeWalletMint(), notify: showNotification,
});
function closeWalletMint(): void {
  disposeWalletMint(); const area = document.getElementById('routstr-mint-edit'); if (area) area.style.display = 'none';
}
async function openWalletMint(draft?: string): Promise<void> {
  const area = document.getElementById('routstr-mint-edit'); if (!area) return;
  area.style.display = 'block';
  const view = mountWalletMint(area, { save: () => mints.save(), cancel: closeWalletMint, reload: () => mints.load(view) });
  if (draft) view.setDraft(draft); await mints.load(view);
  if (draft && view.isCurrent()) { area.scrollIntoView({ block: 'nearest' }); view.focusSelect(); }
}
export async function showRoutstrMintEdit() {
  if (getWalletMintView()) { closeWalletMint(); return; } await openWalletMint();
}
export async function chooseRoutstrNodeMint(mint: string) { await openWalletMint(mint); }
export function doRoutstrMintChange() { return mints.save(); }
const walletExport = createWalletExportController({
  view: getWalletExportView, isActive: isRoutstrActive,
  mint: async () => String(await (walletRuntime as WalletOperations).cashuGetMintUrl()),
  export: mint => (walletRuntime as WalletOperations).cashuExportWallet(mint),
  writeClipboard: token => navigator.clipboard.writeText(token), notify: showNotification,
  scheduleClear: clear => { if (exportClipboardTimer) clearTimeout(exportClipboardTimer); exportClipboardTimer = setTimeout(clear, 60000); },
});
export async function showRoutstrWalletBackup() {
  invalidateWalletArea(); const area = document.getElementById('routstr-wallet-fund-area'); if (!area) return;
  _setActiveWalletAction('backup'); area.style.display = 'block';
  const view = mountWalletExport(area, { prepare: () => walletExport.prepare(view), copy: () => walletExport.copy(), close: () => {
    if (getWalletExportView() !== view) return; invalidateWalletArea(); area.style.display = 'none'; _setActiveWalletAction(null);
  } });
  await walletExport.prepare(view);
}

export async function showRoutstrNodePicker(forceRefresh = false) {
  const area = document.getElementById('routstr-node-picker');
  if (!area) return;
  if (!forceRefresh && area.style.display !== 'none' && area.dataset.mode === 'browse') { area.style.display = 'none'; return; }
  const refresh = '<div style="margin-top:8px"><button class="import-btn import-btn-secondary" data-routstr-wallet-action="node-action" data-node-action="refresh">Refresh nodes</button></div>';
  area.dataset.mode = 'browse';
  area.style.display = 'block';
  area.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">Searching Nostr relays\u2026</div>';
  try {
    const allNodes = await (walletRuntime as WalletOperations).nostrDiscoverNodes(forceRefresh) as NodeCatalogOperations;
    if (document.getElementById('routstr-node-picker') !== area || area.dataset.mode !== 'browse') return;
    const nodes = allNodes.filter(n => n.online);
    if (!nodes.length) {
      area.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--red)">No online nodes found (' + allNodes.length + ' discovered). Try again later.</div>' + refresh;
      return;
    }
    area.innerHTML = '<div style="margin-top:8px">' + nodes.map(routstrNodePickerRowHtml).join('') + '</div>' + refresh;
  } catch (e) {
    if (document.getElementById('routstr-node-picker') !== area || area.dataset.mode !== 'browse') return;
    area.innerHTML = '<div style="margin-top:8px;font-size:11px;color:var(--red)">' + escapeHTML(getErrorMessage(e)) + '</div>' + refresh;
  }
}

let _nodeSelectionInFlight = false;
export async function connectRoutstrNode(nodeUrl: string) {
  if (_nodeSelectionInFlight) return;
  _nodeSelectionInFlight = true;
  try {
    nodeUrl = canonicalRoutstrUrl(nodeUrl);
    if (typeof walletCallbacks.requestProviderActivation === 'function' && !await (walletCallbacks.requestProviderActivation as (provider: string, options: {endpoint?: unknown}) => unknown)('routstr', { endpoint: nodeUrl })) return;
    const previousNode = (walletRuntime as WalletOperations).nostrGetSelectedNode?.() as string | null | undefined;
    const previousKey = previousNode && getRoutstrKey(previousNode);
    if (previousKey && previousNode !== nodeUrl) await saveRoutstrKey(previousKey, previousNode);
    (walletRuntime as WalletOperations).nostrSetSelectedNode(nodeUrl);
    clearRoutstrModelCaches();
    const models = await fetchRoutstrModels();
    const panel = document.getElementById('ai-provider-panel') as PanelHTMLWriter | null;
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

async function getNodeMints(nodeUrl: unknown) {
  const response = await fetch(canonicalRoutstrUrl(nodeUrl) + '/v1/info', { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Could not check this node’s accepted mints. Try again.');
  const info = await response.json() as {mints?: unknown};
  if (info.mints == null) return [];
  if (!Array.isArray(info.mints) || info.mints.some((mint: unknown) => typeof mint !== 'string' || !isValidExternalUrl(mint))) throw new Error('Node returned an invalid mint list.');
  return [...new Set(info.mints.map((mint: string) => mint.trim().replace(/\/+$/, '')))];
}

export async function showRoutstrNodeDeposit(nodeUrl: string) {
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
  const currentMint = (await (walletRuntime as WalletOperations).cashuGetMintUrl() as string).replace(/\/+$/, '');
  const walletBalance = await (walletRuntime as WalletOperations).cashuGetBalance() as number;
  if (nodeMints.length > 0 && !nodeMints.includes(currentMint)) {
    const savedMints = await (walletRuntime as WalletOperations).cashuGetWalletMints() as MintInventoryOperations;
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

export async function doRoutstrNodeDeposit(nodeUrl: string, amount: number) {
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
    const currentMint = (await (walletRuntime as WalletOperations).cashuGetMintUrl() as string).replace(/\/+$/, '');
    if (nodeMints.length > 0 && !nodeMints.includes(currentMint)) throw new Error('Select a mint accepted by this node before depositing. Your other balances remain available.');
  } catch (e) {
    _rsConnecting = false;
    if (statusEl) statusEl.textContent = getErrorMessage(e);
    return;
  }
  if (typeof walletCallbacks.requestProviderActivation === 'function' && !await (walletCallbacks.requestProviderActivation as (provider: string, options: {endpoint?: unknown}) => unknown)('routstr', { endpoint: nodeUrl })) { if (statusEl) statusEl.innerHTML = '<div style="font-size:11px;color:var(--text-muted)">Node verified — AI not activated</div>'; _rsConnecting = false; return; }
  try {
    nodeUrl = canonicalRoutstrUrl(nodeUrl);
    const existingKey = getRoutstrKey(nodeUrl);
    const result = await (walletRuntime as WalletOperations).cashuDepositToNode(nodeUrl, amount, existingKey) as {api_key?: unknown};
    (walletRuntime as WalletOperations).nostrSetSelectedNode(nodeUrl);
    if (result.api_key) {
      clearRoutstrModelCaches();
    }
    const models = await fetchRoutstrModels();
    showNotification('Connected to ' + nodeUrl.replace(/^https?:\/\//, '') + ' \u26a1 ' + amount.toLocaleString() + ' sats', 'success');
    const panel = document.getElementById('ai-provider-panel') as PanelHTMLWriter | null;
    const panelHtml = _renderRoutstrPanel('routstr');
    if (panel && panelHtml) panel.innerHTML = panelHtml;
    if (models.length) _renderRoutstrModelDropdown(models);
    _refreshRoutstrWalletBalance();
    refreshRoutstrBalance();
    _returnToChatIfOnboarding();
  } catch (e) {
    if (statusEl) statusEl.innerHTML = '<div style="font-size:11px;color:var(--red)">' + escapeHTML(getErrorMessage(e)) + '</div>';
    if ((e as { nodeSessionRejected?: unknown } | null)?.nodeSessionRejected) {
      if (statusEl) statusEl.innerHTML += nodeSessionRejectedHtml(nodeUrl);
      _rsConnecting = false;
      return;
    }
    _refreshRoutstrWalletBalance();
    if ((walletRuntime as WalletOperations).cashuRecoverPendingDeposit) (walletRuntime as WalletOperations).cashuRecoverPendingDeposit().then(function(token) {
      if (!token) return;
      const area = document.getElementById('routstr-wallet-fund-area');
      if (!area) return;
      invalidateWalletArea();
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

export function startNewRoutstrNodeSession(nodeUrl: string) {
  return startNewNodeSessionView(nodeUrl, node => (walletRuntime as WalletOperations).cashuStartNewNodeSession(node), showRoutstrNodeDeposit);
}

export function doRoutstrNodeWithdraw(nodeUrl?: unknown, recoveryId?: string, recoveryToken?: string, generation?: string) {
  return withdrawNodeToWallet(nodeUrl, recoveryId, recoveryToken, generation, _ensureWalletSeed, _refreshRoutstrWalletBalance, refreshRoutstrBalance);
}

let _walletBalanceRefresh = 0;
async function _refreshRoutstrWalletBalance(localOnly = false, failureText = '⚡ balance unavailable') {
  const request = ++_walletBalanceRefresh;
  refreshWalletSeedStatus();
  const el = document.getElementById('routstr-wallet-balance');
  if (!el || !isRoutstrActive()) return;
  try {
    const mint = await (walletRuntime as WalletOperations).cashuGetMintUrl?.() as string | null | undefined;
    if (!ownsWalletBalance(el, request)) return;
    const balance = await (localOnly ? (walletRuntime as WalletOperations).cashuGetLocalBalance() : (walletRuntime as WalletOperations).cashuGetBalance()) as {toLocaleString(): unknown};
    const currentMint = await (walletRuntime as WalletOperations).cashuGetMintUrl?.();
    if (!ownsWalletBalance(el, request)) return;
    if (mint !== currentMint) return _refreshRoutstrWalletBalance(localOnly);
    el.textContent = walletBalanceText(balance) + (failureText === '⚡ check failed' ? ' (saved balance; check failed)' : '');
    const mintEl = document.getElementById('routstr-mint-label');
    if (mintEl && mint) mintEl.textContent = mint.replace(/^https?:\/\//, '').replace(/\/$/, '');
  } catch {
    if (ownsWalletBalance(el, request)) el.textContent = failureText;
  }
}

let seedStatusRevision = 0;
export async function refreshWalletSeedStatus() {
  const revision = ++seedStatusRevision;
  const el = document.getElementById('routstr-wallet-device-status');
  if (!el || typeof (walletRuntime as WalletOperations).cashuHasWalletSeed !== 'function') return;
  try {
    const ready = await (walletRuntime as WalletOperations).cashuHasWalletSeed();
    if (revision !== seedStatusRevision || !el.isConnected || document.getElementById('routstr-wallet-device-status') !== el) return;
    el.textContent = ready ? '12-word wallet seed set up on this device' : 'No 12-word wallet seed on this device';
    el.style.color = ready ? 'var(--green)' : 'var(--yellow, #f0a800)';
  } catch {
    if (revision !== seedStatusRevision || !el.isConnected || document.getElementById('routstr-wallet-device-status') !== el) return;
    el.textContent = 'Local wallet setup unavailable';
    el.style.color = 'var(--red)';
  }
}

export function _setActiveNodeAction(actionId: unknown) {
  const el = document.getElementById('routstr-node-actions');
  const nodeUrl = (walletRuntime as WalletOperations).nostrGetSelectedNode?.() || '';
  const hasKey = !!getRoutstrKey();
  if (el) el.innerHTML = buildRoutstrNodeActions(nodeUrl, hasKey, actionId);
}

let _activeWalletAction: unknown = null;

function _setActiveWalletAction(actionId: unknown) {
  _activeWalletAction = actionId;
  const el = document.getElementById('routstr-wallet-actions');
  if (el) el.innerHTML = routstrWalletActionButtons(actionId);
}

const seed = createWalletSeedController({
  view: getWalletSeedView, isActive: isRoutstrActive,
  hasSeed: () => (walletRuntime as WalletOperations).cashuHasWalletSeed(),
  generate: () => (walletRuntime as WalletOperations).cashuGenerateWalletSeed(),
  mnemonic: () => (walletRuntime as WalletOperations).cashuGetWalletMnemonic(),
  restore: words => (walletRuntime as WalletOperations).cashuRestoreWalletFromSeed(words),
  refresh: () => { refreshWalletSeedStatus(); void _refreshRoutstrWalletBalance(); }, notify: showNotification,
  writeClipboard: text => navigator.clipboard.writeText(text),
  scheduleClear: clear => { if (seedClipboardTimer) clearTimeout(seedClipboardTimer); seedClipboardTimer = setTimeout(clear, 60000); },
  close: view => { if (view !== getWalletSeedView()) return; disposeWalletSeed(); const area = document.getElementById('routstr-wallet-fund-area'); if (area) area.style.display = 'none'; },
});
function mountSeedArea(): WalletSeedView | null {
  const area = document.getElementById('routstr-wallet-fund-area'); if (!area) return null;
  ++walletAreaRevision; disposeWalletExport(); disposeWalletFunding(); disposeWalletSeed(); seed.reset(); area.style.display = 'block';
  return mountWalletSeed(area, { copy: () => seed.copy(), create: setupRoutstrWalletSeed, restore: () => seed.restore(), continue: () => seed.acknowledge() });
}
async function _ensureWalletSeed(thenAction: () => unknown): Promise<boolean> {
  const view = mountSeedArea(); return view ? seed.ensure(view, thenAction) : false;
}
export function walletSeedAcknowledged() { return seed.acknowledge(); }
export async function setupRoutstrWalletSeed() {
  invalidateWalletArea();
  await _ensureWalletSeed(async () => {
    showNotification('Local Cashu wallet is ready', 'success');
    _setActiveWalletAction('seed'); const view = mountSeedArea(); if (view) await seed.load(view);
  });
}
export async function showWalletSeedPhrase() {
  const area = document.getElementById('routstr-wallet-fund-area'); if (!area) return;
  const closing = area.style.display !== 'none' && _activeWalletAction === 'seed';
  invalidateWalletArea();
  if (closing) { area.style.display = 'none'; _setActiveWalletAction(null); return; }
  _setActiveWalletAction('seed'); const view = mountSeedArea(); if (view) await seed.load(view);
}

export async function showRoutstrWithdraw() {
  const area = document.getElementById('routstr-wallet-fund-area'); if (!area || !isRoutstrActive()) return;
  const closing = area.style.display !== 'none' && _activeWalletAction === 'withdraw';
  invalidateWalletArea();
  if (closing) { area.style.display = 'none'; _setActiveWalletAction(null); return; }
  _setActiveWalletAction('withdraw'); area.style.display = 'block';
  const view = mountWalletWithdraw(area, {
    lightning: () => withdraw.mode('lightning'), token: () => withdraw.mode('token'), maximum: withdraw.maximum,
    quote: withdraw.quote, execute: () => withdraw.execute(), send: withdraw.send, copy: withdraw.copy,
    recover: withdraw.recover, reclaim: withdraw.reclaim,
    close: () => { if (getWalletWithdrawView() !== view) return; invalidateWalletArea(); area.style.display = 'none'; _setActiveWalletAction(null); },
  });
  await withdraw.load(view);
}
export function showRoutstrWithdrawLightning() { return withdraw.mode('lightning'); }
export function showRoutstrWithdrawToken() { return withdraw.mode('token'); }
export function doRoutstrSendToken(amount: number) { return withdraw.send(amount); }
export function doRoutstrWithdrawQuote() { return withdraw.quote(); }
export function doRoutstrWithdrawExecute(quoteId: string) { return withdraw.execute(quoteId); }

export function doRoutstrWalletRestore() { return seed.restore(); }

installRoutstrWalletDelegates({
  showRoutstrWalletFund,
  rsWalletFundCustomInput,
  doRoutstrWalletFundCustom,
  doRoutstrWalletFund,
  copyRoutstrFundingInvoice,
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
  showSavedNodeRefunds,
  startNewRoutstrNodeSession,
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

export { showSavedNodeRefunds };
