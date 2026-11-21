// @vitest-environment jsdom
import {IDBFactory} from 'fake-indexeddb';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {state} from '../js/state.js';
import {runPostProfileStartupMaintenance} from '../js/startup-maintenance.js';
import {createDefaultProfileData, migrateProfileData} from '../js/profile.js';
import {saveImportedData} from '../js/data.js';
import {encryptedGetItem, encryptedSetItem} from '../js/crypto.js';
import {logManualMetric, logManualBP, deleteManualMetric, deleteAllManualMetrics, parseManualMirrorEntry} from '../js/wearables-manual.js';
import {applyPulledManualBodyReadings, catchUpManualBodyReadings, refreshRestoredManualSummary} from '../js/wearables-manual-sync.js';
import * as manualStore from '../js/wearables-store.js';
import {getDaily, getMeta, clearSource, upsertDaily, deleteWearablesDB, configureWearablesStoreCrypto} from '../js/wearables-store.js';
import {mergeImportedData} from '../js/data-merge.js';
import {mergeMapRowsIntoImported} from '../js/sync-delta-map-merge.js';
import {_planKeyedMapDelta, DELTA_MAPS} from '../js/sync-delta.js';
import {buildClientExportObject} from '../js/export.js';
const profile = 'manual-sync-test', date = '2026-09-21', key = (metric: string) => `${metric}.${date}`;
beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory(); localStorage.clear();
  state.currentProfile = profile; state.importedData = createDefaultProfileData();
  state.profiles = [{id: profile, name: 'Synthetic manual profile'}];
  localStorage.setItem('labcharts-active-profile', profile);
  expect(await saveImportedData()).toBe(true);
});
afterEach(async () => {vi.restoreAllMocks(); await deleteWearablesDB(profile); localStorage.clear();});
it('recovers only proven, untouched legacy cuff observations after a previous migration', async () => {
  const {migrateBiometricsToManual}=await import('../js/wearables-manual.js');
  const days=['2026-09-10','2026-09-11','2026-09-12','2026-09-13'] as const;
  for(const day of days)await upsertDaily(profile,{source:'manual',date:day,bp_systolic:120,bp_diastolic:80,
    ...(day===days[2]?{_manualSyncAt:{bp_diastolic:10}}:{})});
  await manualStore.setMeta(profile,'biometrics-migrated-v1',{at:123});
  const biometrics={bp:[...days.map(day=>({date:day,systolic:day===days[3]?119:120,diastolic:80})),
    {date:days[1],systolic:120,diastolic:80}]};
  await migrateBiometricsToManual(profile,biometrics);
  expect((await getDaily(profile,'manual',days[0]))?.bpPaired).toBe(true);
  for(const day of days.slice(1))expect((await getDaily(profile,'manual',day))?.bpPaired).toBeUndefined();
  expect(await getMeta(profile,'biometrics-migrated-v1')).toEqual({at:123,bpPairEvidence:1});
});
it('syncs distinct same-day weight, BP and pulse fields with manual context through the actual row codec', async () => {
  await logManualMetric(profile, 'weight', {date, value: 80, tags: ['resting'], note: 'Synthetic note'});
  await logManualBP(profile, {date, systolic: 120, diastolic: 80, pulse: 60});
  const mirror = structuredClone(state.importedData.manualBodyReadings!);
  expect(Object.keys(mirror)).toEqual(expect.arrayContaining([key('weight'), key('bp_systolic'), key('bp_diastolic'), key('rhr')]));
  expect(DELTA_MAPS).toContain('manualBodyReadings');
  const plan = await _planKeyedMapDelta(profile, 'manualBodyReadings', mirror);
  const received: Record<string, unknown> = {};
  await mergeMapRowsIntoImported(received, 'manualBodyReadings', plan.ops.map(op => ({...op.args, itemId: op.args.itemId as string, payload: op.args.payload})));
  await clearSource(profile, 'manual');
  const draft: Parameters<typeof applyPulledManualBodyReadings>[1] = {...createDefaultProfileData(), manualBodyReadings: received.manualBodyReadings as typeof mirror};
  await applyPulledManualBodyReadings(profile, draft);
  expect(await getDaily(profile, 'manual', date)).toMatchObject({weight: 80, bp_systolic: 120, bp_diastolic: 80, rhr: 60, tags: ['resting'], note: 'Synthetic note'});
  expect(draft.wearableConnections?.manual).toBeTruthy();
});
it('backfills only existing manual rows, add-only, and never treats an empty device as a deletion', async () => {
  await upsertDaily(profile, {source: 'manual', date, weight: 80, rhr: 60});
  await upsertDaily(profile, {source: 'withings', date, weight: 99, vendorSecret: 'RAW_VENDOR_SENTINEL'});
  state.importedData.manualBodyReadings = {[key('weight')]: {value: 81, updatedAt: 100}};
  await saveImportedData(); await catchUpManualBodyReadings(profile);
  expect(state.importedData.manualBodyReadings![key('weight')]!.value).toBe(81);
  expect(state.importedData.manualBodyReadings![key('rhr')]!.value).toBe(60);
  expect(JSON.stringify(state.importedData.manualBodyReadings)).not.toContain('RAW_VENDOR_SENTINEL');
  expect(await getMeta(profile, 'manual-body-readings-backfilled-v1')).toBeTruthy();
  const mirror = structuredClone(state.importedData.manualBodyReadings);
  await clearSource(profile, 'manual'); await catchUpManualBodyReadings(profile);
  expect(state.importedData.manualBodyReadings).toEqual(mirror);
  expect(await getDaily(profile, 'manual', date)).toMatchObject({weight: 81, rhr: 60});
});
it('retains field deletions and explicit re-adds without resurrecting stale local history', async () => {
  await logManualMetric(profile, 'weight', {date, value: 80});
  await logManualMetric(profile, 'rhr', {date, value: 60});
  await deleteManualMetric(profile, 'rhr', date);
  expect(state.importedData.manualBodyReadings![key('rhr')]!.value).toBeNull();
  await upsertDaily(profile, {source: 'manual', date, weight: 80, rhr: 55});
  await catchUpManualBodyReadings(profile);
  expect((await getDaily(profile, 'manual', date))?.rhr).toBeUndefined();
  await logManualMetric(profile, 'rhr', {date, value: 62});
  expect(state.importedData.manualMetricTombstones![key('rhr')]).toBe(0);
  expect(state.importedData.manualBodyReadings![key('rhr')]!.value).toBe(62);
  await deleteAllManualMetrics(profile); await catchUpManualBodyReadings(profile);
  expect(await getDaily(profile, 'manual', date)).toBeNull();
  expect(Object.values(state.importedData.manualBodyReadings!).every(entry => entry.value === null)).toBe(true);
});
it('keeps newer field edits across blob and stale row overlays while allowing newer remote edits', async () => {
  const local = {...createDefaultProfileData(), manualBodyReadings: {[key('weight')]: {value: 80, updatedAt: 200}}};
  const old = {...createDefaultProfileData(), manualBodyReadings: {[key('weight')]: {value: 75, updatedAt: 100}, [key('rhr')]: {value: 60, updatedAt: 100}}};
  const merged = mergeImportedData(local, old);
  expect(merged.manualBodyReadings![key('weight')]!.value).toBe(80);
  expect(merged.manualBodyReadings![key('rhr')]!.value).toBe(60);
  const overlay = (updatedAt: number, value: number) => mergeMapRowsIntoImported(merged, 'manualBodyReadings', [{itemId: key('weight'), payload: JSON.stringify({k: key('weight'), v: {value, updatedAt}}), syncedAt: '2026-09-21T00:00:00Z'}]);
  await overlay(100, 75); expect(merged.manualBodyReadings![key('weight')]!.value).toBe(80);
  await overlay(300, 82); expect(merged.manualBodyReadings![key('weight')]!.value).toBe(82);
});
it('preserves opaque future row fields and refuses malformed or unrelated inbound values', async () => {
  await upsertDaily(profile, {source: 'manual', date, weight: 80, futureField: {keep: true}});
  const draft = {...createDefaultProfileData(), manualBodyReadings: {[key('rhr')]: {value: 60, updatedAt: 100}, [key('weight')]: {value: 'bad', updatedAt: 100}, [key('vendorRaw')]: {value: 1, updatedAt: 100}}};
  await applyPulledManualBodyReadings(profile, draft);
  expect(await getDaily(profile, 'manual', date)).toMatchObject({weight: 80, rhr: 60, futureField: {keep: true}});
  expect((await getDaily(profile, 'manual', date))?.vendorRaw).toBeUndefined();
  expect(parseManualMirrorEntry('weight.2026-02-30', {value: 80, updatedAt: 1})).toBeNull();
  expect(parseManualMirrorEntry(key('weight'), {value: Infinity, updatedAt: 1})).toBeNull();
  expect(parseManualMirrorEntry(key('weight'), {value: 80, updatedAt: -1})).toBeNull();
});
it('does not mark an empty or locked store as successfully backfilled', async () => {
  await catchUpManualBodyReadings(profile);
  expect(await getMeta(profile, 'manual-body-readings-backfilled-v1')).toBeNull();
  const previous = configureWearablesStoreCrypto({getEncryptionEnabled: () => true, encryptObject: async () => null});
  try {
    const draft = {...createDefaultProfileData(), manualBodyReadings: {[key('weight')]: {value: 80, updatedAt: 100}}};
    await expect(applyPulledManualBodyReadings(profile, draft)).rejects.toThrow(/unlock|encrypted/i);
    expect(await getDaily(profile, 'manual', date)).toBeNull();
  } finally {configureWearablesStoreCrypto(previous);}
});
it('includes the manual mirror in portable exports while excluding raw vendor history', async () => {
  await logManualMetric(profile, 'weight', {date, value: 80});
  await upsertDaily(profile, {source: 'withings', date, weight: 90, vendorSecret: 'RAW_VENDOR_SENTINEL'});
  const exported = await buildClientExportObject(profile);
  expect(exported.manualBodyReadings).toEqual(state.importedData.manualBodyReadings);
  expect(JSON.stringify(exported)).not.toContain('RAW_VENDOR_SENTINEL');
});

