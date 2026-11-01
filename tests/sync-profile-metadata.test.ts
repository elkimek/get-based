import {planProfileMetadata, resolveProfileMetadata, PROFILE_METADATA_SURFACE} from '../js/sync-profile-metadata.js';
import {configureSyncDelta, _applyArrayDelta} from '../js/sync-delta.js';
import {makeEvolu, ITEM_ROW_QUERY, PROFILE_QUERY} from './helpers/sync-runtime-fixture.js';
import {configureSyncPush, pushProfile} from '../js/sync-push.js';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {state} from '../js/state.js';
import {configureProfileDeps, createProfile, getProfiles, touchProfileTimestamp, updateProfileMeta} from '../js/profile.js';
import {mergePulledProfile} from '../js/sync-pull-merge.js';
import {buildSyncPayload, parseSyncPayload, configureSyncPayload} from '../js/sync-payload.js';
import {selectSyncedProfile} from '../js/sync-profile-fields.js';
import {markSyncProfileDirty, clearSyncProfileDirty} from '../js/sync-dirty-state.js';
import {clearLocalSyncCommits} from '../js/sync-origin-state.js';
const id = 'metadata-clock-test';
const previousProfiles = state.profiles;
let previousDeps: ReturnType<typeof configureProfileDeps>;
beforeEach(() => {
  state.profiles = [{id, name: 'A', tags: [], _syncMetadataAt: 200, lastUpdated: 1}];
  previousDeps = configureProfileDeps({encryptedSetItem: async () => {}});
  vi.spyOn(Date, 'now').mockReturnValue(100);
});
afterEach(() => {
  configureProfileDeps(previousDeps); state.profiles = previousProfiles;
  configureSyncDelta({getEvolu: () => null, getItemRowQuery: () => null});
  configureSyncPush({getEvolu: () => null, isSyncEnabled: () => false});
  clearLocalSyncCommits(); localStorage.removeItem(`labcharts-${id}-sync-dirty`); vi.restoreAllMocks();
});
it('stamps actual metadata edits monotonically while ordinary profile activity keeps the edit clock', async () => {
  await updateProfileMeta(id, {name: 'Renamed', tags: ['new']});
  expect(selectSyncedProfile(getProfiles()[0])).toMatchObject({name: 'Renamed', tags: ['new'], _syncMetadataAt: 201});
  await touchProfileTimestamp(id);
  expect(getProfiles()[0]!._syncMetadataAt).toBe(201);
});
it('does not let a newer unrelated envelope overwrite a newer metadata edit', async () => {
  expect(await mergePulledProfile(id, {id, name: 'stale', _syncMetadataAt: 199}, 999_999)).toBe(false);
  expect(getProfiles()[0]!.name).toBe('A');
});
it('accepts newer metadata independently of envelope order and preserves its clock on rebroadcast', async () => {
  expect(await mergePulledProfile(id, {id, name: 'new', _syncMetadataAt: 300}, 10)).toBe(true);
  await touchProfileTimestamp(id);
  expect(selectSyncedProfile(getProfiles()[0])).toMatchObject({name: 'new', _syncMetadataAt: 300});
  expect(await mergePulledProfile(id, {id, name: 'stale', _syncMetadataAt: 200}, 999_999)).toBe(false);
});
it('keeps the existing envelope-clock behavior for an unversioned legacy edit', async () => {
  expect(await mergePulledProfile(id, {id, name: 'legacy'}, 300)).toBe(true);
  expect(selectSyncedProfile(getProfiles()[0])).toMatchObject({name: 'legacy', _syncMetadataAt: 300});
  expect(await mergePulledProfile(id, {id, name: 'older legacy'}, 100)).toBe(false);
});
it('resolves equal-clock conflicts deterministically instead of oscillating on pulls', async () => {
  await mergePulledProfile(id, {id, name: 'Z', _syncMetadataAt: 200}, 400);
  expect(getProfiles()[0]!.name).toBe('Z');
  expect(await mergePulledProfile(id, {id, name: 'A', _syncMetadataAt: 200}, 500)).toBe(false);
  expect(getProfiles()[0]!.name).toBe('Z');
});
it('defers a remote metadata edit while a local edit is still dirty', async () => {
  const token = markSyncProfileDirty(id);
  expect(await mergePulledProfile(id, {id, name: 'remote', _syncMetadataAt: 300}, 300)).toBe(false);
  clearSyncProfileDirty(id, token);
  expect(await mergePulledProfile(id, {id, name: 'remote', _syncMetadataAt: 300}, 300)).toBe(true);
});
it('gives a newly created profile a durable metadata edit clock', async () => {
  const created = await createProfile('New profile', {skipInitialSync: true});
  expect(selectSyncedProfile(getProfiles().find(profile => profile.id === created))).toMatchObject({_syncMetadataAt: 100});
});

