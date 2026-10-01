// sync-delta-row-codec.js - Shared itemRow payload decoding for delta merge paths.

export interface DeltaItemRow {
  payload: unknown;
  itemId: string;
  profileId?: unknown;
  arrayName?: string;
  syncedAt?: unknown;
  isDeleted?: unknown;
  [key: string]: unknown;
}
export interface DeltaImportedData extends Record<string, unknown> {
  genetics?: Record<string, unknown> | null | undefined;
  _deleted?: Record<string, unknown> | null;
}

import { _base64ToBytes, _gunzipToStringCapped } from './sync-payload-codec.js';

export async function decodeRowPayload(row: Pick<DeltaItemRow, 'payload'>): Promise<unknown> {
  let json = row.payload;
  if (typeof json === 'string' && json.startsWith('GZ|v1|')) {
    if (typeof DecompressionStream === 'undefined') return null;
    json = await _gunzipToStringCapped(_base64ToBytes(json.slice(6)));
  }
  return JSON.parse(json as string);
}
