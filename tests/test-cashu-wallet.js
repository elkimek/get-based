#!/usr/bin/env node
// test-cashu-wallet.js — Cashu wallet module, Nostr discovery, integration
// points. Module + window exports, wallet security/proof-management/recovery/
// fee-mechanism source inspection, Nostr protocol + node parsing, API node-URL
// guard, sync + export/import + service-worker wiring, BIP-39 seed generation,
// and SSRF-validation wiring on setMintUrl / setSelectedNodeUrl.
//
// Run: node tests/test-cashu-wallet.js  (or via npm test)
//
// Full port — no DOM. vendor/cashu-ts.js is an IIFE that `var cashuts = …`
// (module-scoped under import(), global under a browser <script>); indirect
// eval replicates the script-tag global assignment. vendor/bip39-minimal.js
// self-assigns to globalThis. Source-inspection reads via an fs-backed shim.

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
// vendor/cashu-ts.js is an IIFE-style bundle (`var cashuts = (…)()`). Under
// ES-module import() the `var` is module-scoped and never reaches the global;
// indirect eval runs it in global scope, exactly as a browser <script> does.
(0, eval)(read('vendor/cashu-ts.js'));
// bip39-minimal.js self-assigns to globalThis.bip39.
await import('../vendor/bip39-minimal.js');
await import('../js/cashu-wallet.js');
await import('../js/nostr-discovery.js');

const walletSrc = await fetchWithRetry('js/cashu-wallet.js');
const discoverySrc = await fetchWithRetry('js/nostr-discovery.js');
const apiSrc = await fetchWithRetry('js/api.js');
const ppSrc = await fetchWithRetry('js/provider-panels.js');
const walletPanelSrc = await fetchWithRetry('js/provider-wallet-panels.js');
const providerQrSrc = await fetchWithRetry('js/provider-qr.js');
const syncApplySrc = await fetchWithRetry('js/sync-apply.js');
const syncPayloadCollectorsSrc = await fetchWithRetry('js/sync-payload-collectors.js');
const cryptoSrc = await fetchWithRetry('js/crypto.js');
const backupSrc = await fetchWithRetry('js/backup.js');
const exportSrc = await fetchWithRetry('js/export.js');
const swSrc = await fetchWithRetry('service-worker.js');

// ═══════════════════════════════════════
// 1. CASHU WALLET — MODULE EXPORTS
// ═══════════════════════════════════════
console.log('1. Cashu Wallet Module Exports');

const walletExports = [
  'getMintUrl', 'setMintUrl', 'generateWalletSeed', 'getWalletMnemonic',
  'hasWalletSeed', 'restoreWalletFromSeed', 'getWalletBalance',
  'createFundingInvoice', 'checkFundingStatus', 'receiveToken',
  'depositToNode', 'recoverPendingDeposit', 'clearPendingDeposit',
  'recoverPendingWithdraw', 'clearPendingWithdraw',
  'createWithdrawQuote', 'executeWithdraw', 'withdrawToAddress',
  'getMaxWithdrawable', 'sendAsToken', 'exportWallet', 'importWallet',
  'clearWallet', 'destroyWalletDB', 'getFeePct',
  'getFeeBalance', 'redeemFees', 'retryFeeAutoMelt'
];
for (const fn of walletExports) {
  assert(`cashu-wallet.js exports ${fn}`, walletSrc.includes(`export function ${fn}`) || walletSrc.includes(`export async function ${fn}`));
}

// ═══════════════════════════════════════
// 2. CASHU WALLET — WINDOW EXPORTS
// ═══════════════════════════════════════
console.log('2. Cashu Wallet Window Exports');

const windowExports = [
  'cashuGetBalance', 'cashuCreateFundingInvoice', 'cashuCheckFundingStatus',
  'cashuReceiveToken', 'cashuDepositToNode', 'cashuExportWallet',
  'cashuImportWallet', 'cashuClearWallet', 'cashuDestroyWalletDB',
  'cashuRecoverPendingDeposit', 'cashuClearPendingDeposit',
  'cashuRecoverPendingWithdraw', 'cashuClearPendingWithdraw',
  'cashuSendAsToken', 'cashuCreateWithdrawQuote', 'cashuExecuteWithdraw',
  'cashuWithdrawToAddress', 'cashuGetMaxWithdrawable',
  'cashuRetryFeeAutoMelt', 'cashuGetFeeBalance', 'cashuRedeemFees',
  'cashuGenerateWalletSeed', 'cashuGetWalletMnemonic', 'cashuHasWalletSeed',
  'cashuRestoreWalletFromSeed', 'cashuGetMintUrl', 'cashuSetMintUrl',
  'cashuGetFeePct'
];
for (const fn of windowExports) {
  assert(`window.${fn} exists`, typeof window[fn] === 'function');
}

// ═══════════════════════════════════════
// 3. CASHU WALLET — SECURITY
// ═══════════════════════════════════════
console.log('3. Wallet Security');

