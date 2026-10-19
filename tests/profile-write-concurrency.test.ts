import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { mergeProfileMutation, rememberProfileData, adoptProfileData } from '../js/profile-data-writes.js';
import { saveImportedData, saveImportedDataForProfile, notifyProfileDataContextChanged, configureDataContextDependencies } from '../js/data.js';
import { profileStorageKey } from '../js/profile.js';
import * as crypto from '../js/crypto.js';
import * as sync from '../js/sync.js';
import { mergePulledImportedData, persistPulledImportedData } from '../js/sync-pull-merge.js';
import { refreshActiveProfileAfterPull } from '../js/sync-pull-active-refresh.js';
import { configureSyncPull, onSyncReceived, isSyncPulling } from '../js/sync-pull.js';
import { configureSyncActions, pushDirtyProfiles } from '../js/sync-actions.js';
import { configureSyncSaveHooks, clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { configureSyncTombstones } from '../js/sync-tombstones.js';
import { getSyncDirtyToken } from '../js/sync-dirty-state.js';
import * as syncPayload from '../js/sync-payload.js';
import { configureSyncPush, pushProfile } from '../js/sync-push.js';
import { configureSyncDelta } from '../js/sync-delta.js';

const profileId = 'profile-write-concurrency';
const key = profileStorageKey(profileId, 'imported');
const entry = (date: string, markers: Record<string, number>): { date: string; markers: Record<string, number>; specimen?: string; context?: { sampleTime: string; fasting: boolean } } => ({ date, markers });
// Consumed view of this suite's persisted fixtures; metadata leaves remain opaque.
type StoredFixture = { entries: ReturnType<typeof entry>[]; notes: { date: string; text: string }[]; contextNotes: unknown; biologyScoreAI?: Record<string, { text?: unknown }>; wearableSummary?: { metrics?: unknown }; supplements?: unknown };
const read = async () => JSON.parse((await crypto.encryptedGetItem(key))!) as StoredFixture;
beforeEach(async () => {
  await crypto.encryptedRemoveItem(key);
  state.currentProfile = profileId;
  (state as { importedData: unknown }).importedData = { entries: [entry('2026-09-01', { 'lipids.apoB': .8 })], notes: [], contextNotes: 'original' };
  expect(await saveImportedData()).toBe(true);
});
afterEach(() => vi.restoreAllMocks());

for (const failWrite of [0, 1, 2]) it(`keeps rapid queued note edits and deletion ordered when write ${failWrite} fails`, async () => {
  const originalWrite = crypto.encryptedSetItem;
  let writes = 0;
  vi.spyOn(crypto, 'encryptedSetItem').mockImplementation(async (...args) => {
    if (++writes === failWrite) throw new Error('storage unavailable');
    return originalWrite(...args);
  });
  state.importedData.notes!.push({ date: '2026-09-17', text: 'First draft' });
  const add = saveImportedData();
  state.importedData.notes![0]!.text = 'Edited draft';
  const edit = saveImportedData();
  state.importedData.notes! = [];
  const remove = saveImportedData();
  expect(await Promise.all([add, edit, remove])).toEqual([failWrite !== 1, failWrite !== 2, true]);
  expect((await read()).notes).toEqual([]);
  expect(state.importedData.notes!).toEqual([]);
});

it('keeps peer additions while later queued saves replace only their own pending additions', async () => {
  const peerNote = { date: '2026-09-16', text: 'Other tab' };
  const peer = structuredClone(state.importedData);
  peer.notes!.push(peerNote);
  await crypto.encryptedSetItem(key, JSON.stringify(peer));
  state.importedData.notes!.push({ date: '2026-09-17', text: 'First draft' });
  const add = saveImportedData();
  state.importedData.notes![0]!.text = 'Final draft';
  const edit = saveImportedData();
  expect(await Promise.all([add, edit])).toEqual([true, true]);
  expect((await read()).notes).toEqual([peerNote, { date: '2026-09-17', text: 'Final draft' }]);
  expect(state.importedData.notes!).toEqual((await read()).notes);
});

it('persists a queued undo even when the final value matches the original baseline', async () => {
  state.importedData.contextNotes = 'temporary edit';
  const edit = saveImportedData();
  state.importedData.contextNotes = 'original';
  const undo = saveImportedData();
  expect(await Promise.all([edit, undo])).toEqual([true, true]);
  expect((await read()).contextNotes).toBe('original');
  expect(state.importedData.contextNotes).toBe('original');
});

it('uses the adopted baseline when another save starts during post-save hooks', async () => {
  const peerNote = { date: '2026-09-16', text: 'Other tab' };
  const peer = structuredClone(state.importedData);
  peer.notes!.push(peerNote);
  await crypto.encryptedSetItem(key, JSON.stringify(peer));
  let pendingSave;
  vi.spyOn(sync, 'onDataSaved').mockImplementationOnce(() => {
    // This save has already adopted peer data. A later peer deletion must win.
    state.importedData.contextNotes = 'after adoption';
    pendingSave = saveImportedData();
  });
  state.importedData.notes!.push({ date: '2026-09-17', text: 'Local note' });
  const originalRead = crypto.encryptedGetItem;
  let reads = 0;
  vi.spyOn(crypto, 'encryptedGetItem').mockImplementation(async (...args) => {
    const raw = await originalRead(...args);
    if (++reads !== 2) return raw;
    const newer = JSON.parse(raw!) as StoredFixture;
    newer.notes = newer.notes.filter(note => note.text !== 'Other tab');
    await crypto.encryptedSetItem(key, JSON.stringify(newer));
    return JSON.stringify(newer);
  });
  expect(await saveImportedData()).toBe(true);
  expect(await pendingSave).toBe(true);
  expect((await read()).notes).toEqual([{ date: '2026-09-17', text: 'Local note' }]);
  expect((await read()).contextNotes).toBe('after adoption');
  expect(state.importedData.notes!).toEqual((await read()).notes);
});

it('merges independent additions, same-entry marker edits, and delete-versus-edit without resurrection', () => {
  const base = { entries: [entry('2026-09-01', { a: 1, b: 2 }), entry('2026-09-02', { a: 2 })] };
  const a = structuredClone(base), b = structuredClone(base);
  a.entries[0]!.markers.a = 3; a.entries.push(entry('2026-09-03', { a: 4 })); a.entries.splice(1, 1);
  b.entries[0]!.markers.b = 5; b.entries[1]!.markers.a = 9; b.entries.push(entry('2026-09-04', { a: 6 }));
  const merged = mergeProfileMutation(base, b, a);
  expect(merged.entries).toEqual([entry('2026-09-01', { a: 3, b: 5 }), entry('2026-09-03', { a: 4 }), entry('2026-09-04', { a: 6 })]);
  expect(mergeProfileMutation(base, a, b).entries).toEqual([entry('2026-09-01', { a: 3, b: 5 }), entry('2026-09-04', { a: 6 }), entry('2026-09-03', { a: 4 })]);
});

it('retains independent ID and natural-key records, including nested room edits', () => {
  const base = { lightEnvironment: { rooms: [{ id: 'room', name: 'Study', floor: 1 }] }, notes: [] as { date: string; text: string }[] };
  const a = structuredClone(base), b = structuredClone(base);
  a.lightEnvironment.rooms[0]!.name = 'Office'; a.notes.push({ date: '2026-09-01', text: 'A' });
  b.lightEnvironment.rooms[0]!.floor = 2; b.notes.push({ date: '2026-09-02', text: 'B' });
  const merged = mergeProfileMutation(base, b, a);
  expect(merged.lightEnvironment.rooms).toEqual([{ id: 'room', name: 'Office', floor: 2 }]);
  expect(merged.notes.map(n => n.text)).toEqual(['A', 'B']);
});

it('preserves open-control references when applying a committed snapshot', () => {
  const room = { id: 'r', name: 'Room' }, target = { lightEnvironment: { rooms: [room] } };
  const rooms = target.lightEnvironment.rooms;
  adoptProfileData(target, { lightEnvironment: { rooms: [{ id: 'r', name: 'Renamed' }, { id: 'r2', name: 'New' }] } });
  expect(target.lightEnvironment.rooms).toBe(rooms);
  expect(rooms[0]).toBe(room);
  expect(room.name).toBe('Renamed');
});

it('persists two stale record-array snapshots without dropping either addition', async () => {
  const base = structuredClone(state.importedData), a = structuredClone(base), b = structuredClone(base);
  a.entries.push(entry('2026-09-02', { 'lipids.apoB': .9 }));
  b.entries.push(entry('2026-09-03', { 'lipids.apoB': 1 }));
  expect(await saveImportedDataForProfile(profileId, a, { baseData: base, forceProfileScope: true })).toBe(true);
  expect(await saveImportedDataForProfile(profileId, b, { baseData: base, forceProfileScope: true })).toBe(true);
  expect((await read()).entries.map(e => e.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
});

it('rebases a pull over a committed local edit and later UI refresh preserves newer live edits', async () => {
  const remote = structuredClone(state.importedData);
  remote.contextNotes = 'remote'; remote.entries.push(entry('2026-09-02', { 'lipids.apoB': .9 }));
  const pull = await mergePulledImportedData(profileId, remote);
  state.importedData.contextNotes = 'local after pull started';
  state.importedData.entries[0]!.markers['lipids.apoB'] = 1.1;
  expect(await saveImportedData()).toBe(true);
  expect((await persistPulledImportedData(key, profileId, pull.merged, Date.now())).needsRebroadcast).toBe(true);
  const stored = await read();
  expect(stored.contextNotes).toBe('local after pull started');
  expect(stored.entries.map(e => e.date)).toEqual(['2026-09-01', '2026-09-02']);
  expect(stored.entries[0]!.markers['lipids.apoB']).toBe(1.1);
  state.importedData.contextNotes = 'typed while chat sync awaited';
  refreshActiveProfileAfterPull({ profileId, merged: pull.merged, dataAlreadyApplied: true, localDataChanged: false });
  expect(state.importedData.contextNotes).toBe('typed while chat sync awaited');
  expect(await saveImportedData()).toBe(true);
  expect((await read()).contextNotes).toBe('typed while chat sync awaited');
});

it('keeps a save queued behind an in-flight pull and preserves both changes', async () => {
  const remote = structuredClone(state.importedData); remote.entries.push(entry('2026-09-02', { 'lipids.apoB': .9 }));
  const pull = await mergePulledImportedData(profileId, remote);
  const original = crypto.encryptedSetItem;
  let release: (() => void) | undefined, entered: (() => void) | undefined;
  const writing = new Promise<void>(resolve => entered = resolve);
  vi.spyOn(crypto, 'encryptedSetItem').mockImplementationOnce(async (...args) => {
    entered!(); await new Promise<void>(resolve => release = resolve); return original(...args);
  });
  const pendingPull = persistPulledImportedData(key, profileId, pull.merged, Date.now());
  await writing;
  state.importedData.contextNotes = 'edited during persistence';
  const pendingSave = saveImportedData();
  release!(); await pendingPull; expect(await pendingSave).toBe(true);
  const stored = await read();
  expect(stored.contextNotes).toBe('edited during persistence');
  expect(stored.entries.map(e => e.date)).toEqual(['2026-09-01', '2026-09-02']);
});

it('reads newer stored fields even when the active tab started from an older baseline', async () => {
  const live = state.importedData; rememberProfileData(live);
  const otherTab = structuredClone(live); otherTab.entries.push(entry('2026-09-03', { 'lipids.apoB': 1.2 }));
  await crypto.encryptedSetItem(key, JSON.stringify(otherTab));
  const remote = structuredClone(live); remote.entries.push(entry('2026-09-02', { 'lipids.apoB': .9 }));
  const pull = await mergePulledImportedData(profileId, remote);
  await persistPulledImportedData(key, profileId, pull.merged, Date.now());
  expect((await read()).entries.map(e => e.date).sort()).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
});

it('reports success after durable persistence even when a post-save sync hook fails', async () => {
  vi.spyOn(sync, 'onDataSaved').mockImplementation(() => { throw new Error('post-save hook failed'); });
  state.importedData.contextNotes = 'durable edit';
  expect(await saveImportedData()).toBe(true);
  expect((await read()).contextNotes).toBe('durable edit');
});

it('preserves split same-day panels while merging concurrent lab additions', () => {
  const base = { entries: [entry('2026-09-01', { a: 1 }), entry('2026-09-01', { b: 2 })] };
  const a = structuredClone(base), b = structuredClone(base);
  a.entries.push(entry('2026-09-02', { a: 3 }));
  b.entries.push(entry('2026-09-03', { a: 4 }));
  expect(mergeProfileMutation(base, b, a).entries).toEqual([
    entry('2026-09-01', { a: 1 }), entry('2026-09-01', { b: 2 }), entry('2026-09-02', { a: 3 }), entry('2026-09-03', { a: 4 }),
  ]);
  const refs = [...base.entries];
  adoptProfileData(base, structuredClone(base));
  expect(base.entries[0]!).toBe(refs[0]); expect(base.entries[1]!).toBe(refs[1]);
  expect(base.entries.map(e => e.markers)).toEqual([{a:1},{b:2}]);
});

it('a failed pull write leaves live data intact and releases the lock for a later save', async () => {
  const remote = structuredClone(state.importedData); remote.contextNotes = 'remote';
  const pull = await mergePulledImportedData(profileId, remote);
  const before = JSON.stringify(state.importedData);
  vi.spyOn(crypto, 'encryptedSetItem').mockRejectedValueOnce(new Error('storage unavailable'));
  await expect(persistPulledImportedData(key, profileId, pull.merged, Date.now())).rejects.toThrow('storage unavailable');
  expect(JSON.stringify(state.importedData)).toBe(before);
  expect((await read()).contextNotes).toBe('original');
  state.importedData.contextNotes = 'recovered';
  expect(await saveImportedData()).toBe(true);
  expect((await read()).contextNotes).toBe('recovered');
});

it('a failed initial pull read cannot replace unreadable local data', async () => {
  vi.spyOn(crypto, 'encryptedGetItem').mockRejectedValueOnce(new Error('read unavailable'));
  await expect(mergePulledImportedData(profileId, {entries:[]})).rejects.toThrow('read unavailable');
  expect((await read()).entries).toHaveLength(1);
});


it('keeps same-day specimen and collection context attached to each panel', () => {
  const serum = {...entry('2026-09-01', {cortisol:350}), specimen:'serum', context:{sampleTime:'08:00',fasting:true}};
  const saliva = {...entry('2026-09-01', {cortisol:3}), specimen:'saliva', context:{sampleTime:'23:00',fasting:false}};
  const base: {entries: ReturnType<typeof entry>[]} = {entries:[serum,saliva]}, a = structuredClone(base), b = structuredClone(base);
  a.entries.push(entry('2026-09-02',{a:1})); b.entries.push(entry('2026-09-03',{b:2}));
  expect(mergeProfileMutation(base,b,a).entries.slice(0,2)).toEqual([serum,saliva]);
  const removeSerum = {entries:[saliva]};
  expect(mergeProfileMutation(base,removeSerum,a).entries).toEqual([saliva,entry('2026-09-02',{a:1})]);
  const empty = {entries:[]};
  expect(mergeProfileMutation(empty,{entries:[serum]},{entries:[saliva]}).entries).toEqual([saliva,serum]);
});

it('rejects ambiguous same-day panel conflicts without committing a guessed merge', async () => {
  state.importedData.entries = [entry('2026-09-01',{a:1}),entry('2026-09-01',{b:2})];
  expect(await saveImportedData()).toBe(true);
  const base = structuredClone(state.importedData), a = structuredClone(base), b = structuredClone(base);
  a.entries[0]!.markers.a=3; b.entries[1]!.markers.b=4;
  expect(await saveImportedDataForProfile(profileId,a,{baseData:base,forceProfileScope:true})).toBe(true);
  expect(await saveImportedDataForProfile(profileId,b,{baseData:base,forceProfileScope:true})).toBe(false);
  expect((await read()).entries).toEqual(a.entries);
});

for (const duringWrite of [false, true]) it(`a committed scoped answer stays successful when live panels conflict ${duringWrite ? 'during' : 'before'} storage`, async () => {
  state.importedData.entries = [entry('2026-09-01', { a: 1 }), entry('2026-09-01', { b: 2 })];
  expect(await saveImportedData()).toBe(true);
  const base = structuredClone(state.importedData), intent = structuredClone(base), peer = structuredClone(base);
  intent.biologyScoreAI = { test: { text: 'Saved interpretation', summary: 'Saved summary', updatedAt: 1 } };
  peer.entries[0]!.markers.a = 3;
  await crypto.encryptedSetItem(key, JSON.stringify(peer));
  const edit = () => { state.importedData.entries[1]!.markers.b = 4; };
  if (duringWrite) {
    const original = crypto.encryptedSetItem;
    vi.spyOn(crypto, 'encryptedSetItem').mockImplementationOnce(async (...args) => {
      await original(...args);
      edit();
    });
  } else edit();
  expect(await saveImportedDataForProfile(profileId, intent, { baseData: base, forceProfileScope: true })).toBe(true);
  expect((await read()).biologyScoreAI!.test!.text).toBe('Saved interpretation');
  expect((await read()).entries).toEqual(peer.entries);
  expect(state.importedData.biologyScoreAI!.test!.text).toBe('Saved interpretation');
  expect(state.importedData.entries.map(e => e.markers)).toEqual([{ a: 1 }, { b: 4 }]);
  // The retained original baseline prevents a later save from hiding the conflict.
  expect(await saveImportedData()).toBe(false);
  expect((await read()).entries).toEqual(peer.entries);
});

it('a committed pull preserves conflicting unsaved panels without rejecting after storage', async () => {
  state.importedData.entries = [entry('2026-09-01', { a: 1 }), entry('2026-09-01', { b: 2 })];
  expect(await saveImportedData()).toBe(true);
  const pull = await mergePulledImportedData(profileId, null);
  pull.merged.entries[0]!.markers.a = 3;
  const original = crypto.encryptedSetItem;
  vi.spyOn(crypto, 'encryptedSetItem').mockImplementationOnce(async (...args) => {
    await original(...args);
    state.importedData.entries[1]!.markers.b = 4;
  });
  await expect(persistPulledImportedData(key, profileId, pull.merged, Date.now())).resolves.toBeDefined();
  expect((await read()).entries.map(e => e.markers)).toEqual([{ a: 3 }, { b: 2 }]);
  expect(state.importedData.entries.map(e => e.markers)).toEqual([{ a: 1 }, { b: 4 }]);
  expect(await saveImportedData()).toBe(false);
});

it('wearable reconciliation leaves newer live notes intact until the pull commits', async () => {
  const { reconcilePulledManualWearables } = await import('../js/profile-runtime.js');
  const pull = await mergePulledImportedData(profileId, structuredClone(state.importedData));
  const live = state.importedData;
  live.notes!.push({ date: '2026-09-02', text: 'Local note added during pull' });
  expect(await saveImportedData()).toBe(true);
  await reconcilePulledManualWearables(profileId, pull.merged);
  expect.soft(state.importedData).toBe(live);
  // An ordinary autosave before the draft commits must not erase this note.
  expect(await saveImportedData()).toBe(true);
  await persistPulledImportedData(key, profileId, pull.merged, Date.now());
  expect((await read()).notes.map(note => note.text)).toContain('Local note added during pull');
});

it('captures a coherent pull baseline when a local save starts during the storage read', async () => {
  const originalRead = crypto.encryptedGetItem;
  let pendingSave;
  vi.spyOn(crypto, 'encryptedGetItem').mockImplementationOnce(async (...args) => {
    const raw = await originalRead(...args);
    state.importedData.contextNotes = 'Typed during initial pull read';
    pendingSave = saveImportedData();
    // Let an unlocked save finish; with the lock it must wait for this read.
    await new Promise(resolve => setTimeout(resolve, 20));
    return raw;
  });
  const pull = await mergePulledImportedData(profileId, null);
  expect(await pendingSave).toBe(true);
  expect(pull.merged.contextNotes).toBe('Typed during initial pull read');
  await persistPulledImportedData(key, profileId, pull.merged, Date.now());
  expect((await read()).contextNotes).toBe('Typed during initial pull read');
});

it('persists remote wearable metrics while invalidating only a deleted manual latest reading', async () => {
  const remote = structuredClone(state.importedData);
  remote.manualMetricTombstones = { 'rhr.2026-08-12': Date.now() };
  const steps = { latest: 8200, latestDate: '2026-08-13', primarySource: 'oura' };
  remote.wearableSummary = { sources: { oura: { coverageDays: 40 } }, metrics: {
    steps, rhr: { latest: 61, latestDate: '2026-08-12', primarySource: 'manual' },
  } };
  const pull = await mergePulledImportedData(profileId, remote);
  const { reconcilePulledManualWearables } = await import('../js/profile-runtime.js');
  expect(await reconcilePulledManualWearables(profileId, pull.merged)).toBe(true);
  await persistPulledImportedData(key, profileId, pull.merged, Date.now());
  expect((await read()).wearableSummary).toEqual({ sources: remote.wearableSummary.sources, metrics: { steps } });
  expect(state.importedData.wearableSummary!.metrics).toEqual({ steps });
});


it.each(['entry deletion', 'supplement deletion', 'edit', 'none'])('checks import snapshot inside the write lock: %s', async change => {
  state.importedData.supplements = [{ id: 'tmg', name: 'TMG', startDate: '2026-03-24', dosage: '500 mg' }];
  expect(await saveImportedData()).toBe(true);
  const expectedData = await crypto.encryptedGetItem(key);
  const imported = JSON.parse(expectedData!);
  imported.contextNotes = 'Imported data';
  const peer = JSON.parse(expectedData!);
  if (change === 'entry deletion') peer.entries = [];
  if (change === 'supplement deletion') peer.supplements = [];
  if (change === 'edit') peer.supplements[0]!.dosage = '2000 mg';
  // This write occurs after bundle preflight, before the locked save reads storage.
  await crypto.encryptedSetItem(key, JSON.stringify(peer));
  const write = vi.spyOn(crypto, 'encryptedSetItem');
  const saved = await saveImportedDataForProfile(profileId, imported, { forceProfileScope: true, expectedData });
  expect(saved).toBe(change === 'none');
  if (change !== 'none') {
    expect(write).not.toHaveBeenCalled();
    expect(await read()).toEqual(peer);
  } else {
    expect((await read()).contextNotes).toBe('Imported data');
    expect((await read()).supplements).toEqual(imported.supplements);
  }
});

it('does not mistake nested object key order after adoption for a concurrent period edit', () => {
  const persisted = { supplements: [{ id: 'dose-order', periods: [{ start: '2026-01-01', dose: { text: '75 mg/day', ingredient: 'Example' } }] }] };
  const live = { supplements: [{ id: 'dose-order', periods: [{ start: '2026-01-01', dose: { ingredient: 'Example', text: '75 mg/day' } }] }] };
  const intent = structuredClone(live);
  intent.supplements[0]!.periods[0]!.dose.text = '100 mg/day';
  expect(mergeProfileMutation(live, intent, persisted)).toEqual(intent);
  const peer = structuredClone(persisted);
  peer.supplements[0]!.periods[0]!.dose.text = '90 mg/day';
  expect(() => mergeProfileMutation(live, intent, peer)).toThrow(/Concurrent edits/);
});

it('refreshes scoped committed context for its current profile without scheduling duplicate sync writes', () => {
  const invalidate = vi.fn(), saved = vi.spyOn(sync, 'onDataSaved').mockImplementation(() => {});
  const previous = configureDataContextDependencies({ invalidateLabContextCache: invalidate });
  try {
    expect(notifyProfileDataContextChanged(profileId)).toBe(true);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(saved).toHaveBeenCalledExactlyOnceWith({ skipSync: true });
    state.currentProfile = 'replacement-profile';
    expect(notifyProfileDataContextChanged(profileId)).toBe(false);
    expect(invalidate).toHaveBeenCalledTimes(1); expect(saved).toHaveBeenCalledTimes(1);
  } finally { configureDataContextDependencies(previous); state.currentProfile = profileId; }
});
it('does not turn a committed save into a failure when the context-refresh hook throws', () => {
  vi.spyOn(sync, 'onDataSaved').mockImplementation(() => { throw new Error('Synthetic gateway failure'); });
  expect(notifyProfileDataContextChanged(profileId)).toBe(false);
});


it('rejects a scoped notes edit if the observed saved text changed, without touching newer data', async () => {
  const base = structuredClone(state.importedData), draft = structuredClone(base);
  draft.contextNotes = 'Local pending draft';
  const peer = structuredClone(base); peer.contextNotes = 'Newer saved note'; peer.notes.push({ date: '2026-10-07', text: 'Unrelated peer addition' });
  await crypto.encryptedSetItem(key, JSON.stringify(peer));
  const write = vi.spyOn(crypto, 'encryptedSetItem'), conflict = vi.fn();
  expect(await saveImportedDataForProfile(profileId, draft, { forceProfileScope: true, baseData: base, expectedContextNotes: 'original', onContextNotesConflict: conflict })).toBe(false);
  expect(conflict).toHaveBeenCalledWith('Newer saved note');
  expect(write).not.toHaveBeenCalled(); expect((await read()).contextNotes).toBe('Newer saved note'); expect((await read()).notes).toEqual(peer.notes);
  expect(state.importedData.contextNotes).toBe('original');
});

it('allows a guarded notes edit while merging unrelated saved additions', async () => {
  const base = structuredClone(state.importedData), draft = structuredClone(base); draft.contextNotes = 'Local guarded note';
  const peer = structuredClone(base); peer.notes.push({ date: '2026-10-07', text: 'Independent saved note' }); await crypto.encryptedSetItem(key, JSON.stringify(peer));
  expect(await saveImportedDataForProfile(profileId, draft, { forceProfileScope: true, baseData: base, expectedContextNotes: 'original' })).toBe(true);
  expect((await read()).contextNotes).toBe('Local guarded note'); expect((await read()).notes).toEqual(peer.notes);
});

it('compares guarded notes inside the write queue after an earlier commit', async () => {
  const base = structuredClone(state.importedData), first = structuredClone(base), stale = structuredClone(base);
  first.contextNotes = 'Earlier queued note'; stale.contextNotes = 'Stale queued note';
  const options = { forceProfileScope: true, baseData: base, expectedContextNotes: 'original' };
  const one = saveImportedDataForProfile(profileId, first, options), two = saveImportedDataForProfile(profileId, stale, options);
  expect(await one).toBe(true); expect(await two).toBe(false); expect((await read()).contextNotes).toBe('Earlier queued note');
});

it('keeps the atomic notes guard effective if a conflict observer throws', async () => {
  const base = structuredClone(state.importedData), draft = structuredClone(base); draft.contextNotes = 'Local draft';
  await crypto.encryptedSetItem(key, JSON.stringify({ ...base, contextNotes: 'Saved elsewhere' }));
  expect(await saveImportedDataForProfile(profileId, draft, { baseData: base, forceProfileScope: true, expectedContextNotes: 'original', onContextNotesConflict: () => { throw new Error('observer failed'); } })).toBe(false);
  expect((await read()).contextNotes).toBe('Saved elsewhere');
});

for (const field of ['sleepRest', 'exercise', 'stress', 'loveLife', 'diet', 'environment', 'lightCircadian'] as const) it(`guards stale ${field} form writes inside the locked storage transaction`, async () => {
  const base = structuredClone(state.importedData), draft = structuredClone(base);
  draft[field] = { note: 'Stale local draft' };
  const peer = structuredClone(base); peer[field] = { note: 'Saved by another tab' };
  await crypto.encryptedSetItem(key, JSON.stringify(peer));
  const conflict = vi.fn();
  expect(await saveImportedDataForProfile(profileId, draft, { forceProfileScope: true, baseData: base, expectedContextField: { key: field, value: base[field] ?? null }, onContextFieldConflict: conflict })).toBe(false);
  expect(conflict).toHaveBeenCalledOnce(); expect(JSON.parse((await crypto.encryptedGetItem(key))!)[field]).toEqual(peer[field]);
});
it('accepts equal reordered context objects and merges unrelated peer data', async () => {
  state.importedData.stress = { level: 'moderate', duration: 'weeks', note: 'Existing' }; expect(await saveImportedData()).toBe(true);
  const base = structuredClone(state.importedData), draft = structuredClone(base); draft.stress = { ...draft.stress as object, note: 'Changed' };
  const peer = structuredClone(base); peer.stress = { note: 'Existing', duration: 'weeks', level: 'moderate' }; peer.contextNotes = 'Other tab notes';
  await crypto.encryptedSetItem(key, JSON.stringify(peer));
  expect(await saveImportedDataForProfile(profileId, draft, { forceProfileScope: true, baseData: base, expectedContextField: { key: 'stress', value: base.stress } })).toBe(true);
  const stored = JSON.parse((await crypto.encryptedGetItem(key))!); expect(stored.contextNotes).toBe('Other tab notes'); expect(stored.stress.note).toBe('Changed');
});
it('snapshots the expected context field before a queued read and rejects changes even if the observer throws', async () => {
  const base = structuredClone(state.importedData), draft = structuredClone(base); draft.stress = { note: 'Local' };
  const peer = structuredClone(base); peer.stress = { note: 'Peer' }; await crypto.encryptedSetItem(key, JSON.stringify(peer));
  const expected = { key: 'stress' as const, value: null as unknown };
  const saving = saveImportedDataForProfile(profileId, draft, { forceProfileScope: true, baseData: base, expectedContextField: expected, onContextFieldConflict: () => { throw new Error('Observer failed'); } });
  expected.value = peer.stress;
  expect(await saving).toBe(false); expect(JSON.parse((await crypto.encryptedGetItem(key))!).stress).toEqual(peer.stress);
});

it('guards observed goal arrays atomically and retains peer goals without publishing stale removals', async () => {
  state.importedData.healthGoals = [{ text: 'Original', severity: 'mild' }]; expect(await saveImportedData()).toBe(true);
  const base = structuredClone(state.importedData), draft = structuredClone(base); draft.healthGoals = [];
  const peer = structuredClone(base); peer.healthGoals.push({ text: 'Peer goal', severity: 'major' }); await crypto.encryptedSetItem(key, JSON.stringify(peer));
  const conflict = vi.fn();
  expect(await saveImportedDataForProfile(profileId, draft, { forceProfileScope: true, baseData: base, expectedContextField: { key: 'healthGoals', value: base.healthGoals }, onContextFieldConflict: conflict })).toBe(false);
  expect(conflict).toHaveBeenCalledOnce(); expect(JSON.parse((await crypto.encryptedGetItem(key))!).healthGoals).toEqual(peer.healthGoals);
});

it('guards an observed lens inside the storage transaction and preserves a peer lens on conflict', async () => {
  state.importedData.interpretiveLens = 'Original lens'; expect(await saveImportedData()).toBe(true);
  const base = structuredClone(state.importedData), draft = structuredClone(base); draft.interpretiveLens = 'Stale lens';
  const peer = structuredClone(base); peer.interpretiveLens = 'Peer lens'; await crypto.encryptedSetItem(key, JSON.stringify(peer));
  const conflict = vi.fn();
  expect(await saveImportedDataForProfile(profileId, draft, { forceProfileScope: true, baseData: base, expectedContextField: { key: 'interpretiveLens', value: base.interpretiveLens }, onContextFieldConflict: conflict })).toBe(false);
  expect(conflict).toHaveBeenCalledOnce(); expect(JSON.parse((await crypto.encryptedGetItem(key))!).interpretiveLens).toBe('Peer lens');
});

it('accepts the first lens edit when a legacy stored profile has no lens property', async () => {
  expect(await saveImportedData()).toBe(true); const base = structuredClone(state.importedData), draft = structuredClone(base); draft.interpretiveLens = 'First lens';
  const legacy = JSON.parse((await crypto.encryptedGetItem(key))!); delete legacy.interpretiveLens; await crypto.encryptedSetItem(key, JSON.stringify(legacy));
  expect(await saveImportedDataForProfile(profileId, draft, { forceProfileScope: true, baseData: base, expectedContextField: { key: 'interpretiveLens', value: base.interpretiveLens } })).toBe(true);
  expect(JSON.parse((await crypto.encryptedGetItem(key))!).interpretiveLens).toBe('First lens');
});

it('snapshots and checks every expected setup field in the same queued transaction', async () => {
  const base = structuredClone(state.importedData), draft = structuredClone(base);
  draft.sunDefaults = { fitzpatrick: 'IV' }; draft.lightCircadian = { skinType: 'IV — olive' };
  const peer = structuredClone(base); peer.lightCircadian = { skinType: 'V — brown' };
  await crypto.encryptedSetItem(key, JSON.stringify(peer));
  const expected = [{ key: 'sunDefaults' as const, value: base.sunDefaults ?? null }, { key: 'lightCircadian' as const, value: base.lightCircadian ?? null }];
  const conflict = vi.fn(() => { throw new Error('Observer failed'); });
  const pending = saveImportedDataForProfile(profileId, draft, { forceProfileScope: true, baseData: base, expectedContextFields: expected, onContextFieldConflict: conflict });
  expected[1]!.value = peer.lightCircadian;
  expect(await pending).toBe(false); expect(conflict).toHaveBeenCalledOnce();
  expect(JSON.parse((await crypto.encryptedGetItem(key))!)).toEqual(peer);
});


it('keeps a local scalar and note saved after pull preflight but before its decoded payload is adopted', async () => {
  const remote = structuredClone(state.importedData);
  const dataJson = JSON.stringify({ _v: 3, importedData: remote, profile: null });
  const row = { id: 'late-save-row', profileId, syncedAt: '2026-09-01T00:00:00.000Z', dataJson };
  const profiles = () => [{ id: profileId }];
  const sent: unknown[] = [];
  const transport = vi.fn(async (_profileId: unknown, data: unknown) => {
    sent.push(structuredClone(data));
    return { ok: true };
  });
  const preflight = vi.fn(async () => pushDirtyProfiles({ force: true }));
  const previousSaveHooks = configureSyncSaveHooks({});
  const previousTombstones = configureSyncTombstones({});
  const dirtyKey = `labcharts-${profileId}-sync-dirty`;
  const previousDirty = localStorage.getItem(dirtyKey);
  let releaseDecode!: () => void;
  let signalDecode!: () => void;
  const decoding = new Promise<void>(resolve => { signalDecode = resolve; });
  const decoded = new Promise<void>(resolve => { releaseDecode = resolve; });
  const actualDecode = syncPayload.parseSyncPayload;
  let gated = false;
  let pendingPull: Promise<void> | undefined;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    // Keep real saving, locking, merging and dirty-generation handling. Only
    // the network endpoint and the decoder's asynchronous completion are owned
    // test seams; the wrapper still runs the original payload decoder.
    localStorage.removeItem(dirtyKey);
    configureSyncActions({ pushProfile: transport, getProfiles: profiles });
    configureSyncSaveHooks({ isSyncConfigured: () => true, isSyncEnabled: () => false, getProfiles: profiles });
    configureSyncTombstones({ isSyncEnabled: () => false });
    configureSyncPull({
      getEvolu: () => ({ getQueryRows: () => [row] }), getProfileQuery: () => ({}),
      isSyncEnabled: () => true, getProfiles: profiles, pushDirtyProfiles: preflight,
      pushProfile: transport, reconcilePulledManualWearables: async () => {},
    });
    vi.spyOn(syncPayload, 'parseSyncPayload').mockImplementation(async value => {
      const payload = await actualDecode(value);
      if (value === dataJson && !gated) {
        gated = true;
        signalDecode();
        await decoded;
      }
      return payload;
    });
    pendingPull = onSyncReceived();
    await Promise.race([
      decoding,
      pendingPull.then(() => { throw new Error('Pull completed before the payload-decoder barrier'); }),
    ]);
    expect(preflight).toHaveBeenCalledWith({ force: true });
    expect(transport).not.toHaveBeenCalled();
    expect(getSyncDirtyToken(profileId)).toBeNull();

    state.importedData.contextNotes = 'saved while the old payload was decoding';
    state.importedData.notes!.push({ date: '2026-09-17', text: 'saved during decoding' });
    expect(await saveImportedData()).toBe(true);
    expect(getSyncDirtyToken(profileId)).toEqual(expect.any(String));
    expect((await read()).contextNotes).toBe('saved while the old payload was decoding');
    expect((await read()).notes).toEqual([{ date: '2026-09-17', text: 'saved during decoding' }]);

    releaseDecode();
    await pendingPull;
    expect(state.importedData.contextNotes).toBe('saved while the old payload was decoding');
    expect(state.importedData.notes).toEqual([{ date: '2026-09-17', text: 'saved during decoding' }]);
    expect((await read()).contextNotes).toBe('saved while the old payload was decoding');
    expect((await read()).notes).toEqual([{ date: '2026-09-17', text: 'saved during decoding' }]);
    expect(await pushDirtyProfiles()).toEqual({ total: 1, succeeded: 1, failed: 0, skipped: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      contextNotes: 'saved while the old payload was decoding',
      notes: [{ date: '2026-09-17', text: 'saved during decoding' }],
    });
  } finally {
    try {
      releaseDecode();
      await pendingPull;
    } finally {
      clearSyncSaveTimers();
      vi.clearAllTimers();
      vi.useRealTimers();
      configureSyncPull({
        getEvolu: () => null, getProfileQuery: () => null, isSyncEnabled: () => true,
        getProfiles: () => [], pushDirtyProfiles: async () => ({ total: 0, succeeded: 0, failed: 0, skipped: 0 }),
        pushProfile: async () => {}, reconcilePulledManualWearables: async () => {},
      });
      configureSyncActions({ pushProfile: async () => {}, getProfiles: () => [] });
      configureSyncSaveHooks(previousSaveHooks);
      configureSyncTombstones(previousTombstones);
      if (previousDirty === null) localStorage.removeItem(dirtyKey); else localStorage.setItem(dirtyKey, previousDirty);
    }
  }
});

for (const scenario of [
  { name: 'active pending save', inactive: false, fastPush: false, failSave: false },
  { name: 'active acknowledged save', inactive: false, fastPush: true, failSave: false },
  { name: 'inactive pending save', inactive: true, fastPush: false, failSave: false },
  { name: 'inactive acknowledged save', inactive: true, fastPush: true, failSave: false },
  { name: 'failed write followed by retry', inactive: false, fastPush: false, failSave: true },
]) it(`retains late local edits and unrelated remote changes: ${scenario.name}`, async () => {
  const originalData = state.importedData;
  const baseline = structuredClone(originalData);
  const localNote = { date: '2026-09-17', text: 'local during decoding' };
  const remoteNote = { date: '2026-09-18', text: 'remote before decoding' };
  const localText = 'late local scalar';
  const remote = structuredClone(baseline);
  remote.interpretiveLens = 'independent remote lens';
  remote.notes!.push(remoteNote);
  const dataJson = JSON.stringify({ _v: 3, importedData: remote, profile: null });
  const row = { id: 'early-baseline-row', profileId, syncedAt: '2026-09-01T00:00:00.000Z', dataJson };
  const otherId = `${profileId}-inactive-control`;
  const otherKey = profileStorageKey(otherId, 'imported');
  const previousOther = await crypto.encryptedGetItem(otherKey);
  const profiles = () => scenario.inactive ? [{ id: profileId }, { id: otherId }] : [{ id: profileId }];
  const previousHooks = configureSyncSaveHooks({});
  const previousTombstones = configureSyncTombstones({});
  const ownedPrefix = `labcharts-${profileId}-`;
  const previousKeys = new Map<string, string>();
  for (let index = 0; index < localStorage.length; index++) {
    const name = localStorage.key(index);
    if (name?.startsWith(ownedPrefix)) previousKeys.set(name, localStorage.getItem(name)!);
  }
  const wire: string[] = [];
  const itemRows: unknown[] = [];
  const write = (table: 'profileData' | 'itemRow', args: unknown, options?: { onComplete?: () => void }) => {
    if (table === 'profileData') {
      if (!args || typeof args !== 'object' || !('dataJson' in args) || typeof args.dataJson !== 'string') throw new Error('Expected a complete profile wire payload');
      wire.push(args.dataJson);
    } else itemRows.push(structuredClone(args));
    options?.onComplete?.();
    return { id: 'acknowledged-test-row' };
  };
  const endpoint = { getQueryRows: () => [row], insert: write, update: write };
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const decoding = new Promise<void>(resolve => { entered = resolve; });
  const actualDecode = syncPayload.parseSyncPayload;
  let gated = false, pending: Promise<void> | undefined;
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    localStorage.removeItem(`${ownedPrefix}sync-dirty`);
    if (scenario.inactive) {
      state.currentProfile = otherId;
      (state as { importedData: unknown }).importedData = { entries: [], notes: [], contextNotes: 'other profile stays unchanged' };
      expect(await saveImportedData()).toBe(true);
    }
    configureSyncPush({ getEvolu: () => endpoint, getProfileQuery: () => ({}), isSyncEnabled: () => true, getProfiles: profiles });
    configureSyncDelta({ getEvolu: () => ({ getQueryRows: () => [], insert: write, update: write }), getItemRowQuery: () => ({}) });
    configureSyncActions({ pushProfile, getProfiles: profiles });
    configureSyncSaveHooks({ isSyncConfigured: () => true, isSyncEnabled: () => false, getProfiles: profiles });
    configureSyncTombstones({ getEvolu: () => null });
    configureSyncPull({
      getEvolu: () => endpoint, getProfileQuery: () => ({}), isSyncEnabled: () => true,
      getProfiles: profiles, pushDirtyProfiles, pushProfile, reconcilePulledManualWearables: async () => {},
    });
    vi.spyOn(syncPayload, 'parseSyncPayload').mockImplementation(async value => {
      const parsed = await actualDecode(value);
      if (value === dataJson && !gated) { gated = true; entered(); await gate; }
      return parsed;
    });
    pending = onSyncReceived();
    await Promise.race([decoding, pending.then(() => { throw new Error('Pull never reached the decoder barrier'); })]);
    expect(wire).toEqual([]);
    expect(getSyncDirtyToken(profileId)).toBeNull();
    const edit = scenario.inactive ? structuredClone(baseline) : state.importedData;
    edit.contextNotes = localText;
    edit.notes!.push(localNote);
    const save = () => scenario.inactive
      ? saveImportedDataForProfile(profileId, edit, { forceProfileScope: true, baseData: baseline })
      : saveImportedData();
    if (scenario.failSave) {
      vi.spyOn(crypto, 'encryptedSetItem').mockRejectedValueOnce(new Error('owned save fault'));
      expect(await save()).toBe(false);
      expect((await read()).contextNotes).toBe(baseline.contextNotes);
      expect(getSyncDirtyToken(profileId)).toBeNull();
    }
    expect(await save()).toBe(true);
    expect((await read()).contextNotes).toBe(localText);
    expect(getSyncDirtyToken(profileId)).toEqual(expect.any(String));
    if (scenario.fastPush) {
      expect(await pushDirtyProfiles()).toEqual({ total: 1, succeeded: 1, failed: 0, skipped: 0 });
      expect(wire).toHaveLength(1);
      expect(getSyncDirtyToken(profileId)).toBeNull();
      expect((await actualDecode(wire[0])).importedData).toMatchObject({ contextNotes: localText });
    }
    release();
    await pending;
    const committed = await read();
    expect(committed.contextNotes).toBe(localText);
    expect(committed).toMatchObject({ interpretiveLens: 'independent remote lens' });
    expect(committed.notes).toHaveLength(2);
    expect(committed.notes).toEqual(expect.arrayContaining([localNote, remoteNote]));
    if (scenario.inactive) {
      expect(state.currentProfile).toBe(otherId);
      expect(state.importedData.contextNotes).toBe('other profile stays unchanged');
      expect(state.importedData.notes).toEqual([]);
    } else {
      expect(state.importedData.contextNotes).toBe(localText);
      expect(state.importedData).toMatchObject({ interpretiveLens: 'independent remote lens' });
      expect(state.importedData.notes).toHaveLength(2);
      expect(state.importedData.notes).toEqual(expect.arrayContaining([localNote, remoteNote]));
    }
    expect(await pushProfile(profileId, committed)).toMatchObject({ ok: true });
    expect(wire.length).toBeGreaterThan(0);
    expect((await actualDecode(wire.at(-1))).importedData).toMatchObject({ contextNotes: localText, interpretiveLens: 'independent remote lens' });
    expect(itemRows).toEqual(expect.arrayContaining([expect.objectContaining({ arrayName: 'contextNotes', itemId: 'contextNotes', payload: JSON.stringify({ v: localText }) })]));
    expect(isSyncPulling()).toBe(false);
  } finally {
    try { release(); await pending; } finally {
      clearSyncSaveTimers(); vi.clearAllTimers(); vi.useRealTimers();
      configureSyncPull({ getEvolu: () => null, getProfileQuery: () => null, isSyncEnabled: () => true, getProfiles: () => [], pushDirtyProfiles: async () => ({ total: 0, succeeded: 0, failed: 0, skipped: 0 }), pushProfile: async () => {}, reconcilePulledManualWearables: async () => {} });
      configureSyncActions({ pushProfile: async () => {}, getProfiles: () => [] });
      configureSyncPush({ getEvolu: () => null, getProfileQuery: () => null, isSyncEnabled: () => false, getProfiles: () => [] });
      configureSyncDelta({ getEvolu: () => null, getItemRowQuery: () => null });
      configureSyncSaveHooks(previousHooks); configureSyncTombstones(previousTombstones);
      for (let index = localStorage.length - 1; index >= 0; index--) { const name = localStorage.key(index); if (name?.startsWith(ownedPrefix)) localStorage.removeItem(name); }
      for (const [name, value] of previousKeys) localStorage.setItem(name, value);
      state.currentProfile = profileId; state.importedData = originalData;
      if (previousOther === null) await crypto.encryptedRemoveItem(otherKey); else await crypto.encryptedSetItem(otherKey, previousOther);
    }
  }
});

it('releases pull ownership after a decoder exception and accepts the next valid payload', async () => {
  const remote = structuredClone(state.importedData);
  remote.interpretiveLens = 'valid after decoder failure';
  const dataJson = JSON.stringify({ _v: 3, importedData: remote, profile: null });
  const row = { id: 'decoder-error-row', profileId, syncedAt: '2026-09-01T00:00:00.000Z', dataJson };
  const previousTombstones = configureSyncTombstones({ getEvolu: () => null });
  const fault = new Error('owned decoder fault');
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const actualDecode = syncPayload.parseSyncPayload;
  let pending: Promise<void> | undefined;
  try {
    configureSyncPull({ getEvolu: () => ({ getQueryRows: () => [row] }), getProfileQuery: () => ({}), isSyncEnabled: () => true, getProfiles: () => [{ id: profileId }], pushDirtyProfiles: async () => ({ total: 0, succeeded: 0, failed: 0, skipped: 0 }), reconcilePulledManualWearables: async () => {} });
    vi.spyOn(syncPayload, 'parseSyncPayload').mockRejectedValueOnce(fault).mockImplementation(actualDecode);
    pending = onSyncReceived(); await pending;
    expect(errors).toHaveBeenCalledWith('[sync] Pull failed for row:', fault);
    expect(isSyncPulling()).toBe(false);
    expect((await read()).contextNotes).toBe('original');
    expect((await read())).not.toMatchObject({ interpretiveLens: 'valid after decoder failure' });
    pending = onSyncReceived(); await pending;
    expect(isSyncPulling()).toBe(false);
    expect((await read())).toMatchObject({ interpretiveLens: 'valid after decoder failure' });
    expect(errors).toHaveBeenCalledTimes(1);
  } finally {
    try { await pending; } finally {
      configureSyncPull({ getEvolu: () => null, getProfileQuery: () => null, isSyncEnabled: () => true, getProfiles: () => [], pushDirtyProfiles: async () => ({ total: 0, succeeded: 0, failed: 0, skipped: 0 }), reconcilePulledManualWearables: async () => {} });
      configureSyncTombstones(previousTombstones);
    }
  }
});

it('isolates an unreadable profile while a healthy profile accepts its remote update', async () => {
  const healthyId = `${profileId}-healthy-read-control`;
  const healthyKey = profileStorageKey(healthyId, 'imported');
  const previousHealthy = await crypto.encryptedGetItem(healthyKey);
  const actualRead = crypto.encryptedGetItem;
  const beforeBad = await actualRead(key);
  const beforeLive = structuredClone(state.importedData);
  const healthy = structuredClone(state.importedData);
  healthy.contextNotes = 'healthy before pull';
  await crypto.encryptedSetItem(healthyKey, JSON.stringify(healthy));
  const nextHealthy = structuredClone(healthy); nextHealthy.contextNotes = 'healthy remote update';
  const rows = [
    { id: 'unreadable-row', profileId, syncedAt: '2026-09-01T00:00:00.000Z', dataJson: JSON.stringify({ _v: 3, importedData: beforeLive, profile: null }) },
    { id: 'healthy-row', profileId: healthyId, syncedAt: '2026-09-02T00:00:00.000Z', dataJson: JSON.stringify({ _v: 3, importedData: nextHealthy, profile: null }) },
  ];
  const fault = new Error('owned unreadable profile');
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  const previousTombstones = configureSyncTombstones({ getEvolu: () => null });
  let pending: Promise<void> | undefined;
  try {
    vi.spyOn(crypto, 'encryptedGetItem').mockImplementation((name, options) => name === key ? Promise.reject(fault) : actualRead(name, options));
    configureSyncPull({ getEvolu: () => ({ getQueryRows: () => rows }), getProfileQuery: () => ({}), isSyncEnabled: () => true, getProfiles: () => [{ id: profileId }, { id: healthyId }], pushDirtyProfiles: async () => ({ total: 0, succeeded: 0, failed: 0, skipped: 0 }), reconcilePulledManualWearables: async () => {} });
    pending = onSyncReceived(); await pending;
    expect(errors).toHaveBeenCalledWith('[sync] Pull failed for row:', fault);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(state.importedData).toEqual(beforeLive);
    expect(await actualRead(key)).toBe(beforeBad);
    expect(JSON.parse((await actualRead(healthyKey))!)).toMatchObject({ contextNotes: 'healthy remote update' });
    expect(isSyncPulling()).toBe(false);
  } finally {
    try { await pending; } finally {
      configureSyncPull({ getEvolu: () => null, getProfileQuery: () => null, isSyncEnabled: () => true, getProfiles: () => [], pushDirtyProfiles: async () => ({ total: 0, succeeded: 0, failed: 0, skipped: 0 }), reconcilePulledManualWearables: async () => {} });
      configureSyncTombstones(previousTombstones);
      if (previousHealthy === null) await crypto.encryptedRemoveItem(healthyKey); else await crypto.encryptedSetItem(healthyKey, previousHealthy);
    }
  }
});