it('catches up a synced manual reading on ordinary page startup without a profile switch', async () => {
  state.importedData.manualBodyReadings = {[key('weight')]: {value: 80, updatedAt: 100}};
  await saveImportedData();
  runPostProfileStartupMaintenance();
  await vi.waitFor(async () => expect(await getDaily(profile, 'manual', date)).toMatchObject({weight: 80}));
  await vi.waitFor(() => expect(state.importedData.wearableSummary?.metrics?.weight?.latest).toBe(80));
  expect(state.currentProfile).toBe(profile);
  await saveImportedData();
});

it('retains all same-day mirror fields after concurrent manual submissions', async () => {
  await Promise.all([logManualMetric(profile, 'weight', {date, value: 80}), logManualBP(profile, {date, systolic: 120, diastolic: 80, pulse: 60})]);
  for (const [metric, value] of Object.entries({weight: 80, bp_systolic: 120, bp_diastolic: 80, rhr: 60})) {
    expect(state.importedData.manualBodyReadings![key(metric)]!.value).toBe(value);
  }
});
it('preserves future metadata during editing and erases it with explicit deletion', async () => {
  state.importedData.manualBodyReadings = {[key('weight')]: {value: 80, updatedAt: 1, futureMetadata: 'Private future annotation'}};
  await saveImportedData(); await logManualMetric(profile, 'weight', {date, value: 81});
  expect(state.importedData.manualBodyReadings![key('weight')]!.futureMetadata).toBe('Private future annotation');
  await deleteAllManualMetrics(profile);
  expect(state.importedData.manualBodyReadings![key('weight')]).toEqual({value: null, updatedAt: expect.any(Number)});
});
it('keeps shared legacy context when deleting one of several unbackfilled manual metrics', async () => {
  await upsertDaily(profile, {source: 'manual', date, weight: 80, rhr: 60, note: 'Shared legacy note'});
  await deleteManualMetric(profile, 'rhr', date); await catchUpManualBodyReadings(profile);
  expect(await getDaily(profile, 'manual', date)).toMatchObject({weight: 80, note: 'Shared legacy note'});
  expect(state.importedData.manualBodyReadings![key('note')]!.value).toBe('Shared legacy note');
  expect(state.importedData.manualBodyReadings![key('rhr')]!.value).toBeNull();
});

