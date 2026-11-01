import {beforeEach, expect, it} from 'vitest';
import {mergeScalarRowsIntoImported} from '../js/sync-delta-scalar-merge.js';
import {acknowledgePulledScalarSnapshots} from '../js/sync-delta-merge.js';
import {readScalarVersion, scalarValueHash, writeScalarVersion} from '../js/sync-scalar-snapshot.js';
import {_readDeltaSnapshot} from '../js/sync-delta-snapshot.js';
import type {DeltaImportedData, DeltaItemRow} from '../js/sync-delta-row-codec.js';
import type {ScalarVersions} from '../js/sync-scalar-snapshot.js';

const old = {updatedAt: 100, mtdna: {haplogroup: 'H', updatedAt: 100}};
const fresh = {updatedAt: 200, mtdna: {haplogroup: 'J', updatedAt: 200}};
const transportClock = Date.parse('2028-01-01T00:00:00Z');
const row = (value: unknown): DeltaItemRow => ({profileId: 'rebase', arrayName: 'genetics', itemId: 'genetics', payload: JSON.stringify({v: value}), syncedAt: new Date(transportClock).toISOString()});
beforeEach(() => localStorage.clear());

it('does not acknowledge stale transport metadata when record history preserves a newer maternal lineage', async () => {
  const imported: DeltaImportedData = {genetics: {...fresh, snps: {rs429358: {genotype: 'TT', updatedAt: 200, effect: 'none'}}}};
  const versions: ScalarVersions = {};
  await mergeScalarRowsIntoImported(imported, 'genetics', [row(old)], {onVersion: version => {versions.genetics = version;}});
  expect(imported.genetics!.mtdna).toEqual(fresh.mtdna);
  expect(imported.genetics!.snps).toEqual({rs429358: {genotype: 'TT', updatedAt: 200, effect: 'none'}});
  expect(versions.genetics).toEqual({clock: transportClock, hash: scalarValueHash('genetics', old)});
  await acknowledgePulledScalarSnapshots('rebase', imported, transportClock + 1, versions);
  expect(_readDeltaSnapshot('rebase', 'genetics')).toEqual({});
  expect(readScalarVersion('rebase', 'genetics')).toBeNull();
});

it('acknowledges an exact committed genetics scalar without treating the separate SNP map as a new edit', async () => {
  const imported: DeltaImportedData = {genetics: {...old, snps: {rs429358: {genotype: 'TT'}}}};
  const versions: ScalarVersions = {};
  await mergeScalarRowsIntoImported(imported, 'genetics', [row(fresh)], {onVersion: version => {versions.genetics = version;}});
  await acknowledgePulledScalarSnapshots('rebase', imported, transportClock + 1, versions);
  expect(imported.genetics!.mtdna).toEqual(fresh.mtdna);
  expect(_readDeltaSnapshot('rebase', 'genetics')).toEqual({genetics: scalarValueHash('genetics', fresh)});
  expect(readScalarVersion('rebase', 'genetics')).toEqual({clock: transportClock, hash: scalarValueHash('genetics', fresh)});
});

it('never promotes an unsaved local genetics draft through the durable scalar-clock path', async () => {
  const imported: DeltaImportedData = {genetics: {...fresh}};
  const durable = {clock: transportClock + 1000, hash: scalarValueHash('genetics', fresh)};
  writeScalarVersion('rebase', 'genetics', durable);
  await mergeScalarRowsIntoImported(imported, 'genetics', [row(old)], {profileId: 'rebase', hasLocal: true, localValue: {updatedAt: 500, mtdna: {haplogroup: 'K', updatedAt: 500}}});
  expect(imported.genetics!.mtdna).toEqual(fresh.mtdna);
  expect(readScalarVersion('rebase', 'genetics')).toEqual(durable);
});
