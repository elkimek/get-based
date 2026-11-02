import { afterEach, beforeEach, expect, it } from 'vitest';
import { appendLabOrderMove, replaceLabOrder, mergeLabOrderRecords } from '../js/lab-ordering-core.js';
import { mergeLabOrderingRows } from '../js/lab-ordering-delta.js';
import { _planKeyedMapDelta, configureSyncDelta, _writeDeltaSnapshot } from '../js/sync-delta.js';
import { _mergeItemRowsIntoImported } from '../js/sync-delta-merge.js';
import { planProfileDeltas } from '../js/sync-push-deltas.js';
import { decodeRowPayload } from '../js/sync-delta-row-codec.js';
import type { DeltaImportedData } from '../js/sync-delta-row-codec.js';
import { ITEM_ROW_QUERY, PROFILE_ID, makeEvolu } from './helpers/sync-runtime-fixture.js';
const a = appendLabOrderMove(null, { item: 'A', after: 'C' }, 'a', 1), b = appendLabOrderMove(null, { item: 'D', before: 'B' }, 'b', 1);
const row = (value: unknown, id = 'row', syncedAt = '2026-10-01T00:00:00Z') => ({ id, profileId: PROFILE_ID, arrayName: 'labOrdering', itemId: 'markers', payload: JSON.stringify({ k: 'markers', v: value }), syncedAt });
function configure(fake = makeEvolu()) { configureSyncDelta({ getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY }); return fake; }
beforeEach(() => { localStorage.clear(); configure(); });
afterEach(() => { configureSyncDelta({ getEvolu: () => null, getItemRowQuery: () => null }); });
it('plans a real keyed ordering row and the top-level profile planner includes it', async () => {
  const plan = await _planKeyedMapDelta(PROFILE_ID, 'labOrdering', { markers: a }); expect(plan.ops).toHaveLength(1); expect(plan.ops[0]).toMatchObject({ kind: 'insert', args: { arrayName: 'labOrdering', itemId: 'markers' } });
  expect(await decodeRowPayload({ payload: plan.ops[0]!.args.payload })).toEqual({ k: 'markers', v: a });
  const all = await planProfileDeltas(PROFILE_ID, { labOrdering: { markers: a } }); expect(all.deltaPlans.some(item => item.arrayName === 'labOrdering')).toBe(true);
});
it('unions observed relay operations before pushing and does not infer deletion from missing local scopes', async () => {
  configure(makeEvolu({ itemRows: [row(b)] })); _writeDeltaSnapshot(PROFILE_ID, 'labOrdering', { absentScope: 'hash' });
  const plan = await _planKeyedMapDelta(PROFILE_ID, 'labOrdering', { markers: a });
  expect(await decodeRowPayload({ payload: plan.ops[0]!.args.payload })).toEqual({ k: 'markers', v: mergeLabOrderRecords(a, b) }); expect(plan.ops[0]!.kind).toBe('update'); expect(plan.ops.some(op => op.kind === 'tombstone')).toBe(false); expect(plan.next.absentScope).toBe('hash');
});
it('rehydrates a partial local snapshot from ordering rows instead of deleting them', async () => {
  configure(makeEvolu({ itemRows: [row(a)] })); const plan = await _planKeyedMapDelta(PROFILE_ID, 'labOrdering', undefined);
  expect(plan.ops).toHaveLength(1); expect(await decodeRowPayload({ payload: plan.ops[0]!.args.payload })).toEqual({ k: 'markers', v: a });
});
it.each([false, true])('pulls concurrent duplicate rows deterministically, reversed=%s', async reversed => {
  const rows = [row(a, 'one', '2026-10-20T00:00:00Z'), row(b, 'two', '2026-09-01T00:00:00Z')];
  configure(makeEvolu({ itemRows: reversed ? rows.reverse() : rows }));
  const imported = await _mergeItemRowsIntoImported(PROFILE_ID, { entries: [{ markers: { untouched: 5 } }] } as DeltaImportedData);
  expect(imported.labOrdering).toEqual({ markers: mergeLabOrderRecords(a, b) }); expect(imported.entries).toEqual([{ markers: { untouched: 5 } }]);
});
it('retains an explicit reset even when a stale row has a newer relay timestamp', async () => {
  const reset = replaceLabOrder(a, null, 'reset', 10), imported: DeltaImportedData = { labOrdering: { markers: reset } };
  await mergeLabOrderingRows(imported, [row(a, 'stale', '2099-01-01T00:00:00Z')]); expect(imported.labOrdering).toEqual({ markers: reset });
  configure(makeEvolu({ itemRows: [row(reset)] })); const push = await _planKeyedMapDelta(PROFILE_ID, 'labOrdering', { markers: a });
  expect(await decodeRowPayload({ payload: push.ops[0]!.args.payload })).toEqual({ k: 'markers', v: reset });
});
it('transport tombstones cannot erase selected ordering or reset history', async () => {
  const reset = replaceLabOrder(a, null, 'reset', 10), imported: DeltaImportedData = { labOrdering: { markers: reset } };
  await mergeLabOrderingRows(imported, [{ ...row(a), isDeleted: 1 }]); expect(imported.labOrdering).toEqual({ markers: reset });
  configure(makeEvolu({ itemRows: [{ ...row(reset), isDeleted: 1 }] })); const push = await _planKeyedMapDelta(PROFILE_ID, 'labOrdering', {});
  expect(push.ops[0]).toMatchObject({ kind: 'update', args: { isDeleted: 0 } }); expect(await decodeRowPayload({ payload: push.ops[0]!.args.payload })).toEqual({ k: 'markers', v: reset });
});
it('repairs a tombstoned or regressed carrier even when the local committed snapshot still has the correct hash', async () => {
  const merged = mergeLabOrderRecords(a, b), plan = await _planKeyedMapDelta(PROFILE_ID, 'labOrdering', { markers: merged }); _writeDeltaSnapshot(PROFILE_ID, 'labOrdering', plan.next);
  configure(makeEvolu({ itemRows: [{ ...row(merged), isDeleted: 1 }] }));
  const resurrection = await _planKeyedMapDelta(PROFILE_ID, 'labOrdering', { markers: merged }); expect(resurrection.ops).toHaveLength(1); expect(resurrection.ops[0]!.args.isDeleted).toBe(0);
  configure(makeEvolu({ itemRows: [row(a)] })); const repair = await _planKeyedMapDelta(PROFILE_ID, 'labOrdering', { markers: merged }); expect(repair.ops).toHaveLength(1);
  expect(await decodeRowPayload({ payload: repair.ops[0]!.args.payload })).toEqual({ k: 'markers', v: merged });
});
it('does not partly change the native map when a later row conflicts or has corrupt JSON', async () => {
  const current = { labOrdering: { markers: a }, entries: [{ private: 'keep' }] }, imported: DeltaImportedData = structuredClone(current), conflicting = appendLabOrderMove(null, { item: 'B', after: 'C' }, 'a', 1);
  await expect(mergeLabOrderingRows(imported, [row(b), row(conflicting)])).rejects.toThrow(/identities/); expect(imported).toEqual(current);
  await expect(mergeLabOrderingRows(imported, [row(b), { ...row(a), payload: '{broken' }])).rejects.toThrow(); expect(imported).toEqual(current);
});
it('ignores payload/key substitution, unsafe IDs and other-profile rows', async () => {
  const imported: DeltaImportedData = { labOrdering: { markers: a } }, before = structuredClone(imported);
  await mergeLabOrderingRows(imported, [{ ...row(b), itemId: 'different' }, { ...row(b), itemId: '__proto__', payload: JSON.stringify({ k: '__proto__', v: b }) }]); expect(imported).toEqual(before);
  configure(makeEvolu({ itemRows: [{ ...row(b), profileId: 'other' }] })); expect((await _mergeItemRowsIntoImported(PROFILE_ID, imported)).labOrdering).toEqual(before.labOrdering);
});
it('preserves opaque future metadata and avoids repushing a committed canonical snapshot', async () => {
  const future = { version: 99, nested: { b: true, a: 'opaque' } }, plan = await _planKeyedMapDelta(PROFILE_ID, 'labOrdering', { future });
  _writeDeltaSnapshot(PROFILE_ID, 'labOrdering', plan.next); expect((await _planKeyedMapDelta(PROFILE_ID, 'labOrdering', { future: { nested: { a: 'opaque', b: true }, version: 99 } })).ops).toEqual([]);
  const imported: DeltaImportedData = {}; await mergeLabOrderingRows(imported, [{ ...row(future), itemId: 'future', payload: JSON.stringify({ k: 'future', v: future }) }]); expect(imported.labOrdering).toEqual({ future });
});
it('blocks a push that would overwrite a conflicting relay operation identity', async () => {
  const conflicting = appendLabOrderMove(null, { item: 'B', after: 'C' }, 'a', 1); configure(makeEvolu({ itemRows: [row(conflicting)] }));
  await expect(_planKeyedMapDelta(PROFILE_ID, 'labOrdering', { markers: a })).rejects.toThrow(/identities/);
});
it('keeps generated rows within the existing native decompression budget', async () => {
  await expect(_planKeyedMapDelta(PROFILE_ID, 'labOrdering', { future: { version: 99, unknown: 'x'.repeat(1024 * 1024) } })).rejects.toThrow(/transport limit/);
  const imported: DeltaImportedData = { labOrdering: { markers: a } }, before = structuredClone(imported);
  await expect(mergeLabOrderingRows(imported, [row({ version: 99, unknown: 'x'.repeat(1024 * 1024) })])).rejects.toThrow(/transport limit/); expect(imported).toEqual(before);
});

it.each([false, true])('restores the deterministic physical carrier beyond observed future clocks: reversed=%s', async reversed => {
  const future = '2099-01-01T00:00:00.000Z';
  const rows = [row(a, 'live', future), { ...row(b, 'deleted', future), isDeleted: 1 }];
  configure(makeEvolu({ itemRows: reversed ? [...rows].reverse() : rows }));
  const plan = await _planKeyedMapDelta(PROFILE_ID, 'labOrdering', { markers: a });
  expect(plan.ops).toHaveLength(1);
  expect(plan.ops[0]).toMatchObject({ kind: 'update', args: { id: 'deleted', isDeleted: 0 } });
  expect(Date.parse(String(plan.ops[0]!.args.syncedAt))).toBeGreaterThan(Date.parse(future));
  expect(await decodeRowPayload({ payload: plan.ops[0]!.args.payload })).toEqual({ k: 'markers', v: mergeLabOrderRecords(a, b) });
});