it('retains the write-site rejection of dangerous raw map keys', async () => {
  const imported = {manualBodyReadings: {}};
  for (const name of ['__proto__', 'constructor', 'prototype']) {
    await mergeMapRowsIntoImported(imported, 'manualBodyReadings', [{itemId: name, payload: JSON.stringify({k: name, v: {value: 80, updatedAt: 300}})}]);
    expect(Object.hasOwn(imported.manualBodyReadings, name)).toBe(false);
  }
  expect(Object.getPrototypeOf(imported.manualBodyReadings)).toBe(Object.prototype);
});

it.each(['edit', 'delete-all'])('keeps a concurrent %s that commits after the legacy scan starts', async operation => {
  await upsertDaily(profile, {source: 'manual', date, weight: 80});
  let scanned!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => {scanned = resolve;});
  const gate = new Promise<void>(resolve => {release = resolve;});
  const original = manualStore.getDailyRange;
  vi.spyOn(manualStore, 'getDailyRange').mockImplementationOnce(async (...args) => {
    const rows = await original(...args); scanned(); await gate; return rows;
  });
  const backfill = catchUpManualBodyReadings(profile);
  await ready;
  if (operation === 'edit') await logManualMetric(profile, 'weight', {date, value: 82});
  else await deleteAllManualMetrics(profile);
  release(); await backfill;
  const stored = JSON.parse((await encryptedGetItem(`labcharts-${profile}-imported`))!) as typeof state.importedData;
  if (operation === 'edit') {
    expect(stored.manualBodyReadings![key('weight')]).toMatchObject({value: 82, updatedAt: expect.any(Number)});
    expect(stored.manualBodyReadings![key('weight')]!.updatedAt).toBeGreaterThan(0);
    expect(await getDaily(profile, 'manual', date)).toMatchObject({weight: 82});
  } else {
    expect(stored.manualBodyReadings![key('weight')]).toBeUndefined();
    expect(stored.manualMetricTombstones!['weight.all']).toBeGreaterThan(0);
    expect(await getDaily(profile, 'manual', date)).toBeNull();
  }
});

