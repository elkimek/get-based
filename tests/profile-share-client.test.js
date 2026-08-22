import { describe, expect, it } from 'vitest';

import {
  PROFILE_SHARE_KDF_ITERATIONS,
  PROFILE_SHARE_MAX_DAYS,
  PROFILE_SHARE_MAX_DECOMPRESSED_BYTES,
  PROFILE_SHARE_MIN_KDF_ITERATIONS,
  buildProfileShareUrl,
  createProfileShareId,
  decryptProfileShareEnvelope,
  encryptProfileShareEnvelope,
  parseProfileShareIdFromLocation,
} from '../js/profile-share.js';

const SHARE_ID = 'abcdefghijklmnopqrstuvwx';
const PASSWORD = 'correct-horse-client-1234';

function sampleExport(overrides = {}) {
  return {
    version: 2,
    profile: { id: 'profile-client-test', name: 'Client Test Profile' },
    entries: [{ date: '2026-07-20', markers: { metabolic: { glucose: 5.1 } } }],
    ...overrides,
  };
}

function replaceGlobal(name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  return () => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  };
}

describe('profile share URL handling', () => {
  it('namespaces new operated-service ids without overlapping legacy 24-character ids', () => {
    expect(createProfileShareId()).toMatch(/^vps1_[A-Za-z0-9_-]{24}$/);
  });

  it('builds a secret-free link on the current path and rejects invalid ids', () => {
    const url = buildProfileShareUrl(SHARE_ID, {
      origin: 'https://getbased.health',
      pathname: '/app',
      search: '?private=value',
    });

    expect(url).toBe(`https://getbased.health/app#share/${SHARE_ID}`);
    expect(url).not.toMatch(/private|password|secret|key/i);
    expect(() => buildProfileShareUrl('too-short')).toThrow('Invalid share id.');
  });

  it('parses current and legacy hash routes plus query links', () => {
    expect(parseProfileShareIdFromLocation({
      hash: `#share/${SHARE_ID}`,
      href: `https://getbased.health/app#share/${SHARE_ID}`,
    })).toBe(SHARE_ID);
    expect(parseProfileShareIdFromLocation({
      hash: `#share=${SHARE_ID}`,
      href: `https://getbased.health/app#share=${SHARE_ID}`,
    })).toBe(SHARE_ID);
    expect(parseProfileShareIdFromLocation({
      hash: '',
      href: `https://getbased.health/app?share=${SHARE_ID}`,
    })).toBe(SHARE_ID);
  });

  it('rejects malformed routes and gives a valid hash route precedence over a query id', () => {
    const queryId = 'zyxwvutsrqponmlkjihg';
    expect(parseProfileShareIdFromLocation({
      hash: `#share/${SHARE_ID}`,
      href: `https://getbased.health/app?share=${queryId}#share/${SHARE_ID}`,
    })).toBe(SHARE_ID);
    expect(parseProfileShareIdFromLocation({
      hash: '#share/short',
      href: 'not a URL',
    })).toBe('');
    expect(parseProfileShareIdFromLocation(null)).toBe('');
  });
});

