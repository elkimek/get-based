import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareDemoBiologyData } from '../js/demo-biology-data.js';
import { state } from '../js/state.js';
import { migrateProfileData } from '../js/profile.js';
import { getActiveData, invalidateActiveDataCache, filterDatesByRange } from '../js/data.js';
import { computeBiologyScores } from '../js/biology-scores.js';
import { readScoreAIAnswer, getScoreAIRefreshReason, getScoreAIMaterialKey, renderScoreAISummary, renderScoreAIAnswer } from '../js/biology-score-sections.js';
import { canAutomaticallyExplainBiologyScores, configureBiologyScoreAIDeps } from '../js/biology-score-ai.js';
import { getBiologyProfileContext } from '../js/profile-context.js';

const fixtures = Object.fromEntries(['male', 'female'].map(sex => [sex, JSON.parse(fs.readFileSync(new URL(`../data/demo-${sex}.json`, import.meta.url)))]));
function activate(sex, now) {
  const d = prepareDemoBiologyData(fixtures[sex], sex, { now });
  const entries = new Map();
  for (const entry of d.entries) {
    const previous = entries.get(entry.date) || { date: entry.date, markers: {}, context: {} };
    Object.assign(previous.markers, entry.markers); Object.assign(previous.context, entry.context);
    entries.set(entry.date, previous);
  }
  d.entries = [...entries.values()]; migrateProfileData(d);
  state.currentProfile = `demo-${sex}`; state.profiles = [{ id: state.currentProfile, tags: ['demo'] }];
  state.profileSex = sex; state.profileDob = sex === 'female' ? '1991-08-15' : '1987-11-22';
  state.importedData = d; state.dateRangeFilter = 'all'; state.rangeMode = 'optimal'; state.unitSystem = 'EU';
  invalidateActiveDataCache(); return d;
}
function scores() { return computeBiologyScores(filterDatesByRange(getActiveData(), { fallbackToAll: false })); }
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-17T12:00:00Z')); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('rolling Biology Score demos', () => {
  it.each(['2026-09-17', '2028-02-29', '2030-12-31'])('keeps both profiles complete through %s, every window and range mode', day => {
    const now = new Date(day + 'T12:00:00Z'); vi.setSystemTime(now);
    for (const sex of ['male', 'female']) {
      const before = JSON.stringify(fixtures[sex]); const d = activate(sex, now);
      expect(JSON.stringify(fixtures[sex])).toBe(before);
      const panelDates = d.demoBiology.panelDates.sort();
      expect(Date.parse(panelDates.at(-1)) - Date.parse(panelDates[0])).toBeGreaterThan(365 * 86400000);
      expect(d.entries.every(entry => Date.parse(entry.date) < now.getTime())).toBe(true);
      expect(d.biologyScoreContextAI).toBeUndefined();
      for (const window of ['all', '1y', '6m', '3m']) for (const mode of ['reference', 'optimal']) {
        state.dateRangeFilter = window; state.rangeMode = mode;
        const filtered = filterDatesByRange(getActiveData(), { fallbackToAll: false });
        expect(filtered.dates.length).toBeGreaterThanOrEqual(window === '3m' ? 2 : window === '6m' ? 3 : 6);
        const result = computeBiologyScores(filtered);
        expect(result).toHaveLength(19);
        for (const score of result) {
          expect(score.score, `${sex}/${window}/${mode}/${score.id}`).not.toBeNull();
          expect(score.coverage, score.id).toBe(1);
          const record = readScoreAIAnswer(score);
          expect(record.source).toBe('demo'); expect(record.summary.length).toBeLessThanOrEqual(280);
          expect(record.summary).not.toMatch(/…|\.{3}/); expect(record.text).toContain('## Next check');
          expect(getScoreAIRefreshReason(score)).toBe('');
        }
      }
      expect(new Set(d.entries.map(entry => entry.markers['proteins.hsCRP']).filter(Number.isFinite)).size).toBeGreaterThan(4);
    }
  });

  it('keeps measured values and canonical insulin/HOMA, lipid ratios and female collection context consistent', () => {
    for (const sex of ['male', 'female']) {
      const d = activate(sex, new Date());
      for (const date of d.demoBiology.panelDates) {
        const entry = d.entries.find(item => item.date === date); const m = entry.markers;
        expect(m['diabetes.homaIR']).toBeCloseTo(m['diabetes.insulin'] * m['biochemistry.glucose'] / 22.5, 2);
        expect(m['lipids.nonHdl']).toBeCloseTo(m['lipids.cholesterol'] - m['lipids.hdl'], 2);
        expect(m['iron.transferrinSaturation']).toBeUndefined();
        expect(entry.context).toMatchObject({ fasting: true, sampleTime: '08:05' });
        if (sex === 'female') expect(entry.context).toMatchObject({ cycleDay: 10, cyclePhaseSource: 'recorded' });
      }
      if (sex === 'female') {
        const latest = d.demoBiology.panelDates.sort().at(-1);
        const period = d.menstrualCycle.periods.map(item => item.startDate).sort().at(-1);
        expect((Date.parse(latest) - Date.parse(period)) / 86400000 + 1).toBe(10);
      }
      for (const units of ['EU', 'US', 'ANZ']) {
        state.unitSystem = units; invalidateActiveDataCache();
        expect(scores().every(score => Number.isFinite(score.score) && score.coverage === 1)).toBe(true);
      }
    }
  });

  it('labels local demo copy honestly, preserves real AI answers and does not enable paid auto-assessment', () => {
    activate('male', new Date()); const score = scores().find(item => item.id === 'metabolicFlexibility');
    expect(renderScoreAISummary(score)).toContain('Demo insight');
    expect(renderScoreAIAnswer(score)).toContain('Demo explanation');
    const previous = configureBiologyScoreAIDeps({ hasAIProvider: () => true, isAIPaused: () => false, automaticEnabled: () => true });
    try { expect(canAutomaticallyExplainBiologyScores()).toBe(false); } finally { configureBiologyScoreAIDeps(previous); }
    const answer = { summary: 'A real saved answer.', text: 'Real provider explanation.', materialFingerprint: getScoreAIMaterialKey(score) };
    state.importedData.biologyScoreAI = { [score.id]: answer };
    expect(readScoreAIAnswer(score)).toBe(answer);
    state.rangeMode = 'reference';
    const changed = scores().find(item => item.id === score.id);
    expect(readScoreAIAnswer(changed)).toBe(answer);
    expect(getScoreAIRefreshReason(changed)).not.toBe('');
    delete state.importedData.biologyScoreAI; state.profiles[0].tags = [];
    expect(readScoreAIAnswer(changed)).toBeNull();
  });

  it('respects explicitly reviewed collection flags while retaining inference for unreviewed profiles', () => {
    activate('male', new Date());
    state.importedData.exercise = { types: ['strength'], notes: 'Regular heavy lifting.' };
    state.importedData.contextNotes = 'A prior infection is recorded.';
    expect(getBiologyProfileContext()).toMatchObject({ recentHardTraining: false, acuteInflammationContext: false });
    state.importedData.diagnoses.flags = { intenseTrainingRecent: true, acuteIllnessNearDraw: true };
    expect(getBiologyProfileContext()).toMatchObject({ recentHardTraining: true, acuteInflammationContext: true });
    state.importedData.diagnoses.flags = {};
    expect(getBiologyProfileContext()).toMatchObject({ recentHardTraining: true, acuteInflammationContext: true });
  });

  it('rejects non-demo data rather than rewriting a real profile', () => {
    expect(() => prepareDemoBiologyData({ entries: [] }, 'male')).toThrow('Only bundled demo');
  });
});
