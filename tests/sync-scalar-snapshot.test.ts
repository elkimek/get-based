import {beforeEach, describe, expect, it} from 'vitest';
import {withoutDeltaScalarSnapshots, equivalentSyncPayloadWithoutScalars} from '../js/sync-scalar-snapshot.js';
import {acknowledgePulledScalarSnapshots, configureSyncDeltaMerge} from '../js/sync-delta-merge.js';
import {_readDeltaSnapshot, _writeDeltaSnapshot} from '../js/sync-delta-snapshot.js';
import {_djb2} from '../js/sync-delta-id.js';
import type {DeltaItemRow} from '../js/sync-delta-row-codec.js';

const wire = (importedData: unknown, extra = {}) => JSON.stringify({_v: 3, importedData, profile: {id: 'p'}, ...extra});
describe('field-clock scalar snapshots', () => {
  it('omits scalar shadows while retaining arrays, map siblings and unknown extension fields', () => {
    const source = {contextNotes: 'old', notes: [{text: 'local note'}], extension: {value: 1},
      lightEnvironment: {burdenAI: {text: 'old'}, rooms: [{id: 'room'}], extension: 2}};
    expect(withoutDeltaScalarSnapshots(source)).toEqual({notes: source.notes, extension: source.extension,
      lightEnvironment: {rooms: source.lightEnvironment.rooms, extension: 2}});
    expect(withoutDeltaScalarSnapshots(source, ['contextNotes'])).toMatchObject({contextNotes: 'old'});
    expect(source.contextNotes).toBe('old'); expect(source.lightEnvironment.burdenAI).toEqual({text: 'old'});
  });
  it('recognizes a prior full snapshot without suppressing other payload-channel changes', async () => {
    const base = {notes: [{text: 'same'}], extension: 'preserved'};
    const previous = wire({...base, contextNotes: 'acknowledged by scalar row'});
    expect(await equivalentSyncPayloadWithoutScalars(previous, wire(base))).toBe(true);
    for (const extra of [{chatData: {threads: [{id: 'new'}]}}, {aiSettings: {model: 'new'}},
      {profile: {id: 'p', name: 'new'}}, {displayPrefs: {rangeMode: 'reference'}}])
      expect(await equivalentSyncPayloadWithoutScalars(previous, wire(base, extra))).toBe(false);
    expect(await equivalentSyncPayloadWithoutScalars(previous, wire({...base, notes: [{text: 'new'}]}))).toBe(false);
    expect(await equivalentSyncPayloadWithoutScalars(previous, wire({...base, extension: 'new'}))).toBe(false);
    expect(await equivalentSyncPayloadWithoutScalars(previous, JSON.stringify({_v: 4, profile: {id: 'p'}}))).toBe(false);
    expect(await equivalentSyncPayloadWithoutScalars('invalid', wire(base))).toBe(false);
  });
});

describe('durably observed scalar acknowledgements', () => {
  let rows: DeltaItemRow[];
  beforeEach(() => {
    localStorage.clear(); rows = [];
    configureSyncDeltaMerge({getEvolu: () => ({getQueryRows: () => rows}), getItemRowQuery: () => 'items'});
  });
  const row = (value: unknown, extra = {}): DeltaItemRow => ({profileId: 'p', arrayName: 'contextNotes', itemId: 'contextNotes',
    payload: JSON.stringify({v: value}), syncedAt: '2026-10-30T12:00:00.000Z', ...extra});
  it('acknowledges only actual rows matching the committed profile, retaining a different local edit', async () => {
    rows.push(row('remote'));
    await acknowledgePulledScalarSnapshots('p', {contextNotes: 'remote'}, 100);
    const remoteHash = _djb2(JSON.stringify({v: 'remote'}));
    expect(_readDeltaSnapshot('p', 'contextNotes')).toEqual({contextNotes: remoteHash});
    await acknowledgePulledScalarSnapshots('p', {contextNotes: 'local edit'}, 200);
    expect(_readDeltaSnapshot('p', 'contextNotes')).toEqual({contextNotes: remoteHash});
  });
  it('does not acknowledge a foreign owner, malformed row, or unobserved blob-only scalar', async () => {
    rows.push(row('remote', {profileId: 'other'}), row('remote', {itemId: 'foreign'}), row('remote', {payload: '{bad'}));
    await acknowledgePulledScalarSnapshots('p', {contextNotes: 'remote', diet: {type: 'local'}}, 100);
    expect(_readDeltaSnapshot('p', 'contextNotes')).toEqual({});
    expect(_readDeltaSnapshot('p', 'diet')).toEqual({});
  });
  it('keeps a later successful local plan when an older pull completes afterward', async () => {
    rows.push(row('remote'));
    _writeDeltaSnapshot('p', 'contextNotes', {contextNotes: 'later-local-hash'}, 200);
    await acknowledgePulledScalarSnapshots('p', {contextNotes: 'remote'}, 100);
    expect(_readDeltaSnapshot('p', 'contextNotes')).toEqual({contextNotes: 'later-local-hash'});
  });
  it('acknowledges a confirmed tombstone, with deletion winning a same-clock duplicate', async () => {
    rows.push(row('old'), row(null, {isDeleted: 1}));
    _writeDeltaSnapshot('p', 'contextNotes', {contextNotes: 'old'}, 100);
    await acknowledgePulledScalarSnapshots('p', {contextNotes: null}, 200);
    expect(_readDeltaSnapshot('p', 'contextNotes')).toEqual({});
  });
  it('acknowledges genetics metadata without treating its separately synced SNP map as a scalar edit', async () => {
    rows.push(row({source: 'remote'}, {arrayName: 'genetics', itemId: 'genetics'}));
    await acknowledgePulledScalarSnapshots('p', {genetics: {source: 'remote', snps: {rs123: 'AA'}}}, 100);
    expect(_readDeltaSnapshot('p', 'genetics')).toEqual({genetics: _djb2(JSON.stringify({v: {source: 'remote'}}))});
  });
});
