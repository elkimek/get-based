import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDemoTreatmentData, DEMO_DRAW_OFFSETS } from '../js/demo-treatment-data.js';
import { prepareDemoBiologyData } from '../js/demo-biology-data.js';
import { getSupplementStatus, getSupplementPeriods } from '../js/supplement-medication-domain.js';
import { buildSupplementAIContext } from '../js/supplement-context.js';
import { state } from '../js/state.js';
import { migrateProfileData } from '../js/profile.js';
import { getActiveData, invalidateActiveDataCache } from '../js/data.js';
import { buildLabContext } from '../js/lab-context.js';

const sexes = ['male', 'female'] as const;
const readFixture = (sex: string) => JSON.parse(fs.readFileSync(new URL(`../data/demo-${sex}.json`, import.meta.url), 'utf8')) as ReturnType<typeof applyDemoTreatmentData>;
const fixtures = { male: readFixture('male'), female: readFixture('female') };
const dateAt = (anchor: string, days: number) => new Date(Date.parse(`${anchor}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
const merged = (entries: readonly {date: unknown; markers?: unknown}[], date: string) => Object.assign({}, ...entries.filter(e => e.date === date).map(e => e.markers)) as Record<string, number>;
afterEach(() => { vi.useRealTimers(); invalidateActiveDataCache(); });

describe('synthetic prescribed-medication demos', () => {
  it.each(sexes)('keeps %s refresh deterministic and idempotent', sex => {
    const input = structuredClone(fixtures[sex]);
    const once = applyDemoTreatmentData(input, sex);
    expect(applyDemoTreatmentData(structuredClone(once), sex)).toEqual(once);
    expect(once.supplements.filter(item => item.type === 'medication')).toHaveLength(1);
    expect(once.biologyScoreAI).toBeUndefined(); expect(once.biologyScoreContextAI).toBeUndefined();
    expect(new Set(once.healthGoals.map(item => item.text)).size).toBe(once.healthGoals.length);
    expect(once.entries.every(e => Object.values(e.markers).every(value => Number.isFinite(value) && value >= 0))).toBe(true);
  });

  it.each(['2026-11-03', '2028-02-29', '2030-12-31'])('preserves dose history and lab/clinical timing when loaded on %s', day => {
    const now = new Date(`${day}T12:00:00Z`); vi.useFakeTimers(); vi.setSystemTime(now);
    for (const sex of sexes) {
      const source = JSON.stringify(fixtures[sex]);
      const data = prepareDemoBiologyData(fixtures[sex], sex, { now });
      expect(JSON.stringify(fixtures[sex])).toBe(source);
      const prescription = (data.supplements as typeof fixtures.male.supplements).find(item => item.type === 'medication')!;
      expect(getSupplementStatus(prescription)).toBe('active');
      const anchor = [...data.demoBiology.panelDates].sort().at(-1)!;
      const periods = getSupplementPeriods(prescription);
      expect(periods[0]!.start).toBe(dateAt(anchor, 338));
      expect(periods.at(-1)!.end).toBeNull();
      for (let i = 1; i < periods.length; i++) expect(Date.parse(periods[i]!.start as string) - Date.parse(periods[i - 1]!.end as string)).toBe(86400000);
      const before = merged(data.entries, dateAt(anchor, 348));
      const after = merged(data.entries, dateAt(anchor, 290));
      expect(Date.parse(dateAt(anchor, 290)) - Date.parse(periods[0]!.start as string)).toBe(48 * 86400000);
      if (sex === 'male') {
        expect(periods).toHaveLength(1);
        expect(before['lipids.ldl']).toBe(4.4); expect(after['lipids.ldl']).toBe(2.55);
        const reduction = 1 - after['lipids.ldl']! / before['lipids.ldl']!;
        expect(reduction).toBeGreaterThan(0.3); expect(reduction).toBeLessThan(0.5);
      } else {
        expect(periods).toHaveLength(3);
        expect(before['thyroid.tsh']).toBeGreaterThan(4.2); expect(before['thyroid.ft4']).toBeLessThan(11.9);
        const excess = merged(data.entries, dateAt(anchor, 174));
        expect(excess['thyroid.tsh']).toBeLessThan(0.27); expect(excess['thyroid.ft4']).toBeGreaterThan(21.6);
        const stable = merged(data.entries, anchor);
        expect(stable['thyroid.tsh']).toBe(2.2); expect(stable['thyroid.ft4']).toBe(15.8);
        expect(stable['iron.ferritin']).toBeGreaterThan(before['iron.ferritin']!);
        const preContext = data.entries.find(entry => entry.date === dateAt(anchor, 348))!.context as {notes: string};
        expect(preContext.notes).toContain('had not been started');
      }
    }
  });

  it.each(sexes)('keeps %s derived biochemistry and hematology consistent', sex => {
    for (const entries of [fixtures[sex].entries, prepareDemoBiologyData(fixtures[sex], sex).entries]) {
      for (const entry of entries) {
        const m = entry.markers as Record<string, number>;
        if (m['diabetes.insulin'] != null && m['biochemistry.glucose'] != null) expect(m['diabetes.homaIR']).toBeCloseTo(m['diabetes.insulin']! * m['biochemistry.glucose']! / 22.5, 2);
        if (m['lipids.hdl'] != null && m['lipids.ldl'] != null && m['lipids.triglycerides'] != null) {
          expect(m['lipids.cholesterol']).toBeCloseTo(m['lipids.ldl']! + m['lipids.hdl']! + m['lipids.triglycerides']! / 2.2, 2);
          expect(m['lipids.nonHdl']).toBeCloseTo(m['lipids.cholesterol']! - m['lipids.hdl']!, 2);
        }
        if (m['hematology.rbc'] != null && m['hematology.mcv'] != null && m['hematology.hemoglobin'] != null) {
          expect(m['hematology.hematocrit']).toBeCloseTo(m['hematology.rbc']! * m['hematology.mcv']! / 10, 2);
          expect(m['hematology.mch']).toBeCloseTo(m['hematology.hemoglobin']! / m['hematology.rbc']!, 2);
          expect(m['hematology.mchc']).toBeCloseTo(m['hematology.hemoglobin']! / (m['hematology.hematocrit']! / 100), 1);
        }
        if (m['iron.tibc'] != null && m['iron.iron'] != null) expect(m['iron.transferrinSat']).toBeCloseTo(100 * m['iron.iron']! / m['iron.tibc']!, 1);
        expect(m['iron.transferrinSaturation']).toBeUndefined();
      }
    }
  });

  it.each(sexes)('keeps matching %s manual measurements consistent across profile surfaces', sex => {
    for (const data of [fixtures[sex], prepareDemoBiologyData(fixtures[sex], sex)]) {
      const manual = data.manualValues as Record<string, { date: string; value: number | { sys: number; dia: number } }>;
      const biometrics = data.biometrics as Record<string, { date: string; value?: number; sys?: number; dia?: number }[]>;
      for (const [kind, entries] of Object.entries(biometrics)) for (const entry of entries) {
        const matching = manual[`${kind}:manual:${entry.date}`];
        if (!matching) continue;
        if (kind === 'bp') expect({ sys: entry.sys, dia: entry.dia }).toEqual(matching.value);
        else expect(entry.value).toBe(matching.value);
      }
    }
  });

  it('keeps possible adverse effects distinct from established facts and clears stale copy', () => {
    const alex = fixtures.male, sarah = fixtures.female;
    expect(alex.diagnoses.note).not.toContain('No chronic medications');
    expect(alex.notes.some(note => note.text.includes('causality'))).toBe(true);
    expect(alex.notes.some(note => note.text.includes('LDL 4.40→2.55'))).toBe(true);
    expect(sarah.diagnoses.note).not.toMatch(/not.*taking|pending|under evaluation/);
    expect(sarah.supplements.find(item => item.type === 'medication')!.schedule!.details).toContain('Iron at 13:00');
    expect((sarah.wearableSummary as {metrics: {body_temp_delta: {latest: number}}}).metrics.body_temp_delta.latest).toBe(0);
    expect(sarah.notes.some(note => note.text.includes('resolved'))).toBe(true);
  });

  it.each(sexes)('retains the real %s prescription and dates after migration and in chat context', sex => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-03T12:00:00Z'));
    const previous = { importedData: state.importedData, profileSex: state.profileSex, currentProfile: state.currentProfile, dateRangeFilter: state.dateRangeFilter, unitSystem: state.unitSystem };
    try {
      const data = prepareDemoBiologyData(fixtures[sex], sex);
      const entries = new Map<string, {date: string; markers: Record<string, unknown>; context?: unknown}>();
      for (const entry of data.entries) {
        const date = String(entry.date), prior = entries.get(date) || { date, markers: {} };
        Object.assign(prior.markers as object, entry.markers); if (entry.context) prior.context = entry.context;
        entries.set(date, prior);
      }
      data.entries = [...entries.values()];
      migrateProfileData(data as unknown as Parameters<typeof migrateProfileData>[0]);
      state.importedData = data as unknown as typeof state.importedData; state.profileSex = sex;
      state.currentProfile = `demo-treatment-${sex}`; state.dateRangeFilter = 'all'; state.unitSystem = 'EU';
      invalidateActiveDataCache();
      expect(getActiveData().dates.length).toBeGreaterThanOrEqual(DEMO_DRAW_OFFSETS.length);
      const name = sex === 'female' ? 'Levothyroxine' : 'Atorvastatin';
      const context = buildLabContext({ ignoreContextToggles: true, queryText: `Could ${name} explain my results?` });
      expect(context).toContain(name); expect(context).not.toContain('No chronic medications');
      const therapy = buildSupplementAIContext(data.supplements, { mode: 'detail', queryText: name });
      const medication = (data.supplements as typeof fixtures.male.supplements).find(item => item.type === 'medication')!;
      for (const period of medication.periods!) expect(therapy).toContain(period.start);
      expect(therapy).toContain(sex === 'female' ? '50 µg/day' : '20 mg/day');
    } finally { Object.assign(state, previous); invalidateActiveDataCache(); }
  });

  it('refuses to rewrite non-demo data', () => {
    expect(() => applyDemoTreatmentData({ entries: [] }, 'male')).toThrow('Only bundled demo');
  });
});
