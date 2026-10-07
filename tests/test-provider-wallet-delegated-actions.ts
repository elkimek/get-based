#!/usr/bin/env node
import { readRepositorySource } from './helpers/repository-source.js';
import { readServiceWorkerSource } from '../scripts/service-worker-source.js';
import { createLegacyAssertions } from './helpers/legacy-assertions.js';
// Static provider wallet delegated-action source guards.

const walletPanelSrc = readRepositorySource('js/provider-wallet-panels.js', 'utf8');
const walletPanelRendererSrc = readRepositorySource('js/components/WalletNode.svelte', 'utf8');
const fundingComponentSrc = readRepositorySource('js/components/WalletFunding.svelte', 'utf8');
const seedComponentSrc = readRepositorySource('js/components/WalletSeed.svelte', 'utf8');
const walletUiSrc = walletPanelSrc + '\n' + walletPanelRendererSrc;
const walletDelegatesSrc = readRepositorySource('js/provider-wallet-delegates.js', 'utf8').replace(/\s+/g, ' ');
const swSrc = readServiceWorkerSource(relative => readRepositorySource(relative, 'utf8'));

const { assert, results: legacyAssertions } = createLegacyAssertions(" -- ");

console.log('=== Provider Wallet Delegated Actions ===');

assert('provider-wallet-panels.js renders no inline event attributes',
  !/\bon(?:click|change|input|search|keydown|keyup|submit|blur)=['\"]/.test(walletUiSrc));
assert('provider wallet renders delegated action attributes',
  walletUiSrc.includes('data-routstr-wallet-action') &&
    fundingComponentSrc.includes('onkeydown={event =>') && fundingComponentSrc.includes('actions.submitCustom()') &&
    seedComponentSrc.includes('onchange={event => flushSync(') && seedComponentSrc.includes('acknowledged = event.currentTarget.checked'));
assert('provider wallet panel installs delegates with wallet callbacks',
  walletPanelSrc.includes("import { installRoutstrWalletDelegates } from './provider-wallet-delegates.js'") &&
    walletPanelSrc.includes('installRoutstrWalletDelegates({') &&
    walletPanelSrc.includes('doRoutstrNodeDeposit') &&
    walletPanelSrc.includes('doRoutstrWithdrawExecute'));
assert('provider wallet delegates install idempotent listeners',
  walletDelegatesSrc.includes('let routstrWalletDelegatesInstalled = false') &&
    walletDelegatesSrc.includes("document.addEventListener('click', _handleRoutstrWalletClick)") &&
    fundingComponentSrc.includes("event.key === 'Enter'") && fundingComponentSrc.includes("event.key === 'Escape'") &&
    seedComponentSrc.includes('disabled={!acknowledged || seedState.pending}'));
assert('provider wallet delegates are scoped to wallet surfaces',
  walletDelegatesSrc.includes('WALLET_ROOTS') &&
    walletDelegatesSrc.includes('el.closest(WALLET_ROOTS)'));
assert('service worker precaches provider wallet delegate module',
  swSrc.includes('/js/provider-wallet-delegates.js'));

[
  'fund-wallet-preset',
  'fund-wallet-custom-input',
  'fund-wallet-custom',
  'recover-wallet-funding',
  'receive-wallet-cashu',
  'copy-funding-invoice',
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

assert('shared Svelte wallet actions own the menu toggle and delegate domain actions once',
  readRepositorySource('js/components/RoutstrActions.svelte', 'utf8').includes('data-routstr-wallet-action="toggle-wallet-menu"') &&
  readRepositorySource('js/components/RoutstrActions.svelte', 'utf8').includes("invoke('menu')") &&
  walletDelegatesSrc.includes('configureRoutstrActions({ wallet: action => _runWalletAction(action)') &&
  !walletDelegatesSrc.includes('_toggleWalletMenu') && !walletDelegatesSrc.includes('_hideWalletMenu'));

assert('owned wallet seed reveal is keyboard accessible and keeps words out of delegated attributes',
  seedComponentSrc.includes('aria-pressed={revealed}') && seedComponentSrc.includes('revealed ? words :') &&
  !seedComponentSrc.includes('data-clipboard-text') && !walletPanelRendererSrc.includes('walletSeedManagementHtml'));

assert('deposit recovery awaits pending-deposit clear before reload',
  /async function _recoverPendingDeposit[\s\S]*await walletRuntime\.cashuReceiveToken\?\.\([\s\S]*await walletRuntime\.cashuClearPendingDeposit\?\.\([\s\S]*_call\('reload'\)/.test(walletDelegatesSrc));
assert('withdraw recovery awaits pending-withdraw clear before reload',
  /async function _recoverPendingWithdraw[\s\S]*await walletRuntime\.cashuReceiveToken\?\.\([\s\S]*if \(el\.dataset\.clearPendingWithdraw !== 'false'\) await walletRuntime\.cashuClearPendingWithdraw\?\.\([\s\S]*_call\('reload'\)/.test(walletDelegatesSrc));

console.log(`\nResults: ${legacyAssertions.pass} passed, ${legacyAssertions.fail} failed, ${legacyAssertions.pass + legacyAssertions.fail} total`);
if (legacyAssertions.fail > 0) process.exit(1);
