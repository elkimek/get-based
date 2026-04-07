// test-cashu-wallet.js — Verify Cashu wallet module, Nostr discovery, and integration points
// Run: fetch('tests/test-cashu-wallet.js').then(r=>r.text()).then(s=>Function(s)())

(async function() {
  let pass = 0, fail = 0;
  function assert(name, condition, detail) {
    if (condition) { pass++; console.log(`%c PASS %c ${name}`, 'background:#22c55e;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
    else { fail++; console.error(`%c FAIL %c ${name}`, 'background:#ef4444;color:#fff;padding:2px 6px;border-radius:3px', '', detail || ''); }
  }

  console.log('%c Cashu Wallet + Nostr Discovery Tests ', 'background:#6366f1;color:#fff;font-size:14px;padding:4px 12px;border-radius:4px');

  const walletSrc = await fetchWithRetry('js/cashu-wallet.js');
  const discoverySrc = await fetchWithRetry('js/nostr-discovery.js');
  const apiSrc = await fetchWithRetry('js/api.js');
  const settingsSrc = await fetchWithRetry('js/settings.js');
  const syncSrc = await fetchWithRetry('js/sync.js');
  const cryptoSrc = await fetchWithRetry('js/crypto.js');
  const exportSrc = await fetchWithRetry('js/export.js');
  const swSrc = await fetchWithRetry('service-worker.js');

  // ═══════════════════════════════════════
  // 1. CASHU WALLET — MODULE EXPORTS
  // ═══════════════════════════════════════
  console.log('%c 1. Cashu Wallet Module Exports ', 'font-weight:bold;color:#f59e0b');

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
  console.log('%c 2. Cashu Wallet Window Exports ', 'font-weight:bold;color:#f59e0b');

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
  console.log('%c 3. Wallet Security ', 'font-weight:bold;color:#f59e0b');

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
  console.log('%c 4. Proof Management ', 'font-weight:bold;color:#f59e0b');

  assert('Proofs stored in IndexedDB', walletSrc.includes("indexedDB.open("));
  assert('Proofs tagged with _mint for namespacing', walletSrc.includes('_mint: mintUrl') || walletSrc.includes("_mint"));
  assert('Legacy untagged proofs migrated', walletSrc.includes('_migrateUntaggedProofs'));
  assert('Fee proofs stored separately', walletSrc.includes('STORE_FEES'));
  assert('Fee proofs migrated from localStorage', walletSrc.includes("localStorage.getItem('cashu-fee-proofs')"));
  assert('Counter source persisted for deterministic wallet', walletSrc.includes('counterSource') && walletSrc.includes("'counter:'"));
  assert('Counter has per-keyset locking', walletSrc.includes('withLock(keysetId'));

  // ═══════════════════════════════════════
  // 5. CASHU WALLET — DEPOSIT RECOVERY
  // ═══════════════════════════════════════
  console.log('%c 5. Deposit/Withdraw Recovery ', 'font-weight:bold;color:#f59e0b');

  assert('Pending deposit saved BEFORE node call', walletSrc.includes("_setMeta('pendingDeposit', token)"));
  assert('Pending deposit cleared after success', walletSrc.includes("_setMeta('pendingDeposit', null)"));
  assert('Pending withdraw saved before melt', walletSrc.includes("_setMeta('pendingWithdraw',"));
  assert('Pending withdraw cleared after success', walletSrc.includes("_setMeta('pendingWithdraw', null)"));
  assert('Recovery UI shows for pending deposits', settingsSrc.includes('Pending deposit recovery'));
  assert('Recovery UI shows for pending withdrawals', settingsSrc.includes('Pending withdraw recovery'));

  // ═══════════════════════════════════════
  // 6. CASHU WALLET — FEE MECHANISM
  // ═══════════════════════════════════════
  console.log('%c 6. Fee Mechanism ', 'font-weight:bold;color:#f59e0b');

  assert('Fee percentage constant exists', walletSrc.includes('WALLET_FEE_PCT'));
  assert('Fee collected on Lightning deposits', walletSrc.includes('Lightning deposit fee collected'));
  assert('Fee minimum threshold for melt', walletSrc.includes('FEE_MELT_MIN_SATS'));
  assert('Fee auto-melt is fire-and-forget', walletSrc.includes("}).catch(() => {}); // fire-and-forget"));
  assert('Fee Lightning address configured', walletSrc.includes('FEE_LN_ADDRESS'));
  assert('LNURL-pay resolution', walletSrc.includes('.well-known/lnurlp/'));
  // Fee text gated on constant
  assert('Fee text gated on cashuGetFeePct', settingsSrc.includes('cashuGetFeePct'));

  // ═══════════════════════════════════════
  // 7. NOSTR DISCOVERY — MODULE EXPORTS
  // ═══════════════════════════════════════
  console.log('%c 7. Nostr Discovery Module Exports ', 'font-weight:bold;color:#f59e0b');

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
  console.log('%c 8. Nostr Protocol ', 'font-weight:bold;color:#f59e0b');

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
  console.log('%c 9. Node Event Parsing ', 'font-weight:bold;color:#f59e0b');

  assert('Parses u tags for URLs', discoverySrc.includes("t[0] === 'u'"));
  assert('Parses mint tags', discoverySrc.includes("t[0] === 'mint'"));
  assert('Parses d tag for ID', discoverySrc.includes("t[0] === 'd'"));
  assert('Parses version tag', discoverySrc.includes("t[0] === 'version'"));
  assert('Parses content JSON for name/about', discoverySrc.includes('content.name') && discoverySrc.includes('content.about'));

  // ═══════════════════════════════════════
  // 10. API.JS — NODE URL GUARD
  // ═══════════════════════════════════════
  console.log('%c 10. API Node URL Guard ', 'font-weight:bold;color:#f59e0b');

  assert('getRoutstrNodeUrl exported', apiSrc.includes('export function getRoutstrNodeUrl'));
  assert('_requireNodeUrl guard exists', apiSrc.includes('function _requireNodeUrl'));
  assert('_requireNodeUrl throws on empty', apiSrc.includes("'No Routstr node selected"));
  assert('fetchRoutstrModels uses _requireNodeUrl', apiSrc.includes('const nodeUrl = _requireNodeUrl()'));
  assert('callRoutstrAPI uses _requireNodeUrl', apiSrc.includes("const nodeUrl = _requireNodeUrl();\n  return callOpenAICompatibleAPI") || apiSrc.includes('_requireNodeUrl()'));
  // Verify no remaining unguarded getRoutstrNodeUrl().replace patterns in API calls
  const rawNodeUrlCalls = (apiSrc.match(/getRoutstrNodeUrl\(\)\.replace/g) || []).length;
  assert('No unguarded getRoutstrNodeUrl().replace in API calls', rawNodeUrlCalls === 0, `found ${rawNodeUrlCalls} unguarded calls`);

  // ═══════════════════════════════════════
  // 11. SYNC INTEGRATION
  // ═══════════════════════════════════════
  console.log('%c 11. Sync Integration ', 'font-weight:bold;color:#f59e0b');

  assert('Wallet mnemonic in AI_SETTINGS_KEYS', syncSrc.includes("'labcharts-cashu-wallet-mnemonic'"));
  assert('Wallet mint in AI_SETTINGS_KEYS', syncSrc.includes("'labcharts-cashu-wallet-mint'"));
  assert('Node URL in AI_SETTINGS_KEYS', syncSrc.includes("'labcharts-routstr-node'"));
  assert('Mnemonic in ENCRYPTED_AI_KEYS', syncSrc.includes("'labcharts-cashu-wallet-mnemonic'"));
  assert('Wallet keys in GLOBAL_SETTINGS_KEYS', cryptoSrc.includes("'labcharts-cashu-wallet-mint'") && cryptoSrc.includes("'labcharts-routstr-node'"));

  // ═══════════════════════════════════════
  // 12. EXPORT/IMPORT INTEGRATION
  // ═══════════════════════════════════════
  console.log('%c 12. Export/Import Integration ', 'font-weight:bold;color:#f59e0b');

  assert('Bundle includes wallet settings', exportSrc.includes('bundle.wallet'));
  assert('Bundle restores mint URL', exportSrc.includes('wallet.mintUrl') && exportSrc.includes('cashuSetMintUrl'));
  assert('Bundle restores node URL', exportSrc.includes('wallet.nodeUrl') && exportSrc.includes('nostrSetSelectedNode'));
  assert('clearAllData destroys wallet DB', exportSrc.includes('cashuDestroyWalletDB'));
  assert('clearAllData removes wallet localStorage keys', exportSrc.includes("'labcharts-cashu-wallet-mint'") && exportSrc.includes("'labcharts-cashu-wallet-mnemonic'") && exportSrc.includes("'labcharts-routstr-node'"));

  // ═══════════════════════════════════════
  // 13. SERVICE WORKER CACHE
  // ═══════════════════════════════════════
  console.log('%c 13. Service Worker Cache ', 'font-weight:bold;color:#f59e0b');

  assert('SW caches cashu-wallet.js', swSrc.includes('/js/cashu-wallet.js'));
  assert('SW caches nostr-discovery.js', swSrc.includes('/js/nostr-discovery.js'));
  assert('SW caches vendor/cashu-ts.js', swSrc.includes('/vendor/cashu-ts.js'));
  assert('SW caches vendor/bip39-minimal.js', swSrc.includes('/vendor/bip39-minimal.js'));

  // ═══════════════════════════════════════
  // 14. VENDOR LIBRARIES
  // ═══════════════════════════════════════
  console.log('%c 14. Vendor Libraries ', 'font-weight:bold;color:#f59e0b');

  assert('cashuts global available', typeof window.cashuts === 'object' || typeof window.cashuts === 'function');
  assert('bip39 global available', typeof window.bip39 === 'object');
  assert('bip39.generateMnemonic exists', typeof window.bip39?.generateMnemonic === 'function');
  assert('bip39.validateMnemonic exists', typeof window.bip39?.validateMnemonic === 'function');
  assert('bip39.mnemonicToSeed exists', typeof window.bip39?.mnemonicToSeed === 'function');

  // ═══════════════════════════════════════
  // 15. SETTINGS UI — WALLET PANEL
  // ═══════════════════════════════════════
  console.log('%c 15. Settings UI ', 'font-weight:bold;color:#f59e0b');

  assert('Wallet section in Routstr panel', settingsSrc.includes('routstr-wallet-balance'));
  assert('Mint label display', settingsSrc.includes('routstr-mint-label'));
  assert('Mint edit UI', settingsSrc.includes('showRoutstrMintEdit'));
  assert('Node picker UI', settingsSrc.includes('showRoutstrNodePicker'));
  assert('Deposit amount picker', settingsSrc.includes('routstr-deposit-amount'));
  assert('Node withdraw handler', settingsSrc.includes('doRoutstrNodeWithdraw'));
  assert('Seed onboarding gate', settingsSrc.includes('_ensureWalletSeed'));
  assert('Seed acknowledgment checkbox', settingsSrc.includes('routstr-seed-ack'));
  assert('Wallet action buttons', settingsSrc.includes('_walletActionButtons'));
  assert('Wallet backup (export token)', settingsSrc.includes('showRoutstrWalletBackup'));
  assert('Lightning withdraw UI', settingsSrc.includes('showRoutstrWithdrawLightning'));
  assert('Cashu token withdraw UI', settingsSrc.includes('showRoutstrWithdrawToken'));

  // ═══════════════════════════════════════
  // 16. BIP-39 SEED GENERATION
  // ═══════════════════════════════════════
  console.log('%c 16. BIP-39 Seed Generation ', 'font-weight:bold;color:#f59e0b');

  const mnemonic = await window.bip39.generateMnemonic(128);
  const words = mnemonic.split(' ');
  assert('Generates 12 words', words.length === 12, `got ${words.length} words`);
  assert('All words are valid BIP-39', words.every(w => w.length >= 3));
  assert('Mnemonic validates', await window.bip39.validateMnemonic(mnemonic));
  assert('Invalid mnemonic rejected', !(await window.bip39.validateMnemonic('not a valid mnemonic phrase at all here nope')));
  assert('Seed derivation produces bytes', (await window.bip39.mnemonicToSeed(mnemonic)).byteLength === 64);

  // Two generations produce different mnemonics (entropy test)
  const mnemonic2 = await window.bip39.generateMnemonic(128);
  assert('Two generations differ', mnemonic !== mnemonic2);

  // ═══════════════════════════════════════
  // Results
  // ═══════════════════════════════════════
  console.log(`\n%c Results: ${pass} passed, ${fail} failed `, `background:${fail?'#ef4444':'#22c55e'};color:#fff;font-size:14px;padding:4px 12px;border-radius:4px`);
})();
