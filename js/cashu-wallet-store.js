// @ts-check
// cashu-wallet-store.js — Cashu proof, recovery journal, counter, and seed persistence

import { getErrorMessage } from './caught-error.js';
import { isDebugMode } from './utils.js';
import { isValidExternalUrl } from './url-safety.js';

export const DEFAULT_MINT = 'https://mint.minibits.cash/Bitcoin';
export const PENDING_QUOTE_PREFIX = 'pendingQuote:';
export const PENDING_SWAP_KEY = 'pendingSwap';

const DB_NAME = 'getbased-cashu';
const DB_VERSION = 2;
const STORE_PROOFS = 'proofs';
const STORE_META = 'meta';
const STORE_FEES = 'fee-proofs';
const PROOF_CHECK_COOLDOWN = 60_000;
const MNEMONIC_KEY = 'labcharts-cashu-wallet-mnemonic';

const storeRuntime = /** @type {any} */ ({});
function rejectUnconfiguredCryptoDependency() {
  throw new Error('Cashu wallet storage encryption is not configured.');
}

const cashuWalletStoreCryptoDeps = /** @type {any} */ ({
  decryptObject: rejectUnconfiguredCryptoDependency,
  encryptedSetItem: rejectUnconfiguredCryptoDependency,
  encryptedGetItem: rejectUnconfiguredCryptoDependency,
  encryptObject: rejectUnconfiguredCryptoDependency,
  getEncryptionEnabled: rejectUnconfiguredCryptoDependency,
  isEncryptedObject: rejectUnconfiguredCryptoDependency,
});
let _db = null;
let _indexedDBFactory = null;
let _legacyProofsMigrated = false;
let _lastProofCheck = 0;

function _sessionLockedError() {
  const error = new Error('Cashu wallet storage is encrypted; unlock with your passphrase first.');
  /** @type {Error & { code?: string }} */ (error).code = 'session-locked';
  return error;
}

async function _digestStorageKey(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value))));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function _proofStorageKeys(secret) {
  return [String(secret), `enc:v1:${await _digestStorageKey(secret)}`];
}

async function _encryptWalletPayload(value) {
  const envelope = await cashuWalletStoreCryptoDeps.encryptObject(value);
  if (!envelope) throw _sessionLockedError();
  return envelope;
}

async function _proofForStorage(proof, mintUrl, mode = cashuWalletStoreCryptoDeps.getEncryptionEnabled() ? 'encrypted' : 'plain') {
  const normalized = _normalizeProofForStorage(proof, mintUrl);
  if (mode === 'plain') return normalized;
  const [, storageKey] = await _proofStorageKeys(normalized.secret);
  return { secret: storageKey, _payload: await _encryptWalletPayload(normalized) };
}

async function _proofFromStorage(row) {
  if (!row?._payload) return row;
  if (!cashuWalletStoreCryptoDeps.isEncryptedObject(row._payload)) throw new Error('Encrypted Cashu proof has an invalid envelope.');
  const proof = await cashuWalletStoreCryptoDeps.decryptObject(row._payload).catch(() => null);
  if (!proof) throw _sessionLockedError();
  return proof;
}

async function _metaForStorage(key, value, mode = cashuWalletStoreCryptoDeps.getEncryptionEnabled() ? 'encrypted' : 'plain') {
  if (mode === 'plain' || String(key).startsWith('counter:')) return { key, value };
  return { key, _payload: await _encryptWalletPayload({ value }) };
}

async function _metaFromStorage(row) {
  if (!row?._payload) return row?.value ?? null;
  if (!cashuWalletStoreCryptoDeps.isEncryptedObject(row._payload)) throw new Error('Encrypted Cashu metadata has an invalid envelope.');
  const payload = await cashuWalletStoreCryptoDeps.decryptObject(row._payload).catch(() => null);
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'value')) throw _sessionLockedError();
  return payload.value;
}

async function _getAllRaw(storeName) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export function configureCashuWalletStore(runtime) {
  Object.assign(storeRuntime, runtime);
}

export function configureCashuWalletStoreCryptoDeps(deps = {}) {
  const previous = { ...cashuWalletStoreCryptoDeps };
  for (const dependency of Object.keys(cashuWalletStoreCryptoDeps)) {
    if (!Object.hasOwn(deps, dependency)) continue;
    cashuWalletStoreCryptoDeps[dependency] = typeof deps[dependency] === 'function'
      ? deps[dependency]
      : rejectUnconfiguredCryptoDependency;
  }
  return previous;
}

