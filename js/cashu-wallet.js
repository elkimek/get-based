// @ts-check
// cashu-wallet.js — In-app Cashu eCash wallet for decentralized AI payments
// Uses cashu-ts (vendored IIFE → global `cashuts`) for protocol operations.
// Durable proofs, counters, recovery journals, and seed storage live in cashu-wallet-store.js.

import { isDebugMode, loadScriptOnce } from './utils.js';
import { isValidExternalUrl } from './url-safety.js';
import {
  DEFAULT_MINT,
  PENDING_QUOTE_PREFIX,
  PENDING_SWAP_KEY,
  configureCashuWalletStore,
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
  _pendingQuoteDetails,
  _saveFeeProofs,
  _replaceFeeProofs,
  _getAllFeeProofs,
  _loadMnemonic,
  _saveMnemonic,
  _createCounterSource,
  _counterNamespaceForSeed,
  _destroyWalletDBStorage,
} from './cashu-wallet-store.js';

// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const WALLET_FEE_PCT = 0; // disabled for beta testing (normally 0.03 = 3%)
const FEE_LN_ADDRESS = 'denimgecko11@primal.net';
const FEE_MELT_MIN_SATS = 100; // don't attempt melt below this — mint fees eat it
const MAX_WALLET_BALANCE = 25000; // safety cap until battle-tested
const WALLET_LOCK_NAME = 'getbased-cashu-wallet';
const FEE_LOCK_NAME = 'getbased-cashu-fees';
const cashuWindow = /** @type {Window & typeof globalThis & {
  cashuts?: any,
  bip39?: any,
  showNotification?: (message: string, type?: string, duration?: number) => void
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

let _feeLock = Promise.resolve();

function _withFeeLock(fn) {
  if (navigator.locks?.request) {
    return navigator.locks.request(FEE_LOCK_NAME, { mode: 'exclusive' }, () => _withModuleFeeLock(fn));
  }
  return _withModuleFeeLock(fn);
}

function _withModuleFeeLock(fn) {
  let release;
  const gate = new Promise(r => release = r);
  const prev = _feeLock;
  _feeLock = prev.then(() => gate);
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
      failures.push(`${keyset.id}: ${e?.message || String(e)}`);
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
      if (isDebugMode()) console.warn('[cashu-wallet] Pending swap recovery deferred:', e.message);
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
    await _setMeta(_pendingQuoteKey(mintUrl, quote.quote), {
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
      const namespacedKey = _pendingQuoteKey(mintUrl, quoteId);
      const legacyKey = PENDING_QUOTE_PREFIX + quoteId;
      const namespaced = await _getMeta(namespacedKey);
      const pendingKey = namespaced != null ? namespacedKey : legacyKey;
      const stored = namespaced != null ? namespaced : await _getMeta(legacyKey);
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
      errors.push({ quote: quoteId, message: e?.message || String(e) });
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

/** Deposit sats to a Routstr node. Uses topup if session key exists, otherwise creates new.
 *  Returns { api_key, balance } from the node. */
