import assert from 'node:assert/strict';
import {wearableAcceptanceTime} from './wearable-detail-pwa-receipt.js';

const at = Date.parse(wearableAcceptanceTime);
const states = ['migrated-baseline', 'after-bp-save', 'after-same-date-merge', 'after-selected-pair-delete'];
/** An authored additive contract, independent of runtime mirror/backfill code.
 * Historical receipts stay immutable; every old field and raw storage byte is
 * retained in the complete expected receipt alongside these exact new fields. */
export function wearableManualMirror(state: string) {
  assert(states.includes(state), 'Known original manual journey state');
  const mirror: Record<string, {value: number | string | string[] | null; updatedAt: number}> = {};
  for (const [date, weight, systolic, diastolic, pulse] of [
    ['2025-01-10', 74, 124, 82, 64],
    ['2026-07-31', 73, 122, 80, 62],
    ['2026-08-05', 72, 120, 78, 60],
  ] as const) {
    for (const [field, value] of [['weight', weight], ['bp_systolic', systolic], ['bp_diastolic', diastolic], ['rhr', pulse]] as const)
      mirror[`${field}.${date}`] = {value, updatedAt: 0};
  }
  if (state !== 'migrated-baseline') {
    const deleted = state === 'after-selected-pair-delete';
    for (const [field, value] of Object.entries({bp_systolic: deleted ? null : 121, bp_diastolic: deleted ? null : 79, rhr: 61, tags: ['resting'], note: 'Synthetic note <&> "paired"'}))
      mirror[`${field}.2026-08-06`] = {value, updatedAt: at};
    if (state !== 'after-bp-save') mirror['weight.2026-08-06'] = {value: 71.5, updatedAt: at};
  }
  return mirror;
}
// Only July 31 and August 5 fall in the 90-day window ending August 7.
// July 31 falls outside seven days. August 6 adds a third observation.
const calendarCases = {
  weight: [[72.5,72.25,72.75,72,72.5,'insufficient',73,72], [72,71.75,72.5,71.75,72.17,'declining',73,71.75]],
  bp_systolic: [[121,120.5,121.5,120,121,'insufficient',122,120], [121,120.5,121.5,120.5,121,'flat',122,120.5]],
  bp_diastolic: [[79,78.5,79.5,78,79,'insufficient',80,78], [79,78.5,79.5,78.5,79,'declining',80,78.5]],
  rhr: [[61,60.5,61.5,60,61,'insufficient',62,60], [61,60.5,61.5,60.5,61,'declining',62,60.5]],
} as const;
type Metric = keyof typeof calendarCases;
export function calendarMetric(state: string, id: Metric) {
  assert(states.includes(state));
  const extra = id === 'weight' ? state === 'after-same-date-merge' || state === 'after-selected-pair-delete'
    : id === 'rhr' ? state !== 'migrated-baseline' : state === 'after-bp-save' || state === 'after-same-date-merge';
  const [baseline,baselineP25,baselineP75,d7,d30,trend30d,previous,latest] = calendarCases[id][extra ? 1 : 0];
  return {baseline, baselineP25, baselineP75, rolling: {d7,d30,d90:d30}, trend30d, weekly:[previous,latest]};
}
function calendarSummary(value: unknown, state: string) {
  const summary = structuredClone(value) as {metrics: Record<Metric,Record<string,unknown>>};
  assert.deepEqual(Object.keys(summary.metrics).sort(), Object.keys(calendarCases).sort());
  for (const id of Object.keys(calendarCases) as Metric[]) {
    const metrics = summary.metrics[id];
    assert.equal(metrics.primarySource, 'manual');
    const isBP = id === 'bp_systolic' || id === 'bp_diastolic';
    summary.metrics[id] = {...Object.fromEntries(Object.entries(metrics).flatMap(([key,v]) =>
      key === 'latestDate' && isBP ? [[key,v],['latestBpPaired',true]] : [[key,v]])), ...calendarMetric(state,id)};
  }
  return summary;
}
// Exact display for the four fixture metrics, independent of dashboard formatters.
export function calendarView(state:string, name:string) {
  const id = name.startsWith('bp-') ? 'bp_systolic' : name.startsWith('weight-') ? 'weight' : 'rhr';
  const m = calendarMetric(state,id), dia = calendarMetric(state,'bp_diastolic');
  const unit = id === 'weight' ? 'kg' : id === 'rhr' ? 'bpm' : 'mmHg';
  const scalar = (v:number) => id === 'rhr' ? String(Math.round(v)) : Number.isInteger(v) ? String(v) : v.toFixed(1);
  const value = (v:number, d:number) => scalar(v) + (id === 'bp_systolic' ? '/' + scalar(d) : '');
  const bpAdded = state === 'after-bp-save' || state === 'after-same-date-merge';
  const latest = id === 'weight' ? (state === 'migrated-baseline' || state === 'after-bp-save' ? 72 : 71.5)
    : id === 'rhr' ? 61 : bpAdded ? 121 : 120;
  const delta = (latest - m.baseline) * 100 / m.baseline;
  const direction = delta > .5 ? '↑' : delta < -.5 ? '↓' : '→';
  return {heading:'Manual · ' + direction + ' ' + Math.abs(delta).toFixed(0) + '% vs baseline · ' +
    (m.trend30d === 'insufficient' ? 'insufficient data' : m.trend30d) + ' 30d',
    stats:{'Baseline (90d)':value(m.baseline,dia.baseline)+' '+unit, '7-day avg':value(m.rolling.d7,dia.rolling.d7)+' '+unit,
      '30-day avg':value(m.rolling.d30,dia.rolling.d30)+' '+unit,
      'Typical range':value(m.baselineP25,dia.baselineP25)+' – '+value(m.baselineP75,dia.baselineP75)+' '+unit},
    baselines:id === 'bp_systolic' ? [m.baseline,dia.baseline] : [m.baseline]};
}
interface ProfileReceipt {
  live: Record<string, unknown>; stored: Record<string, unknown>; rawCommitted: string;
}
export function qualifyWearableManualProfile<T extends ProfileReceipt>(original: T, state: string): T {
  assert.equal(original.rawCommitted, JSON.stringify(original.stored), 'Exact original committed serialization');
  const extend = (data: Record<string, unknown>) => {
    assert(!Object.hasOwn(data, 'manualBodyReadings'), 'Original receipt predates manual Sync');
    assert(Object.hasOwn(data, 'wearableSummary'), 'Original summary insertion boundary');
    return Object.fromEntries(Object.entries(data).flatMap(([key, value]) => key === 'wearableSummary'
      ? [['manualBodyReadings', wearableManualMirror(state)], [key, calendarSummary(value,state)]]
      : [[key, structuredClone(value)]]));
  };
  const stored = extend(original.stored);
  return {...structuredClone(original), live: extend(original.live), stored, rawCommitted: JSON.stringify(stored)};
}
interface StoreReceipt {name: string; keys: unknown[]; values: Array<Record<string, unknown>>}
function store(value: unknown): StoreReceipt {
  assert(value && typeof value === 'object' && 'name' in value && 'keys' in value && 'values' in value, 'Original complete store receipt');
  return structuredClone(value) as StoreReceipt;
}
export function qualifyWearableManualDaily(original: unknown, state: string, phase: number): unknown {
  wearableManualMirror(state); assert([0, 1, 2].includes(phase), 'Known closed-client phase');
  const daily = store(original);
  for (const row of daily.values) {
    assert.equal(row.source, 'manual'); assert(!Object.hasOwn(row, '_manualSyncAt'), 'Original rows predate edit clocks');
    if (row.date === '2026-08-06') {
      const clocks: Record<string, number> = {bp_systolic: at, bp_diastolic: at, rhr: at, tags: at, note: at};
      if (state !== 'after-bp-save') clocks.weight = at;
      row._manualSyncAt = clocks;
    } else row.bpPaired = true;
    if (row.date !== '2026-08-06' && phase > 0) row._manualSyncAt = {weight: 0, bp_systolic: 0, bp_diastolic: 0, rhr: 0};
  }
  return daily;
}
interface DeviceReceipt {stores: unknown; dailyRows: unknown; otherStores: unknown}
export function qualifyWearableManualDevice<T extends DeviceReceipt>(original: T, state: string, phase: number): T {
  assert(Array.isArray(original.stores) && Array.isArray(original.otherStores), 'Original full device stores');
  const qualifyStore = (value: unknown) => {
    const result = store(value);
    if (result.name === 'daily-metrics') return qualifyWearableManualDaily(value, state, phase);
    assert.equal(result.name, 'meta', 'Only original known store owners');
    for (const item of result.values) if (item.k === 'biometrics-migrated-v1') {
      assert(item.v && typeof item.v === 'object'); Object.assign(item.v,{bpPairEvidence:1});
    }
    const key = 'manual-body-readings-backfilled-v1';
    assert(!result.keys.includes(key), 'Original metadata predates backfill');
    result.keys.push(key); result.values.push({k: key, v: {at}, updatedAt: at});
    return result;
  };
  return {...structuredClone(original), stores: original.stores.map(qualifyStore),
    dailyRows: qualifyWearableManualDaily(original.dailyRows, state, phase), otherStores: original.otherStores.map(qualifyStore)};
}
