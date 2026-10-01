// sync-delta-row-codec.js - ItemRow wire contracts, live mutations and decoding.

export interface DeltaItemRow {
  payload: unknown;
  itemId: string;
  profileId?: unknown;
  arrayName?: string;
  syncedAt?: unknown;
  isDeleted?: unknown;
  [key: string]: unknown;
}
export interface DeltaMutationArgs {
  id?: unknown;
  payload?: string;
  isDeleted?: unknown;
  [key: string]: unknown;
}
export interface DeltaPlannedOperation {
  kind: 'insert' | 'update' | 'tombstone';
  args: DeltaMutationArgs;
}
export interface DeltaPlan {
  ops: DeltaPlannedOperation[];
  next: Record<string, unknown>;
  plannedAt: number;
}

export interface DeltaImportedData extends Record<string, unknown> {
  genetics?: Record<string, unknown> | null | undefined;
  _deleted?: Record<string, unknown> | null;
}

export interface DeltaWriteFields extends Record<string, unknown> {
  profileId: string;
  arrayName: string;
  itemId: string;
  payload: string;
  syncedAt: string;
}

/** Construct a final wire-row mutation; planners choose timing and explicit resurrection flags. */
export function createDeltaWrite(
  existing: DeltaItemRow | null | undefined, fields: DeltaWriteFields,
  resurrect: { isDeleted?: null | undefined },
): DeltaPlannedOperation {
  if (existing) return { kind: 'update', args: { id: existing.id, ...fields, ...resurrect } };
  return { kind: 'insert', args: fields };
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