export async function depositToNode(nodeUrl, amountSats, existingKey) {
  nodeUrl = nodeUrl.replace(/\/+$/, ''); // normalize trailing slashes
  return _withWalletLock(async () => {
    await _ensureNoPendingSwap();
    const cashuts = await _cashuLib();
    const mintUrl = await getMintUrl();
    if (await _getMeta('pendingDeposit')) throw new Error('Recover or clear the previous pending deposit first');
    const proofs = await _pruneSpentProofs(true, mintUrl);
    const total = _sumProofsAsNumber(cashuts, proofs);
    if (total < amountSats) throw new Error('Insufficient wallet balance: ' + total + ' sats, need ' + amountSats);

    const wallet = await _getWallet(mintUrl);
    const prepared = await _prepareDurableSwap(
      wallet,
      cashuts,
      'deposit',
      mintUrl,
      wallet.ops?.send(amountSats, proofs).includeFees(true),
      proofs
    );
    const { keep, send } = prepared
      ? await wallet.completeSwap(prepared.preview)
      : await wallet.send(amountSats, proofs, { includeFees: true });

    const token = _encodeRecoveryToken(cashuts, mintUrl, send);
    const recoveryToken = _encodeRecoveryToken(cashuts, mintUrl, [...keep, ...send]);

    // Save recovery token BEFORE calling the node
    const pendingDeposit = { token, recoveryToken, localCommit: false, mint: mintUrl, nodeUrl, createdAt: Date.now() };
    await _setMeta('pendingDeposit', pendingDeposit);

    // Update wallet: old proofs spent (mint swapped), save change
    await _replaceProofs(proofs, keep, mintUrl);
    await _setMeta('pendingDeposit', { ...pendingDeposit, localCommit: true });
    if (prepared) await _deleteMeta(PENDING_SWAP_KEY);

    // Deposit to node — topup existing session or create new
    let res;
    if (existingKey) {
      res = await fetch(nodeUrl + '/v1/balance/topup', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + existingKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashu_token: token })
      });
      // Do NOT fall back to create — that would replace the existing key and lose its balance
    } else {
      res = await fetch(nodeUrl + '/v1/balance/create?initial_balance_token=' + encodeURIComponent(token));
    }
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      const detail = err?.detail;
      const msg = typeof detail === 'string' ? detail
        : (detail && detail.error) ? detail.error.message
        : Array.isArray(detail) ? detail.map(d => d.msg || JSON.stringify(d)).join('; ')
        : err?.message;
      throw new Error(msg || 'Node deposit failed: ' + res.status + '. Your sats are safe — check Pending Recovery.');
    }

    const response = await res.json();
    if (!existingKey && !response?.api_key) throw new Error('Node deposit response did not include a recoverable account key');
    await _setMeta('pendingDeposit', null);
    return response;
  });
}

/** Recover a failed deposit. Returns the pending token string or null. */
export async function recoverPendingDeposit() {
  const pending = await _getMeta('pendingDeposit');
  if (typeof pending === 'string') return pending;
  return (pending?.localCommit ? pending?.token : pending?.recoveryToken) || pending?.token || null;
}

/** Clear a pending deposit after manual recovery */
export async function clearPendingDeposit() {
  await _setMeta('pendingDeposit', null);
}

/** Recover a failed withdraw. Returns the pending token string or null. */
export async function recoverPendingWithdraw() {
  return _withWalletLock(() => _recoverPendingWithdrawUnlocked());
}

async function _recoverPendingWithdrawUnlocked() {
  const raw = await _getMeta('pendingWithdraw');
  if (!raw) return null;
  try {
    const pending = JSON.parse(raw);
    if (pending?.quoteId && Array.isArray(pending?.meltOutputs) && pending?.mint) {
      try {
        const wallet = await _getWallet(pending.mint);
        const quote = await wallet.checkMeltQuoteBolt11(pending.quoteId);
        const state = String(quote?.state || '').toUpperCase();
        if (state === 'PAID') {
          const cashuts = await _cashuLib();
          const outputData = pending.meltOutputs.map(output => cashuts.OutputData.deserialize(output));
          const change = wallet.createMeltChangeProofs(outputData, quote.change || []);
          if (change.length) await _saveProofs(change, pending.mint);
          await _setMeta('pendingWithdraw', null);
          return null;
        }
        if (state === 'PENDING') return null;
      } catch {}
    }
    return (pending?.localCommit ? pending?.token : pending?.recoveryToken) || pending?.token || null;
  } catch { return null; }
}

/** Clear a pending withdraw after manual recovery */
export async function clearPendingWithdraw() {
  await _setMeta('pendingWithdraw', null);
}

/** Persist a recoverable Cashu token before attempting risky refund/import flows. */
export async function savePendingWithdrawToken(token, source = 'manual') {
  if (!token) return false;
  const raw = await _getMeta('pendingWithdraw');
  if (raw) {
    try {
      const existing = JSON.parse(raw);
      if (existing?.token) return false;
    } catch {
      return false;
    }
  }
  await _setMeta('pendingWithdraw', JSON.stringify({
    quoteId: null,
    token,
    source,
    mint: extractTokenMintUrl(await _cashuLib(), token),
    savedAt: Date.now(),
  }));
  return true;
}

