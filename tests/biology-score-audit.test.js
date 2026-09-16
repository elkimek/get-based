import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { computeBiologyScores } from '../js/biology-scores.js';
import { getScorePresentation, renderDashboardBiologyScoreWidget, renderScoreDetail } from '../js/biology-score-render.js';
import { getBiologyProfileContext } from '../js/profile-context.js';
import { buildBiologyScoresAIContext } from '../js/biology-score-ai-context.js';
import { buildBiologyScoreCoveragePlannerModel, markerDisplayLabel } from '../js/biology-score-coverage-planner.js';
import { saveBiologyScoreContextReview, applyBiologyScoreContextFlag, configureBiologyScoreContextAIDeps, generateBiologyScoreContextReview, buildBiologyScoreContextFingerprint } from '../js/biology-score-context-ai.js';
import * as dataModule from '../js/data.js';
import { state } from '../js/state.js';
import { writeScoreAIAnswer } from '../js/biology-score-sections.js';
import { getMarkerHit } from '../js/biology-score-inputs.js';
import { MARKER_SCHEMA } from '../js/schema.js';

const profileContext = { sex: 'male', ageYears: 38 };
const dataset = () => ({ dates: ['2026-09-01'], categories: {} });
function add(data, path, value, extras = {}) {
  const [category, key] = path.split('.');
  data.categories[category] ||= { markers: {} };
  data.categories[category].markers[key] = { ...MARKER_SCHEMA[category]?.markers[key], name: key, values: [value], ...extras };
  return data;
}
const compute = data => computeBiologyScores(data, { profileContext });
const get = (data, id) => compute(data).find(s => s.id === id);
function metabolic() {
  const data = add(dataset(), 'biochemistry.glucose', 5);
  add(data, 'diabetes.insulin', 5);
  add(data, 'lipids.triglycerides', 1); add(data, 'lipids.hdl', 1.5);
  return data;
}
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-15T12:00:00Z'));
  state.rangeMode = 'reference'; state.dateRangeFilter = 'all'; state.profileSex = 'male'; state.profileDob = '1987-11-22';
  state.currentProfile = 'biology-audit'; state.importedData = { entries: [], diagnoses: { flags: {} } };
});
afterEach(() => vi.restoreAllMocks());

it('overview retains the oldest core date even when domain latest dates are close', () => {
  const data = add(dataset(), 'thyroid.tsh', 1.5, { singleDate: '2026-04-01' });
  add(data, 'thyroid.ft3', 4.8, { singleDate: '2026-06-20' });
  add(data, 'thyroid.ft4', 16, { singleDate: '2026-06-20' });
  add(data, 'iron.ferritin', 100); add(data, 'iron.transferrinSat', 30); add(data, 'hematology.hemoglobin', 150);
  expect(get(data, 'thyroidCoherence').score).not.toBeNull();
  const overview = compute(data)[0];
  expect(overview.score).toBeNull();
  expect(overview.recencyStatus).toBe('mixed-dates');
  expect(getScorePresentation(overview).period).toBe('Apr 2026 – Sep 2026');
});

it('known nonfasting labs cannot establish a fasting glucose-insulin score', () => {
  const data = metabolic(); data.entryContextByDate = { '2026-09-01': { fasting: false } };
  const s = get(data, 'metabolicFlexibility');
  expect(s.available.filter(i => ['homaIR', 'insulin', 'glucose', 'tgHdlRatio'].includes(i.key)).every(i => i.profileContextOnly)).toBe(true);
  expect(s.score).toBeNull();
  expect(s.flags.join(' ')).toMatch(/non-fasting/i);
});

it('unknown fasting stays usable with a context limitation, confirmed fasting clears it', () => {
  const data = metabolic();
  const unknown = get(data, 'metabolicFlexibility');
  expect(unknown.score).not.toBeNull();
  expect(unknown.scoreConfidenceLabel).toBe('Needs context');
  const planner = buildBiologyScoreCoveragePlannerModel([unknown], null);
  expect(planner.scoreRows[0].coreContextCount).toBeGreaterThan(0);
  expect(planner.scoreRows[0].usefulMissing.some(i => i.contextNote?.includes('fasting'))).toBe(true);
  data.entryContextByDate = { '2026-09-01': { fasting: true } };
  expect(get(data, 'metabolicFlexibility').scoreConfidenceLabel).toBe('Core complete');
});

