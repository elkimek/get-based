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

it('CRP alternatives carry equal influence and GGT cannot create or dilute inflammation', () => {
  const results = ['proteins.hsCRP', 'proteins.crp'].map(path => {
    const d = add(data(), path, 20, { refMin: 0, refMax: 5, unit: 'mg/l' });
    add(d, 'biochemistry.ggt', .5); return score(d, 'redoxStress');
  });
  expect(results.map(s => s.score)).toEqual([0, 0]);
  expect(results.map(s => s.coverage)).toEqual([1, 1]);
  expect(score(add(data(), 'biochemistry.ggt', .5), 'redoxStress').score).toBeNull();
});

it('all three filtration routes keep 70% of the complete core weight', () => {
  for (const path of ['biochemistry.egfr', 'biochemistry.gfrCystatin', 'biochemistry.egfrCombined']) {
    const d = add(data(), path, .5, { refMin: 1.5, refMax: 2.5, unit: 'ml/s' });
    add(d, 'electrolytes.sodium', 140); add(d, 'electrolytes.potassium', 4.2);
    expect(score(d, 'fluidFiltrationCoherence').score).toBe(30);
  }
});

it('B12 alternatives and adding both preserve family influence under equal fits', () => {
  const values = [];
  for (const paths of [['vitamins.activeB12'], ['vitamins.vitaminB12'], ['vitamins.activeB12', 'vitamins.vitaminB12']]) {
    const d = add(data(), 'coagulation.homocysteine', 8); add(d, 'vitamins.folate', 25);
    paths.forEach(path => add(d, path, 0)); values.push(score(d, 'oneCarbonCoherence').score);
  }
  expect(new Set(values).size).toBe(1);
});

it('preserves discordant alternatives without increasing the family budget', () => {
  const d = add(data(), 'coagulation.homocysteine', 8); add(d, 'vitamins.folate', 25);
  add(d, 'vitamins.activeB12', 100); add(d, 'vitamins.vitaminB12', 0);
  const s = score(d, 'oneCarbonCoherence');
  expect(item(s, 'activeB12').effectiveWeight + item(s, 'b12').effectiveWeight).toBeCloseTo(1.15);
  expect(s.attention).toContain('B12'); expect(s.score).toBeLessThan(100);
});

it('WBC alone cannot create an immune panel or whole-body overview', () => {
  const d = add(data(), 'hematology.wbc', 6);
  expect(score(d, 'immuneCellBalance').score).toBeNull();
  const overview = score(d, 'biologicalCoherence'); expect(overview.score).toBeNull(); expect(overview.rawScore).toBeNull();
});

it('keeps a useful sparse domain visible without a premature overview or historical fallback', () => {
  const d = add(data(), 'lipids.apoB', .7);
  const overview = score(d, 'biologicalCoherence');
  expect(overview.score).toBeNull(); expect(overview.available).toHaveLength(1); expect(overview.historicalSnapshot).toBeUndefined();
  expect(overview.anchorWarning).toContain('3 domains');
  expect(score(d, 'cardiovascularLipoprotein').overviewMembership.label).toBe('Ready for overview');
});

it('uses TSH and FT4 as the core, keeping FT3 results and exceptions additional', () => {
  const d = add(data(), 'thyroid.tsh', 1.5); add(d, 'thyroid.ft4', 16);
  const before = score(d, 'thyroidCoherence'); add(d, 'thyroid.ft3', 50);
  const after = score(d, 'thyroidCoherence');
  expect(before.coreTotal).toBe(2); expect(after.score).toBe(before.score);
  expect(item(after, 'ft3').core).toBe(false); expect(after.attention).toContain('T3');
});

it('ApoA1-related ratios cannot dilute an unfavorable ApoB core result', () => {
  const d = add(data(), 'lipids.apoB', 2, { refMin: 0, refMax: 1 });
  const before = score(d, 'cardiovascularLipoprotein'); add(d, 'calculatedRatios.apoBapoAIRatio', .3);
  const after = score(d, 'cardiovascularLipoprotein'); expect(after.score).toBe(before.score); expect(after.coreTotal).toBe(1);
});

