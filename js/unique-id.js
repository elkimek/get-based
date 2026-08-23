// @ts-check
// unique-id.js — Collision-resistant identifiers for locally created records.

let fallbackSequence = 0;

function cryptoRandomHex() {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID().replace(/-/g, '');
  }
  if (typeof cryptoApi?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  }
  return '';
}

/**
 * Create an identifier that remains unique when several records are created
 * in the same millisecond. Web Crypto supplies the normal path; the monotonic
 * sequence keeps the non-crypto fallback collision-safe within this runtime.
 *
 * @param {string} [prefix]
 * @returns {string}
 */
export function createUniqueId(prefix = '') {
  const random = cryptoRandomHex();
  if (random) return `${prefix}${random}`;

  const now = Date.now();
  const sequence = fallbackSequence++;
  return `${prefix}${now.toString(36)}_${sequence.toString(36)}`;
}