it('core drag attribution uses effective weight and ignores optional outliers in dashboard and chat', () => {
  const base = get(metabolic(), 'metabolicFlexibility');
  const available = [
    { key: 'a', label: 'Small weight core', core: true, partial: 0, weight: 0.01, effectiveWeight: 0.01 },
    { key: 'b', label: 'Main core driver', core: true, partial: 60, weight: 2, effectiveWeight: 2 },
    { key: 'c', label: 'Optional outlier', core: false, partial: 0, weight: 10, effectiveWeight: 10 },
  ];
  const s = { ...base, score: 60, tone: 'strained', available, attention: '', scoreConfidenceWarning: '' };
  expect(renderScoreDetail(s)).toContain('Main core driver contributes most');
  expect(renderDashboardBiologyScoreWidget({ data: {} }, s.id, () => [s])).toContain('Main core driver contributes most');
  const data = metabolic(); add(data, 'diabetes.hba1c', 1000);
  const ai = buildBiologyScoresAIContext(data, { profileContext, includeScoreSections: true });
  const line = ai.split('\n').find(line => line.startsWith('- Metabolic Flexibility:'));
  expect(line).not.toMatch(/drag:.*hba1c/i);
});

it('Light copy never claims a hidden vitamin-D target override', () => {
  state.importedData.diagnoses.flags.lowSunlight = true;
  state.importedData.sunDefaults = { completedAt: Date.now() };
  expect(getBiologyProfileContext().lowSunlightReason).not.toMatch(/target is raised|100 nmol|40 ng/);
});

it('planner names alternative core requirements rather than only the first assay', () => {
  const scores = compute(dataset());
  const model = buildBiologyScoreCoveragePlannerModel(scores.slice(1), scores[0]);
  const b12 = model.coreShortlist.find(i => i.coreGroup === 'b12Status');
  expect(markerDisplayLabel(b12)).toMatch(/active or total/i);
  const androgens = model.coreShortlist.filter(i => ['sexHormone', 'maleAndrogenStatus'].includes(i.coreGroup));
  expect(androgens).toHaveLength(1);
});

it('failed context-review persistence cannot appear saved in memory', async () => {
  vi.spyOn(dataModule, 'saveImportedData').mockResolvedValue(false);
  vi.spyOn(dataModule, 'saveImportedDataForProfile').mockResolvedValue(false);
  const old = { summary: 'Original review' }; state.importedData.biologyScoreContextAI = old;
  await expect(saveBiologyScoreContextReview({ summary: 'Unsaved review' })).rejects.toThrow(/save/i);
  expect(state.importedData.biologyScoreContextAI).toEqual(old);
});

it('failed flag persistence does not change deterministic scoring context', async () => {
  vi.spyOn(dataModule, 'saveImportedData').mockResolvedValue(false);
  vi.spyOn(dataModule, 'saveImportedDataForProfile').mockResolvedValue(false);
  await expect(applyBiologyScoreContextFlag('lowMuscleMass')).rejects.toThrow(/save/i);
  expect(state.importedData.diagnoses.flags.lowMuscleMass).not.toBe(true);
});

it('context-review evidence is captured before inference rather than stamped with later context', async () => {
  const data = metabolic();
  const fingerprint = buildBiologyScoreContextFingerprint(data, 'all');
  const previous = configureBiologyScoreContextAIDeps({ hasAIProvider: () => true, isAIPaused: () => false, callClaudeAPI: async () => {
    state.importedData.diagnoses.flags.lowMuscleMass = true;
    return { text: JSON.stringify({ summary: 'Original context review', suggestions: [] }) };
  } });
  try { expect((await generateBiologyScoreContextReview(data)).fingerprint).toBe(fingerprint); }
  finally { configureBiologyScoreContextAIDeps(previous); }
});


it('new same-draw components supersede an old stored HOMA or ApoB ratio', () => {
  const data = metabolic();
  add(data, 'diabetes.homaIR', 8, { singleDate: '2026-01-01' });
  add(data, 'lipids.apoB', 0.8); add(data, 'lipids.apoAI', 1.5);
  add(data, 'calculatedRatios.apoBapoAIRatio', 1.8, { singleDate: '2026-01-01' });
  expect(getMarkerHit(data, 'diabetes.homaIR').date).toBe('2026-09-01');
  expect(getMarkerHit(data, 'diabetes.homaIR').canonicalValue).toBeCloseTo(25 / 22.5);
  expect(getMarkerHit(data, 'calculatedRatios.apoBapoAIRatio').canonicalValue).toBeCloseTo(0.8 / 1.5);
  data.categories.diabetes.markers.homaIR.singleDate = '2026-09-01';
  expect(getMarkerHit(data, 'diabetes.homaIR').canonicalValue).toBe(8);
});


