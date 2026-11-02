// Portable presentation-order intent. Reset generations cannot be revived by stale peers.
import { validLabOrderAddress as validLabOrderId } from '../shared/lab-ordering-control-contract.js';
export { validLabOrderId };
export interface LabOrderMove { item: string; before?: string; after?: string }
export interface LabOrderEvent extends LabOrderMove { id: string; at: number; [key: string]: unknown }
export interface LabOrderGeneration { id: string; at: number; [key: string]: unknown }
export interface LabOrderRecord { version: 1; generation: LabOrderGeneration; commands: LabOrderEvent[]; cancelled?: string[]; [key: string]: unknown }
export const MAX_LAB_ORDER_BYTES = 750_000;
type OrderData = { labOrdering?: unknown; [key: string]: unknown };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const clock = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15;
const eventId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => object(entry) ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : entry);
}
export function labOrderingMap(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (!object(raw)) throw new Error('Review the saved lab ordering in its native editor.');
  return raw;
}
export function parseLabOrderMove(value: unknown): LabOrderMove {
  if (!object(value) || Object.keys(value).some(key => !['item', 'before', 'after'].includes(key)) || !validLabOrderId(value.item)
    || Object.hasOwn(value, 'before') === Object.hasOwn(value, 'after')) throw new Error('Move one exact item before OR after one exact anchor.');
  const anchor = value.before ?? value.after;
  if (!validLabOrderId(anchor) || anchor === value.item) throw new Error('Choose a different exact ordering anchor.');
  return Object.hasOwn(value, 'before') ? { item: value.item, before: anchor } : { item: value.item, after: anchor };
}
export function parseLabOrderRecord(raw: unknown): LabOrderRecord {
  if (raw == null) return { version: 1, generation: { id: 'base', at: 0 }, commands: [] };
  if (!object(raw) || raw.version !== 1 || !object(raw.generation) || !eventId(raw.generation.id) || !clock(raw.generation.at)
    || !Array.isArray(raw.commands) || raw.commands.length > 5000) throw new Error('Review this saved lab order before changing it.');
  if (new TextEncoder().encode(JSON.stringify(raw)).byteLength > MAX_LAB_ORDER_BYTES) throw new Error('Review and reset this order natively before adding another move.');
  const generation = { ...raw.generation, id: raw.generation.id, at: raw.generation.at };
  if (Object.hasOwn(raw, 'cancelled') && (!Array.isArray(raw.cancelled) || raw.cancelled.length > 5000 || raw.cancelled.some(id => !eventId(id)))) throw new Error('Review the saved ordering cancellation history.');
  const cancelled = Array.isArray(raw.cancelled) ? [...new Set(raw.cancelled as string[])].sort() : undefined;
  const ids = new Set<string>();
  const commands = raw.commands.map(value => {
    if (!object(value) || !eventId(value.id) || !clock(value.at) || value.at <= generation.at || ids.has(value.id)) throw new Error('Conflicting lab ordering commands require native review.');
    const move = parseLabOrderMove({ item: value.item, ...(Object.hasOwn(value, 'before') ? { before: value.before } : {}), ...(Object.hasOwn(value, 'after') ? { after: value.after } : {}) });
    ids.add(value.id); return { ...value, ...move, id: value.id, at: value.at };
  }).sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { ...raw, version: 1, generation, commands, ...(cancelled ? { cancelled } : {}) };
}
function extra(record: LabOrderRecord) { return Object.fromEntries(Object.entries(record).filter(([key]) => !['version', 'generation', 'commands', 'cancelled'].includes(key))); }
const generationExtra = (value: LabOrderGeneration) => Object.fromEntries(Object.entries(value).filter(([key]) => !['id', 'at'].includes(key)));
const eventContent = (value: LabOrderEvent) => Object.fromEntries(Object.entries(value).filter(([key]) => !['id', 'at'].includes(key)));
const hasFutureCommandMetadata = (value: LabOrderEvent) => Object.keys(value).some(key => !['id', 'at', 'item', 'before', 'after'].includes(key));
function mergeOpaque(a: Record<string, unknown>, b: Record<string, unknown>) {
  for (const key of Object.keys(a)) if (Object.hasOwn(b, key) && canonical(a[key]) !== canonical(b[key])) throw new Error('Unknown ordering metadata conflicts. Keep both profiles for native review.');
  return { ...a, ...b };
}
export function mergeLabOrderRecords(left: unknown, right: unknown): LabOrderRecord {
  const a = parseLabOrderRecord(left), b = parseLabOrderRecord(right);
  const metadata = mergeOpaque(extra(a), extra(b));
  const generationMetadata = mergeOpaque(generationExtra(a.generation), generationExtra(b.generation));
  if (a.generation.at !== b.generation.at || a.generation.id !== b.generation.id) {
    const winner = a.generation.at > b.generation.at || a.generation.at === b.generation.at && a.generation.id > b.generation.id ? a : b, older = winner === a ? b : a;
    for (const row of older.commands) if (hasFutureCommandMetadata(row) && !winner.commands.some(other => canonical(eventContent(other)) === canonical(eventContent(row)))) throw new Error('Unknown ordering command metadata needs native review before reset.');
    return parseLabOrderRecord(structuredClone({ ...metadata, ...winner, generation: { ...generationMetadata, ...winner.generation } }));
  }
  const generation = mergeOpaque(a.generation, b.generation);
  const commands = new Map(a.commands.map(row => [row.id, row]));
  for (const row of b.commands) {
    if (commands.has(row.id) && canonical(commands.get(row.id)) !== canonical(row)) throw new Error('Conflicting lab ordering operation identities require native review.');
    commands.set(row.id, row);
  }
  return parseLabOrderRecord({ ...metadata, version: 1, generation, commands: [...commands.values()],
    ...(a.cancelled || b.cancelled ? { cancelled: [...new Set([...(a.cancelled || []), ...(b.cancelled || [])])] } : {}) });
}
export function mergeLabOrdering(left: unknown, right: unknown): Record<string, unknown> {
  const a = labOrderingMap(left), b = labOrderingMap(right), result = { ...a };
  for (const [scope, value] of Object.entries(b)) {
    if (!Object.hasOwn(a, scope)) Object.defineProperty(result, scope, { value: structuredClone(value), enumerable: true, configurable: true, writable: true });
    else if (canonical(a[scope]) !== canonical(value)) {
      if (!validLabOrderId(scope)) throw new Error('Unknown lab order scope conflicts require native review.');
      result[scope] = mergeLabOrderRecords(a[scope], value);
    }
  }
  return result;
}
export function labOrderingNeedsRebroadcast(left: unknown, right: unknown) {
  return canonical(mergeLabOrdering(left, right)) !== canonical(labOrderingMap(right));
}
function nextClock(record: LabOrderRecord, now: number) {
  const next = Math.max(now, record.generation.at + 1, ...record.commands.map(row => row.at + 1));
  if (!clock(next)) throw new Error('The lab ordering clock cannot be advanced safely.');
  return next;
}
export function appendLabOrderMove(raw: unknown, move: LabOrderMove, id: string, now = Date.now()): LabOrderRecord {
  const command = parseLabOrderMove(move), record = parseLabOrderRecord(raw);
  if (!eventId(id) || record.commands.some(row => row.id === id) || record.cancelled?.includes(id)) throw new Error('Read a fresh ordering review.');
  if (record.commands.length >= 5000) throw new Error('Review and reset this order natively before adding another move.');
  return parseLabOrderRecord({ ...record, commands: [...record.commands, { ...command, id, at: nextClock(record, now) }] });
}
/** Selective Undo retains peer operations, including ones not observed when Apply committed. */
export function cancelLabOrderMove(raw: unknown, id: string): LabOrderRecord {
  const record = parseLabOrderRecord(raw);
  if (!eventId(id) || !record.commands.some(row => row.id === id) || record.cancelled?.includes(id)) throw new Error('This ordering move is unavailable or already undone.');
  return parseLabOrderRecord({ ...record, cancelled: [...(record.cancelled || []), id] });
}
export function replaceLabOrder(raw: unknown, source: unknown, id: string, now = Date.now()): LabOrderRecord {
  if (!eventId(id) || id.length > 74) throw new Error('Choose a fresh ordering operation.');
  const before = parseLabOrderRecord(raw), restored = parseLabOrderRecord(source);
  const generation = { ...mergeOpaque(generationExtra(before.generation), generationExtra(restored.generation)), id, at: Math.max(nextClock(before, now), nextClock(restored, now)) };
  if (generation.id === before.generation.id) throw new Error('Choose a fresh ordering generation.');
  for (const row of before.commands) if (hasFutureCommandMetadata(row) && !restored.commands.some(other => canonical(other) === canonical(row))) throw new Error('Unknown ordering command metadata needs native review before reset.');
  // A restore is a new explicit generation, not a replay of old sync authority.
  return parseLabOrderRecord({ ...mergeOpaque(extra(before), extra(restored)), version: 1, generation,
    commands: restored.commands.map((row, index) => ({ ...row, id: `${id}_${index}`, at: generation.at + index + 1 })),
    ...(restored.cancelled ? { cancelled: restored.commands.flatMap((row, index) => restored.cancelled!.includes(row.id) ? [`${id}_${index}`] : []) } : {}) });
}
export function writeLabOrder(data: OrderData, scope: string, value: LabOrderRecord) {
  if (!validLabOrderId(scope)) throw new Error('Choose an exact lab order scope.');
  data.labOrdering = { ...labOrderingMap(data.labOrdering), [scope]: parseLabOrderRecord(value) };
}
export function projectLabOrder<T>(entries: readonly T[], identify: (value: T) => string, raw: unknown): T[] {
  const result = [...entries], record = parseLabOrderRecord(raw), known = new Set(entries.map(identify));
  if (known.size !== entries.length) throw new Error('Ambiguous lab ordering identities require native review.');
  for (const move of record.commands) {
    if (record.cancelled?.includes(move.id)) continue;
    const anchor = move.before ?? move.after!;
    if (!known.has(move.item) || !known.has(anchor)) continue;
    const index = result.findIndex(value => identify(value) === move.item), [item] = result.splice(index, 1), at = result.findIndex(value => identify(value) === anchor);
    result.splice(at + (move.after ? 1 : 0), 0, item!);
  }
  return result;
}
/** Malformed foreign preferences never erase or reorder native display data. */
export function projectNativeLabOrder<T>(entries: readonly T[], identify: (value: T) => string, raw: unknown, scope: string): T[] {
  try { const record = parseLabOrderRecord(labOrderingMap(raw)[scope]); return record.commands.length ? projectLabOrder(entries, identify, record) : [...entries]; } catch { return [...entries]; }
}
