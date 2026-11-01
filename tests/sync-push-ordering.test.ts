import {afterEach, expect, it, vi} from 'vitest';
import {configureSyncPush, pushProfile, isSyncPushInFlight} from '../js/sync-push.js';
import {configureSyncDelta} from '../js/sync-delta.js';
import * as payload from '../js/sync-payload.js';
import {getSyncDirtyToken, markSyncProfileDirty} from '../js/sync-dirty-state.js';
import {getSyncStatus} from '../js/sync-state.js';
import {makeEvolu, PROFILE_QUERY, ITEM_ROW_QUERY} from './helpers/sync-runtime-fixture.js';

// Keep IndexedDB's setImmediate scheduler real while controlling sync deadlines.

afterEach(() => {vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers(); localStorage.clear();});
it.each([false, true])('a delayed forced snapshot cannot overwrite a newer completed edit (initially dirty: %s)', async initiallyDirty => {
  vi.useFakeTimers({toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']}); vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
  const id = `push-order-${initiallyDirty}`;
  const fixture = makeEvolu();
  configureSyncDelta({getEvolu: () => fixture.evolu, getItemRowQuery: () => ITEM_ROW_QUERY});
  configureSyncPush({getEvolu: () => fixture.evolu, getProfileQuery: () => PROFILE_QUERY,
    isSyncEnabled: () => true, isPhase2CutoverEnabled: () => false, getProfiles: () => [{id}]});
  expect(await pushProfile(id, {contextNotes: 'baseline'})).toMatchObject({ok: true});
  let entered!: () => void, release!: () => void;
  const reached = new Promise<void>(resolve => {entered = resolve;});
  const gate = new Promise<void>(resolve => {release = resolve;});
  const actualBuild = payload.buildSyncPayload;
  vi.spyOn(payload, 'buildSyncPayload').mockImplementationOnce(async (...args) => {
    entered(); await gate; return actualBuild(...args);
  });
  if (initiallyDirty) markSyncProfileDirty(id);
  vi.setSystemTime(new Date('2026-10-31T12:00:01Z'));
  const older = pushProfile(id, {contextNotes: 'older pending snapshot'}, {force: true});
  try {
    await reached;
    vi.setSystemTime(new Date('2026-10-31T12:00:02Z'));
    markSyncProfileDirty(id);
    expect(await pushProfile(id, {contextNotes: 'newest local edit'}, {force: true})).toMatchObject({ok: true});
    release(); expect(await older).toMatchObject({ok: false, skipped: true, reason: 'superseded'});
    const row = fixture.itemRows.find(row => row.arrayName === 'contextNotes');
    expect(JSON.parse(String(row!.payload))).toEqual({v: 'newest local edit'});
    expect((await payload.parseSyncPayload(fixture.profileRows[0]!.dataJson)).importedData)
      .toMatchObject({contextNotes: 'newest local edit'});
  } finally {release(); await older;}
});

it('retains a later dirty generation when an older snapshot finishes planning without another push', async () => {
  vi.useFakeTimers({toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']}); const id = 'push-order-local-change'; const fixture = makeEvolu();
  configureSyncDelta({getEvolu: () => fixture.evolu, getItemRowQuery: () => ITEM_ROW_QUERY});
  configureSyncPush({getEvolu: () => fixture.evolu, getProfileQuery: () => PROFILE_QUERY,
    isSyncEnabled: () => true, isPhase2CutoverEnabled: () => false, getProfiles: () => [{id}]});
  let entered!: () => void, release!: () => void;
  const reached = new Promise<void>(resolve => {entered = resolve;});
  const gate = new Promise<void>(resolve => {release = resolve;}); const actualBuild = payload.buildSyncPayload;
  vi.spyOn(payload, 'buildSyncPayload').mockImplementationOnce(async (...args) => {entered(); await gate; return actualBuild(...args);});
  const older = pushProfile(id, {contextNotes: 'older snapshot'}, {force: true});
  try {
    await reached; const token = markSyncProfileDirty(id); release();
    expect(await older).toMatchObject({ok: false, skipped: true, reason: 'superseded'});
    expect(fixture.profileRows).toEqual([]); expect(fixture.itemRows).toEqual([]);
    expect(getSyncDirtyToken(id)).toBe(token); expect(isSyncPushInFlight()).toBe(false);
    expect(getSyncStatus().push).not.toBe('pending');
    expect(await pushProfile(id, {contextNotes: 'newest local edit'})).toMatchObject({ok: true});
    expect(getSyncDirtyToken(id)).toBeNull();
  } finally {release(); await older;}
});

it('ignores an older SDK completion after the newer forced push has committed', async () => {
  vi.useFakeTimers({toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']}); const id = 'push-order-late-ack'; const fixture = makeEvolu();
  configureSyncDelta({getEvolu: () => fixture.evolu, getItemRowQuery: () => ITEM_ROW_QUERY});
  configureSyncPush({getEvolu: () => fixture.evolu, getProfileQuery: () => PROFILE_QUERY,
    isSyncEnabled: () => true, isPhase2CutoverEnabled: () => false, getProfiles: () => [{id}]});
  expect(await pushProfile(id, {contextNotes: 'baseline'})).toMatchObject({ok: true});
  let entered!: () => void, complete!: () => void; const reached = new Promise<void>(resolve => {entered = resolve;});
  const actualUpdate = fixture.evolu.update;
  vi.spyOn(fixture.evolu, 'update').mockImplementationOnce((table, args, options) => {
    actualUpdate(table, args, {}); complete = options!.onComplete!; entered();
  });
  const older = pushProfile(id, {contextNotes: 'older pending ack'}, {force: true});
  try {
    await reached;
    expect(await pushProfile(id, {contextNotes: 'newest local edit'}, {force: true})).toMatchObject({ok: true});
    complete(); expect(await older).toMatchObject({ok: false, skipped: true, reason: 'superseded'});
    const row = fixture.itemRows.find(row => row.arrayName === 'contextNotes');
    expect(JSON.parse(String(row!.payload))).toEqual({v: 'newest local edit'});
    expect(getSyncStatus().push).toBe('confirmed'); expect(isSyncPushInFlight()).toBe(false);
  } finally {complete?.(); await older;}
});

it.each([false, true])('profile completions retain the other pending push (newest completes first: %s)', async newestFirst => {
  vi.useFakeTimers({toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']}); const fixture = makeEvolu(); const ids = ['push-order-a', 'push-order-b'];
  configureSyncDelta({getEvolu: () => fixture.evolu, getItemRowQuery: () => ITEM_ROW_QUERY});
  configureSyncPush({getEvolu: () => fixture.evolu, getProfileQuery: () => PROFILE_QUERY,
    isSyncEnabled: () => true, isPhase2CutoverEnabled: () => false, getProfiles: () => ids.map(id => ({id}))});
  const completions = new Map<string, () => void>();
  const originalInsert = fixture.evolu.insert;
  vi.spyOn(fixture.evolu, 'insert').mockImplementation((table, args, options) => {
    if (table === 'profileData') {originalInsert(table, args, {}); completions.set(String(args.profileId), options!.onComplete!);}
    else originalInsert(table, args, options);
  });
  const a = pushProfile(ids[0], {contextNotes: 'profile A'}, {force: true});
  await vi.waitFor(() => expect(completions.has(ids[0]!)).toBe(true));
  const b = pushProfile(ids[1], {contextNotes: 'profile B'}, {force: true});
  try {
    await vi.waitFor(() => expect(completions.has(ids[1]!)).toBe(true));
    const first = newestFirst ? 1 : 0, second = newestFirst ? 0 : 1;
    completions.get(ids[first]!)!(); expect(await [a,b][first]).toMatchObject({ok: true});
    expect(isSyncPushInFlight()).toBe(true); expect(getSyncStatus().push).toBe('pending');
    completions.get(ids[second]!)!(); expect(await [a,b][second]).toMatchObject({ok: true});
    expect(isSyncPushInFlight()).toBe(false); expect(getSyncStatus().push).toBe('confirmed');
  } finally {for (const complete of completions.values()) complete(); await Promise.all([a,b]);}
});

it('a timed-out SDK callback cannot later clear its error or apply retired deltas', async () => {
  vi.useFakeTimers({toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']}); const id = 'push-order-timeout'; const fixture = makeEvolu();
  configureSyncDelta({getEvolu: () => fixture.evolu, getItemRowQuery: () => ITEM_ROW_QUERY});
  configureSyncPush({getEvolu: () => fixture.evolu, getProfileQuery: () => PROFILE_QUERY,
    isSyncEnabled: () => true, isPhase2CutoverEnabled: () => false, getProfiles: () => [{id}]});
  let entered!: () => void, complete!: () => void;
  const reached = new Promise<void>(resolve => {entered = resolve;}); const originalInsert = fixture.evolu.insert;
  vi.spyOn(fixture.evolu, 'insert').mockImplementationOnce((table, args, options) => {
    originalInsert(table, args, {}); complete = options!.onComplete!; entered();
  });
  const pending = pushProfile(id, {contextNotes: 'retired snapshot'});
  await reached; await vi.advanceTimersByTimeAsync(30_000);
  expect(await pending).toMatchObject({ok: false, reason: 'timeout'});
  expect(getSyncStatus().push).toBe('error');
  complete(); await Promise.resolve();
  expect(getSyncStatus().push).toBe('error'); expect(fixture.itemRows).toEqual([]);
  expect(isSyncPushInFlight()).toBe(false);
});

it.each([false, true])('a superseded plan settles only its own pending status (newest plan delayed: %s)', async newestDelayed => {
  vi.useFakeTimers({toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']}); const fixture = makeEvolu(); const ids = ['push-plan-a', 'push-plan-b'];
  const delayedId = ids[newestDelayed ? 1 : 0]!;
  configureSyncDelta({getEvolu: () => fixture.evolu, getItemRowQuery: () => ITEM_ROW_QUERY});
  configureSyncPush({getEvolu: () => fixture.evolu, getProfileQuery: () => PROFILE_QUERY,
    isSyncEnabled: () => true, isPhase2CutoverEnabled: () => false, getProfiles: () => ids.map(id => ({id}))});
  let entered!: () => void, release!: () => void, completeA!: () => void;
  const reached = new Promise<void>(resolve => {entered = resolve;});
  const gate = new Promise<void>(resolve => {release = resolve;}); const actualBuild = payload.buildSyncPayload;
  vi.spyOn(payload, 'buildSyncPayload').mockImplementation(async (...args) => {
    if (args[0] === delayedId) {entered(); await gate;}
    return actualBuild(...args);
  });
  if (newestDelayed) {
    const insert = fixture.evolu.insert;
    vi.spyOn(fixture.evolu, 'insert').mockImplementation((table, args, options) => {
      if (table === 'profileData' && args.profileId === ids[0]) {insert(table, args, {}); completeA = options!.onComplete!;}
      else insert(table, args, options);
    });
  }
  const a = pushProfile(ids[0], {contextNotes: 'profile A'}, {force: true});
  if (newestDelayed) await vi.waitFor(() => expect(completeA).toBeTypeOf('function'));
  else await reached;
  const b = pushProfile(ids[1], {contextNotes: 'profile B'}, {force: true});
  try {
    if (newestDelayed) await reached;
    else expect(await b).toMatchObject({ok: true});
    const token = markSyncProfileDirty(delayedId); release();
    expect(await (newestDelayed ? b : a)).toMatchObject({ok: false, reason: 'superseded'});
    expect(getSyncDirtyToken(delayedId)).toBe(token);
    expect(isSyncPushInFlight()).toBe(newestDelayed);
    expect(getSyncStatus().push === 'pending').toBe(newestDelayed);
    if (newestDelayed) {completeA(); expect(await a).toMatchObject({ok: true});}
    expect(getSyncStatus().push).not.toBe('pending');
  } finally {release(); completeA?.(); await Promise.all([a,b]);}
});

it('a missing item-row acknowledgement keeps the push pending and preserves retry state after timeout', async()=>{
  vi.useFakeTimers(); const fixture=makeEvolu(),id='pending-item-ack';let complete:(()=>void)|undefined;
  configureSyncDelta({getEvolu:()=>fixture.evolu,getItemRowQuery:()=>ITEM_ROW_QUERY});
  configureSyncPush({getEvolu:()=>fixture.evolu,getProfileQuery:()=>PROFILE_QUERY,isSyncEnabled:()=>true,isPhase2CutoverEnabled:()=>false,getProfiles:()=>[{id}]});
  const original=fixture.evolu.insert;
  vi.spyOn(fixture.evolu,'insert').mockImplementation((table,args,options)=>{
    if(table==='itemRow'){original(table,args,{});complete=options!.onComplete!;}else original(table,args,options);
  });
  const token=markSyncProfileDirty(id),pending=pushProfile(id,{contextNotes:'queued synthetic value'});
  await vi.waitFor(()=>expect(complete).not.toBeUndefined());
  expect(isSyncPushInFlight()).toBe(true);expect(getSyncStatus().push).toBe('pending');expect(getSyncDirtyToken(id)).toBe(token);
  await vi.advanceTimersByTimeAsync(30_000);expect(await pending).toMatchObject({ok:false,reason:'timeout'});
  complete!();await Promise.resolve();expect(getSyncStatus().push).toBe('error');expect(getSyncDirtyToken(id)).toBe(token);
  expect(localStorage.getItem(`labcharts-${id}-delta-contextNotes`)).toBeNull();expect(isSyncPushInFlight()).toBe(false);
});

it.each(['pause', 'runtime replacement', 'identity change'])('a late item-row acknowledgement cannot confirm a retired push after %s',async retirement=>{
  vi.useFakeTimers(); const fixture=makeEvolu(),original=fixture.evolu.insert,id=`retired-${retirement.replaceAll(' ', '-')}`;
  const initial=Object.assign(fixture.evolu,{name:'initial-owner'});let current=initial,enabled=true,complete:(()=>void)|undefined;
  configureSyncDelta({getEvolu:()=>current,getItemRowQuery:()=>ITEM_ROW_QUERY});
  configureSyncPush({getEvolu:()=>current,getProfileQuery:()=>PROFILE_QUERY,isSyncEnabled:()=>enabled,isPhase2CutoverEnabled:()=>false,getProfiles:()=>[{id}]});
  vi.spyOn(initial,'insert').mockImplementation((table,args,options)=>{
    if(table==='itemRow'){original(table,args,{});complete=options!.onComplete!;}else original(table,args,options);
  });
  const token=markSyncProfileDirty(id),pending=pushProfile(id,{contextNotes:'synthetic old-owner value'});
  await vi.waitFor(()=>expect(complete).not.toBeUndefined());
  if(retirement==='pause')enabled=false;
  else if(retirement==='runtime replacement')current=Object.assign(makeEvolu().evolu,{name:'another-owner'});
  else initial.name='another-owner';
  complete!();expect(await pending).toMatchObject({ok:false,reason:'superseded'});
  expect(getSyncDirtyToken(id)).toBe(token);expect(getSyncStatus().push).not.toBe('confirmed');
  expect(localStorage.getItem(`labcharts-${id}-delta-contextNotes`)).toBeNull();expect(isSyncPushInFlight()).toBe(false);
});