it('derives non-HDL from the same draw and preserves the displayed-unit projection', () => {
  const d = add(data(), 'lipids.cholesterol', 5); add(d, 'lipids.hdl', 1.4); add(d, 'lipids.apoB', .8);
  const eu = item(score(d, 'cardiovascularLipoprotein'), 'nonHdl'); expect(eu.canonicalValue).toBeCloseTo(3.6);
  const projected = structuredClone(d); applyUnitConversion(projected, 'US');
  const us = item(score(projected, 'cardiovascularLipoprotein'), 'nonHdl');
  expect(us.partial).toBe(eu.partial); expect(us.canonicalValue).toBeCloseTo(3.6); expect(us.unit).toBe('mg/dl'); expect(us.value).toBeCloseTo(139.212);
});

it('never derives non-HDL across unmatched draws', () => {
  const d = add(data(), 'lipids.cholesterol', 5); add(d, 'lipids.hdl', 1.4, { singleDate: '2026-08-01' });
  expect(item(score(d, 'cardiovascularLipoprotein'), 'nonHdl')).toBeUndefined();
});

it('requires a specimen-specific lab range for non-serum cortisol', () => {
  const d = add(data(), 'hormones.cortisol', 10, { specimen: 'saliva', unit: 'nmol/l', refMin: 5, refMax: 15 }); add(d, 'hormones.dheaS', 5);
  expect(item(score(d, 'stressResilience'), 'cortisol').profileContextOnly).toBe(true);
  d.categories.hormones.markers.cortisol.referenceRangeSource = 'import';
  const s = score(d, 'stressResilience'); expect(item(s, 'cortisol').partial).toBe(100); expect(s.score).not.toBeNull();
  expect(scoreLine(s)).toContain('[saliva]');
  state.rangeMode = 'optimal'; expect(item(score(d, 'stressResilience'), 'cortisol').partial).toBe(100);
});

it('retains a supplied serum range and rejects a mismatched collection-range time', () => {
  const d = add(data(), 'hormones.cortisol', 150, { refMin: 100, refMax: 200, referenceRangeSource: 'import' }); add(d, 'hormones.dheaS', 5);
  expect(item(score(d, 'stressResilience'), 'cortisol').range).toEqual({ min: 100, max: 200 });
  d.categories.hormones.markers.cortisol.referenceSampleTime = '16:00';
  expect(score(d, 'stressResilience').score).toBeNull();
});

it('does not inject a generic cortisol range over imported ranges in the active-data pipeline', () => {
  state.importedData = { entries: [{ date: '2026-09-01', sampleTime: '08:00', markers: { 'hormones.cortisol': 150 } }], refOverrides: { 'hormones.cortisol': { refMin: 100, refMax: 200, refSource: 'import' } } };
  invalidateActiveDataCache(); const d = getActiveData();
  expect(d.categories.hormones.markers.cortisol.contextRefRanges).toBeUndefined();
});

it('keeps late male testosterone interpretable but visibly limited', () => {
  const d = add(data(), 'hormones.testosterone', 15); add(d, 'proteins.albumin', 45);
  d.entryContextByDate['2026-09-01'].sampleTime = '16:00';
  const s = score(d, 'anabolicRecoverySignal'); expect(s.contextLimited).toBe(true); expect(s.flags.join(' ')).toContain('morning window');
});

it('does not invent endogenous hormone scores from therapy or absent sex context', () => {
  const d = add(data(), 'hormones.testosterone', 15); add(d, 'hormones.lh', 4); add(d, 'proteins.albumin', 45);
  expect(score(d, 'hormoneAxis', { ...profile, hormoneTherapy: true }).score).toBeNull();
  expect(score(d, 'anabolicRecoverySignal', { ageYears: 38 }).score).toBeNull();
});

