// cashu-wallet.js — In-app Cashu eCash wallet for decentralized AI payments
// Uses cashu-ts (vendored IIFE → global `cashuts`) for protocol operations.
// Proofs stored in IndexedDB, included in backup/sync.

import { isDebugMode } from './utils.js';

// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const DEFAULT_MINT = 'https://mint.minibits.cash/Bitcoin';
const WALLET_FEE_PCT = 0.05; // 5% supports getbased development
const DB_NAME = 'getbased-cashu';
const DB_VERSION = 1;
const STORE_PROOFS = 'proofs';
const STORE_META = 'meta';

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
    };
    req.onsuccess = function(e) { _db = e.target.result; resolve(_db); };
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

// ═══════════════════════════════════════════════
// WALLET INSTANCE
// ═══════════════════════════════════════════════
let _wallet = null;
let _mintUrl = null;

async function _getWallet(mintUrl) {
  const url = mintUrl || await getMintUrl();
  if (_wallet && _mintUrl === url) return _wallet;
  const { Wallet } = cashuts;
  _wallet = new Wallet(url);
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
    const existingFees = JSON.parse(localStorage.getItem('cashu-fee-proofs') || '[]');
    existingFees.push(...send);
    localStorage.setItem('cashu-fee-proofs', JSON.stringify(existingFees));
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
  cashuGetMintUrl: getMintUrl,
  cashuSetMintUrl: setMintUrl,
  cashuGetFeePct: getFeePct,
});
