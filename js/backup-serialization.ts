import { _base64ToBytes as base64ToBytes } from './sync-payload-codec.js';
// JSON encoding for structured-clone-only values contained in backups.

const TYPED_ARRAY_MARKER = '__getbasedUint8Array';

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function legacyObjectToBytes(value: unknown) {
  if (!value || typeof value !== 'object' || value instanceof Uint8Array) return value;
  const keys = Object.keys(value);
  if (!keys.length || !keys.every((key, index) => key === String(index))) return value;
  const bytes = keys.map(key => (value as Record<string, unknown>)[key]);
  return bytes.every(byte => Number.isInteger(byte) && (byte as number) >= 0 && (byte as number) <= 255)
    ? new Uint8Array(bytes as number[])
    : value;
}

export function serializeBackupSnapshot(snapshot: unknown): string | undefined {
  return JSON.stringify(snapshot, (_key, value: unknown) => value instanceof Uint8Array
    ? { [TYPED_ARRAY_MARKER]: bytesToBase64(value) }
    : value, 2);
}

export function parseBackupSnapshot(serialized: string): unknown {
  return JSON.parse(serialized, (_key, value: unknown) => {
    if (value && typeof value === 'object' && typeof (value as Record<string, unknown>)[TYPED_ARRAY_MARKER] === 'string') {
      return base64ToBytes((value as Record<string, unknown>)[TYPED_ARRAY_MARKER] as string);
    }
    if ((value as { _enc?: unknown } | null | undefined)?._enc === 'v1') {
      return { ...value as Record<string, unknown>, iv: legacyObjectToBytes((value as Record<string, unknown>).iv), ct: legacyObjectToBytes((value as Record<string, unknown>).ct) };
    }
    return value;
  });
}