it('explicit recovery republishes selected metadata with a fresh clock without changing ordinary reconnect snapshots', async () => {
  const previous = configureSyncPayload({getProfiles});
  try {
    expect((await parseSyncPayload(await buildSyncPayload(id, {}))).profile).toMatchObject({_syncMetadataAt: 200});
    expect((await parseSyncPayload(await buildSyncPayload(id, {}, null, {completeSnapshot: true}))).profile).toMatchObject({_syncMetadataAt: 201});
    expect(getProfiles()[0]!._syncMetadataAt).toBe(200);
  } finally { configureSyncPayload(previous); }
});

it('preserves an independent rename when a newer unrelated profile blob still carries old metadata', async () => {
 const fake = makeEvolu();
 configureSyncDelta({getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY});
 const edit = await planProfileMetadata(id, {id, name: 'Renamed', tags: ['new'], _syncMetadataAt: 300}, false);
 expect(edit.plan.ops).toHaveLength(1);
 expect(_applyArrayDelta(PROFILE_METADATA_SURFACE, edit.plan)).toBe(true);
 expect(await resolveProfileMetadata(id, {id, name: 'old', _syncMetadataAt: 200}, 999999))
  .toMatchObject({profile: {name: 'Renamed', tags: ['new'], _syncMetadataAt: 300}, clock: 300});
 expect(await resolveProfileMetadata(id, null, 999999)).toMatchObject({profile: {name: 'Renamed'}, clock: 300});
 const unrelated = await planProfileMetadata(id, {id, name: 'old', _syncMetadataAt: 200}, false);
 expect(unrelated.plan.ops).toEqual([]);
 expect(unrelated.profile).toMatchObject({name: 'Renamed', _syncMetadataAt: 300});
 const laggingRows = await resolveProfileMetadata(id, {id, name: 'Even newer', _syncMetadataAt: 400}, 10);
 expect(laggingRows).toMatchObject({profile: {name: 'Even newer'}, clock: 400});
});

it('uses the same deterministic Unicode tie-break regardless of duplicate-row delivery order', async () => {
 const row = (name: string) => ({profileId: id, arrayName: PROFILE_METADATA_SURFACE, itemId: PROFILE_METADATA_SURFACE,
  payload: JSON.stringify({v: {id, name, _syncMetadataAt: 300}}), syncedAt: new Date(300).toISOString()});
 const fake = makeEvolu({itemRows: [row('z'), row('ä')]});
 configureSyncDelta({getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY});
 expect((await resolveProfileMetadata(id, null, 0)).profile?.name).toBe('ä');
 fake.itemRows.reverse();
 expect((await resolveProfileMetadata(id, null, 0)).profile?.name).toBe('ä');
});

