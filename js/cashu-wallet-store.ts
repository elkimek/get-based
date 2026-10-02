// cashu-wallet-store.ts — Cashu proof, recovery journal, counter, and seed persistence

import { getErrorMessage } from './caught-error.js';
import { isDebugMode } from './utils.js';
import { isValidExternalUrl } from './url-safety.js';

import type * as Cashu from '@cashu/cashu-ts';
import type {
  CashuStorageSdk, CashuWalletStoreCryptoDeps, CashuWalletStoreRuntime, DurableJournal, MintJournal,
  PreparedSwap, ProofCommit, RecoveryResult, StorageChange, StorageMode, StorageWallet, StorageSignatureVerifier, StoredMeta, StoredProof,
  SwapContext, SwapJournal, SwapOperation, WalletMintBalance, WalletProof, WalletStorageRows,
} from './cashu-wallet-storage-types.js';

export const DEFAULT_MINT = 'https://mint.minibits.cash/Bitcoin';
export const PENDING_QUOTE_PREFIX = 'pendingQuote:';
export const PENDING_SWAP_KEY = 'pendingSwap';
export const PENDING_RECEIVE_PREFIX = 'pendingReceive:';

const DB_NAME = 'getbased-cashu';
const DB_VERSION = 2;
const STORE_PROOFS = 'proofs';
const STORE_META = 'meta';
const STORE_FEES = 'fee-proofs';
const PROOF_CHECK_COOLDOWN = 60_000;
const MNEMONIC_KEY = 'labcharts-cashu-wallet-mnemonic';

const storeRuntime = {} as CashuWalletStoreRuntime;
function rejectUnconfiguredCryptoDependency(): never {
  throw new Error('Cashu wallet storage encryption is not configured.');
}

const cashuWalletStoreCryptoDeps: CashuWalletStoreCryptoDeps = {
  decryptObject: rejectUnconfiguredCryptoDependency,
  encryptedSetItem: rejectUnconfiguredCryptoDependency,
  encryptedGetItem: rejectUnconfiguredCryptoDependency,
  encryptObject: rejectUnconfiguredCryptoDependency,
  getEncryptionEnabled: rejectUnconfiguredCryptoDependency,
  isEncryptedObject: rejectUnconfiguredCryptoDependency,
};
let _db: IDBDatabase | null = null;
let _indexedDBFactory: IDBFactory | null = null;
let _legacyProofsMigrated = false;
const _lastProofChecks = new Map<string, number>();

function _sessionLockedError() {
  const error = new Error('Cashu wallet storage is encrypted; unlock with your passphrase first.');
  (error as Error & { code?: string }).code = 'session-locked';
  return error;
}

export async function _digestStorageKey(value: unknown) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value))));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

async function _proofStorageKeys(secret: string): Promise<[string, string]> {
  return [String(secret), `enc:v1:${await _digestStorageKey(secret)}`];
}

async function _encryptWalletPayload(value: unknown) {
  const envelope = await cashuWalletStoreCryptoDeps.encryptObject(value);
  if (!envelope) throw _sessionLockedError();
  return envelope;
}

async function _proofForStorage(proof: WalletProof, mintUrl: string, mode: StorageMode = cashuWalletStoreCryptoDeps.getEncryptionEnabled() ? 'encrypted' : 'plain') {
  const normalized = _normalizeProofForStorage(proof, mintUrl);
  if (mode === 'plain') return normalized;
  const [, storageKey] = await _proofStorageKeys(normalized.secret);
  return { secret: storageKey, _payload: await _encryptWalletPayload(normalized) };
}

async function _proofFromStorage(row: StoredProof): Promise<WalletProof> {
  if (!row?._payload) return row as WalletProof;
  if (!cashuWalletStoreCryptoDeps.isEncryptedObject(row._payload)) throw new Error('Encrypted Cashu proof has an invalid envelope.');
  const proof = await cashuWalletStoreCryptoDeps.decryptObject(row._payload).catch(() => null) as WalletProof | null;
  if (!proof) throw _sessionLockedError();
  return proof;
}