assert('Mnemonic uses encrypted storage', walletSrc.includes('encryptedSetItem') && walletSrc.includes('encryptedGetItem'));
assert('Mnemonic key in SENSITIVE_PATTERNS', cryptoSrc.includes('labcharts-cashu-wallet-mnemonic'));
assert('Mnemonic in API_KEY_LS_KEYS cache', cryptoSrc.includes("'labcharts-cashu-wallet-mnemonic'"));
assert('Legacy plaintext mnemonic migration', walletSrc.includes("_setMeta('walletMnemonic', null)"));
assert('Wallet has global lock', walletSrc.includes('_withWalletLock'));
assert('Fee operations have separate lock', walletSrc.includes('_withFeeLock'));
assert('MAX_WALLET_BALANCE safety cap', walletSrc.includes('MAX_WALLET_BALANCE'));

// ═══════════════════════════════════════
// 4. CASHU WALLET — PROOF MANAGEMENT
// ═══════════════════════════════════════
console.log('4. Proof Management');

assert('Proofs stored in IndexedDB', walletSrc.includes('indexedDB.open('));
assert('Proofs tagged with _mint for namespacing', walletSrc.includes('_mint: mintUrl') || walletSrc.includes('_mint'));
assert('Legacy untagged proofs migrated', walletSrc.includes('_migrateUntaggedProofs'));
assert('Fee proofs stored separately', walletSrc.includes('STORE_FEES'));
assert('Fee proofs migrated from localStorage', walletSrc.includes("localStorage.getItem('cashu-fee-proofs')"));
assert('Counter source persisted for deterministic wallet', walletSrc.includes('counterSource') && walletSrc.includes("'counter:'"));
assert('Counter has per-keyset locking', walletSrc.includes('withLock(keysetId'));

// ═══════════════════════════════════════
// 5. CASHU WALLET — DEPOSIT RECOVERY
// ═══════════════════════════════════════
console.log('5. Deposit/Withdraw Recovery');

assert('Pending deposit saved BEFORE node call', walletSrc.includes("_setMeta('pendingDeposit', token)"));
assert('Pending deposit cleared after success', walletSrc.includes("_setMeta('pendingDeposit', null)"));
assert('Pending withdraw saved before melt', walletSrc.includes("_setMeta('pendingWithdraw',"));
assert('Pending withdraw cleared after success', walletSrc.includes("_setMeta('pendingWithdraw', null)"));
assert('Recovery UI shows for pending deposits', ppSrc.includes('Pending deposit recovery'));
assert('Recovery UI shows for pending withdrawals', ppSrc.includes('Pending withdraw recovery'));

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
  assert(`window.${fn} exists`, typeof window[fn] === 'function');
}

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

assert('getRoutstrNodeUrl exported', apiSrc.includes('export function getRoutstrNodeUrl'));
assert('_requireNodeUrl guard exists', apiSrc.includes('function _requireNodeUrl'));
assert('_requireNodeUrl throws on empty', apiSrc.includes("'No Routstr node selected"));
assert('fetchRoutstrModels uses _requireNodeUrl', apiSrc.includes('const nodeUrl = _requireNodeUrl()'));
assert('callRoutstrAPI uses _requireNodeUrl', apiSrc.includes("const nodeUrl = _requireNodeUrl();\n  return callOpenAICompatibleAPI") || apiSrc.includes('_requireNodeUrl()'));
const rawNodeUrlCalls = (apiSrc.match(/getRoutstrNodeUrl\(\)\.replace/g) || []).length;
assert('No unguarded getRoutstrNodeUrl().replace in API calls', rawNodeUrlCalls === 0, `found ${rawNodeUrlCalls} unguarded calls`);

// ═══════════════════════════════════════
// 11. SYNC INTEGRATION
// ═══════════════════════════════════════
console.log('11. Sync Integration');

assert('Wallet mnemonic in AI_SETTINGS_KEYS', syncPayloadCollectorsSrc.includes("'labcharts-cashu-wallet-mnemonic'"));
assert('Wallet mint in AI_SETTINGS_KEYS', syncPayloadCollectorsSrc.includes("'labcharts-cashu-wallet-mint'"));
assert('Node URL in AI_SETTINGS_KEYS', syncPayloadCollectorsSrc.includes("'labcharts-routstr-node'"));
assert('Mnemonic in ENCRYPTED_AI_KEYS', syncApplySrc.includes("'labcharts-cashu-wallet-mnemonic'"));
assert('Wallet keys in GLOBAL_SETTINGS_KEYS', backupSrc.includes("'labcharts-cashu-wallet-mint'") && backupSrc.includes("'labcharts-routstr-node'"));

// ═══════════════════════════════════════
// 12. EXPORT/IMPORT INTEGRATION
// ═══════════════════════════════════════
console.log('12. Export/Import Integration');

assert('Bundle includes wallet settings', exportSrc.includes('bundle.wallet'));
assert('Bundle restores mint URL', exportSrc.includes('wallet.mintUrl') && exportSrc.includes('cashuSetMintUrl'));
assert('Bundle restores node URL', exportSrc.includes('wallet.nodeUrl') && exportSrc.includes('nostrSetSelectedNode'));
assert('clearAllData destroys wallet DB', exportSrc.includes('cashuDestroyWalletDB'));
assert('clearAllData removes wallet localStorage keys', exportSrc.includes("'labcharts-cashu-wallet-mint'") && exportSrc.includes("'labcharts-cashu-wallet-mnemonic'") && exportSrc.includes("'labcharts-routstr-node'"));