it('retains a successful recovery clock ahead of a skewed peer so the next rename is a newer edit', async () => {
 const fake = makeEvolu({itemRows: [{profileId: id, arrayName: PROFILE_METADATA_SURFACE, itemId: PROFILE_METADATA_SURFACE,
  payload: JSON.stringify({v: {id, name: 'skewed peer', _syncMetadataAt: 9000}}), syncedAt: new Date(9000).toISOString()}]});
 const previous = configureSyncPayload({getProfiles});
 configureSyncDelta({getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY});
 configureSyncPush({getEvolu: () => fake.evolu, getProfileQuery: () => PROFILE_QUERY, isSyncEnabled: () => true, getProfiles});
 try {
  expect(await pushProfile(id, {}, {completeSnapshot: true, force: true})).toEqual({ok: true});
  expect(getProfiles()[0]).toMatchObject({name: 'A', _syncMetadataAt: 9001});
  await updateProfileMeta(id, {name: 'After recovery'});
  expect(getProfiles()[0]!._syncMetadataAt).toBe(9002);
  expect(await pushProfile(id, {})).toEqual({ok: true});
  expect((await parseSyncPayload(fake.profileRows[0]!.dataJson)).profile).toMatchObject({name: 'After recovery', _syncMetadataAt: 9002});
  expect(await resolveProfileMetadata(id, null, 0)).toMatchObject({profile: {name: 'After recovery'}, clock: 9002});
 } finally {configureSyncPayload(previous);}
});

it('keeps a rename made during pending recovery and queues it above the successful recovery clock', async () => {
 const fake = makeEvolu({itemRows: [{profileId: id, arrayName: PROFILE_METADATA_SURFACE, itemId: PROFILE_METADATA_SURFACE,
  payload: JSON.stringify({v: {id, name: 'skewed peer', _syncMetadataAt: 9000}}), syncedAt: new Date(9000).toISOString()}]});
 let complete: (() => void) | undefined;
 const original = fake.evolu.insert;
 fake.evolu.insert = (table, args, options = {}) => {
  if (table === 'profileData') {complete = options.onComplete; original(table, args);}
  else original(table, args, options);
 };
 const previous = configureSyncPayload({getProfiles});
 configureSyncDelta({getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY});
 configureSyncPush({getEvolu: () => fake.evolu, getProfileQuery: () => PROFILE_QUERY, isSyncEnabled: () => true, getProfiles});
 try {
  markSyncProfileDirty(id);
  const pending = pushProfile(id, {}, {completeSnapshot: true, force: true});
  await vi.waitFor(() => expect(complete).toBeTypeOf('function'));
  await updateProfileMeta(id, {name: 'Concurrent rename', tags: ['keep']});
  complete!();
  expect(await pending).toEqual({ok: true});
  expect(getProfiles()[0]).toMatchObject({name: 'Concurrent rename', tags: ['keep'], _syncMetadataAt: 9002});
  expect(localStorage.getItem(`labcharts-${id}-sync-dirty`)).not.toBeNull();
  expect(await pushProfile(id, {})).toEqual({ok: true});
  expect((await parseSyncPayload(fake.profileRows[0]!.dataJson)).profile).toMatchObject({name: 'Concurrent rename', _syncMetadataAt: 9002});
 } finally {configureSyncPayload(previous);}
});

it('keeps recovery dirty when its successful metadata clock cannot be persisted locally', async () => {
 const fake = makeEvolu();
 const previous = configureSyncPayload({getProfiles});
 configureProfileDeps({encryptedSetItem: async () => {throw new Error('storage unavailable');}});
 configureSyncDelta({getEvolu: () => fake.evolu, getItemRowQuery: () => ITEM_ROW_QUERY});
 configureSyncPush({getEvolu: () => fake.evolu, getProfileQuery: () => PROFILE_QUERY, isSyncEnabled: () => true, getProfiles});
 try {
  const token = markSyncProfileDirty(id);
  expect(await pushProfile(id, {}, {completeSnapshot: true, force: true})).toEqual({ok: false, reason: 'delta-commit-failed'});
  expect(getProfiles()[0]!._syncMetadataAt).toBe(200);
  expect(localStorage.getItem(`labcharts-${id}-sync-dirty`)).toBe(token);
 } finally {configureSyncPayload(previous);}
});
