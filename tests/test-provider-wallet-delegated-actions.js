#!/usr/bin/env node
// Static provider wallet delegated-action source guards.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const walletPanelSrc = fs.readFileSync(path.join(root, 'js/provider-wallet-panels.js'), 'utf8');
const walletDelegatesSrc = fs.readFileSync(path.join(root, 'js/provider-wallet-delegates.js'), 'utf8');
const swSrc = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');

let passed = 0;
let failed = 0;

function assert(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  PASS: ${name}`);
  } else {
    failed++;
    console.log(`  FAIL: ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

console.log('=== Provider Wallet Delegated Actions ===');

assert('provider-wallet-panels.js renders no inline event attributes',
  !/\bon(?:click|change|input|search|keydown|keyup|submit|blur)=/.test(walletPanelSrc));
assert('provider wallet renders delegated action attributes',
  walletPanelSrc.includes('data-routstr-wallet-action') &&
    walletPanelSrc.includes('data-routstr-wallet-key') &&
    walletPanelSrc.includes('data-routstr-wallet-change') &&
    walletPanelSrc.includes('data-routstr-wallet-blur'));
assert('provider wallet panel installs delegates with wallet callbacks',
  walletPanelSrc.includes("import { installRoutstrWalletDelegates } from './provider-wallet-delegates.js'") &&
    walletPanelSrc.includes('installRoutstrWalletDelegates({') &&
    walletPanelSrc.includes('doRoutstrNodeDeposit') &&
    walletPanelSrc.includes('doRoutstrWithdrawExecute'));
assert('provider wallet delegates install idempotent listeners',
  walletDelegatesSrc.includes('let routstrWalletDelegatesInstalled = false') &&
    walletDelegatesSrc.includes("document.addEventListener('click', _handleRoutstrWalletClick)") &&
    walletDelegatesSrc.includes("document.addEventListener('keydown', _handleRoutstrWalletKeydown)") &&
    walletDelegatesSrc.includes("document.addEventListener('change', _handleRoutstrWalletChange)") &&
    walletDelegatesSrc.includes("document.addEventListener('blur', _handleRoutstrWalletBlur, true)"));
assert('provider wallet delegates are scoped to wallet surfaces',
  walletDelegatesSrc.includes('WALLET_ROOTS') &&
    walletDelegatesSrc.includes('el.closest(WALLET_ROOTS)'));
assert('service worker precaches provider wallet delegate module',
  swSrc.includes('/js/provider-wallet-delegates.js'));

[
  'fund-wallet-preset',
  'fund-wallet-custom-input',
  'recover-wallet-funding',
  'receive-wallet-cashu',
  'copy-clipboard',
  'set-mint-input',
  'save-mint',
  'cancel-mint',
  'connect-node',
  'deposit-node-input',
  'deposit-node-preset',
  'recover-pending-deposit',
  'node-action',
  'wallet-action',
  'toggle-wallet-menu',
  'toggle-seed-blur',
  'seed-ack-continue',
  'wallet-restore',
  'withdraw-lightning',
  'withdraw-token',
  'withdraw-max',
  'withdraw-quote',
  'send-token-input',
  'send-token-preset',
  'select-textarea',
  'withdraw-execute',
  'recover-pending-withdraw',
].forEach(action => {
  assert(`provider wallet action ${action} is handled`, walletDelegatesSrc.includes(`action === '${action}'`));
});

assert('deposit recovery awaits pending-deposit clear before reload',
  /async function _recoverPendingDeposit[\s\S]*await globalThis\.cashuReceiveToken\?\.\([\s\S]*await globalThis\.cashuClearPendingDeposit\?\.\([\s\S]*globalThis\.location\?\.reload\?\.\(\)/.test(walletDelegatesSrc));
assert('withdraw recovery awaits pending-withdraw clear and clears node session before reload',
  /async function _recoverPendingWithdraw[\s\S]*await globalThis\.cashuReceiveToken\?\.\([\s\S]*await globalThis\.cashuClearPendingWithdraw\?\.\([\s\S]*await _call\('clearRoutstrNodeSession'\)[\s\S]*globalThis\.location\?\.reload\?\.\(\)/.test(walletDelegatesSrc));

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
