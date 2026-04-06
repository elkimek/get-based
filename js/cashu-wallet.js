// cashu-wallet.js — In-app Cashu eCash wallet for decentralized AI payments
// Uses cashu-ts (vendored IIFE → global `cashuts`) for protocol operations.
// Proofs stored in IndexedDB, included in backup/sync.

import { isDebugMode, showConfirmDialog } from './utils.js';
import { encryptedSetItem, encryptedGetItem } from './crypto.js';

// ═══════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════
const DEFAULT_MINT = 'https://mint.minibits.cash/Bitcoin';
const WALLET_FEE_PCT = 0; // disabled for beta testing (normally 0.03 = 3%)
const FEE_LN_ADDRESS = 'denimgecko11@primal.net';
const FEE_MELT_MIN_SATS = 100; // don't attempt melt below this — mint fees eat it
const MAX_WALLET_BALANCE = 25000; // safety cap until battle-tested
const DB_NAME = 'getbased-cashu';
const DB_VERSION = 2;
const STORE_PROOFS = 'proofs';
const STORE_META = 'meta';
const STORE_FEES = 'fee-proofs';

// ═══════════════════════════════════════════════
// GLOBAL WALLET LOCK — prevents concurrent proof-mutating operations (C1)
// ═══════════════════════════════════════════════
let _walletLock = Promise.resolve();

function _withWalletLock(fn) {
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
  let release;
  const gate = new Promise(r => release = r);
  const prev = _feeLock;
  _feeLock = prev.then(() => gate);
  return prev.then(async () => {
    try { return await fn(); } finally { release(); }
  });
}

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

let _legacyProofsMigrated = false;

async function _migrateUntaggedProofs() {
  if (_legacyProofsMigrated) return;
  _legacyProofsMigrated = true;
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROOFS, 'readwrite');
    const store = tx.objectStore(STORE_PROOFS);
    const req = store.getAll();
    req.onsuccess = () => {
      // Legacy proofs were all on DEFAULT_MINT (only mint before namespacing)
      for (const p of (req.result || [])) {
        if (!p._mint) store.put({ ...p, _mint: DEFAULT_MINT });
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function _getAllProofs() {
  await _migrateUntaggedProofs();
  const db = await _openDB();
  const mintUrl = await getMintUrl();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROOFS, 'readonly');
    const store = tx.objectStore(STORE_PROOFS);
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result || []).filter(p => p._mint === mintUrl));
    req.onerror = () => reject(req.error);
  });
}

async function _saveProofs(proofs) {
  if (!proofs.length) return;
  const mintUrl = await getMintUrl();
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROOFS, 'readwrite');
    const store = tx.objectStore(STORE_PROOFS);
    for (const p of proofs) store.put({ ...p, _mint: mintUrl });
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
  const mintUrl = await getMintUrl();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROOFS, 'readwrite');
    const store = tx.objectStore(STORE_PROOFS);
    const req = store.getAll();
    req.onsuccess = () => {
      const all = req.result || [];
      for (const p of all) {
        if (!p._mint || p._mint === mintUrl) store.delete(p.secret);
      }
    };
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
  const mintUrl = await getMintUrl();
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FEES, 'readwrite');
    const store = tx.objectStore(STORE_FEES);
    for (const p of proofs) store.put({ ...p, _mint: mintUrl });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function _getAllFeeProofs() {
  const db = await _openDB();
  const mintUrl = await getMintUrl();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FEES, 'readonly');
    const req = tx.objectStore(STORE_FEES).getAll();
    req.onsuccess = () => resolve((req.result || []).filter(p => p._mint === mintUrl || !p._mint));
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
// MNEMONIC STORAGE — encrypted only (C2/C3)
// ═══════════════════════════════════════════════
const _MNEMONIC_KEY = 'labcharts-cashu-wallet-mnemonic';

async function _loadMnemonic() {
  // Primary: encrypted localStorage
  const encrypted = await encryptedGetItem(_MNEMONIC_KEY);
  if (encrypted) return encrypted;
  // Migration: move plaintext IDB → encrypted, then delete plaintext
  const legacy = await _getMeta('walletMnemonic');
  if (legacy) {
    await encryptedSetItem(_MNEMONIC_KEY, legacy);
    await _setMeta('walletMnemonic', null); // clear plaintext
    return legacy;
  }
  return null;
}