export function _amountToNumber(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value) || 0;
  if (typeof value.toNumber === 'function') return value.toNumber();
  if (typeof value.toNumberUnsafe === 'function') return value.toNumberUnsafe();
  if (typeof value.toBigInt === 'function') return Number(value.toBigInt());
  return Number(value) || 0;
}

export function _normalizeMintUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function _normalizeProofForStorage(proof, mintUrl) {
  return { ...proof, amount: _amountToNumber(proof.amount), _mint: _normalizeMintUrl(mintUrl) };
}

function _sumProofsAsNumber(cashuts, proofs) {
  return storeRuntime.sumProofsAsNumber(cashuts, proofs);
}

export function _openDB() {
  if (_db && _indexedDBFactory === indexedDB) return Promise.resolve(_db);
  if (_db) {
    try { _db.close(); } catch {}
    _db = null;
    _legacyProofsMigrated = false;
    _lastProofCheck = 0;
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function() {
      const db = req.result;
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
    req.onsuccess = function() {
      _db = req.result;
      _indexedDBFactory = indexedDB;
      _migrateFeeProofs().catch(() => {});
      resolve(_db);
    };
    req.onerror = function() { reject(req.error); };
  });
}

async function _migrateUntaggedProofs() {
  if (_legacyProofsMigrated) return;
  const proofs = await Promise.all((await _getAllRaw(STORE_PROOFS)).map(_proofFromStorage));
  const untagged = proofs.filter(proof => !proof._mint);
  if (untagged.length) await _saveProofs(untagged, DEFAULT_MINT);
  _legacyProofsMigrated = true;
}

export async function _getAllProofs(forMint) {
  await _migrateUntaggedProofs();
  const mintUrl = _normalizeMintUrl(forMint || await storeRuntime.getMintUrl());
  const proofs = await Promise.all((await _getAllRaw(STORE_PROOFS)).map(_proofFromStorage));
  return proofs.filter(proof => _normalizeMintUrl(proof._mint) === mintUrl);
}

export async function _saveProofs(proofs, forMint) {
  if (!proofs.length) return;
  const mintUrl = _normalizeMintUrl(forMint || await storeRuntime.getMintUrl());
  const rows = await Promise.all(proofs.map(proof => _proofForStorage(proof, mintUrl)));
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROOFS, 'readwrite');
    const store = tx.objectStore(STORE_PROOFS);
    for (const row of rows) store.put(row);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

async function _deleteProofs(proofs) {
  if (!proofs.length) return;
  const keys = (await Promise.all(proofs.map(proof => _proofStorageKeys(proof.secret)))).flat();
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROOFS, 'readwrite');
    const store = tx.objectStore(STORE_PROOFS);
    for (const key of keys) store.delete(key);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function _replaceProofs(previousProofs, nextProofs, forMint) {
  const mintUrl = _normalizeMintUrl(forMint || await storeRuntime.getMintUrl());
  const previousKeys = (await Promise.all((previousProofs || []).map(proof => _proofStorageKeys(proof.secret)))).flat();
  const nextRows = await Promise.all((nextProofs || []).map(proof => _proofForStorage(proof, mintUrl)));
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_PROOFS, 'readwrite');
    const store = tx.objectStore(STORE_PROOFS);
    try {
      for (const key of previousKeys) store.delete(key);
      for (const row of nextRows) store.put(row);
    } catch (error) {
      try { tx.abort(); } catch {}
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Cashu proof update aborted'));
  });
}

export async function _pruneSpentProofs(force = false, forMint) {
  const now = Date.now();
  const mintUrl = _normalizeMintUrl(forMint || await storeRuntime.getMintUrl());
  const proofs = await _getAllProofs(mintUrl);
  if (!proofs.length) return proofs;
  if (await _getMeta(PENDING_SWAP_KEY)) return proofs;
  if (!force && (now - _lastProofCheck) < PROOF_CHECK_COOLDOWN) return proofs;
  try {
    const wallet = await storeRuntime.getWallet(mintUrl);
    const { unspent, spent, pending } = await wallet.groupProofsByState(proofs);
    if (spent.length > 0) {
      await _deleteProofs(spent);
      if (isDebugMode()) console.log(`[cashu-wallet] Pruned ${spent.length} spent proofs` + (pending.length ? `, ${pending.length} pending (kept)` : ''));
    }
    _lastProofCheck = Date.now();
    return [...unspent, ...pending];
  } catch (error) {
    if (isDebugMode()) console.warn('[cashu-wallet] Proof state check failed:', getErrorMessage(error));
    return proofs;
  }
}

