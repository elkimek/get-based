// @ts-check
// sync-payload-codec.js - Pure gzip, base64, and parsing helpers for sync wire payloads.

/** @param {string} str */
export async function _gzipString(str) {
  const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

// v1.7.12 audit fix: decompression-bomb defence for per-row payloads.
export const _PER_ROW_DECOMPRESSED_CAP_BYTES = 1024 * 1024;

/** @param {BlobPart} bytes
 * @param {number} [maxBytes]
 */
export async function _gunzipToStringCapped(bytes, maxBytes = _PER_ROW_DECOMPRESSED_CAP_BYTES) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let out = '';
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw new Error(`per-row payload exceeds ${maxBytes} bytes after gunzip — refusing to trust (decompression-bomb defence)`);
    }
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

/** @param {Uint8Array} bytes */
export function _bytesToBase64(bytes) {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

/** @param {string} b64 */
export function _base64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// 5 MB cap. Normal payloads are well under 1 MB, so this is already generous.
export const MAX_SYNC_PAYLOAD_BYTES = 5_000_000;

/** @param {string} dataJson */
export async function parseSyncPayload(dataJson) {
  if (typeof dataJson !== 'string' || dataJson.length > MAX_SYNC_PAYLOAD_BYTES) {
    throw new Error('Invalid sync payload: bad type or too large');
  }
  let inner = dataJson;
  if (dataJson.startsWith('GZ|v1|')) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('Invalid sync payload: gzip envelope but no DecompressionStream');
    }
    const b64 = dataJson.slice(6);
    const bytes = _base64ToBytes(b64);
    inner = await _gunzipToStringCapped(bytes, MAX_SYNC_PAYLOAD_BYTES);
  }
  const parsed = JSON.parse(inner);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid sync payload');
  }
  // Defence-in-depth: strip wearableConnections from any incoming blob,
  // regardless of producer version.
  /** @param {any} imp */
  function safe(imp) {
    if (!imp || typeof imp !== 'object') return imp;
    if ('wearableConnections' in imp) {
      const { wearableConnections: _drop, ...rest } = imp;
      return rest;
    }
    return imp;
  }
  if (parsed._v === 4) {
    return { importedData: null, profile: parsed.profile, aiSettings: parsed.aiSettings, chatData: parsed.chatData, displayPrefs: parsed.displayPrefs };
  }
  if (parsed._v === 3) {
    return { importedData: safe(parsed.importedData), profile: parsed.profile, aiSettings: parsed.aiSettings, chatData: parsed.chatData, displayPrefs: parsed.displayPrefs };
  }
  if (parsed._v === 2) {
    return { importedData: safe(parsed.importedData), profile: parsed.profile, aiSettings: parsed.aiSettings, chatData: null, displayPrefs: null };
  }
  if (parsed.entries || parsed.notes || parsed.supplements) {
    return { importedData: safe(parsed), profile: null, aiSettings: null, chatData: null, displayPrefs: null };
  }
  throw new Error('Invalid sync payload: unknown shape');
}