async function _metaForStorage(key: string, value: unknown, mode: StorageMode = cashuWalletStoreCryptoDeps.getEncryptionEnabled() ? 'encrypted' : 'plain') {
  if (mode === 'plain' || String(key).startsWith('counter:')) return { key, value };
  return { key, _payload: await _encryptWalletPayload({ value }) };
}

async function _metaFromStorage<Value = unknown>(row: StoredMeta | undefined): Promise<Value | null> {
  if (!row?._payload) return (row?.value ?? null) as Value | null;
  if (!cashuWalletStoreCryptoDeps.isEncryptedObject(row._payload)) throw new Error('Encrypted Cashu metadata has an invalid envelope.');
  const payload = await cashuWalletStoreCryptoDeps.decryptObject(row._payload).catch(() => null) as { value?: unknown } | null;
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'value')) throw _sessionLockedError();
  return payload.value as Value;
}

async function _getAllRaw<Store extends keyof WalletStorageRows>(storeName: Store): Promise<WalletStorageRows[Store][]> {
  const db = await _openDB();
  return new Promise<WalletStorageRows[Store][]>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export function configureCashuWalletStore(runtime: Partial<CashuWalletStoreRuntime>) {
  Object.assign(storeRuntime, runtime);
}

export function configureCashuWalletStoreCryptoDeps(deps: Partial<Record<keyof CashuWalletStoreCryptoDeps, unknown>> = {}) {
  const previous = { ...cashuWalletStoreCryptoDeps };
  for (const dependency of Object.keys(cashuWalletStoreCryptoDeps) as Array<keyof CashuWalletStoreCryptoDeps>) {
    if (!Object.hasOwn(deps, dependency)) continue;
    (cashuWalletStoreCryptoDeps as unknown as Record<string, CashuWalletStoreCryptoDeps[keyof CashuWalletStoreCryptoDeps]>)[dependency] = typeof deps[dependency] === 'function'
      ? deps[dependency] as CashuWalletStoreCryptoDeps[keyof CashuWalletStoreCryptoDeps]
      : rejectUnconfiguredCryptoDependency;
  }
  return previous;
}

export function _amountToNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') return Number(value) || 0;
  if (typeof (value as { toNumber?: () => number }).toNumber === 'function') return (value as { toNumber?: () => number }).toNumber!();
  if (typeof (value as { toNumberUnsafe?: () => number }).toNumberUnsafe === 'function') return (value as { toNumberUnsafe?: () => number }).toNumberUnsafe!();
  if (typeof (value as { toBigInt?: () => bigint }).toBigInt === 'function') return Number((value as { toBigInt?: () => bigint }).toBigInt!());
  return Number(value) || 0;
}

export function _normalizeMintUrl(url: unknown) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function _normalizeProofForStorage(proof: WalletProof, mintUrl: string) {
  return { ...proof, amount: _amountToNumber(proof.amount), _mint: _normalizeMintUrl(mintUrl) };
}

function _sumProofsAsNumber(cashuts: CashuStorageSdk, proofs: WalletProof[]) {
  return storeRuntime.sumProofsAsNumber(cashuts, proofs);
}