export async function _clearAllProofs() {
  const mintUrl = _normalizeMintUrl(await storeRuntime.getMintUrl());
  const proofs = await Promise.all((await _getAllRaw(STORE_PROOFS)).map(_proofFromStorage));
  return _deleteProofs(proofs.filter(proof => !proof._mint || _normalizeMintUrl(proof._mint) === mintUrl));
}

export async function _getMeta(key) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get(key);
    req.onsuccess = () => {
      Promise.resolve(_metaFromStorage(req.result)).then(resolve, reject);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function _setMeta(key, value) {
  const row = await _metaForStorage(key, value);
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put(row);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function _deleteMeta(key) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).delete(key);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function _getMetaEntries(prefix) {
  const rows = (await _getAllRaw(STORE_META)).filter(item => typeof item.key === 'string' && item.key.startsWith(prefix));
  return Promise.all(rows.map(async row => ({ key: row.key, value: await _metaFromStorage(row) })));
}

function _serializePreparedOutputs(cashuts, preview) {
  const outputData = [...(preview.sendOutputs || []), ...(preview.keepOutputs || [])];
  return outputData.map(output => cashuts.OutputData.serialize(output));
}

export async function _prepareDurableSwap(wallet, cashuts, operation, mintUrl, builder, localInputs) {
  if (!wallet.ops || !cashuts.OutputData || typeof builder?.prepare !== 'function') return null;
  if (await _getMeta(PENDING_SWAP_KEY)) throw new Error('A previous Cashu operation needs recovery before another can start');
  const preview = await builder.prepare();
  const record = {
    version: 1,
    operation,
    mint: mintUrl,
    createdAt: Date.now(),
    localInputs: (localInputs || []).map(proof => _normalizeProofForStorage(proof, mintUrl)),
    outputs: _serializePreparedOutputs(cashuts, preview),
  };
  await _setMeta(PENDING_SWAP_KEY, record);
  return { preview, record };
}

export async function _prepareDurableMint(wallet, cashuts, mintUrl, amount, quote, pendingKey) {
  if (typeof wallet.prepareMint !== 'function' || !cashuts.OutputData) return null;
  if (await _getMeta(PENDING_SWAP_KEY)) throw new Error('A previous Cashu operation needs recovery before another can start');
  const preview = await wallet.prepareMint('bolt11', amount, quote);
  const record = {
    version: 1,
    operation: 'mint',
    mint: mintUrl,
    quoteId: quote.quote,
    pendingKey,
    keysetId: preview.keysetId,
    createdAt: Date.now(),
    localInputs: [],
    outputs: (preview.outputData || []).map(output => cashuts.OutputData.serialize(output)),
  };
  await _setMeta(PENDING_SWAP_KEY, record);
  return { preview, record };
}

export function _resumeDurableMint(cashuts, record) {
  const outputData = record.outputs.map(output => cashuts.OutputData.deserialize(output));
  return {
    method: 'bolt11',
    payload: { quote: record.quoteId, outputs: outputData.map(output => output.blindedMessage) },
    outputData,
    keysetId: record.keysetId,
    quote: { quote: record.quoteId },
  };
}

export async function _recoverPendingSwapUnlocked() {
  const record = await _getMeta(PENDING_SWAP_KEY);
  if (!record) return { recovered: 0, pending: false };
  const mintUrl = _normalizeMintUrl(record.mint);
  if (!isValidExternalUrl(mintUrl) || !Array.isArray(record.outputs)) {
    throw new Error('Cashu recovery journal is malformed; local proofs were left untouched');
  }
  const cashuts = await storeRuntime.cashuLib();
  if (!cashuts.OutputData || !cashuts.Mint) throw new Error('Cashu runtime cannot restore the pending operation');
  const outputData = record.outputs.map(output => cashuts.OutputData.deserialize(output));
  const wallet = await storeRuntime.getWallet(mintUrl);
  const mint = new cashuts.Mint(mintUrl);
  const response = await mint.restore({ outputs: outputData.map(output => output.blindedMessage) });
  const signaturesByOutput = new Map();
  for (let index = 0; index < (response.outputs || []).length; index++) {
    signaturesByOutput.set(response.outputs[index].B_, response.signatures?.[index]);
  }
  const recoveredProofs = [];
  for (const output of outputData) {
    const signature = signaturesByOutput.get(output.blindedMessage.B_);
    if (!signature) continue;
    const keyset = await wallet.keyChain.ensureKeysetKeys(signature.id);
    recoveredProofs.push(output.toProof(signature, keyset));
  }
  if (!recoveredProofs.length) {
    const inputs = record.localInputs || [];
    if (inputs.length) {
      const { unspent, pending } = await wallet.groupProofsByState(inputs);
      if (unspent.length === inputs.length && !pending.length) {
        await _deleteMeta(PENDING_SWAP_KEY);
        return { recovered: 0, pending: false, notSubmitted: true };
      }
    }
    throw new Error('Cashu operation is still pending at the mint; local proofs were left untouched');
  }
  await _replaceProofs(record.localInputs || [], recoveredProofs, mintUrl);
  await _deleteMeta(PENDING_SWAP_KEY);
  if (record.operation === 'mint' && record.pendingKey) await _deleteMeta(record.pendingKey);
  if (record.operation === 'deposit') await _setMeta('pendingDeposit', null);
  if (record.operation === 'withdraw' || record.operation === 'send') await _setMeta('pendingWithdraw', null);
  return { recovered: _sumProofsAsNumber(cashuts, recoveredProofs), pending: false };
}

export async function _ensureNoPendingSwap() {
  if (!await _getMeta(PENDING_SWAP_KEY)) return;
  await _recoverPendingSwapUnlocked();
  if (await _getMeta(PENDING_SWAP_KEY)) throw new Error('A previous Cashu operation still needs recovery');
}

export function _isTerminalMintQuoteState(state) {
  return String(state || '').toUpperCase() === 'EXPIRED';
}

export async function _pendingQuoteKey(mintUrl, quoteId) {
  return PENDING_QUOTE_PREFIX + 'v2:' + await _digestStorageKey(`${_normalizeMintUrl(mintUrl)}\n${quoteId}`);
}

export function _legacyNamespacedPendingQuoteKey(mintUrl, quoteId) {
  return PENDING_QUOTE_PREFIX + encodeURIComponent(_normalizeMintUrl(mintUrl)) + ':' + quoteId;
}

export function _pendingQuoteDetails(entry, fallbackMint) {
  const value = entry?.value;
  if (value && typeof value === 'object') {
    return {
      quote: String(value.quote || ''),
      amount: _amountToNumber(value.amount),
      mint: _normalizeMintUrl(value.mint || fallbackMint),
    };
  }
  return {
    quote: String(entry?.key || '').slice(PENDING_QUOTE_PREFIX.length),
    amount: _amountToNumber(value),
    mint: _normalizeMintUrl(fallbackMint),
  };
}

export async function _saveFeeProofs(proofs, forMint) {
  if (!proofs.length) return;
  const mintUrl = _normalizeMintUrl(forMint || await storeRuntime.getMintUrl());
  const rows = await Promise.all(proofs.map(proof => _proofForStorage(proof, mintUrl)));
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FEES, 'readwrite');
    const store = tx.objectStore(STORE_FEES);
    for (const row of rows) store.put(row);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function _replaceFeeProofs(previousProofs, nextProofs, forMint) {
  const mintUrl = _normalizeMintUrl(forMint || await storeRuntime.getMintUrl());
  const previousKeys = (await Promise.all((previousProofs || []).map(proof => _proofStorageKeys(proof.secret)))).flat();
  const nextRows = await Promise.all((nextProofs || []).map(proof => _proofForStorage(proof, mintUrl)));
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FEES, 'readwrite');
    const store = tx.objectStore(STORE_FEES);
    try {
      for (const key of previousKeys) store.delete(key);
      for (const row of nextRows) store.put(row);
    } catch (error) {
      try { tx.abort(); } catch {}
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Cashu fee proof update aborted'));
  });
}

