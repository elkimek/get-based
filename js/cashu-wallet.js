// cashu-wallet.js — In-app Cashu eCash wallet for decentralized AI payments
// Uses cashu-ts (vendored IIFE → global `cashuts`) for protocol operations.
// Proofs stored in IndexedDB, included in backup/sync.

import { isDebugMode } from './utils.js';
import { encryptedSetItem, encryptedGetItem } from './crypto.js';

// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const DEFAULT_MINT = 'https://mint.minibits.cash/Bitcoin';
const WALLET_FEE_PCT = 0; // Fee disabled until melt-to-Lightning redemption is built
const DB_NAME = 'getbased-cashu';
const DB_VERSION = 2;
const STORE_PROOFS = 'proofs';
const STORE_META = 'meta';
const STORE_FEES = 'fee-proofs';

// ═══════════════════════════════════════════════
// INDEXEDDB STORAGE
// ═══════════════════════════════════════════════
let _db = null;

function _openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function(e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_PROOFS)) {
        db.createObjectStore(STORE_PROOFS, { keyPath: 'secret' });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_FEES)) {
        db.createObjectStore(STORE_FEES, { keyPath: 'secret' });
      }
    };
    req.onsuccess = function(e) {
      _db = e.target.result;
      _migrateFeeProofs().catch(() => {});
      resolve(_db);
    };
    req.onerror = function(e) { reject(e.target.error); };
  });
}

