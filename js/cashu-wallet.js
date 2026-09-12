// @ts-check
// cashu-wallet.js — In-app Cashu eCash wallet for decentralized AI payments
// Uses cashu-ts (vendored IIFE → global `cashuts`) for protocol operations.
// Durable proofs, counters, recovery journals, and seed storage live in cashu-wallet-store.js.

import { positiveSats, validateLightningInvoice } from './routstr-validation.js';
import { getErrorMessage } from './caught-error.js';
import { isDebugMode, loadScriptOnce } from './utils.js';
import { isValidExternalUrl } from './url-safety.js';
import { getCashuWalletStoreCryptoDeps } from './crypto.js';
import {
  DEFAULT_MINT,
  PENDING_QUOTE_PREFIX,
  PENDING_SWAP_KEY,
  PENDING_RECEIVE_PREFIX,
  _digestStorageKey,
  _recoverAllPendingOperations,
  configureCashuWalletStore,
  configureCashuWalletStoreCryptoDeps,
  _amountToNumber,
  _normalizeMintUrl,
  _getAllProofs,
  _getWalletMintInventory,
  _saveProofs,
  _replaceProofs,
  _pruneSpentProofs,
  _clearAllProofs,
  _getMeta,
  _setMeta,
  _deleteMeta,
  _getMetaEntries,
  _prepareDurableSwap,
  _prepareDurableMint,
  _resumeDurableMint,
  _recoverPendingSwapUnlocked,
  _ensureNoPendingSwap,
  _isTerminalMintQuoteState,
  _pendingQuoteKey,
  _legacyNamespacedPendingQuoteKey,
  _pendingQuoteDetails,
  _getAllFeeProofs,
  _loadMnemonic,
  _saveMnemonic,
  _createCounterSource,
  _counterNamespaceForSeed,
  _destroyWalletDBStorage,
  _withMintRequest,
} from './cashu-wallet-store.js';
import {
  _autoMeltFees,
  configureCashuWalletTransferDependencies,
} from './cashu-wallet-transfers.js';

export {
  depositTokenToNode,
  refundNodeToToken,
  finishNodeRefund,
  getPendingNodeRefund,
  clearPendingDeposit,
  clearPendingWithdraw,
  createWithdrawQuote,
  depositToNode,
  executeWithdraw,
  getFeeBalance,
  getMaxWithdrawable,
  recoverPendingDeposit,
  recoverPendingWithdraw,
  redeemFees,
  retryFeeAutoMelt,
  savePendingWithdrawToken,
  sendAsToken,
  withdrawToAddress,
} from './cashu-wallet-transfers.js';

configureCashuWalletStoreCryptoDeps(getCashuWalletStoreCryptoDeps());

// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const WALLET_FEE_PCT = 0; // disabled for beta testing (normally 0.03 = 3%)
const MAX_WALLET_BALANCE = 25000; // safety cap until battle-tested
const WALLET_LOCK_NAME = 'getbased-cashu-wallet';
const cashuWindow = /** @type {Window & typeof globalThis & {
  cashuts?: any,
  bip39?: any
}} */ (window);

let _cashuLibLoad = null;
let _bip39Load = null;

async function _cashuLib() {
  if (cashuWindow.cashuts) {
    cashuWindow.cashuts.setGlobalRequestOptions?.({ requestTimeout: 30000, redirect: 'error' });
    return cashuWindow.cashuts;
  }
  if (!_cashuLibLoad) {
    _cashuLibLoad = loadScriptOnce('/vendor/cashu-ts.js').then(() => {
      if (!cashuWindow.cashuts) throw new Error('Cashu library did not initialize');
      cashuWindow.cashuts.setGlobalRequestOptions?.({ requestTimeout: 30000, redirect: 'error' });
      return cashuWindow.cashuts;
    });
  }
  return _cashuLibLoad;
}

async function _ensureBip39() {
  if (cashuWindow.bip39) return cashuWindow.bip39;
  if (!_bip39Load) {
    _bip39Load = loadScriptOnce('/vendor/bip39-minimal.js').then(() => {
      if (!cashuWindow.bip39) throw new Error('BIP-39 library did not initialize');
      return cashuWindow.bip39;
    });
  }
  return _bip39Load;
}

function _sumProofsAsNumber(cashuts, proofs) {
  return _amountToNumber(cashuts.sumProofs(proofs || []));
}

function _encodeRecoveryToken(cashuts, mintUrl, proofs) {
  return cashuts.getEncodedToken({ mint: _normalizeMintUrl(mintUrl), proofs: proofs || [] });
}


