// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {state} from '../js/state.js';
import {createDefaultProfileData} from '../js/profile.js';
import {getActiveData, invalidateActiveDataCache} from '../js/data.js';
import * as dataModule from '../js/data.js';
import {computeBiologyScores} from '../js/biology-score-compute.js';
import {getBiologyAIState, getBiologyAIRenderState, getScoreAIMaterialKey, getScoreAIRequestKey, renderScoreAIAnswer, renderScoreAISummary,
  renderScoreAIAnswerForRender, renderScoreAISummaryForRender, pendingScoreExplanations, setScoreExplanationError, writeScoreAIAnswer, retryUnsavedScoreAIAnswers} from '../js/biology-score-sections.js';
import type {BiologySectionScore} from '../js/biology-score-sections.js';
import type {AppState} from '../types/app-state.js';
import {scheduleBiologyScoreAIReconcile} from '../js/biology-scores.js';
import {configureBiologyScoresRuntimeDeps} from '../js/biology-scores-runtime.js';

const previous = {currentProfile: state.currentProfile, currentView: state.currentView, importedData: state.importedData, profiles: state.profiles,
  profileSex: state.profileSex, profileDob: state.profileDob, rangeMode: state.rangeMode, dateRangeFilter: state.dateRangeFilter};
const demo = JSON.parse(readFileSync('data/demo-male.json', 'utf8')) as Pick<AppState['importedData'], 'entries' | 'refOverrides'>;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-07T12:00:00Z'));
  localStorage.clear(); localStorage.setItem('labcharts-ai-paused', 'true');
  state.currentProfile = 'render-material'; state.currentView = 'biology-scores'; state.profiles = [{id: 'render-material', name: 'Synthetic'}];
  state.profileSex = 'male'; state.profileDob = '1987-11-22'; state.rangeMode = 'optimal'; state.dateRangeFilter = 'all';
  state.importedData = Object.assign(createDefaultProfileData(), structuredClone(demo)); invalidateActiveDataCache();
});
afterEach(() => {Object.assign(state, previous); pendingScoreExplanations.clear(); setScoreExplanationError([]); invalidateActiveDataCache();
  document.body.innerHTML = ''; localStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers();});
function scores() {return computeBiologyScores(getActiveData());}
function saved(score: BiologySectionScore, text = 'Saved interpretation', material = getScoreAIMaterialKey(score)) {
  state.importedData.biologyScoreAI ||= {};
  state.importedData.biologyScoreAI[score.id] = {text, summary: 'Saved summary', materialFingerprint: material};
}
function materialCalls(spy: {mock: {calls: readonly (readonly unknown[])[]}}, id: string) {
  return spy.mock.calls.filter(([value]) => {
    const item = value as {materialFormat?: unknown; id?: unknown} | null;
    return item?.materialFormat === 2 && item.id === id;
  });
}

for (const mode of ['reference', 'optimal', 'both'] as const) it(`retains complete nineteen-score material/state/snippet output: ${mode}`, () => {
  state.rangeMode = mode;
  const values = scores(), original = state.importedData, before = structuredClone(original);
  for (const score of values) {
    const material = getScoreAIMaterialKey(score);
    expect(getBiologyAIRenderState(score)).toEqual(getBiologyAIState(score));
    expect(renderScoreAISummaryForRender(score)).toBe(renderScoreAISummary(score));
    expect(renderScoreAIAnswerForRender(score)).toBe(renderScoreAIAnswer(score));
    expect(getScoreAIMaterialKey(score)).toBe(material);
  }
  expect(state.importedData).toBe(original); expect(state.importedData).toEqual(before);
});

it('serializes matching evidence once per owned snapshot while standalone state still derives each original key', () => {
  const score = scores().find(item => item.id === 'ironHandling')!; saved(score);
  const stringify = vi.spyOn(JSON, 'stringify'); const expected = getBiologyAIState(score);
  expect(materialCalls(stringify, score.id)).toHaveLength(5); stringify.mockClear();
  expect(getBiologyAIRenderState(score)).toEqual(expected);
  expect(materialCalls(stringify, score.id)).toHaveLength(1);
  stringify.mockClear(); getBiologyAIRenderState(score); expect(materialCalls(stringify, score.id)).toHaveLength(1);
});

