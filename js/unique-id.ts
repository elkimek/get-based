// unique-id.js — Collision-resistant identifiers for locally created records.

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
  throw new Error('Web Crypto is unavailable; cannot create a collision-resistant identifier');
}

export function createUniqueId(prefix = ''): string {
  return `${prefix}${cryptoRandomHex()}`;
}