it('does not backfill private context after deletion intent commits but before the raw row purge', async () => {
  await upsertDaily(profile, {source: 'manual', date, weight: 80, note: 'Private deleted context', tags: ['resting']});
  state.importedData.manualMetricTombstones = {'weight.all': Date.now()}; await saveImportedData();
  await catchUpManualBodyReadings(profile);
  expect(state.importedData.manualBodyReadings?.[key('weight')]).toBeUndefined();
  expect(state.importedData.manualBodyReadings?.[key('note')]).toBeUndefined();
  expect(state.importedData.manualBodyReadings?.[key('tags')]).toBeUndefined();
});


it('keeps an unrelated profile byte-equivalent through normalization, persistence and empty manual catch-up', async () => {
  expect(Object.hasOwn(state.importedData, 'manualBodyReadings')).toBe(false);
  const before = JSON.stringify(state.importedData), stored = await encryptedGetItem(`labcharts-${profile}-imported`);
  expect(migrateProfileData(state.importedData)).toBe(state.importedData);
  expect(JSON.stringify(state.importedData)).toBe(before);
  await catchUpManualBodyReadings(profile);
  expect(JSON.stringify(state.importedData)).toBe(before);
  expect(await encryptedGetItem(`labcharts-${profile}-imported`)).toBe(stored);
  expect(await getMeta(profile, 'manual-body-readings-backfilled-v1')).toBeFalsy();
});
it.each([null, [], 'malformed'])('normalizes an explicitly malformed manual mirror without adding one to absent profiles: %j', value => {
  const candidate = {...createDefaultProfileData(), manualBodyReadings: value} as unknown as Parameters<typeof migrateProfileData>[0];
  expect(migrateProfileData(candidate).manualBodyReadings).toEqual({});
  const mirror = {[key('weight')]: {value: null, updatedAt: 10}};
  expect(migrateProfileData({...createDefaultProfileData(), manualBodyReadings: mirror}).manualBodyReadings).toBe(mirror);
});
it('still refreshes the existing manual summary when optional mirror catch-up rejects', async () => {
  await logManualMetric(profile, 'weight', {date, value: 80});
  const manual = await import('../js/wearables-manual-sync.js'), summary = await import('../js/wearables-summary.js');
  const backfill = vi.spyOn(manual, 'catchUpManualBodyReadings').mockRejectedValue(new Error('Synthetic unavailable mirror'));
  const refresh = vi.spyOn(summary, 'syncWearableSummary');
  runPostProfileStartupMaintenance();
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledWith(profile, expect.objectContaining({manual: expect.any(Object)})));
  expect(backfill).toHaveBeenCalledWith(profile);
  await refresh.mock.results[0]!.value;
  expect(await getDaily(profile, 'manual', date)).toMatchObject({weight: 80});
});