async function _getAllProofs() {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROOFS, 'readonly');
    const store = tx.objectStore(STORE_PROOFS);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function _saveProofs(proofs) {
  if (!proofs.length) return;
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROOFS, 'readwrite');
    const store = tx.objectStore(STORE_PROOFS);
    for (const p of proofs) store.put(p);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function _deleteProofs(proofs) {
  if (!proofs.length) return;
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROOFS, 'readwrite');
    const store = tx.objectStore(STORE_PROOFS);
    for (const p of proofs) store.delete(p.secret);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function _clearAllProofs() {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROOFS, 'readwrite');
    tx.objectStore(STORE_PROOFS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function _getMeta(key) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function _setMeta(key, value) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function _saveFeeProofs(proofs) {
  if (!proofs.length) return;
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FEES, 'readwrite');
    const store = tx.objectStore(STORE_FEES);
    for (const p of proofs) store.put(p);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function _getAllFeeProofs() {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FEES, 'readonly');
    const req = tx.objectStore(STORE_FEES).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function _migrateFeeProofs() {
  const raw = localStorage.getItem('cashu-fee-proofs');
  if (!raw) return;
  try {
    const proofs = JSON.parse(raw);
    if (proofs.length) await _saveFeeProofs(proofs);
    localStorage.removeItem('cashu-fee-proofs');
  } catch {}
}

// ═══════════════════════════════════════════════
// WALLET INSTANCE
// ═══════════════════════════════════════════════
let _wallet = null;
let _mintUrl = null;

async function _getWallet(mintUrl) {
  const url = mintUrl || await getMintUrl();
  if (_wallet && _mintUrl === url) return _wallet;
  const { Wallet } = cashuts;
  // Use deterministic seed if available (enables restore from mnemonic)
  const mnemonic = await _getMeta('walletMnemonic');
  const opts = {};
  if (mnemonic && window.bip39) {
    opts.bip39seed = await window.bip39.mnemonicToSeed(mnemonic);
  }
  _wallet = new Wallet(url, opts);
  await _wallet.loadMint();
  _mintUrl = url;
  return _wallet;
}

// ═══════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════

/** Get configured mint URL */
export async function getMintUrl() {
  const stored = await _getMeta('mintUrl');
  return stored || DEFAULT_MINT;
}

/** Set mint URL */
export async function setMintUrl(url) {
  _wallet = null; // reset wallet instance
  _mintUrl = null;
  await _setMeta('mintUrl', url);
}

// ═══════════════════════════════════════════════
// SEED / MNEMONIC
// ═══════════════════════════════════════════════

/** Generate a new 12-word BIP-39 mnemonic and store it */
export async function generateWalletSeed() {
  if (!window.bip39) throw new Error('BIP-39 library not loaded');
  const mnemonic = await window.bip39.generateMnemonic(128);
  await _setMeta('walletMnemonic', mnemonic);
  // Mirror to localStorage (encrypted) for sync/backup
  await encryptedSetItem('labcharts-cashu-wallet-mnemonic', mnemonic);
  _wallet = null; _mintUrl = null; // reset so next _getWallet uses the seed
  return { mnemonic };
}

/** Get the stored mnemonic (null if not set) */
export async function getWalletMnemonic() {
  return _getMeta('walletMnemonic');
}

/** Check if wallet has been initialized with a seed */
export async function hasWalletSeed() {
  return !!(await _getMeta('walletMnemonic'));
}

/** Restore wallet from a 12-word mnemonic phrase.
 *  Queries the mint to recover previously-minted proofs.
 *  Returns { balance, restoredCount } */
export async function restoreWalletFromSeed(mnemonic) {
  if (!window.bip39) throw new Error('BIP-39 library not loaded');
  const valid = await window.bip39.validateMnemonic(mnemonic);
  if (!valid) throw new Error('Invalid mnemonic — check your words');
  // Store the mnemonic
  await _setMeta('walletMnemonic', mnemonic);
  await encryptedSetItem('labcharts-cashu-wallet-mnemonic', mnemonic);
  _wallet = null; _mintUrl = null; // reset
  // Create a seeded wallet and restore from the mint
  const wallet = await _getWallet();
  await _clearAllProofs(); // clear any existing proofs
  let totalRestored = 0;
  try {
    // batchRestore scans deterministic counters in batches
    const result = await wallet.batchRestore(300, 100, 0);
    if (result.proofs && result.proofs.length) {
      // Filter to only unspent proofs
      const { unspent } = await wallet.groupProofsByState(result.proofs);
      if (unspent.length) {
        await _saveProofs(unspent);
        totalRestored = cashuts.sumProofs(unspent);
      }
    }
  } catch (e) {
    if (isDebugMode()) console.log('[cashu-wallet] Restore error:', e.message);
    // Mint may not support /v1/restore — that's OK, wallet is still seeded
  }
  const balance = await getWalletBalance();
  return { balance, restoredCount: totalRestored };
}

/** Get wallet balance in sats */
export async function getWalletBalance() {
  const proofs = await _getAllProofs();
  return cashuts.sumProofs(proofs);
}

/** Create a Lightning invoice to fund the wallet.
 *  Fee is informational — displayed to user but not deducted from the invoice.
 *  The full amount goes to the wallet; fee is taken on spend (deposit to node).
 *  Returns { quote, invoice, amount } */
export async function createFundingInvoice(amountSats) {
  const wallet = await _getWallet();
  const quote = await wallet.createMintQuoteBolt11(amountSats);
  // Store the amount alongside the quote so checkFundingStatus can use it
  await _setMeta('pendingQuote:' + quote.quote, amountSats);
  return {
    quote: quote.quote,
    invoice: quote.request,
    amount: amountSats,
    state: quote.state
  };
}

/** Check if a funding invoice has been paid and mint the tokens.
 *  Returns { paid, balance } */
export async function checkFundingStatus(quoteId) {
  const wallet = await _getWallet();
  const checked = await wallet.checkMintQuoteBolt11(quoteId);
  if (checked.state === cashuts.MintQuoteState.PAID) {
    // Retrieve stored amount (don't rely on checked.amount which may be missing)
    const storedAmount = await _getMeta('pendingQuote:' + quoteId);
    const amount = storedAmount || checked.amount || 0;
    if (!amount) throw new Error('Cannot determine invoice amount — please contact support');
    const proofs = await wallet.mintProofsBolt11(amount, quoteId);
    await _saveProofs(proofs);
    const balance = await getWalletBalance();
    return { paid: true, balance, minted: amount };
  }
  return { paid: false, state: checked.state };
}

/** Receive a Cashu token string (from external source).
 *  Takes fee, stores remaining proofs.
 *  Returns { received, fee, balance } */
export async function receiveToken(tokenString) {
  const wallet = await _getWallet();
  const proofs = await wallet.receive(tokenString);
  const total = cashuts.sumProofs(proofs);
  const fee = Math.ceil(total * WALLET_FEE_PCT);

  if (fee > 0 && total > fee) {
    // wallet.send(fee, proofs) → send = proofs worth `fee` (revenue), keep = change (user's)
    const { keep, send } = await wallet.send(fee, proofs, { includeFees: true });
    await _saveProofs(keep); // user's proofs (total - fee)
    // Save fee proofs for later redemption (melt to Lightning address)
    await _saveFeeProofs(send);
    if (isDebugMode()) console.log('[cashu-wallet] Fee collected:', fee, 'sats');
  } else {
    await _saveProofs(proofs);
  }

  const balance = await getWalletBalance();
  return { received: total - fee, fee, balance };
}

/** Deposit sats to a Routstr node and get a session key for streaming.
 *  Atomically: swap proofs at mint → deposit token to node → update wallet.
 *  If node rejects, the send proofs are saved to recovery storage.
 *  Returns { api_key, balance } from the node. */
export async function depositToNode(nodeUrl, amountSats) {
  const proofs = await _getAllProofs();
  const total = cashuts.sumProofs(proofs);
  if (total < amountSats) throw new Error('Insufficient wallet balance: ' + total + ' sats, need ' + amountSats);

  const wallet = await _getWallet();
  const { keep, send } = await wallet.send(amountSats, proofs, { includeFees: true });

  // Encode the send proofs as a token
  const mintUrl = await getMintUrl();
  const token = cashuts.getEncodedToken({ mint: mintUrl, proofs: send });

  // Save the outbound token to recovery storage BEFORE calling the node.
  // If deposit fails, user can recover these proofs via wallet import.
  await _setMeta('pendingDeposit', token);

  // Now safe to update wallet: old proofs are spent (mint swapped), save change
  await _deleteProofs(proofs);
  await _saveProofs(keep);

  // Deposit to node
  const res = await fetch(nodeUrl + '/v1/balance/create?initial_balance_token=' + encodeURIComponent(token));
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    const detail = err?.detail;
    const msg = typeof detail === 'string' ? detail
      : (detail && detail.error) ? detail.error.message
      : Array.isArray(detail) ? detail.map(d => d.msg || JSON.stringify(d)).join('; ')
      : err?.message;
    // Don't clear pendingDeposit — user can recover via cashuRecoverPendingDeposit()
    throw new Error(msg || 'Node deposit failed: ' + res.status + '. Your sats are safe — use Backup to recover.');
  }

  // Success — clear recovery token
  await _setMeta('pendingDeposit', null);
  return res.json(); // { api_key, balance, ... }
}

