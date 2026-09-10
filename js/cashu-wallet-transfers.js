// @ts-check
// Cashu outbound transfers, recovery journals, Lightning melts, and fee handling.

import { positiveSats, canonicalRoutstrUrl, validateLightningInvoice } from './routstr-validation.js';
import { getRoutstrSessionKey } from './routstr-session.js';
import { submitRoutstrDeposit, reconcileRoutstrDeposit, depositExternalTokenToNode, requestNodeRefund, completeNodeRefund } from './routstr-node-payments.js';
import { getErrorMessage } from './caught-error.js';
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
  nodeUrl = canonicalRoutstrUrl(nodeUrl);
  positiveSats(amountSats);
  if (existingKey && existingKey !== getRoutstrSessionKey(nodeUrl)) throw new Error('Deposit credential does not belong to this node');
  existingKey = getRoutstrSessionKey(nodeUrl);
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
    const { keep, send } = await wallet.completeSwap(prepared.preview);

    const token = _encodeRecoveryToken(cashuts, mintUrl, send);
    const recoveryToken = _encodeRecoveryToken(cashuts, mintUrl, [...keep, ...send]);

    // Save recovery token BEFORE calling the node
    const pendingDeposit = { token, recoveryToken, localCommit: false, mint: mintUrl, nodeUrl, createdAt: Date.now() };
    await _setMeta('pendingDeposit', pendingDeposit);

    // Update wallet: old proofs spent (mint swapped), save change
    await _replaceProofs(proofs, keep, mintUrl);
    await _setMeta('pendingDeposit', { ...pendingDeposit, localCommit: true });
    if (prepared) await _deleteMeta(PENDING_SWAP_KEY);

    return submitRoutstrDeposit({ ...pendingDeposit, localCommit: true, existingKey });
  });
}

/** Recover a failed deposit. Returns the pending token string or null. */
export async function recoverPendingDeposit() {
  return _withWalletLock(async () => {
    let pending;
    try { pending = await reconcileRoutstrDeposit(); } catch { pending = await _getMeta('pendingDeposit'); }
    if (typeof pending === 'string') return pending;
    return (pending?.localCommit ? pending?.token : pending?.recoveryToken) || pending?.token || null;
  });
}
export async function clearPendingDeposit() {
  return _withWalletLock(async () => {
    if (await _getMeta('pendingDeposit')) throw new Error('Recover or reconcile the deposit before clearing it');
  });
}

/** Recover a failed withdraw. Returns the pending token string or null. */
export async function recoverPendingWithdraw() {
  return _withWalletLock(() => _recoverPendingWithdrawUnlocked());
}

async function _recoverPendingWithdrawUnlocked() {
  const raw = await _getMeta('pendingWithdraw');
  if (!raw) return null;
  const pending = JSON.parse(raw);
  const wallet = await _getWallet(pending.mint || await getMintUrl());
  const cashuts = await _cashuLib();
  if (pending.quoteId && Array.isArray(pending.meltOutputs)) {
    // An unavailable quote is ambiguous, never proof that the melt failed.
    const quote = await wallet.checkMeltQuoteBolt11(pending.quoteId);
    if (quote.state === 'PAID') {
      for (const signature of quote.change || []) await wallet.keyChain.ensureKeysetKeys(signature.id);
      const outputData = pending.meltOutputs.map(output => cashuts.OutputData.deserialize(output));
      const change = wallet.createMeltChangeProofs(outputData, quote.change || []);
      await _replaceProofs([], change, pending.mint, { deleteKeys: ['pendingWithdraw', 'withdrawQuote:' + pending.quoteId] });
      return null;
    }
    if (quote.state !== 'UNPAID') return null;
  }
  const token = (pending.localCommit ? pending.token : pending.recoveryToken) || pending.token;
  if (!token) return null;
  const decoded = cashuts.getDecodedToken(token, wallet.keyChain.getKeysets().map(keyset => keyset.id));
  const state = await wallet.groupProofsByState(decoded.proofs);
  if (state.pending.length) return null;
  if (state.spent.length === decoded.proofs.length) {
    await _setMeta('pendingWithdraw', null);
    return null;
  }
  return state.spent.length ? _encodeRecoveryToken(cashuts, pending.mint, state.unspent) : token;
}