// ═══════════════════════════════════════════════
// GLOBAL WALLET LOCK — prevents concurrent proof-mutating operations (C1)
// ═══════════════════════════════════════════════
let _walletLock = Promise.resolve();

function _withWalletLock(fn) {
  if (navigator.locks?.request) {
    return navigator.locks.request(WALLET_LOCK_NAME, { mode: 'exclusive' }, () => _withModuleWalletLock(fn));
  }
  // Production browser mutations require a lock shared by all tabs.
  if (globalThis.document?.defaultView) return Promise.reject(new Error('This browser lacks Web Locks support required to protect wallet funds across tabs. Update your browser before using the wallet.'));
  return _withModuleWalletLock(fn);
}

function _withModuleWalletLock(fn) {
  let release;
  const gate = new Promise(r => release = r);
  const prev = _walletLock;
  _walletLock = prev.then(() => gate);
  return prev.then(async () => {
    try { return await fn(); } finally { release(); }
  });
}

// ═══════════════════════════════════════════════
// WALLET INSTANCE
// ═══════════════════════════════════════════════
let _wallet = null;
let _mintUrl = null;

async function _getWallet(mintUrl) {
  const url = mintUrl || await getMintUrl();
  if (_wallet && _mintUrl === url) return _wallet;
  const cashuts = await _cashuLib();
  const { Wallet } = cashuts;
  const mnemonic = await _loadMnemonic();
  const opts = {};
  if (mnemonic) {
    const bip39 = await _ensureBip39();
    opts.bip39seed = await bip39.mnemonicToSeed(mnemonic);
    opts.counterSource = _createCounterSource(await _counterNamespaceForSeed(opts.bip39seed));
  }
  const wallet = new Wallet(url, opts);
  await wallet.loadMint();
  _wallet = wallet;
  _mintUrl = url;
  return wallet;
}

configureCashuWalletStore({
  resetWallet: () => { _wallet = null; _mintUrl = null; },
  getMintUrl: () => getMintUrl(),
  getWallet: mintUrl => _getWallet(mintUrl),
  cashuLib: () => _cashuLib(),
  sumProofsAsNumber: (cashuts, proofs) => _sumProofsAsNumber(cashuts, proofs),
});

// ═══════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════

/** Get configured mint URL */
export async function getMintUrl() {
  const stored = await _getMeta('mintUrl');
  return _normalizeMintUrl(stored || DEFAULT_MINT);
}

/** List saved mint balances without making network requests. */
export async function getWalletMints() {
  return _withWalletLock(() => _getWalletMintInventory());
}

/** Display balance without triggering mint requests or recovery operations. */
export async function getLocalWalletBalance() {
  return _withWalletLock(async () => (await _getAllProofs(await getMintUrl())).reduce((sum, proof) => sum + _amountToNumber(proof.amount), 0));
}

/** Notifications are hints only; normal quote verification still mints funds. */
export async function subscribeFundingQuotes(mint, quotes, onUpdate, onError) {
  if (!isValidExternalUrl(mint) || !quotes.length) return null;
  const cashuts = await _cashuLib();
  // A separate public-only instance avoids loading keys/seed for a subscription.
  const wallet = new cashuts.Wallet(mint);
  const info = await _withWalletLock(() => _withMintRequest(mint, () => wallet.mint.getLazyMintInfo()));
  const support = info.isSupported(17);
  if (!support.supported || !support.params?.some(item => item.method === 'bolt11' && item.unit === 'sat' && item.commands?.includes('bolt11_mint_quote'))) return null;
  let cancel = null;
  let stopped = false;
  const close = () => { stopped = true; cancel?.(); wallet.mint.disconnectWebSocket(); };
  try {
    // Bound socket establishment; the SDK canceller also removes subscriptions.
    let timeout;
    try {
      cancel = await Promise.race([
        wallet.on.mintQuoteUpdates(quotes, update => { if (!stopped) onUpdate(update); }, error => { if (!stopped) onError(error); }).then(unsubscribe => {
          if (stopped) { unsubscribe(); wallet.mint.disconnectWebSocket(); }
          return unsubscribe;
        }),
        new Promise((_, reject) => { timeout = setTimeout(() => { close(); reject(new Error('Mint notifications unavailable')); }, 10000); }),
      ]);
    } finally { clearTimeout(timeout); }
    wallet.mint.webSocketConnection?.onClose(() => { if (!stopped) onError(new Error('Mint notification connection closed')); });
    return close;
  } catch (error) { close(); throw error; }
}