// ═══════════════════════════════════════════════
// WITHDRAW (MELT TO LIGHTNING)
// ═══════════════════════════════════════════════

/** Create a melt quote for paying a Lightning invoice.
 *  Returns { quote, amount, fee_reserve, state } */
export async function createWithdrawQuote(bolt11Invoice) {
  return _withWalletLock(async () => {
    const mintUrl = await getMintUrl();
    const wallet = await _getWallet(mintUrl);
    const quote = await wallet.createMeltQuoteBolt11(bolt11Invoice);
    const quoteAmount = _amountToNumber(quote.amount);
    const feeReserve = _amountToNumber(quote.fee_reserve);
    return {
      quote: quote.quote,
      amount: quoteAmount,
      fee_reserve: feeReserve,
      state: quote.state
    };
  });
}

/** Execute withdrawal — pays the Lightning invoice from wallet proofs.
 *  Returns { paid, change } */
export async function executeWithdraw(quoteId) {
  return _withWalletLock(async () => {
    await _ensureNoPendingSwap();
    const cashuts = await _cashuLib();
    const mintUrl = await getMintUrl();
    if (await _getMeta('pendingWithdraw')) throw new Error('Recover or clear the previous pending withdrawal first');
    const wallet = await _getWallet(mintUrl);
    const quote = await wallet.checkMeltQuoteBolt11(quoteId);
    const amountNeeded = _amountToNumber(quote.amount) + _amountToNumber(quote.fee_reserve);
    const proofs = await _pruneSpentProofs(true, mintUrl);
    const total = _sumProofsAsNumber(cashuts, proofs);
    if (total < amountNeeded) throw new Error('Insufficient balance: ' + total + ' sats, need ' + amountNeeded);

    const prepared = await _prepareDurableSwap(
      wallet,
      cashuts,
      'withdraw',
      mintUrl,
      wallet.ops?.send(amountNeeded, proofs).includeFees(true),
      proofs
    );
    const { keep, send } = prepared
      ? await wallet.completeSwap(prepared.preview)
      : await wallet.send(amountNeeded, proofs, { includeFees: true });

    const token = _encodeRecoveryToken(cashuts, mintUrl, send);
    const recoveryToken = _encodeRecoveryToken(cashuts, mintUrl, [...keep, ...send]);
    const pendingWithdraw = {
      quoteId,
      token,
      recoveryToken,
      localCommit: false,
      mint: mintUrl,
      savedAt: Date.now(),
    };
    await _setMeta('pendingWithdraw', JSON.stringify(pendingWithdraw));

    await _replaceProofs(proofs, keep, mintUrl);
    await _setMeta('pendingWithdraw', JSON.stringify({ ...pendingWithdraw, localCommit: true }));
    if (prepared) await _deleteMeta(PENDING_SWAP_KEY);

    let meltPreview = null;
    if (typeof wallet.prepareMelt === 'function' && cashuts.OutputData) {
      meltPreview = await wallet.prepareMelt('bolt11', quote, send);
      pendingWithdraw.meltOutputs = (meltPreview.outputData || []).map(output => cashuts.OutputData.serialize(output));
      await _setMeta('pendingWithdraw', JSON.stringify({ ...pendingWithdraw, localCommit: true }));
    }
    const result = meltPreview
      ? await wallet.completeMelt(meltPreview)
      : await wallet.meltProofsBolt11(quote, send);

    if (result.change && result.change.length) {
      await _saveProofs(result.change, mintUrl);
    }

    await _setMeta('pendingWithdraw', null);

    const balance = _sumProofsAsNumber(cashuts, await _pruneSpentProofs(false, mintUrl));
    return { paid: true, change: balance };
  });
}

/** Withdraw to a Lightning address (user@domain).
 *  Auto-reduces amount if balance can't cover fee reserve.
 *  Returns { paid, amount, balance } */
