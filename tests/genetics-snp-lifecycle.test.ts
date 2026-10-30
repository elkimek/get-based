import { afterEach, beforeEach, expect, it } from 'vitest';
import { mergeImportedData } from '../js/data-merge.js';
import { mergeMapRowsIntoImported } from '../js/sync-delta-map-merge.js';
import { configureSyncDelta } from '../js/sync-delta.js';
import { planProfileDeltas } from '../js/sync-push-deltas.js';
import { makeEvolu, ITEM_ROW_QUERY, PROFILE_ID, writeSnapshot } from './helpers/sync-runtime-fixture.js';
import type { DeltaItemRow, DeltaImportedData } from '../js/sync-delta-row-codec.js';
import { _mergeItemRowsIntoImported } from '../js/sync-delta-merge.js';
import { mergeProfileMutation } from '../js/profile-data-writes.js';
import { localHasRowsRemoteLacks } from '../js/data-merge.js';
import { mergeGeneticsSnpStates, reconcileGeneticsSnpState } from '../js/genetics-snp-lifecycle.js';
import { upsertGeneticsWithCatalog, removeGeneticsSnpWithCatalog } from '../js/genetics-mutations.js';
import { decodeRowPayload } from '../js/sync-delta-row-codec.js';
import { readFileSync } from 'node:fs';
import type { SnpCatalog } from '../js/dna-evidence.js';
import type { DnaProfileData } from '../js/dna-runtime.js';

const call = (genotype: string, updatedAt: number) => ({ genotype, normalizedGenotype: genotype, gene: 'APOE', updatedAt, effect: 'none' });
const state = (deletedAt: number, restoredAt = 0) => ({ deletedAt, restoredAt, updatedAt: Math.max(deletedAt, restoredAt) });
const row = (arrayName: string, id: string, value: unknown): DeltaItemRow & { payload: string } => ({ id: `${arrayName}-${id}`, profileId: PROFILE_ID, arrayName, itemId: id, payload: JSON.stringify({ k: id, v: value }), syncedAt: '2026-10-24T12:00:00Z' });
const catalog = JSON.parse(readFileSync('data/snp-health.json', 'utf8')) as SnpCatalog;
beforeEach(() => { localStorage.clear(); configureSyncDelta({ getEvolu: () => null, getItemRowQuery: () => null }); });
afterEach(() => configureSyncDelta({ getEvolu: () => null, getItemRowQuery: () => null }));

