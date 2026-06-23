// @ts-check
// provider-wallet-delegates.js - Delegated Routstr/Cashu wallet UI actions

import { showNotification } from './utils.js';

const WALLET_ROOTS = '#ai-provider-panel, #routstr-wallet-fund-area, #routstr-node-picker, #routstr-node-actions, #routstr-wallet-actions, #routstr-mint-edit';

let routstrWalletDelegatesInstalled = false;
let walletActions = {};

export function installRoutstrWalletDelegates(actions = {}) {
  Object.assign(walletActions, actions);
  if (routstrWalletDelegatesInstalled || typeof document === 'undefined') return;
  routstrWalletDelegatesInstalled = true;
  document.addEventListener('click', _handleRoutstrWalletClick);
  document.addEventListener('keydown', _handleRoutstrWalletKeydown);
  document.addEventListener('change', _handleRoutstrWalletChange);
  document.addEventListener('blur', _handleRoutstrWalletBlur, true);
}

function _call(name, ...args) {
  const fn = walletActions[name];
  if (typeof fn === 'function') return fn(...args);
}

function _targetClosest(event, selector) {
  const target = event.target;
  return target && typeof target.closest === 'function' ? target.closest(selector) : null;
}

function _closestWalletEl(event, selector) {
  const el = _targetClosest(event, selector);
  return el && el.closest(WALLET_ROOTS) ? el : null;
}

function _hideWalletMenu() {
  const menu = document.getElementById('routstr-wallet-menu');
  if (menu) menu.style.display = 'none';
}

function _setInputValue(id, value) {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
  if (input) input.value = value;
}

function _inputInt(id) {
  const input = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
  return parseInt(input?.value || '', 10);
}

function _copyClipboard(el) {
  const text = el.dataset.clipboardText || el.dataset.token || '';
  globalThis.navigator?.clipboard?.writeText?.(text);
  el.textContent = el.dataset.copiedText || '✓ Copied';
  if (!el.dataset.clearTimer) return;
  clearTimeout(globalThis[el.dataset.clearTimer]);
  globalThis[el.dataset.clearTimer] = setTimeout(() => globalThis.navigator?.clipboard?.writeText?.(''), 60000);
}

async function _handleRoutstrWalletClick(event) {
  if (!_targetClosest(event, '#routstr-wallet-menu, [data-routstr-wallet-action="toggle-wallet-menu"]')) _hideWalletMenu();
  const el = _closestWalletEl(event, '[data-routstr-wallet-action]');
  if (!el) return;
  if (el.matches('a, button')) event.preventDefault();
  const action = el.dataset.routstrWalletAction;

  if (action === 'fund-wallet-preset') return _call('doRoutstrWalletFund', Number(el.dataset.sats));
  if (action === 'fund-wallet-custom-input') return _call('rsWalletFundCustomInput');
  if (action === 'recover-wallet-funding') return _call('recoverPendingWalletFunding');
  if (action === 'receive-wallet-cashu') return _call('doRoutstrWalletReceiveCashu');
  if (action === 'copy-clipboard') return _copyClipboard(el);
  if (action === 'set-mint-input') return _setInputValue('routstr-mint-input', el.dataset.mintUrl || '');
  if (action === 'save-mint') return _call('doRoutstrMintChange');
  if (action === 'cancel-mint') return _hideMintEdit();
  if (action === 'connect-node') return _call('connectRoutstrNode', el.dataset.nodeUrl || '');
  if (action === 'deposit-node-input') return _call('doRoutstrNodeDeposit', el.dataset.nodeUrl || '', _inputInt('routstr-deposit-amount'));
  if (action === 'deposit-node-preset') return _depositNodePreset(el);
  if (action === 'recover-pending-deposit') return _recoverPendingDeposit(el);
  if (action === 'recover-pending-withdraw') return _recoverPendingWithdraw(el);
  if (action === 'node-action') return _runNodeAction(el);
  if (action === 'wallet-action') return _runWalletAction(el.dataset.walletAction);
  if (action === 'toggle-wallet-menu') return _toggleWalletMenu();
  if (action === 'toggle-seed-blur') return _toggleSeedBlur(el);
  if (action === 'seed-ack-continue') return _call('walletSeedAcknowledged');
  if (action === 'wallet-restore') return _call('doRoutstrWalletRestore');
  if (action === 'withdraw-lightning') return _call('showRoutstrWithdrawLightning');
  if (action === 'withdraw-token') return _call('showRoutstrWithdrawToken');
  if (action === 'withdraw-max') return _setWithdrawMax(await globalThis.cashuGetMaxWithdrawable?.());
  if (action === 'withdraw-quote') return _call('doRoutstrWithdrawQuote');
  if (action === 'send-token-input') return _call('doRoutstrSendToken', _inputInt('routstr-token-amount'));
  if (action === 'send-token-preset') return _sendTokenPreset(el);
  if (action === 'select-textarea' || action === 'select-text') return el.select?.();
  if (action === 'withdraw-execute') return _call('doRoutstrWithdrawExecute', el.dataset.quoteId || '');
}

