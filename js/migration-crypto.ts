import { bytesToBase64, _base64ToBytes } from './base64.js';
import { encodeMigrationValue, decodeMigrationValue } from './migration-codec.js';

const encoder = new TextEncoder(), decoder = new TextDecoder();
const AAD = encoder.encode('getbased-migration:1');
export const MIGRATION_MAX_BYTES = 512 * 1024 * 1024;
export interface MigrationEnvelope {
  format: 'getbased-migration'; version: 1; iterations: 600000;
  salt: string; iv: string; ciphertext: string;
}
export async function deriveMigrationKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256'}, material,
    {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
}
export async function sealMigration(value: unknown, password: string): Promise<MigrationEnvelope> {
  if (password.length < 12) throw new Error('Use a migration password with at least 12 characters.');
  const plaintext = encoder.encode(encodeMigrationValue(value));
  if (plaintext.byteLength > MIGRATION_MAX_BYTES) throw new Error('This migration archive is too large for an in-browser transfer. The source data is unchanged.');
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveMigrationKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: AAD}, key, plaintext);
  return {format: 'getbased-migration', version: 1, iterations: 600000,
    salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext))};
}
export async function openMigration(value: unknown, password: string): Promise<unknown> {
  const envelope = value as Partial<MigrationEnvelope> | null;
  if (!envelope || envelope.format !== 'getbased-migration' || envelope.version !== 1 || envelope.iterations !== 600000
    || typeof envelope.salt !== 'string' || envelope.salt.length !== 24 || typeof envelope.iv !== 'string' || envelope.iv.length !== 16 || typeof envelope.ciphertext !== 'string'
    || envelope.ciphertext.length > Math.ceil((MIGRATION_MAX_BYTES + 16) / 3) * 4) throw new Error('Unsupported migration archive.');
  try {
    const salt = _base64ToBytes(envelope.salt), iv = _base64ToBytes(envelope.iv), bytes = _base64ToBytes(envelope.ciphertext);
    if (salt.length !== 16 || iv.length !== 12 || bytes.length < 16) throw new Error('Invalid envelope.');
    const key = await deriveMigrationKey(password, salt);
    const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv, additionalData: AAD}, key, bytes);
    return decodeMigrationValue(decoder.decode(plain));
  } catch { throw new Error('The password is incorrect or the migration file is damaged. No destination data was changed.'); }
}
export async function decryptMigrationSourceValue(key: CryptoKey, value: string): Promise<string> {
  const parts = value.split(':');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('Unsupported source encryption.');
  const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: _base64ToBytes(parts[1]!)}, key, _base64ToBytes(parts[2]!));
  return decoder.decode(plain);
}
export async function decryptMigrationDeviceValue(key: CryptoKey, value: unknown): Promise<unknown> {
  const envelope = value as {version?: unknown; iv?: unknown; ciphertext?: unknown} | null;
  if (envelope?.version !== 1) throw new Error('Unsupported browser-only encryption.');
  const bytes = (item: unknown): Uint8Array<ArrayBuffer> => {
    if (item instanceof Uint8Array) return new Uint8Array(item);
    if (item instanceof ArrayBuffer) return new Uint8Array(item);
    if (item && typeof item === 'object' && Object.keys(item).length && Object.keys(item).every((entry, index) => entry === String(index))) {
      const values = Object.values(item);
      if (values.every(entry => Number.isInteger(entry) && Number(entry) >= 0 && Number(entry) <= 255)) return new Uint8Array(values as number[]);
    }
    throw new Error('A browser-only record has missing encrypted bytes. Keep the original browser and its saved backups.');
  };
  const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes(envelope.iv)}, key, bytes(envelope.ciphertext));
  return JSON.parse(decoder.decode(plain)) as unknown;
}
export async function encryptMigrationDeviceValue(key: CryptoKey, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, encoder.encode(JSON.stringify(value)));
  return {version: 1, iv, ciphertext};
}