/** Select a mint without moving or discarding other mint balances. */
export async function setMintUrl(url) {
  return _withWalletLock(async () => {
    if (!isValidExternalUrl(url)) throw new Error('Cashu mint URL must be public https://');
    const nextMint = _normalizeMintUrl(url);
    const currentMint = await getMintUrl();
    if (nextMint !== currentMint) {
      const pending = (await _getMetaEntries('pending')).filter(entry => entry.value);
      if (pending.some(entry => !entry.key.startsWith(PENDING_QUOTE_PREFIX))) {
        throw new Error('Finish the pending wallet operation before selecting another mint. Existing balances are preserved.');
      }
      // Bind legacy quotes before changing the fallback mint used by old rows.
      for (const entry of pending) {
        const details = _pendingQuoteDetails(entry, currentMint);
        if (!details.quote) throw new Error('A pending invoice needs recovery before selecting another mint.');
        await _setMeta(entry.key, { ...(typeof entry.value === 'object' ? entry.value : {}), ...details });
      }
    }
    const mints = await _getWalletMintInventory();
    await _setMeta('walletMints', [...new Set([...mints.map(entry => entry.mint), currentMint, nextMint])]);
    return _setMintUrlUnlocked(nextMint);
  });
}

async function _setMintUrlUnlocked(url) {
  // Backup-restore and node-auto-switch paths reach this without UI validation,
  // so the SSRF gate has to live here too — a malicious wallet backup or a
  // hostile Routstr node could otherwise pin the mint to an internal target.
  if (!isValidExternalUrl(url)) {
    throw new Error('Cashu mint URL must be public https://, not loopback / RFC1918 / link-local');
  }
  url = _normalizeMintUrl(url);
  _wallet = null; // reset wallet instance
  _mintUrl = null;
  await _setMeta('mintUrl', url);
  // Mirror for the legacy UI label; wallet identity is excluded from generic sync/backup.
  localStorage.setItem('labcharts-cashu-wallet-mint', url);
}

// ═══════════════════════════════════════════════
// SEED / MNEMONIC
// ═══════════════════════════════════════════════

/** Generate a new 12-word BIP-39 mnemonic and store it (encrypted) */
export async function generateWalletSeed() {
  return _withWalletLock(async () => {
    const existing = await _loadMnemonic();
    if (existing) return { mnemonic: existing };
    const bip39 = await _ensureBip39();
    const mnemonic = await bip39.generateMnemonic(128);
    await _saveMnemonic(mnemonic);
    _wallet = null; _mintUrl = null; // reset so next _getWallet uses the seed
    return { mnemonic };
  });
}

/** Get the stored mnemonic (null if not set) */
export async function getWalletMnemonic() {
  return _loadMnemonic();
}

/** Check if wallet has been initialized with a seed */
export async function hasWalletSeed() {
  return !!(await _loadMnemonic());
}

async function _restoreProofsFromSeed(mnemonic, restoreMintUrl) {
  const bip39 = await _ensureBip39();
  const cashuts = await _cashuLib();
  const valid = await bip39.validateMnemonic(mnemonic);
  if (!valid) throw new Error('Invalid mnemonic — check your words');
  const mintUrl = _normalizeMintUrl(restoreMintUrl || await getMintUrl());
  const currentMnemonic = await _loadMnemonic();
  if (currentMnemonic && currentMnemonic !== mnemonic) {
    const [proofs, feeProofs, pendingQuotes, pendingDeposit, pendingWithdraw, pendingSwap] = await Promise.all([
      _getWalletMintInventory().then(mints => mints.filter(mint => mint.balance > 0)),
      _getWalletMintInventory().then(mints => mints.filter(mint => mint.feeBalance > 0)),
      _getMetaEntries('pending').then(entries => entries.filter(entry => entry.value)),
      _getMeta('pendingDeposit'),
      _getMeta('pendingWithdraw'),
      _getMeta(PENDING_SWAP_KEY),
    ]);
    if (proofs.length || feeProofs.length || pendingQuotes.length || pendingDeposit || pendingWithdraw || pendingSwap) {
      throw new Error('Cannot replace the wallet seed while funds or recovery records exist. Back up and empty this wallet first.');
    }
  }

  const seed = await bip39.mnemonicToSeed(mnemonic);
  const counterSource = _createCounterSource(
    await _counterNamespaceForSeed(seed),
    !currentMnemonic || currentMnemonic === mnemonic
  );
  const wallet = new cashuts.Wallet(mintUrl, { bip39seed: seed, counterSource });
  await wallet.loadMint();

  const restoredBySecret = new Map();
  const keysets = wallet.keyChain.getKeysets();
  const failures = [];
  let completedScans = 0;
  for (const keyset of keysets) {
    try {
      const result = await wallet.batchRestore(300, 300, 0, keyset.id);
      completedScans += 1;
      if (result.lastCounterWithSignature != null) {
        await wallet.counters.advanceToAtLeast(keyset.id, result.lastCounterWithSignature + 1);
      }
      for (const proof of result.proofs || []) restoredBySecret.set(proof.secret, proof);
    } catch (e) {
      failures.push(`${keyset.id}: ${getErrorMessage(e, String(e))}`);
    }
  }
  if (!completedScans) {
    throw new Error('Wallet restore failed without changing local funds' + (failures[0] ? ': ' + failures[0] : ''));
  }
  if (failures.length) {
    throw new Error('Wallet restore was incomplete and made no proof changes: ' + failures[0]);
  }

  const restored = Array.from(restoredBySecret.values());
  const { unspent } = restored.length
    ? await wallet.groupProofsByState(restored)
    : { unspent: [] };
  if (unspent.length) await _saveProofs(unspent, mintUrl);
  await _saveMnemonic(mnemonic);
  _wallet = null;
  _mintUrl = null;
  const totalRestored = _sumProofsAsNumber(cashuts, unspent);
  const balance = _sumProofsAsNumber(cashuts, await _getAllProofs(mintUrl));
  return { balance, restoredCount: totalRestored };
}

