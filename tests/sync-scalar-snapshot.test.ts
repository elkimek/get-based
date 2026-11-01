import {_planScalarDelta} from '../js/sync-delta-scalar-planner.js';
import {configureSyncDelta, _mergeItemRowsIntoImported} from '../js/sync-delta.js';
import {configureSyncPush, pushProfile} from '../js/sync-push.js';
import {parseSyncPayload, buildSyncPayload} from '../js/sync-payload.js';
import {makeEvolu, PROFILE_QUERY, ITEM_ROW_QUERY} from './helpers/sync-runtime-fixture.js';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {scalarPayloadClocks, scalarValueHash, writeScalarVersion, equivalentSyncPayload, commitScalarPayloadClocks} from '../js/sync-scalar-snapshot.js';
import {acknowledgePulledScalarSnapshots, configureSyncDeltaMerge} from '../js/sync-delta-merge.js';
import {_readDeltaSnapshot, _writeDeltaSnapshot} from '../js/sync-delta-snapshot.js';
import {_djb2} from '../js/sync-delta-id.js';
import type {DeltaItemRow} from '../js/sync-delta-row-codec.js';

const wire = (importedData: unknown, extra = {}) => JSON.stringify({_v: 3, importedData, profile: {id: 'p'}, ...extra});
describe('full field-clock scalar snapshots', () => {
  it('retains an acknowledged edit clock across a later unrelated save', () => {
    localStorage.clear();
    const value = 'recent edit';
    writeScalarVersion('p', 'contextNotes', {clock: 200, hash: scalarValueHash('contextNotes', value)});
    expect(scalarPayloadClocks('p', {contextNotes: value, notes: [{id: 'later'}]}, []).contextNotes).toBe(200);
    expect(scalarPayloadClocks('p', {contextNotes: 'unsaved different value'}, []).contextNotes).toBe(0);
  });
  it('compares every payload channel, scalar value, and field clock before declaring a no-op', async () => {
    const original = wire({contextNotes: 'same', notes: []}, {scalarClocks: {contextNotes: 200}});
    expect(await equivalentSyncPayload(original, original)).toBe(true);
    expect(await equivalentSyncPayload(original, wire({contextNotes: 'different', notes: []}, {scalarClocks: {contextNotes: 200}}))).toBe(false);
    expect(await equivalentSyncPayload(original, wire({contextNotes: 'same', notes: []}, {scalarClocks: {contextNotes: 201}}))).toBe(false);
    expect(await equivalentSyncPayload(original, 'invalid')).toBe(false);
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

it('keeps a recent scalar through two real pushes when a peer sees the new blob before the matching item rows', async () => {
  localStorage.clear();
  const id = 'delayed-scalar-peer';
  const old = {id: 'context-row', profileId: id, arrayName: 'contextNotes', itemId: 'contextNotes', payload: JSON.stringify({v: 'old'}), syncedAt: '2026-01-01T00:00:00.000Z'};
  const fake = makeEvolu({itemRows: [{...old}], profileRows: [{id: 'profile-row', profileId: id, dataJson: wire({contextNotes: 'old'}), syncedAt: old.syncedAt}]});
  configureSyncDelta({getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY});
  configureSyncPush({getEvolu: () => fake.evolu, getProfileQuery: () => PROFILE_QUERY, isSyncEnabled: () => true, getProfiles: () => [{id}]});
  const data = {entries: [], contextNotes: 'recent edit', notes: []};
  await expect(pushProfile(id, data)).resolves.toEqual({ok: true});
  const first = await parseSyncPayload(fake.profileRows[0]!.dataJson);
  const writes = () => [...fake.calls.insert, ...fake.calls.update].filter(call => call.table === 'itemRow' && call.args.arrayName === 'contextNotes').length;
  expect(writes()).toBe(1);
  await expect(pushProfile(id, {...data, notes: [{date: '2026-10-30', text: 'later unrelated note'}]})).resolves.toEqual({ok: true});
  const second = await parseSyncPayload(fake.profileRows[0]!.dataJson);
  expect(second.importedData).toMatchObject({contextNotes: 'recent edit'});
  expect(second.scalarClocks!.contextNotes).toBe(first.scalarClocks!.contextNotes);
  expect(writes()).toBe(1);
  localStorage.clear(); // The peer has no sender-side local clock or snapshots.
  configureSyncDeltaMerge({getEvolu: () => ({getQueryRows: () => [old]}), getItemRowQuery: () => 'delayed-items'});
  const received = structuredClone(second.importedData) as Record<string, unknown>;
  expect(await _mergeItemRowsIntoImported(id, received, {baselineImported: second.importedData, scalarClocks: second.scalarClocks})).toMatchObject({contextNotes: 'recent edit'});
  const recentClock = second.scalarClocks!.contextNotes!;
  const newerRow = {...old, payload: JSON.stringify({v: 'recent edit'}), syncedAt: new Date(recentClock).toISOString()};
  configureSyncDeltaMerge({getEvolu: () => ({getQueryRows: () => [newerRow]}), getItemRowQuery: () => 'new-items'});
  expect(await _mergeItemRowsIntoImported(id, {contextNotes: 'old'}, {baselineImported: {contextNotes: 'old'}, baselineSyncedAt: recentClock + 1000, scalarClocks: {contextNotes: 100}})).toMatchObject({contextNotes: 'recent edit'});
  configureSyncDeltaMerge({getEvolu: () => ({getQueryRows: () => [old]}), getItemRowQuery: () => 'old-items'});
  writeScalarVersion(id, 'contextNotes', {clock: recentClock, hash: scalarValueHash('contextNotes', 'recent edit')});
  expect(await _mergeItemRowsIntoImported(id, {contextNotes: 'old'}, {baselineImported: {contextNotes: 'old'}, scalarClocks: {contextNotes: 100}, localImported: {contextNotes: 'recent edit'}})).toMatchObject({contextNotes: 'recent edit'});
  localStorage.clear();
  expect(await _mergeItemRowsIntoImported(id, {contextNotes: 'old'}, {baselineImported: {contextNotes: null}, scalarClocks: {contextNotes: recentClock}})).toMatchObject({contextNotes: null});
  configureSyncDelta({getEvolu: () => null, getItemRowQuery: () => null});
  configureSyncPush({getEvolu: () => null, isSyncEnabled: () => false});
});

it('complete recovery carries a clocked clear without adding a row for every absent scalar', async () => {
  localStorage.clear();
  const payload = await parseSyncPayload(await buildSyncPayload('rebuild', {}, null, {completeSnapshot: true}));
  expect(payload.importedData).toMatchObject({contextNotes: null});
  expect(payload.scalarClocks!.contextNotes).toBeGreaterThan(0);
  expect(commitScalarPayloadClocks('rebuild', {}, payload.scalarClocks!)).toBe(true);
  const later = await parseSyncPayload(await buildSyncPayload('rebuild', {notes: []}, null, {scalarClocks: scalarPayloadClocks('rebuild', {}, [])}));
  expect(later.importedData).toMatchObject({contextNotes: null});
  expect(later.scalarClocks!.contextNotes).toBe(payload.scalarClocks!.contextNotes);
  configureSyncDeltaMerge({getEvolu: () => ({getQueryRows: () => [{profileId: 'rebuild', arrayName: 'contextNotes', itemId: 'contextNotes', payload: JSON.stringify({v: 'stale'}), syncedAt: '2026-01-01T00:00:00.000Z'}]}), getItemRowQuery: () => 'items'});
  expect(await _mergeItemRowsIntoImported('rebuild', {contextNotes: 'stale'}, {baselineImported: payload.importedData, scalarClocks: payload.scalarClocks})).toMatchObject({contextNotes: null});
  configureSyncDelta({getEvolu: () => null, getItemRowQuery: () => null});
});

it('a later scalar edit advances beyond an observed future clock without inventing a new edit on the next save', async () => {
  localStorage.clear();
  const fake = makeEvolu();
  configureSyncDelta({getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY});
  writeScalarVersion('clock-skew', 'contextNotes', {clock: 2000, hash: scalarValueHash('contextNotes', 'before')});
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    const edit = await _planScalarDelta('clock-skew', 'contextNotes', 'after');
    expect(Date.parse(String(edit.ops[0]!.args.syncedAt))).toBe(2001);
    writeScalarVersion('clock-skew', 'contextNotes', {clock: 2001, hash: scalarValueHash('contextNotes', 'after')});
    expect((await _planScalarDelta('clock-skew', 'contextNotes', 'after')).ops).toEqual([]);
  } finally {clock.mockRestore(); configureSyncDelta({getEvolu: () => null, getItemRowQuery: () => null});}
});

it.each([null, ''])('publishes a clocked clear of a blob-only confirmed value (%s) before its delayed row arrives', async cleared => {
  localStorage.clear();
  const id = 'clear-before-row', oldClock = 2000;
  const old = {id: 'delayed-live', profileId: id, arrayName: 'contextNotes', itemId: 'contextNotes',
    payload: JSON.stringify({v: 'received in blob'}), syncedAt: new Date(oldClock).toISOString()};
  const fake = makeEvolu();
  configureSyncDelta({getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY});
  configureSyncPush({getEvolu: () => fake.evolu, getProfileQuery: () => PROFILE_QUERY, isSyncEnabled: () => true, getProfiles: () => [{id}]});
  writeScalarVersion(id, 'contextNotes', {clock: oldClock, hash: scalarValueHash('contextNotes', 'received in blob')});
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  try {
    expect(await pushProfile(id, {contextNotes: cleared})).toEqual({ok: true});
    const clear = await parseSyncPayload(fake.profileRows[0]!.dataJson);
    expect(clear.scalarClocks!.contextNotes).toBe(oldClock + 1);
    expect(fake.itemRows).toContainEqual(expect.objectContaining({profileId: id, arrayName: 'contextNotes', payload: JSON.stringify({v: null}), syncedAt: new Date(oldClock + 1).toISOString()}));
    expect(fake.calls.insert.find(call => call.args.arrayName === 'contextNotes')!.args).not.toHaveProperty('isDeleted');
    expect(await pushProfile(id, {contextNotes: cleared, notes: [{date: '2026-10-30', text: 'later'}]})).toEqual({ok: true});
    const later = await parseSyncPayload(fake.profileRows[0]!.dataJson);
    expect(later.scalarClocks!.contextNotes).toBe(oldClock + 1);
    localStorage.clear();
    configureSyncDeltaMerge({getEvolu: () => ({getQueryRows: () => [old]}), getItemRowQuery: () => 'items'});
    const received = await _mergeItemRowsIntoImported(id, {contextNotes: 'received in blob'}, {baselineImported: later.importedData, scalarClocks: later.scalarClocks});
    expect(received.contextNotes).toBe(cleared);
    configureSyncDeltaMerge({getEvolu: () => ({getQueryRows: () => [old, ...fake.itemRows] as DeltaItemRow[]}), getItemRowQuery: () => 'items'});
    expect((await _mergeItemRowsIntoImported(id, {contextNotes: 'received in blob'})).contextNotes).toBeNull();
  } finally {
    clock.mockRestore(); configureSyncDelta({getEvolu: () => null, getItemRowQuery: () => null});
    configureSyncPush({getEvolu: () => null, isSyncEnabled: () => false});
  }
});
