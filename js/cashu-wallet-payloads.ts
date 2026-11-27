import type { CashuWalletStoreCryptoDeps, StorageMode, StoredMeta, StoredProof, WalletProof } from './cashu-wallet-storage-types.js';

function rejectUnconfiguredCryptoDependency(): never {
  throw new Error('Cashu wallet storage encryption is not configured.');
}

export const cashuWalletStoreCryptoDeps: CashuWalletStoreCryptoDeps = {
  decryptObject: rejectUnconfiguredCryptoDependency,
  encryptedSetItem: rejectUnconfiguredCryptoDependency,
  encryptedGetItem: rejectUnconfiguredCryptoDependency,
  encryptObject: rejectUnconfiguredCryptoDependency,
  getEncryptionEnabled: rejectUnconfiguredCryptoDependency,
  isEncryptedObject: rejectUnconfiguredCryptoDependency,
  encryptDeviceCredential: rejectUnconfiguredCryptoDependency,
  decryptDeviceCredential: rejectUnconfiguredCryptoDependency,
};

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

export function _normalizeProofForStorage(proof: WalletProof, mintUrl: string) {
  return { ...proof, amount: _amountToNumber(proof.amount), _mint: _normalizeMintUrl(mintUrl) };
}

function _sessionLockedError() {
  const error = new Error('Cashu wallet storage is encrypted; unlock with your passphrase first.');
  (error as Error & { code?: string }).code = 'session-locked';
  return error;
}

export async function _digestStorageKey(value: unknown) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value))));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function _proofStorageKeys(secret: string): Promise<[string, string]> {
  return [String(secret), `enc:v1:${await _digestStorageKey(secret)}`];
}

async function _encryptWalletPayload(value: unknown) {
  const envelope = await cashuWalletStoreCryptoDeps.encryptObject(value);
  if (!envelope) throw _sessionLockedError();
  return envelope;
}

export async function _proofForStorage(proof: WalletProof, mintUrl: string, mode: StorageMode = cashuWalletStoreCryptoDeps.getEncryptionEnabled() ? 'encrypted' : 'plain') {
  const normalized = _normalizeProofForStorage(proof, mintUrl);
  const [, storageKey] = await _proofStorageKeys(normalized.secret);
  return { secret: storageKey, _payload: mode === 'plain'
    ? await cashuWalletStoreCryptoDeps.encryptDeviceCredential(`cashu-proof:${storageKey}`, JSON.stringify(normalized))
    : await _encryptWalletPayload(normalized) };
}

async function openDevicePayload(key: string, value: string) {
  const plaintext = await cashuWalletStoreCryptoDeps.decryptDeviceCredential(key, value);
  if (plaintext === null) throw new Error('Cashu wallet data could not be unlocked on this device.');
  return JSON.parse(plaintext) as unknown;
}

export async function _proofFromStorage(row: StoredProof): Promise<WalletProof> {
  if (!row?._payload) return row as WalletProof;
  if (typeof row._payload === 'string') return await openDevicePayload(`cashu-proof:${row.secret}`, row._payload) as WalletProof;
  if (!cashuWalletStoreCryptoDeps.isEncryptedObject(row._payload)) throw new Error('Encrypted Cashu proof has an invalid envelope.');
  const proof = await cashuWalletStoreCryptoDeps.decryptObject(row._payload).catch(() => null) as WalletProof | null;
  if (!proof) throw _sessionLockedError();
  return proof;
}

export async function _metaForStorage(key: string, value: unknown, mode: StorageMode = cashuWalletStoreCryptoDeps.getEncryptionEnabled() ? 'encrypted' : 'plain') {
  if (String(key).startsWith('counter:')) return { key, value };
  return { key, _payload: mode === 'plain'
    ? await cashuWalletStoreCryptoDeps.encryptDeviceCredential(`cashu-meta:${key}`, JSON.stringify({ value }))
    : await _encryptWalletPayload({ value }) };
}

export async function _metaFromStorage<Value = unknown>(row: StoredMeta | undefined): Promise<Value | null> {
  if (!row?._payload) return (row?.value ?? null) as Value | null;
  if (typeof row._payload !== 'string' && !cashuWalletStoreCryptoDeps.isEncryptedObject(row._payload)) {
    throw new Error('Encrypted Cashu metadata has an invalid envelope.');
  }
  const payload = (typeof row._payload === 'string'
    ? await openDevicePayload(`cashu-meta:${row.key}`, row._payload)
    : await cashuWalletStoreCryptoDeps.decryptObject(row._payload).catch(() => null)) as { value?: unknown } | null;
  if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'value')) throw _sessionLockedError();
  return payload.value as Value;
}
