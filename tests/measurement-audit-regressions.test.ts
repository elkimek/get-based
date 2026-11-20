import { afterEach, expect, it, vi } from 'vitest';
import { prepareImportCommit } from '../js/import-commit-validation.js';
import { normalizeToSI } from '../js/schema.js';
import { repairProfileMarkerData } from '../js/profile-marker-migrations.js';
import type { ProfileMarkerData } from '../js/profile-marker-alias-migrations.js';
import { setLabEntryCollectionContext, type LabEntryDraft } from '../js/lab-entry.js';
import { computeWearableSummary, shouldWriteL2 } from '../js/wearables-summary-model.js';
import { fetchWithingsDailyRange } from '../js/wearables-withings.js';
import { reconcileGeneticsSnpState } from '../js/genetics-snp-lifecycle.js';
import type { GeneticsData } from '../js/dna-runtime.js';

const date = '2026-05-01';
afterEach(() => vi.unstubAllGlobals());

it.each([
  ['coagulation.dDimer', 'D-dimer', 'ng/mL FEU', 360, 500, 0.36, 0.5],
  ['differential.basophilsPct', 'Basophils', '%', 0.6, 1, 0.006, 0.01],
  ['biochemistry.urea', 'Urea', 'mg/dL', 30, 40, 30 / 6.006, 40 / 6.006],
  ['biochemistry.urea', 'Blood urea nitrogen', 'mg/dL', 30, 40, 30 / 2.801, 40 / 2.801],
  ['lipids.lpAMass', 'Lp(a)', 'mg/l', 600, 500, 60, 50],
] as const)('normalizes %s and its reference interval from the same reported measure', (key, rawName, unit, value, refMax, expected, upper) => {
  const input = { matched: true, mappedKey: key, rawName, unit, value, refMax };
  const result = prepareImportCommit({ date, markers: [input] }, new Set());
  expect(result.error).toBeNull();
  const marker = result.markers[0]!;
  expect(normalizeToSI(key, value, unit, marker)).toBeCloseTo(expected, 4);
  expect(normalizeToSI(key, refMax, unit, marker)).toBeCloseTo(upper, 4);
});

it.each([['lipids.lpA', 'mg/dL'], ['coagulation.dDimer', 'ng/mL DDU'], ['biochemistry.glucose', ''], ['biochemistry.glucose', 'unrecognized'], ['biochemistry.urea', 'mg/dl']])('requires a compatible, unambiguous measurand for %s in %s', (mappedKey, unit) => {
  expect(prepareImportCommit({ date, markers: [{ matched: true, mappedKey, unit, value: 30 }] }, new Set()).errorRows).toEqual([0]);
});

it('repairs source-owned legacy values and leaves manual edits intact on repeated loads', () => {
  const coag = 'coagulation.dDimer', molar = 'lipids.lpA', mass = 'lipids.lpAMass', homa = 'diabetes.homaIR';
  const data: ProfileMarkerData = {
    entries: [{ date, markers: { [coag]: 360, [molar]: 60, [homa]: 4 }, markerSources: { [coag]: { snapshotId: 'report' }, [molar]: { snapshotId: 'report' }, [homa]: { snapshotId: 'report' } } },
      { date, markers: { [coag]: 1 }, markerSources: { [coag]: { snapshotId: 'report', manuallyEdited: true } } }],
    importSnapshots: [{ id: 'report', date, markers: [{ mappedKey: coag, value: 360, refMax: 500, unit: 'ng/mL FEU' }, { mappedKey: molar, value: 60, refMax: 50, unit: 'mg/dL' }, { mappedKey: homa, value: 4, unit: '' }] }],
    refOverrides: { [coag]: { refSource: 'import', labRefSnapshotId: 'report', refMax: 500 }, [molar]: { refSource: 'import', labRefSnapshotId: 'report', refMax: 50 } },
  };
  repairProfileMarkerData(data);
  const once = structuredClone(data);
  repairProfileMarkerData(data);
  expect(data).toEqual(once);
  expect(data.entries![0]!.markers).toEqual({ [coag]: 0.36, [mass]: 60, [homa]: 4 });
  expect(data.refOverrides![coag]!.refMax).toBe(0.5);
  expect(data.refOverrides![mass]!.refMax).toBe(50);
  expect(data.entries![0]!.markerSources![homa]?.reported).toBe(true);
  expect(data.entries![1]!.markers![coag]).toBe(1);
});