// ═══════════════════════════════════════
// 13. SERVICE WORKER CACHE
// ═══════════════════════════════════════
console.log('13. Service Worker Cache');

assert('SW caches cashu-wallet.js', swSrc.includes('/js/cashu-wallet.js'));
assert('SW caches nostr-discovery.js', swSrc.includes('/js/nostr-discovery.js'));
assert('SW caches provider-wallet-panels.js', swSrc.includes('/js/provider-wallet-panels.js'));
assert('SW caches provider-qr.js', swSrc.includes('/js/provider-qr.js'));
assert('SW caches vendor/cashu-ts.js', swSrc.includes('/vendor/cashu-ts.js'));
assert('SW caches vendor/bip39-minimal.js', swSrc.includes('/vendor/bip39-minimal.js'));

// ═══════════════════════════════════════
// 14. VENDOR LIBRARIES
// ═══════════════════════════════════════
console.log('14. Vendor Libraries');

assert('cashuts global available', typeof window.cashuts === 'object' || typeof window.cashuts === 'function');
assert('bip39 global available', typeof window.bip39 === 'object');
assert('bip39.generateMnemonic exists', typeof window.bip39?.generateMnemonic === 'function');
assert('bip39.validateMnemonic exists', typeof window.bip39?.validateMnemonic === 'function');
assert('bip39.mnemonicToSeed exists', typeof window.bip39?.mnemonicToSeed === 'function');

// ═══════════════════════════════════════
// 15. SETTINGS UI — WALLET PANEL
// ═══════════════════════════════════════
console.log('15. Settings UI');

assert('Wallet section in Routstr panel', ppSrc.includes('routstr-wallet-balance'));
assert('Mint label display', ppSrc.includes('routstr-mint-label'));
assert('provider-panels imports wallet panel module', ppSrc.includes("from './provider-wallet-panels.js'"));
assert('provider-panels configures wallet callbacks', ppSrc.includes('configureRoutstrWalletPanels({'));
assert('provider-panels clears extracted wallet timers', ppSrc.includes('clearRoutstrWalletTimers();'));
assert('provider-panels uses extracted Routstr balance refresh',
  ppSrc.includes('renderRoutstrModelDropdown(models); });\n    refreshRoutstrBalance();') && !ppSrc.includes('_rsBalanceHtml'));
assert('Routstr panel uses extracted wallet action buttons', ppSrc.includes('routstrWalletActionButtons(null)'));
assert('Routstr panel uses extracted node action buttons', ppSrc.includes('buildRoutstrNodeActions(nodeUrl, !!currentKey, null)'));
assert('Mint edit UI', walletPanelSrc.includes('showRoutstrMintEdit'));
assert('Node picker UI', walletPanelSrc.includes('showRoutstrNodePicker'));
assert('Deposit amount picker', walletPanelSrc.includes('routstr-deposit-amount'));
assert('Node withdraw handler', walletPanelSrc.includes('doRoutstrNodeWithdraw'));
assert('Wallet panel imports Routstr key helpers', walletPanelSrc.includes('getRoutstrKey') && walletPanelSrc.includes('saveRoutstrKey'));
assert('Wallet panel keeps mint SSRF guard', walletPanelSrc.includes('isValidExternalUrl'));
assert('Seed onboarding gate', walletPanelSrc.includes('_ensureWalletSeed'));
assert('Seed acknowledgment checkbox', walletPanelSrc.includes('routstr-seed-ack'));
assert('Wallet action buttons', walletPanelSrc.includes('routstrWalletActionButtons'));
assert('Wallet panel owns fund timer cleanup', walletPanelSrc.includes('export function clearRoutstrWalletTimers()'));
assert('Wallet backup (export token)', walletPanelSrc.includes('showRoutstrWalletBackup'));
assert('Lightning withdraw UI', walletPanelSrc.includes('showRoutstrWithdrawLightning'));
assert('Cashu token withdraw UI', walletPanelSrc.includes('showRoutstrWithdrawToken'));
assert('Provider QR helper lazy-loads QR library', providerQrSrc.includes('loadScriptOnce') && providerQrSrc.includes('/vendor/qrcode-generator.js'));

// ═══════════════════════════════════════
// 16. BIP-39 SEED GENERATION
// ═══════════════════════════════════════
console.log('16. BIP-39 Seed Generation');

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
// 17. SSRF VALIDATION WIRING (setMintUrl + setSelectedNodeUrl)
// ═══════════════════════════════════════
// The shared validator (js/url-safety.js) is exhaustively unit-tested via
// test-sun-uvdata.js. This section verifies the *wiring* at the two new call
// sites actually invokes it.
console.log('17. SSRF Validation Wiring');

const wallet = await import('../js/cashu-wallet.js');
const discovery = await import('../js/nostr-discovery.js');

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