export async function clearPendingWithdraw() {
  return _withWalletLock(async () => {
    if (!await _getMeta('pendingWithdraw')) return;
    await _recoverPendingWithdrawUnlocked();
    if (await _getMeta('pendingWithdraw')) throw new Error('The outgoing token is still unspent or pending. Keep it until delivered or recovered.');
  });
}

/** Persist a recoverable Cashu token before attempting risky refund/import flows. */
export async function savePendingWithdrawToken(token, source = 'manual') {
  return _withWalletLock(async () => {
    if (!token) return false;
    if (await _getMeta('pendingWithdraw')) return false;
    await _setMeta('pendingWithdraw', JSON.stringify({ quoteId: null, token, source,
      mint: _extractTokenMintUrl(await _cashuLib(), token), savedAt: Date.now() }));
    return true;
  });
}

/** Create a melt quote for paying a Lightning invoice.
 *  Returns { quote, amount, fee_reserve, state } */
export async function createWithdrawQuote(bolt11Invoice) {
  const invoice = validateLightningInvoice(bolt11Invoice);
  return _withWalletLock(async () => {
    const mintUrl = await getMintUrl();
    const wallet = await _getWallet(mintUrl);
    const quote = await wallet.createMeltQuoteBolt11(invoice.invoice);
    const quoteAmount = _amountToNumber(quote.amount);
    const feeReserve = _amountToNumber(quote.fee_reserve);
    if (quoteAmount * 1000 !== invoice.msats || !Number.isSafeInteger(feeReserve) || feeReserve < 0) throw new Error('Invalid withdrawal quote amount');
    await _setMeta('withdrawQuote:' + quote.quote, { ...invoice, mint: mintUrl, amount: quoteAmount, feeReserve });
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
    if (await _getMeta('pendingWithdraw')) await _recoverPendingWithdrawUnlocked();
    if (await _getMeta('pendingWithdraw')) throw new Error('Recover the previous pending withdrawal first');
    const wallet = await _getWallet(mintUrl);
    if (typeof wallet.prepareMelt !== 'function' || !cashuts.OutputData) throw new Error('Cashu runtime must support durable melting');
    const approved = await _getMeta('withdrawQuote:' + quoteId);
    if (!approved || approved.mint !== mintUrl) throw new Error('Withdrawal quote is not approved for this mint');
    validateLightningInvoice(approved.invoice);
    const quote = await wallet.checkMeltQuoteBolt11(quoteId);
    if (quote.state !== 'UNPAID' || _amountToNumber(quote.amount) !== approved.amount || _amountToNumber(quote.fee_reserve) !== approved.feeReserve || (quote.request && quote.request.toLowerCase() !== approved.invoice)) throw new Error('Withdrawal quote changed or is no longer unpaid');
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
    const { keep, send } = await wallet.completeSwap(prepared.preview);

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

    const meltPreview = await wallet.prepareMelt('bolt11', quote, send);
    pendingWithdraw.meltOutputs = (meltPreview.outputData || []).map(output => cashuts.OutputData.serialize(output));
    await _setMeta('pendingWithdraw', JSON.stringify({ ...pendingWithdraw, localCommit: true }));
    const result = await wallet.completeMelt(meltPreview);

    if (String(result.quote?.state || '').toUpperCase() !== 'PAID') {
      throw new Error('Lightning payment is not confirmed paid. Its recovery record has been retained.');
    }
    if (result.change && result.change.length) {
      await _saveProofs(result.change, mintUrl);
    }

    await _setMeta('pendingWithdraw', null);
    await _deleteMeta('withdrawQuote:' + quoteId);

    const balance = _sumProofsAsNumber(cashuts, await _pruneSpentProofs(false, mintUrl));
    return { paid: true, change: balance };
  });
}

/** Withdraw to a Lightning address (user@domain).
 *  Auto-reduces amount if balance can't cover fee reserve.
 *  Returns { paid, amount, balance } */