function _looksLikeAlreadyIssuedMintError(error) {
  return /outputs? already signed|already signed|quote.*issued|already.*issued/i.test(error?.message || String(error || ''));
}

export function extractTokenMintUrl(cashuts, tokenString) {
  try {
    const metadata = cashuts.getTokenMetadata?.(tokenString);
    if (typeof metadata?.mint === 'string') return _normalizeMintUrl(metadata.mint);
  } catch {}
  return null;
}

function _normalizeMintUrlForCompare(url) {
  return _normalizeMintUrl(url);
}

async function _assertNoForeignReceive(mintUrl) {
  const pending = await _getMetaEntries(PENDING_RECEIVE_PREFIX);
  if (pending.some(({ value }) => value && value.mint !== mintUrl)) {
    throw new Error('Recover the incoming token at its original mint before funding another mint');
  }
}

async function _prepareTokenMint(cashuts, tokenString) {
  const tokenMint = extractTokenMintUrl(cashuts, tokenString);
  if (!tokenMint) throw new Error('Cannot determine the Cashu token mint');
  if (!isValidExternalUrl(tokenMint)) throw new Error('Cashu token mint must be public https://');
  const currentMint = await getMintUrl();
  await _assertNoForeignReceive(tokenMint);
  const changed = _normalizeMintUrlForCompare(tokenMint) !== _normalizeMintUrlForCompare(currentMint);
  if (changed) {
    const [quotes, pendingDeposit, pendingWithdraw, pendingSwap] = await Promise.all([
      _getMetaEntries('pending').then(entries => entries.filter(entry => entry.value)),
      _getMeta('pendingDeposit'),
      _getMeta('pendingWithdraw'),
      _getMeta(PENDING_SWAP_KEY),
    ]);
    let pendingWithdrawRecord = null;
    try { pendingWithdrawRecord = JSON.parse(pendingWithdraw || 'null'); } catch {}
    const pendingDepositTokens = typeof pendingDeposit === 'string'
      ? [pendingDeposit]
      : [pendingDeposit?.token, pendingDeposit?.recoveryToken].filter(Boolean);
    const pendingWithdrawTokens = [pendingWithdrawRecord?.token, pendingWithdrawRecord?.recoveryToken].filter(Boolean);
    const unrelatedPendingDeposit = pendingDepositTokens.length && !pendingDepositTokens.includes(tokenString);
    const unrelatedPendingWithdraw = pendingWithdrawTokens.length && !pendingWithdrawTokens.includes(tokenString);
    if (quotes.some(entry => { if (entry.key.startsWith(PENDING_QUOTE_PREFIX)) return false; let value = entry.value; if (typeof value === 'string') { try { value = JSON.parse(value); } catch {} } return value !== tokenString && value?.incomingToken !== tokenString && value?.token !== tokenString && value?.recoveryToken !== tokenString; }) || unrelatedPendingDeposit || unrelatedPendingWithdraw || pendingSwap) {
      throw new Error('Finish the pending wallet operation before receiving at another mint. Existing balances are preserved.');
    }
    for (const entry of quotes.filter(entry => entry.key.startsWith(PENDING_QUOTE_PREFIX))) {
      await _setMeta(entry.key, { ...(typeof entry.value === 'object' ? entry.value : {}), ..._pendingQuoteDetails(entry, currentMint) });
    }
    const mints = await _getWalletMintInventory();
    await _setMeta('walletMints', [...new Set([...mints.map(entry => entry.mint), currentMint, tokenMint])]);
  }
  return { tokenMint, currentMint, changed };
}