it.each(['current', 'stale', 'covered', 'demo', 'pending', 'error', 'encrypted'] as const)('keeps %s saved and lifecycle state semantics', kind => {
  const score = scores().find(item => item.id === 'ironHandling')!, material = getScoreAIMaterialKey(score);
  if (kind === 'demo') state.profiles![0]!.tags = ['demo'];
  else saved(score, 'Current saved answer', kind === 'stale' ? '{"flags":[],"rangeMode":"reference"}' : material);
  if (kind === 'covered') state.importedData.biologyScoreAI![score.id] = {text: 'Covered answer', summary: 'Covered summary', materialFingerprint: 'old', coveredMaterials: [material]};
  if (kind === 'pending') pendingScoreExplanations.add(getScoreAIRequestKey(score));
  if (kind === 'error') setScoreExplanationError([getScoreAIRequestKey(score)], 'Synthetic error');
  if (kind === 'encrypted') localStorage.setItem('labcharts-encryption-enabled', 'true');
  const original = structuredClone(state.importedData);
  expect(getBiologyAIRenderState(score)).toEqual(getBiologyAIState(score));
  expect(renderScoreAISummaryForRender(score)).toBe(renderScoreAISummary(score));
  expect(renderScoreAIAnswerForRender(score)).toBe(renderScoreAIAnswer(score));
  expect(state.importedData).toEqual(original);
  setScoreExplanationError([getScoreAIRequestKey(score)]);
});

it('successive calls reread the current profile, imported records, pending and error state instead of retaining a snapshot', () => {
  const score = scores().find(item => item.id === 'ironHandling')!; saved(score, 'First');
  const first = getBiologyAIRenderState(score); state.importedData = {...state.importedData, biologyScoreAI: {}}; saved(score, 'Second');
  pendingScoreExplanations.add(getScoreAIRequestKey(score)); setScoreExplanationError([getScoreAIRequestKey(score)], 'Second error');
  const second = getBiologyAIRenderState(score); expect(second).toEqual(getBiologyAIState(score)); expect(second).not.toEqual(first);
  state.currentProfile = 'replacement'; state.profiles = [{id: 'replacement', name: 'Replacement'}];
  expect(getBiologyAIRenderState(score)).toEqual(getBiologyAIState(score));
  setScoreExplanationError([getScoreAIRequestKey(score, 'render-material')]);
});

it('an accessor-bearing evidence row keeps the exact original repeated getter fault chronology', () => {
  const score = scores().find(item => item.id === 'ironHandling')!; saved(score);
  const row = score.available[0]!; let reads = 0; const events: string[] = [], fault = new Error('Repeated evidence getter');
  const label = row.label;
  Object.defineProperty(row, 'label', {enumerable: true, configurable: true, get() {events.push('label'); if (++reads === 3) throw fault; return label;}});
  expect(() => getBiologyAIState(score)).toThrow(fault); const original = [...events]; reads = 0; events.length = 0;
  expect(() => getBiologyAIRenderState(score)).toThrow(fault); expect(events).toEqual(original);
});

it('saved-record accessors retain both original reads in the fallback path without descriptor invocation', () => {
  const score = scores().find(item => item.id === 'ironHandling')!; saved(score);
  const record = state.importedData.biologyScoreAI![score.id]; let reads = 0;
  Object.defineProperty(state.importedData.biologyScoreAI!, score.id, {configurable: true, get() {reads++; return record;}});
  const expected = getBiologyAIState(score), count = reads; reads = 0;
  expect(getBiologyAIRenderState(score)).toEqual(expected); expect(reads).toBe(count); expect(count).toBe(2);
});

it('the original public request-key default reads the active profile before score material faults', () => {
  const score = scores().find(item => item.id === 'ironHandling')!, descriptor = Object.getOwnPropertyDescriptor(state, 'currentProfile')!;
  const events: string[] = [], fault = new Error('Material fault');
  Object.defineProperty(state, 'currentProfile', {configurable: true, get() {events.push('profile'); return 'foreign';}});
  Object.defineProperty(score, 'id', {configurable: true, get() {events.push('id'); throw fault;}});
  try {expect(() => getScoreAIRequestKey(score)).toThrow(fault); expect(events).toEqual(['profile', 'id']);}
  finally {Object.defineProperty(state, 'currentProfile', descriptor);}
});

it('descriptor-trap failure declines optional sharing without becoming a scoring error', () => {
  const score = scores().find(item => item.id === 'ironHandling')!; saved(score); const expected = getBiologyAIState(score);
  const foreign = new Proxy(score, {getOwnPropertyDescriptor() {throw new Error('Foreign descriptor');}});
  expect(getBiologyAIRenderState(foreign)).toEqual(expected);
});