export async function _getAllFeeProofs(forMint) {
  const mintUrl = _normalizeMintUrl(forMint || await storeRuntime.getMintUrl());
  const proofs = await Promise.all((await _getAllRaw(STORE_FEES)).map(_proofFromStorage));
  return proofs.filter(proof => _normalizeMintUrl(proof._mint || DEFAULT_MINT) === mintUrl);
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

export async function _loadMnemonic() {
  const encrypted = await cashuWalletStoreCryptoDeps.encryptedGetItem(MNEMONIC_KEY);
  if (encrypted) return encrypted;
  const legacy = await _getMeta('walletMnemonic');
  if (legacy) {
    await cashuWalletStoreCryptoDeps.encryptedSetItem(MNEMONIC_KEY, legacy);
    await _setMeta('walletMnemonic', null);
    return legacy;
  }
  return null;
}

export async function _saveMnemonic(mnemonic) {
  await cashuWalletStoreCryptoDeps.encryptedSetItem(MNEMONIC_KEY, mnemonic);
}

export function _createCounterSource(namespace = '', migrateLegacy = true) {
  function _readOrUpdate(keysetId, update) {
    return _openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_META, update ? 'readwrite' : 'readonly');
      const store = tx.objectStore(STORE_META);
      const legacyKey = 'counter:' + keysetId;
      const key = namespace ? `counter:${namespace}:${keysetId}` : legacyKey;
      const req = store.get(key);
      let result;
      req.onsuccess = () => {
        if (req.result || key === legacyKey || !migrateLegacy) {
          const current = Number(req.result?.value) || 0;
          result = update ? update(current) : current;
          if (update) store.put({ key, value: result });
          return;
        }
        const legacyReq = store.get(legacyKey);
        legacyReq.onsuccess = () => {
          const current = Number(legacyReq.result?.value) || 0;
          result = update ? update(current) : current;
          if (update) store.put({ key, value: result });
        };
        legacyReq.onerror = () => reject(legacyReq.error);
      };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Cashu counter update aborted'));
    }));
  }

  return {
    async reserve(keysetId, count) {
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('reserve called with invalid count');
      if (count === 0) return { start: await _readOrUpdate(keysetId, null), count: 0 };
      let start = 0;
      await _readOrUpdate(keysetId, current => {
        start = current;
        return current + count;
      });
      return { start, count };
    },
    async advanceToAtLeast(keysetId, value) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('advanceToAtLeast called with invalid value');
      await _readOrUpdate(keysetId, current => Math.max(current, value));
    }
  };
}