/** Restore wallet from a 12-word mnemonic phrase.
 *  Queries the mint to recover previously-minted proofs.
 *  Returns { balance, restoredCount } */
export async function restoreWalletFromSeed(mnemonic) {
  return _withWalletLock(async () => _restoreProofsFromSeed(mnemonic));
}

/** Get wallet balance in sats (prunes spent proofs on first call / after cooldown) */
export async function getWalletBalance() {
  return _withWalletLock(async () => {
    try { await _recoverAllPendingOperations(); } catch (e) {
      if (isDebugMode()) console.warn('[cashu-wallet] Pending swap recovery deferred:', getErrorMessage(e));
    }
    const mintUrl = await getMintUrl();
    const proofs = await _pruneSpentProofs(false, mintUrl);
    const cashuts = await _cashuLib();
    return _sumProofsAsNumber(cashuts, proofs);
  });
}

/** Retry a crash-interrupted prepared swap without deleting its inputs. */
export async function recoverPendingWalletOperation() {
  return _withWalletLock(() => _recoverAllPendingOperations());
}

/** Force-check all proof states against mint and return updated balance */
export async function checkProofStates() {
  return _withWalletLock(async () => {
    const cashuts = await _cashuLib();
    const proofs = await _pruneSpentProofs(true);
    return _sumProofsAsNumber(cashuts, proofs);
  });
}

/** Create a Lightning invoice to fund the wallet.
 *  Returns { quote, invoice, amount } */
export async function createFundingInvoice(amountSats) {
  positiveSats(amountSats);
  return _withWalletLock(async () => {
    const mintUrl = await getMintUrl();
    await _assertNoForeignReceive(mintUrl);
    const currentBal = (await _getWalletMintInventory()).reduce((sum, entry) => sum + entry.balance, 0);
    const pendingAmount = (await _getMetaEntries('pending')).reduce((sum, entry) => sum + (entry.key.startsWith(PENDING_QUOTE_PREFIX) ? _pendingQuoteDetails(entry, mintUrl).amount : entry.key.startsWith(PENDING_RECEIVE_PREFIX) ? _amountToNumber(entry.value?.incomingAmount) : 0), 0);
    if (currentBal + pendingAmount + amountSats > MAX_WALLET_BALANCE) throw new Error('Would exceed ' + MAX_WALLET_BALANCE.toLocaleString() + ' sats safety cap. Withdraw some sats first.');
    const wallet = await _getWallet(mintUrl);
    const quote = await wallet.createMintQuoteBolt11(amountSats);
    validateLightningInvoice(quote.request, amountSats);
    await _setMeta(await _pendingQuoteKey(mintUrl, quote.quote), {
      quote: quote.quote,
      amount: amountSats,
      mint: mintUrl,
      createdAt: Date.now(),
    });
    return {
      quote: quote.quote,
      invoice: quote.request,
      amount: amountSats,
      state: quote.state
    };
  });
}

/** Check if a funding invoice has been paid and mint the tokens.
 *  Takes 3% fee on Lightning deposits.
 *  Returns { paid, balance, fee }
 *  @param {string} quoteId
 *  @param {string | null} quoteMint
 */