export async function withdrawToAddress(address, amountSats) {
  const balance = await getWalletBalance();
  // Try full amount first, reduce if fee reserve exceeds balance
  let tryAmount = amountSats;
  for (let attempt = 0; attempt < 3; attempt++) {
    const invoice = await _lnAddressToInvoice(address, tryAmount);
    if (!invoice) throw new Error('Amount out of range for this Lightning address');
    const quote = await createWithdrawQuote(invoice);
    const needed = (quote.amount || 0) + (quote.fee_reserve || 0);
    if (balance >= needed) {
      const result = await executeWithdraw(quote.quote);
      return { paid: true, amount: tryAmount, balance: result.change };
    }
    // Reduce by the fee reserve shortfall + small buffer
    tryAmount = tryAmount - (needed - balance) - 2;
    if (tryAmount < 1) throw new Error('Balance too low to cover Lightning routing fees');
  }
  throw new Error('Cannot fit withdrawal within balance after fee reserve');
}

/** Estimate max withdrawable amount (balance minus ~1% fee reserve estimate).
 *  Returns sats. Actual max depends on the specific invoice/route. */
export async function getMaxWithdrawable() {
  const balance = await getWalletBalance();
  // Lightning fee reserve is typically ~1% but varies. Use conservative 2% estimate.
  return Math.max(0, Math.floor(balance * 0.98) - 2);
}

/** Retry melting accumulated fee proofs. Returns { melted, remaining } */
export async function retryFeeAutoMelt() {
  return _withFeeLock(async () => {
    const cashuts = await _cashuLib();
    const mintUrl = await getMintUrl();
    const feeProofs = await _getAllFeeProofs(mintUrl);
    const feeSats = _sumProofsAsNumber(cashuts, feeProofs);
    if (feeSats < 1) return { melted: 0, remaining: 0 };
    try {
      const invoice = await _lnAddressToInvoice(FEE_LN_ADDRESS, feeSats);
      if (!invoice) return { melted: 0, remaining: feeSats, reason: 'below minimum' };
      const wallet = await _getWallet(mintUrl);
      const quote = await wallet.createMeltQuoteBolt11(invoice);
      const result = await wallet.meltProofsBolt11(quote, feeProofs);
      await _replaceFeeProofs(feeProofs, result.change || [], mintUrl);
      const remaining = await getFeeBalance();
      return { melted: feeSats, remaining };
    } catch (e) {
      return { melted: 0, remaining: feeSats, reason: e.message };
    }
  });
}

/** Send sats from wallet as a Cashu token string.
 *  Returns { token, amount, remaining } */
export async function sendAsToken(amountSats) {
  return _withWalletLock(async () => {
    await _ensureNoPendingSwap();
    const cashuts = await _cashuLib();
    const mintUrl = await getMintUrl();
    if (await _getMeta('pendingWithdraw')) throw new Error('Recover or clear the previous pending token first');
    const proofs = await _pruneSpentProofs(true, mintUrl);
    const total = _sumProofsAsNumber(cashuts, proofs);
    if (total < amountSats) throw new Error('Insufficient balance: ' + total + ' sats, need ' + amountSats);
    const wallet = await _getWallet(mintUrl);
    const prepared = await _prepareDurableSwap(
      wallet,
      cashuts,
      'send',
      mintUrl,
      wallet.ops?.send(amountSats, proofs).includeFees(true),
      proofs
    );
    const { keep, send } = prepared
      ? await wallet.completeSwap(prepared.preview)
      : await wallet.send(amountSats, proofs, { includeFees: true });
    const token = _encodeRecoveryToken(cashuts, mintUrl, send);
    const recoveryToken = _encodeRecoveryToken(cashuts, mintUrl, [...keep, ...send]);
    const pendingWithdraw = {
      quoteId: null,
      token,
      recoveryToken,
      localCommit: false,
      source: 'cashu-send',
      mint: mintUrl,
      savedAt: Date.now(),
    };
    await _setMeta('pendingWithdraw', JSON.stringify(pendingWithdraw));
    await _replaceProofs(proofs, keep, mintUrl);
    await _setMeta('pendingWithdraw', JSON.stringify({ ...pendingWithdraw, localCommit: true }));
    if (prepared) await _deleteMeta(PENDING_SWAP_KEY);
    const remaining = _sumProofsAsNumber(cashuts, await _pruneSpentProofs(false, mintUrl));
    return { token, amount: _sumProofsAsNumber(cashuts, send), remaining };
  });
}

