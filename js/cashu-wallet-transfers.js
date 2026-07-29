// @ts-check
// Cashu outbound transfers, recovery journals, Lightning melts, and fee handling.

import { getErrorMessage } from './caught-error.js';
import { isDebugMode } from './utils.js';
import {
  PENDING_SWAP_KEY,
  _amountToNumber,
  _normalizeMintUrl,
  _getAllFeeProofs,
  _getMeta,
  _setMeta,
  _deleteMeta,
  _prepareDurableSwap,
  _ensureNoPendingSwap,
  _saveProofs,
  _replaceProofs,
  _pruneSpentProofs,
  _saveFeeProofs,
  _replaceFeeProofs,
} from './cashu-wallet-store.js';

const FEE_LN_ADDRESS = 'denimgecko11@primal.net';
const FEE_MELT_MIN_SATS = 100;
const FEE_LOCK_NAME = 'getbased-cashu-fees';
const cashuWindow = /** @type {Window & typeof globalThis & {
  showNotification?: (message: string, type?: string, duration?: number) => void
}} */ (window);

/**
 * @typedef {{
 *   cashuLib: null | (() => Promise<any>),
 *   encodeRecoveryToken: null | ((cashuts: any, mintUrl: string, proofs: any[]) => string),
 *   extractTokenMintUrl: null | ((cashuts: any, tokenString: string) => string | null),
 *   getMintUrl: null | (() => Promise<string>),
 *   getWallet: null | ((mintUrl?: string) => Promise<any>),
 *   getWalletBalance: null | (() => Promise<number>),
 *   sumProofsAsNumber: null | ((cashuts: any, proofs: any[]) => number),
 *   withWalletLock: null | ((fn: () => Promise<any>) => Promise<any>),
 * }} CashuWalletTransferDeps
 */

/** @type {CashuWalletTransferDeps} */
const cashuWalletTransferDeps = {
  cashuLib: null,
  encodeRecoveryToken: null,
  extractTokenMintUrl: null,
  getMintUrl: null,
  getWallet: null,
  getWalletBalance: null,
  sumProofsAsNumber: null,
  withWalletLock: null,
};

/** @param {Partial<CashuWalletTransferDeps>} [deps] */
export function configureCashuWalletTransferDependencies(deps = {}) {
  const previous = { ...cashuWalletTransferDeps };
  if (deps.cashuLib === null || typeof deps.cashuLib === 'function') cashuWalletTransferDeps.cashuLib = deps.cashuLib;
  if (deps.encodeRecoveryToken === null || typeof deps.encodeRecoveryToken === 'function') {
    cashuWalletTransferDeps.encodeRecoveryToken = deps.encodeRecoveryToken;
  }
  if (deps.extractTokenMintUrl === null || typeof deps.extractTokenMintUrl === 'function') {
    cashuWalletTransferDeps.extractTokenMintUrl = deps.extractTokenMintUrl;
  }
  if (deps.getMintUrl === null || typeof deps.getMintUrl === 'function') cashuWalletTransferDeps.getMintUrl = deps.getMintUrl;
  if (deps.getWallet === null || typeof deps.getWallet === 'function') cashuWalletTransferDeps.getWallet = deps.getWallet;
  if (deps.getWalletBalance === null || typeof deps.getWalletBalance === 'function') {
    cashuWalletTransferDeps.getWalletBalance = deps.getWalletBalance;
  }
  if (deps.sumProofsAsNumber === null || typeof deps.sumProofsAsNumber === 'function') {
    cashuWalletTransferDeps.sumProofsAsNumber = deps.sumProofsAsNumber;
  }
  if (deps.withWalletLock === null || typeof deps.withWalletLock === 'function') {
    cashuWalletTransferDeps.withWalletLock = deps.withWalletLock;
  }
  return previous;
}

function _cashuLib() {
  if (!cashuWalletTransferDeps.cashuLib) throw new Error('Cashu transfers require cashuLib');
  return cashuWalletTransferDeps.cashuLib();
}

function _encodeRecoveryToken(cashuts, mintUrl, proofs) {
  if (!cashuWalletTransferDeps.encodeRecoveryToken) throw new Error('Cashu transfers require encodeRecoveryToken');
  return cashuWalletTransferDeps.encodeRecoveryToken(cashuts, mintUrl, proofs);
}

function _extractTokenMintUrl(cashuts, tokenString) {
  if (!cashuWalletTransferDeps.extractTokenMintUrl) throw new Error('Cashu transfers require extractTokenMintUrl');
  return cashuWalletTransferDeps.extractTokenMintUrl(cashuts, tokenString);
}

function getMintUrl() {
  if (!cashuWalletTransferDeps.getMintUrl) throw new Error('Cashu transfers require getMintUrl');
  return cashuWalletTransferDeps.getMintUrl();
}

function _getWallet(mintUrl) {
  if (!cashuWalletTransferDeps.getWallet) throw new Error('Cashu transfers require getWallet');
  return cashuWalletTransferDeps.getWallet(mintUrl);
}

function getWalletBalance() {
  if (!cashuWalletTransferDeps.getWalletBalance) throw new Error('Cashu transfers require getWalletBalance');
  return cashuWalletTransferDeps.getWalletBalance();
}

function _sumProofsAsNumber(cashuts, proofs) {
  if (!cashuWalletTransferDeps.sumProofsAsNumber) throw new Error('Cashu transfers require sumProofsAsNumber');
  return cashuWalletTransferDeps.sumProofsAsNumber(cashuts, proofs);
}

function _withWalletLock(fn) {
  if (!cashuWalletTransferDeps.withWalletLock) throw new Error('Cashu transfers require withWalletLock');
  return cashuWalletTransferDeps.withWalletLock(fn);
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
    mint: _extractTokenMintUrl(await _cashuLib(), token),
    savedAt: Date.now(),
  }));
  return true;
}

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
      return { melted: 0, remaining: feeSats, reason: getErrorMessage(e) };
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
export async function _autoMeltFees(feeProofs, operationMint) {
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
      if (isDebugMode()) console.log('[cashu-wallet] Fee melt failed, saved for later:', getErrorMessage(e));
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
