import { bytesToBase64 as toBase64, _base64ToBytes as fromBase64 } from './base64.js';

export const ENCRYPTION_MANIFEST_KEY = 'labcharts-encryption-salt';
const PBKDF2_ITERATIONS = 600000;

export async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, extractable = false) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    extractable,
    ['encrypt', 'decrypt']
  );
}

export async function openDataKey(passphrase: string, manifest: string, extractable = false) {
  if (!manifest.startsWith('v2:')) {
    const salt = fromBase64(manifest);
    if (salt.length !== 16) throw new Error('Invalid encryption salt.');
    return deriveKey(passphrase, salt, extractable);
  }
  const [, saltText, ivText, wrappedText, extra] = manifest.split(':');
  if (!saltText || !ivText || !wrappedText || extra !== undefined) throw new Error('Invalid encryption key envelope.');
  const salt = fromBase64(saltText), iv = fromBase64(ivText), wrapped = fromBase64(wrappedText);
  if (salt.length !== 16 || iv.length !== 12 || wrapped.length !== 48) throw new Error('Invalid encryption key envelope.');
  return crypto.subtle.unwrapKey(
    'raw', wrapped, await deriveWrappingKey(passphrase, salt), { name: 'AES-GCM', iv },
    { name: 'AES-GCM', length: 256 }, extractable, ['encrypt', 'decrypt'],
  );
}

async function deriveWrappingKey(passphrase: string, salt: Uint8Array<ArrayBuffer>) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey'],
  );
}

export async function wrapDataKey(passphrase: string, dataKey: CryptoKey) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey(
    'raw', dataKey, await deriveWrappingKey(passphrase, salt), { name: 'AES-GCM', iv },
  );
  return `v2:${toBase64(salt)}:${toBase64(iv)}:${toBase64(new Uint8Array(wrapped))}`;
}