async function _saveMnemonic(mnemonic) {
  await encryptedSetItem(_MNEMONIC_KEY, mnemonic);
}

// ═══════════════════════════════════════════════
// WALLET INSTANCE
// ═══════════════════════════════════════════════
let _wallet = null;
let _mintUrl = null;

// Persist deterministic wallet counters in IndexedDB to avoid "outputs already signed" errors.
// Interface: reserve(keysetId, count) → { start, count }, advanceToAtLeast(keysetId, value)
function _createCounterSource() {
  const next = {};
  const locks = new Map();

  async function _load(keysetId) {
    if (next[keysetId] != null) return;
    const stored = await _getMeta('counter:' + keysetId);
    next[keysetId] = stored || 0;
  }

  async function _save(keysetId) {
    await _setMeta('counter:' + keysetId, next[keysetId]);
  }

  // Simple async lock per keyset to prevent concurrent reserve conflicts
  function withLock(keysetId, fn) {
    const prev = locks.get(keysetId) || Promise.resolve();
    let release;
    const gate = new Promise(r => release = r);
    const chained = prev.then(() => gate);
    locks.set(keysetId, chained);
    return prev.then(async () => {
      try { return await fn(); } finally { release(); if (locks.get(keysetId) === chained) locks.delete(keysetId); }
    });
  }

  return {
    async reserve(keysetId, count) {
      if (count < 0) throw new Error('reserve called with negative count');
      return withLock(keysetId, async () => {
        await _load(keysetId);
        const start = next[keysetId];
        if (count === 0) return { start, count: 0 };
        next[keysetId] = start + count;
        await _save(keysetId);
        return { start, count };
      });
    },
    async advanceToAtLeast(keysetId, value) {
      return withLock(keysetId, async () => {
        await _load(keysetId);
        if (value > next[keysetId]) {
          next[keysetId] = value;
          await _save(keysetId);
        }
      });
    }
  };
}