/** Recover a failed deposit. Returns the pending token string or null. */
export async function recoverPendingDeposit() {
  return _getMeta('pendingDeposit');
}

// ═══════════════════════════════════════════════
// WITHDRAW (MELT TO LIGHTNING)
// ═══════════════════════════════════════════════

/** Create a melt quote for paying a Lightning invoice.
 *  Returns { quote, amount, fee_reserve, state } */
export async function createWithdrawQuote(bolt11Invoice) {
  const wallet = await _getWallet();
  const quote = await wallet.createMeltQuoteBolt11(bolt11Invoice);
  return {
    quote: quote.quote,
    amount: quote.amount,
    fee_reserve: quote.fee_reserve,
    state: quote.state
  };
}

/** Execute withdrawal — pays the Lightning invoice from wallet proofs.
 *  Returns { paid, change } */
export async function executeWithdraw(quoteId, bolt11Invoice) {
  const wallet = await _getWallet();
  const quote = await wallet.checkMeltQuoteBolt11(quoteId);
  const amountNeeded = (quote.amount || 0) + (quote.fee_reserve || 0);
  const proofs = await _getAllProofs();
  const total = cashuts.sumProofs(proofs);
  if (total < amountNeeded) throw new Error('Insufficient balance: ' + total + ' sats, need ' + amountNeeded);

  // Split proofs: send = what we spend, keep = change
  const { keep, send } = await wallet.send(amountNeeded, proofs, { includeFees: true });

  // Save recovery metadata before spending
  const mintUrl = await getMintUrl();
  await _setMeta('pendingWithdraw', JSON.stringify({ quoteId, bolt11: bolt11Invoice, token: cashuts.getEncodedToken({ mint: mintUrl, proofs: send }) }));

  // Update wallet: old proofs spent (swapped at mint), save change
  await _deleteProofs(proofs);
  await _saveProofs(keep);

  // Execute the melt — pays the Lightning invoice
  const result = await wallet.meltProofsBolt11(quote, send);

  // Save any change proofs returned by the mint (fee overpayment refund)
  if (result.change && result.change.length) {
    await _saveProofs(result.change);
  }

  // Clear recovery
  await _setMeta('pendingWithdraw', null);

  const balance = await getWalletBalance();
  return { paid: true, change: balance };
}

