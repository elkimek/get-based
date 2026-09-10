// @ts-check
// Payment/discovery boundary validation. Cryptography comes from pinned vendors.
import { bech32, secp256k1, schnorr, sha256 } from '../vendor/routstr-crypto.js';
import { isValidExternalUrl } from './url-safety.js';

export function canonicalRoutstrUrl(raw) {
  if (!isValidExternalUrl(raw)) throw new Error('Expected a public HTTPS endpoint');
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash) throw new Error('Endpoint must not contain credentials, a query, or a fragment');
  return url.href.replace(/\/+$/, '');
}
export function positiveSats(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Amount must be a positive safe integer in sats');
  return value;
}
export function bytesHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
export function tokenAccountKey(token) {
  return 'sk-' + bytesHex(sha256(new TextEncoder().encode(token)));
}
function wordsToBytesPadded(words) {
  let accumulator = 0, bits = 0;
  const bytes = [];
  for (const word of words) {
    accumulator = (accumulator << 5) | word;
    bits += 5;
    while (bits >= 8) { bits -= 8; bytes.push((accumulator >> bits) & 255); }
  }
  if (bits) bytes.push((accumulator << (8 - bits)) & 255);
  return new Uint8Array(bytes);
}
function wordNumber(words) {
  const value = words.reduce((sum, word) => sum * 32 + word, 0);
  if (!Number.isSafeInteger(value)) throw new Error('Invalid invoice integer');
  return value;
}

/** Validate encoding, signature, network, expiry and amount before any payment. */
export function validateLightningInvoice(raw, expectedSats, metadata) {
  const invoice = String(raw || '').trim();
  const { prefix, words } = bech32.decode(/** @type {`${string}1${string}`} */ (invoice), 10000);
  const match = /^lnbc([1-9][0-9]*)([munp]?)$/.exec(prefix);
  if (!match || words.length < 111) throw new Error('Expected a Bitcoin mainnet invoice with an amount');
  const factors = { '': 100000000000n, m: 100000000n, u: 100000n, n: 100n, p: 1n };
  let msats = BigInt(match[1]) * factors[match[2]];
  if (match[2] === 'p') {
    if (msats % 10n) throw new Error('Invoice amount is below millisatoshi precision');
    msats /= 10n;
  }
  if (msats <= 0n || msats > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Invalid invoice amount');
  if (expectedSats != null && msats !== BigInt(positiveSats(expectedSats)) * 1000n) {
    throw new Error('Lightning invoice amount does not match the requested amount');
  }
  const data = words.slice(0, -104);
  const signature = bech32.fromWords(words.slice(-104));
  const tags = new Map();
  for (let offset = 7; offset < data.length;) {
    if (offset + 3 > data.length) throw new Error('Truncated invoice tag');
    const tag = data[offset], size = data[offset + 1] * 32 + data[offset + 2];
    offset += 3;
    if (offset + size > data.length) throw new Error('Truncated invoice tag');
    if ([1, 13, 23, 6, 19].includes(tag) && tags.has(tag)) throw new Error('Duplicate invoice tag');
    tags.set(tag, data.slice(offset, offset + size));
    offset += size;
  }
  if (bech32.fromWords(tags.get(1) || []).length !== 32 || (tags.has(13) === tags.has(23))) {
    throw new Error('Invoice must contain a payment hash and exactly one description');
  }
  const descriptionHash = tags.has(23) ? bytesHex(bech32.fromWords(tags.get(23))) : null;
  if (descriptionHash !== null && descriptionHash.length !== 64) throw new Error('Invalid invoice description hash');
  if (metadata != null && descriptionHash !== bytesHex(sha256(new TextEncoder().encode(metadata)))) {
    throw new Error('Lightning invoice does not match the LNURL metadata');
  }
  const expiresAt = wordNumber(data.slice(0, 7)) + (tags.has(6) ? wordNumber(tags.get(6)) : 3600);
  if (expiresAt <= Date.now() / 1000) throw new Error('Lightning invoice has expired');
  const prefixBytes = new TextEncoder().encode(prefix);
  const payloadBytes = wordsToBytesPadded(data);
  const signed = new Uint8Array(prefixBytes.length + payloadBytes.length);
  signed.set(prefixBytes); signed.set(payloadBytes, prefixBytes.length);
  const digest = sha256(signed);
  if (signature.length !== 65 || signature[64] > 3) throw new Error('Invalid invoice signature');
  const sig = secp256k1.Signature.fromBytes(signature.slice(0, 64)).addRecoveryBit(signature[64]);
  const publicKey = sig.recoverPublicKey(digest).toBytes();
  if (!secp256k1.verify(signature.slice(0, 64), digest, publicKey, { prehash: false, lowS: false })) throw new Error('Invalid invoice signature');
  if (tags.has(19) && bytesHex(bech32.fromWords(tags.get(19))) !== bytesHex(publicKey)) throw new Error('Invoice payee does not match its signature');
  return { invoice: invoice.toLowerCase(), msats: Number(msats), expiresAt, descriptionHash };
}

export function verifyRoutstrAnnouncement(event) {
  try {
    if (event?.kind !== 38421 || !/^[a-f0-9]{64}$/.test(event.id) || !/^[a-f0-9]{64}$/.test(event.pubkey)
      || !/^[a-f0-9]{128}$/.test(event.sig) || !Number.isSafeInteger(event.created_at)
      || event.created_at < 0 || event.created_at > Date.now() / 1000 + 300
      || typeof event.content !== 'string' || event.content.length > 16384
      || !Array.isArray(event.tags) || event.tags.length > 128
      || !event.tags.every(tag => Array.isArray(tag) && tag.length > 0 && tag.length <= 16 && tag.every(v => typeof v === 'string' && v.length <= 8192))) return false;
    const payload = JSON.stringify([0, event.pubkey, event.created_at, event.kind, event.tags, event.content]);
    const digest = sha256(new TextEncoder().encode(payload));
    return bytesHex(digest) === event.id && schnorr.verify(Uint8Array.from(event.sig.match(/../g), byte => parseInt(byte, 16)), digest, Uint8Array.from(event.pubkey.match(/../g), byte => parseInt(byte, 16)));
  } catch { return false; }
}