it('preserves a newer exact SNP call through both profile blob merge orders', () => {
  const fresh = { genetics: { snps: { rs429358: call('CT', 200), rs7412: call('CC', 100) }, apoe: 'ε3/ε4' } };
  const old = { genetics: { snps: { rs429358: call('TT', 100), rs7412: call('CC', 100) }, apoe: 'ε3/ε3' } };
  for (const [a, b] of [[fresh, old], [old, fresh]]) expect(mergeImportedData(a!, b!)!.genetics!.snps.rs429358.genotype).toBe('CT');
});
it('refuses a stale live SNP row after a newer local assignment', async () => {
  const imported = { genetics: { snps: { rs429358: call('CT', 200) } } };
  await mergeMapRowsIntoImported(imported, 'genetics.snps', [row('genetics.snps', 'rs429358', call('TT', 100))]);
  expect(imported.genetics.snps.rs429358.genotype).toBe('CT');
});
it('does not revive a removed SNP from a stale row', async () => {
  const imported: DeltaImportedData = { genetics: { snps: {} }, geneticsSnpTombstones: { rs429358: state(200) } };
  await mergeMapRowsIntoImported(imported, 'genetics.snps', [row('genetics.snps', 'rs429358', call('TT', 100))]);
  expect(imported.genetics!.snps).toEqual({});
});
it('carries explicit removal history and does not rehydrate the last removed call while planning a push', async () => {
  const fake = makeEvolu({ itemRows: [row('genetics.snps', 'rs429358', call('TT', 100))] });
  configureSyncDelta({ getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY });
  writeSnapshot(PROFILE_ID, 'genetics.snps', { rs429358: 'old' });
  const result = await planProfileDeltas(PROFILE_ID, { genetics: { snps: {} }, geneticsSnpTombstones: { rs429358: state(200) } });
  expect(result.deltaPlans.find(item => item.arrayName === 'geneticsSnpTombstones')?.plan.ops).toHaveLength(1);
  const calls = result.deltaPlans.find(item => item.arrayName === 'genetics.snps')!.plan;
  expect(calls.ops).toEqual([expect.objectContaining({ kind: 'tombstone' })]); expect(calls.next).toEqual({});
});
it('clears exactly one call and its local history, then restores only an explicitly reported new call', () => {
  const data: DnaProfileData = {};
  upsertGeneticsWithCatalog(data, 'rs429358', 'TT', { rawText: 'private-old-call' }, catalog, 100);
  upsertGeneticsWithCatalog(data, 'rs429358', 'CT', {}, catalog, 200);
  upsertGeneticsWithCatalog(data, 'rs7412', 'CC', {}, catalog, 100);
  data.genetics!.mtdna = { haplogroup: 'H' }; const sibling = structuredClone(data.genetics!.snps!.rs7412), maternal = structuredClone(data.genetics!.mtdna), old = structuredClone(data);
  removeGeneticsSnpWithCatalog(data, 'rs429358', catalog, 300);
  expect(data.genetics!.snps!.rs429358).toBeUndefined(); expect(data.genetics!.apoe).toBeUndefined(); expect(JSON.stringify(data)).not.toContain('private-old-call');
  expect(data.genetics!.snps!.rs7412).toEqual(sibling); expect(data.genetics!.mtdna).toEqual(maternal);
  const removed = structuredClone(data);
  expect(upsertGeneticsWithCatalog(data, 'rs429358', 'TT', { type: 'pdf-report' }, catalog, 400).ok).toBe(false); expect(data).toEqual(removed);
  expect(upsertGeneticsWithCatalog(data, 'rs429358', 'CT', {}, catalog, 400, { restoreRemoved: true }).ok).toBe(true);
  expect(data.genetics!.snps!.rs429358).toMatchObject({ genotype: 'CT', updatedAt: 400 }); expect(data.genetics!.snps!.rs429358!.priorCalls).toBeUndefined();
  for (const peer of [old, removed]) for (const [a, b] of [[data, peer], [peer, data]]) {
    const merged = mergeImportedData({ ...a!, genetics: { ...a!.genetics! } }, { ...b!, genetics: { ...b!.genetics! } })!;
    expect(merged.genetics.snps?.rs429358?.genotype).toBe('CT'); expect(merged.genetics.apoe).toBe('ε3/ε4');
  }
});
it('keeps removed calls absent and their summary unresolved in both blob merge orders', () => {
  const old = { genetics: { snps: { rs429358: call('TT', 100), rs7412: call('CC', 100) }, apoe: 'ε3/ε3' } };
  const removed = { genetics: { snps: { rs7412: call('CC', 100) }, apoe: undefined as string | undefined }, geneticsSnpTombstones: { rs429358: state(200) } };
  for (const [a, b] of [[old, removed], [removed, old]]) {
    const merged = mergeImportedData(a!, b!)!; expect(merged.genetics!.snps).toEqual(removed.genetics.snps); expect(merged.genetics!.apoe).toBeUndefined();
  }
  expect(old.genetics.snps.rs429358.genotype).toBe('TT');
});
it('advances assignment and removal clocks beyond observed future source and restore clocks', () => {
  const future = Date.now() + 100000, data: DnaProfileData = { genetics: { snps: { rs429358: { ...call('TT', future), source: { addedAt: new Date(future + 5).toISOString() } } } } };
  upsertGeneticsWithCatalog(data, 'rs429358', 'CT', {}, catalog, 100); expect(data.genetics!.snps!.rs429358!.updatedAt).toBe(future + 6);
  removeGeneticsSnpWithCatalog(data, 'rs429358', catalog, 100); expect(data.geneticsSnpTombstones!.rs429358!.deletedAt).toBe(future + 7);
  upsertGeneticsWithCatalog(data, 'rs429358', 'CC', {}, catalog, 100, { restoreRemoved: true }); expect(data.genetics!.snps!.rs429358!.updatedAt).toBe(future + 8);
  expect(data.geneticsSnpTombstones!.rs429358!.restoredAt).toBe(future + 8);
});
it('does not let a cleared removal generation admit an older pre-removal call', () => {
  const data = { genetics: { snps: { rs429358: call('TT', 100) }, apoe: 'ε3/ε3' }, geneticsSnpTombstones: { rs429358: state(200, 300) } };
  reconcileGeneticsSnpState(data); expect(data.genetics.snps).toEqual({}); expect(data.genetics.apoe).toBeUndefined();
});
it('retains observed removal history when a stale local snapshot omits or edits it', () => {
  const old = { geneticsSnpTombstones: { rs429358: state(100) } }, latest = { geneticsSnpTombstones: { rs429358: state(100, 200), rs7412: state(300) } };
  expect(mergeProfileMutation(old, {}, latest)).toEqual(latest);
  expect(mergeProfileMutation(old, { geneticsSnpTombstones: { rs429358: state(150) } }, latest)).toEqual({ geneticsSnpTombstones: { rs429358: state(150, 200), rs7412: state(300) } });
  expect(localHasRowsRemoteLacks(latest, old)).toBe(true); expect(localHasRowsRemoteLacks(old, latest)).toBe(false);
});
it('rebroadcasts fresh exact calls rather than accepting the old row as complete', () => {
  const a = { genetics: { snps: { rs429358: call('CT', 200) } } }, b = { genetics: { snps: { rs429358: call('TT', 100) } } };
  expect(localHasRowsRemoteLacks(a, b)).toBe(true); expect(localHasRowsRemoteLacks(b, a)).toBe(false);
});
it('merges carrier clocks monotonically and refuses malformed identity/time payloads', () => {
  const a = { rs429358: state(100, 200) }, b = { rs429358: state(300) };
  expect(mergeGeneticsSnpStates(a, b)).toEqual({ rs429358: state(300, 200) }); expect(mergeGeneticsSnpStates(b, a)).toEqual(mergeGeneticsSnpStates(a, b));
  for (const value of [{ rs429358: { ...state(100), updatedAt: 99 } }, { rs429358: state(-1) }, { rs429358: { ...state(100), rawText: 'unexpected' } }, JSON.parse('{"__proto__":{"deletedAt":1,"restoredAt":0,"updatedAt":1}}')]) expect(() => mergeGeneticsSnpStates(value, null)).toThrow('history');
});
it('keeps restored calls despite stale transport tombstones with newer relay timestamps', async () => {
  const imported: DeltaImportedData = { genetics: { snps: { rs429358: call('CT', 300) } }, geneticsSnpTombstones: { rs429358: state(200, 300) } };
  await mergeMapRowsIntoImported(imported, 'genetics.snps', [{ ...row('genetics.snps', 'rs429358', null), isDeleted: 1 }]);
  expect(imported.genetics!.snps).toMatchObject({ rs429358: { genotype: 'CT' } });
});
for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) it(`reconciles removal, call and stale summary rows in scan order ${order.join(',')}`, async () => {
  const rows = [row('geneticsSnpTombstones', 'rs429358', state(200)), row('genetics.snps', 'rs429358', call('TT', 100)),
    { ...row('genetics', 'genetics', null), payload: JSON.stringify({ v: { apoe: 'ε3/ε3', source: 'Old summary' } }) }];
  const fake = makeEvolu({ itemRows: order.map(index => rows[index]!) }); configureSyncDelta({ getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY });
  const imported = await _mergeItemRowsIntoImported(PROFILE_ID, {} as DeltaImportedData);
  expect(imported.genetics!.snps).toEqual({}); expect(imported.genetics!.apoe).toBeUndefined(); expect(imported.geneticsSnpTombstones).toEqual({ rs429358: state(200) });
});
it('plans removal carriers from observed rows even if the local blob omits their history', async () => {
  const fake = makeEvolu({ itemRows: [row('geneticsSnpTombstones', 'rs429358', state(200)), row('genetics.snps', 'rs429358', call('TT', 100))] });
  configureSyncDelta({ getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY }); writeSnapshot(PROFILE_ID, 'genetics.snps', { rs429358: 'old' });
  const result = await planProfileDeltas(PROFILE_ID, { genetics: { snps: {} } });
  const carrier = result.deltaPlans.find(item => item.arrayName === 'geneticsSnpTombstones')!; expect(carrier).toBeTruthy();
  expect(await decodeRowPayload({ payload: carrier.plan.ops[0]!.args.payload })).toEqual({ k: 'rs429358', v: state(200) });
  expect(result.deltaPlans.find(item => item.arrayName === 'genetics.snps')!.plan.ops.map(op => op.kind)).toEqual(['tombstone']);
});
it('keeps a raw file reimport from restoring removed calls and retains maternal report history', async () => {
  const { saveGeneticsData } = await import('../js/dna.js');
  const data: DnaProfileData = { genetics: { snps: { rs429358: call('TT', 100), rs7412: call('CC', 100) }, mtdna: { haplogroup: 'H' }, mtdnaHistory: [{ haplogroup: 'J', mutations: ['local-evidence'] }] } };
  removeGeneticsSnpWithCatalog(data, 'rs429358', catalog, 200);
  saveGeneticsData(data, { source: 'Old raw file', matches: { rs429358: call('TT', 100), rs7412: call('CC', 100) }, coverage: { found: 2, total: 60 } });
  expect(data.genetics!.snps!.rs429358).toBeUndefined(); expect(data.genetics!.apoe).toBeUndefined(); expect(data.genetics!.mtdnaHistory).toEqual([{ haplogroup: 'J', mutations: ['local-evidence'] }]);
  expect(data.genetics!.mtdna).toEqual({ haplogroup: 'H' });
});
it('preserves opaque legacy SNP entries during a metadata merge without treating them as editable calls', () => {
  const local = { genetics: { snps: { rsTest: 'AA' } } }, remote = { genetics: { ancestry: 'retained metadata' } };
  expect(mergeImportedData<typeof local | typeof remote>(local, remote)!.genetics).toEqual({ ancestry: 'retained metadata', snps: { rsTest: 'AA' } });
});
it('cold-loads a compressed restored call with independent lifecycle and stale metadata rows', async () => {
  const evidence = 'synthetic-new-report-evidence '.repeat(40);
  const data = { genetics: { snps: { rs429358: { ...call('CT', 300), source: { rawText: evidence } }, rs7412: call('CC', 100) }, apoe: 'ε3/ε4' }, geneticsSnpTombstones: { rs429358: state(200, 300) } };
  const planned = await planProfileDeltas(PROFILE_ID, data), callPlan = planned.deltaPlans.find(item => item.arrayName === 'genetics.snps')!;
  expect(String(callPlan.plan.ops.find(op => op.args.itemId === 'rs429358')!.args.payload)).toMatch(/^GZ\|v1\|/);
  const rows = planned.deltaPlans.flatMap(item => item.plan.ops.map(op => ({ ...row(item.arrayName, String(op.args.itemId), null), payload: String(op.args.payload) })));
  rows.unshift({ ...row('genetics', 'genetics', null), payload: JSON.stringify({ v: { apoe: 'old-unresolved-summary' } }) });
  const fake = makeEvolu({ itemRows: [...rows].reverse() }); configureSyncDelta({ getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY });
  const restored = await _mergeItemRowsIntoImported(PROFILE_ID, {} as DeltaImportedData);
  expect(restored.genetics).toMatchObject({ apoe: 'ε3/ε4', snps: { rs429358: { genotype: 'CT', updatedAt: 300, source: { rawText: evidence } }, rs7412: { genotype: 'CC' } } });
  expect(restored.geneticsSnpTombstones).toEqual(data.geneticsSnpTombstones);
});