export async function withdrawToAddress(address, amountSats) {
  positiveSats(amountSats);
  const balance = await getWalletBalance();
  // Try full amount first, reduce if fee reserve exceeds balance
  let tryAmount = amountSats;
  for (let attempt = 0; attempt < 3; attempt++) {
    const invoice = await _lnAddressToInvoice(address, tryAmount);
    if (!invoice) throw new Error('Amount out of range for this Lightning address');
    const quote = await createWithdrawQuote(invoice);
    if (quote.amount !== tryAmount) throw new Error('Invoice does not match the requested withdrawal amount');
    const needed = quote.amount + quote.fee_reserve;
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
  return _withWalletLock(() => _withFeeLock(async () => {
    const cashuts = await _cashuLib();
    const mintUrl = await getMintUrl();
    await _reconcileFeeMelt(mintUrl);
    const total = _sumProofsAsNumber(cashuts, await _getAllFeeProofs(mintUrl));
    if (!total) return { melted: 0, remaining: 0 };
    try {
      let amount = Math.max(1, total - 5);
      const wallet = await _getWallet(mintUrl);
      for (let attempt = 0; attempt < 3; attempt++) {
        const invoice = await _lnAddressToInvoice(FEE_LN_ADDRESS, amount);
        if (!invoice) return { melted: 0, remaining: total, reason: 'below minimum' };
        const quote = await wallet.createMeltQuoteBolt11(invoice);
        const inputs = await _getAllFeeProofs(mintUrl);
        const fees = _amountToNumber(wallet.getFeesForProofs?.(inputs) || 0);
        const needed = _amountToNumber(quote.amount) + _amountToNumber(quote.fee_reserve) + fees;
        if (needed > total) { amount -= needed - total; if (amount < 1) break; continue; }
        await _meltFeePool(wallet, cashuts, mintUrl, inputs, quote);
        return { melted: amount, remaining: await getFeeBalance() };
      }
      return { melted: 0, remaining: total, reason: 'insufficient routing fee reserve' };
    } catch (error) { return { melted: 0, remaining: total, reason: getErrorMessage(error), error: true }; }
  }));
}

/** Send sats from wallet as a Cashu token string.
 *  Returns { token, amount, remaining } */
export async function sendAsToken(amountSats) {
  positiveSats(amountSats);
  return _withWalletLock(async () => {
    await _ensureNoPendingSwap();
    const cashuts = await _cashuLib();
    const mintUrl = await getMintUrl();
    if (await _getMeta('pendingWithdraw')) await _recoverPendingWithdrawUnlocked();
    if (await _getMeta('pendingWithdraw')) throw new Error('Deliver or recover the previous outgoing token first');
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
    const { keep, send } = await wallet.completeSwap(prepared.preview);
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
  positiveSats(amountSats);
  const parts = String(address).trim().split('@');
  if (parts.length !== 2 || !/^[a-zA-Z0-9._+-]+$/.test(parts[0]) || !/^[a-zA-Z0-9.-]+$/.test(parts[1])) throw new Error('Invalid Lightning address');
  const [user, domain] = parts;
  const url = canonicalRoutstrUrl('https://' + domain) + '/.well-known/lnurlp/' + encodeURIComponent(user);
  const request = target => fetch(target, { redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
  const res = await request(url);
  if (!res.ok) throw new Error('Lightning address lookup failed');
  const lnurl = await res.json();
  if (lnurl.status === 'ERROR' || lnurl.tag !== 'payRequest' || typeof lnurl.metadata !== 'string') throw new Error('Invalid LNURL payment response');
  const callback = new URL(lnurl.callback);
  canonicalRoutstrUrl(callback.origin);
  if (callback.username || callback.password || callback.hash) throw new Error('Invalid LNURL callback');
  if (!Number.isSafeInteger(lnurl.minSendable) || !Number.isSafeInteger(lnurl.maxSendable) || lnurl.minSendable < 1 || lnurl.maxSendable < lnurl.minSendable) throw new Error('Invalid LNURL payment limits');
  const amountMsats = amountSats * 1000;
  if (!Number.isSafeInteger(amountMsats)) throw new Error('Amount is too large');
  if (amountMsats < lnurl.minSendable || amountMsats > lnurl.maxSendable) return null;
  callback.searchParams.set('amount', String(amountMsats));
  const cbRes = await request(callback.href);
  if (!cbRes.ok) throw new Error('Invoice request failed');
  const cbData = await cbRes.json();
  if (cbData.status === 'ERROR') throw new Error('Lightning address refused the invoice request');
  return validateLightningInvoice(cbData.pr, amountSats, lnurl.metadata).invoice;
}

/** Recover fee melts before any reuse of the fee pool. */
async function _reconcileFeeMelt(mintUrl) {
  const record = await _getMeta('pendingFeeMelt');
  if (!record) return;
  if (record.mint !== mintUrl) throw new Error('Recover fees at their original mint first');
  const wallet = await _getWallet(mintUrl);
  const cashuts = await _cashuLib();
  const quote = await wallet.checkMeltQuoteBolt11(record.quoteId);
  if (quote.state === 'PAID') {
    for (const signature of quote.change || []) await wallet.keyChain.ensureKeysetKeys(signature.id);
    const outputs = record.outputs.map(output => cashuts.OutputData.deserialize(output));
    const change = wallet.createMeltChangeProofs(outputs, quote.change || []);
    await _replaceFeeProofs(record.inputs, change, mintUrl, ['pendingFeeMelt']);
    return;
  }
  if (quote.state === 'UNPAID') {
    const state = await wallet.groupProofsByState(record.inputs);
    if (state.unspent.length === record.inputs.length && !state.pending.length) {
      await _deleteMeta('pendingFeeMelt');
      return;
    }
  }
  throw new Error('Fee payment remains unconfirmed; proofs and recovery outputs are retained');
}
async function _meltFeePool(wallet, cashuts, mintUrl, inputs, quote) {
  validateLightningInvoice(quote.request, _amountToNumber(quote.amount));
  if (!wallet.prepareMelt || !cashuts.OutputData) throw new Error('Durable fee melts are unavailable');
  const preview = await wallet.prepareMelt('bolt11', quote, inputs);
  await _setMeta('pendingFeeMelt', {
    mint: mintUrl, quoteId: quote.quote,
    inputs: inputs.map(proof => ({ ...proof, amount: _amountToNumber(proof.amount) })),
    outputs: preview.outputData.map(output => cashuts.OutputData.serialize(output)),
  });
  const result = await wallet.completeMelt(preview);
  if (result.quote?.state !== 'PAID') throw new Error('Fee payment is not confirmed paid');
  await _replaceFeeProofs(inputs, result.change || [], mintUrl, ['pendingFeeMelt']);
}

/** Persist first; background remittance never owns the only copy of fee proofs. */
let _autoMeltConsecutiveFailures = 0;
function _recordAutoMeltFailure() {
  _autoMeltConsecutiveFailures++;
  if (_autoMeltConsecutiveFailures === 3 && typeof window !== 'undefined') {
    /** @type {any} */ (window).showNotification?.('Cashu fee payments are repeatedly unconfirmed. Check Settings → AI → Routstr for recovery.', 'warning', 7000);
  }
}
export async function _autoMeltFees(feeProofs, operationMint) {
  void _withWalletLock(() => _withFeeLock(async () => {
    const mintUrl = operationMint || await getMintUrl();
    await _saveFeeProofs(feeProofs, mintUrl);
    const cashuts = await _cashuLib();
    return _sumProofsAsNumber(cashuts, await _getAllFeeProofs(mintUrl)) >= FEE_MELT_MIN_SATS;
  })).then(ready => ready ? retryFeeAutoMelt() : null).then(result => {
    if (result?.error) _recordAutoMeltFailure();
    else if (result?.melted > 0) _autoMeltConsecutiveFailures = 0;
  }).catch(_recordAutoMeltFailure);
}
export async function getFeeBalance() {
  return _sumProofsAsNumber(await _cashuLib(), await _getAllFeeProofs());
}
export async function redeemFees(bolt11Invoice) {
  const invoice = validateLightningInvoice(bolt11Invoice);
  return _withWalletLock(() => _withFeeLock(async () => {
    const mintUrl = await getMintUrl();
    await _reconcileFeeMelt(mintUrl);
    const cashuts = await _cashuLib();
    const inputs = await _getAllFeeProofs(mintUrl);
    if (!inputs.length) throw new Error('No fee proofs to redeem');
    const wallet = await _getWallet(mintUrl);
    const quote = await wallet.createMeltQuoteBolt11(invoice.invoice);
    if (_amountToNumber(quote.amount) * 1000 !== invoice.msats) throw new Error('Fee invoice amount mismatch');
    await _meltFeePool(wallet, cashuts, mintUrl, inputs, quote);
    return { paid: true, amount: invoice.msats / 1000 };
  }));
}
export function depositTokenToNode(nodeUrl, token) {
  return _withWalletLock(() => depositExternalTokenToNode(nodeUrl, token));
}
export function refundNodeToToken(nodeUrl) {
  return _withWalletLock(async () => { await _ensureNoPendingSwap(); return requestNodeRefund(nodeUrl); });
}
export function finishNodeRefund(token) {
  return _withWalletLock(() => completeNodeRefund(token));
}
export function getPendingNodeRefund() { return _getMeta('pendingNodeRefund'); }
