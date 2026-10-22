// @vitest-environment jsdom
import {IDBFactory} from 'fake-indexeddb';
import {afterEach, beforeEach, expect, it} from 'vitest';
import {state} from '../js/state.js';
import {createDefaultProfileData} from '../js/profile.js';
import {saveImportedData} from '../js/data.js';
import {bodyMeasurementRecords, measurementPatch, waistToHeightRatio, bodyMeasurementHeightCm, type BodyMeasurementDraft} from '../js/body-measurement-model.js';
import {logBodyMeasurement, logManualMetric, deleteManualMetric, deleteBodyMeasurement, deleteAllManualMetrics, parseManualMirrorEntry} from '../js/wearables-manual.js';
import {getDaily, clearSource, deleteWearablesDB} from '../js/wearables-store.js';
import {applyPulledManualBodyReadings} from '../js/wearables-manual-sync.js';
import {buildClientExportObject} from '../js/export.js';
import {mergeImportedData} from '../js/data-merge.js';
import {createDashboardWidgetRenderers} from '../js/dashboard-widget-renderers.js';

const profile = 'body-measurement-test', date = '2026-09-21';
const originalUnit = state.unitSystem;
const draft = (changes: Partial<BodyMeasurementDraft> = {}): BodyMeasurementDraft =>
  ({kind: 'waist', date, value: 86, hip: 100, position: 'standing', site: 'midpoint', unit: 'cm', ...changes});
beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory(); localStorage.clear();
  state.currentProfile = profile; state.importedData = createDefaultProfileData();
  state.profiles = [{id: profile, name: 'Synthetic waist profile'}];
  localStorage.setItem('labcharts-active-profile', profile);
  expect(await saveImportedData()).toBe(true);
});
afterEach(async () => {await deleteWearablesDB(profile); localStorage.clear(); state.unitSystem = originalUnit;});