async function _getWallet(mintUrl) {
  const url = mintUrl || await getMintUrl();
  if (_wallet && _mintUrl === url) return _wallet;
  const { Wallet } = cashuts;
  const mnemonic = await _loadMnemonic();
  const opts = {};
  if (mnemonic && window.bip39) {
    opts.bip39seed = await window.bip39.mnemonicToSeed(mnemonic);
    opts.counterSource = _createCounterSource();
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
  // Mirror to localStorage for sync/backup
  localStorage.setItem('labcharts-cashu-wallet-mint', url);
}

// ═══════════════════════════════════════════════
// SEED / MNEMONIC
// ═══════════════════════════════════════════════

/** Generate a new 12-word BIP-39 mnemonic and store it (encrypted) */
export async function generateWalletSeed() {
  if (!window.bip39) throw new Error('BIP-39 library not loaded');
  const mnemonic = await window.bip39.generateMnemonic(128);
  await _saveMnemonic(mnemonic);
  _wallet = null; _mintUrl = null; // reset so next _getWallet uses the seed
  return { mnemonic };
}

/** Get the stored mnemonic (null if not set) */
export async function getWalletMnemonic() {
  return _loadMnemonic();
}

/** Check if wallet has been initialized with a seed */
export async function hasWalletSeed() {
  return !!(await _loadMnemonic());
}

/** Restore wallet from a 12-word mnemonic phrase.
 *  Queries the mint to recover previously-minted proofs.
 *  Returns { balance, restoredCount } */
export async function restoreWalletFromSeed(mnemonic) {
  return _withWalletLock(async () => {
  if (!window.bip39) throw new Error('BIP-39 library not loaded');
  const valid = await window.bip39.validateMnemonic(mnemonic);
  if (!valid) throw new Error('Invalid mnemonic — check your words');
  await _saveMnemonic(mnemonic);
  _wallet = null; _mintUrl = null; // reset
  const wallet = await _getWallet();
  await _clearAllProofs();
  let totalRestored = 0;
  try {
    // Loop batchRestore until no more proofs found (H5)
    let start = 0;
    const batchSize = 300;
    const gap = 100;
    while (true) {
      const result = await wallet.batchRestore(batchSize, gap, start);
      if (!result.proofs || !result.proofs.length) break;
      const { unspent } = await wallet.groupProofsByState(result.proofs);
      if (unspent.length) {
        await _saveProofs(unspent);
        totalRestored += cashuts.sumProofs(unspent);
      }
      start += batchSize;
    }
  } catch (e) {
    if (isDebugMode()) console.log('[cashu-wallet] Restore error:', e.message);
    // Mint may not support /v1/restore — that's OK, wallet is still seeded
  }
  const balance = await getWalletBalance();
  return { balance, restoredCount: totalRestored };
  }); // _withWalletLock
}

/** Get wallet balance in sats */
export async function getWalletBalance() {
  const proofs = await _getAllProofs();
  return cashuts.sumProofs(proofs);
}

/** Create a Lightning invoice to fund the wallet.
 *  Returns { quote, invoice, amount } */
export async function createFundingInvoice(amountSats) {
  const currentBal = await getWalletBalance();
  if (currentBal + amountSats > MAX_WALLET_BALANCE) throw new Error('Would exceed ' + MAX_WALLET_BALANCE.toLocaleString() + ' sats safety cap. Withdraw some sats first.');
  const wallet = await _getWallet();
  const quote = await wallet.createMintQuoteBolt11(amountSats);
  await _setMeta('pendingQuote:' + quote.quote, amountSats);
  return {
    quote: quote.quote,
    invoice: quote.request,
    amount: amountSats,
    state: quote.state
  };
}

/** Check if a funding invoice has been paid and mint the tokens.
 *  Takes 3% fee on Lightning deposits.
 *  Returns { paid, balance, fee } */
export async function checkFundingStatus(quoteId) {
  return _withWalletLock(async () => {
    const wallet = await _getWallet();
    const checked = await wallet.checkMintQuoteBolt11(quoteId);
    if (checked.state === cashuts.MintQuoteState.PAID) {
      const storedAmount = await _getMeta('pendingQuote:' + quoteId);
      const amount = storedAmount || checked.amount || 0;
      if (!amount) throw new Error('Cannot determine invoice amount — please contact support');
      const proofs = await wallet.mintProofsBolt11(amount, quoteId);
      const total = cashuts.sumProofs(proofs);
      const fee = Math.ceil(total * WALLET_FEE_PCT);

      if (fee > 0 && total > fee) {
        const { keep, send } = await wallet.send(fee, proofs, { includeFees: true });
        await _saveProofs(keep);
        _autoMeltFees(send);
        if (isDebugMode()) console.log('[cashu-wallet] Lightning deposit fee collected:', fee, 'sats');
      } else {
        await _saveProofs(proofs);
      }
      const balance = await getWalletBalance();
      return { paid: true, balance, minted: amount, fee };
    }
    return { paid: false, state: checked.state };
  });
}

/** Receive a Cashu token string (from external source).
 *  Takes fee, stores remaining proofs.
 *  Returns { received, fee, balance } */
export async function receiveToken(tokenString) {
  return _withWalletLock(async () => {
    const currentBal = await getWalletBalance();
    if (currentBal >= MAX_WALLET_BALANCE) throw new Error('Wallet at ' + MAX_WALLET_BALANCE.toLocaleString() + ' sats safety cap. Withdraw some sats first.');
    const wallet = await _getWallet();
    const proofs = await wallet.receive(tokenString);
    const total = cashuts.sumProofs(proofs);
    const fee = Math.ceil(total * WALLET_FEE_PCT);

    if (fee > 0 && total > fee) {
      const { keep, send } = await wallet.send(fee, proofs, { includeFees: true });
      await _saveProofs(keep);
      _autoMeltFees(send);
      if (isDebugMode()) console.log('[cashu-wallet] Fee collected:', fee, 'sats');
    } else {
      await _saveProofs(proofs);
    }

    const balance = await getWalletBalance();
    return { received: total - fee, fee, balance };
  });
}

/** Deposit sats to a Routstr node. Uses topup if session key exists, otherwise creates new.
 *  Returns { api_key, balance } from the node. */
export async function depositToNode(nodeUrl, amountSats, existingKey) {
  nodeUrl = nodeUrl.replace(/\/+$/, ''); // normalize trailing slashes
  return _withWalletLock(async () => {
    const proofs = await _getAllProofs();
    const total = cashuts.sumProofs(proofs);
    if (total < amountSats) throw new Error('Insufficient wallet balance: ' + total + ' sats, need ' + amountSats);

    const wallet = await _getWallet();
    const { keep, send } = await wallet.send(amountSats, proofs, { includeFees: true });

    const mintUrl = await getMintUrl();
    const token = cashuts.getEncodedToken({ mint: mintUrl, proofs: send });

    // Save recovery token BEFORE calling the node
    await _setMeta('pendingDeposit', token);

    // Update wallet: old proofs spent (mint swapped), save change
    await _deleteProofs(proofs);
    await _saveProofs(keep);

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

    await _setMeta('pendingDeposit', null);
    return res.json();
  });
}

/** Recover a failed deposit. Returns the pending token string or null. */
export async function recoverPendingDeposit() {
  return _getMeta('pendingDeposit');
}

/** Clear a pending deposit after manual recovery */
export async function clearPendingDeposit() {
  await _setMeta('pendingDeposit', null);
}

/** Recover a failed withdraw. Returns the pending token string or null. */
export async function recoverPendingWithdraw() {
  const raw = await _getMeta('pendingWithdraw');
  if (!raw) return null;
  try { return JSON.parse(raw).token || null; } catch { return null; }
}

/** Clear a pending withdraw after manual recovery */
export async function clearPendingWithdraw() {
  await _setMeta('pendingWithdraw', null);
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
export async function executeWithdraw(quoteId) {
  return _withWalletLock(async () => {
    const wallet = await _getWallet();
    const quote = await wallet.checkMeltQuoteBolt11(quoteId);
    const amountNeeded = (quote.amount || 0) + (quote.fee_reserve || 0);
    const proofs = await _getAllProofs();
    const total = cashuts.sumProofs(proofs);
    if (total < amountNeeded) throw new Error('Insufficient balance: ' + total + ' sats, need ' + amountNeeded);

    const { keep, send } = await wallet.send(amountNeeded, proofs, { includeFees: true });

    const mintUrl = await getMintUrl();
    await _setMeta('pendingWithdraw', JSON.stringify({ quoteId, token: cashuts.getEncodedToken({ mint: mintUrl, proofs: send }) }));

    await _deleteProofs(proofs);
    await _saveProofs(keep);

    const result = await wallet.meltProofsBolt11(quote, send);

    if (result.change && result.change.length) {
      await _saveProofs(result.change);
    }

    await _setMeta('pendingWithdraw', null);

    const balance = await getWalletBalance();
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
    const feeProofs = await _getAllFeeProofs();
    const feeSats = cashuts.sumProofs(feeProofs);
    if (feeSats < 1) return { melted: 0, remaining: 0 };
    try {
      const invoice = await _lnAddressToInvoice(FEE_LN_ADDRESS, feeSats);
      if (!invoice) return { melted: 0, remaining: feeSats, reason: 'below minimum' };
      const wallet = await _getWallet();
      const quote = await wallet.createMeltQuoteBolt11(invoice);
      const result = await wallet.meltProofsBolt11(quote, feeProofs);
      const db = await _openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_FEES, 'readwrite');
        tx.objectStore(STORE_FEES).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      if (result.change && result.change.length) await _saveFeeProofs(result.change);
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
    const proofs = await _getAllProofs();
    const total = cashuts.sumProofs(proofs);
    if (total < amountSats) throw new Error('Insufficient balance: ' + total + ' sats, need ' + amountSats);
    const wallet = await _getWallet();
    const { keep, send } = await wallet.send(amountSats, proofs, { includeFees: true });
    await _deleteProofs(proofs);
    await _saveProofs(keep);
    const mintUrl = await getMintUrl();
    const token = cashuts.getEncodedToken({ mint: mintUrl, proofs: send });
    const remaining = await getWalletBalance();
    return { token, amount: cashuts.sumProofs(send), remaining };
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
async function _autoMeltFees(feeProofs) {
  if (!FEE_LN_ADDRESS) return;
  _withFeeLock(async () => {
    const accumulated = await _getAllFeeProofs();
    const allFees = [...accumulated, ...feeProofs];
    if (!allFees.length) return;
    const feeSats = cashuts.sumProofs(allFees);
    if (feeSats < 1) return;
    if (feeSats < FEE_MELT_MIN_SATS) {
      if (feeProofs.length) await _saveFeeProofs(feeProofs);
      if (isDebugMode()) console.log('[cashu-wallet] Fee pool ' + feeSats + ' sats < ' + FEE_MELT_MIN_SATS + ' min, accumulating');
      return;
    }
    try {
      // Request invoice for amount minus estimated melt overhead (mint fee ~2-3 sats)
      const payAmount = feeSats - 5; // reserve 5 sats for mint melt fee
      if (payAmount < 1) {
        if (feeProofs.length) await _saveFeeProofs(feeProofs);
        return;
      }
      const invoice = await _lnAddressToInvoice(FEE_LN_ADDRESS, payAmount);
      if (!invoice) {
        if (feeProofs.length) await _saveFeeProofs(feeProofs);
        if (isDebugMode()) console.log('[cashu-wallet] Fee below LNURL min (' + payAmount + ' sats), saved for later');
        return;
      }
      const wallet = await _getWallet();
      const quote = await wallet.createMeltQuoteBolt11(invoice);
      // Verify we have enough proofs for amount + fee_reserve
      const needed = (quote.amount || 0) + (quote.fee_reserve || 0);
      if (feeSats < needed) {
        if (feeProofs.length) await _saveFeeProofs(feeProofs);
        if (isDebugMode()) console.log('[cashu-wallet] Fee pool ' + feeSats + ' < ' + needed + ' needed for melt, accumulating');
        return;
      }
      const result = await wallet.meltProofsBolt11(quote, allFees);
      const db = await _openDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_FEES, 'readwrite');
        tx.objectStore(STORE_FEES).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      if (isDebugMode()) console.log('[cashu-wallet] Fee melted:', feeSats, 'sats to', FEE_LN_ADDRESS);
      if (result.change && result.change.length) await _saveFeeProofs(result.change);
    } catch (e) {
      if (feeProofs.length) await _saveFeeProofs(feeProofs);
      if (isDebugMode()) console.log('[cashu-wallet] Fee melt failed, saved for later:', e.message);
    }
  }).catch(() => {}); // fire-and-forget, never block caller
}

/** Get accumulated fee balance in sats */
export async function getFeeBalance() {
  const proofs = await _getAllFeeProofs();
  return cashuts.sumProofs(proofs);
}

/** Redeem accumulated fee proofs by paying a Lightning invoice.
 *  Returns { paid, amount } */
export async function redeemFees(bolt11Invoice) {
  return _withFeeLock(async () => {
    const proofs = await _getAllFeeProofs();
    const total = cashuts.sumProofs(proofs);
    if (total < 1) throw new Error('No fee proofs to redeem');
    const wallet = await _getWallet();
    const quote = await wallet.createMeltQuoteBolt11(bolt11Invoice);
    const result = await wallet.meltProofsBolt11(quote, proofs);
    const db = await _openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_FEES, 'readwrite');
      tx.objectStore(STORE_FEES).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    if (result.change && result.change.length) await _saveFeeProofs(result.change);
    return { paid: true, amount: total };
  });
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
  return _withWalletLock(async () => {
    const wallet = await _getWallet();
    const proofs = await wallet.receive(tokenString);
    await _saveProofs(proofs);
    return cashuts.sumProofs(proofs);
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
    _db = null;
    _wallet = null;
    _mintUrl = null;
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
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
  cashuCreateFundingInvoice: createFundingInvoice,
  cashuCheckFundingStatus: checkFundingStatus,
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
