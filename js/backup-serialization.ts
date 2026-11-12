import { bytesToBase64 } from './base64.js';
import { _base64ToBytes as base64ToBytes } from './sync-payload-codec.js';
// JSON encoding for structured-clone-only values contained in backups.

const TYPED_ARRAY_MARKER = '__getbasedUint8Array';
const ARRAY_BUFFER_MARKER = '__getbasedArrayBuffer';

function legacyObjectToBytes(value: unknown) {
  if (!value || typeof value !== 'object' || value instanceof Uint8Array) return value;
  const keys = Object.keys(value);
  if (!keys.length || !keys.every((key, index) => key === String(index))) return value;
  const bytes = keys.map(key => (value as Record<string, unknown>)[key]);
  return bytes.every(byte => Number.isInteger(byte) && (byte as number) >= 0 && (byte as number) <= 255)
    ? new Uint8Array(bytes as number[])
    : value;
}

export function serializeBackupSnapshot(snapshot: unknown, spacing = 2): string | undefined {
  return JSON.stringify(snapshot, (_key, value: unknown) => value instanceof Uint8Array
    ? { [TYPED_ARRAY_MARKER]: bytesToBase64(value) }
    : value instanceof ArrayBuffer ? { [ARRAY_BUFFER_MARKER]: bytesToBase64(new Uint8Array(value)) } : value, spacing);
}

export function parseBackupSnapshot(serialized: string): unknown {
  return JSON.parse(serialized, (_key, value: unknown) => {
    if (value && typeof value === 'object' && typeof (value as Record<string, unknown>)[ARRAY_BUFFER_MARKER] === 'string') {
      return base64ToBytes((value as Record<string, unknown>)[ARRAY_BUFFER_MARKER] as string).buffer;
    }
    if (value && typeof value === 'object' && typeof (value as Record<string, unknown>)[TYPED_ARRAY_MARKER] === 'string') {
      return base64ToBytes((value as Record<string, unknown>)[TYPED_ARRAY_MARKER] as string);
    }
    if ((value as { _enc?: unknown } | null | undefined)?._enc === 'v1') {
      return { ...value as Record<string, unknown>, iv: legacyObjectToBytes((value as Record<string, unknown>).iv), ct: legacyObjectToBytes((value as Record<string, unknown>).ct) };
    }
    return value;
  });
}