export function _openDB(): Promise<IDBDatabase> {
  if (_db && _indexedDBFactory === indexedDB) return Promise.resolve(_db);
  if (_db) {
    try { _db.close(); } catch {}
    _db = null;
    _legacyProofsMigrated = false;
    _lastProofChecks.clear();
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
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

export async function _getAllProofs(forMint?: string) {
  await _migrateUntaggedProofs();
  const mintUrl = _normalizeMintUrl(forMint || await storeRuntime.getMintUrl());
  const proofs = await Promise.all((await _getAllRaw(STORE_PROOFS)).map(_proofFromStorage));
  return proofs.filter(proof => _normalizeMintUrl(proof._mint) === mintUrl);
}

/** Local inventory; never contacts a mint or changes the selected wallet. */
export async function _getWalletMintInventory() {
  await _migrateUntaggedProofs();
  const current = await storeRuntime.getMintUrl();
  const saved = await _getMeta('walletMints');
  const mints = new Map<string, WalletMintBalance>();
  const add = (mint: unknown) => {
    mint = _normalizeMintUrl(mint);
    if (isValidExternalUrl(mint) && !mints.has(mint as string)) mints.set(mint as string, { mint, balance: 0, feeBalance: 0 } as WalletMintBalance);
    return mints.get(mint as string);
  };
  add(current);
  for (const mint of Array.isArray(saved) ? saved : []) add(mint);
  for (const [store, field] of [[STORE_PROOFS, 'balance'], [STORE_FEES, 'feeBalance']] as const) {
    for (const row of await _getAllRaw(store)) {
      const proof = await _proofFromStorage(row);
      const entry = add(proof._mint || DEFAULT_MINT);
      if (entry) entry[field] += _amountToNumber(proof.amount);
    }
  }
  for (const entry of await _getMetaEntries('pending')) {
    let record = entry.value;
    if (typeof record === 'string') { try { record = JSON.parse(record); } catch {} }
    add(entry.key.startsWith(PENDING_QUOTE_PREFIX) ? _pendingQuoteDetails(entry, current).mint : (record as { mint?: unknown } | null)?.mint);
  }
  return [...mints.values()].map(entry => ({ ...entry, active: entry.mint === current }));
}

function writeProofRows(db: IDBDatabase, storeName: 'proofs' | 'fee-proofs', rows: StoredProof[]) {
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    for (const row of rows) store.put(row);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function _saveProofs(proofs: WalletProof[], forMint?: string) {
  if (!proofs.length) return;
  const mintUrl = _normalizeMintUrl(forMint || await storeRuntime.getMintUrl());
  await _assertProofMintOwnership(proofs, mintUrl);
  const rows = await Promise.all(proofs.map(proof => _proofForStorage(proof, mintUrl)));
  const db = await _openDB();
  return writeProofRows(db, STORE_PROOFS, rows);
}

async function _assertProofMintOwnership(proofs: WalletProof[], mintUrl: string, store: 'proofs' | 'fee-proofs' = STORE_PROOFS) {
  if (!proofs.length) return;
  const secrets = new Set(proofs.map(proof => proof.secret));
  for (const row of await _getAllRaw(store)) {
    const existing = await _proofFromStorage(row);
    if (secrets.has(existing.secret) && _normalizeMintUrl(existing._mint || DEFAULT_MINT) !== mintUrl) {
      throw new Error('Proof conflicts with funds at another mint. Existing funds were preserved.');
    }
  }
}

async function _deleteProofs(proofs: WalletProof[]) {
  if (!proofs.length) return;
  const keys = (await Promise.all(proofs.map(proof => _proofStorageKeys(proof.secret)))).flat();
  const db = await _openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PROOFS, 'readwrite');
    const store = tx.objectStore(STORE_PROOFS);
    for (const key of keys) store.delete(key);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function _replaceProofs(previousProofs: WalletProof[], nextProofs: WalletProof[], forMint?: string, commit: ProofCommit = {}) {
  const mintUrl = _normalizeMintUrl(forMint || await storeRuntime.getMintUrl());
  await _assertProofMintOwnership([...(previousProofs || []), ...(nextProofs || [])], mintUrl);
  await _assertProofMintOwnership(commit.feeProofs || [], mintUrl, STORE_FEES);
  const previousKeys = (await Promise.all((previousProofs || []).map(proof => _proofStorageKeys(proof.secret)))).flat();
  const nextRows = await Promise.all((nextProofs || []).map(proof => _proofForStorage(proof, mintUrl)));
  const metaRows = await Promise.all(Object.entries(commit.meta || {}).map(([key, value]) => _metaForStorage(key, value)));
  const feeRows = await Promise.all((commit.feeProofs || []).map(proof => _proofForStorage(proof, mintUrl)));
  const db = await _openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_PROOFS, STORE_META, STORE_FEES], 'readwrite');
    const store = tx.objectStore(STORE_PROOFS);
    try {
      for (const key of previousKeys) store.delete(key);
      for (const row of nextRows) store.put(row);
      for (const row of feeRows) tx.objectStore(STORE_FEES).put(row);
      const meta = tx.objectStore(STORE_META);
      for (const key of commit.deleteKeys || []) meta.delete(key);
      for (const row of metaRows) meta.put(row);
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

export async function _pruneSpentProofs(force = false, forMint?: string) {
  const now = Date.now();
  const mintUrl = _normalizeMintUrl(forMint || await storeRuntime.getMintUrl());
  const proofs = await _getAllProofs(mintUrl);
  if (!proofs.length) return proofs;
  if (await _getMeta(PENDING_SWAP_KEY)) return proofs;
  const checkKey = 'proofCheckAt:' + mintUrl;
  if (!force && now - Math.max(_lastProofChecks.get(mintUrl) || 0, Number(await _getMeta(checkKey)) || 0) < PROOF_CHECK_COOLDOWN) return proofs;
  try {
    // Persist attempts, including failures, so other tabs cannot repeat them.
    await _setMeta(checkKey, now);
    const { unspent, spent, pending } = await _withMintRequest(mintUrl, async () => {
      const wallet = await storeRuntime.getWallet(mintUrl);
      return wallet.groupProofsByState(proofs);
    });
    if (spent.length > 0) {
      await _deleteProofs(spent);
      if (isDebugMode()) console.log(`[cashu-wallet] Pruned ${spent.length} spent proofs` + (pending.length ? `, ${pending.length} pending (kept)` : ''));
    }
    _lastProofChecks.set(mintUrl, Date.now());
    return [...unspent, ...pending];
  } catch (error) {
    if (isDebugMode()) console.warn('[cashu-wallet] Proof state check failed:', getErrorMessage(error));
    return proofs;
  }
}

/** Shared mint cooldown. Call while holding the wallet lock. */
export async function _withMintRequest<Result>(mint: string, request: () => Promise<Result>) {
  const key = 'mintRetryAt:' + _normalizeMintUrl(mint);
  const until = Number(await _getMeta(key)) || 0;
  if (until > Date.now()) {
    const error = Object.assign(new Error('The mint requested a pause. Retrying automatically.'), { status: 429, retryAfterMs: until - Date.now() });
    throw error;
  }
  try { return await request(); }
  catch (error) {
    const details = error as { status?: unknown; statusCode?: unknown; retryAfterMs?: unknown; name?: unknown } | null;
    const status = Number(details?.status ?? details?.statusCode);
    const retry = Number(details?.retryAfterMs);
    if (status === 429 || details?.name === 'RateLimitError' || (Number.isFinite(retry) && retry > 0)) {
      const wait = Math.max(60000, Number.isFinite(retry) ? retry : 0);
      await _setMeta(key, Math.max(until, Date.now() + wait));
      // Preserve the actual cooldown, including our conservative default.
      throw Object.assign(new Error(getErrorMessage(error)), { status: status || 429, retryAfterMs: wait });
    }
    throw error;
  }
}

export async function _clearAllProofs() {
  const mintUrl = _normalizeMintUrl(await storeRuntime.getMintUrl());
  const proofs = await Promise.all((await _getAllRaw(STORE_PROOFS)).map(_proofFromStorage));
  return _deleteProofs(proofs.filter(proof => !proof._mint || _normalizeMintUrl(proof._mint) === mintUrl));
}

export async function _getMeta<Value = unknown>(key: string): Promise<Value | null> {
  const db = await _openDB();
  return new Promise<Value | null>((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readonly');
    const req = tx.objectStore(STORE_META).get(key);
    req.onsuccess = () => {
      Promise.resolve(_metaFromStorage<Value>(req.result)).then(resolve, reject);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function _setMeta(key: string, value: unknown) {
  const row = await _metaForStorage(key, value);
  const db = await _openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).put(row);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function _deleteMeta(key: string) {
  const db = await _openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_META, 'readwrite');
    tx.objectStore(STORE_META).delete(key);
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function _getMetaEntries<Value = unknown>(prefix: string) {
  const rows = (await _getAllRaw(STORE_META)).filter(item => typeof item.key === 'string' && item.key.startsWith(prefix));
  return Promise.all(rows.map(async row => ({ key: row.key, value: await _metaFromStorage<Value>(row) })));
}

function _serializePreparedOutputs(cashuts: CashuStorageSdk, preview: PreparedSwap) {
  const outputData = [...(preview.sendOutputs || []), ...(preview.keepOutputs || [])];
  return outputData.map(output => cashuts.OutputData.serialize(output));
}

export async function _prepareDurableSwap(wallet: StorageWallet, cashuts: CashuStorageSdk, operation: SwapOperation, mintUrl: string, builder: { prepare(): Promise<PreparedSwap> }, localInputs: WalletProof[], context: SwapContext = {}) {
  if (!wallet.ops || !cashuts.OutputData || typeof builder?.prepare !== 'function') throw new Error('Cashu runtime must support durable operations');
  const journalKey = context.journalKey || PENDING_SWAP_KEY;
  const previous = await _getMeta<DurableJournal>(journalKey);
  if (previous) {
    if (operation !== 'receive' || previous.operation !== operation) throw new Error('A previous Cashu operation needs recovery before another can start');
    return { preview: _resumeDurableSwap(cashuts, previous), record: previous, journalKey };
  }
  const preview = await builder.prepare();
  const selected = new Set((preview.inputs || []).map(proof => proof.secret));
  const record: SwapJournal = {
    ...context,
    version: 2, operation, mint: mintUrl, createdAt: Date.now(),
    localInputs: (localInputs || []).filter(proof => selected.has(proof.secret)).map(proof => _normalizeProofForStorage(proof, mintUrl)),
    inputs: (preview.inputs || []).map(proof => _normalizeProofForStorage(proof, mintUrl)),
    unselectedProofs: (preview.unselectedProofs || []).map(proof => _normalizeProofForStorage(proof, mintUrl)),
    keysetId: preview.keysetId,
    sendOutputCount: (preview.sendOutputs || []).length,
    outputs: _serializePreparedOutputs(cashuts, preview),
  };
  await _setMeta(journalKey, record);
  return { preview, record, journalKey };
}

export function _resumeDurableSwap(cashuts: CashuStorageSdk, record: SwapJournal) {
  const outputs = record.outputs.map(output => cashuts.OutputData.deserialize(output));
  return {
    inputs: record.inputs || [], unselectedProofs: record.unselectedProofs || [],
    keysetId: record.keysetId,
    sendOutputs: outputs.slice(0, record.sendOutputCount || 0),
    keepOutputs: outputs.slice(record.sendOutputCount || 0),
  };
}

export async function _prepareDurableMint(wallet: StorageWallet, cashuts: CashuStorageSdk, mintUrl: string, amount: Cashu.AmountLike, quote: { quote: string }, pendingKey: string) {
  if (typeof wallet.prepareMint !== 'function' || !cashuts.OutputData) throw new Error('Cashu runtime must support durable minting');
  if (await _getMeta(PENDING_SWAP_KEY)) throw new Error('A previous Cashu operation needs recovery before another can start');
  const preview = await wallet.prepareMint('bolt11', amount, quote);
  const record: MintJournal = {
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

export function _resumeDurableMint(cashuts: CashuStorageSdk, record: MintJournal) {
  const outputData = record.outputs.map(output => cashuts.OutputData.deserialize(output));
  return {
    method: 'bolt11',
    payload: { quote: record.quoteId, outputs: outputData.map(output => output.blindedMessage) },
    outputData,
    keysetId: record.keysetId,
    quote: { quote: record.quoteId },
  };
}

export async function _recoverPendingSwapUnlocked(recordKey = PENDING_SWAP_KEY) {
  const record = await _getMeta<DurableJournal>(recordKey);
  if (!record) return { recovered: 0, pending: false };
  const mintUrl = _normalizeMintUrl(record.mint);
  if (!isValidExternalUrl(mintUrl) || !Array.isArray(record.outputs) || !record.outputs.length) {
    throw new Error('Cashu recovery journal is malformed; local proofs were left untouched');
  }
  const cashuts = await storeRuntime.cashuLib();
  if (!cashuts.OutputData || !cashuts.Mint) throw new Error('Cashu runtime cannot restore the pending operation');
  const outputData = record.outputs.map(output => cashuts.OutputData.deserialize(output));
  const wallet = await storeRuntime.getWallet(mintUrl);
  const mint = new cashuts.Mint(mintUrl);
  const response = await mint.restore({ outputs: outputData.map(output => output.blindedMessage) });
  const signaturesByOutput = new Map<string, Cashu.SerializedBlindedSignature | undefined>();
  for (let index = 0; index < (response.outputs || []).length; index++) {
    signaturesByOutput.set(response.outputs[index]!.B_, response.signatures?.[index]);
  }
  if (!signaturesByOutput.size) {
    if (record.operation === 'mint') {
      const quote = await wallet.checkMintQuoteBolt11(record.quoteId);
      if (String(quote.state).toUpperCase() === 'PAID') {
        const proofs = await wallet.completeMint(_resumeDurableMint(cashuts, record));
        await _replaceProofs([], proofs, mintUrl, { deleteKeys: [recordKey, (record as MintJournal).pendingKey].filter(Boolean) as string[] });
        return { recovered: _sumProofsAsNumber(cashuts, proofs), pending: false };
      }
    }
    if (record.operation === 'receive') {
      // Keep incoming outputs for exact retry/recovery in an independent
      // journal, without blocking unrelated outgoing wallet funds.
      if (recordKey === PENDING_SWAP_KEY) {
        await _setMeta(PENDING_RECEIVE_PREFIX + await _digestStorageKey(JSON.stringify(record.outputs)), record);
        await _deleteMeta(PENDING_SWAP_KEY);
      }
      return { recovered: 0, pending: true };
    }
    const inputs = record.localInputs || [];
    if (inputs.length) {
      const { unspent, pending } = await wallet.groupProofsByState(inputs);
      if (unspent.length === inputs.length && !pending.length) {
        await _deleteMeta(recordKey);
        return { recovered: 0, pending: false, notSubmitted: true };
      }
    }
    throw new Error('Cashu operation is still pending at the mint; local proofs were left untouched');
  }
  // NUT-09 may return a subset. Never replace input value with partial outputs.
  if (outputData.some(output => !signaturesByOutput.get(output.blindedMessage.B_))) {
    throw new Error('Mint returned incomplete recovery outputs; local proofs were left untouched');
  }
  const signatures = outputData.map(output => signaturesByOutput.get(output.blindedMessage.B_)!);
  (wallet as StorageWallet & StorageSignatureVerifier).validateReturnedSignatures?.(signatures, outputData);
  const recoveredProofs: WalletProof[] = [];
  for (let index = 0; index < outputData.length; index++) {
    const signature = signatures[index]!;
    if (signature.id !== outputData[index]!.blindedMessage.id || _amountToNumber(signature.amount) !== _amountToNumber(outputData[index]!.blindedMessage.amount)) throw new Error('Recovery output mismatch');
    const keyset = await wallet.keyChain.ensureKeysetKeys(signature.id);
    recoveredProofs.push(outputData[index]!.toProof(signature, keyset));
  }
  // Version-one journals included unselected wallet proofs in localInputs.
  let retained = (record as SwapJournal).unselectedProofs || [];
  if (record.version === 1 && record.localInputs?.length) {
    retained = (await wallet.groupProofsByState(record.localInputs)).unspent;
  }
  // Background recovery restores the original mint's proofs without changing
  // the wallet the user selected while this operation was pending.
  const meta: Record<string, null> = {};
  if (record.operation === 'receive' && record.incomingToken) {
    for (const key of ['pendingDeposit', 'pendingWithdraw', 'pendingNodeRefund']) {
      let pending = await _getMeta(key);
      if (typeof pending === 'string') { try { pending = JSON.parse(pending); } catch {} }
      if (pending === record.incomingToken || (pending as { token?: unknown } | null)?.token === record.incomingToken || (pending as { recoveryToken?: unknown } | null)?.recoveryToken === record.incomingToken) meta[key] = null;
    }
  }
  if (record.operation === 'deposit') meta.pendingDeposit = null;
  if (record.operation === 'withdraw' || record.operation === 'send') meta.pendingWithdraw = null;
  await _replaceProofs(record.localInputs || [], [...retained, ...recoveredProofs], mintUrl, {
    deleteKeys: [recordKey, record.operation === 'mint' ? record.pendingKey : null].filter(Boolean) as string[], meta,
  });
  storeRuntime.resetWallet?.();
  return { recovered: _sumProofsAsNumber(cashuts, recoveredProofs), pending: false };
}

export async function _recoverAllPendingOperations() {
  const results: RecoveryResult[] = [];
  const keys = [PENDING_SWAP_KEY, ...(await _getMetaEntries(PENDING_RECEIVE_PREFIX)).map(entry => entry.key)];
  for (const key of keys) {
    try { results.push(await _recoverPendingSwapUnlocked(key)); }
    catch (error) { results.push({ recovered: 0, pending: true, error: getErrorMessage(error) }); }
  }
  return { recovered: results.reduce((sum, result) => sum + result.recovered, 0), pending: results.some(result => result.pending), results };
}

export async function _ensureNoPendingSwap() {
  if (!await _getMeta(PENDING_SWAP_KEY)) return;
  await _recoverPendingSwapUnlocked();
  if (await _getMeta(PENDING_SWAP_KEY)) throw new Error('A previous Cashu operation still needs recovery');
}

export function _isTerminalMintQuoteState(state: unknown) {
  return /^(EXPIRED|CANCELLED|CANCELED)$/.test(String(state || '').toUpperCase());
}

export async function _pendingQuoteKey(mintUrl: string, quoteId: string) {
  return PENDING_QUOTE_PREFIX + 'v2:' + await _digestStorageKey(`${_normalizeMintUrl(mintUrl)}\n${quoteId}`);
}

export function _legacyNamespacedPendingQuoteKey(mintUrl: string, quoteId: string) {
  return PENDING_QUOTE_PREFIX + encodeURIComponent(_normalizeMintUrl(mintUrl)) + ':' + quoteId;
}

export function _pendingQuoteDetails(entry: { key: string; value: unknown } | null | undefined, fallbackMint: string) {
  const value = entry?.value;
  if (value && typeof value === 'object') {
    return {
      quote: String((value as { quote?: unknown }).quote || ''),
      amount: _amountToNumber((value as { amount?: unknown }).amount),
      mint: _normalizeMintUrl((value as { mint?: unknown }).mint || fallbackMint),
    };
  }
  return {
    quote: String(entry?.key || '').slice(PENDING_QUOTE_PREFIX.length),
    amount: _amountToNumber(value),
    mint: _normalizeMintUrl(fallbackMint),
  };
}

export async function _saveFeeProofs(proofs: WalletProof[], forMint?: string) {
  if (!proofs.length) return;
  const mintUrl = _normalizeMintUrl(forMint || await storeRuntime.getMintUrl());
  await _assertProofMintOwnership(proofs, mintUrl, STORE_FEES);
  const rows = await Promise.all(proofs.map(proof => _proofForStorage(proof, mintUrl)));
  const db = await _openDB();
  return writeProofRows(db, STORE_FEES, rows);
}

export async function _replaceFeeProofs(previousProofs: WalletProof[], nextProofs: WalletProof[], forMint?: string, deleteKeys: string[] = []) {
  const mintUrl = _normalizeMintUrl(forMint || await storeRuntime.getMintUrl());
  await _assertProofMintOwnership([...(previousProofs || []), ...(nextProofs || [])], mintUrl, STORE_FEES);
  const previousKeys = (await Promise.all((previousProofs || []).map(proof => _proofStorageKeys(proof.secret)))).flat();
  const nextRows = await Promise.all((nextProofs || []).map(proof => _proofForStorage(proof, mintUrl)));
  const db = await _openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_FEES, STORE_META], 'readwrite');
    const store = tx.objectStore(STORE_FEES);
    try {
      for (const key of previousKeys) store.delete(key);
      for (const row of nextRows) store.put(row);
      for (const key of deleteKeys) tx.objectStore(STORE_META).delete(key);
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

export async function _getAllFeeProofs(forMint?: string) {
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
  const legacy = await _getMeta<string>('walletMnemonic');
  if (legacy) {
    await cashuWalletStoreCryptoDeps.encryptedSetItem(MNEMONIC_KEY, legacy);
    await _setMeta('walletMnemonic', null);
    return legacy;
  }
  return null;
}

export async function _saveMnemonic(mnemonic: string) {
  await cashuWalletStoreCryptoDeps.encryptedSetItem(MNEMONIC_KEY, mnemonic);
}

export function _createCounterSource(namespace = '', migrateLegacy = true) {
  function _readOrUpdate(keysetId: string, update: ((current: number) => number) | null) {
    return _openDB().then(db => new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE_META, update ? 'readwrite' : 'readonly');
      const store = tx.objectStore(STORE_META);
      const legacyKey = 'counter:' + keysetId;
      const key = namespace ? `counter:${namespace}:${keysetId}` : legacyKey;
      const req = store.get(key);
      let result: number;
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
      tx.oncomplete = () => resolve(result!);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Cashu counter update aborted'));
    }));
  }

  return {
    async reserve(keysetId: string, count: number) {
      if (!Number.isSafeInteger(count) || count < 0) throw new Error('reserve called with invalid count');
      if (count === 0) return { start: await _readOrUpdate(keysetId, null), count: 0 };
      let start = 0;
      await _readOrUpdate(keysetId, current => {
        start = current;
        return current + count;
      });
      return { start, count };
    },
    async advanceToAtLeast(keysetId: string, value: number) {
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('advanceToAtLeast called with invalid value');
      await _readOrUpdate(keysetId, current => Math.max(current, value));
    }
  };
}

export async function _counterNamespaceForSeed(seed: BufferSource) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', seed));
  return Array.from(digest.slice(0, 8), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Rewrap bearer proofs and recovery metadata when app encryption changes.
 * Counter values stay numeric so their cross-tab IDB increment remains atomic;
 * they contain no bearer secret or credential. */
export async function migrateCashuWalletStorage(mode: string) {
  if (mode !== 'encrypted' && mode !== 'plain') throw new Error(`Unsupported Cashu migration mode: ${mode}`);
  const [proofRows, metaRows, feeRows] = await Promise.all([
    _getAllRaw(STORE_PROOFS),
    _getAllRaw(STORE_META),
    _getAllRaw(STORE_FEES),
  ]);
  const proofChanges: StorageChange<StoredProof>[] = [];
  const feeChanges: StorageChange<StoredProof>[] = [];
  for (const [rows, changes] of [[proofRows, proofChanges], [feeRows, feeChanges]] as const) {
    for (const row of rows) {
      const wrapped = !!row?._payload;
      if ((mode === 'encrypted') === wrapped) continue;
      const proof = await _proofFromStorage(row);
      changes.push({ previousKey: row.secret, next: await _proofForStorage(proof, proof._mint || DEFAULT_MINT, mode) });
    }
  }
  const metaChanges: StorageChange<StoredMeta>[] = [];
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
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction([STORE_PROOFS, STORE_META, STORE_FEES], 'readwrite');
    const apply = (storeName: keyof WalletStorageRows, changes: Array<StorageChange<StoredMeta> | StorageChange<StoredProof>>) => {
      const store = tx.objectStore(storeName);
      for (const change of changes) {
        store.put(change.next);
        const nextKey = storeName === STORE_META ? (change.next as StoredMeta).key : (change.next as StoredProof).secret;
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
  return new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(undefined);
    req.onerror = () => reject(req.error || new Error('Cashu wallet database deletion failed'));
    req.onblocked = () => reject(
      new Error('Cashu wallet deletion is blocked by another open Get Based tab.'),
    );
  });
}