export async function checkFundingStatus(quoteId, quoteMint = null, options = {}) {
  return _withWalletLock(async () => {
    const canCheck = () => !options.automatic || !options.shouldContinue || options.shouldContinue();
    if (!canCheck()) return { paid: false, state: 'WAITING' };
    const cashuts = await _cashuLib();
    const mintUrl = _normalizeMintUrl(quoteMint || await getMintUrl());
    if (!isValidExternalUrl(mintUrl)) throw new Error('Invalid pending invoice mint');
    const pollKey = 'fundingPoll:' + await _pendingQuoteKey(mintUrl, quoteId);
    if (options.automatic) {
      const now = Date.now();
      const previous = await _getMeta(pollKey) || {};
      if (previous.paused) return { paid: false, state: 'PAUSED' };
      const budgetKey = 'fundingNextAt:' + mintUrl;
      const nextAt = Math.max(Number(await _getMeta(budgetKey)) || 0, Number(previous.retryAt) || 0, options.notified ? 0 : Number(previous.nextAt) || 0);
      if (nextAt > now) return { paid: false, state: 'WAITING', retryAfterMs: nextAt - now };
      const attempts = Math.min(4, (Number(previous.attempts) || 0) + 1);
      await _setMeta(budgetKey, now + 5000);
      await _setMeta(pollKey, { ...previous, attempts, nextAt: now + (options.subscribed ? 60000 : Math.min(30000, 5000 * 2 ** (attempts - 1))) });
    }
    const result = await _withMintRequest(mintUrl, async () => {
      if (!canCheck()) return { paid: false, state: 'WAITING' };
      const wallet = await _getWallet(mintUrl);
      if (!canCheck()) return { paid: false, state: 'WAITING' };
      let checked;
      try {
        checked = await wallet.checkMintQuoteBolt11(quoteId);
      } catch (error) {
        const details = /** @type {{status?: number, statusCode?: number, retryAfterMs?: number}} */ (error);
        const previous = await _getMeta(pollKey) || {};
        const status = Number(details?.status ?? details?.statusCode);
        const failures = Math.min(5, (Number(previous.failures) || 0) + 1);
        const paused = status >= 400 && status < 500 && status !== 408 && status !== 429;
        await _setMeta(pollKey, { ...previous, paused, failures, retryAt: Date.now() + Math.max(Number(details?.retryAfterMs) || 0, Math.min(900000, 60000 * 2 ** (failures - 1))) });
        throw error;
      }
      // A successful explicit recheck releases a paused quote without losing it.
      const poll = await _getMeta(pollKey);
      if (poll?.paused || poll?.failures) await _setMeta(pollKey, { ...poll, paused: false, failures: 0, retryAt: 0 });
      // A response can be lost after the mint issued the exact journaled outputs.
      // Recover those outputs automatically instead of waiting forever for PAID.
      if (String(checked.state).toUpperCase() === 'ISSUED') {
        const journal = await _getMeta(PENDING_SWAP_KEY);
        if (journal?.operation === 'mint' && journal.quoteId === quoteId && journal.mint === mintUrl) {
          const exact = await _recoverPendingSwapUnlocked();
          if (exact.recovered > 0) return {
            paid: true, minted: exact.recovered, fee: 0,
            balance: _sumProofsAsNumber(cashuts, await _getAllProofs(mintUrl)),
            recoveredFromJournal: true,
          };
        }
      }
      if (checked.state === cashuts.MintQuoteState.PAID) {
        const namespacedKey = await _pendingQuoteKey(mintUrl, quoteId);
        const previousNamespacedKey = _legacyNamespacedPendingQuoteKey(mintUrl, quoteId);
        const legacyKey = PENDING_QUOTE_PREFIX + quoteId;
        const namespaced = await _getMeta(namespacedKey);
        const previousNamespaced = namespaced == null ? await _getMeta(previousNamespacedKey) : null;
        const pendingKey = namespaced != null
          ? namespacedKey
          : previousNamespaced != null ? previousNamespacedKey : legacyKey;
        const stored = namespaced != null
          ? namespaced
          : previousNamespaced != null ? previousNamespaced : await _getMeta(legacyKey);
        const amount = _amountToNumber(stored?.amount ?? stored) || _amountToNumber(checked.amount) || 0;
        if (!amount) throw new Error('Cannot determine invoice amount — please contact support');
        let proofs;
        let preparedMint = null;
        try {
          const pendingSwap = await _getMeta(PENDING_SWAP_KEY);
          if (pendingSwap?.operation === 'mint' && pendingSwap.quoteId === quoteId && pendingSwap.mint === mintUrl) {
            preparedMint = { preview: _resumeDurableMint(cashuts, pendingSwap), record: pendingSwap };
          } else {
            await _ensureNoPendingSwap();
            preparedMint = await _prepareDurableMint(
              wallet,
              cashuts,
              mintUrl,
              amount,
              { ...checked, quote: quoteId },
              pendingKey
            );
          }
          proofs = await wallet.completeMint(preparedMint.preview);
        } catch (e) {
          if (!_looksLikeAlreadyIssuedMintError(e)) throw e;
          if (preparedMint || await _getMeta(PENDING_SWAP_KEY)) {
            try {
              const exact = await _recoverPendingSwapUnlocked();
              if (exact.recovered > 0) {
                const balance = _sumProofsAsNumber(cashuts, await _getAllProofs(mintUrl));
                return { paid: true, balance, minted: exact.recovered, fee: 0, recoveredFromJournal: true };
              }
            } catch {}
          }
          // A seed scan cannot attribute unrelated recovered proofs to this quote.
          throw e;
        }
        const total = _sumProofsAsNumber(cashuts, proofs);
        const fee = Math.ceil(total * WALLET_FEE_PCT);

        // First commit the mint outputs with its journal. A later fee swap has
        // its own journal, so neither side of the fee split can disappear.
        await _replaceProofs([], proofs, mintUrl, { deleteKeys: [pendingKey, ...(preparedMint ? [PENDING_SWAP_KEY] : [])] });
        if (fee > 0 && total > fee) await _collectFee(wallet, cashuts, proofs, fee, mintUrl);
        const balance = _sumProofsAsNumber(cashuts, await _getAllProofs(mintUrl));
        await _deleteMeta(pendingKey);
        return { paid: true, balance, minted: amount, fee };
      }
      return { paid: false, state: checked.state };
    });
    if (result.paid || _isTerminalMintQuoteState(result.state)) await _deleteMeta(pollKey);
    return result;
  });
}

