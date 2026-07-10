// @ts-check
// JSON encoding for structured-clone-only values contained in backups.

const TYPED_ARRAY_MARKER = '__getbasedUint8Array';

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function legacyObjectToBytes(value) {
  if (!value || typeof value !== 'object' || value instanceof Uint8Array) return value;
  const keys = Object.keys(value);
  if (!keys.length || !keys.every((key, index) => key === String(index))) return value;
  const bytes = keys.map(key => value[key]);
  return bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    ? new Uint8Array(bytes)
    : value;
}

export function serializeBackupSnapshot(snapshot) {
  return JSON.stringify(snapshot, (_key, value) => value instanceof Uint8Array
    ? { [TYPED_ARRAY_MARKER]: bytesToBase64(value) }
    : value, 2);
}

export function parseBackupSnapshot(serialized) {
  return JSON.parse(serialized, (_key, value) => {
    if (value && typeof value === 'object' && typeof value[TYPED_ARRAY_MARKER] === 'string') {
      return base64ToBytes(value[TYPED_ARRAY_MARKER]);
    }
    if (value?._enc === 'v1') {
      return { ...value, iv: legacyObjectToBytes(value.iv), ct: legacyObjectToBytes(value.ct) };
    }
    return value;
  });
}
