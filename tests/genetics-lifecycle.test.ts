import { beforeEach, afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mergeImportedData, localHasRowsRemoteLacks } from '../js/data-merge.js';
import { clearReportedHaplogroup, setReportedHaplogroup, upsertGeneticsWithCatalog } from '../js/genetics-mutations.js';
import { configureSyncDelta } from '../js/sync-delta.js';
import { _mergeItemRowsIntoImported } from '../js/sync-delta-merge.js';
import { makeEvolu, ITEM_ROW_QUERY, PROFILE_ID, writeSnapshot } from './helpers/sync-runtime-fixture.js';
import { mergeGeneticsLifecycle, removeGeneticsScope, geneticsScopeRemoved } from '../js/genetics-lifecycle.js';
import { mergeProfileMutation } from '../js/profile-data-writes.js';
import { mergeMapRowsIntoImported } from '../js/sync-delta-map-merge.js';
import { mergeScalarRowsIntoImported } from '../js/sync-delta-scalar-merge.js';
import { planProfileDeltas } from '../js/sync-push-deltas.js';
import { decodeRowPayload } from '../js/sync-delta-row-codec.js';
import type { SnpCatalog } from '../js/dna-evidence.js';
import type { HaplogroupTable } from '../js/dna-haplogroup-catalog.js';
import type { DnaProfileData, GeneticsData } from '../js/dna-runtime.js';
import type { DeltaItemRow, DeltaImportedData } from '../js/sync-delta-row-codec.js';

const catalog = JSON.parse(readFileSync('data/snp-health.json', 'utf8')) as SnpCatalog;
const maternal = JSON.parse(readFileSync('data/haplogroups.json', 'utf8')) as HaplogroupTable;
const call = (genotype: string, updatedAt = 100) => ({ genotype, updatedAt, effect: 'none' });
const fixture = (): DnaProfileData & Record<string, unknown> & { genetics: GeneticsData & Record<string, unknown> } => ({ genetics: { source: 'Private raw export', importDate: '2026-01-01', apoe: 'ε3/ε3',
  snps: { rs429358: call('TT'), rs7412: call('CC') },
  mtdna: { haplogroup: 'H', source: 'Private maternal report', mutations: ['263G'] }, mtdnaHistory: [{ haplogroup: 'U5a', mutations: ['private-history'] }] } });
const row = (arrayName: string, itemId: string, value: unknown, scalar = false): DeltaItemRow & { payload: string; itemId: string } & Record<string, unknown> => ({ id: `${arrayName}-${itemId}`, profileId: PROFILE_ID,
  arrayName, itemId, payload: JSON.stringify(scalar ? { v: value } : { k: itemId, v: value }), syncedAt: '2026-10-24T12:00:00Z' });
beforeEach(() => { localStorage.clear(); configureSyncDelta({ getEvolu: () => null, getItemRowQuery: () => null }); });
afterEach(() => configureSyncDelta({ getEvolu: () => null, getItemRowQuery: () => null }));