it('an unvalidated EPA+DHA sum cannot replace a reported Omega-3 Index', () => {
  const data = add(dataset(), 'fattyAcids.omega3Index', 8, { unit: '%', refMin: 4, refMax: 12, singleDate: '2026-01-01' });
  add(data, 'fattyAcids.dhaC22_6', 4, { unit: '%' }); add(data, 'fattyAcids.epaC20_5', 2, { unit: '%' });
  expect(getMarkerHit(data, 'fattyAcids.omega3Index')).toMatchObject({ canonicalValue: 8, date: '2026-01-01' });
});

it('concurrent context changes persist together and scope their writes to the original profile', async () => {
  const save = vi.spyOn(dataModule, 'saveImportedDataForProfile').mockResolvedValue(true);
  await Promise.all([applyBiologyScoreContextFlag('lowMuscleMass'), applyBiologyScoreContextFlag('hormoneTherapy')]);
  expect(save.mock.calls.at(-1)[0]).toBe('biology-audit');
  expect(save.mock.calls.at(-1)[1].diagnoses.flags).toMatchObject({ lowMuscleMass: true, hormoneTherapy: true });
});


it('a slow context save cannot overwrite an AI answer that finishes at the same time', async () => {
  let persisted;
  let call = 0;
  vi.spyOn(dataModule, 'saveImportedDataForProfile').mockImplementation(async (_id, snapshot) => {
    const order = ++call;
    await new Promise(resolve => setTimeout(resolve, order === 1 ? 20 : 0));
    persisted = structuredClone(snapshot);
    return true;
  });
  const s = get(metabolic(), 'metabolicFlexibility');
  await Promise.all([
    applyBiologyScoreContextFlag('lowMuscleMass'),
    writeScoreAIAnswer(s, { summary: 'Saved insight.', text: 'Saved interpretation.' }),
  ]);
  expect(persisted.diagnoses.flags.lowMuscleMass).toBe(true);
  expect(persisted.biologyScoreAI[s.id].summary).toBe('Saved insight.');
});