it('scheduled reconcile keeps its second state read after a summary focus callback changes the saved answer', async () => {
  const score = scores().find(item => item.id === 'ironHandling')!; saved(score, 'Before focus');
  document.body.innerHTML = `<main id="main-content">${renderScoreAISummary(score)}${renderScoreAIAnswer(score)}</main>`;
  const summary = document.querySelector<HTMLElement>('[data-biology-score-ai-summary]')!;
  const initialControl = summary.querySelector('button')!; initialControl.focus();
  expect(document.activeElement).toBe(initialControl);
  saved(score, 'After replacement');
  state.importedData.biologyScoreAI[score.id]!.summary = 'Changed summary before reconciliation';
  let focusCallbacks = 0;
  const onFocus = (event: FocusEvent) => {
    if ((event.target as Element).closest('[data-biology-score-ai-summary]')) {focusCallbacks++; saved(score, 'From actual focus callback');}
  };
  document.addEventListener('focusin', onFocus);
  const prepare = vi.fn(async () => {});
  const restore = configureBiologyScoresRuntimeDeps({prepareContext: prepare});
  try {
    scheduleBiologyScoreAIReconcile(); vi.advanceTimersToNextFrame(); await vi.advanceTimersByTimeAsync(0);
    expect(prepare).toHaveBeenCalledOnce(); expect(focusCallbacks).toBe(1);
    const nextSummary = document.querySelector('[data-biology-score-ai-summary]')!;
    expect(nextSummary).not.toBe(summary); expect(summary.isConnected).toBe(false);
    expect(document.activeElement).toBe(nextSummary.querySelector('button'));
    expect(document.querySelector('[data-biology-score-ai-panel]')!.textContent).toContain('From actual focus callback');
    expect(document.querySelector('[data-biology-score-ai-panel]')!.textContent).not.toContain('After replacement');
  } finally {document.removeEventListener('focusin', onFocus); configureBiologyScoresRuntimeDeps(restore); vi.clearAllTimers();}
});

it('the owned snapshot preserves failed-save recovery without making a second provider request', async () => {
  const score = scores().find(item => item.id === 'ironHandling')!;
  const persist = vi.spyOn(dataModule, 'saveImportedDataForProfile').mockResolvedValue(false);
  try {
    await expect(writeScoreAIAnswer(score, {text: 'Retry retained answer', summary: 'Retry summary'})).rejects.toThrow('Could not save');
    expect(getBiologyAIRenderState(score)).toEqual(getBiologyAIState(score)); expect(getBiologyAIRenderState(score).retry).toBe(true);
  } finally {persist.mockResolvedValue(true); await retryUnsavedScoreAIAnswers();}
});

for (const location of ['root', 'historical'] as const) it(`demo ${location} anchor getters retain material mutations at their original read boundaries`, () => {
  state.profiles![0]!.tags = ['demo'];
  const computed = scores().find(item => item.id === 'ironHandling')!;
  const score: BiologySectionScore = location === 'historical' ? {...computed, historicalSnapshot: {...computed}} : computed;
  const presented = location === 'historical' ? score.historicalSnapshot! : score;
  presented.attention = '';
  const initial = Number(score.rawScore || 0), events: string[] = [];
  Object.defineProperty(presented, 'anchorWarning', {enumerable: true, configurable: true, get() {
    events.push('anchor'); score.rawScore = Number(score.rawScore || 0) + 1; return 'Demo anchor context';
  }});
  const expected = getBiologyAIState(score), reads = [...events], finalRaw = score.rawScore;
  expect(reads.length).toBeGreaterThan(0); score.rawScore = initial; events.length = 0;
  expect(getBiologyAIRenderState(score)).toEqual(expected); expect(events).toEqual(reads); expect(score.rawScore).toBe(finalRaw);
});

for (const location of ['root', 'historical'] as const) it(`demo ${location} anchor faults are neither consumed nor hidden by optional eligibility`, () => {
  state.profiles![0]!.tags = ['demo'];
  const computed = scores().find(item => item.id === 'ironHandling')!;
  const score: BiologySectionScore = location === 'historical' ? {...computed, historicalSnapshot: {...computed}} : computed;
  const presented = location === 'historical' ? score.historicalSnapshot! : score;
  presented.attention = ''; const fault = new Error('Demo anchor getter'), events: string[] = [];
  Object.defineProperty(presented, 'anchorWarning', {enumerable: true, configurable: true, get() {events.push('anchor'); throw fault;}});
  expect(() => getBiologyAIState(score)).toThrow(fault); const expected = [...events]; expect(expected).toEqual(['anchor']); events.length = 0;
  expect(() => getBiologyAIRenderState(score)).toThrow(fault); expect(events).toEqual(expected);
});