// ═══════════════════════════════════════════════
// FEE MANAGEMENT
// ═══════════════════════════════════════════════

/** Resolve a Lightning address to a BOLT11 invoice via LNURL-pay */
async function _lnAddressToInvoice(address, amountSats) {
  const [user, domain] = address.split('@');
  if (!user || !domain) throw new Error('Invalid Lightning address');
  const res = await fetch('https://' + domain + '/.well-known/lnurlp/' + user);
  if (!res.ok) throw new Error('Lightning address lookup failed');
  const lnurl = await res.json();
  if (!lnurl.callback) throw new Error('No callback in LNURL response');
  const amountMsats = amountSats * 1000;
  if (lnurl.minSendable && amountMsats < lnurl.minSendable) return null;
  if (lnurl.maxSendable && amountMsats > lnurl.maxSendable) return null;
  const sep = lnurl.callback.includes('?') ? '&' : '?';
  const cbRes = await fetch(lnurl.callback + sep + 'amount=' + amountMsats);
  if (!cbRes.ok) throw new Error('Invoice request failed');
  const cbData = await cbRes.json();
  return cbData.pr || null;
}

/** Auto-melt fee proofs to getbased Lightning address. Silent — errors swallowed.
 *  Locked to prevent concurrent double-spend of fee proofs (C6). */
async function _autoMeltFees(feeProofs, operationMint) {
  if (!FEE_LN_ADDRESS) return;
  _withFeeLock(async () => {
    const cashuts = await _cashuLib();
    const mintUrl = _normalizeMintUrl(operationMint || await getMintUrl());
    const accumulated = await _getAllFeeProofs(mintUrl);
    const allFees = [...accumulated, ...feeProofs];
    if (!allFees.length) return;
    const feeSats = _sumProofsAsNumber(cashuts, allFees);
    if (feeSats < 1) return;
    if (feeSats < FEE_MELT_MIN_SATS) {
      if (feeProofs.length) await _saveFeeProofs(feeProofs, mintUrl);
      if (isDebugMode()) console.log('[cashu-wallet] Fee pool ' + feeSats + ' sats < ' + FEE_MELT_MIN_SATS + ' min, accumulating');
      return;
    }
    try {
      // Request invoice for amount minus estimated melt overhead (mint fee ~2-3 sats)
      const payAmount = feeSats - 5; // reserve 5 sats for mint melt fee
      if (payAmount < 1) {
        if (feeProofs.length) await _saveFeeProofs(feeProofs, mintUrl);
        return;
      }
      const invoice = await _lnAddressToInvoice(FEE_LN_ADDRESS, payAmount);
      if (!invoice) {
        if (feeProofs.length) await _saveFeeProofs(feeProofs, mintUrl);
        if (isDebugMode()) console.log('[cashu-wallet] Fee below LNURL min (' + payAmount + ' sats), saved for later');
        return;
      }
      const wallet = await _getWallet(mintUrl);
      const quote = await wallet.createMeltQuoteBolt11(invoice);
      // Verify we have enough proofs for amount + fee_reserve
      const needed = _amountToNumber(quote.amount) + _amountToNumber(quote.fee_reserve);
      if (feeSats < needed) {
        if (feeProofs.length) await _saveFeeProofs(feeProofs, mintUrl);
        if (isDebugMode()) console.log('[cashu-wallet] Fee pool ' + feeSats + ' < ' + needed + ' needed for melt, accumulating');
        return;
      }
      const result = await wallet.meltProofsBolt11(quote, allFees);
      await _replaceFeeProofs(allFees, result.change || [], mintUrl);
      if (isDebugMode()) console.log('[cashu-wallet] Fee melted:', feeSats, 'sats to', FEE_LN_ADDRESS);
      // Success — reset the consecutive-failure counter so the user
      // doesn't see a persistent-failure toast just because they had
      // a brief offline gap earlier.
      _autoMeltConsecutiveFailures = 0;
    } catch (e) {
      if (feeProofs.length) await _saveFeeProofs(feeProofs, mintUrl);
      if (isDebugMode()) console.log('[cashu-wallet] Fee melt failed, saved for later:', e.message);
      // Surface persistent failures so the user can act (top up the
      // LN node, fix the address, etc.). Transient airplane-mode
      // toggles produce one or two failures; only flag when something
      // is durably broken.
      _autoMeltConsecutiveFailures = (_autoMeltConsecutiveFailures || 0) + 1;
      if (_autoMeltConsecutiveFailures === 3 && typeof window !== 'undefined' && cashuWindow.showNotification) {
        cashuWindow.showNotification('Cashu fee melt failing repeatedly — proofs are safe and queued, but check Settings → AI → Routstr if the failures continue.', 'warning', 7000);
      }
    }
  }).catch(() => {}); // fire-and-forget, never block caller
}
// Module-scoped counter for persistent-failure detection. Resets on
// success, increments on each catch; only fires a user toast at 3 to
// avoid noise during transient airplane-mode toggles.
let _autoMeltConsecutiveFailures = 0;

