import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { mergeProfileMutation, rememberProfileData, adoptProfileData } from '../js/profile-data-writes.js';
import { saveImportedData, saveImportedDataForProfile } from '../js/data.js';
import { profileStorageKey } from '../js/profile.js';
import * as crypto from '../js/crypto.js';
import * as sync from '../js/sync.js';
import { mergePulledImportedData, persistPulledImportedData } from '../js/sync-pull-merge.js';
import { refreshActiveProfileAfterPull } from '../js/sync-pull-active-refresh.js';

const profileId = 'profile-write-concurrency';
const key = profileStorageKey(profileId, 'imported');
const entry = (date, markers) => ({ date, markers });
const read = async () => JSON.parse(await crypto.encryptedGetItem(key));
beforeEach(async () => {
  await crypto.encryptedRemoveItem(key);
  state.currentProfile = profileId;
  state.importedData = { entries: [entry('2026-09-01', { 'lipids.apoB': .8 })], notes: [], contextNotes: 'original' };
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
  state.importedData.notes.push({ date: '2026-09-17', text: 'First draft' });
  const add = saveImportedData();
  state.importedData.notes[0].text = 'Edited draft';
  const edit = saveImportedData();
  state.importedData.notes = [];
  const remove = saveImportedData();
  expect(await Promise.all([add, edit, remove])).toEqual([failWrite !== 1, failWrite !== 2, true]);
  expect((await read()).notes).toEqual([]);
  expect(state.importedData.notes).toEqual([]);
});

it('keeps peer additions while later queued saves replace only their own pending additions', async () => {
  const peerNote = { date: '2026-09-16', text: 'Other tab' };
  const peer = structuredClone(state.importedData);
  peer.notes.push(peerNote);
  await crypto.encryptedSetItem(key, JSON.stringify(peer));
  state.importedData.notes.push({ date: '2026-09-17', text: 'First draft' });
  const add = saveImportedData();
  state.importedData.notes[0].text = 'Final draft';
  const edit = saveImportedData();
  expect(await Promise.all([add, edit])).toEqual([true, true]);
  expect((await read()).notes).toEqual([peerNote, { date: '2026-09-17', text: 'Final draft' }]);
  expect(state.importedData.notes).toEqual((await read()).notes);
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
  peer.notes.push(peerNote);
  await crypto.encryptedSetItem(key, JSON.stringify(peer));
  let pendingSave;
  vi.spyOn(sync, 'onDataSaved').mockImplementationOnce(() => {
    // This save has already adopted peer data. A later peer deletion must win.
    state.importedData.contextNotes = 'after adoption';
    pendingSave = saveImportedData();
  });
  state.importedData.notes.push({ date: '2026-09-17', text: 'Local note' });
  const originalRead = crypto.encryptedGetItem;
  let reads = 0;
  vi.spyOn(crypto, 'encryptedGetItem').mockImplementation(async (...args) => {
    const raw = await originalRead(...args);
    if (++reads !== 2) return raw;
    const newer = JSON.parse(raw);
    newer.notes = newer.notes.filter(note => note.text !== 'Other tab');
    await crypto.encryptedSetItem(key, JSON.stringify(newer));
    return JSON.stringify(newer);
  });
  expect(await saveImportedData()).toBe(true);
  expect(await pendingSave).toBe(true);
  expect((await read()).notes).toEqual([{ date: '2026-09-17', text: 'Local note' }]);
  expect((await read()).contextNotes).toBe('after adoption');
  expect(state.importedData.notes).toEqual((await read()).notes);
});

it('merges independent additions, same-entry marker edits, and delete-versus-edit without resurrection', () => {
  const base = { entries: [entry('2026-09-01', { a: 1, b: 2 }), entry('2026-09-02', { a: 2 })] };
  const a = structuredClone(base), b = structuredClone(base);
  a.entries[0].markers.a = 3; a.entries.push(entry('2026-09-03', { a: 4 })); a.entries.splice(1, 1);
  b.entries[0].markers.b = 5; b.entries[1].markers.a = 9; b.entries.push(entry('2026-09-04', { a: 6 }));
  const merged = mergeProfileMutation(base, b, a);
  expect(merged.entries).toEqual([entry('2026-09-01', { a: 3, b: 5 }), entry('2026-09-03', { a: 4 }), entry('2026-09-04', { a: 6 })]);
  expect(mergeProfileMutation(base, a, b).entries).toEqual([entry('2026-09-01', { a: 3, b: 5 }), entry('2026-09-04', { a: 6 }), entry('2026-09-03', { a: 4 })]);
});