it.each(['surviving-row', 'removed-row', 'delete-all'])('does not let a stale Sync draft restore deletion intent after %s', async variant => {
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  await logManualMetric(profile, 'weight', {date, value: 80, note: 'Synthetic private context'});
  if (variant === 'surviving-row') await logManualMetric(profile, 'rhr', {date, value: 60});
  const draft = structuredClone(state.importedData);
  if (variant === 'delete-all') await deleteAllManualMetrics(profile);
  else await deleteManualMetric(profile, 'weight', date);
  const before = await encryptedGetItem(`labcharts-${profile}-imported`);
  await applyPulledManualBodyReadings(profile, draft);
  const row = await getDaily(profile, 'manual', date);
  if (variant === 'surviving-row') {
    expect(row?.weight).toBeUndefined(); expect(row?.rhr).toBe(60);
  } else expect(row).toBeNull();
  expect(await encryptedGetItem(`labcharts-${profile}-imported`)).toBe(before);
});

it('imports the actual manual-only share payload without a nutrition archive', async () => {
  await logManualMetric(profile, 'weight', {date, value: 80});
  const payload = await buildClientExportObject(profile, false, false);
  expect(payload.entries).toEqual([]); expect(payload.notes).toEqual([]); expect(payload.chat).toBeUndefined(); expect(payload.nutrition).toBeUndefined();
  const {importDataJSON} = await import('../js/export-import.js');
  await importDataJSON(new File([JSON.stringify(payload)], 'manual-only-share.json'));
  const restored = state.currentProfile;
  try {
    expect(restored).not.toBe(profile);
    const saved = JSON.parse((await encryptedGetItem(`labcharts-${restored}-imported`))!);
    expect(saved).not.toBeNull();
    expect(saved.manualBodyReadings).toEqual(payload.manualBodyReadings);
  } finally { if (restored !== profile) await deleteWearablesDB(restored); }
});