it('baseline and advanced boundaries preserve all scores and the twelve overview domains', async () => {
  const { groupBiologyScores, renderBiologicalCoherenceLensHero } = await import('../js/biology-score-render.js');
  const scores = compute(metabolic());
  const groups = groupBiologyScores(scores);
  expect(Object.values(groups).flat()).toHaveLength(18);
  expect(groups.baseline.every(s => s.panelTier !== 'extended')).toBe(true);
  expect(groups.advanced.every(s => s.panelTier === 'extended')).toBe(true);
  expect(groups.waiting.every(s => getScorePresentation(s).value == null)).toBe(true);
  const overview = scores[0];
  expect(overview.available.length + overview.missing.length).toBe(12);
  expect(overview.missing.every(s => s.primaryScoreId && s.unavailableReason)).toBe(true);
  const html = renderBiologicalCoherenceLensHero({ data: metabolic() }, compute);
  expect(html.match(/class="biology-coherence-domain-row/g)).toHaveLength(overview.available.length);
  expect(html).not.toContain('biology-coherence-domain-unavailable');
  expect(html).toContain('biology-membership-count');
  expect(html).not.toContain('See contributors');
  expect(html).toContain('Iron Handling and Blood Flow Context share one domain');
});

it('review ordering separates current concerns, reassuring results, historical estimates and unscored panels', async () => {
  const { groupBiologyScores } = await import('../js/biology-score-render.js');
  const s = (id, score, extra = {}) => ({ id, title: id, score, available: [], ...extra });
  const groups = groupBiologyScores([
    s('healthy', 98), s('older', null, { rawScore: 5, recencyStatus: 'stale' }),
    s('flagged', 100, { attention: 'Reference alert' }), s('lower', 12),
    s('advanced', 0, { panelTier: 'extended' }), s('unknownDate', null, { rawScore: 80, recencyStatus: 'unknown-date' }),
  ]);
  expect(groups.baseline.map(s => s.id)).toEqual(['lower', 'flagged', 'healthy', 'older']);
  expect(groups.advanced.map(s => s.id)).toEqual(['advanced']);
  expect(groups.waiting.map(s => s.id)).toEqual(['unknownDate']);
});

it('a saved explanation survives age-label rollover but still reports substantive changes', async () => {
  const { getScoreAIMaterialKey, scoreAIAnswerNeedsRefresh, getScoreAIRefreshReason } = await import('../js/biology-score-sections.js');
  const base = get(metabolic(), 'metabolicFlexibility');
  const before = { ...base, flags: ['Insulin is 6mo old; retest this score together before trusting it.'], available: base.available.map(i => ({ ...i, contextReason: 'Insulin is 6mo old; retest this score together before trusting it.' })) };
  state.importedData.biologyScoreAI = { [base.id]: { summary: 'Saved summary.', text: 'Saved explanation.', materialFingerprint: getScoreAIMaterialKey(before) } };
  const after = { ...before, flags: before.flags.map(s => s.replace('6mo', '7mo')), available: before.available.map(i => ({ ...i, contextReason: i.contextReason.replace('6mo', '7mo') })) };
  expect(scoreAIAnswerNeedsRefresh(after)).toBe(false);
  expect(getScoreAIRefreshReason(after)).toBe('');
  const changed = { ...after, score: 45 };
  expect(scoreAIAnswerNeedsRefresh(changed)).toBe(true);
  expect(getScoreAIRefreshReason(changed)).toBe('Changed since this explanation: score.');
});

it('overview hides unscored domains but retains zero and historical numeric results on both surfaces', async () => {
  const { renderBiologicalCoherenceLensHero, renderDashboardBiologicalCoherenceWidget } = await import('../js/biology-score-render.js');
  const base = compute(metabolic())[0];
  const visible = { ...base.available[0], partial: 0 };
  const overview = { ...base, available: [visible], missing: [{ key: 'endocrine', label: 'Thyroid hormones', unavailableReason: 'Older results', primaryScoreId: 'thyroidCoherence' }] };
  for (const render of [renderBiologicalCoherenceLensHero, renderDashboardBiologicalCoherenceWidget]) {
    const html = render({}, () => [overview]);
    expect(html).not.toContain('Older results');
    expect(html).not.toContain('See contributors');
    expect(html).toContain('>0</');
    expect(html).not.toContain('class="biology-coherence-domain-unavailable"');
    const empty = render({}, () => [{ ...overview, available: [], score: null, rawScore: null }]);
    expect(empty).not.toMatch(/class="(?:biology-coherence-domain-row|bc-micro-domain)"/);
    const historical = render({}, () => [{ ...overview, score: null, historicalSnapshot: { ...overview, score: null, rawScore: 0, recencyStatus: 'stale' } }]);
    expect(historical).toContain('>0</');
  }
});

it('membership follows actual contributors even when the shared blood domain includes only one score', () => {
  const data = add(dataset(), 'hematology.hemoglobin', 150);
  add(data, 'hematology.hematocrit', 45); add(data, 'hematology.platelets', 250);
  add(data, 'iron.ferritin', 100, { singleDate: '2024-01-01' }); add(data, 'iron.transferrinSat', 30);
  const scores = compute(data);
  const overview = scores[0];
  const blood = overview.available.find(d => d.key === 'blood');
  expect(blood.contributorIds).toContain('bloodFlowViscosity');
  expect(blood.contributorIds).not.toContain('ironHandling');
  expect(scores.find(s => s.id === 'bloodFlowViscosity').overviewMembership.included).toBe(true);
  expect(scores.find(s => s.id === 'ironHandling').overviewMembership).toMatchObject({ included: false, label: 'Excluded · Mixed dates' });
  expect(overview.membership).toHaveLength(13);
  expect(scores.find(s => s.id === 'nerveMuscleSignal').overviewMembership.optional).toBe(true);
});

it('historical-only overview labels its real contributors as historical, without changing AI cache keys', async () => {
  const data = add(dataset(), 'thyroid.tsh', 1.5, { singleDate: '2024-01-01' });
  add(data, 'thyroid.ft3', 4.8, { singleDate: '2024-01-01' }); add(data, 'thyroid.ft4', 16, { singleDate: '2024-01-01' });
  add(data, 'lipids.apoB', .7, { singleDate: '2024-01-01' });
  add(data, 'proteins.hsCRP', 1, { singleDate: '2024-01-01' });
  const scores = compute(data);
  expect(scores[0].historicalSnapshot).toBeTruthy();
  const thyroid = scores.find(s => s.id === 'thyroidCoherence');
  expect(thyroid.overviewMembership).toMatchObject({ included: true, label: 'In historical overview' });
  const { getScoreAIMaterialKey } = await import('../js/biology-score-sections.js');
  const key = getScoreAIMaterialKey(thyroid);
  delete thyroid.overviewMembership;
  expect(getScoreAIMaterialKey(thyroid)).toBe(key);
});