/** Re-check pending Lightning wallet funding invoices and mint any paid quotes.
 *  Keeps failed/unpaid quotes recoverable for later checks. */
export async function recoverPendingFunding(options = {}) {
  const results = [];
  const errors = [];
  let recovered = 0;
  let pending = 0;
  let cleared = 0;
  const currentMint = await getMintUrl();
  let balance = await getLocalWalletBalance();
  const entries = await _getMetaEntries(PENDING_QUOTE_PREFIX);

  for (const entry of entries) {
    if (options.automatic && options.shouldContinue && !options.shouldContinue()) break;
    const details = _pendingQuoteDetails(entry, currentMint);
    const quoteId = details.quote;
    const pendingKey = entry.key;
    if (!quoteId) {
      pending += 1;
      results.push({ quote: quoteId, mint: details.mint, paid: false, state: 'OTHER_MINT' });
      continue;
    }
    try {
      const result = await checkFundingStatus(quoteId, details.mint, {
        automatic: options.automatic,
        notified: options.notified?.some(item => item.mint === details.mint && item.quote === quoteId),
        subscribed: options.subscribedMints?.includes(details.mint),
        shouldContinue: options.shouldContinue,
      });
      results.push({ quote: quoteId, mint: details.mint, ...result });
      if (result?.paid) {
        recovered += Math.max(0, (Number(result.minted) || 0) - (Number(result.fee) || 0));
        if (details.mint === currentMint) balance = result.balance;
      } else if (_isTerminalMintQuoteState(result?.state)) {
        await _deleteMeta(pendingKey);
        cleared += 1;
      } else {
        pending += 1;
      }
    } catch (e) {
      if ((await _getMeta('fundingPoll:' + await _pendingQuoteKey(details.mint, quoteId)))?.paused) {
        results.push({ quote: quoteId, mint: details.mint, paid: false, state: 'PAUSED' });
      }
      errors.push({ quote: quoteId, mint: details.mint, message: getErrorMessage(e, String(e)), retryAfterMs: Number(/** @type {{retryAfterMs?: number}} */ (e)?.retryAfterMs) || 0 });
    }
  }

  const pendingQuotes = [];
  for (const entry of entries) {
    const item = _pendingQuoteDetails(entry, currentMint);
    if (!item.quote || results.some(result => result.mint === item.mint && result.quote === item.quote && (result.paid || _isTerminalMintQuoteState(result.state)))) continue;
    if ((await _getMeta('fundingPoll:' + await _pendingQuoteKey(item.mint, item.quote)))?.paused) continue;
    pendingQuotes.push(item);
  }
  return { mint: currentMint, checked: entries.length, recovered, pending, cleared, failed: errors.length, errors, balance, results, pendingQuotes };
}

/** Receive a Cashu token string (from external source).
 *  Takes fee, stores remaining proofs.
 *  Returns { received, fee, balance } */
async function _collectFee(wallet, cashuts, proofs, fee, mintUrl) {
  const prepared = await _prepareDurableSwap(wallet, cashuts, 'fee', mintUrl, wallet.ops.send(fee, proofs).includeFees(true), proofs);
  const { keep, send } = await wallet.completeSwap(prepared.preview);
  await _replaceProofs(proofs, keep, mintUrl, { feeProofs: send, deleteKeys: [PENDING_SWAP_KEY] });
  _autoMeltFees([], mintUrl);
}