it('withholds automatic HOMA on a nonfasting collection and preserves a reported result', () => {
  const derived: LabEntryDraft = { date, markers: { 'biochemistry.glucose': 5, 'diabetes.insulin': 9, 'diabetes.homaIR': 2 } };
  const reported = { ...structuredClone(derived), markerSources: { 'diabetes.homaIR': { reported: true } } };
  setLabEntryCollectionContext(derived, { fasting: false });
  setLabEntryCollectionContext(reported, { fasting: false });
  expect(derived.markers).not.toHaveProperty(['diabetes.homaIR']);
  expect(reported.markers!['diabetes.homaIR']).toBe(2);
  setLabEntryCollectionContext(derived, { fasting: true });
  expect(derived.markers!['diabetes.homaIR']).toBe(2);
});

it('computes calendar windows from current day and publishes corrections to an existing sample', () => {
  const summary = (latest: number) => computeWearableSummary({ manual: [{ date: '2026-01-01', source: 'manual', rhr: 70 }, { date: '2026-04-03', source: 'manual', rhr: 60 }, { date, source: 'manual', rhr: latest }] }, {}, {}, date);
  const current = summary(50), metric = current.metrics.rhr!;
  expect(metric.rolling).toEqual({ d7: 50, d30: 55, d90: 55 });
  expect(metric.trend30d).toBe('insufficient');
  expect(shouldWriteL2(summary(50.1), current).write).toBe(true);
});

it('reads all Withings offsets and preserves the failed family cursor on partial retry', async () => {
  const requests: URLSearchParams[] = [];
  let failSleep = true;
  vi.stubGlobal('fetch', async (_: unknown, init: RequestInit) => {
    const form = new URLSearchParams(JSON.parse(String(init.body)).body);
    requests.push(form);
    const action = form.get('action');
    if (action === 'getsummary') {
      if (failSleep) return new Response('temporary', { status: 503 });
      return Response.json({ status: 0, body: { series: [{ date, modified: 500, data: { total_sleep_time: 28800, asleepduration: 25200 } }] } });
    }
    if (action !== 'getmeas') throw new Error('unexpected action');
    const second = form.get('offset') === '1';
    return Response.json({ status: 0, body: { more: second ? 0 : 1, offset: 1, measuregrps: [{ date: 1777636800 + (second ? 86400 : 0), modified: second ? 400 : 300, measures: [{ type: 130, value: 1, unit: 0 }, { type: 168, value: 17, unit: 0 }, { type: 155, value: 55, unit: 0 }] }] } });
  });
  const partial = await fetchWithingsDailyRange('fixture', date, '2026-05-03', { measures: 100, sleep: 200 });
  expect(partial).toHaveLength(2);
  expect(partial[0]).toMatchObject({ vascular_age: 55, nerve_health_score: null });
  expect(partial.withingsCursors).toEqual({ measures: 399, sleep: 200 });
  failSleep = false;
  const retried = await fetchWithingsDailyRange('fixture', date, '2026-05-03', partial.withingsCursors);
  expect(retried.find(row => row.date === date)?.sleep_total_min).toBe(480);
  expect(retried.withingsCursors.sleep).toBe(499);
  expect(requests.filter(form => form.get('action') === 'getsummary').map(form => form.get('lastupdate'))).toEqual(['200', '200']);
});

it('keeps older unsupported clinical report calls out of APOE and retains their source evidence', () => {
  const call = { genotype: 'CT', normalizedGenotype: 'CT', source: { type: 'report-text', rawText: 'rs1801133 CT\nrs429358 no call' } };
  const genetics: GeneticsData = { snps: { rs429358: call, rs7412: { genotype: 'CC', normalizedGenotype: 'CC' } }, apoe: 'ε3/ε4' };
  reconcileGeneticsSnpState({ genetics });
  expect(genetics.snps?.rs429358).toBeUndefined();
  expect(genetics.unverifiedReportCalls?.rs429358).toEqual(call);
  expect(genetics.apoe).toBeUndefined();
});