// ═══════════════════════════════════════════════
// FEE MANAGEMENT
// ═══════════════════════════════════════════════

/** Get accumulated fee balance in sats */
export async function getFeeBalance() {
  const proofs = await _getAllFeeProofs();
  return cashuts.sumProofs(proofs);
}

/** Redeem accumulated fee proofs by paying a Lightning invoice.
 *  Returns { paid, amount } */
export async function redeemFees(bolt11Invoice) {
  const proofs = await _getAllFeeProofs();
  const total = cashuts.sumProofs(proofs);
  if (total < 1) throw new Error('No fee proofs to redeem');
  const wallet = await _getWallet();
  const quote = await wallet.createMeltQuoteBolt11(bolt11Invoice);
  const result = await wallet.meltProofsBolt11(quote, proofs);
  // Clear redeemed fee proofs
  const db = await _openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FEES, 'readwrite');
    tx.objectStore(STORE_FEES).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  // Save any change
  if (result.change && result.change.length) await _saveFeeProofs(result.change);
  return { paid: true, amount: total };
}

/** Export all proofs as a cashu token string (for backup) */
export async function exportWallet() {
  const proofs = await _getAllProofs();
  if (!proofs.length) return null;
  const mintUrl = await getMintUrl();
  return cashuts.getEncodedToken({ mint: mintUrl, proofs });
}

/** Import proofs from a cashu token string (restore from backup) */
export async function importWallet(tokenString) {
  const wallet = await _getWallet();
  // Receive performs a swap to verify proofs are still valid
  const proofs = await wallet.receive(tokenString);
  await _saveProofs(proofs);
  return cashuts.sumProofs(proofs);
}

/** Clear the wallet (remove all proofs) */
export async function clearWallet() {
  await _clearAllProofs();
  _wallet = null;
  _mintUrl = null;
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
  cashuCreateFundingInvoice: createFundingInvoice,
  cashuCheckFundingStatus: checkFundingStatus,
  cashuReceiveToken: receiveToken,
  cashuDepositToNode: depositToNode,
  cashuExportWallet: exportWallet,
  cashuImportWallet: importWallet,
  cashuClearWallet: clearWallet,
  cashuRecoverPendingDeposit: recoverPendingDeposit,
  cashuCreateWithdrawQuote: createWithdrawQuote,
  cashuExecuteWithdraw: executeWithdraw,
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