it('does not equate progesterone with an estradiol core route', () => {
  const d = add(data(), 'hormones.progesterone', 15, { phaseRange: { min: 10, max: 50 }, phaseRefRanges: [{ min: 10, max: 50 }] });
  add(d, 'hormones.lh', 4, { phaseRefRanges: [{ min: 1, max: 10 }] });
  expect(score(d, 'hormoneAxis', { sex: 'female', ageYears: 38 }).score).toBeNull();
});

it('keeps a postmenopause panel contextual rather than scoring generic cycling ranges', () => {
  const d = add(data(), 'hormones.estradiol', 50); add(d, 'hormones.lh', 20); add(d, 'hormones.fsh', 40);
  const s = score(d, 'hormoneAxis', { sex: 'female', ageYears: 60, menopauseStatus: 'postmenopause' });
  expect(s.score).toBeNull(); expect(s.available).toHaveLength(3); expect(s.flags.join(' ')).toContain('postmenopause');
});

it('a single microbial metabolite cannot establish a complete Gut panel', () => {
  const s = score(add(data(), 'oatMicrobial.arabinose', 10), 'gutImmuneSignal');
  expect(s.score).toBeNull(); expect(s.coverage).toBe(.5); expect(s.panelLabel).toBe('Exploratory urine metabolites');
});

it('keeps stool and microbial routes explicit and never averages their core scores together', () => {
  const d = add(data(), 'oatMicrobial.arabinose', 10); add(d, 'oatMicrobial.hphpa', 30);
  expect(score(d, 'gutImmuneSignal').coreTotal).toBe(2);
  add(d, 'stool.calprotectin', 500);
  const s = score(d, 'gutImmuneSignal'); expect(s.panelLabel).toBe('Stool inflammation'); expect(s.score).toBe(0); expect(s.coreTotal).toBe(1);
  expect(item(s, 'arabinose').profileContextOnly).toBe(true);
});

it('cannot join urine lactate and plasma pyruvate into an Energy panel', () => {
  const d = add(data(), 'oatMetabolic.lactic', 10); add(d, 'biochemistry.pyruvate', .08, { refMin: .03, refMax: .12, unit: 'mmol/l', specimen: 'plasma' });
  const s = score(d, 'cellularEnergyCoherence'); expect(s.score).toBeNull(); expect(s.coreCovered).toBe(1);
  expect(s.available).toHaveLength(2);
});

it('selects a complete same-draw Energy panel and retains a newer unmatched result', () => {
  const d = data(); d.dates = ['2026-08-01', '2026-09-01'];
  add(d, 'oatMetabolic.lactic', 10, { values: [10, 50] }); add(d, 'oatMetabolic.pyruvic', 3, { values: [3, null] });
  const s = score(d, 'cellularEnergyCoherence'); expect(s.score).not.toBeNull();
  expect(item(s, 'lactate').date).toBe('2026-08-01'); expect(item(s, 'lactateUnpaired').profileContextOnly).toBe(true);
});

it('flags low-albumin total calcium and accepts ionized calcium without averaging it with total', () => {
  const d = add(data(), 'vitamins.vitaminD', 90); add(d, 'electrolytes.calciumTotal', 2.4); add(d, 'electrolytes.phosphorus', 1.1); add(d, 'proteins.albumin', 20);
  expect(score(d, 'boneMineralSignal').scoreConfidenceLabel).toBe('Needs context');
  add(d, 'electrolytes.calciumIonized', 1.2);
  const s = score(d, 'boneMineralSignal'); expect(item(s, 'calcium').profileContextOnly).toBe(true); expect(s.contextLimited).toBe(false);
  expect(s.coreTotal).toBe(3); expect(s.coverage).toBe(1);
});