it('retains independent ID and natural-key records, including nested room edits', () => {
  const base = { lightEnvironment: { rooms: [{ id: 'room', name: 'Study', floor: 1 }] }, notes: [] };
  const a = structuredClone(base), b = structuredClone(base);
  a.lightEnvironment.rooms[0].name = 'Office'; a.notes.push({ date: '2026-09-01', text: 'A' });
  b.lightEnvironment.rooms[0].floor = 2; b.notes.push({ date: '2026-09-02', text: 'B' });
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
  state.importedData.entries[0].markers['lipids.apoB'] = 1.1;
  expect(await saveImportedData()).toBe(true);
  expect((await persistPulledImportedData(key, profileId, pull.merged, Date.now())).needsRebroadcast).toBe(true);
  const stored = await read();
  expect(stored.contextNotes).toBe('local after pull started');
  expect(stored.entries.map(e => e.date)).toEqual(['2026-09-01', '2026-09-02']);
  expect(stored.entries[0].markers['lipids.apoB']).toBe(1.1);
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
  let release, entered;
  const writing = new Promise(resolve => entered = resolve);
  vi.spyOn(crypto, 'encryptedSetItem').mockImplementationOnce(async (...args) => {
    entered(); await new Promise(resolve => release = resolve); return original(...args);
  });
  const pendingPull = persistPulledImportedData(key, profileId, pull.merged, Date.now());
  await writing;
  state.importedData.contextNotes = 'edited during persistence';
  const pendingSave = saveImportedData();
  release(); await pendingPull; expect(await pendingSave).toBe(true);
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
  expect(base.entries[0]).toBe(refs[0]); expect(base.entries[1]).toBe(refs[1]);
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
  const base = {entries:[serum,saliva]}, a = structuredClone(base), b = structuredClone(base);
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
  a.entries[0].markers.a=3; b.entries[1].markers.b=4;
  expect(await saveImportedDataForProfile(profileId,a,{baseData:base,forceProfileScope:true})).toBe(true);
  expect(await saveImportedDataForProfile(profileId,b,{baseData:base,forceProfileScope:true})).toBe(false);
  expect((await read()).entries).toEqual(a.entries);
});

for (const duringWrite of [false, true]) it(`a committed scoped answer stays successful when live panels conflict ${duringWrite ? 'during' : 'before'} storage`, async () => {
  state.importedData.entries = [entry('2026-09-01', { a: 1 }), entry('2026-09-01', { b: 2 })];
  expect(await saveImportedData()).toBe(true);
  const base = structuredClone(state.importedData), intent = structuredClone(base), peer = structuredClone(base);
  intent.biologyScoreAI = { test: { text: 'Saved interpretation', summary: 'Saved summary', updatedAt: 1 } };
  peer.entries[0].markers.a = 3;
  await crypto.encryptedSetItem(key, JSON.stringify(peer));
  const edit = () => { state.importedData.entries[1].markers.b = 4; };
  if (duringWrite) {
    const original = crypto.encryptedSetItem;
    vi.spyOn(crypto, 'encryptedSetItem').mockImplementationOnce(async (...args) => {
      await original(...args);
      edit();
    });
  } else edit();
  expect(await saveImportedDataForProfile(profileId, intent, { baseData: base, forceProfileScope: true })).toBe(true);
  expect((await read()).biologyScoreAI.test.text).toBe('Saved interpretation');
  expect((await read()).entries).toEqual(peer.entries);
  expect(state.importedData.biologyScoreAI.test.text).toBe('Saved interpretation');
  expect(state.importedData.entries.map(e => e.markers)).toEqual([{ a: 1 }, { b: 4 }]);
  // The retained original baseline prevents a later save from hiding the conflict.
  expect(await saveImportedData()).toBe(false);
  expect((await read()).entries).toEqual(peer.entries);
});

it('a committed pull preserves conflicting unsaved panels without rejecting after storage', async () => {
  state.importedData.entries = [entry('2026-09-01', { a: 1 }), entry('2026-09-01', { b: 2 })];
  expect(await saveImportedData()).toBe(true);
  const pull = await mergePulledImportedData(profileId, null);
  pull.merged.entries[0].markers.a = 3;
  const original = crypto.encryptedSetItem;
  vi.spyOn(crypto, 'encryptedSetItem').mockImplementationOnce(async (...args) => {
    await original(...args);
    state.importedData.entries[1].markers.b = 4;
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
  live.notes.push({ date: '2026-09-02', text: 'Local note added during pull' });
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
  expect(state.importedData.wearableSummary.metrics).toEqual({ steps });
});
