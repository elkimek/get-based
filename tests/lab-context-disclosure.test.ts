// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData } from '../js/profile.js';
import { getActiveData, invalidateActiveDataCache } from '../js/data.js';
import { createLabContextDisclosure } from '../js/lab-context-disclosure.js';
import { buildLabContext } from '../js/lab-context-assembly.js';
import { buildLabCollectionContextSection, buildLabSampleResultsSection } from '../js/lab-context-collection.js';
import { setGroupInAIContext, setLabMarkersContextEnabled, setInsightContextCardsEnabled, invalidateLabContextCache } from '../js/lab-context-settings.js';
import { searchAgentMarkers, readAgentMarkerHistory } from '../js/agent-tool-bindings.js';
import { labToolMarker, labToolRegistry, labToolMarkerGroup } from '../js/lab-tool-markers.js';
import { getMarkerHit } from '../js/biology-score-inputs.js';
import { buildBiologyScoresAIContext } from '../js/biology-score-ai-context.js';
import { buildBiologyScoreContextFingerprint } from '../js/biology-score-context-ai.js';
import { getContextSummary } from '../js/chat-context-summary.js';
import { buildFocusContext } from '../js/focus-card.js';
import type { LabEntry } from '../types/lab-data.js';
import { setMarkerPlacement } from '../js/marker-placement.js';

const day = '2026-10-20', otherDay = '2026-10-19';
const glucose = 'biochemistry.glucose', insulin = 'diabetes.insulin', homa = 'diabetes.homaIR';
const initial = { data: state.importedData, profile: state.currentProfile, sex: state.profileSex, dob: state.profileDob };
const group = (key: string) => { const category = key.split('.')[0]!; return labToolMarkerGroup(category, labToolRegistry(state.importedData)[category]!); };
function seed(entries: LabEntry[]) { state.importedData.entries = entries; invalidateActiveDataCache(); invalidateLabContextCache(); }
function project() { return createLabContextDisclosure().project(getActiveData()); }
beforeEach(() => {
  state.currentProfile = `synthetic-disclosure-${crypto.randomUUID()}`; state.importedData = createDefaultProfileData(); state.profileSex = 'male'; state.profileDob = '1980-01-01';
  localStorage.setItem('labcharts-active-profile', state.currentProfile);
  setLabMarkersContextEnabled(true); setInsightContextCardsEnabled(true);
  seed([{ panelId: 'morning', date: day, markers: { [glucose]: 5, [insulin]: 10, [homa]: 2.22 }, context: { sampleTime: '08:00', fasting: true }, markerSources: { [homa]: { file: null, derivedFrom: [glucose, insulin] } } }]);
});
afterEach(() => { state.currentProfile = initial.profile; state.importedData = initial.data; state.profileSex = initial.sex; state.profileDob = initial.dob; localStorage.clear(); invalidateActiveDataCache(); invalidateLabContextCache(); });