/** Get accumulated fee balance in sats */
export async function getFeeBalance() {
  const cashuts = await _cashuLib();
  const proofs = await _getAllFeeProofs();
  return _sumProofsAsNumber(cashuts, proofs);
}

/** Redeem accumulated fee proofs by paying a Lightning invoice.
 *  Returns { paid, amount } */
export async function redeemFees(bolt11Invoice) {
  return _withFeeLock(async () => {
    const cashuts = await _cashuLib();
    const mintUrl = await getMintUrl();
    const proofs = await _getAllFeeProofs(mintUrl);
    const total = _sumProofsAsNumber(cashuts, proofs);
    if (total < 1) throw new Error('No fee proofs to redeem');
    const wallet = await _getWallet(mintUrl);
    const quote = await wallet.createMeltQuoteBolt11(bolt11Invoice);
    const result = await wallet.meltProofsBolt11(quote, proofs);
    await _replaceFeeProofs(proofs, result.change || [], mintUrl);
    return { paid: true, amount: total };
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

/** Get fee percentage */
export function getFeePct() {
  return WALLET_FEE_PCT;
}

// ═══════════════════════════════════════════════
// WINDOW EXPORTS
// ═══════════════════════════════════════════════
Object.assign(window, {
  cashuGetBalance: getWalletBalance,
  cashuCheckProofStates: checkProofStates,
  cashuCreateFundingInvoice: createFundingInvoice,
  cashuCheckFundingStatus: checkFundingStatus,
  cashuRecoverPendingFunding: recoverPendingFunding,
  cashuRecoverPendingWalletOperation: recoverPendingWalletOperation,
  cashuReceiveToken: receiveToken,
  cashuDepositToNode: depositToNode,
  cashuExportWallet: exportWallet,
  cashuImportWallet: importWallet,
  cashuClearWallet: clearWallet,
  cashuDestroyWalletDB: destroyWalletDB,
  cashuRecoverPendingDeposit: recoverPendingDeposit,
  cashuClearPendingDeposit: clearPendingDeposit,
  cashuRecoverPendingWithdraw: recoverPendingWithdraw,
  cashuClearPendingWithdraw: clearPendingWithdraw,
  cashuSavePendingWithdrawToken: savePendingWithdrawToken,
  cashuSendAsToken: sendAsToken,
  cashuCreateWithdrawQuote: createWithdrawQuote,
  cashuExecuteWithdraw: executeWithdraw,
  cashuWithdrawToAddress: withdrawToAddress,
  cashuGetMaxWithdrawable: getMaxWithdrawable,
  cashuRetryFeeAutoMelt: retryFeeAutoMelt,
  cashuGetFeeBalance: getFeeBalance,
  cashuRedeemFees: redeemFees,
  cashuGenerateWalletSeed: generateWalletSeed,
  cashuGetWalletMnemonic: getWalletMnemonic,
  cashuHasWalletSeed: hasWalletSeed,
  cashuRestoreWalletFromSeed: restoreWalletFromSeed,
  cashuGetMintUrl: getMintUrl,
  cashuSetMintUrl: setMintUrl,
  cashuGetFeePct: getFeePct,
});