it('projects only portable manual fields in shares and discards unknown fields from incoming shares', async () => {
  const mixed = {
    [key('weight')]: {value:80,updatedAt:123,futureMetadata:'Synthetic local annotation'},
    [key('vendorRaw')]: {value:42,updatedAt:123},
    'weight.2026-02-30': {value:80,updatedAt:123},
  };
  state.importedData.manualBodyReadings=mixed;await saveImportedData();
  const exported=await buildClientExportObject(profile,false,false);
  const expected={[key('weight')]:{value:80,updatedAt:123}};
  expect(exported.manualBodyReadings).toEqual(expected);
  const {importDataJSON}=await import('../js/export-import.js');
  await importDataJSON(new File([JSON.stringify({...exported,manualBodyReadings:mixed})],'mixed-manual.json'));
  const restored=state.currentProfile;
  try {
    expect(restored).not.toBe(profile);
    expect(JSON.parse((await encryptedGetItem(`labcharts-${restored}-imported`))!).manualBodyReadings).toEqual(expected);
    expect(await getDaily(restored,'manual',date)).toMatchObject({weight:80});
  }finally{if(restored!==profile)await deleteWearablesDB(restored);}
});
it('materializes post-save restored manual history even after the initial profile refresh finished empty', async () => {
  await logManualMetric(profile, 'weight', {date, value: 80});
  const exported = await buildClientExportObject(profile, false, false);
  const payload = {...exported, notes: [{date, text: 'Synthetic restore receipt'}]};
  const profiles = await import('../js/profile.js'), runtime = await import('../js/profile-runtime.js');
  const load = profiles.loadProfile;
  vi.spyOn(profiles, 'loadProfile').mockImplementation(async (...args) => {
    await load(...args);
    // Complete the real pre-import refresh before the importer copies its mirror.
    await runtime.refreshProfileWearables(state.currentProfile, state.importedData.biometrics);
    expect(await getDaily(state.currentProfile, 'manual', date)).toBeNull();
  });
  const {importDataJSON} = await import('../js/export-import.js');
  await importDataJSON(new File([JSON.stringify(payload)], 'manual-restore.json'));
  const restored = state.currentProfile;
  try {
    expect(restored).not.toBe(profile);
    expect(profiles.loadProfile).toHaveBeenCalledOnce();
    expect(JSON.parse((await encryptedGetItem(`labcharts-${restored}-imported`))!).manualBodyReadings).toEqual(exported.manualBodyReadings);
    expect(await getDaily(restored, 'manual', date)).toMatchObject({weight: 80});
    expect(state.importedData.wearableSummary?.metrics?.weight?.latest).toBe(80);
  } finally { if (restored !== profile) await deleteWearablesDB(restored); }
});