function _handleRoutstrWalletKeydown(event) {
  const el = _closestWalletEl(event, '[data-routstr-wallet-key]');
  if (!el || el.dataset.routstrWalletKey !== 'wallet-fund-custom') return;
  if (event.key === 'Enter') { event.preventDefault(); _call('doRoutstrWalletFundCustom'); }
  if (event.key === 'Escape') { event.preventDefault(); _call('showRoutstrWalletFund'); }
}

function _handleRoutstrWalletChange(event) {
  const el = _closestWalletEl(event, '[data-routstr-wallet-change]');
  if (!el || el.dataset.routstrWalletChange !== 'seed-ack') return;
  const continueBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('routstr-seed-continue'));
  const checkbox = /** @type {HTMLInputElement} */ (el);
  if (continueBtn) continueBtn.disabled = !checkbox.checked;
}

function _handleRoutstrWalletBlur(event) {
  const el = _closestWalletEl(event, '[data-routstr-wallet-blur]');
  const input = /** @type {HTMLInputElement | null} */ (el);
  if (input?.dataset.routstrWalletBlur === 'wallet-fund-custom' && input.value.trim()) _call('doRoutstrWalletFundCustom');
}

function _hideMintEdit() {
  const area = document.getElementById('routstr-mint-edit');
  if (area) area.style.display = 'none';
}

function _depositNodePreset(el) {
  const amount = Number(el.dataset.amount);
  _setInputValue('routstr-deposit-amount', amount);
  return _call('doRoutstrNodeDeposit', el.dataset.nodeUrl || '', amount);
}

async function _recoverPendingDeposit(el) {
  try {
    await globalThis.cashuReceiveToken?.(el.dataset.token || '');
    globalThis.cashuClearPendingDeposit?.();
    showNotification('Recovered!', 'success');
    globalThis.location?.reload?.();
  } catch (e) {
    showNotification(e.message, 'error');
  }
}

async function _recoverPendingWithdraw(el) {
  try {
    await globalThis.cashuReceiveToken?.(el.dataset.token || '');
    await globalThis.cashuClearPendingWithdraw?.();
    await _call('clearRoutstrNodeSession');
    showNotification('Recovered!', 'success');
    globalThis.location?.reload?.();
  } catch (e) {
    showNotification(e.message, 'error');
  }
}

function _runNodeAction(el) {
  const action = el.dataset.nodeAction;
  _call('_setActiveNodeAction', action);
  if (action === 'deposit') return _call('connectRoutstrNode', el.dataset.nodeUrl || '');
  if (action === 'withdraw') return _call('doRoutstrNodeWithdraw');
  if (action === 'browse') return _call('showRoutstrNodePicker');
}

function _runWalletAction(action) {
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

function _toggleSeedBlur(el) {
  el.style.filter = el.style.filter ? '' : 'blur(4px)';
}

function _setWithdrawMax(amount) {
  if (amount != null) _setInputValue('routstr-withdraw-amount', amount);
}

function _sendTokenPreset(el) {
  const amount = Number(el.dataset.amount);
  _setInputValue('routstr-token-amount', amount);
  return _call('doRoutstrSendToken', amount);
}