describe('profile share client-side validation', () => {
  it('rejects invalid exports and short passwords before encrypting', async () => {
    await expect(encryptProfileShareEnvelope(null, PASSWORD)).rejects.toThrow('Invalid shared profile.');
    await expect(encryptProfileShareEnvelope(sampleExport({ version: 1 }), PASSWORD))
      .rejects.toThrow('Unsupported shared profile version.');
    await expect(encryptProfileShareEnvelope(sampleExport({ profile: {} }), PASSWORD))
      .rejects.toThrow('Shared profile is missing profile metadata.');
    await expect(encryptProfileShareEnvelope(sampleExport({ entries: null }), PASSWORD))
      .rejects.toThrow('Shared profile is missing lab entries.');
    await expect(encryptProfileShareEnvelope(sampleExport(), 'too-short'))
      .rejects.toThrow('Use a password of at least 12 characters.');
  });

  it('enforces the KDF floor, default, and expiry bounds', async () => {
    const before = Date.now();
    const minimum = await encryptProfileShareEnvelope(sampleExport(), PASSWORD, {
      iterations: 1,
      expiresDays: -10,
    });
    const maximum = await encryptProfileShareEnvelope(sampleExport(), PASSWORD, {
      iterations: Number.NaN,
      expiresDays: 10_000,
    });
    const after = Date.now();

    expect(minimum.kdf.iterations).toBe(PROFILE_SHARE_MIN_KDF_ITERATIONS);
    expect(Date.parse(minimum.expiresAt)).toBeGreaterThanOrEqual(before + 24 * 60 * 60 * 1000);
    expect(Date.parse(minimum.expiresAt)).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000);
    expect(maximum.kdf.iterations).toBe(PROFILE_SHARE_KDF_ITERATIONS);
    expect(Date.parse(maximum.expiresAt)).toBeGreaterThanOrEqual(
      before + PROFILE_SHARE_MAX_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(Date.parse(maximum.expiresAt)).toBeLessThanOrEqual(
      after + PROFILE_SHARE_MAX_DAYS * 24 * 60 * 60 * 1000,
    );
  }, 20_000);

  it('rejects expired, malformed, weak, and unsupported envelopes', async () => {
    const envelope = await encryptProfileShareEnvelope(sampleExport(), PASSWORD, {
      iterations: PROFILE_SHARE_MIN_KDF_ITERATIONS,
      expiresAt: '2099-01-01T00:00:00.000Z',
    });

    await expect(decryptProfileShareEnvelope({ ...envelope, schema: 'other' }, PASSWORD))
      .rejects.toThrow('Invalid shared profile link.');
    await expect(decryptProfileShareEnvelope({ ...envelope, version: 2 }, PASSWORD))
      .rejects.toThrow('Invalid shared profile link.');
    await expect(decryptProfileShareEnvelope({ ...envelope, expiresAt: '2000-01-01T00:00:00.000Z' }, PASSWORD))
      .rejects.toThrow('This shared profile link has expired.');
    await expect(decryptProfileShareEnvelope({
      ...envelope,
      kdf: { ...envelope.kdf, name: 'scrypt' },
    }, PASSWORD)).rejects.toThrow('Unsupported shared profile encryption.');
    await expect(decryptProfileShareEnvelope({
      ...envelope,
      cipher: { ...envelope.cipher, name: 'AES-CBC' },
    }, PASSWORD)).rejects.toThrow('Unsupported shared profile encryption.');
    await expect(decryptProfileShareEnvelope({
      ...envelope,
      kdf: { ...envelope.kdf, iterations: PROFILE_SHARE_MIN_KDF_ITERATIONS - 1 },
    }, PASSWORD)).rejects.toThrow('Invalid shared profile encryption settings.');
    await expect(decryptProfileShareEnvelope({ ...envelope, compression: 'brotli' }, PASSWORD))
      .rejects.toThrow('Unsupported share compression.');
    await expect(decryptProfileShareEnvelope(envelope, 'wrong-password-1234'))
      .rejects.toThrow('Could not decrypt shared profile.');
  }, 20_000);

  it('round-trips without compression support and explains missing gzip decompression support', async () => {
    const restoreCompression = replaceGlobal('CompressionStream', undefined);
    let plainEnvelope;
    try {
      plainEnvelope = await encryptProfileShareEnvelope(sampleExport(), PASSWORD, {
        iterations: PROFILE_SHARE_MIN_KDF_ITERATIONS,
        expiresAt: '2099-01-01T00:00:00.000Z',
      });
    } finally {
      restoreCompression();
    }
    expect(plainEnvelope.compression).toBe('none');
    await expect(decryptProfileShareEnvelope(plainEnvelope, PASSWORD))
      .resolves.toMatchObject({ profile: { name: 'Client Test Profile' } });

    const gzipEnvelope = await encryptProfileShareEnvelope(sampleExport(), PASSWORD, {
      iterations: PROFILE_SHARE_MIN_KDF_ITERATIONS,
      expiresAt: '2099-01-01T00:00:00.000Z',
    });
    expect(gzipEnvelope.compression).toBe('gzip');
    const restoreDecompression = replaceGlobal('DecompressionStream', undefined);
    try {
      await expect(decryptProfileShareEnvelope(gzipEnvelope, PASSWORD))
        .rejects.toThrow('This browser cannot decompress the shared profile.');
    } finally {
      restoreDecompression();
    }
  }, 20_000);

  it('rejects gzip payloads that expand beyond the import limit', async () => {
    const oversized = sampleExport({
      profile: {
        id: 'profile-client-test',
        name: 'Oversized Profile',
        notes: 'x'.repeat(PROFILE_SHARE_MAX_DECOMPRESSED_BYTES + 1024),
      },
      entries: [],
    });
    const envelope = await encryptProfileShareEnvelope(oversized, PASSWORD, {
      iterations: PROFILE_SHARE_MIN_KDF_ITERATIONS,
      expiresAt: '2099-01-01T00:00:00.000Z',
    });

    expect(envelope.compression).toBe('gzip');
    await expect(decryptProfileShareEnvelope(envelope, PASSWORD))
      .rejects.toThrow('Shared profile is too large to import.');
  }, 30_000);
});
