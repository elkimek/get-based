import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { computeBiologyScores, computeBiologyScoreView, computeBiologyScoreAssessments, getBiologyScoreMapping, SCORE_DEFINITIONS } from '../js/biology-scores.js';
import { getMarkerHit, assessScoreRecency } from '../js/biology-score-engine.js';
import { getScoreInputs } from '../js/biology-score-contract.js';
import { getScoreAIMaterialKey, hasCurrentScoreAIAssessment, readScoreAIAnswer, renderScoreAIAnswer, renderScoreAISummary, writeScoreAIAnswer, scoreAIAnswerNeedsRefresh } from '../js/biology-score-sections.js';
import { configureBiologyScoreAIDeps, scoreLine, generateBiologyScoreAIAnswer, generateBiologyScoreAIAnswers } from '../js/biology-score-ai.js';
import { getScorePresentation, renderScoreDetail, renderDashboardBiologicalCoherenceWidget } from '../js/biology-score-render.js';
import { buildBiologyScoreCoveragePlannerModel } from '../js/biology-score-coverage-planner.js';
import * as dataModule from '../js/data.js';
import { applyUnitConversion } from '../js/data.js';
import { MARKER_SCHEMA } from '../js/schema.js';
import { state } from '../js/state.js';
import { configureProfileContextLightDeps, getBiologyProfileContext } from '../js/profile-context.js';
import { renderBiologyScoreContextAI, applyBiologyScoreContextFlag, generateBiologyScoreContextReview, configureBiologyScoreContextAIDeps } from '../js/biology-score-context-ai.js';

const context = { sex: 'male', ageYears: 38 };
const dataset = () => ({ dates: ['2026-09-01'], categories: {} });
function add(data, path, value, overrides = {}) {
  const [category, key] = path.split('.');
  const schema = MARKER_SCHEMA[category]?.markers?.[key] || {};
  data.categories[category] ||= { markers: {} };
  data.categories[category].markers[key] = { ...schema, name: key, values: [value], ...overrides };
  return data;
}
const scores = (data, profileContext = context) => computeBiologyScores(data, { profileContext });
const score = (data, id, profileContext = context) => scores(data, profileContext).find(s => s.id === id);
function thyroid(tsh = 1.5, ft3 = 4.8, ft4 = 16) {
  const d = add(dataset(), 'thyroid.tsh', tsh);
  add(d, 'thyroid.ft3', ft3); add(d, 'thyroid.ft4', ft4); return d;
}
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-15T12:00:00Z'));
  state.rangeMode = 'reference'; state.profileSex = 'male'; state.profileDob = '1987-11-22';
  state.currentProfile = 'biology-integrity'; state.importedData = { entries: [], diagnoses: { flags: {} } };
});
afterEach(() => vi.restoreAllMocks());

