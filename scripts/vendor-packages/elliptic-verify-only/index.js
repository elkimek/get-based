import { p256 } from '@noble/curves/nist.js';

function asBytes(value, label) {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value);
  throw new TypeError(`${label} must be bytes`);
}

/**
 * The only elliptic API surface used by @phala/dcap-qvl@0.6.2.
 * This adapter intentionally exposes verification but no signing operation.
 */
export class ec {
  constructor(curveName) {
    if (curveName !== 'p256') {
      throw new Error(`Unsupported DCAP curve: ${String(curveName)}`);
    }
  }

  keyFromPublic(publicKey) {
    const publicKeyBytes = asBytes(publicKey, 'P-256 public key');
    p256.Point.fromBytes(publicKeyBytes);

    return Object.freeze({
      verify(digest, signature) {
        try {
          return p256.verify(
            asBytes(signature, 'P-256 DER signature'),
            asBytes(digest, 'P-256 message digest'),
            publicKeyBytes,
            { format: 'der', lowS: false, prehash: false }
          );
        } catch {
          return false;
        }
      },
    });
  }
}