async function _receiveTokenUnlocked(tokenString, backupRestore = false) {
  await _ensureNoPendingSwap();
  const cashuts = await _cashuLib();
  const { tokenMint, changed } = await _prepareTokenMint(cashuts, tokenString);
  const journalKey = PENDING_RECEIVE_PREFIX + await _digestStorageKey(tokenString);
  const previous = await _getMeta(journalKey);
  if (previous) {
    const recovered = await _recoverPendingSwapUnlocked(journalKey);
    if (!recovered.pending) {
      if (changed) await _setMintUrlUnlocked(tokenMint);
      return { received: recovered.recovered, fee: 0, balance: _sumProofsAsNumber(cashuts, await _getAllProofs(tokenMint)) };
    }
  }
  const pendingRecords = await _getMetaEntries('pending');
  const isRecovery = pendingRecords.some(({ value }) => {
    let record = value;
    if (typeof record === 'string') { try { record = JSON.parse(record); } catch { return record === tokenString; } }
    return record?.token === tokenString || record?.recoveryToken === tokenString || record?.incomingToken === tokenString;
  });
  const incoming = _amountToNumber(cashuts.getTokenMetadata(tokenString).amount);
  positiveSats(incoming);
  const currentBal = (await _getWalletMintInventory()).reduce((sum, entry) => sum + entry.balance, 0);
  const reserved = pendingRecords.filter(({ key }) => key !== journalKey).reduce((sum, { key, value }) => {
    if (key.startsWith(PENDING_QUOTE_PREFIX)) return sum + _pendingQuoteDetails({ key, value }, tokenMint).amount;
    if (key.startsWith(PENDING_RECEIVE_PREFIX)) return sum + _amountToNumber(value.incomingAmount);
    return sum;
  }, 0);
  if (!backupRestore && !isRecovery && currentBal + reserved + incoming > MAX_WALLET_BALANCE) {
    throw new Error('Would exceed the 25,000 sats safety cap. Withdraw some sats first.');
  }
  const wallet = await _getWallet(tokenMint);
  const prepared = await _prepareDurableSwap(wallet, cashuts, 'receive', tokenMint,
    wallet.ops?.receive(tokenString), await _getAllProofs(tokenMint), { journalKey, incomingToken: tokenString, incomingAmount: incoming, selectMint: changed });
  const proofs = (await wallet.completeSwap(prepared.preview)).keep;
  const meta = changed ? { mintUrl: tokenMint } : {};
  for (const { key, value } of pendingRecords) {
    let record = value;
    if (typeof record === 'string') { try { record = JSON.parse(record); } catch {} }
    if (['pendingDeposit', 'pendingWithdraw', 'pendingNodeRefund'].includes(key) && (record === tokenString || record?.token === tokenString || record?.recoveryToken === tokenString)) meta[key] = null;
  }
  await _replaceProofs(prepared.record.localInputs, proofs, tokenMint, { deleteKeys: [journalKey], meta });
  if (changed) { _wallet = null; _mintUrl = null; }
  const total = _sumProofsAsNumber(cashuts, proofs);
  const fee = backupRestore || isRecovery ? 0 : Math.ceil(total * WALLET_FEE_PCT);
  if (fee > 0 && total > fee) await _collectFee(wallet, cashuts, proofs, fee, tokenMint);
  const balance = _sumProofsAsNumber(cashuts, await _getAllProofs(tokenMint));
  return { received: total - fee, fee, balance };
}

export async function receiveToken(tokenString) {
  return _withWalletLock(() => _receiveTokenUnlocked(tokenString));
}

/** Export all proofs as a cashu token string (for backup) */
export async function exportWallet() {
  return _withWalletLock(async () => {
    const cashuts = await _cashuLib();
    const mintUrl = await getMintUrl();
    const proofs = await _getAllProofs(mintUrl);
    if (!proofs.length) return null;
    return cashuts.getEncodedToken({ mint: mintUrl, proofs });
  });
}

/** Import proofs from a cashu token string (restore from backup) */
export async function importWallet(tokenString) {
  // Explicit backup recovery may exceed the cap: never strand existing funds.
  return _withWalletLock(async () => (await _receiveTokenUnlocked(tokenString, true)).received);
}

/** Clear the wallet (remove all proofs for current mint) */
export async function clearWallet() {
  return _withWalletLock(async () => {
    await _clearAllProofs();
    _wallet = null;
    _mintUrl = null;
  });
}

/** Destroy entire wallet database (for clearAllData) */
export async function destroyWalletDB() {
  return _withWalletLock(async () => {
    _wallet = null;
    _mintUrl = null;
    return _destroyWalletDBStorage();
  });
}

configureCashuWalletTransferDependencies({
  cashuLib: () => _cashuLib(),
  encodeRecoveryToken: (cashuts, mintUrl, proofs) => _encodeRecoveryToken(cashuts, mintUrl, proofs),
  extractTokenMintUrl: (cashuts, tokenString) => extractTokenMintUrl(cashuts, tokenString),
  getMintUrl: () => getMintUrl(),
  getWallet: mintUrl => _getWallet(mintUrl),
  getWalletBalance: () => getWalletBalance(),
  sumProofsAsNumber: (cashuts, proofs) => _sumProofsAsNumber(cashuts, proofs),
  withWalletLock: fn => _withWalletLock(fn),
});

/** Get fee percentage */
export function getFeePct() {
  return WALLET_FEE_PCT;
}