it('converts inches and rejects malformed dates, methods, and non-finite measurements', () => {
  expect(measurementPatch(draft({value: 34, hip: 40, unit: 'in'}))).toEqual({waist_standing_midpoint: 86.36, hip_standing_midpoint: 101.6});
  for (const changes of [{date: '2026-02-30'}, {value: NaN}, {hip: Infinity}, {value: -2}, {unit: 'kg'}, {position: 'other'}]) {
    expect(() => measurementPatch(draft(changes as Partial<BodyMeasurementDraft>))).toThrow();
  }
});
it('keeps same-day positions and tape locations separate, including paired hip measurements', async () => {
  await logBodyMeasurement(profile, draft());
  await logBodyMeasurement(profile, draft({position: 'supine', value: 82, hip: 96}));
  await logBodyMeasurement(profile, draft({site: 'navel', value: 90, hip: null}));
  const rows = bodyMeasurementRecords(state.importedData, 'waist');
  expect(rows).toHaveLength(3);
  expect(rows.find(row => row.field === 'waist_standing_midpoint')).toMatchObject({valueCm: 86, hipCm: 100});
  expect(rows.find(row => row.field === 'waist_supine_midpoint')).toMatchObject({valueCm: 82, hipCm: 96});
  expect(rows.find(row => row.field === 'waist_standing_navel')?.hipCm).toBeNull();
  expect(await getDaily(profile, 'manual', date)).toMatchObject({waist_standing_midpoint: 86, waist_supine_midpoint: 82});
});
it('replacing a reading without hips clears the old ratio and preserves unrelated same-day weight', async () => {
  await logManualMetric(profile, 'weight', {date, value: 78});
  await logBodyMeasurement(profile, draft());
  await logBodyMeasurement(profile, draft({value: 85, hip: null}));
  expect(bodyMeasurementRecords(state.importedData, 'waist')[0]).toMatchObject({valueCm: 85, hipCm: null});
  expect(await getDaily(profile, 'manual', date)).toMatchObject({weight: 78, waist_standing_midpoint: 85});
});
it('exports, merges and restores method-specific readings through the existing portable mirror', async () => {
  await logBodyMeasurement(profile, draft({position: 'seated'}));
  const exported = await buildClientExportObject(profile);
  const incoming = createDefaultProfileData();
  const mirror = exported.manualBodyReadings;
  expect(mirror).toEqual(state.importedData.manualBodyReadings);
  if (!mirror || typeof mirror !== 'object' || Array.isArray(mirror)) throw new Error('Missing portable mirror');
  incoming.manualBodyReadings = {};
  for (const [key, raw] of Object.entries(mirror)) {
    const entry = parseManualMirrorEntry(key, raw);
    if (!entry) throw new Error('Invalid exported measurement');
    incoming.manualBodyReadings[key] = {value: entry.value, updatedAt: entry.updatedAt};
  }
  const received = mergeImportedData(createDefaultProfileData(), incoming);
  await clearSource(profile, 'manual');
  await applyPulledManualBodyReadings(profile, received);
  expect(await getDaily(profile, 'manual', date)).toMatchObject({waist_seated_midpoint: 86, hip_seated_midpoint: 100});
  expect(bodyMeasurementRecords(received, 'waist')[0]).toMatchObject({position: 'seated', valueCm: 86, hipCm: 100});
  expect(parseManualMirrorEntry(`waist_seated_midpoint.${date}`, received.manualBodyReadings?.[`waist_seated_midpoint.${date}`])).not.toBeNull();
});
it('deletes a waist/hip pair without deleting a different method or reviving it on catch-up', async () => {
  await logBodyMeasurement(profile, draft());
  await logBodyMeasurement(profile, draft({position: 'seated'}));
  await deleteBodyMeasurement(profile, 'waist_standing_midpoint', date);
  expect(state.importedData.manualBodyReadings?.[`waist_standing_midpoint.${date}`]?.value).toBeNull();
  expect(state.importedData.manualBodyReadings?.[`hip_standing_midpoint.${date}`]?.value).toBeNull();
  await applyPulledManualBodyReadings(profile, state.importedData);
  expect(bodyMeasurementRecords(state.importedData, 'waist').map(row => row.position)).toEqual(['seated']);
  await deleteAllManualMetrics(profile);
  expect(bodyMeasurementRecords(state.importedData, 'waist')).toEqual([]);
});
it('keeps abdominal depth separate from waist circumference', async () => {
  await logBodyMeasurement(profile, draft());
  await logBodyMeasurement(profile, draft({kind: 'abdominal_depth', value: 21, hip: null, position: 'supine', site: 'iliac'}));
  expect(bodyMeasurementRecords(state.importedData, 'waist')).toHaveLength(1);
  expect(bodyMeasurementRecords(state.importedData, 'abdominal_depth')[0]).toMatchObject({valueCm: 21, hipCm: null, position: 'supine', site: 'iliac'});
});
it('moves a corrected date without duplicates or revival while retaining unrelated old-date readings and context', async () => {
  await logManualMetric(profile, 'weight', {date, value: 78, note: 'Morning', tags: ['morning-fasted']});
  await logBodyMeasurement(profile, draft());
  const original = {field: 'waist_standing_midpoint', date};
  await logBodyMeasurement(profile, draft({date: '2026-09-20', original}));
  expect(bodyMeasurementRecords(state.importedData, 'waist').map(row => row.date)).toEqual(['2026-09-20']);
  expect(state.importedData.manualBodyReadings?.[`hip_standing_midpoint.${date}`]?.value).toBeNull();
  expect(state.importedData.manualBodyReadings?.[`note.${date}`]?.value).toBe('Morning');
  expect(await getDaily(profile, 'manual', date)).toMatchObject({weight: 78, note: 'Morning'});
  await applyPulledManualBodyReadings(profile, state.importedData);
  expect((await getDaily(profile, 'manual', date))?.waist_standing_midpoint).toBeUndefined();
  expect(await getDaily(profile, 'manual', '2026-09-20')).toMatchObject({waist_standing_midpoint: 86, hip_standing_midpoint: 100});
});
it('moves the method on the same date and clears date context only when the final reading is deleted', async () => {
  await logManualMetric(profile, 'weight', {date, value: 78, note: 'Morning', tags: ['resting']});
  await logBodyMeasurement(profile, draft());
  await deleteManualMetric(profile, 'weight', date);
  await logBodyMeasurement(profile, draft({position: 'seated', original: {field: 'waist_standing_midpoint', date}}));
  expect(bodyMeasurementRecords(state.importedData, 'waist').map(row => row.field)).toEqual(['waist_seated_midpoint']);
  expect(state.importedData.manualBodyReadings?.[`note.${date}`]?.value).toBe('Morning');
  await deleteBodyMeasurement(profile, 'waist_seated_midpoint', date);
  for (const field of ['note', 'tags', 'waist_seated_midpoint', 'hip_seated_midpoint']) expect(state.importedData.manualBodyReadings?.[`${field}.${date}`]?.value).toBeNull();
  expect(await getDaily(profile, 'manual', date)).toBeNull();
  await applyPulledManualBodyReadings(profile, state.importedData);
  await logBodyMeasurement(profile, draft());
  expect((await getDaily(profile, 'manual', date))?.note).toBeUndefined();
  expect((await buildClientExportObject(profile)).manualBodyReadings).toEqual(state.importedData.manualBodyReadings);
});
it('clears orphaned old-date context when moving a final reading and rejects occupied destinations without deleting either pair', async () => {
  await logManualMetric(profile, 'weight', {date, value: 78, note: 'Private context', tags: ['resting']});
  await logBodyMeasurement(profile, draft());
  await deleteManualMetric(profile, 'weight', date);
  await logBodyMeasurement(profile, draft({date: '2026-09-20', original: {field: 'waist_standing_midpoint', date}}));
  expect(state.importedData.manualBodyReadings?.[`note.${date}`]?.value).toBeNull();
  expect(state.importedData.manualBodyReadings?.[`tags.${date}`]?.value).toBeNull();
  expect(await getDaily(profile, 'manual', date)).toBeNull();
  await logBodyMeasurement(profile, draft({position: 'seated'}));
  const before = structuredClone(state.importedData.manualBodyReadings);
  await expect(logBodyMeasurement(profile, draft({position: 'seated', original: {field: 'waist_standing_midpoint', date: '2026-09-20'}}))).rejects.toThrow('already exists');
  expect(state.importedData.manualBodyReadings).toEqual(before);
  expect(bodyMeasurementRecords(state.importedData, 'waist')).toHaveLength(2);
});
it('projects the actual Waist tile directly from the portable measurements with its method and date', async () => {
  await logBodyMeasurement(profile, draft({position: 'supine'}));
  state.unitSystem = 'US';
  const owner = createDashboardWidgetRenderers({});
  expect(owner.getDashboardBiometricTile('waist', {allowEmptyManual: true})).toMatchObject({label: 'Waist', value: '33.9', unit: 'in', change: 'Lying down · 21 Sept', empty: false});
});
it('offers Waist beside Weight by default and keeps SAD available through Add metrics', () => {
  const owner = createDashboardWidgetRenderers({getMobileWearableTiles: () => [], getMobileWearablePriority: () => []});
  expect(owner.getDashboardBiometricSelection()).toEqual(['weight', 'waist', 'bp_systolic', 'rhr']);
  expect(owner.getDashboardBiometricTile('abdominal_depth', {allowEmptyManual: true})).toMatchObject({id: 'abdominal_depth', label: 'Abdominal depth', empty: true});
});
it('calculates waist-to-height from canonical centimetres and rejects missing or invalid height', () => {
  expect(waistToHeightRatio(85, 170)).toBe(0.5);
  expect(waistToHeightRatio(86.36, '172.72')).toBe(0.5); // 34 inches / 68 inches.
  for (const height of [null, undefined, '', ' ', 'invalid', false, {}, 0, -175, NaN, Infinity, 500]) {
    expect(bodyMeasurementHeightCm(height)).toBeNull();
    expect(waistToHeightRatio(85, height)).toBeNull();
  }
  for (const waist of [0, -85, NaN, Infinity, 500]) expect(waistToHeightRatio(waist, 170)).toBeNull();
});
it('shows waist-to-height on the Waist card using only the active profile height, independent of display units', async () => {
  await logBodyMeasurement(profile, draft({value: 85}));
  state.profiles = [{id:profile,name:'Active',height:170,heightUnit:'in'}, {id:'other',name:'Other',height:200,heightUnit:'cm'}];
  const before = structuredClone(state.importedData.manualBodyReadings);
  const owner = createDashboardWidgetRenderers({});
  for (const unit of ['EU','US']) {
    state.unitSystem = unit;
    expect(owner.getDashboardBiometricTile('waist', {allowEmptyManual:true})?.change).toContain('Waist/height 0.50');
  }
  state.profiles[0].height = 180;
  expect(owner.getDashboardBiometricTile('waist', {allowEmptyManual:true})?.change).toContain('Waist/height 0.47');
  expect(state.importedData.manualBodyReadings).toEqual(before);
  state.profiles[0].height = null;
  expect(owner.getDashboardBiometricTile('waist', {allowEmptyManual:true})?.change).not.toContain('Waist/height');
  await logBodyMeasurement(profile, draft({kind:'abdominal_depth',value:21,position:'supine',site:'iliac'}));
  state.profiles[0].height = 170;
  expect(owner.getDashboardBiometricTile('abdominal_depth', {allowEmptyManual:true})?.change).not.toContain('Waist/height');
});
