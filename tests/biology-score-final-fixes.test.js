import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { computeBiologyScores, computeBiologyScoreAssessments } from '../js/biology-scores.js';
import { MARKER_SCHEMA } from '../js/schema.js';
import { SPECIALTY_MARKER_DEFS } from '../js/adapters.js';
import { state } from '../js/state.js';
import { applyUnitConversion, getActiveData, invalidateActiveDataCache } from '../js/data.js';
import { scoreLine } from '../js/biology-score-ai.js';
import { buildBiologyScoresAIContext } from '../js/biology-score-ai-context.js';
import { getScoreAIMaterialKey, hasCurrentScoreAIAssessment } from '../js/biology-score-sections.js';
import { buildBiologyScoreCoveragePlannerModel } from '../js/biology-score-coverage-planner.js';
import * as dataModule from '../js/data.js';
import { applyBiologyScoreContextFlag } from '../js/biology-score-context-ai.js';
import { encryptedGetItem } from '../js/crypto.js';
import { profileStorageKey } from '../js/profile.js';
import { mergeProfileMutation } from '../js/profile-data-writes.js';
import { renderScoreDetail } from '../js/biology-score-render.js';

const profile = { sex: 'male', ageYears: 38 };
const data = () => ({ dates: ['2026-09-01'], categories: {}, entryContextByDate: { '2026-09-01': { fasting: true, sampleTime: '08:00' } } });
function add(d, path, value, overrides = {}) {
  const [cat, key] = path.split('.'); d.categories[cat] ||= { markers: {} };
  d.categories[cat].markers[key] = { ...(MARKER_SCHEMA[cat]?.markers?.[key] || SPECIALTY_MARKER_DEFS[path] || {}), values: [value], ...overrides };
  return d;
}
const score = (d, id, ctx = profile) => computeBiologyScores(d, { profileContext: ctx }).find(s => s.id === id);
const item = (s, key) => s.available.find(i => i.key === key);
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-16T12:00:00Z'));
  state.currentProfile = 'biology-composition'; state.profileSex = 'male'; state.profileDob = '1987-11-22'; state.rangeMode = 'reference'; state.unitSystem = 'EU';
  state.importedData = { entries: [], diagnoses: { flags: {} } }; invalidateActiveDataCache();
});
afterEach(() => vi.restoreAllMocks());


for (const [id, current, old, extras] of [
  ['redoxStress', ['proteins.hsCRP', .5], ['proteins.crp', 1], []],
  ['oneCarbonCoherence', ['vitamins.vitaminB12', 350], ['vitamins.activeB12', 100], [['coagulation.homocysteine', 8], ['vitamins.folate', 25]]],
  ['fluidFiltrationCoherence', ['biochemistry.egfr', 1.8], ['biochemistry.gfrCystatin', 2], [['electrolytes.sodium', 140], ['electrolytes.potassium', 4.2]]],
  ['boneMineralSignal', ['electrolytes.calciumTotal', 2.4], ['electrolytes.calciumIonized', 1.2], [['proteins.albumin', 45], ['vitamins.vitaminD', 90], ['electrolytes.phosphorus', 1.1]]],
]) it(`old alternative cannot invalidate current ${id}`, () => {
  const d = add(data(), ...current); extras.forEach(([path, value]) => add(d, path, value));
  const before = score(d, id);
  add(d, ...old, { singleDate: '2025-12-01' });
  const after = score(d, id);
  expect(after.score).toBe(before.score); expect(after.coverage).toBe(before.coverage);
  expect(after.recencyStatus).toBe('fresh');
  expect(after.available.find(i => i.date === '2025-12-01')).toMatchObject({ profileContextOnly: true, recencyRequired: false });
});

it('invalid newer filtration cannot supersede an interpretable cystatin route', () => {
  const d = add(data(), 'biochemistry.gfrCystatin', 2, { singleDate: '2026-08-01' });
  add(d, 'biochemistry.egfr', 2.5); add(d, 'electrolytes.sodium', 140); add(d, 'electrolytes.potassium', 4.2);
  const s = score(d, 'fluidFiltrationCoherence', { ...profile, lowMuscleMass: true });
  expect(s.score).toBe(100);
  expect(item(s, 'gfrCystatin').profileContextOnly).toBe(false);
  expect(item(s, 'egfr').profileContextOnly).toBe(true);
});

it('true mixed-date requirements remain blocked', () => {
  const d = add(data(), 'thyroid.tsh', 1.5, { singleDate: '2026-01-01' }); add(d, 'thyroid.ft4', 16);
  expect(score(d, 'thyroidCoherence').score).toBeNull();
});