it('removes disabled core values, notes and linked calculations from the actual assembled prompt', () => {
  state.importedData.markerNotes = { [glucose]: 'PRIVATE_CORE_NOTE', [insulin]: 'RETAIN_INSULIN_NOTE' };
  state.importedData.markerValueNotes = { [`${glucose}:${day}`]: 'PRIVATE_DATED_NOTE', [`${insulin}:${day}`]: 'RETAIN_DATED_NOTE' };
  setGroupInAIContext(group(glucose), false);
  const text = buildLabContext();
  expect(text).not.toContain('PRIVATE_CORE_NOTE'); expect(text).not.toContain('PRIVATE_DATED_NOTE');
  expect(text).not.toContain('[section:biochemistry updated:'); expect(text).not.toMatch(/- HOMA-IR.*2\.22/);
  expect(text).toContain('RETAIN_INSULIN_NOTE'); expect(text).toContain('RETAIN_DATED_NOTE');
  expect(() => labToolMarker(state.importedData, glucose)).toThrow('disabled');
  expect(searchAgentMarkers({ query: glucose })).toMatchObject({ matches: [] });
});
it('uses native source permissions after a marker is moved to an enabled category or relabeled', () => {
  const data = getActiveData(), marker = data.categories.biochemistry!.markers.glucose!;
  const moved = structuredClone(data); delete moved.categories.biochemistry!.markers.glucose;
  moved.categories.diabetes!.markers.glucose = { ...marker, storageDotKey: glucose };
  state.importedData.categoryLabels = { biochemistry: 'A new public label' }; setGroupInAIContext('Biochemistry', false);
  const visible = createLabContextDisclosure().project(moved);
  expect(visible.categories.diabetes!.markers.glucose).toBeUndefined();
  expect(() => labToolMarker(state.importedData, glucose)).toThrow('disabled');
});
it('keeps renamed custom-category data out of the actual prompt after its original group is disabled', () => {
  const key = 'privateTests.fixture'; state.importedData.customMarkers[key] = { markerId: 'custom:private-test', name: 'PRIVATE_CUSTOM_MARKER', categoryLabel: 'Private Tests', unit: 'widgets' };
  state.importedData.categoryLabels = { privateTests: 'Public display name' }; state.importedData.markerNotes = { [key]: 'PRIVATE_CUSTOM_NOTE' };
  state.importedData.entries[0]!.markers[key] = 49187.123; invalidateActiveDataCache(); setGroupInAIContext('Private Tests', false); setGroupInAIContext('Public display name', true);
  expect(() => labToolMarker(state.importedData, key)).toThrow('disabled'); expect(buildLabContext()).not.toMatch(/PRIVATE_CUSTOM_|49187\.123/);
});
it('retains a custom marker source group after both rename and placement into an enabled category', () => {
  const key = 'privateTests.fixture'; state.importedData.customMarkers[key] = { markerId: 'custom:private-test', name: 'PRIVATE_CUSTOM_MARKER', categoryLabel: 'Private Tests', contextGroup: 'Private Tests', unit: 'widgets' };
  state.importedData.categoryLabels = { privateTests: 'Public display name' }; state.importedData.entries[0]!.markers[key] = 49187.123;
  expect(setMarkerPlacement(state.importedData, key, 'lipids').ok).toBe(true); invalidateActiveDataCache(); setGroupInAIContext('Private Tests', false); setGroupInAIContext('Lipid Panel', true);
  expect(project().categories.lipids!.markers.fixture).toBeUndefined(); expect(buildLabContext()).not.toMatch(/PRIVATE_CUSTOM_|49187\.123/); expect(searchAgentMarkers({ query: key })).toMatchObject({ matches: [] });
});
it('does not disclose orphaned or cleared notes and invalid definitions do not grant access', () => {
  state.importedData.markerNotes = { 'missing.result': 'ORPHAN', [glucose]: null as unknown as string };
  state.importedData.markerValueNotes = { [`${glucose}:${day}`]: null, [`missing.result:${day}`]: 'ORPHAN_DATED' };
  expect(buildLabContext()).not.toMatch(/ORPHAN|: null|\[section:marker(Value)?Notes\]/);
  state.importedData.customMarkers = { bad: { name: 'Invalid definition' } }; invalidateLabContextCache();
  expect(buildLabContext()).not.toContain('[section:biochemistry updated:');
});
it('keeps two same-day draws, their results and unknown facts independent without changing storage', () => {
  seed([
    { panelId: 'morning', date: day, markers: { [glucose]: 5 }, specimen: 'serum', context: { sampleTime: '08:00', fasting: true } },
    { panelId: 'evening', date: day, markers: { [glucose]: 7 }, specimen: 'plasma', context: { sampleTime: '16:00', fasting: false } },
    { panelId: 'unknown', date: day, markers: { [glucose]: 6 } },
  ]);
  const before = JSON.stringify(state.importedData), text = buildLabContext();
  expect(text).toContain(`${day}: collection time 08:00; fasting; specimen serum [sample morning]`);
  expect(text).toContain(`${day}: collection time 16:00; not fasting; specimen plasma [sample evening]`);
  expect(text).toContain(`${day}: collection details unknown [sample unknown]`);
  for (const [id, value] of [['morning', 5], ['evening', 7], ['unknown', 6]]) expect(text).toContain(`${day} [sample ${id}]: Glucose (${glucose}): ${value} mmol/l`);
  expect(text).not.toMatch(/^- Glucose:/m); expect(JSON.stringify(state.importedData)).toBe(before);
  const visible = project(); expect(visible.entryContextByDate?.[day]).toBeUndefined(); expect(visible.categories.biochemistry!.markers.glucose!.values).toEqual([null]);
  expect(searchAgentMarkers({ query: glucose })).toMatchObject({ matches: [{ key: glucose, latestValue: null, separateSamples: true, recordedValues: 3 }] });
  expect(readAgentMarkerHistory({ marker: glucose, limit: 10 })).toMatchObject({ values: [], marker: { separateSamples: true, sampleResource: 'labResults' } });
  expect(getContextSummary(text).filter(row => row.label === 'Lab values')).toEqual([{ label: 'Lab values', detail: '3 separate samples' }]);
});
it('retains ordinary dated values and alignment while withholding an unrelated hidden date', () => {
  seed([{ panelId: 'private', date: otherDay, markers: { [glucose]: 9 } }, { panelId: 'public', date: day, markers: { [insulin]: 8 } }]);
  setGroupInAIContext(group(glucose), false);
  const visible = project(), text = buildLabContext();
  expect(visible.dates).toEqual([day]); expect(visible.categories.diabetes!.markers.insulin!.values).toEqual([8]); expect(text).not.toContain(otherDay);
});
it('filters per-sample collection data when its only result group is disabled', () => {
  seed([{ panelId: 'private', date: day, markers: { [glucose]: 5 }, context: { sampleTime: '09:13' }, specimen: 'PRIVATE_SPECIMEN' }, { panelId: 'public', date: day, markers: { [insulin]: 8 }, context: { sampleTime: '11:17' } }]);
  setGroupInAIContext(group(glucose), false);
  const text = buildLabContext(); expect(text).not.toMatch(/PRIVATE_SPECIMEN|09:13/); expect(text).toContain('11:17');
});
it('keeps cycle facts out of collection context when Insight is disabled', () => {
  state.importedData.entries[0]!.context = { sampleTime: '08:00', fasting: true, cycleDay: 27, cyclePhase: 'luteal' }; setInsightContextCardsEnabled(false);
  const text = buildLabContext(); expect(text).toContain('08:00; fasting'); expect(text).not.toMatch(/cycle day 27|luteal phase/);
});
it('retains directly reported HOMA when its calculated inputs are disabled', () => {
  state.importedData.entries[0]!.markerSources![homa] = { file: null, reported: true };
  setGroupInAIContext(group(glucose), false);
  expect(project().categories.diabetes!.markers.homaIR!.values).toEqual([2.22]);
});
it('withholds unmarked historical HOMA when a possible calculation input is private', () => {
  delete state.importedData.entries[0]!.markerSources![homa]; setGroupInAIContext(group(glucose), false);
  expect(project().categories.diabetes!.markers.homaIR!.values).toEqual([null]);
});
it('does not expose a removed sample through stale date-wide projections', () => {
  state.importedData.labPanelTombstones = { [`morning.${day}`]: { deletedAt: 10, restoredAt: 0, updatedAt: 10 } };
  expect(buildLabContext()).not.toMatch(/08:00|^- Glucose:/m);
});
it('selects the surviving sample when a removed stale sibling owns the cached date value', () => {
  seed([{ panelId: 'survivor', date: day, markers: { [glucose]: 5 } }, { panelId: 'removed', date: day, markers: { [glucose]: 19 }, context: { sampleTime: '22:13' } }]);
  state.importedData.labPanelTombstones = { [`removed.${day}`]: { deletedAt: 10, restoredAt: 0, updatedAt: 10 } };
  expect(project().categories.biochemistry!.markers.glucose!.values).toEqual([5]); expect(buildLabContext()).not.toContain('22:13');
});
it('honors per-marker removal clocks before exposing results or calculations', () => {
  state.importedData.entries[0]!.deletedMarkers = { [glucose]: 1100 }; state.importedData.entries[0]!.markerSources![glucose] = { file: null, at: 1000 };
  expect(project().categories.biochemistry!.markers.glucose!.values).toEqual([null]); expect(buildLabContext()).not.toMatch(/^- Glucose:|^- HOMA-IR/m);
});
it('uses the same source and sample policy in the automatic dashboard insight', () => {
  state.importedData.entries[0]!.markers![glucose] = 19; invalidateActiveDataCache();
  expect(buildFocusContext()).toContain('Glucose'); setGroupInAIContext(group(glucose), false);
  expect(buildFocusContext()).not.toContain('Glucose');
});
it('annotates and filters automatic ratios while retaining an independent reported ratio', () => {
  seed([{ panelId: 'ratio', date: day, markers: { 'lipids.triglycerides': 2, 'lipids.hdl': 1, 'calculatedRatios.cholHdlRatio': 4 } }]);
  const original = getActiveData(); expect(original.categories.calculatedRatios!.markers.tgHdlRatio!.contextDependencies).toEqual([['lipids.triglycerides', 'lipids.hdl']]);
  expect(original.categories.calculatedRatios!.markers.cholHdlRatio!.contextDependencies).toEqual([[]]);
  setGroupInAIContext(group('lipids.hdl'), false);
  const visible = project(); expect(visible.categories.calculatedRatios!.markers.tgHdlRatio!.values).toEqual([null]); expect(visible.categories.calculatedRatios!.markers.cholHdlRatio!.values).toEqual([4]);
  expect(getActiveData()).toBe(original); expect(original.categories.calculatedRatios!.markers.tgHdlRatio!.values).toEqual([2]);
});
for (const [key, components, expected] of [
  ['cd4Cd8Ratio', [['lymphocyteSubsets.cd4', 400], ['lymphocyteSubsets.cd8', 200]], 2],
  ['lmr', [['differential.lymphocytes', 3], ['differential.monocytes', 0.5]], 6],
] as const) it(`withholds automatic ${key} inputs while retaining an independently reported ratio`, () => {
  const markers = { [glucose]: 5, ...Object.fromEntries(components) }, dependencies = components.map(([key]) => key);
  seed([{ panelId: 'ratio', date: day, markers }]);
  const original = getActiveData(), marker = original.categories.calculatedRatios!.markers[key]!;
  expect(marker.values).toEqual([expected]); expect(marker.contextDependencies).toEqual([dependencies]);
  setGroupInAIContext(group(dependencies[0]!), false);
  const before = JSON.stringify(state.importedData);
  expect(project().categories.calculatedRatios!.markers[key]!.values).toEqual([null]);
  expect(project().categories.biochemistry!.markers.glucose!.values).toEqual([5]);
  expect(marker.values).toEqual([expected]); expect(JSON.stringify(state.importedData)).toBe(before);
  seed([{ panelId: 'reported-ratio', date: day, markers: { ...markers, [`calculatedRatios.${key}`]: 9.123 } }]);
  expect(getActiveData().categories.calculatedRatios!.markers[key]!.contextDependencies).toEqual([[]]);
  expect(project().categories.calculatedRatios!.markers[key]!.values).toEqual([9.123]);
});
for (const hidden of [false, true]) it(`derives AI baselines from permitted history while preserving the native view: hidden=${hidden}`, () => {
  seed([17, 18, 19, 20].map((date, index) => ({ panelId: `draw-${date}`, date: `2026-10-${date}`, markers: { [glucose]: 5 + index } })));
  const original = getActiveData(), marker = original.categories.biochemistry!.markers.glucose!;
  const baselines = structuredClone(marker.personalBaselines);
  expect(baselines?.find(value => value?.comparedDate === day)).toMatchObject({ median: 6, count: 3, delta: 2 });
  if (hidden) {
    state.importedData.entries[0]!.deletedMarkers = { [glucose]: 1100 };
    state.importedData.entries[0]!.markerSources = { [glucose]: { file: null, at: 1000 } };
  }
  const before = JSON.stringify(state.importedData), projected = project().categories.biochemistry!.markers.glucose!;
  expect(projected.values).toEqual(hidden ? [6, 7, 8] : [5, 6, 7, 8]);
  if (hidden) expect(projected).not.toHaveProperty('personalBaselines');
  else expect(projected.personalBaselines).toEqual(baselines);
  expect(marker.personalBaselines).toEqual(baselines); expect(JSON.stringify(state.importedData)).toBe(before);
});
it('prevents score fallback recipes from recreating a disabled calculated group', () => {
  seed([{ panelId: 'ratio', date: day, markers: { 'lipids.triglycerides': 2, 'lipids.hdl': 1 } }]);
  expect(getMarkerHit(getActiveData(), 'calculatedRatios.tgHdlRatio')).not.toBeNull();
  setGroupInAIContext(group('calculatedRatios.tgHdlRatio'), false);
  expect(getMarkerHit(project(), 'calculatedRatios.tgHdlRatio')).toBeNull();
});
it('does not let private lab values affect the outgoing Biology Score context or flag-review fingerprint', () => {
  setGroupInAIContext(group(glucose), false);
  const first = buildBiologyScoresAIContext(getActiveData()), fingerprint = buildBiologyScoreContextFingerprint(getActiveData());
  state.importedData.entries[0]!.markers![glucose] = 19; invalidateActiveDataCache();
  expect(buildBiologyScoresAIContext(getActiveData())).toBe(first); expect(buildBiologyScoreContextFingerprint(getActiveData())).toBe(fingerprint);
});
it('makes source changes invalidate context and preserves explicit local group bypass boundaries', () => {
  const before = buildLabContext(); state.importedData.markerValueNotes = { [`${glucose}:${day}`]: 'NEW_DATED_NOTE' };
  expect(buildLabContext()).not.toBe(before); expect(buildLabContext()).toContain('NEW_DATED_NOTE');
  setGroupInAIContext(group(glucose), false); expect(buildLabContext({ skipGroupFilter: true })).toContain('NEW_DATED_NOTE');
  setLabMarkersContextEnabled(false); expect(buildLabContext({ skipGroupFilter: true })).not.toContain('NEW_DATED_NOTE'); expect(buildLabContext({ ignoreContextToggles: true })).toContain('NEW_DATED_NOTE');
});
it('does not borrow legacy context-only rows or expose source-file evidence in sample context', () => {
  const entries = [
    { date: day, markers: {}, context: { sampleTime: '18:00', fasting: false } },
    { panelId: 'reported', date: day, markers: { [glucose]: 5 }, sourceFile: 'PRIVATE_REPORT.pdf' },
  ];
  expect(buildLabCollectionContextSection(entries)).toBe('');
  expect(buildLabSampleResultsSection(entries, getActiveData(), 'EU')).not.toContain('PRIVATE_REPORT');
});