it('honors a peer deletion already persisted while this tab still has its older live snapshot', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1000);
  await logManualMetric(profile, 'weight', {date, value: 80});
  await logManualMetric(profile, 'rhr', {date, value: 60});
  const draft = structuredClone(state.importedData), peer = structuredClone(state.importedData);
  peer.manualBodyReadings![key('weight')] = {value: null, updatedAt: 2000};
  peer.manualMetricTombstones = {[key('weight')]: 2000};
  const committed = JSON.stringify(peer); await encryptedSetItem(`labcharts-${profile}-imported`, committed);
  expect(state.importedData.manualBodyReadings![key('weight')]!.value).toBe(80);
  await applyPulledManualBodyReadings(profile, draft);
  expect(await getDaily(profile, 'manual', date)).toMatchObject({rhr: 60});
  expect((await getDaily(profile, 'manual', date))?.weight).toBeUndefined();
  expect(await encryptedGetItem(`labcharts-${profile}-imported`)).toBe(committed);
});
it('allows an explicitly newer remote re-add after an older canonical deletion', async () => {
  state.importedData.manualBodyReadings = {[key('weight')]: {value: null, updatedAt: 1000}};
  state.importedData.manualMetricTombstones = {[key('weight')]: 1000}; await saveImportedData();
  const draft = {...createDefaultProfileData(), manualBodyReadings: {[key('weight')]: {value: 82, updatedAt: 2000}}, manualMetricTombstones: {[key('weight')]: 0}};
  await applyPulledManualBodyReadings(profile, draft);
  expect(await getDaily(profile, 'manual', date)).toMatchObject({weight: 82, _manualSyncAt: {weight: 2000}});
});
it('keeps a newer row edit whose profile metadata has not caught up with an older deletion', async () => {
  state.importedData.manualBodyReadings = {[key('weight')]: {value: null, updatedAt: 1000}};
  state.importedData.manualMetricTombstones = {[key('weight')]: 1000}; await saveImportedData();
  await upsertDaily(profile, {source: 'manual', date, weight: 82, _manualSyncAt: {weight: 2000}});
  await applyPulledManualBodyReadings(profile, {...createDefaultProfileData(), manualBodyReadings: {[key('weight')]: {value: 80, updatedAt: 500}}});
  expect(await getDaily(profile, 'manual', date)).toMatchObject({weight: 82, _manualSyncAt: {weight: 2000}});
});
it.each(['unknown-field', 'invalid-date', 'invalid-clock', 'context-only'])('does not broaden manual-only exports to %s payloads', async kind => {
  const field = kind === 'unknown-field' ? 'vendorRaw' : kind === 'context-only' ? 'note' : 'weight';
  const day = kind === 'invalid-date' ? '2026-02-30' : date;
  state.importedData.manualBodyReadings = {[`${field}.${day}`]: {value: field === 'weight' ? 80 : 'Synthetic unrelated context', updatedAt: kind === 'invalid-clock' ? -1 : 1000}};
  await saveImportedData();
  await expect(buildClientExportObject(profile, false, false)).rejects.toThrow('No data to export');
  const before = await encryptedGetItem(`labcharts-${profile}-imported`);
  const {importDataJSON} = await import('../js/export-import.js');
  await importDataJSON(new File([JSON.stringify({entries: [], manualBodyReadings: state.importedData.manualBodyReadings})], 'invalid-manual.json'));
  expect(await encryptedGetItem(`labcharts-${profile}-imported`)).toBe(before);
  expect(await getDaily(profile, 'manual', date)).toBeNull();
});


it('keeps exported non-manual source summaries and source preference while materializing a restored manual row', async () => {
  await logManualMetric(profile, 'weight', {date, value: 80});
  await upsertDaily(profile, {source: 'withings', date, weight: 90, hrv_rmssd: 45});
  state.importedData.wearablePrimaryOverride = {weight: 'withings'};
  const {syncWearableSummary} = await import('../js/wearables-summary.js');
  await syncWearableSummary(profile, {manual: {}, withings: {}}, {force: true}); await saveImportedData();
  const payload = await buildClientExportObject(profile, false, false);
  const expected = structuredClone(state.importedData.wearableSummary!);
  expect(expected.metrics.weight!.primarySource).toBe('withings'); expect(expected.metrics.hrv_rmssd!.latest).toBe(45);
  const {importDataJSON} = await import('../js/export-import.js');
  await importDataJSON(new File([JSON.stringify(payload)], 'mixed-summary-share.json'));
  const restored = state.currentProfile;
  try {
    expect(restored).not.toBe(profile); expect(await getDaily(restored, 'manual', date)).toMatchObject({weight: 80});
    expect(state.importedData.wearableSummary!.sources.withings).toEqual(expected.sources.withings);
    expect(state.importedData.wearableSummary!.metrics.hrv_rmssd).toEqual(expected.metrics.hrv_rmssd);
    expect(state.importedData.wearableSummary!.metrics.weight).toEqual(expected.metrics.weight);
    expect(state.importedData.wearablePrimaryOverride?.weight).toBe('withings');
  } finally {if (restored !== profile) await deleteWearablesDB(restored);}
});


