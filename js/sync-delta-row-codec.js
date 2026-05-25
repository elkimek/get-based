// sync-delta-row-codec.js - Shared itemRow payload decoding for delta merge paths.

import { _base64ToBytes, _gunzipToStringCapped } from './sync-payload.js';

export async function decodeRowPayload(row) {
  let json = row.payload;
  if (typeof json === 'string' && json.startsWith('GZ|v1|')) {
    if (typeof DecompressionStream === 'undefined') return null;
    json = await _gunzipToStringCapped(_base64ToBytes(json.slice(6)));
  }
  return JSON.parse(json);
}
