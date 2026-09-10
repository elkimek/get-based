// Synthetic, signed mainnet-format invoices. No payable Lightning backend.
import { bech32, secp256k1, sha256 } from '../../vendor/routstr-crypto.js';
export const LNURL_METADATA = '[["text/plain","Synthetic test payment"]]';
export function makeTestInvoice(sats, { metadata = LNURL_METADATA, timestamp = Math.floor(Date.now() / 1000), expiry = 3600 } = {}) {
  const prefix = 'lnbc' + BigInt(sats) * 10n + 'n';
  const integerWords = n => { const words = []; do { words.unshift(n % 32); n = Math.floor(n / 32); } while (n); return words; };
  const time = integerWords(timestamp); while (time.length < 7) time.unshift(0);
  const tag = (id, words) => [id, words.length >> 5, words.length & 31, ...words];
  const data = [...time, ...tag(1, bech32.toWords(new Uint8Array(32).fill(7))),
    ...tag(23, bech32.toWords(sha256(new TextEncoder().encode(metadata)))), ...tag(6, integerWords(expiry))];
  let accumulator = 0, bits = 0; const bytes = [];
  for (const word of data) { accumulator = (accumulator << 5) | word; bits += 5; while (bits >= 8) { bits -= 8; bytes.push((accumulator >> bits) & 255); } }
  if (bits) bytes.push((accumulator << (8 - bits)) & 255);
  const hrp = new TextEncoder().encode(prefix), signed = new Uint8Array(hrp.length + bytes.length);
  signed.set(hrp); signed.set(bytes, hrp.length);
  const secret = new Uint8Array(32); secret[31] = 1;
  const signature = secp256k1.sign(sha256(signed), secret, { prehash: false, format: 'recovered' });
  return bech32.encode(prefix, [...data, ...bech32.toWords(new Uint8Array([...signature.slice(1), signature[0]]))], 10000);
}
