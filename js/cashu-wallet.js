// @ts-check
// cashu-wallet.js — In-app Cashu eCash wallet for decentralized AI payments
// Uses cashu-ts (vendored IIFE → global `cashuts`) for protocol operations.
// Durable proofs, counters, recovery journals, and seed storage live in cashu-wallet-store.js.

import { getErrorMessage } from './caught-error.js';
import { isDebugMode, loadScriptOnce } from './utils.js';
import { isValidExternalUrl } from './url-safety.js';
import { getCashuWalletStoreCryptoDeps } from './crypto.js';
import {
  DEFAULT_MINT,
  PENDING_QUOTE_PREFIX,
  PENDING_SWAP_KEY,
  configureCashuWalletStore,
  configureCashuWalletStoreCryptoDeps,
  _amountToNumber,
  _normalizeMintUrl,
  _getAllProofs,
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
} from './cashu-wallet-store.js';
import {
  _autoMeltFees,
  configureCashuWalletTransferDependencies,
} from './cashu-wallet-transfers.js';

export {
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
  if (cashuWindow.cashuts) return cashuWindow.cashuts;
  if (!_cashuLibLoad) {
    _cashuLibLoad = loadScriptOnce('/vendor/cashu-ts.js').then(() => {
      if (!cashuWindow.cashuts) throw new Error('Cashu library did not initialize');
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
  _wallet = new Wallet(url, opts);
  await _wallet.loadMint();
  _mintUrl = url;
  return _wallet;
}

configureCashuWalletStore({
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

/** Set mint URL */
export async function setMintUrl(url) {
  return _withWalletLock(async () => {
    const nextMint = _normalizeMintUrl(url);
    const currentMint = await getMintUrl();
    if (nextMint !== currentMint) {
      const [proofs, feeProofs, quotes, pendingDeposit, pendingWithdraw, pendingSwap] = await Promise.all([
        _getAllProofs(currentMint),
        _getAllFeeProofs(currentMint),
        _getMetaEntries(PENDING_QUOTE_PREFIX),
        _getMeta('pendingDeposit'),
        _getMeta('pendingWithdraw'),
        _getMeta(PENDING_SWAP_KEY),
      ]);
      if (proofs.length || feeProofs.length) {
        throw new Error('Cannot switch mints while this wallet has funds or pending recovery records');
      }
      let pendingWithdrawRecord = null;
      try { pendingWithdrawRecord = JSON.parse(pendingWithdraw || 'null'); } catch {}
      const recoveryMints = [
        ...quotes.map(entry => _pendingQuoteDetails(entry, currentMint).mint),
        pendingDeposit && typeof pendingDeposit === 'object' ? pendingDeposit.mint : (pendingDeposit ? currentMint : null),
        pendingWithdrawRecord?.mint || (pendingWithdraw ? currentMint : null),
        pendingSwap?.mint || null,
      ].filter(Boolean).map(_normalizeMintUrl);
      if (recoveryMints.some(mint => mint !== nextMint)) {
        throw new Error('Cannot switch mints while this wallet has funds or pending recovery records');
      }
    }
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
      _getAllProofs(mintUrl),
      _getAllFeeProofs(mintUrl),
      _getMetaEntries(PENDING_QUOTE_PREFIX),
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

async function _prepareTokenMint(cashuts, tokenString) {
  const tokenMint = extractTokenMintUrl(cashuts, tokenString);
  if (!tokenMint) throw new Error('Cannot determine the Cashu token mint');
  if (!isValidExternalUrl(tokenMint)) throw new Error('Cashu token mint must be public https://');
  const currentMint = await getMintUrl();
  const changed = _normalizeMintUrlForCompare(tokenMint) !== _normalizeMintUrlForCompare(currentMint);
  if (changed) {
    const [proofs, feeProofs, quotes, pendingDeposit, pendingWithdraw, pendingSwap] = await Promise.all([
      _getAllProofs(currentMint),
      _getAllFeeProofs(currentMint),
      _getMetaEntries(PENDING_QUOTE_PREFIX),
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
    if (proofs.length || feeProofs.length || quotes.length || unrelatedPendingDeposit || unrelatedPendingWithdraw || pendingSwap) {
      throw new Error('This token uses a different mint. Finish or back up the current wallet before switching mints.');
    }
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
    try { await _recoverPendingSwapUnlocked(); } catch (e) {
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
  return _withWalletLock(() => _recoverPendingSwapUnlocked());
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
  return _withWalletLock(async () => {
    const cashuts = await _cashuLib();
    const mintUrl = await getMintUrl();
    const currentBal = _sumProofsAsNumber(cashuts, await _pruneSpentProofs(false, mintUrl));
    if (currentBal + amountSats > MAX_WALLET_BALANCE) throw new Error('Would exceed ' + MAX_WALLET_BALANCE.toLocaleString() + ' sats safety cap. Withdraw some sats first.');
    const wallet = await _getWallet(mintUrl);
    const quote = await wallet.createMintQuoteBolt11(amountSats);
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
 *  Returns { paid, balance, fee } */
export async function checkFundingStatus(quoteId) {
  return _withWalletLock(async () => {
    const cashuts = await _cashuLib();
    const mintUrl = await getMintUrl();
    const wallet = await _getWallet(mintUrl);
    const checked = await wallet.checkMintQuoteBolt11(quoteId);
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
        proofs = preparedMint
          ? await wallet.completeMint(preparedMint.preview)
          : await wallet.mintProofsBolt11(amount, quoteId);
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
        const mnemonic = await _loadMnemonic();
        if (!mnemonic) throw e;
        const before = _sumProofsAsNumber(cashuts, await _getAllProofs(mintUrl));
        const restored = await _restoreProofsFromSeed(mnemonic, mintUrl);
        const recovered = Math.max(0, restored.balance - before);
        if (recovered <= 0) throw e;
        await _deleteMeta(pendingKey);
        return { paid: true, balance: restored.balance, minted: recovered, fee: 0, recoveredFromRestore: true };
      }
      const total = _sumProofsAsNumber(cashuts, proofs);
      const fee = Math.ceil(total * WALLET_FEE_PCT);

      if (fee > 0 && total > fee) {
        const { keep, send } = await wallet.send(fee, proofs, { includeFees: true });
        await _saveProofs(keep, mintUrl);
        _autoMeltFees(send, mintUrl);
        if (isDebugMode()) console.log('[cashu-wallet] Lightning deposit fee collected:', fee, 'sats');
      } else {
        await _saveProofs(proofs, mintUrl);
      }
      if (preparedMint) await _deleteMeta(PENDING_SWAP_KEY);
      const balance = _sumProofsAsNumber(cashuts, await _pruneSpentProofs(false, mintUrl));
      await _deleteMeta(pendingKey);
      return { paid: true, balance, minted: amount, fee };
    }
    return { paid: false, state: checked.state };
  });
}

/** Re-check pending Lightning wallet funding invoices and mint any paid quotes.
 *  Keeps failed/unpaid quotes recoverable for later checks. */
export async function recoverPendingFunding() {
  const results = [];
  const errors = [];
  let recovered = 0;
  let pending = 0;
  let cleared = 0;
  const currentMint = await getMintUrl();
  let balance = await getWalletBalance();
  const entries = await _getMetaEntries(PENDING_QUOTE_PREFIX);

  for (const entry of entries) {
    const details = _pendingQuoteDetails(entry, currentMint);
    const quoteId = details.quote;
    const pendingKey = entry.key;
    if (!quoteId || details.mint !== currentMint) {
      pending += 1;
      results.push({ quote: quoteId, mint: details.mint, paid: false, state: 'OTHER_MINT' });
      continue;
    }
    try {
      const result = await checkFundingStatus(quoteId);
      results.push({ quote: quoteId, ...result });
      if (result?.paid) {
        recovered += Math.max(0, (Number(result.minted) || 0) - (Number(result.fee) || 0));
        balance = result.balance;
      } else if (_isTerminalMintQuoteState(result?.state)) {
        await _deleteMeta(pendingKey);
        cleared += 1;
      } else {
        pending += 1;
      }
    } catch (e) {
      errors.push({ quote: quoteId, message: getErrorMessage(e, String(e)) });
    }
  }

  return { checked: entries.length, recovered, pending, cleared, failed: errors.length, errors, balance, results };
}

/** Receive a Cashu token string (from external source).
 *  Takes fee, stores remaining proofs.
 *  Returns { received, fee, balance } */
export async function receiveToken(tokenString) {
  return _withWalletLock(async () => {
    await _ensureNoPendingSwap();
    const cashuts = await _cashuLib();
    const { tokenMint, changed } = await _prepareTokenMint(cashuts, tokenString);
    const currentBal = _sumProofsAsNumber(cashuts, await _pruneSpentProofs(false, tokenMint));
    if (currentBal >= MAX_WALLET_BALANCE) throw new Error('Wallet at ' + MAX_WALLET_BALANCE.toLocaleString() + ' sats safety cap. Withdraw some sats first.');
    const wallet = await _getWallet(tokenMint);
    const prepared = await _prepareDurableSwap(
      wallet,
      cashuts,
      'receive',
      tokenMint,
      wallet.ops?.receive(tokenString),
      []
    );
    const proofs = prepared
      ? (await wallet.completeSwap(prepared.preview)).keep
      : await wallet.receive(tokenString);
    const total = _sumProofsAsNumber(cashuts, proofs);
    const fee = Math.ceil(total * WALLET_FEE_PCT);
    await _saveProofs(proofs, tokenMint);
    if (prepared) await _deleteMeta(PENDING_SWAP_KEY);

    if (fee > 0 && total > fee) {
      const feePrepared = await _prepareDurableSwap(
        wallet,
        cashuts,
        'fee',
        tokenMint,
        wallet.ops?.send(fee, proofs).includeFees(true),
        proofs
      );
      const { keep, send } = feePrepared
        ? await wallet.completeSwap(feePrepared.preview)
        : await wallet.send(fee, proofs, { includeFees: true });
      await _replaceProofs(proofs, keep, tokenMint);
      if (feePrepared) await _deleteMeta(PENDING_SWAP_KEY);
      _autoMeltFees(send, tokenMint);
      if (isDebugMode()) console.log('[cashu-wallet] Fee collected:', fee, 'sats');
    }

    if (changed) await _setMintUrlUnlocked(tokenMint);
    const balance = _sumProofsAsNumber(cashuts, await _pruneSpentProofs(false, tokenMint));
    return { received: total - fee, fee, balance };
  });
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
  return _withWalletLock(async () => {
    await _ensureNoPendingSwap();
    const cashuts = await _cashuLib();
    const { tokenMint, changed } = await _prepareTokenMint(cashuts, tokenString);
    const wallet = await _getWallet(tokenMint);
    const prepared = await _prepareDurableSwap(
      wallet,
      cashuts,
      'receive',
      tokenMint,
      wallet.ops?.receive(tokenString),
      []
    );
    const proofs = prepared
      ? (await wallet.completeSwap(prepared.preview)).keep
      : await wallet.receive(tokenString);
    await _saveProofs(proofs, tokenMint);
    if (prepared) await _deleteMeta(PENDING_SWAP_KEY);
    if (changed) await _setMintUrlUnlocked(tokenMint);
    return _sumProofsAsNumber(cashuts, proofs);
  });
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
