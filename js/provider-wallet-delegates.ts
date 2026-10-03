// provider-wallet-delegates.js - Delegated Routstr/Cashu wallet UI actions

import { getErrorMessage } from './caught-error.js';
import { showNotification } from './utils.js';
import { walletRuntime } from './provider-wallet-runtime.js';

import type { ProviderWalletDefaults } from './provider-wallet-runtime.js';
type WalletActionResult = object | string | number | boolean | bigint | symbol | null | void;
type DelegateWalletKeys = 'cashuGetMaxWithdrawable' | 'cashuReceiveToken' | 'cashuClearPendingDeposit' | 'cashuClearPendingWithdraw';
// Private guarded/unchecked operations; injected slots and results remain opaque publicly.
type DelegateWalletOperations = { [Key in DelegateWalletKeys]: ((...args: Parameters<ProviderWalletDefaults[Key]>) => unknown) | null | undefined };
interface WalletElementOperations { closest(selector: string): WalletElementOperations | null; matches(selector: string): boolean; dataset: Record<string, string | undefined>; value: string; checked: boolean; textContent: unknown; style: {display: string; filter: string}; select?: unknown }
interface WalletEventOperations {target?: unknown; key?: unknown; preventDefault(): void}

const WALLET_ROOTS = '#ai-provider-panel, #routstr-wallet-fund-area, #routstr-node-picker, #routstr-node-actions, #routstr-wallet-actions, #routstr-mint-edit';

let routstrWalletDelegatesInstalled = false;
let walletActions: Record<string, unknown> = { reload: () => globalThis.location?.reload?.() };

export function installRoutstrWalletDelegates(actions: unknown = {}) {
  Object.assign(walletActions, actions);
  if (routstrWalletDelegatesInstalled || typeof document === 'undefined') return;
  routstrWalletDelegatesInstalled = true;
  document.addEventListener('click', _handleRoutstrWalletClick);
  document.addEventListener('keydown', _handleRoutstrWalletKeydown);
  document.addEventListener('change', _handleRoutstrWalletChange);
  document.addEventListener('input', event => {
    const input = _closestWalletEl(event, '#routstr-mint-input');
    if (!input) return;
    const mint = input.value.trim().replace(/\/+$/, '');
    document.querySelectorAll('#routstr-mint-edit .routstr-mint-row').forEach(row => {
      row.setAttribute('aria-pressed', String(row.getAttribute('data-mint-url') === mint));
    });
  });
}

function _call(name: string, ...args: unknown[]): WalletActionResult {
  const fn = walletActions[name];
  if (typeof fn === 'function') return (fn as (...args: unknown[]) => WalletActionResult)(...args);
}

function _targetClosest(event: WalletEventOperations, selector: string) {
  const target = event.target as {closest?: unknown} | null | undefined;
  return target && typeof target.closest === 'function' ? (target.closest as (selector: string) => WalletElementOperations | null)(selector) : null;
}

function _closestWalletEl(event: WalletEventOperations, selector: string) {
  const el = _targetClosest(event, selector);
  return el && el.closest(WALLET_ROOTS) ? el : null;
}

function _hideWalletMenu() {
  const menu = document.getElementById('routstr-wallet-menu');
  if (menu) menu.style.display = 'none';
}

function _setInputValue(id: string, value: unknown) {
  const input = (document.getElementById(id) as unknown as {value: unknown} | null);
  if (input) input.value = value;
}

function _inputInt(id: string) {
  const input = (document.getElementById(id) as HTMLInputElement | null);
  return parseInt(input?.value || '', 10);
}

