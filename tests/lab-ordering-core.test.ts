import { describe, expect, it } from 'vitest';
import { appendLabOrderMove as move, replaceLabOrder, parseLabOrderMove, parseLabOrderRecord, mergeLabOrderRecords, mergeLabOrdering, labOrderingNeedsRebroadcast, projectLabOrder, projectNativeLabOrder, writeLabOrder } from '../js/lab-ordering-core.js';
const order = (raw: unknown, entries = ['A', 'B', 'C', 'D']) => projectLabOrder(entries, value => value, raw);
describe('portable lab ordering', () => {
  it('preserves native defaults when untouched and moves only the explicit selected item', () => {
    const entries = ['D', 'B', 'C', 'A'];
    expect(order(null, entries)).toEqual(entries);
    const saved = move(null, { item: 'A', before: 'C' }, 'one', 1);
    expect(order(saved, entries)).toEqual(['D', 'B', 'A', 'C']); expect(entries).toEqual(['D', 'B', 'C', 'A']);
  });
  it('retains earlier moves when moving the same item again', () => {
    const a = move(null, { item: 'A', after: 'C' }, 'a', 1), b = move(a, { item: 'B', after: 'A' }, 'b', 1), c = move(b, { item: 'A', before: 'C' }, 'c', 1);
    expect(order(c)).toEqual(['A', 'C', 'B', 'D']); expect(c.commands.map(row => row.at)).toEqual([1, 2, 3]);
  });
  it('keeps supported numeric and underscore custom marker addresses intact', () => {
    const items = ['24hPanel.1a', '_panel._test', '-panel.marker'];
    expect(order(move(null, { item: '-panel.marker', before: '24hPanel.1a' }, 'move', 1), items)).toEqual(['-panel.marker', '24hPanel.1a', '_panel._test']);
  });
  it('does not recreate removed items or redirect a missing anchor', () => {
    const saved = move(null, { item: 'A', after: 'C' }, 'one', 1);
    expect(order(saved, ['A', 'B', 'D'])).toEqual(['A', 'B', 'D']); expect(order(saved, ['B', 'C', 'D'])).toEqual(['B', 'C', 'D']);
    expect(order(saved, ['A', 'B', 'E', 'C', 'D'])).toEqual(['B', 'E', 'C', 'A', 'D']);
  });
  it('converges on concurrent moves in either sync direction, independent of map insertion order', () => {
    const a = move(null, { item: 'A', after: 'C' }, 'a', 10), b = move(null, { item: 'D', before: 'B' }, 'b', 10);
    const ab = mergeLabOrderRecords(a, b), ba = mergeLabOrderRecords(b, a);
    expect(ab).toEqual(ba); expect(order(ab)).toEqual(['D', 'B', 'C', 'A']); expect(mergeLabOrderRecords(ab, ab)).toEqual(ab);
    expect(mergeLabOrdering({ markers: a, other: { future: true } }, { markers: b })).toEqual({ markers: ab, other: { future: true } });
    expect(labOrderingNeedsRebroadcast({ markers: a }, { markers: b })).toBe(true); expect(labOrderingNeedsRebroadcast({ markers: a }, { markers: ab })).toBe(false);
  });
  it('does not revive an older generation even when a stale peer adds a later move', () => {
    const a = move(null, { item: 'A', after: 'D' }, 'a', 10), reset = replaceLabOrder(a, null, 'reset', 20), stale = move(a, { item: 'B', after: 'D' }, 'stale', 100);
    expect(order(mergeLabOrderRecords(reset, stale))).toEqual(['A', 'B', 'C', 'D']); expect(mergeLabOrderRecords(stale, reset)).toEqual(reset);
  });
  it('restores an exact previous intent as a fresh generation and merges later edits to it', () => {
    const a = move(null, { item: 'A', after: 'C' }, 'a', 10), b = move(a, { item: 'D', before: 'B' }, 'b', 20), undo = replaceLabOrder(b, a, 'undo', 30);
    expect(order(undo)).toEqual(order(a)); expect(undo.generation.at).toBeGreaterThan(b.commands[1]!.at);
    const next = move(undo, { item: 'B', after: 'D' }, 'next', 31); expect(order(mergeLabOrderRecords(b, next))).toEqual(order(next));
  });
  it('keeps unknown future metadata through append, reset and merges, or refuses conflicting metadata', () => {
    const base = { ...parseLabOrderRecord(null), future: { unit: 'presentation' }, generation: { id: 'base', at: 0, future: 9 } };
    const a = move(base, { item: 'A', after: 'C' }, 'a', 1), reset = replaceLabOrder(a, null, 'reset', 2);
    expect(reset.future).toEqual(base.future); expect(reset.generation.future).toBe(9);
    expect(mergeLabOrderRecords(a, { ...base, other: true }).other).toBe(true);
    expect(() => mergeLabOrderRecords(a, { ...a, future: false })).toThrow(/metadata/);
    expect(() => mergeLabOrderRecords(a, { ...a, generation: { ...a.generation, future: 8 } })).toThrow(/metadata/);
    expect(() => replaceLabOrder(a, { ...a, future: 'unknown' }, 'reset', 2)).toThrow(/metadata/);
  });
  it('does not delete unknown future command metadata during reset', () => {
    const saved = move(null, { item: 'A', before: 'B' }, 'a', 1); saved.commands[0]!.future = { keep: true };
    expect(() => replaceLabOrder(saved, null, 'reset', 2)).toThrow(/command metadata/);
    expect(replaceLabOrder(saved, saved, 'restore', 2).commands[0]!.future).toEqual({ keep: true });
  });
  it('preserves late future generation metadata across peer resets and refuses unknown command loss', () => {
    const older = move(null, { item: 'A', before: 'B' }, 'a', 1), reset = replaceLabOrder(older, null, 'reset', 2);
    older.generation.future = { keep: true }; expect(mergeLabOrderRecords(older, reset).generation.future).toEqual({ keep: true });
    older.commands[0]!.future = { keep: true }; expect(() => mergeLabOrderRecords(reset, older)).toThrow(/command metadata/);
    const restored = replaceLabOrder(older, older, 'restore', 3); expect(mergeLabOrderRecords(older, restored)).toEqual(restored);
  });
  it('does not read marker identities when no native ordering moves exist', () => {
    const marker = { get id(): never { throw new Error('unexpected native getter'); } };
    expect(projectNativeLabOrder([marker], row => row.id, undefined, 'markers')).toEqual([marker]);
    expect(projectNativeLabOrder([marker], row => row.id, { markers: parseLabOrderRecord(null) }, 'markers')).toEqual([marker]);
  });
  it('rejects inconsistent operation identities rather than silently choosing one edit', () => {
    const a = move(null, { item: 'A', after: 'C' }, 'a', 1), b = move(null, { item: 'B', after: 'C' }, 'a', 1);
    expect(() => mergeLabOrderRecords(a, b)).toThrow(/identities/); expect(() => move(a, { item: 'A', after: 'B' }, 'a', 2)).toThrow(/fresh/);
  });
  it.each([{ item: 'A' }, { item: 'A', before: 'B', after: 'C' }, { item: 'A', before: 'A' }, { item: '__proto__', before: 'B' }, { item: 'A', before: 'B', settings: true }, { item: 'A', before: undefined }, { item: 'constructor.X', after: 'B' }])('rejects ambiguous or unsafe move %j', value => {
    expect(() => parseLabOrderMove(value)).toThrow();
  });
  it('does not mutate or discard malformed future preferences when projecting a native view', () => {
    const data = { markers: { version: 99, future: true } }, before = structuredClone(data);
    expect(projectNativeLabOrder(['C', 'B', 'A'], value => value, data, 'markers')).toEqual(['C', 'B', 'A']); expect(data).toEqual(before);
    expect(() => mergeLabOrdering(data, { markers: null })).toThrow(); expect(() => parseLabOrderRecord({ ...parseLabOrderRecord(null), commands: [{ id: 'a', at: 0, item: 'A', after: 'B' }] })).toThrow();
  });
  it('rejects ambiguous view identities and unsafe clocks without modifying data', () => {
    expect(() => projectLabOrder(['A', 'A'], value => value, null)).toThrow(/Ambiguous/);
    expect(() => move(null, { item: 'A', before: 'B' }, 'a', NaN)).toThrow(/clock/);
    const saved = move(null, { item: 'A', before: 'B' }, 'a', 8.64e15);
    expect(() => move(saved, { item: 'C', before: 'B' }, 'b', 1)).toThrow(/clock/);
    expect(() => replaceLabOrder(saved, saved, 'reset', 1)).toThrow(/clock/);
  });
  it('requires a native reset when the bounded intent history is full', () => {
    const full = parseLabOrderRecord({ version: 1, generation: { id: 'base', at: 0 }, commands: Array.from({ length: 5000 }, (_, i) => ({ id: `n${i}`, at: i + 1, item: 'A', before: 'B' })) });
    expect(() => move(full, { item: 'A', after: 'B' }, 'extra', 6000)).toThrow(/reset/);
    expect(replaceLabOrder(full, null, 'reset', 6000).commands).toHaveLength(0);
    expect(() => replaceLabOrder(null, full, 'x'.repeat(80), 6000)).toThrow(/fresh/);
  });
  it('bounds serialized Unicode metadata before creating an order that cannot travel through native sync', () => {
    expect(() => parseLabOrderRecord({ ...parseLabOrderRecord(null), future: '🧬'.repeat(200_000) })).toThrow(/reset/);
  });
  it('writes exactly one scope without changing another scope or clinical/source data', () => {
    const data = { labOrdering: { other: { future: true } }, entries: [{ date: '2026-10-01', markers: { 'biochemistry.glucose': 5.5 }, markerSources: { 'biochemistry.glucose': { lab: 'Synthetic source' } } }] }, before = structuredClone(data);
    writeLabOrder(data, 'markers.biochemistry', move(null, { item: 'A', after: 'B' }, 'move', 1));
    expect(data.entries).toEqual(before.entries); expect(data.labOrdering.other).toEqual(before.labOrdering.other); expect(() => writeLabOrder(data, '__proto__', parseLabOrderRecord(null))).toThrow();
  });
});
