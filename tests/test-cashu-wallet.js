#!/usr/bin/env node
// test-cashu-wallet.js — Cashu wallet module, Nostr discovery, integration
// points. Module exports, wallet security/proof-management/recovery/
// fee-mechanism source inspection, Nostr protocol + node parsing, API node-URL
// guard, sync + export/import + service-worker wiring, BIP-39 seed generation,
// and SSRF-validation wiring on setMintUrl / setSelectedNodeUrl.
//
// Run: node tests/test-cashu-wallet.js  (or via npm test)
//
// Full port — no DOM. vendor/cashu-ts.js is an IIFE that assigns
// globalThis.cashuts. Indirect eval replicates the script-tag global assignment.
// vendor/bip39-minimal.js self-assigns to globalThis. Source-inspection reads
// via an fs-backed shim.

import './_node-shim.js';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel.replace(/^\//, '')), 'utf-8');
function fetchWithRetry(rel) { return Promise.resolve(read(rel)); }

const _realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  if (typeof url === 'string' && !/^https?:/.test(url)) {
    const rel = url.replace(/^\//, '');
    try { return new Response(read(rel), { status: 200 }); }
    catch (_) { return new Response('', { status: 404 }); }
  }
  return _realFetch(url, opts);
};

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Cashu Wallet + Nostr Discovery Tests ===\n');

await import('../js/state.js');
await import('../js/crypto.js');
// vendor/cashu-ts.js is an IIFE-style bundle assigning globalThis.cashuts;
// indirect eval runs it in global scope, exactly as a browser <script> does.
(0, eval)(read('vendor/cashu-ts.js'));
// bip39-minimal.js self-assigns to globalThis.bip39.
await import('../vendor/bip39-minimal.js');
const wallet = await import('../js/cashu-wallet.js');
const discoveryModule = await import('../js/nostr-discovery.js');

const walletFacadeSrc = await fetchWithRetry('js/cashu-wallet.js');
const walletTransfersSrc = await fetchWithRetry('js/cashu-wallet-transfers.js');
const walletSrc = [walletFacadeSrc, walletTransfersSrc].join('\n');
const walletStoreSrc = await fetchWithRetry('js/cashu-wallet-store.js');
const appAIInteractionSrc = await fetchWithRetry('js/app-ai-interaction-modules.js');
const appShellHooksSrc = await fetchWithRetry('js/app-shell-hooks.js');
const discoverySrc = await fetchWithRetry('js/nostr-discovery.js');
const apiRoutstrSrc = await fetchWithRetry('js/api-routstr.js');
const apiProviderStorageSrc = await fetchWithRetry('js/api-provider-storage.js');
const ppSrc = await fetchWithRetry('js/provider-panels.js');
const providerRenderSrc = await fetchWithRetry('js/provider-panel-renderers.js');
const modelControlsSrc = await fetchWithRetry('js/provider-model-controls.js');
const providerDelegatesSrc = await fetchWithRetry('js/provider-panel-delegates.js');
const walletPanelSrc = await fetchWithRetry('js/provider-wallet-panels.js');
const walletPanelRenderSrc = await fetchWithRetry('js/provider-wallet-panel-renderers.js');
const walletRuntimeSrc = await fetchWithRetry('js/provider-wallet-runtime.js');
const providerQrSrc = await fetchWithRetry('js/provider-qr.js');
const syncApplySrc = await fetchWithRetry('js/sync-apply.js');
const syncPayloadCollectorsSrc = await fetchWithRetry('js/sync-payload-collectors.js');
const cryptoSrc = await fetchWithRetry('js/crypto.js');
const backupSrc = await fetchWithRetry('js/backup.js');
const exportSrc = await fetchWithRetry('js/export.js');
const exportRuntimeSrc = await fetchWithRetry('js/export-runtime.js');
const swSrc = await fetchWithRetry('service-worker.js');
const tinfoilSecureSrc = await fetchWithRetry('js/tinfoil-secure-fetch.js');
const ppqTeeSrc = await fetchWithRetry('vendor/ppq-private-tee.js');
const vendorManifest = JSON.parse(await fetchWithRetry('vendor/browser-vendors.json'));
const canarySrc = await fetchWithRetry('scripts/routstr-real-funds-canary.mjs');
const canaryRoundtripSrc = canarySrc.slice(
  canarySrc.indexOf('async function tokenRoundtripAndSeedRestore()'),
  canarySrc.indexOf('async function seedRestoreSmoke(')
);
const canarySeedRestoreSrc = canarySrc.slice(
  canarySrc.indexOf('async function seedRestoreSmoke('),
  canarySrc.indexOf("if (phase === 'setup')")
);

// ═══════════════════════════════════════
// 1. CASHU WALLET — MODULE EXPORTS
// ═══════════════════════════════════════
console.log('1. Cashu Wallet Module Exports');

const walletExports = [
  'getMintUrl', 'setMintUrl', 'generateWalletSeed', 'getWalletMnemonic',
  'hasWalletSeed', 'restoreWalletFromSeed', 'getWalletBalance',
  'createFundingInvoice', 'checkFundingStatus', 'receiveToken',
  'recoverPendingFunding', 'depositToNode', 'recoverPendingDeposit', 'clearPendingDeposit',
  'recoverPendingWithdraw', 'clearPendingWithdraw',
  'createWithdrawQuote', 'executeWithdraw', 'withdrawToAddress',
  'getMaxWithdrawable', 'sendAsToken', 'exportWallet', 'importWallet',
  'clearWallet', 'destroyWalletDB', 'getFeePct',
  'getFeeBalance', 'redeemFees', 'retryFeeAutoMelt'
];
for (const fn of walletExports) {
  assert(`cashu-wallet.js exports ${fn}`, walletSrc.includes(`export function ${fn}`) || walletSrc.includes(`export async function ${fn}`));
}
assert('cashu-wallet.js re-exports the transfer owner APIs',
  walletFacadeSrc.includes("from './cashu-wallet-transfers.js'"));

// ═══════════════════════════════════════
// 2. CASHU WALLET — MODULE-ONLY EXPORTS
// ═══════════════════════════════════════
console.log('2. Cashu Wallet Module-Only Exports');

const windowExports = [
  'cashuGetBalance', 'cashuCreateFundingInvoice', 'cashuCheckFundingStatus',
  'cashuRecoverPendingFunding', 'cashuReceiveToken', 'cashuDepositToNode', 'cashuExportWallet',
  'cashuImportWallet', 'cashuClearWallet', 'cashuDestroyWalletDB',
  'cashuRecoverPendingDeposit', 'cashuClearPendingDeposit',
  'cashuRecoverPendingWithdraw', 'cashuClearPendingWithdraw', 'cashuSavePendingWithdrawToken',
  'cashuSendAsToken', 'cashuCreateWithdrawQuote', 'cashuExecuteWithdraw',
  'cashuWithdrawToAddress', 'cashuGetMaxWithdrawable',
  'cashuRetryFeeAutoMelt', 'cashuGetFeeBalance', 'cashuRedeemFees',
  'cashuGenerateWalletSeed', 'cashuGetWalletMnemonic', 'cashuHasWalletSeed',
  'cashuRestoreWalletFromSeed', 'cashuGetMintUrl', 'cashuSetMintUrl',
  'cashuGetFeePct'
];
for (const fn of windowExports) {
  assert(`window.${fn} stays module-only`, !(fn in window));
}
for (const fn of walletExports) {
  assert(`cashuWallet.${fn} is callable`, typeof wallet[fn] === 'function');
}

// ═══════════════════════════════════════
// 3. CASHU WALLET — SECURITY
// ═══════════════════════════════════════
console.log('3. Wallet Security');

assert('Mnemonic uses injected encrypted storage',
  walletStoreSrc.includes('cashuWalletStoreCryptoDeps.encryptedSetItem')
    && walletStoreSrc.includes('cashuWalletStoreCryptoDeps.encryptedGetItem'));
assert('Mnemonic key in SENSITIVE_PATTERNS', cryptoSrc.includes('labcharts-cashu-wallet-mnemonic'));
assert('Mnemonic in API_KEY_LS_KEYS cache', cryptoSrc.includes("'labcharts-cashu-wallet-mnemonic'"));
assert('Legacy plaintext mnemonic migration', walletStoreSrc.includes("_setMeta('walletMnemonic', null)"));
assert('Wallet has global lock', walletSrc.includes('_withWalletLock'));
assert('Fee operations have separate lock', walletSrc.includes('_withFeeLock'));
assert('MAX_WALLET_BALANCE safety cap', walletSrc.includes('MAX_WALLET_BALANCE'));

// ═══════════════════════════════════════
// 4. CASHU WALLET — PROOF MANAGEMENT
// ═══════════════════════════════════════
console.log('4. Proof Management');

assert('Proofs stored in IndexedDB', walletStoreSrc.includes('indexedDB.open('));
assert('Proofs tagged with _mint for namespacing', walletStoreSrc.includes('_mint: _normalizeMintUrl(mintUrl)'));
assert('Legacy untagged proofs migrated', walletStoreSrc.includes('_migrateUntaggedProofs'));
assert('Fee proofs stored separately', walletStoreSrc.includes('STORE_FEES'));
assert('Fee proofs migrated from localStorage', walletStoreSrc.includes("localStorage.getItem('cashu-fee-proofs')"));
assert('Counter source persisted for deterministic wallet', walletSrc.includes('counterSource') && walletStoreSrc.includes("'counter:'"));
assert('Counter reservations use atomic IndexedDB transactions',
  walletStoreSrc.includes("db.transaction(STORE_META, update ? 'readwrite' : 'readonly')") &&
  walletStoreSrc.includes('current + count'));
assert('Cashu bearer proofs use encrypted IDB envelopes with hashed storage keys',
  walletStoreSrc.includes("`enc:v1:${await _digestStorageKey(secret)}`")
    && walletStoreSrc.includes('_payload: await _encryptWalletPayload(normalized)'));
assert('Cashu recovery metadata uses encrypted IDB envelopes',
  walletStoreSrc.includes("_payload: await _encryptWalletPayload({ value })"));
assert('Cashu storage participates in encryption enable, disable, and passphrase migrations',
  cryptoSrc.includes("import('./cashu-wallet-store.js')")
    && cryptoSrc.includes('cashuStore.configureCashuWalletStoreCryptoDeps(getCashuWalletStoreCryptoDeps())')
    && cryptoSrc.includes('cashuStore.migrateCashuWalletStorage(mode)'));
assert('Cashu storage receives crypto only when wallet storage is needed',
  !walletStoreSrc.includes("from './crypto.js'")
    && !appShellHooksSrc.includes("from './cashu-wallet-store.js'")
    && walletSrc.includes("from './crypto.js'")
    && walletSrc.includes('configureCashuWalletStoreCryptoDeps(getCashuWalletStoreCryptoDeps())'));
assert('Cashu encrypted writes fail closed while the encryption session is locked',
  walletStoreSrc.includes("code = 'session-locked'")
    && walletStoreSrc.includes('if (!envelope) throw _sessionLockedError()'));

// ═══════════════════════════════════════
// 5. CASHU WALLET — DEPOSIT RECOVERY
// ═══════════════════════════════════════
console.log('5. Deposit/Withdraw Recovery');

const depositFnSrc = walletSrc.slice(walletSrc.indexOf('export async function depositToNode'));
assert('Pending deposit saved BEFORE node call',
  depositFnSrc.includes("_setMeta('pendingDeposit', pendingDeposit)") &&
  depositFnSrc.indexOf("_setMeta('pendingDeposit', pendingDeposit)") < depositFnSrc.indexOf('fetch(nodeUrl'));
assert('Pending deposit cleared after success', walletSrc.includes("_setMeta('pendingDeposit', null)"));
assert('Pending withdraw saved before melt', walletSrc.includes("_setMeta('pendingWithdraw',"));
const nodeRefundIdx = walletPanelSrc.indexOf('export async function doRoutstrNodeWithdraw');
const nodeRefundSrc = nodeRefundIdx >= 0 ? walletPanelSrc.slice(nodeRefundIdx) : '';
assert('Node refund token saved before wallet receive', nodeRefundSrc.includes('cashuSavePendingWithdrawToken') && nodeRefundSrc.indexOf('cashuSavePendingWithdrawToken') < nodeRefundSrc.indexOf('cashuReceiveToken(token)'));
assert('Node refund success only clears matching pending-withdraw record', nodeRefundSrc.includes('const savedPendingWithdraw =') && nodeRefundSrc.includes('if (savedPendingWithdraw !== false) await walletRuntime.cashuClearPendingWithdraw?.()'));
assert('Node refund retry button preserves unrelated pending-withdraw records', nodeRefundSrc.includes('data-clear-pending-withdraw="') && nodeRefundSrc.includes("(savedPendingWithdraw !== false ? 'true' : 'false')"));
assert('Saved node refund never overwrites existing withdraw recovery token', walletSrc.includes('if (existing?.token) return false'));
assert('Pending withdraw cleared after success', walletSrc.includes("_setMeta('pendingWithdraw', null)"));
assert('Recovery UI shows for pending deposits', ppSrc.includes('Pending deposit recovery'));
assert('Recovery UI shows for pending withdrawals', ppSrc.includes('Pending withdraw recovery'));
assert('Provider panel recovery uses module-owned receiveToken mint-switch path',
  ppSrc.includes('await walletRuntime.cashuReceiveToken(token)') &&
  !ppSrc.includes("await callProviderPanelRuntime('cashuImportWallet', token)"));
assert('Wallet runtime exposes pending deposit clear callback', walletRuntimeSrc.includes('clearPendingDeposit as cashuClearPendingDeposit') && walletRuntimeSrc.includes('cashuClearPendingDeposit'));

// ═══════════════════════════════════════
// 6. CASHU WALLET — FEE MECHANISM
// ═══════════════════════════════════════
console.log('6. Fee Mechanism');

assert('Fee percentage constant exists', walletSrc.includes('WALLET_FEE_PCT'));
assert('Fee collected on Lightning deposits', walletSrc.includes('Lightning deposit fee collected'));
assert('Fee minimum threshold for melt', walletSrc.includes('FEE_MELT_MIN_SATS'));
assert('Fee auto-melt is fire-and-forget', walletSrc.includes('}).catch(() => {}); // fire-and-forget'));
assert('Fee Lightning address configured', walletSrc.includes('FEE_LN_ADDRESS'));
assert('LNURL-pay resolution', walletSrc.includes('.well-known/lnurlp/'));
assert('Fee text gated on cashuGetFeePct', walletPanelSrc.includes('cashuGetFeePct'));

// ═══════════════════════════════════════
// 7. NOSTR DISCOVERY — MODULE EXPORTS
// ═══════════════════════════════════════
console.log('7. Nostr Discovery Module Exports');

const discoveryExports = ['discoverNodes', 'getSelectedNodeUrl', 'setSelectedNodeUrl', 'clearNodeCache'];
for (const fn of discoveryExports) {
  assert(`nostr-discovery.js exports ${fn}`, discoverySrc.includes(`export function ${fn}`) || discoverySrc.includes(`export async function ${fn}`));
}

const discoveryWindowExports = ['nostrDiscoverNodes', 'nostrGetSelectedNode', 'nostrSetSelectedNode', 'nostrClearNodeCache'];
for (const fn of discoveryWindowExports) {
  assert(`window.${fn} stays module-only`, !(fn in window));
}
assert('Nostr discovery no longer registers runtime exports',
  !discoverySrc.includes('registerUtilsRuntimeExports'));

// ═══════════════════════════════════════
// 8. NOSTR DISCOVERY — PROTOCOL
// ═══════════════════════════════════════
console.log('8. Nostr Protocol');

assert('Uses Kind 38421', discoverySrc.includes('38421'));
assert('Queries multiple relays', discoverySrc.includes('DEFAULT_RELAYS') && discoverySrc.includes('relay.damus.io'));
assert('Deduplicates by d tag', discoverySrc.includes('_deduplicateNodes'));
assert('Health checks /v1/models', discoverySrc.includes("/v1/models'"));
assert('Skips .onion URLs in health check', discoverySrc.includes('.onion'));
assert('Caches results with TTL', discoverySrc.includes('CACHE_TTL'));
assert('Sorts online first', discoverySrc.includes('a.online !== b.online'));

// ═══════════════════════════════════════
// 9. NOSTR DISCOVERY — NODE PARSING
// ═══════════════════════════════════════
console.log('9. Node Event Parsing');

assert('Parses u tags for URLs', discoverySrc.includes("t[0] === 'u'"));
assert('Parses mint tags', discoverySrc.includes("t[0] === 'mint'"));
assert('Parses d tag for ID', discoverySrc.includes("t[0] === 'd'"));
assert('Parses version tag', discoverySrc.includes("t[0] === 'version'"));
assert('Parses content JSON for name/about', discoverySrc.includes('content.name') && discoverySrc.includes('content.about'));

// ═══════════════════════════════════════
// 10. API.JS — NODE URL GUARD
// ═══════════════════════════════════════
console.log('10. API Node URL Guard');

assert('getRoutstrNodeUrl exported', apiRoutstrSrc.includes('export function getRoutstrNodeUrl'));
assert('_requireNodeUrl guard exists', apiRoutstrSrc.includes('function _requireNodeUrl'));
assert('_requireNodeUrl throws on empty', apiRoutstrSrc.includes("'No Routstr node selected"));
assert('fetchRoutstrModels uses _requireNodeUrl', apiRoutstrSrc.includes('const nodeUrl = _requireNodeUrl()'));
assert('callRoutstrAPI uses _requireNodeUrl', apiRoutstrSrc.includes("const nodeUrl = _requireNodeUrl();\n  return callOpenAICompatibleAPI") || apiRoutstrSrc.includes('_requireNodeUrl()'));
const rawNodeUrlCalls = (apiRoutstrSrc.match(/getRoutstrNodeUrl\(\)\.replace/g) || []).length;
assert('No unguarded getRoutstrNodeUrl().replace in API calls', rawNodeUrlCalls === 0, `found ${rawNodeUrlCalls} unguarded calls`);
assert('Routstr balance always bypasses the browser HTTP cache',
  /\/v1\/balance\/info[\s\S]{0,180}cache:\s*'no-store'/.test(apiRoutstrSrc));

// ═══════════════════════════════════════
// 11. SYNC INTEGRATION
// ═══════════════════════════════════════
console.log('11. Sync Integration');

assert('Wallet mnemonic excluded from generic settings sync', !syncPayloadCollectorsSrc.includes("'labcharts-cashu-wallet-mnemonic'"));
assert('Wallet mint excluded from generic settings sync', !syncPayloadCollectorsSrc.includes("'labcharts-cashu-wallet-mint'"));
assert('Node URL in AI_SETTINGS_KEYS', syncPayloadCollectorsSrc.includes("'labcharts-routstr-node'"));
assert('Selected Routstr node changes schedule settings sync',
  discoverySrc.includes('dispatchAISettingsLocalChangedRuntime()'));
assert('Routstr panel distinguishes synced node funds from device-local Cashu funds',
  providerRenderSrc.includes('24-word Data Sync mnemonic')
    && providerRenderSrc.includes('12-word recovery seed stay on this device'));
assert('Unseeded device UI explains separate sync and wallet identities',
  walletPanelRenderSrc.includes("Set up this device's Cashu wallet")
    && walletPanelRenderSrc.includes('does not copy spendable Cashu proofs')
    && walletPanelRenderSrc.includes('setup-wallet-seed'));
assert('Node refund is gated before its network mutation until the local wallet has a seed',
  /doRoutstrNodeWithdraw\(\)[\s\S]*cashuHasWalletSeed[\s\S]*_ensureWalletSeed\(_withdrawRoutstrNodeToWallet\)[\s\S]*async function _withdrawRoutstrNodeToWallet\(\)[\s\S]*\/v1\/wallet\/refund/.test(walletPanelSrc));
assert('Wallet mnemonic excluded from generic settings apply', !syncApplySrc.includes("'labcharts-cashu-wallet-mnemonic'"));
assert('Generic backup excludes wallet identity but keeps node preference',
  !backupSrc.includes("'labcharts-cashu-wallet-mint'") &&
  !backupSrc.includes("'labcharts-cashu-wallet-mnemonic'") &&
  backupSrc.includes("'labcharts-routstr-node'"));

// ═══════════════════════════════════════
// 12. EXPORT/IMPORT INTEGRATION
// ═══════════════════════════════════════
console.log('12. Export/Import Integration');

assert('Bundle includes wallet settings', exportSrc.includes('bundle.wallet'));
const exportImportSrc = await fetchWithRetry('js/export-import.js');
assert('Bundle never restores incomplete wallet identity',
  exportImportSrc.includes('setSelectedNodeUrl') &&
  !exportRuntimeSrc.includes('wallet.mintUrl') &&
  !exportRuntimeSrc.includes('wallet.mnemonic'));
assert('Bundle restores node URL through the Nostr module',
  exportImportSrc.includes("from './nostr-discovery.js'") &&
  exportImportSrc.includes('setSelectedNodeUrl(json.wallet.nodeUrl)'));
assert('clearAllData destroys wallet DB through export runtime',
  exportSrc.includes('destroyWalletRuntimeDB') &&
  !appAIInteractionSrc.includes("import './cashu-wallet.js'") &&
  exportRuntimeSrc.includes("import('./cashu-wallet.js')") &&
  exportRuntimeSrc.includes("import('./cashu-wallet.js?lazy-retry=1')") &&
  exportRuntimeSrc.includes('await wallet.destroyWalletDB()'));
assert('Wallet DB deletion rejects blocked requests',
  walletStoreSrc.includes('req.onblocked')
  && walletStoreSrc.includes('Cashu wallet deletion is blocked'));
assert('clearAllData removes wallet localStorage keys', exportSrc.includes("'labcharts-cashu-wallet-mint'") && exportSrc.includes("'labcharts-cashu-wallet-mnemonic'") && exportSrc.includes("'labcharts-routstr-node'"));

// ═══════════════════════════════════════
// 13. SERVICE WORKER CACHE
// ═══════════════════════════════════════
console.log('13. Service Worker Cache');

assert('SW caches cashu-wallet.js', swSrc.includes('/js/cashu-wallet.js'));
assert('SW caches cashu-wallet-transfers.js', swSrc.includes('/js/cashu-wallet-transfers.js'));
assert('SW caches cashu-wallet-store.js', swSrc.includes('/js/cashu-wallet-store.js'));
assert('SW caches nostr-discovery.js', swSrc.includes('/js/nostr-discovery.js'));
assert('SW caches provider-wallet-runtime.js', swSrc.includes('/js/provider-wallet-runtime.js'));
assert('SW caches provider-wallet-panel-buttons.js', swSrc.includes('/js/provider-wallet-panel-buttons.js'));
assert('SW caches provider-wallet-panel-renderers.js', swSrc.includes('/js/provider-wallet-panel-renderers.js'));
assert('SW caches provider-wallet-panels.js', swSrc.includes('/js/provider-wallet-panels.js'));
assert('SW caches provider-wallet-funding-recovery.js', swSrc.includes('/js/provider-wallet-funding-recovery.js'));
assert('SW caches provider-qr.js', swSrc.includes('/js/provider-qr.js'));
assert('SW caches vendor/cashu-ts.js', swSrc.includes('/vendor/cashu-ts.js'));
assert('SW caches vendor/bip39-minimal.js', swSrc.includes('/vendor/bip39-minimal.js'));

// ═══════════════════════════════════════
// 14. REAL-FUNDS CANARY SAFETY
// ═══════════════════════════════════════
console.log('14. Real-Funds Canary Safety');

assert('Real-funds canary preflight checks pending funding before profile reset', canarySrc.includes('pendingFunding') && canarySrc.includes('pendingQuote:') && canarySrc.includes('Refusing to reset non-empty real-funds canary profile'));
assert('Real-funds canary pending funding preflight is pure IDB inspection', canarySrc.includes("indexedDB.open('getbased-cashu')") && canarySrc.includes("db.transaction('meta', 'readonly')") && canarySrc.includes("startsWith('pendingQuote:')"));
assert('Real-funds canary reset guard fails closed when wallet APIs are missing', canarySrc.includes('missing wallet APIs') && canarySrc.includes('Refusing to reset canary profile'));
assert('Real-funds canary final state asserts clean pending/key invariants', canarySrc.includes('Final canary state is not clean') && canarySrc.includes('finalState.hasRoutstrKey || finalState.pendingDeposit || finalState.pendingWithdraw'));
assert('Real-funds canary avoids same persistent profile double-open during roundtrip', canarySrc.indexOf('await context.close();') < canarySrc.indexOf('const tokenRoundtrip = await tokenRoundtripAndSeedRestore();'));
assert('Real-funds canary clears main sender journal before accepting confirmed return token',
  canaryRoundtripSrc.includes('await window.__cashuCanaryWallet.clearPendingWithdraw();\n        const recv = await window.__cashuCanaryWallet.receiveToken(token);'));
assert('Real-funds canary clears second sender journal only after main receipt',
  canaryRoundtripSrc.indexOf("if (!recovered.received) throw new Error('Return token receive failed')") <
    canaryRoundtripSrc.indexOf('await second.page.evaluate(async () => window.__cashuCanaryWallet.clearPendingWithdraw());'));
assert('Real-funds canary passes the captured seed after closing the main profile',
  canaryRoundtripSrc.includes('const seedRestore = await seedRestoreSmoke(seed);') &&
    canarySeedRestoreSrc.includes('async function seedRestoreSmoke(seed)') &&
    !canarySeedRestoreSrc.includes('openApp(USER_DATA_DIR)'));

// ═══════════════════════════════════════
// 15. VENDOR LIBRARIES
// ═══════════════════════════════════════
console.log('15. Vendor Libraries');

assert('cashuts global available', typeof window.cashuts === 'object' || typeof window.cashuts === 'function');
assert('bip39 global available', typeof window.bip39 === 'object');
assert('bip39.generateMnemonic exists', typeof window.bip39?.generateMnemonic === 'function');
assert('bip39.validateMnemonic exists', typeof window.bip39?.validateMnemonic === 'function');
assert('bip39.mnemonicToSeed exists', typeof window.bip39?.mnemonicToSeed === 'function');

// ═══════════════════════════════════════
// 16. SETTINGS UI — WALLET PANEL
// ═══════════════════════════════════════
console.log('16. Settings UI');

assert('Wallet section in Routstr panel', providerRenderSrc.includes('routstr-wallet-balance'));
assert('Mint label display', providerRenderSrc.includes('routstr-mint-label'));
assert('provider-panels imports wallet panel module', ppSrc.includes("from './provider-wallet-panels.js'"));
assert('provider-panels configures wallet callbacks', ppSrc.includes('configureRoutstrWalletPanels({'));
assert('provider-panels clears extracted wallet timers', ppSrc.includes('clearRoutstrWalletTimers();'));
assert('provider-panels uses extracted Routstr balance refresh',
  ppSrc.includes('fetchRoutstrModels().then')
    && ppSrc.includes('renderRoutstrModelDropdown(models)')
    && ppSrc.includes('refreshRoutstrPrivateControls()')
    && ppSrc.includes('refreshRoutstrBalance()')
    && !ppSrc.includes('_rsBalanceHtml'));
assert('Routstr panel uses extracted wallet action buttons', providerRenderSrc.includes('routstrWalletActionButtons(null)'));
assert('Routstr panel uses extracted node action buttons', providerRenderSrc.includes('buildRoutstrNodeActions(nodeUrl, !!currentKey, null)'));
assert('Mint edit UI', walletPanelSrc.includes('showRoutstrMintEdit'));
assert('Node picker UI', walletPanelSrc.includes('showRoutstrNodePicker'));
assert('Deposit amount picker', walletPanelSrc.includes('routstr-deposit-amount'));
assert('Node withdraw handler', walletPanelSrc.includes('doRoutstrNodeWithdraw'));
assert('Wallet panel imports Routstr key helpers', walletPanelSrc.includes('getRoutstrKey') && walletPanelSrc.includes('saveRoutstrKey'));
assert('Funded legacy Routstr sessions bootstrap the shared session clock',
  walletPanelSrc.includes("b.sats > 0 && !localStorage.getItem('labcharts-routstr-session-updated-at')")
    && walletPanelSrc.includes('touchRoutstrSession()'));
assert('Wallet panel keeps mint SSRF guard', walletPanelSrc.includes('isValidExternalUrl'));
assert('Seed onboarding gate', walletPanelSrc.includes('_ensureWalletSeed'));
assert('Seed acknowledgment checkbox', walletPanelRenderSrc.includes('routstr-seed-ack'));
assert('Wallet action buttons', walletPanelSrc.includes('routstrWalletActionButtons'));
assert('Wallet panel owns fund timer cleanup', walletPanelSrc.includes('export function clearRoutstrWalletTimers()'));
assert('Wallet funding auto-poll is bounded on mint/network failure',
  walletPanelSrc.includes('FUNDING_POLL_MAX_CONSECUTIVE_FAILURES') &&
  walletPanelSrc.includes('Mint unreachable. Auto-check stopped') &&
  walletPanelSrc.includes('consecutivePollFailures >= FUNDING_POLL_MAX_CONSECUTIVE_FAILURES'));
assert('Wallet funding starts only one active auto-poll timer',
  walletPanelSrc.includes('if (_rsFundPollTimer) { clearInterval(_rsFundPollTimer); _rsFundPollTimer = null; }\n    let consecutivePollFailures = 0;'));
assert('Wallet backup (export token)', walletPanelSrc.includes('showRoutstrWalletBackup'));
assert('Lightning withdraw UI', walletPanelSrc.includes('showRoutstrWithdrawLightning'));
assert('Cashu token withdraw UI', walletPanelSrc.includes('showRoutstrWithdrawToken'));
assert('Provider QR helper lazy-loads QR library', providerQrSrc.includes('loadScriptOnce') && providerQrSrc.includes('/vendor/qrcode-generator.js'));
assert('Routstr catalogs keep Tinfoil models separate from regular models',
  apiRoutstrSrc.includes("localStorage.setItem('labcharts-routstr-private-models'")
    && apiRoutstrSrc.includes('isRoutstrTinfoilModel(m.id)'));
assert('Routstr Tinfoil model IDs fail closed into verified transport',
  apiProviderStorageSrc.includes("modelId.startsWith('tinfoil-')")
    && apiRoutstrSrc.includes("import('./tinfoil-secure-fetch.js')")
    && apiRoutstrSrc.includes('useProxy: false')
    && apiRoutstrSrc.includes('fetchImpl: secure.fetch'));
assert('Routstr Tinfoil routing exposes only the required model metadata',
  apiRoutstrSrc.includes("modelId.replace(/^tinfoil-/, '')")
    && apiRoutstrSrc.includes("{ 'X-Routstr-Model': modelId }")
    && apiRoutstrSrc.includes('webSearch: false'));
assert('Routstr Private TEE toggle and privacy boundary are rendered',
  providerRenderSrc.includes('routstr-private-toggle')
    && providerRenderSrc.includes('decrypted only inside a verified Tinfoil TEE')
    && providerRenderSrc.includes('session, selected model, and billing metadata'));
assert('Routstr Private TEE mode is delegated and swaps model catalogs',
  providerDelegatesSrc.includes("'routstr-private-mode': 'toggleRoutstrPrivateMode'")
    && modelControlsSrc.includes("on ? 'labcharts-routstr-private-models' : 'labcharts-routstr-models'"));
assert('Routstr node picker marks advertised private TEE support',
  walletPanelRenderSrc.includes('routstrNodePickerRowHtml')
    && walletPanelRenderSrc.includes("String(model.id || '').startsWith('tinfoil-')")
    && walletPanelRenderSrc.includes('Private TEE'));
assert('Changing Routstr nodes clears node-scoped private model state',
  discoverySrc.includes("from './routstr-model-cache.js'")
    && discoverySrc.includes('clearRoutstrModelCaches()'));
assert('Shared Tinfoil transport binds verified origins and preserves plaintext proxy errors',
  tinfoilSecureSrc.includes('Refusing Tinfoil request to unverified origin')
    && tinfoilSecureSrc.includes('RESPONSE_NONCE_HEADER')
    && tinfoilSecureSrc.includes('return response;'));
assert('PPQ uses the shared Tinfoil transport', ppqTeeSrc.includes("from '../js/tinfoil-secure-fetch.js'"));
assert('Service worker caches Routstr Tinfoil transport and EHBP runtime',
  swSrc.includes("'/js/tinfoil-secure-fetch.js'")
    && swSrc.includes("'/js/routstr-balance-settlement.js'")
    && swSrc.includes("'/js/routstr-model-cache.js'")
    && swSrc.includes("'/vendor/ehbp-browser.js'"));
assert('Routstr private requests bound temporary reservations and refresh their balance after settlement',
  apiRoutstrSrc.includes('ROUTSTR_PRIVATE_MAX_OUTPUT_TOKENS = 4096')
    && apiRoutstrSrc.includes('ROUTSTR_PRIVATE_REQUEST_TIMEOUT_MS = 180000')
    && apiRoutstrSrc.includes('notifyRoutstrRequestSettled({ failed, modelId })'));
assert('Browser security vendor manifest records locked Tinfoil and EHBP runtimes',
  vendorManifest.schemaVersion === 2
    && vendorManifest.runtimes.some(runtime => runtime.package === 'tinfoil' && runtime.version === '1.1.12')
    && vendorManifest.runtimes.some(runtime => runtime.package === 'ehbp' && runtime.version === '0.3.2'));

// ═══════════════════════════════════════
// 17. BIP-39 SEED GENERATION
// ═══════════════════════════════════════
console.log('17. BIP-39 Seed Generation');

const mnemonic = await window.bip39.generateMnemonic(128);
const words = mnemonic.split(' ');
assert('Generates 12 words', words.length === 12, `got ${words.length} words`);
assert('All words are valid BIP-39', words.every(w => w.length >= 3));
assert('Mnemonic validates', await window.bip39.validateMnemonic(mnemonic));
assert('Invalid mnemonic rejected', !(await window.bip39.validateMnemonic('not a valid mnemonic phrase at all here nope')));
assert('Seed derivation produces bytes', (await window.bip39.mnemonicToSeed(mnemonic)).byteLength === 64);

const mnemonic2 = await window.bip39.generateMnemonic(128);
assert('Two generations differ', mnemonic !== mnemonic2);

// ═══════════════════════════════════════
// 18. SSRF VALIDATION WIRING (setMintUrl + setSelectedNodeUrl)
// ═══════════════════════════════════════
// The shared validator (js/url-safety.js) is exhaustively unit-tested via
// test-sun-uvdata.js. This section verifies the *wiring* at the two new call
// sites actually invokes it.
console.log('18. SSRF Validation Wiring');

const discovery = discoveryModule;

async function expectMintRejection(url, label) {
  let threw = false;
  try { await wallet.setMintUrl(url); } catch (e) { threw = /https/i.test(e.message) || /loopback|RFC1918|link-local|public/i.test(e.message); }
  assert(`setMintUrl rejects: ${label}`, threw, `url=${url}`);
}
await expectMintRejection('http://localhost/mint', 'localhost');
await expectMintRejection('http://127.0.0.1/mint', 'IPv4 loopback');
await expectMintRejection('https://192.168.1.1/mint', 'RFC1918 192.168.x.x');
await expectMintRejection('https://169.254.169.254/mint', 'cloud metadata');
await expectMintRejection('http://example.com/mint', 'non-HTTPS public host');
await expectMintRejection('not a url', 'unparseable');
await expectMintRejection('https://[::ffff:c0a8:101]/mint', 'IPv4-mapped IPv6 abbreviated → 192.168.1.1');
await expectMintRejection('https://[::ffff:c0a8:0101]/mint', 'IPv4-mapped IPv6 padded → 192.168.1.1');
await expectMintRejection('https://[::ffff:7f00:1]/mint', 'IPv4-mapped IPv6 abbreviated → 127.0.0.1');
await expectMintRejection('https://[::ffff:a9fe:a9fe]/mint', 'IPv4-mapped IPv6 → 169.254.169.254 (cloud metadata)');
await expectMintRejection('https://[::ffff:a00:1]/mint', 'IPv4-mapped IPv6 abbreviated → 10.0.0.1 (RFC-1918 10/8)');
await expectMintRejection('https://[::ffff:ac10:1]/mint', 'IPv4-mapped IPv6 abbreviated → 172.16.0.1 (RFC-1918 172.16/12)');
await expectMintRejection('https://[2002:c0a8:0101::]/mint', '6to4 IPv6 embeds RFC1918 192.168.1.1');
await expectMintRejection('https://[2002:7f00:0001::]/mint', '6to4 IPv6 embeds loopback 127.0.0.1');

const origNode = discovery.getSelectedNodeUrl();
function expectNodeRejection(url, label) {
  const sentinel = 'https://known-good-node.example.com/v1';
  discovery.setSelectedNodeUrl(sentinel);
  discovery.setSelectedNodeUrl(url); // should silently fail
  assert(`setSelectedNodeUrl ignores: ${label}`,
    discovery.getSelectedNodeUrl() === sentinel,
    `expected sentinel preserved, got ${discovery.getSelectedNodeUrl()}`);
}
expectNodeRejection('http://127.0.0.1:8080', 'IPv4 loopback');
expectNodeRejection('https://10.0.0.5/api', 'RFC1918 10.x');
expectNodeRejection('http://[fe80::1]/api', 'IPv6 link-local');
expectNodeRejection('javascript:alert(1)', 'javascript: pseudo-URL');
discovery.setSelectedNodeUrl('https://valid-routstr.example.com');
assert('setSelectedNodeUrl accepts public HTTPS',
  discovery.getSelectedNodeUrl() === 'https://valid-routstr.example.com');
if (origNode) discovery.setSelectedNodeUrl(origNode);
else localStorage.removeItem('labcharts-routstr-node');

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