it('preserves separate serum/urine/RBC marker identities and finds ordinary selenium', () => {
  const d = add(data(), 'electrolytes.selenium', 1.3); add(d, 'nutrientElements.selenium', 80);
  expect(score(d, 'redoxStress').available.map(i => i.key)).toEqual(['selenium', 'seleniumUrine']);
  add(d, 'electrolytes.magnesium', .9); add(d, 'electrolytes.magnesiumRBC', 2.1);
  expect(score(d, 'nerveMuscleSignal').available.map(i => i.key)).toEqual(expect.arrayContaining(['magnesium', 'magnesiumRBC']));
});

it('AI receives resolved core gaps, specimen identity and exact contribution facts', () => {
  const d = add(data(), 'coagulation.homocysteine', 20); add(d, 'vitamins.activeB12', 100); add(d, 'vitamins.folate', 25);
  const s = score(d, 'oneCarbonCoherence'); const prompt = scoreLine(s);
  expect(prompt.split('Missing inputs:')[1]).not.toContain('Total vitamin B12'); expect(prompt).toContain('core share'); expect(prompt).toContain('points');
  expect(buildBiologyScoresAIContext(d, { profileContext: profile, includeScoreSections: true })).not.toMatch(/missing: [^\n]*Total vitamin B12/);
});

it('the planner excludes contextual-only shopping and ranks useful existing dimensions first', () => {
  const scores = computeBiologyScores(data(), { profileContext: profile });
  const p = buildBiologyScoreCoveragePlannerModel(scores.slice(1), scores[0]);
  const keys = [...p.coreShortlist, ...p.optionalUpgrades, ...p.advancedDepth].map(i => i.key);
  expect(keys).not.toEqual(expect.arrayContaining(['reverseT3'])); expect(keys).not.toContain('dDimer'); expect(keys).not.toContain('zonulin'); expect(keys).not.toContain('nfl');
  expect(p.optionalUpgrades[0].key).toBe('uacr');
});

it('zero dials, specimen labels and mobile table cues remain visible in rendered detail', () => {
  const d = add(data(), 'lipids.apoB', 2, { refMin: 0, refMax: 1, specimen: 'serum' });
  const html = renderScoreDetail(score(d, 'cardiovascularLipoprotein'));
  expect(html).toContain('biology-score-dial-zero'); expect(html).toContain('serum'); expect(html).toContain('scroll sideways');
});

it('shared assessments cover all views while assay changes invalidate the actual evidence', () => {
  const d = add(data(), 'lipids.apoB', .8, { specimen: 'serum' });
  const s = computeBiologyScoreAssessments(d).find(s => s.id === 'cardiovascularLipoprotein');
  state.importedData.biologyScoreAI = { [s.id]: { summary: 'Saved summary.', text: 'Saved comparison.', materialFingerprint: getScoreAIMaterialKey(s), coveredMaterials: s.aiViews.map(v => v.material) } };
  expect(hasCurrentScoreAIAssessment(s)).toBe(true);
  d.categories.lipids.markers.apoB.method = 'Changed method';
  const changed = computeBiologyScoreAssessments(d).find(s => s.id === 'cardiovascularLipoprotein');
  expect(hasCurrentScoreAIAssessment(changed)).toBe(false);
});

it('reported combined eGFR survives reload and unit projection with its own lab range', () => {
  state.importedData = { entries: [{ date: '2026-09-01', markers: { 'biochemistry.egfrCombined': 1.8, 'electrolytes.sodium': 140, 'electrolytes.potassium': 4.2 } }], refOverrides: { 'biochemistry.egfrCombined': { refMin: 1.5, refMax: 2.5, refSource: 'import' } } };
  for (const unit of ['EU', 'US', 'ANZ']) {
    state.unitSystem = unit; state.importedData = JSON.parse(JSON.stringify(state.importedData)); invalidateActiveDataCache();
    const s = score(getActiveData(), 'fluidFiltrationCoherence');
    expect(s.score).toBe(100); expect(item(s, 'egfrCombined').canonicalValue).toBe(1.8);
    expect(item(s, 'egfrCombined').value).toBeCloseTo(unit === 'EU' ? 1.8 : 108);
  }
});