it('conditional calcium upgrade is useful only when the existing route is limited', () => {
  const d = add(data(), 'electrolytes.calciumTotal', 2.4); add(d, 'proteins.albumin', 20); add(d, 'vitamins.vitaminD', 90);
  const plan = () => { const scores = computeBiologyScores(d, { profileContext: profile }); return buildBiologyScoreCoveragePlannerModel(scores.slice(1), scores[0]); };
  expect(plan().optionalUpgrades.find(i => i.key === 'calciumIonized')).toMatchObject({ core: false, conditionalReason: expect.stringContaining('albumin') });
  add(d, 'proteins.albumin', 45);
  expect(plan().optionalUpgrades.some(i => i.key === 'calciumIonized')).toBe(false);
});

it.each(['reference', 'optimal'])('all saved score views survive display units: %s', rangeMode => {
  state.rangeMode = rangeMode;
  state.importedData = { entries: [{ date: '2026-09-01', fasting: true, sampleTime: '08:00', markers: { 'lipids.apoB': .8, 'lipids.ldl': 3, 'proteins.hsCRP': 1, 'thyroid.tsh': 1.5, 'thyroid.ft4': 16, 'vitamins.vitaminB12': 350, 'coagulation.homocysteine': 8, 'biochemistry.egfr': 1.8 } }] };
  const initial = computeBiologyScoreAssessments(getActiveData());
  state.importedData.biologyScoreAI = Object.fromEntries(initial.map(s => [s.id, { text: 'Saved units remain explicitly labelled.', summary: 'Saved summary.', materialFingerprint: getScoreAIMaterialKey(s), coveredMaterials: s.aiViews.map(v => v.material) }]));
  for (const units of ['US', 'ANZ', 'EU']) {
    state.unitSystem = units; invalidateActiveDataCache();
    const next = computeBiologyScoreAssessments(getActiveData());
    expect(next.map(s => s.score)).toEqual(initial.map(s => s.score));
    expect(next.filter(s => !hasCurrentScoreAIAssessment(s)).map(s => s.id)).toEqual([]);
  }
});

it('legacy display fingerprints reuse canonical evidence without a paid migration', () => {
  state.importedData = { entries: [{ date: '2026-09-01', markers: { 'lipids.apoB': .8 } }] };
  const s = computeBiologyScoreAssessments(getActiveData()).find(i => i.id === 'cardiovascularLipoprotein');
  const key = JSON.parse(getScoreAIMaterialKey(s)); delete key.materialFormat;
  key.available = key.available.map(row => {
    const hit = s.available.find(i => i.key === row.key);
    const { dotKey, ...legacy } = row;
    return { ...legacy, value: hit.value, unit: hit.unit, displayValue: hit.displayValue, range: hit.range, referenceRange: hit.referenceRange };
  });
  state.importedData.biologyScoreAI = { [s.id]: { text: 'Legacy complete insight.', summary: 'Legacy summary.', materialFingerprint: JSON.stringify(key) } };
  state.unitSystem = 'US'; invalidateActiveDataCache();
  const us = computeBiologyScoreAssessments(getActiveData()).find(i => i.id === s.id);
  expect(hasCurrentScoreAIAssessment(us)).toBe(true);
  state.importedData.entries[0].markers['lipids.apoB'] = 1.6; invalidateActiveDataCache();
  expect(hasCurrentScoreAIAssessment(computeBiologyScoreAssessments(getActiveData()).find(i => i.id === s.id))).toBe(false);
});

it('profile mutations preserve independent fields, explicit deletions and nested flags', () => {
  const base = { entries: [1], contextNotes: 'Old', diagnoses: { flags: { lowMuscleMass: false } }, biologyScoreAI: { a: { text: 'a' } } };
  const local = { ...base, entries: [2], diagnoses: { flags: { lowMuscleMass: true } } }; delete local.contextNotes;
  const latest = { ...base, diagnoses: { flags: { lowMuscleMass: false, hormoneTherapy: true } }, biologyScoreAI: { a: { text: 'a' }, b: { text: 'b' } } };
  expect(mergeProfileMutation(base, local, latest)).toEqual({ entries: [2], diagnoses: { flags: { lowMuscleMass: true, hormoneTherapy: true } }, biologyScoreAI: latest.biologyScoreAI });
});

it('a failed context flag cannot leak into a concurrent ordinary save', async () => {
  await dataModule.saveImportedData();
  vi.spyOn(dataModule, 'saveImportedDataForProfile').mockImplementation(async () => {
    expect(state.importedData.diagnoses.flags.lowMuscleMass).not.toBe(true);
    state.importedData.contextNotes = 'Saved while context storage failed';
    expect(await dataModule.saveImportedData()).toBe(true);
    return false;
  });
  await expect(applyBiologyScoreContextFlag('lowMuscleMass')).rejects.toThrow('Could not save context');
  const saved = JSON.parse(await encryptedGetItem(profileStorageKey(state.currentProfile, 'imported')));
  expect(saved.diagnoses.flags.lowMuscleMass).not.toBe(true);
  expect(saved.contextNotes).toBe('Saved while context storage failed');
});
