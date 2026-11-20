import {expect, it} from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import {materializeWearableNativeFixture} from '../scripts/wearable-native-fixture.mjs';
import {qualifyWearableManualProfile, qualifyWearableManualDevice, wearableManualMirror} from './helpers/wearable-manual-sync-expectations.js';

interface DailyReading extends Record<string, unknown> { date: string }
interface MetricSummary extends Record<string, unknown> { latestDate: string }
interface Summary extends Record<string, unknown> { metrics: Record<string, MetricSummary> }

// The frozen August 7 journey has two or three recent samples for each metric.
// Derive the expected statistics from authenticated source rows independently
// of the table used by the native-chart comparison.
function projectedMetric(id: string, original: MetricSummary, daily: DailyReading[]) {
  const recent = daily.filter(row => row.date >= '2026-05-10' && typeof row[id] === 'number');
  const values = recent.map(row => row[id] as number);
  expect([2, 3]).toContain(values.length);
  expect(recent.map(row => row.date)).toEqual(['2026-07-31', '2026-08-05', '2026-08-06'].slice(0, values.length));

  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const round = (value: number) => Math.round(value * 100) / 100;
  const sorted = values.toSorted((a, b) => a - b);
  const quantile = (fraction: number) => {
    const index = fraction * (sorted.length - 1), lower = Math.floor(index);
    return round(sorted[lower]! + (sorted[Math.ceil(index)]! - sorted[lower]!) * (index - lower));
  };
  const july = values[0]!, august = values.slice(1), median = quantile(.5);
  const days = recent.map(row => (Date.parse(row.date) - Date.parse('2026-07-31')) / 86400000);
  const meanDay = mean(days), meanValue = mean(values);
  const slope = days.reduce((sum, day, i) => sum + (day - meanDay) * (values[i]! - meanValue), 0) /
    days.reduce((sum, day) => sum + (day - meanDay) ** 2, 0);
  let trend = 'insufficient';
  if (values.length >= 3) {
    trend = Math.abs(slope / median) <= .002 ? 'flat' : slope < 0 ? 'declining' : 'rising';
  }
  const isBP = id === 'bp_systolic' || id === 'bp_diastolic';
  const preserved = Object.fromEntries(Object.entries(original).flatMap(([key, value]) =>
    key === 'latestDate' && isBP ? [[key, value], ['latestBpPaired', true]] : [[key, value]]));
  return {
    ...preserved, baseline: median, baselineP25: quantile(.25), baselineP75: quantile(.75),
    rolling: {d7: round(mean(august)), d30: round(meanValue), d90: round(meanValue)},
    trend30d: trend, weekly: [july, round(mean(august))],
  };
}

function projectedProfile(data: Record<string, unknown>, state: string, daily: DailyReading[]) {
  const summary = data.wearableSummary as Summary;
  const metrics = Object.fromEntries(Object.entries(summary.metrics).map(([id, metric]) => [id, projectedMetric(id, metric, daily)]));
  return Object.fromEntries(Object.entries(data).flatMap(([key, value]) => key === 'wearableSummary' ?
    [['manualBodyReadings', wearableManualMirror(state)], [key, {...summary, metrics}]] : [[key, value]]));
}

it('checks each authenticated whole-profile receipt with calendar windows, cuff evidence and exact serialization order', async () => {
  const fixture = await materializeWearableNativeFixture();
  try {
    const manifest = JSON.parse(await fs.readFile(fixture.manifestFile, 'utf8')) as {cases: Array<{capture: {file: string}}>};
    for (const entry of manifest.cases) {
      const capture = JSON.parse(await fs.readFile(path.join(fixture.directory, entry.capture.file), 'utf8')) as {
        oracle: {profileStates: Record<string, {live: Record<string, unknown>; stored: Record<string, unknown>; rawCommitted: string}>; dailyStates: Record<string,{values:DailyReading[]}>};
      };
      for (const [state, original] of Object.entries(capture.oracle.profileStates)) {
        const before = JSON.stringify(original), expected = qualifyWearableManualProfile(original, state);
        expect(JSON.stringify(original)).toBe(before);
        const readings=capture.oracle.dailyStates[state]!.values;
        for (const key of ['live', 'stored'] as const) {
          expect(expected[key]).toEqual(projectedProfile(original[key],state,readings));
        }
        expect(expected.rawCommitted).toBe(JSON.stringify(projectedProfile(original.stored,state,readings)));
        const corrupted = structuredClone(expected);
        corrupted.stored.contextNotes = 'lost unrelated data';
        expect(corrupted).not.toEqual(expected);
        (corrupted.stored.manualBodyReadings as Record<string, unknown>)['weight.2025-01-10'] = {value: 740, updatedAt: 0};
        expect(corrupted.stored.manualBodyReadings).not.toEqual(expected.stored.manualBodyReadings);
      }
    }
  } finally {await fixture.cleanup();}
});
it('requires known states and exact original serialization instead of accepting already changed historical inputs', () => {
  const wearableSummary={metrics:Object.fromEntries(['weight','bp_systolic','bp_diastolic','rhr'].map(id=>
    [id,{primarySource:'manual',latestDate:'2026-08-05'}]))};
  const original={live:{wearableSummary},stored:{wearableSummary},rawCommitted:JSON.stringify({wearableSummary})};
  expect(() => qualifyWearableManualProfile(original, 'unknown')).toThrow('Known original');
  expect(() => qualifyWearableManualProfile({...original, rawCommitted: '{}'}, 'migrated-baseline')).toThrow('Exact original');
  expect(() => qualifyWearableManualProfile({...original, live: {...original.live, manualBodyReadings: {}}}, 'migrated-baseline')).toThrow('predates manual Sync');
});
it('expects exactly the new backfill metadata and phase-specific clocks without mutating original device records', () => {
  const weight={source:'manual',date:'2025-01-10',weight:74};
  const cuff={source:'manual',date:'2026-08-05',bp_systolic:120,bp_diastolic:78};
  const daily={name:'daily-metrics',keys:[['manual',weight.date],['manual',cuff.date]],values:[weight,cuff]};
  const meta = {name: 'meta', keys: ['biometrics-migrated-v1'], values: [{k: 'biometrics-migrated-v1', v: {counts: 3}}]};
  const original = {stores: [daily, meta], dailyRows: daily, otherStores: [meta]};
  const before = JSON.stringify(original), warm = qualifyWearableManualDevice(original, 'migrated-baseline', 0), cold = qualifyWearableManualDevice(original, 'after-selected-pair-delete', 1);
  expect(warm.dailyRows).toEqual({...daily,values:[weight,{...cuff,bpPaired:true}]});
  expect(cold.dailyRows).toEqual({...daily,values:[{...weight,_manualSyncAt:{weight:0}},{...cuff,bpPaired:true,_manualSyncAt:{bp_systolic:0,bp_diastolic:0}}]});
  expect(warm.otherStores).toEqual([{...meta, keys: [...meta.keys, 'manual-body-readings-backfilled-v1'], values: [{k:'biometrics-migrated-v1',v:{counts:3,bpPairEvidence:1}}, {k: 'manual-body-readings-backfilled-v1', v: {at: 1786104000000}, updatedAt: 1786104000000}]}]);
  expect(JSON.stringify(original)).toBe(before);
  expect(() => qualifyWearableManualDevice(original, 'migrated-baseline', 3)).toThrow('Known closed-client phase');
});
