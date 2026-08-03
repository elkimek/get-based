import { describe, expect, it } from 'vitest';
import { p256 } from '@noble/curves/nist.js';

import { ec as VerifyOnlyEC } from '../scripts/vendor-packages/elliptic-verify-only/index.js';

describe('Venice DCAP P-256 verification-only adapter', () => {
  it('accepts valid DER signatures and rejects tampered digests', () => {
    const secretKey = p256.utils.randomSecretKey();
    const publicKey = p256.getPublicKey(secretKey, false);
    const digest = crypto.getRandomValues(new Uint8Array(32));
    const signature = p256.sign(digest, secretKey, {
      format: 'der',
      lowS: false,
      prehash: false,
    });
    const verifier = new VerifyOnlyEC('p256').keyFromPublic(publicKey);
    const tamperedDigest = Uint8Array.from(digest);
    tamperedDigest[0] ^= 1;

    expect(verifier.verify(digest, signature)).toBe(true);
    expect(verifier.verify(tamperedDigest, signature)).toBe(false);
  });

  it('exposes no signing API and rejects unsupported curves', () => {
    const verifier = new VerifyOnlyEC('p256');

    expect(verifier.sign).toBeUndefined();
    expect(() => new VerifyOnlyEC('secp256k1')).toThrow('Unsupported DCAP curve');
  });
});
