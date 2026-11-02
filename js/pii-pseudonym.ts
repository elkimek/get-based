// Synchronous report-local pseudonyms using the existing vendored SHA-256.
import { sha256 } from '../vendor/sha256.js';

export { sha256 };

export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const block = new Uint8Array(64);
  block.set(key.length > 64 ? sha256(key) : key);
  const inner = new Uint8Array(64 + message.length);
  const outer = new Uint8Array(64 + 32);
  for (let i = 0; i < 64; i++) { inner[i] = block[i]! ^ 0x36; outer[i] = block[i]! ^ 0x5c; }
  inner.set(message, 64);
  outer.set(sha256(inner), 64);
  return sha256(outer);
}

export type PseudonymFn = (kind: string, normalizedValue: string) => Uint8Array;

/** Returns a keyed digest function: same (kind, value) → same bytes for the same key. */
export function createPseudonymDigest(key: string): PseudonymFn {
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(key);
  const cache = new Map<string, Uint8Array>();
  return (kind, normalizedValue) => {
    const input = `${kind}\u0000${normalizedValue}`;
    let digest = cache.get(input);
    if (!digest) {
      digest = hmacSha256(keyBytes, encoder.encode(input));
      cache.set(input, digest);
    }
    return digest;
  };
}
