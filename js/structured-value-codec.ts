// Unambiguous structured-clone values shared by encrypted storage and migration.
import { bytesToBase64, _base64ToBytes } from './base64.js';

const TAG = '__getbasedMigrationValue';
type Tagged = { [TAG]: [string, unknown] };
export function encodeStructuredValue(value: unknown): string {
  const seen = new Set<object>();
  const encode = (item: unknown, depth = 0): unknown => {
    if (depth > 100) throw new Error('A migration record is nested too deeply.');
    if (item === undefined) return {[TAG]: ['undefined', null]};
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('A migration record contains a non-finite number.');
    if (item === null || typeof item === 'string' || typeof item === 'boolean' || typeof item === 'number') return item;
    if (typeof item !== 'object') throw new Error('A migration record contains an unsupported value.');
    if (item instanceof Uint8Array) return {[TAG]: ['bytes', bytesToBase64(item)]};
    if (item instanceof ArrayBuffer) return {[TAG]: ['buffer', bytesToBase64(new Uint8Array(item))]};
    if (item instanceof Date) return {[TAG]: ['date', item.toISOString()]};
    if (seen.has(item)) throw new Error('A migration record contains a circular value.');
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
      throw new Error('A migration record contains a non-portable browser object.');
    }
    seen.add(item);
    let result: unknown;
    if (Array.isArray(item)) result = item.map(entry => encode(entry, depth + 1));
    else {
      const entries = Object.entries(item).map(([key, entry]) => [key, encode(entry, depth + 1)]);
      result = Object.hasOwn(item, TAG) ? {[TAG]: ['object', entries]} : Object.fromEntries(entries);
    }
    seen.delete(item); return result;
  };
  return JSON.stringify(encode(value));
}

export function decodeStructuredValue(serialized: string): unknown {
  const decode = (item: unknown, depth = 0): unknown => {
    if (depth > 100) throw new Error('A migration record is nested too deeply.');
    if (!item || typeof item !== 'object') return item;
    if (Object.hasOwn(item, TAG)) {
      const tag = (item as Tagged)[TAG];
      if (!Array.isArray(tag) || tag.length !== 2 || Object.keys(item).length !== 1) throw new Error('Invalid migration value.');
      const [kind, value] = tag;
      if (kind === 'undefined' && value === null) return undefined;
      if ((kind === 'bytes' || kind === 'buffer') && typeof value === 'string') {
        const bytes = _base64ToBytes(value); return kind === 'buffer' ? bytes.buffer : bytes;
      }
      if (kind === 'date' && typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value);
      if (kind === 'object' && Array.isArray(value)) return Object.fromEntries(value.map(pair => {
        if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string') throw new Error('Invalid migration object.');
        return [pair[0], decode(pair[1], depth + 1)];
      }));
      throw new Error('Unsupported migration value.');
    }
    return Array.isArray(item) ? item.map(entry => decode(entry, depth + 1))
      : Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, decode(entry, depth + 1)]));
  };
  return decode(JSON.parse(serialized));
}