it('leaves a newer canonical peer edit intact when a restored summary snapshot retires during its row read', async () => {
  await logManualMetric(profile, 'weight', {date, value: 80});
  const read = manualStore.getDailyRange;
  vi.spyOn(manualStore, 'getDailyRange').mockImplementationOnce(async (...args) => {
    const rows = await read(...args), current = JSON.parse((await encryptedGetItem(`labcharts-${profile}-imported`))!);
    current.contextNotes = 'Synthetic newer peer context'; await encryptedSetItem(`labcharts-${profile}-imported`, JSON.stringify(current));
    return rows;
  });
  expect(await refreshRestoredManualSummary(profile)).toBe(false);
  expect(JSON.parse((await encryptedGetItem(`labcharts-${profile}-imported`))!).contextNotes).toBe('Synthetic newer peer context');
});


it('does not let a profile refresh started before restore overwrite its newly imported source projections', async () => {
  await logManualMetric(profile, 'weight', {date, value: 80});
  await upsertDaily(profile, {source: 'withings', date, weight: 90, hrv_rmssd: 45});
  state.importedData.wearablePrimaryOverride = {weight: 'withings'};
  const summary = await import('../js/wearables-summary.js');
  await summary.syncWearableSummary(profile, {manual: {}, withings: {}}, {force: true}); await saveImportedData();
  const exported = await buildClientExportObject(profile, false, false), payload: Partial<typeof exported> = {...exported}; delete payload.profile;
  const expected = structuredClone(state.importedData.wearableSummary!);
  await clearSource(profile, 'manual'); await clearSource(profile, 'withings'); state.importedData = createDefaultProfileData(); await saveImportedData();
  const runtime = await import('../js/profile-runtime.js'), connect = await import('../js/wearables-connect.js'), profiles = await import('../js/profile.js');
  let earlier!: Promise<void>;
  const previousProfile = profiles.configureProfileRuntimeDeps({refreshProfileWearables: (...args: Parameters<typeof runtime.refreshProfileWearables>) => {earlier = runtime.refreshProfileWearables(...args); return earlier;}});
  const previous = runtime.configureProfileRefreshDeps({syncWearableSummary: summary.syncWearableSummary});
  const saves: Promise<unknown>[] = [], previousSummary = summary.configureWearableSummary({saveImportedData: () => {const saved = saveImportedData(); saves.push(saved); return saved;}});
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>(resolve => {entered = resolve;}), gate = new Promise<void>(resolve => {release = resolve;});
  const recover = connect.recoverPendingWearableDisconnect;
  const lookup = vi.spyOn(connect, 'recoverPendingWearableDisconnect').mockImplementationOnce(async (...args) => {const result = await recover(...args); entered(); await gate; return result;});
  await profiles.loadProfile(profile);
  let safety: ReturnType<typeof setTimeout> | undefined;
  try {
    await started;
    safety = setTimeout(release, 100);
    const {importDataJSON} = await import('../js/export-import.js'); await importDataJSON(new File([JSON.stringify(payload)], 'manual-merge-restore.json'));
    expect(state.importedData.wearableSummary!.sources.withings).toEqual(expected.sources.withings);
    release(); await earlier; await Promise.all(saves);
    expect(state.importedData.wearableSummary!.sources.withings).toEqual(expected.sources.withings);
    expect(state.importedData.wearableSummary!.metrics.hrv_rmssd).toEqual(expected.metrics.hrv_rmssd);
    expect(state.importedData.wearableSummary!.metrics.weight).toEqual(expected.metrics.weight);
  } finally {if (safety) clearTimeout(safety);release(); await earlier; await Promise.allSettled(saves);lookup.mockRestore();runtime.configureProfileRefreshDeps(previous);profiles.configureProfileRuntimeDeps(previousProfile);summary.configureWearableSummary(previousSummary);}
});