async function _copyClipboard(el: WalletElementOperations) {
  const text = el.dataset.clipboardText || el.dataset.token || '';
  try { await navigator.clipboard.writeText(text); }
  catch { showNotification('Clipboard copy failed. Select and copy the text manually.', 'error'); return; }
  el.textContent = el.dataset.copiedText || '✓ Copied';
  if (!el.dataset.clearTimer) return;
  clearTimeout((globalThis as typeof globalThis & Record<string, Parameters<typeof clearTimeout>[0]>)[el.dataset.clearTimer]);
  (globalThis as typeof globalThis & Record<string, ReturnType<typeof setTimeout>>)[el.dataset.clearTimer] = setTimeout(() => globalThis.navigator?.clipboard?.writeText?.(''), 60000);
}

async function _handleRoutstrWalletClick(event: WalletEventOperations): Promise<WalletActionResult> {
  if (!_targetClosest(event, '#routstr-wallet-menu, [data-routstr-wallet-action="toggle-wallet-menu"]')) _hideWalletMenu();
  const el = _closestWalletEl(event, '[data-routstr-wallet-action]');
  if (!el) return;
  if (el.matches('a, button')) event.preventDefault();
  const action = el.dataset.routstrWalletAction;

  if (action === 'fund-wallet-preset') return _call('doRoutstrWalletFund', Number(el.dataset.sats));
  if (action === 'fund-wallet-custom') return _call('doRoutstrWalletFundCustom');
  if (action === 'fund-wallet-custom-input') return _call('rsWalletFundCustomInput');
  if (action === 'recover-wallet-funding') return _call('recoverPendingWalletFunding');
  if (action === 'receive-wallet-cashu') return _call('doRoutstrWalletReceiveCashu');
  if (action === 'copy-clipboard') return _copyClipboard(el);
  if (action === 'set-mint-input') {
    _setInputValue('routstr-mint-input', el.dataset.mintUrl || '');
    document.getElementById('routstr-mint-input')?.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  if (action === 'save-mint') return _call('doRoutstrMintChange');
  if (action === 'cancel-mint') return _hideMintEdit();
  if (action === 'connect-node') return _call('connectRoutstrNode', el.dataset.nodeUrl || '');
  if (action === 'choose-node-mint') return _call('chooseRoutstrNodeMint', el.dataset.mintUrl || '');
  if (action === 'deposit-node-input') return _call('doRoutstrNodeDeposit', el.dataset.nodeUrl || '', _inputInt('routstr-deposit-amount'));
  if (action === 'deposit-node-preset') return _depositNodePreset(el);
  if (action === 'resume-node-refund') return _call('doRoutstrNodeWithdraw', el.dataset.nodeUrl);
  if (action === 'recover-pending-deposit') return _recoverPendingDeposit(el);
  if (action === 'recover-pending-withdraw') return _recoverPendingWithdraw(el);
  if (action === 'node-action') return _runNodeAction(el);
  if (action === 'wallet-action') return _runWalletAction(el.dataset.walletAction);
  if (action === 'toggle-wallet-menu') return _toggleWalletMenu();
  if (action === 'toggle-seed-blur') return _toggleSeedBlur(el);
  if (action === 'seed-ack-continue') return _call('walletSeedAcknowledged');
  if (action === 'setup-wallet-seed') return _call('setupRoutstrWalletSeed');
  if (action === 'wallet-restore') return _call('doRoutstrWalletRestore');
  if (action === 'withdraw-lightning') return _call('showRoutstrWithdrawLightning');
  if (action === 'withdraw-token') return _call('showRoutstrWithdrawToken');
  if (action === 'withdraw-max') return _setWithdrawMax(await (walletRuntime as DelegateWalletOperations).cashuGetMaxWithdrawable?.());
  if (action === 'withdraw-quote') return _call('doRoutstrWithdrawQuote');
  if (action === 'send-token-input') return _call('doRoutstrSendToken', _inputInt('routstr-token-amount'));
  if (action === 'send-token-preset') return _sendTokenPreset(el);
  if (action === 'select-textarea' || action === 'select-text') return (el.select as (() => WalletActionResult) | null | undefined)?.();
  if (action === 'withdraw-execute') return _call('doRoutstrWithdrawExecute', el.dataset.quoteId || '');
}

function _handleRoutstrWalletKeydown(event: WalletEventOperations) {
  const el = _closestWalletEl(event, '[data-routstr-wallet-key]');
  if (!el || el.dataset.routstrWalletKey !== 'wallet-fund-custom') return;
  if (event.key === 'Enter') { event.preventDefault(); _call('doRoutstrWalletFundCustom'); }
  if (event.key === 'Escape') { event.preventDefault(); _call('showRoutstrWalletFund'); }
}

function _handleRoutstrWalletChange(event: WalletEventOperations) {
  const el = _closestWalletEl(event, '[data-routstr-wallet-change]');
  if (!el || el.dataset.routstrWalletChange !== 'seed-ack') return;
  const continueBtn = (document.getElementById('routstr-seed-continue') as HTMLButtonElement | null);
  const checkbox = (el as WalletElementOperations);
  if (continueBtn) continueBtn.disabled = !checkbox.checked;
}

function _hideMintEdit() {
  const area = document.getElementById('routstr-mint-edit');
  if (area) area.style.display = 'none';
}

function _depositNodePreset(el: WalletElementOperations) {
  const amount = Number(el.dataset.amount);
  _setInputValue('routstr-deposit-amount', amount);
  return _call('doRoutstrNodeDeposit', el.dataset.nodeUrl || '', amount);
}

async function _recoverPendingDeposit(el: WalletElementOperations) {
  try {
    await (walletRuntime as DelegateWalletOperations).cashuReceiveToken?.(el.dataset.token || '');
    await (walletRuntime as DelegateWalletOperations).cashuClearPendingDeposit?.();
    showNotification('Recovered!', 'success');
    _call('reload');
  } catch (e) {
    showNotification(getErrorMessage(e), 'error');
  }
}

async function _recoverPendingWithdraw(el: WalletElementOperations) {
  try {
    await (walletRuntime as DelegateWalletOperations).cashuReceiveToken?.(el.dataset.token || '');
    if (el.dataset.clearPendingWithdraw !== 'false') await (walletRuntime as DelegateWalletOperations).cashuClearPendingWithdraw?.();
    // Token recovery does not authorize deletion of a node's credential.
    showNotification('Recovered!', 'success');
    _call('reload');
  } catch (e) {
    showNotification(getErrorMessage(e), 'error');
  }
}

function _runNodeAction(el: WalletElementOperations): WalletActionResult {
  const action = el.dataset.nodeAction;
  _call('_setActiveNodeAction', action);
  if (action === 'deposit') return _call('showRoutstrNodeDeposit', el.dataset.nodeUrl || '');
  if (action === 'withdraw') return _call('doRoutstrNodeWithdraw');
  if (action === 'browse') return _call('showRoutstrNodePicker');
}

function _runWalletAction(action: unknown): WalletActionResult {
  _hideWalletMenu();
  if (action === 'deposit') return _call('showRoutstrWalletFund');
  if (action === 'withdraw') return _call('showRoutstrWithdraw');
  if (action === 'seed') return _call('showWalletSeedPhrase');
  if (action === 'backup') return _call('showRoutstrWalletBackup');
}

function _toggleWalletMenu() {
  const menu = document.getElementById('routstr-wallet-menu');
  if (menu) menu.style.display = menu.style.display !== 'block' ? 'block' : 'none';
}

function _toggleSeedBlur(el: WalletElementOperations) {
  el.style.filter = el.style.filter ? '' : 'blur(4px)';
}

function _setWithdrawMax(amount: unknown) {
  if (amount != null) _setInputValue('routstr-withdraw-amount', amount);
}

function _sendTokenPreset(el: WalletElementOperations) {
  const amount = Number(el.dataset.amount);
  _setInputValue('routstr-token-amount', amount);
  return _call('doRoutstrSendToken', amount);
}
