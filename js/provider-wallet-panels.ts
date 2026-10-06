import { disposeRoutstrModelSettings } from './routstr-model-settings-component.js';
import type { WalletOperations, FundingMonitorReader, FundingRecoveryReader, WalletCallbacks, PanelHTMLWriter } from '../types/provider-wallet-panels.js';
// provider-wallet-panels.js - Routstr/Cashu wallet UI and node funding actions

import { canonicalRoutstrUrl } from './routstr-validation.js';
import { showNotification } from './utils.js';
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
import { mountWalletNode, getWalletNodeView, disposeWalletNode } from './wallet-node-component.js';
import { createWalletNodeController } from './wallet-node-controller.js';
import type { WalletNodeState, WalletNodeView } from './wallet-node-contract.js';
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
  initSettingsModelFetch: null, hydrateRoutstrModelSettings: null, requestProviderActivation: null,
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
  disposeRoutstrModelSettings();
  ++_walletBalanceRefresh; invalidateWalletArea(); disposeWalletNode();
  const picker = document.getElementById('routstr-node-picker'); if (picker) picker.style.display = 'none';
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
        disposeWalletNode(); picker.replaceChildren(); picker.style.display = 'none'; _setActiveNodeAction(null);
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

let nodeClipboardTimer: ReturnType<typeof setTimeout> | null = null;
function closeWalletNode(view: WalletNodeView): void {
  if (getWalletNodeView() !== view) return;
  disposeWalletNode(); const picker = document.getElementById('routstr-node-picker');
  if (picker) picker.style.display = 'none'; _setActiveNodeAction(null);
}
function openWalletNode(mode: WalletNodeState['mode'], node = ''): WalletNodeView | null {
  const picker = document.getElementById('routstr-node-picker'); if (!picker || !isRoutstrActive()) return null;
  picker.style.display = 'block'; picker.dataset.mode = mode === 'refunds' ? 'saved-refunds' : mode;
  const view = mountWalletNode(picker, {
    connect: input => nodes.connect(input), refresh: () => nodes.browse(true),
    chooseMint: async mint => { if (view.isCurrent()) await chooseRoutstrNodeMint(mint); },
    deposit: amount => nodes.deposit(amount), newSession: () => nodes.resetSession(),
    retry: index => nodes.retry(index), copy: index => nodes.copy(index), reclaim: index => nodes.reclaim(index),
    close: () => closeWalletNode(view),
  }, mode, node);
  return view;
}
async function activateNode(node: string): Promise<boolean> {
  return typeof walletCallbacks.requestProviderActivation !== 'function' || !!await (walletCallbacks.requestProviderActivation as (provider: string, options: { endpoint: string }) => unknown)('routstr', { endpoint: node });
}
function replaceRoutstrPanel(panel: HTMLElement): void {
  const html = _renderRoutstrPanel('routstr'); if (!html) return;
  invalidateWalletArea(); disposeWalletMint(); disposeWalletNode();
  disposeRoutstrModelSettings();
  (panel as unknown as PanelHTMLWriter).innerHTML = html;
  if (typeof walletCallbacks.hydrateRoutstrModelSettings === 'function') (walletCallbacks.hydrateRoutstrModelSettings as () => void)();
}
async function selectNode(node: string, current: () => boolean): Promise<void> {
  const panel = document.getElementById('ai-provider-panel');
  const previousNode = String((walletRuntime as WalletOperations).nostrGetSelectedNode?.() || '');
  const previousKey = previousNode && getRoutstrKey(previousNode);
  if (previousKey && previousNode !== node) await saveRoutstrKey(previousKey, previousNode);
  if (!current() || !isRoutstrActive()) return;
  (walletRuntime as WalletOperations).nostrSetSelectedNode(node); clearRoutstrModelCaches();
  const owns = () => current() && isRoutstrActive() && panel?.isConnected && panel === document.getElementById('ai-provider-panel') && node === (walletRuntime as WalletOperations).nostrGetSelectedNode?.();
  const models = await fetchRoutstrModels(); if (!owns()) return;
  if (panel) replaceRoutstrPanel(panel);
  if (models.length) _renderRoutstrModelDropdown(models);
  await _refreshRoutstrWalletBalance(); refreshRoutstrBalance();
  // Replacement deliberately ends the previous component owner. Check the new
  // panel and selected node before mounting the selected account's deposit view.
  if (!isRoutstrActive() || panel !== document.getElementById('ai-provider-panel') || node !== (walletRuntime as WalletOperations).nostrGetSelectedNode?.()) return;
  showNotification('Selected ' + node.replace(/^https?:\/\//, ''), 'success');
  if (!getRoutstrKey(node)) await nodes.depositForm(node);
}
function captureNodeDepositFinish(node: string): (amount: number) => Promise<void> {
  const view = getWalletNodeView(), panel = document.getElementById('ai-provider-panel');
  const selected = (walletRuntime as WalletOperations).nostrGetSelectedNode?.();
  const owns = () => isRoutstrActive() && view === getWalletNodeView() && panel?.isConnected && panel === document.getElementById('ai-provider-panel') && selected === (walletRuntime as WalletOperations).nostrGetSelectedNode?.();
  return async amount => {
    if (!owns()) return;
    (walletRuntime as WalletOperations).nostrSetSelectedNode(node); clearRoutstrModelCaches();
    const models = await fetchRoutstrModels();
    if (!isRoutstrActive() || view !== getWalletNodeView() || panel !== document.getElementById('ai-provider-panel') || node !== (walletRuntime as WalletOperations).nostrGetSelectedNode?.()) return;
    if (panel) replaceRoutstrPanel(panel);
    if (models.length) _renderRoutstrModelDropdown(models);
    void _refreshRoutstrWalletBalance(); refreshRoutstrBalance();
    showNotification('Connected to ' + node.replace(/^https?:\/\//, '') + ' ⚡ ' + amount.toLocaleString() + ' sats', 'success');
    _returnToChatIfOnboarding();
  };
}
const nodes = createWalletNodeController({
  view: getWalletNodeView, open: openWalletNode, close: closeWalletNode, isActive: isRoutstrActive,
  selected: () => String((walletRuntime as WalletOperations).nostrGetSelectedNode?.() || ''), key: node => getRoutstrKey(node),
  mint: async () => String(await (walletRuntime as WalletOperations).cashuGetMintUrl()),
  balance: () => (walletRuntime as WalletOperations).cashuGetBalance(), inventory: () => (walletRuntime as WalletOperations).cashuGetWalletMints(),
  accepted: getNodeMints, discover: refresh => (walletRuntime as WalletOperations).nostrDiscoverNodes(refresh),
  activate: activateNode, connect: selectNode, captureFinish: captureNodeDepositFinish,
  deposit: (node, amount, key, mint) => (walletRuntime as WalletOperations).cashuDepositToNode(node, amount, key, mint, key),
  reset: (node, key) => (walletRuntime as WalletOperations).cashuStartNewNodeSession(node, key),
  hasSeed: () => (walletRuntime as WalletOperations).cashuHasWalletSeed(), seed: _ensureWalletSeed,
  refund: (node, id, token, generation, key) => (walletRuntime as WalletOperations).cashuRefundNodeToToken(node, id, token, generation, key),
  saved: node => (walletRuntime as WalletOperations).cashuGetPendingNodeRefunds(node),
  tokenMint: token => (walletRuntime as WalletOperations).cashuGetTokenMintUrl(token),
  receive: token => (walletRuntime as WalletOperations).cashuReceiveToken(token), finishRefund: token => (walletRuntime as WalletOperations).cashuFinishNodeRefund(token),
  recoverDeposit: node => (walletRuntime as WalletOperations).cashuRecoverPendingDeposit(node), clearDeposit: () => (walletRuntime as WalletOperations).cashuClearPendingDeposit(),
  refreshWallet: () => _refreshRoutstrWalletBalance(), refreshNode: refreshRoutstrBalance, chooseMint: chooseRoutstrNodeMint,
  writeClipboard: text => navigator.clipboard.writeText(text), scheduleClear: clear => { if (nodeClipboardTimer) clearTimeout(nodeClipboardTimer); nodeClipboardTimer = setTimeout(clear, 60000); }, notify: showNotification,
});
export function showRoutstrNodePicker(forceRefresh = false) { return nodes.browse(forceRefresh); }
export async function connectRoutstrNode(node: string) {
  if (!getWalletNodeView()) { const view = openWalletNode('browse'); if (!view) return; view.setState({ ...view.getState(), phase: 'ready', pending: false }); }
  return nodes.connect(node);
}

async function getNodeMints(nodeUrl: unknown) {
  const response = await fetch(canonicalRoutstrUrl(nodeUrl) + '/v1/info', { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Could not check this node’s accepted mints. Try again.');
  const info = await response.json() as {mints?: unknown};
  if (info.mints == null) return [];
  if (!Array.isArray(info.mints) || info.mints.some((mint: unknown) => typeof mint !== 'string' || !isValidExternalUrl(mint))) throw new Error('Node returned an invalid mint list.');
  return [...new Set(info.mints.map((mint: string) => mint.trim().replace(/\/+$/, '')))];
}

export function showRoutstrNodeDeposit(node: string) { return nodes.depositForm(node); }
export function doRoutstrNodeDeposit(node: string, amount: number) {
  if (getWalletNodeView()?.getState().node !== canonicalRoutstrUrl(node)) return;
  return nodes.deposit(amount);
}
export function startNewRoutstrNodeSession(node: string) {
  if (getWalletNodeView()?.readSession()?.node !== canonicalRoutstrUrl(node)) return;
  return nodes.resetSession();
}
export function doRoutstrNodeWithdraw(node?: unknown, id?: string, token?: string, generation?: string) {
  return nodes.withdraw(canonicalRoutstrUrl(typeof node === 'string' ? node : (walletRuntime as WalletOperations).nostrGetSelectedNode?.()), id, token, generation);
}
export function showSavedNodeRefunds(node?: unknown) { return nodes.saved(typeof node === 'string' ? node : undefined); }

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