it('imported cortisol assay metadata and reference exceptions survive the active-data pipeline', () => {
  state.importedData = { entries: [{ date: '2026-09-01', sampleTime: '08:00', markers: { 'hormones.cortisol': 150, 'hormones.dheaS': 5 } }], customMarkers: { 'hormones.cortisol': { specimen: 'saliva', method: 'Lab assay', referenceSampleTime: '08:00' } }, refOverrides: { 'hormones.cortisol': { refMin: 100, refMax: 200, refSource: 'import', optimalMin: 120, optimalMax: 140, optimalSource: 'custom' } } };
  state.rangeMode = 'optimal'; state.importedData = JSON.parse(JSON.stringify(state.importedData)); invalidateActiveDataCache();
  const s = score(getActiveData(), 'stressResilience'), cortisol = item(s, 'cortisol');
  expect(cortisol).toMatchObject({ specimen: 'saliva', method: 'Lab assay', referenceDirection: '', referenceRange: { min: 100, max: 200 }, range: { min: 120, max: 140 } });
  expect(cortisol.partial).toBeLessThan(100); expect(cortisol.profileContextOnly).toBe(false);
  expect(s.flags.some(f => /Cortisol is outside its reference/.test(f))).toBe(false);
});

it('same-draw thyroid discordance is explained without treating another date as feedback', () => {
  const d = add(data(), 'thyroid.ft4', 5); add(d, 'thyroid.tsh', 1.5);
  expect(score(d, 'thyroidCoherence').attention).toContain('FT4 is low without a raised TSH');
  d.dates.push('2026-09-10'); d.categories.thyroid.markers.tsh.values = [null, 1.5];
  expect(score(d, 'thyroidCoherence').flags.join(' ')).not.toContain('FT4 is low without a raised TSH');
});

it('male hormone feedback notes require interpretable results and remain absent on therapy', () => {
  const d = add(data(), 'hormones.testosterone', 3); add(d, 'hormones.lh', 15);
  expect(score(d, 'hormoneAxis').attention).toContain('Low testosterone with raised LH');
  expect(score(d, 'hormoneAxis', { ...profile, hormoneTherapy: true }).flags.join(' ')).not.toContain('increased pituitary drive');
});

it('liver notes distinguish ALP source, isolated bilirubin and recent training', () => {
  const d = add(data(), 'biochemistry.alt', .5); add(d, 'biochemistry.ast', .5); add(d, 'biochemistry.ggt', .5); add(d, 'biochemistry.alp', 4);
  expect(score(d, 'liverBileSignal').attention).toContain('ALP is high with GGT in range');
  d.categories.biochemistry.markers.alp.values = [1]; add(d, 'biochemistry.bilirubinTotal', 40);
  expect(score(d, 'liverBileSignal').attention).toContain('Bilirubin is high');
  d.categories.biochemistry.markers.ast.values = [2];
  expect(score(d, 'liverBileSignal', { ...profile, recentHardTraining: true }).flags.join(' ')).toContain('training can contribute to raised AST');
});

it('inflammation uses draw-specific illness context and calcium needs same-draw albumin', () => {
  const d = add(data(), 'proteins.hsCRP', 10); d.entryContextByDate['2026-09-01'].acuteIllness = true;
  expect(score(d, 'redoxStress').flags.join(' ')).toContain('acute inflammation snapshot');
  add(d, 'electrolytes.calciumTotal', 2.4); add(d, 'vitamins.vitaminD', 90); add(d, 'electrolytes.phosphorus', 1.1);
  d.dates.push('2026-09-10'); add(d, 'proteins.albumin', 45, { values: [null, 45] });
  expect(score(d, 'boneMineralSignal').flags.join(' ')).toContain('same-draw albumin');
});