export async function _counterNamespaceForSeed(seed) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', seed));
  return Array.from(digest.slice(0, 8), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Rewrap bearer proofs and recovery metadata when app encryption changes.
 * Counter values stay numeric so their cross-tab IDB increment remains atomic;
 * they contain no bearer secret or credential. */
export async function migrateCashuWalletStorage(mode) {
  if (mode !== 'encrypted' && mode !== 'plain') throw new Error(`Unsupported Cashu migration mode: ${mode}`);
  const [proofRows, metaRows, feeRows] = await Promise.all([
    _getAllRaw(STORE_PROOFS),
    _getAllRaw(STORE_META),
    _getAllRaw(STORE_FEES),
  ]);
  const proofChanges = [];
  const feeChanges = [];
  for (const [rows, changes] of [[proofRows, proofChanges], [feeRows, feeChanges]]) {
    for (const row of rows) {
      const wrapped = !!row?._payload;
      if ((mode === 'encrypted') === wrapped) continue;
      const proof = await _proofFromStorage(row);
      changes.push({ previousKey: row.secret, next: await _proofForStorage(proof, proof._mint || DEFAULT_MINT, mode) });
    }
  }
  const metaChanges = [];
  for (const row of metaRows) {
    if (String(row?.key || '').startsWith('counter:')) continue;
    const wrapped = !!row?._payload;
    const legacyQuoteKey = mode === 'encrypted'
      && String(row?.key || '').startsWith(PENDING_QUOTE_PREFIX)
      && !String(row.key).startsWith(PENDING_QUOTE_PREFIX + 'v2:');
    if ((mode === 'encrypted') === wrapped && !legacyQuoteKey) continue;
    const value = await _metaFromStorage(row);
    let key = row.key;
    if (legacyQuoteKey) {
      const details = _pendingQuoteDetails({ key, value }, DEFAULT_MINT);
      if (details.quote) key = await _pendingQuoteKey(details.mint, details.quote);
    }
    metaChanges.push({ previousKey: row.key, next: await _metaForStorage(key, value, mode) });
  }
  if (!proofChanges.length && !metaChanges.length && !feeChanges.length) return 0;
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_PROOFS, STORE_META, STORE_FEES], 'readwrite');
    const apply = (storeName, changes) => {
      const store = tx.objectStore(storeName);
      for (const change of changes) {
        store.put(change.next);
        const nextKey = storeName === STORE_META ? change.next.key : change.next.secret;
        if (change.previousKey !== nextKey) store.delete(change.previousKey);
      }
    };
    try {
      apply(STORE_PROOFS, proofChanges);
      apply(STORE_META, metaChanges);
      apply(STORE_FEES, feeChanges);
    } catch (error) {
      try { tx.abort(); } catch {}
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(proofChanges.length + metaChanges.length + feeChanges.length);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Cashu encryption migration aborted'));
  });
}

export async function _destroyWalletDBStorage() {
  if (_db) {
    try { _db.close(); } catch {}
  }
  _db = null;
  _indexedDBFactory = null;
  _legacyProofsMigrated = false;
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(undefined);
    req.onerror = () => reject(req.error || new Error('Cashu wallet database deletion failed'));
    req.onblocked = () => reject(
      new Error('Cashu wallet deletion is blocked by another open Get Based tab.'),
    );
  });
}
