import { encodeStructuredValue, decodeStructuredValue } from './structured-value-codec.js';

const PREFIX = 'getbased-storage:1\n';
/** Ordinary JSON keeps its existing wire bytes. Only binary payloads use the
 * tagged encoding; its non-JSON prefix cannot collide with legacy JSON data. */
export function serializeProtectedStorageObject(value: unknown): string {
  let binary = false;
  const legacy = JSON.stringify(value, (_key, item: unknown) => {
    if (item instanceof Uint8Array || item instanceof ArrayBuffer) binary = true;
    return item;
  });
  if (typeof legacy !== 'string') throw new Error('An encrypted object must contain serializable data.');
  return binary ? PREFIX + encodeStructuredValue(value) : legacy;
}
export function parseProtectedStorageObject(serialized: string): unknown {
  return serialized.startsWith(PREFIX) ? decodeStructuredValue(serialized.slice(PREFIX.length)) : JSON.parse(serialized);
}