describe('Biology Scores integrity', () => {
  it('keeps all six reported scores current across live Light estimate drift, including previously saved keys', () => {
    const previous = configureProfileContextLightDeps({ rollingVitaminDIU: null, rollingChannelTotals: null });
    const ids = ['cardiovascularLipoprotein', 'redoxStress', 'anabolicRecoverySignal', 'hormoneAxis', 'stressResilience', 'boneMineralSignal'];
    state.importedData.sunSessions = [{ endedAt: Date.now() }];
    try {
      const cold = computeBiologyScores(thyroid());
      configureProfileContextLightDeps({ rollingVitaminDIU: () => 1800, rollingChannelTotals: () => ({ circadian: 250 }) });
      const warm = computeBiologyScores(thyroid());
      state.importedData.biologyScoreAI = {};
      for (const id of ids) {
        const s = warm.find(s => s.id === id);
        expect(getScoreAIMaterialKey(cold.find(s => s.id === id))).not.toBe(getScoreAIMaterialKey(s));
        // Simulate a record written before dose normalization was introduced.
        const legacy = JSON.parse(getScoreAIMaterialKey(s));
        legacy.flags = [...s.flags].sort();
        state.importedData.biologyScoreAI[id] = { summary: 'Saved summary.', text: 'Saved explanation.', materialFingerprint: JSON.stringify(legacy) };
      }
      configureProfileContextLightDeps({ rollingVitaminDIU: () => 1801 });
      for (const s of computeBiologyScores(thyroid()).filter(s => ids.includes(s.id))) {
        expect(getScoreAIMaterialKey(s)).toBe(getScoreAIMaterialKey(warm.find(item => item.id === s.id)));
        expect(scoreAIAnswerNeedsRefresh(s)).toBe(false);
        expect(renderScoreAISummary(s)).not.toContain('refresh needed');
        expect(renderScoreAIAnswer(s)).not.toContain('biology-score-ai-stale');
      }
      configureProfileContextLightDeps({ rollingVitaminDIU: () => 5000 });
      for (const s of computeBiologyScores(thyroid()).filter(s => ids.includes(s.id))) expect(scoreAIAnswerNeedsRefresh(s)).toBe(true);
    } finally { configureProfileContextLightDeps(previous); }
  });

  it('saves independently authored card and detailed explanations without changing the score', async () => {
    const s = score(thyroid(), 'thyroidCoherence');
    const call = vi.fn(async () => ({ text: JSON.stringify({ summary: 'The markers broadly agree. Read them with collection context.', explanation: '## Main signal\n**TSH** contributes to the core pattern.\n\n## Next check\nReview collection dates.' }) }));
    const previous = configureBiologyScoreAIDeps({ callClaudeAPI: call, hasAIProvider: () => true, isAIPaused: () => false });
    vi.spyOn(dataModule, 'saveImportedDataForProfile').mockResolvedValue(true);
    try {
      const value = s.score;
      const answer = await generateBiologyScoreAIAnswer(s);
      await writeScoreAIAnswer(s, answer);
      expect(s.score).toBe(value);
      expect(renderScoreAISummary(s)).toContain(answer.summary);
      expect(renderScoreAISummary(s)).not.toContain('TSH');
      expect(renderScoreAISummary(s)).not.toContain('Read explanation');
      expect(renderScoreAIAnswer(s)).toContain('<strong>TSH</strong>');
      expect(renderScoreAIAnswer(s)).not.toContain(answer.summary);
      expect(call).toHaveBeenCalledTimes(1);
    } finally { configureBiologyScoreAIDeps(previous); }
  });
  it.each(['Too long. '.repeat(30), 'An unfinished summary…', 'An unfinished thought'])('keeps usable paid answers despite cosmetic noncompliance (%s)', async summary => {
    const answer = { summary, explanation: '## Context\nInterpret the markers together.' };
    const call = vi.fn(async () => ({ text: JSON.stringify(answer) }));
    const previous = configureBiologyScoreAIDeps({ callClaudeAPI: call, hasAIProvider: () => true, isAIPaused: () => false });
    try {
      expect(await generateBiologyScoreAIAnswer(score(thyroid(), 'thyroidCoherence'))).toMatchObject({ summary: summary.trim(), text: answer.explanation });
      expect(call).toHaveBeenCalledTimes(1);
    } finally { configureBiologyScoreAIDeps(previous); }
  });
  it('bounds malformed gateway retries and preserves the previous explanation', async () => {
    const s = score(thyroid(), 'thyroidCoherence');
    state.importedData.biologyScoreAI = { [s.id]: { text: 'Saved earlier.' } };
    const call = vi.fn(async () => ({ text: 'invalid' }));
    const previous = configureBiologyScoreAIDeps({ callClaudeAPI: call, hasAIProvider: () => true, isAIPaused: () => false });
    try {
      await expect(generateBiologyScoreAIAnswer(s)).rejects.toThrow('incomplete');
      expect(call).toHaveBeenCalledTimes(1);
      expect(renderScoreAIAnswer(s)).toContain('Saved earlier.');
      expect(renderScoreAISummary(s)).not.toContain('Saved earlier.');
      expect(renderScoreAISummary(s)).toContain('Refresh to add a short, complete insight.');
    } finally { configureBiologyScoreAIDeps(previous); }
  });
  it('limits female context to female profiles in controls, suggestions, and scoring', async () => {
    state.importedData.diagnoses.flags.postmenopause = true;
    state.importedData.menstrualCycle = { cycleStatus: 'postmenopause' };
    state.importedData.biologyScoreContextAI = { suggestions: [{ flag: 'postmenopause', confidence: 'high' }] };
    expect(renderBiologyScoreContextAI()).not.toContain('postmenopause');
    expect(getBiologyProfileContext().menopauseStatus).toBeNull();
    expect(getBiologyProfileContext().cycleStatus).toBeNull();
    state.importedData.diagnoses.flags.postmenopause = false;
    await applyBiologyScoreContextFlag('postmenopause');
    expect(state.importedData.diagnoses.flags.postmenopause).toBe(false);
    state.profileSex = 'female';
    expect(renderBiologyScoreContextAI()).toContain('data-biology-context-flag="postmenopause"');
    expect(getBiologyProfileContext().menopauseStatus).toBe('postmenopause');
  });
  it('does not accept female-only AI flag suggestions for male profiles', async () => {
    const call = vi.fn(async () => ({ text: '{"summary":"Context reviewed","suggestions":[{"flag":"postmenopause","value":true},{"flag":"lowMuscleMass","value":true}]}' }));
    const previous = configureBiologyScoreContextAIDeps({ callClaudeAPI: call, hasAIProvider: () => true, isAIPaused: () => false });
    try {
      const review = await generateBiologyScoreContextReview(dataset());
      expect(review.suggestions.map(s => s.flag)).toEqual(['lowMuscleMass']);
      expect(call.mock.calls[0][0].system).not.toContain('postmenopause');
    } finally { configureBiologyScoreContextAIDeps(previous); }
  });
  it.each(['reference', 'optimal'])('keeps all marker fits and scores invariant in EU/ANZ/US (%s)', rangeMode => {
    state.rangeMode = rangeMode;
    const d = dataset();
    for (const def of SCORE_DEFINITIONS.slice(1)) for (const input of getScoreInputs(def)) {
      const path = Array.isArray(input.paths) ? input.paths[0] : input.paths;
      const [cat, key] = path.split('.'); const schema = MARKER_SCHEMA[cat]?.markers?.[key];
      if (schema?.refMax > 0) add(d, path, schema.refMax * 1.12);
    }
    const variants = ['EU', 'ANZ', 'US'].map(unitProfile => {
      const copy = structuredClone(d); applyUnitConversion(copy, unitProfile);
      return scores(copy).map(s => ({ id: s.id, score: s.score, coverage: s.coverage,
        fits: s.available.map(i => [i.key, i.partial]) }));
    });
    expect(variants[1]).toEqual(variants[0]); expect(variants[2]).toEqual(variants[0]);
  });
  it('does not call extreme thyroid values a favorable pattern or score a conversion ratio', () => {
    const extreme = score(thyroid(.01, 50, 150), 'thyroidCoherence');
    expect(extreme.score).toBeLessThan(35); expect(extreme.attention).toMatch(/reference range/);
    const a = score(thyroid(1.5, 4.8, 4.8 / .35), 'thyroidCoherence');
    const b = score(thyroid(1.5, 4.8, 4.8 / .350001), 'thyroidCoherence');
    expect(Math.abs(a.score - b.score)).toBeLessThanOrEqual(1);
    expect(a.descriptiveRatio.value).toBe('0.350');
    expect(a.available.find(i => i.key === 'ft4').label).toBe('Free T4');
  });
  it('keeps the affordable core complete without extra tests, and extras cannot dilute low ferritin', () => {
    const d = add(dataset(), 'iron.ferritin', 5);
    add(d, 'iron.transferrinSat', 30); add(d, 'hematology.hemoglobin', 150);
    const baseline = score(d, 'ironHandling');
    const def = SCORE_DEFINITIONS.find(i => i.id === 'ironHandling');
    for (const input of getScoreInputs(def).filter(i => !i.core)) {
      const path = Array.isArray(input.paths) ? input.paths[0] : input.paths;
      add(d, path, 1, { refMin: 0, refMax: 2 });
    }
    const expanded = score(d, 'ironHandling');
    expect(expanded.score).toBe(baseline.score); expect(baseline.coverage).toBe(1);
    expect(expanded.attention).toMatch(/Low ferritin/);
    expect(expanded.tone).not.toMatch(/excellent|good/);
    expect(expanded.optionalAvailable).toBeGreaterThan(0);
    expect(buildBiologyScoreCoveragePlannerModel([expanded], null).coreShortlist).toEqual([]);
  });
  it('treats B12 alternatives as a single core requirement', () => {
    const d = add(dataset(), 'coagulation.homocysteine', 8);
    add(d, 'vitamins.folate', 20); add(d, 'vitamins.vitaminB12', 350);
    const s = score(d, 'oneCarbonCoherence');
    expect(s.coverage).toBe(1); expect(s.coreTotal).toBe(3);
    expect(buildBiologyScoreCoveragePlannerModel([s], null).coreShortlist).toEqual([]);
  });
  it('requires filtration even with perfect electrolytes and carries low-muscle context into overview', () => {
    const d = add(dataset(), 'biochemistry.creatinine', 35);
    add(d, 'biochemistry.egfr', 2); add(d, 'electrolytes.sodium', 140); add(d, 'electrolytes.potassium', 4.2);
    const pc = { ...context, lowMuscleMass: true, lowMuscleReason: 'Low muscle mass' };
    let all = scores(d, pc);
    expect(all.find(i => i.id === 'fluidFiltrationCoherence').score).toBeNull();
    expect(all[0].available.some(i => i.key === 'kidney')).toBe(false);
    add(d, 'biochemistry.gfrCystatin', 1.7, { refMin: 1.2, refMax: 2 });
    all = scores(d, pc);
    const kidney = all.find(i => i.id === 'fluidFiltrationCoherence');
    expect(kidney.coreCovered).toBe(3); expect(kidney.score).toBe(100);
    expect(all[0].available.find(i => i.key === 'kidney').partial).toBe(kidney.score);
  });
  it('requires specialty anchors instead of manufacturing a stress score from routine markers', () => {
    const d = add(dataset(), 'biochemistry.glucose', 5);
    add(d, 'proteins.hsCRP', 1); add(d, 'thyroid.tsh', 1.5);
    expect(score(d, 'stressResilience').score).toBeNull();
  });
  it('does not invent sunlight or genetic numeric targets', () => {
    const d = add(dataset(), 'vitamins.vitaminD', 80);
    add(d, 'coagulation.homocysteine', 10);
    const baseline = scores(d); const modified = scores(d, { ...context, lowSunlightExposure: true, genetic: { methylationRisk: true } });
    for (const id of ['boneMineralSignal', 'oneCarbonCoherence']) {
      expect(modified.find(s => s.id === id).score).toBe(baseline.find(s => s.id === id).score);
    }
  });
  it('uses reference alerts separately from selected wellness targets', () => {
    state.rangeMode = 'optimal';
    const d = add(dataset(), 'electrolytes.potassium', 3.8, { refMin: 3.5, refMax: 5.1, optimalMin: 4, optimalMax: 4.8 });
    expect(score(d, 'fluidFiltrationCoherence').flags.join(' ')).not.toMatch(/outside its reference range/);
  });
  it('keeps old optional antibodies visible without hiding a fresh thyroid score', () => {
    const d = thyroid(); add(d, 'thyroid.tpoAb', 10, { singleDate: '2025-01-01', refMax: 34 });
    const s = score(d, 'thyroidCoherence');
    expect(s.score).not.toBeNull(); expect(s.recencyStatus).toBe('fresh');
    expect(s.available.find(i => i.key === 'tpoAb').profileContextOnly).toBe(true);
  });
  it.each(['', '2026-12-01', '2026-02-31'])('does not classify invalid or future core dates as current: %s', date => {
    const d = thyroid(); d.dates = [date];
    expect(score(d, 'thyroidCoherence').score).toBeNull();
    expect(assessScoreRecency([{ label: 'TSH', date }]).blocked).toBe(true);
  });
  it('chooses the newest alias and never derives ratios across separate draws', () => {
    const d = add(dataset(), 'thyroid.tpoAb', 10, { singleDate: '2025-01-01' });
    add(d, 'thyroid.antiTPO', 20, { singleDate: '2026-09-01' });
    expect(getMarkerHit(d, ['thyroid.tpoAb', 'thyroid.antiTPO']).value).toBe(20);
    add(d, 'lipids.cholesterol', 5, { singleDate: '2025-01-01' }); add(d, 'lipids.hdl', 1.5);
    expect(getMarkerHit(d, 'calculatedRatios.cholHdlRatio')).toBeNull();
  });
  it('keeps overview domain weights independent of additional coverage and all five specialty scores outside baseline', () => {
    const all = scores(thyroid());
    expect(all[0].available.length + all[0].missing.length).toBe(12);
    expect(all[0].available[0].effectiveWeight).toBe(all[0].available[0].weight);
    expect(all[0].coverage).toBeLessThan(1); expect(all[0].scoreConfidence).not.toBe('high');
  });
  it('tracks context, scoring ranges, and algorithm state in explanations without rendering mutations', () => {
    const s = score(thyroid(), 'thyroidCoherence');
    const key = getScoreAIMaterialKey(s); const before = JSON.stringify(s);
    renderScoreDetail(s); expect(JSON.stringify(s)).toBe(before);
    expect(getScoreAIMaterialKey({ ...s, available: [...s.available].reverse() })).toBe(key);
    for (const modified of [
      { ...s, profileContext: { ...context, hormoneTherapy: true } },
      { ...s, available: s.available.map(i => ({ ...i, range: { min: 1, max: 2 } })) },
    ]) expect(getScoreAIMaterialKey(modified)).not.toBe(key);
    state.importedData.biologyScoreAI = { [s.id]: { text: 'Old explanation', materialFingerprint: key } };
    expect(renderScoreAIAnswer({ ...s, profileContext: {} })).toContain('biology-score-ai-stale');
  });
  it('ignores unrelated rolling telemetry and storage metadata in the explanation basis', () => {
    const s = score(thyroid(), 'thyroidCoherence');
    const first = { ...s, profileContext: { ...s.profileContext, light: { vitD7: 103.1 }, body: { hrv7: 40 } }, available: s.available.map(i => ({ ...i, entryContext: { updatedAt: 1 }, source: 'import-a' })) };
    const next = { ...s, profileContext: { ...s.profileContext, light: { vitD7: 104.3 }, body: { hrv7: 41 } }, available: s.available.map(i => ({ ...i, entryContext: { updatedAt: 2 }, source: 'import-b' })) };
    expect(getScoreAIMaterialKey(first)).toBe(getScoreAIMaterialKey(next));
    expect(getScoreAIMaterialKey({ ...next, flags: ['New interpretation limit'] })).not.toBe(getScoreAIMaterialKey(first));
  });
  it('accepts same-profile hydration and serializes concurrent explanation saves', async () => {
    const original = state.importedData;
    const first = score(thyroid(), 'thyroidCoherence');
    const second = score(thyroid(), 'metabolicFlexibility');
    state.importedData = structuredClone(original);
    state.importedData.notes = ['A note written while AI was running'];
    const save = vi.spyOn(dataModule, 'saveImportedDataForProfile').mockResolvedValue(true);
    await Promise.all([
      writeScoreAIAnswer(first, { summary: 'Thyroid insight.', text: 'Thyroid details.' }, state.currentProfile, original),
      writeScoreAIAnswer(second, { summary: 'Metabolic insight.', text: 'Metabolic details.' }, state.currentProfile, original),
    ]);
    const persisted = save.mock.calls.at(-1)[1];
    expect(Object.keys(persisted.biologyScoreAI)).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(persisted.notes).toEqual(state.importedData.notes);
    expect(renderScoreAIAnswer(first)).not.toContain('biology-score-ai-stale');
  });
  it('retains distinct range explanations and reuses identical evidence after serialization', async () => {
    vi.spyOn(dataModule, 'saveImportedDataForProfile').mockResolvedValue(true);
    state.dateRangeFilter = 'all';
    const data = thyroid();
    const reference = computeBiologyScoreView(data, { rangeMode: 'reference', dateRangeFilter: 'all' }).find(s => s.id === 'thyroidCoherence');
    const optimal = computeBiologyScoreView(data, { rangeMode: 'optimal', dateRangeFilter: 'all' }).find(s => s.id === reference.id);
    expect(state.rangeMode).toBe('reference');
    expect(state.dateRangeFilter).toBe('all');
    await writeScoreAIAnswer(reference, { summary: 'Reference summary.', text: 'Reference details.' });
    await writeScoreAIAnswer(optimal, { summary: 'Optimal summary.', text: 'Optimal details.' });
    state.importedData = JSON.parse(JSON.stringify(state.importedData));
    for (const window of ['all', '1y', '6m', '3m']) {
      for (const mode of ['reference', 'optimal', 'both']) {
        const current = computeBiologyScoreView(data, { rangeMode: mode, dateRangeFilter: window }).find(s => s.id === reference.id);
        expect(scoreAIAnswerNeedsRefresh(current)).toBe(false);
        expect(readScoreAIAnswer(current).summary).toBe(mode === 'reference' ? 'Reference summary.' : 'Optimal summary.');
      }
    }
    const changed = { ...optimal, score: 1 };
    expect(scoreAIAnswerNeedsRefresh(changed)).toBe(true);
    await writeScoreAIAnswer(changed, { summary: 'Changed summary.', text: 'Changed details.' });
    expect(readScoreAIAnswer(optimal).summary).toBe('Optimal summary.');
    expect(readScoreAIAnswer(changed).summary).toBe('Changed summary.');
  });
  it('authors one shared interpretation using explicit evidence from both range modes', async () => {
    vi.spyOn(dataModule, 'saveImportedDataForProfile').mockResolvedValue(true);
    state.dateRangeFilter = 'all';
    const assessment = computeBiologyScoreAssessments(thyroid()).find(s => s.id === 'thyroidCoherence');
    const prompt = scoreLine(assessment);
    expect(prompt).toContain('COMPARISON SCOPE');
    expect(prompt).toContain('optimal / all');
    expect(prompt).toContain('reference / all');
    expect(prompt).toContain('optimal / 3m');
    expect(prompt.match(/Model:/g)).toHaveLength(1);
    await writeScoreAIAnswer(assessment, { summary: 'Reference fits can differ from tighter optimal targets.', text: 'The range comparison covers all supplied windows.' });
    expect(hasCurrentScoreAIAssessment(assessment)).toBe(true);
    for (const view of assessment.aiViews) {
      expect(scoreAIAnswerNeedsRefresh(view.score)).toBe(false);
      expect(readScoreAIAnswer(view.score).summary).toBe('Reference fits can differ from tighter optimal targets.');
    }
    const changed = computeBiologyScoreAssessments(thyroid(14)).find(s => s.id === assessment.id);
    expect(hasCurrentScoreAIAssessment(changed)).toBe(false);
    expect(scoreAIAnswerNeedsRefresh(changed)).toBe(true);
  });
  it('keeps legacy range-specific answers without automatically purchasing a shared upgrade', async () => {
    vi.spyOn(dataModule, 'saveImportedDataForProfile').mockResolvedValue(true);
    state.dateRangeFilter = 'all';
    const data = thyroid();
    state.rangeMode = 'optimal';
    await writeScoreAIAnswer(computeBiologyScoreView(data, { rangeMode: 'optimal', dateRangeFilter: 'all' }).find(s => s.id === 'thyroidCoherence'), { summary: 'Existing optimal insight.', text: 'Existing optimal details.' });
    state.rangeMode = 'reference';
    const assessment = computeBiologyScoreAssessments(data).find(s => s.id === 'thyroidCoherence');
    expect(scoreAIAnswerNeedsRefresh(assessment)).toBe(true);
    expect(hasCurrentScoreAIAssessment(assessment)).toBe(true);
    // Explicit upgrade replaces the old view-dependent reading across modes.
    await writeScoreAIAnswer(assessment, { summary: 'Combined comparison insight.', text: 'Combined comparison details.' });
    expect(assessment.aiViews.every(view => readScoreAIAnswer(view.score).summary === 'Combined comparison insight.')).toBe(true);
  });
  it('merges alternate views from backups and sync while bounding old evidence', async () => {
    const { mergeBiologyScoreAIRecords, biologyAIRecords, MAX_BIOLOGY_AI_VARIANTS } = await import('../js/biology-score-persistence.js');
    const answer = (key, updatedAt) => ({ materialFingerprint: key, summary: key, text: key, updatedAt });
    const local = mergeBiologyScoreAIRecords(answer('optimal', 3), answer('reference', 2));
    const remote = mergeBiologyScoreAIRecords(answer('reference', 4), answer('older-window', 1));
    const merged = mergeBiologyScoreAIRecords(local, remote);
    expect(biologyAIRecords(merged).map(r => r.materialFingerprint)).toEqual(['reference', 'optimal', 'older-window']);
    expect(merged.updatedAt).toBe(4);
    expect(JSON.stringify(mergeBiologyScoreAIRecords(merged, remote))).toBe(JSON.stringify(merged));
    const bounded = mergeBiologyScoreAIRecords(...Array.from({ length: 30 }, (_, i) => answer(String(i), i)));
    expect(biologyAIRecords(bounded)).toHaveLength(MAX_BIOLOGY_AI_VARIANTS);
    expect(biologyAIRecords(bounded).every(r => !r.variants || r === bounded)).toBe(true);
  });
  it('generates a shared batch and reports missing entries without paid repair', async () => {
    const all = scores(thyroid()).slice(0, 3);
    const answer = { summary: 'The pattern needs context. Check collection dates.', explanation: '## Context\nUse the supplied core markers.' };
    const call = vi.fn().mockResolvedValueOnce({ text: JSON.stringify({ [all[0].id]: answer, [all[1].id]: answer }) }).mockResolvedValueOnce({ text: JSON.stringify({ [all[2].id]: answer }) });
    const previous = configureBiologyScoreAIDeps({ callClaudeAPI: call, hasAIProvider: () => true, isAIPaused: () => false });
    try {
      const result = await generateBiologyScoreAIAnswers(all, { automatic: true });
      expect(Object.keys(result.answers)).toHaveLength(2);
      expect(result.failedIds).toEqual([all[2].id]);
      expect(call.mock.calls[0][0].consentKind).toBe('automatic-insight');
      expect(call).toHaveBeenCalledTimes(1);
    } finally { configureBiologyScoreAIDeps(previous); }
  });
  it('retains successful batch answers without retrying the missing response', async () => {
    const all = scores(thyroid()).slice(0, 2);
    const answer = { summary: 'The markers need context.', explanation: '## Context\nCheck collection dates.' };
    const call = vi.fn().mockResolvedValueOnce({ text: JSON.stringify({ [all[0].id]: answer }) }).mockRejectedValueOnce(new Error('Gateway disconnected'));
    const previous = configureBiologyScoreAIDeps({ callClaudeAPI: call, hasAIProvider: () => true, isAIPaused: () => false });
    try {
      const result = await generateBiologyScoreAIAnswers(all);
      expect(result.answers[all[0].id].summary).toBe(answer.summary);
      expect(result.failedIds).toEqual([all[1].id]);
    } finally { configureBiologyScoreAIDeps(previous); }
  });
  it('refuses an explanation finishing in a different profile', async () => {
    const s = score(thyroid(), 'thyroidCoherence'); const original = state.importedData;
    state.currentProfile = 'another'; state.importedData = { entries: [] };
    await expect(writeScoreAIAnswer(s, 'Wrong destination', 'biology-integrity', original)).rejects.toThrow(/Profile changed/);
    expect(state.importedData.biologyScoreAI).toBeUndefined();
  });
  it('keeps all 19 scores, the rename, and a missing overview distinct from zero without AI gating', () => {
    const all = scores(dataset()); expect(all).toHaveLength(19);
    expect(all.find(i => i.id === 'fluidFiltrationCoherence').title).toBe('Kidney & Filtration');
    expect(all.some(i => /hydration/i.test(i.title))).toBe(false);
    const html = renderDashboardBiologicalCoherenceWidget({ data: dataset() }, scores);
    expect(html).toContain('db-hero-bio-num">—<small>'); expect(html).not.toContain('locked');
    expect(getBiologyScoreMapping().find(i => i.id === 'ironHandling').inputs.filter(i => i.core)).toHaveLength(3);
  });
  it('retains canonical precision through a filtered HbA1c display projection', () => {
    const d = add(dataset(), 'diabetes.hba1c', 32);
    d.dates = ['2026-01-01', '2026-09-01'];
    d.categories.diabetes.markers.hba1c.values = [32, 43.68];
    applyUnitConversion(d, 'US');
    d.dates = [d.dates[1]];
    d.categories.diabetes.markers.hba1c.values = [d.categories.diabetes.markers.hba1c.values[1]];
    expect(getMarkerHit(d, 'diabetes.hba1c').canonicalValue).toBe(43.68);
  });
  it('uses the same optimal range for a derived and reported HOMA-IR', () => {
    state.rangeMode = 'optimal';
    const d = add(dataset(), 'biochemistry.glucose', 5);
    add(d, 'diabetes.insulin', 9);
    const derived = getMarkerHit(d, 'diabetes.homaIR');
    add(d, 'diabetes.homaIR', 2);
    const reported = getMarkerHit(d, 'diabetes.homaIR');
    expect(derived.canonicalValue).toBe(reported.canonicalValue);
    expect(derived.range).toEqual(reported.range);
  });
  it('shows mixed core-domain dates instead of presenting a simultaneous overview', () => {
    const d = thyroid();
    for (const marker of Object.values(d.categories.thyroid.markers)) marker.singleDate = '2026-04-01';
    add(d, 'iron.ferritin', 100); add(d, 'iron.transferrinSat', 30); add(d, 'hematology.hemoglobin', 150);
    add(d, 'lipids.apoB', .7); add(d, 'proteins.hsCRP', 1);
    const all = scores(d);
    expect(all.find(i => i.id === 'thyroidCoherence').score).not.toBeNull();
    expect(all.find(i => i.id === 'ironHandling').score).not.toBeNull();
    expect(all[0].recencyStatus).toBe('mixed-dates'); expect(all[0].score).toBeNull();
    expect(all[0].rawScore).not.toBeNull();
  });
  it('does not store an explanation in memory when durable persistence fails', async () => {
    vi.spyOn(dataModule, 'saveImportedDataForProfile').mockResolvedValue(false);
    const s = score(thyroid(), 'thyroidCoherence');
    await expect(writeScoreAIAnswer(s, 'Unsaved answer')).rejects.toThrow(/Could not save/);
    expect(state.importedData.biologyScoreAI).toBeUndefined();
  });
  it('flags low-muscle effects on urine-normalized specialty markers', () => {
    const d = add(dataset(), 'oatMetabolic.lactic', 3, { refMin: 0, refMax: 5, unit: 'mmol/mol creatinine' });
    add(d, 'oatMetabolic.pyruvic', 2, { refMin: 0, refMax: 5, unit: 'mmol/mol creatinine' });
    const s = score(d, 'cellularEnergyCoherence', { ...context, lowMuscleMass: true });
    expect(s.score).not.toBeNull(); expect(s.scoreConfidenceLabel).toBe('Needs context');
    expect(s.flags.join(' ')).toMatch(/urine creatinine/);
  });

  it('does not borrow a blood draw date for an undated specialty panel', () => {
    const d = add(dataset(), 'oatMetabolic.lactic', 3, { unit: 'mmol/mol creatinine', refMin: 0, refMax: 5 });
    d.categories.oatMetabolic.singlePoint = true;
    expect(getMarkerHit(d, 'oatMetabolic.lactic').date).toBe('');
    expect(score(d, 'cellularEnergyCoherence').score).toBeNull();
  });

  it('shows a labeled historical or mixed-date estimate without calling it current', () => {
    const d = thyroid(); d.dates = ['2026-01-16'];
    add(d, 'lipids.apoB', .7); add(d, 'proteins.hsCRP', 1);
    let s = score(d, 'thyroidCoherence');
    expect(s.score).toBeNull();
    expect(getScorePresentation(s)).toMatchObject({ value: s.rawScore, historical: true, status: 'Historical score' });
    let html = renderScoreDetail(s);
    expect(html).toContain('Historical score'); expect(html).toContain('Jan 2026');
    expect(html).toContain(`biology-score-dial-number">${s.rawScore}`);
    d.categories.thyroid.markers.ft4.singleDate = '2024-07-08';
    s = score(d, 'thyroidCoherence');
    expect(getScorePresentation(s).status).toBe('Mixed-date estimate');
    html = renderScoreDetail(s);
    expect(html).toContain('Jul 2024'); expect(html).toContain('Jan 2026');
  });
  it('does not turn an unknown-date score or missing filtration into a historical number', () => {
    const d = thyroid(); d.dates = [''];
    expect(getScorePresentation(score(d, 'thyroidCoherence')).value).toBeNull();
    const renal = add(dataset(), 'electrolytes.sodium', 140);
    add(renal, 'electrolytes.potassium', 4.2);
    expect(getScorePresentation(score(renal, 'fluidFiltrationCoherence')).value).toBeNull();
  });

  it('preserves a separate historical overview when every available domain is old', () => {
    const d = thyroid(); d.dates = ['2026-01-16'];
    add(d, 'lipids.apoB', .7); add(d, 'proteins.hsCRP', 1);
    const overview = scores(d)[0];
    expect(overview.score).toBeNull(); expect(overview.coverage).toBe(0);
    expect(overview.historicalSnapshot.rawScore).not.toBeNull();
    expect(getScorePresentation(overview).historical).toBe(true);
    expect(overview.historicalSnapshot.available.some(i => i.key === 'endocrine')).toBe(true);
    d.categories.thyroid.markers.ft4.singleDate = '2024-07-08';
    expect(getScorePresentation(scores(d)[0])).toMatchObject({ historical: true, status: 'Mixed-date estimate', period: 'Jul 2024 – Jan 2026' });
  });

});