it('keeps whole-genome removal through either profile merge order', async () => {
  const old = fixture(), removed = structuredClone(old), { deleteGeneticsData } = await import('../js/dna.js'); deleteGeneticsData(removed);
  for (const [a, b] of [[old, removed], [removed, old]]) expect(mergeImportedData(a!, b!)!.genetics).toBeUndefined();
  expect(localHasRowsRemoteLacks(removed, old)).toBe(true); expect(old.genetics!.mtdna?.haplogroup).toBe('H');
});
it('does not restore a removed whole genome from a raw file without an explicit restoration review', async () => {
  const data = fixture(), { deleteGeneticsData, saveGeneticsData } = await import('../js/dna.js'); deleteGeneticsData(data);
  expect(() => saveGeneticsData(data, { source: 'Old raw export', matches: { rs429358: call('TT'), rs7412: call('CC') } })).toThrow(/restor|removed/i);
  expect(data.genetics).toBeUndefined();
});
it('keeps maternal removal and erased report history through either profile merge order', () => {
  const old = fixture(), removed = structuredClone(old); clearReportedHaplogroup(removed);
  for (const [a, b] of [[old, removed], [removed, old]]) {
    const merged = mergeImportedData(a!, b!)!; expect(merged.genetics!.mtdna).toBeNull(); expect(merged.genetics!.mtdnaHistory).toBeUndefined();
    expect(merged.genetics!.snps).toEqual(old.genetics!.snps);
  }
});
it('preserves a newer reported maternal lineage through both profile merge orders', () => {
  const old = fixture(), fresh = structuredClone(old); setReportedHaplogroup(old, 'H', maternal, 100); setReportedHaplogroup(fresh, 'J', maternal, 200);
  for (const [a, b] of [[old, fresh], [fresh, old]]) expect(mergeImportedData(a!, b!)!.genetics!.mtdna?.haplogroup).toBe('J');
  expect(localHasRowsRemoteLacks(fresh, old)).toBe(true);
});
it('does not recover old calls, maternal reports or metadata after an explicit new call restores the genome', async () => {
  const old = fixture(), data = structuredClone(old), { deleteGeneticsData } = await import('../js/dna.js'); deleteGeneticsData(data);
  expect(upsertGeneticsWithCatalog(data, 'rs429358', 'CT', {}, catalog, Date.now(), { restoreRemoved: true }).ok).toBe(true);
  old.genetics!.snps!.rs7412!.updatedAt = Date.now() + 1e9;
  for (const [a, b] of [[old, data], [data, old]]) {
    const genome = mergeImportedData(a!, b!)!.genetics!; expect(Object.keys(genome.snps || {})).toEqual(['rs429358']); expect(genome.snps?.rs429358?.genotype).toBe('CT');
    expect(genome.mtdna).toBeUndefined(); expect(genome.mtdnaHistory).toBeUndefined(); expect(genome.source).not.toBe('Private raw export');
  }
});
it('filters stale metadata and calls on row-only cold load after a whole-genome removal', async () => {
  const old = fixture(), removed = structuredClone(old), { deleteGeneticsData } = await import('../js/dna.js'); deleteGeneticsData(removed);
  const lifecycle = removed.geneticsLifecycle;
  const rows = [row('genetics', 'genetics', old.genetics, true), row('genetics.snps', 'rs429358', old.genetics!.snps!.rs429358),
    ...Object.entries(lifecycle || {}).map(([id, value]) => row('geneticsLifecycle', id, value))];
  const fake = makeEvolu({ itemRows: rows }); configureSyncDelta({ getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY });
  expect((await _mergeItemRowsIntoImported(PROFILE_ID, {} as DeltaImportedData)).genetics).toBeUndefined();
});
it('restores a reported maternal lineage without recovering old reports or future-dated old values', () => {
  const old = fixture(), data = structuredClone(old); removeGeneticsScope(data, 'maternal', 200); setReportedHaplogroup(data, 'J', maternal, 300);
  old.genetics!.mtdna!.updatedAt = Date.now() + 1e9;
  for (const [a, b] of [[old, data], [data, old]]) {
    const merged = mergeImportedData(a!, b!)!; expect(merged.genetics!.mtdna?.haplogroup).toBe('J'); expect(merged.genetics!.mtdnaHistory).toBeUndefined();
    expect(merged.genetics!.snps).toEqual(data.genetics!.snps);
  }
  expect(data.genetics!.mtdna!.maternalGeneration).toBe(data.geneticsLifecycle!.maternal!.restoredAt);
});
it('does not drop legacy history-only maternal evidence during unrelated metadata merge', () => {
  const data = { genetics: { snps: {}, mtdna: null, mtdnaHistory: [{ source: 'retained historical report' }] } };
  expect(mergeImportedData(data, data)!.genetics!.mtdnaHistory).toEqual(data.genetics.mtdnaHistory);
});
it('merges independent lifecycle clocks monotonically and retains them after stale whole-key omission', () => {
  const state = (deletedAt: number, restoredAt = 0) => ({ deletedAt, restoredAt, updatedAt: Math.max(deletedAt, restoredAt) });
  const left = { genome: state(200), maternal: state(100, 300) }, right = { genome: state(100, 400), maternal: state(250) };
  const merged = { genome: state(200, 400), maternal: state(250, 300) };
  expect(mergeGeneticsLifecycle(left, right)).toEqual(merged); expect(mergeGeneticsLifecycle(right, left)).toEqual(merged);
  expect(mergeProfileMutation({ geneticsLifecycle: left }, {}, { geneticsLifecycle: right })).toEqual({ geneticsLifecycle: merged });
  for (const value of [{ genome: { ...state(100), updatedAt: 99 } }, { unknown: state(100) }, { genome: state(-1) }, { maternal: { ...state(100), source: 'unexpected' } }, JSON.parse('{"__proto__":{"deletedAt":100,"restoredAt":0,"updatedAt":100}}')]) expect(() => mergeGeneticsLifecycle(value, null)).toThrow('history');
});
it('uses the current maternal record timestamp despite a stale scalar with a later relay time and baseline', async () => {
  const old = fixture(), data = structuredClone(old); setReportedHaplogroup(old, 'H', maternal, 100); setReportedHaplogroup(data, 'J', maternal, 200);
  const imported: DeltaImportedData = structuredClone(data);
  const stale = { ...row('genetics', 'genetics', old.genetics, true), syncedAt: '2027-01-01T00:00:00Z' };
  await mergeScalarRowsIntoImported(imported, 'genetics', [stale], { hasBaseline: true, baselineSyncedAt: Date.parse('2028-01-01') });
  expect(imported.genetics!.mtdna).toMatchObject({ haplogroup: 'J' });
});
it('keeps a fresh scalar candidate despite a later stale scalar and transport delete', async () => {
  const old = fixture(), fresh = structuredClone(old); setReportedHaplogroup(old, 'H', maternal, 100); setReportedHaplogroup(fresh, 'J', maternal, 200);
  const rows = [row('genetics', 'genetics', fresh.genetics, true), { ...row('genetics', 'genetics', old.genetics, true), syncedAt: '2027-01-01T00:00:00Z' },
    { ...row('genetics', 'genetics', null, true), syncedAt: '2028-01-01T00:00:00Z', isDeleted: 1 }];
  for (const list of [rows, [...rows].reverse()]) {
    const imported: DeltaImportedData = {}; await mergeScalarRowsIntoImported(imported, 'genetics', list); expect(imported.genetics!.mtdna).toMatchObject({ haplogroup: 'J' });
  }
});
for (const order of [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]]) it(`cold-loads whole removal before calls and metadata in scan order ${order.join(',')}`, async () => {
  const old = fixture(), data = structuredClone(old); removeGeneticsScope(data, 'genome', 200);
  const rows = [row('geneticsLifecycle', 'genome', data.geneticsLifecycle!.genome), row('genetics.snps', 'rs429358', call('TT')),
    row('genetics', 'genetics', old.genetics, true)];
  const fake = makeEvolu({ itemRows: order.map(index => rows[index]!) }); configureSyncDelta({ getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY });
  expect((await _mergeItemRowsIntoImported(PROFILE_ID, {} as DeltaImportedData)).genetics).toBeUndefined();
});
it('plans a deliberate whole-genome removal for every known row without changing generic storm protection', async () => {
  const ids = [...Array.from({ length: 25 }, (_, index) => `rs${1000 + index}`), 'opaqueLegacyCall'];
  const data = fixture(); removeGeneticsScope(data, 'genome', 200);
  const rows = ids.map(id => row('genetics.snps', id, call('TT'))), fake = makeEvolu({ itemRows: rows });
  configureSyncDelta({ getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY }); writeSnapshot(PROFILE_ID, 'genetics.snps', Object.fromEntries(ids.map(id => [id, 'old-hash'])));
  const result = await planProfileDeltas(PROFILE_ID, data), snps = result.deltaPlans.find(item => item.arrayName === 'genetics.snps')!;
  expect(snps.plan.ops).toHaveLength(ids.length); expect(snps.plan.ops.every(op => op.kind === 'tombstone')).toBe(true);
});
it('preserves observed lifecycle carriers when a local snapshot omits them or transport marks them deleted', async () => {
  const deleted = { deletedAt: 200, restoredAt: 0, updatedAt: 200 };
  const rows = [{ ...row('geneticsLifecycle', 'genome', deleted), isDeleted: 1 }, row('genetics.snps', 'rs429358', call('TT'))];
  const fake = makeEvolu({ itemRows: rows }); configureSyncDelta({ getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY });
  const result = await planProfileDeltas(PROFILE_ID, {}), carrier = result.deltaPlans.find(item => item.arrayName === 'geneticsLifecycle')!;
  expect(await decodeRowPayload({ payload: carrier.plan.ops[0]!.args.payload })).toEqual({ k: 'genome', v: deleted });
  expect(result.deltaPlans.find(item => item.arrayName === 'genetics.snps')!.plan.ops.map(op => op.kind)).toEqual(['tombstone']);
  const imported: DeltaImportedData = {}; await mergeMapRowsIntoImported(imported, 'geneticsLifecycle', rows.filter(row => row.arrayName === 'geneticsLifecycle'));
  expect(geneticsScopeRemoved(imported.geneticsLifecycle, 'genome')).toBe(true);
});
it('refuses stale future-dated call rows and transport deletes after explicit whole-genome restoration', async () => {
  const data = fixture(); removeGeneticsScope(data, 'genome', 200); upsertGeneticsWithCatalog(data, 'rs429358', 'CT', {}, catalog, 300, { restoreRemoved: true });
  const imported: DeltaImportedData = structuredClone(data), current = structuredClone(imported.genetics!.snps);
  await mergeMapRowsIntoImported(imported, 'genetics.snps', [row('genetics.snps', 'rs429358', call('TT', 1e12)), row('genetics.snps', 'rs7412', call('CC', 1e12)), { ...row('genetics.snps', 'rs429358', null), isDeleted: 1 }]);
  expect(imported.genetics!.snps).toEqual(current); expect(imported.genetics!.mtdna).toBeUndefined();
});
it('rebroadcasts a newer metadata-only genome correction', () => {
  const fresh = { genetics: { source: 'Corrected source', updatedAt: 200, snps: {} } }, old = { genetics: { source: 'Old source', updatedAt: 100, snps: {} } };
  expect(localHasRowsRemoteLacks(fresh, old)).toBe(true); expect(localHasRowsRemoteLacks(old, fresh)).toBe(false);
});
it('rebroadcasts a current SNP generation when both peers know the lifecycle but a future-dated old call persists', () => {
  const lifecycle = { genome: { deletedAt: 100, restoredAt: 200, updatedAt: 200 } };
  // Row-only snapshots can have calls before their metadata scalar arrives.
  const fresh = { geneticsLifecycle: lifecycle, genetics: { snps: { rs429358: { ...call('CT', 300), genomeGeneration: 200 } } } };
  const stale = { geneticsLifecycle: lifecycle, genetics: { snps: { rs429358: { ...call('TT', 1000), genomeGeneration: 100 } } } };
  expect(localHasRowsRemoteLacks(fresh, stale)).toBe(true); expect(localHasRowsRemoteLacks(stale, fresh)).toBe(false);
});
it('rebroadcasts a current maternal generation over a future-dated rejected report', () => {
  const lifecycle = { maternal: { deletedAt: 100, restoredAt: 200, updatedAt: 200 } };
  const fresh = { geneticsLifecycle: lifecycle, genetics: { updatedAt: 300, mtdna: { haplogroup: 'J', updatedAt: 300, maternalGeneration: 200 } } };
  const stale = { geneticsLifecycle: lifecycle, genetics: { updatedAt: 300, mtdna: { haplogroup: 'H', updatedAt: 1000, maternalGeneration: 50 } } };
  expect(localHasRowsRemoteLacks(fresh, stale)).toBe(true); expect(localHasRowsRemoteLacks(stale, fresh)).toBe(false);
});
it.each(['root', 'maternal'])('rebroadcasts the deterministic stamped %s winner when assignment clocks tie', kind => {
  const fresh = kind === 'root' ? { genetics: { source: 'Z', updatedAt: 200 } } : { genetics: { mtdna: { haplogroup: 'J', updatedAt: 200 } } };
  const old = kind === 'root' ? { genetics: { source: 'A', updatedAt: 200 } } : { genetics: { mtdna: { haplogroup: 'H', updatedAt: 200 } } };
  expect(localHasRowsRemoteLacks(fresh, old)).toBe(true); expect(localHasRowsRemoteLacks(old, fresh)).toBe(false);
});
