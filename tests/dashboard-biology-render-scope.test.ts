// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {afterEach, beforeAll, beforeEach, expect, it, vi} from 'vitest';
import type {DashboardPageFactoryOperations} from '../types/dashboard-page-view.js';
import type {MobileCallbacks} from '../types/mobile-dashboard.js';
import type {AppState} from '../types/app-state.js';
import {state} from '../js/state.js';
import {createDefaultProfileData} from '../js/profile.js';
import {configureProfileContextLightDeps} from '../js/profile-context.js';
import {getActiveData, invalidateActiveDataCache} from '../js/data.js';
import * as computation from '../js/biology-score-compute.js';
import {createDashboardBiologyProjectionScope, projectDashboardBiologyScoreWidget, projectDashboardBiologicalCoherenceWidget} from '../js/biology-score-dashboard.js';
import {createDashboardViewComposition} from '../js/dashboard-view-composition.js';

const ports = vi.hoisted(() => ({desktop: null as DashboardPageFactoryOperations | null,
  mobile: null as MobileCallbacks | null, onNotes: null as (() => void) | null}));
vi.mock('../js/dashboard-page-view.js', () => ({createDashboardPageView: (deps: unknown) => {
  ports.desktop = deps as DashboardPageFactoryOperations; return {showDashboard: () => {}};
}}));
vi.mock('../js/mobile-dashboard.js', async original => ({...await original<typeof import('../js/mobile-dashboard.js')>(),
  configureMobileDashboardView: (deps: unknown) => {ports.mobile = deps as MobileCallbacks;},
}));
vi.mock('../js/dashboard-widget-renderers.js', async original => {
  const actual = await original<typeof import('../js/dashboard-widget-renderers.js')>();
  return {...actual, createDashboardWidgetRenderers: (deps: unknown) => {
    const result = actual.createDashboardWidgetRenderers(deps);
    const notes = result.projectDashboardNotesWidget;
    return {...result, projectDashboardNotesWidget: () => {ports.onNotes?.(); return notes();}};
  }};
});

const previous = {currentProfile: state.currentProfile, importedData: state.importedData,
  rangeMode: state.rangeMode, dateRangeFilter: state.dateRangeFilter, profileSex: state.profileSex, profileDob: state.profileDob};
const demo = JSON.parse(readFileSync('data/demo-male.json', 'utf8')) as Pick<AppState['importedData'], 'entries' | 'refOverrides'>;
const ids = computation.SCORE_DEFINITIONS.map(def => def.id);
const prefs = (order: string[], hidden: string[] = []) => ({order, hidden});
const widget = (id: string) => `biology-score-${id}`;
beforeAll(() => {createDashboardViewComposition({navigate: () => {}, showRecommendations: () => {}, showEmojiPicker: () => {},
  renderFocusCard: () => '', loadFocusCard: () => {}, projectOnboardingBanner: () => null, projectAIConnectionReminder: () => null});});
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-07T12:00:00Z'));
  state.currentProfile = 'render-scope'; state.rangeMode = 'optimal'; state.dateRangeFilter = 'all';
  state.profileSex = 'male'; state.profileDob = '1987-11-22';
  state.importedData = Object.assign(createDefaultProfileData(), structuredClone(demo));
  ports.onNotes = null; invalidateActiveDataCache();
});
afterEach(() => {Object.assign(state, previous); ports.onNotes = null; invalidateActiveDataCache(); vi.restoreAllMocks(); vi.useRealTimers();});
function context() {return {data: getActiveData()};}
function standalone(ctx: unknown, id: string) {return id === 'biologicalCoherence'
  ? projectDashboardBiologicalCoherenceWidget(ctx) : projectDashboardBiologyScoreWidget(ctx, id);}
function scoped(scope: ReturnType<typeof createDashboardBiologyProjectionScope>, ctx: unknown, id: string) {
  return id === 'biologicalCoherence' ? scope.projectCoherenceWidget(ctx) : scope.projectScoreWidget(ctx, id);
}

for (const sex of ['male', 'female'] as const) for (const range of ['optimal', 'reference'] as const)
  for (const dates of ['all', '3m'] as const) it(`shares identical19score views within one plain segment: ${sex}/${range}/${dates}`, () => {
    state.profileSex = sex; state.rangeMode = range; state.dateRangeFilter = dates;
    const ctx = context(), expected = ids.map(id => standalone(ctx, id));
    const compute = vi.spyOn(computation, 'computeBiologyScores');
    const scope = createDashboardBiologyProjectionScope();
    expect(ids.map(id => scoped(scope, ctx, id))).toEqual(expected);
    expect(compute).toHaveBeenCalledTimes(1);
  });

it('allocates lazily, reuses no result across scopes, and clear retires the segment', () => {
  const compute = vi.spyOn(computation, 'computeBiologyScores'), ctx = context();
  const first = createDashboardBiologyProjectionScope(), second = createDashboardBiologyProjectionScope();
  expect(compute).not.toHaveBeenCalled();
  first.projectCoherenceWidget(ctx); first.projectScoreWidget(ctx, 'ironHandling');
  expect(compute).toHaveBeenCalledTimes(1);
  second.projectCoherenceWidget(ctx); expect(compute).toHaveBeenCalledTimes(2);
  first.clear(); first.projectCoherenceWidget(ctx); expect(compute).toHaveBeenCalledTimes(3);
});

for (const mutation of ['ctx', 'data', 'profile', 'importedData', 'range', 'dates', 'sex', 'dob', 'day'] as const)
  it(`never reuses a result after its ${mutation} owner changes`, () => {
    const compute = vi.spyOn(computation, 'computeBiologyScores'); let ctx = context();
    const scope = createDashboardBiologyProjectionScope(); scope.projectCoherenceWidget(ctx);
    if (mutation === 'ctx') ctx = {...ctx};
    if (mutation === 'data') ctx.data = {...ctx.data};
    if (mutation === 'profile') state.currentProfile = 'replacement';
    if (mutation === 'importedData') state.importedData = {...state.importedData};
    if (mutation === 'range') state.rangeMode = 'reference';
    if (mutation === 'dates') state.dateRangeFilter = '3m';
    if (mutation === 'sex') state.profileSex = 'female';
    if (mutation === 'dob') state.profileDob = '1950-01-01';
    if (mutation === 'day') vi.setSystemTime(new Date('2026-08-08T12:00:00Z'));
    const result = scope.projectScoreWidget(ctx, 'ironHandling');
    expect(compute).toHaveBeenCalledTimes(2);
    expect(result).toEqual(projectDashboardBiologyScoreWidget(ctx, 'ironHandling'));
  });

it('standalone projections preserve the original spread/data getter chronology on every call', () => {
  const scoreData = context().data, events: string[] = [];
  const ctx = {get first() {events.push('first'); return 1;}, get data() {events.push('data'); return scoreData;},
    get last() {events.push('last'); return 2;}};
  const compute = vi.spyOn(computation, 'computeBiologyScores');
  projectDashboardBiologicalCoherenceWidget(ctx); projectDashboardBiologyScoreWidget(ctx, 'ironHandling');
  expect(events).toEqual(['first', 'data', 'last', 'data', 'first', 'data', 'last', 'data']);
  expect(compute).toHaveBeenCalledTimes(2);
});

it('an accessor-bearing context keeps per-call getter faults instead of sharing over them', () => {
  const data = context().data, fault = new Error('second projection getter'), events: string[] = []; let reads = 0;
  const ctx = {get data() {events.push('data'); if (++reads === 3) throw fault; return data;}};
  const scope = createDashboardBiologyProjectionScope(); scope.projectCoherenceWidget(ctx);
  expect(() => scope.projectScoreWidget(ctx, 'ironHandling')).toThrow(fault);
  expect(events).toEqual(['data', 'data', 'data']);
});

it('nested accessors are inspected without invocation and preserve a later computation fault', () => {
  const scores = computation.computeBiologyScores({}, {profileContext: {sex: 'male', ageYears: 38}});
  let reads = 0; const fault = new Error('nested second computation');
  const data = {get categories() {if (++reads === 2) throw fault; return {};}};
  const compute = vi.spyOn(computation, 'computeBiologyScores').mockImplementation(input => {void input?.categories; return scores;});
  const scope = createDashboardBiologyProjectionScope(); const ctx = {data};
  scope.projectCoherenceWidget(ctx);
  expect(() => scope.projectScoreWidget(ctx, 'ironHandling')).toThrow(fault);
  expect(reads).toBe(2); expect(compute).toHaveBeenCalledTimes(2);
});

it('descriptor-trap failures only disable reuse and never introduce an observable scoring error', () => {
  const scores = computation.computeBiologyScores({}, {profileContext: {sex: 'male', ageYears: 38}});
  const trap = vi.fn(() => {throw new Error('descriptor trap');});
  const data = new Proxy({}, {ownKeys: () => ['foreign'], getOwnPropertyDescriptor: trap});
  const compute = vi.spyOn(computation, 'computeBiologyScores').mockReturnValue(scores);
  const scope = createDashboardBiologyProjectionScope(); const ctx = {data};
  expect(() => scope.projectCoherenceWidget(ctx)).not.toThrow();
  expect(trap).not.toHaveBeenCalled();
  expect(() => scope.projectScoreWidget(ctx, 'ironHandling')).not.toThrow();
  expect(compute).toHaveBeenCalledTimes(2); expect(trap).toHaveBeenCalledTimes(1);
});

for (const [label, foreign] of [['function', () => {}], ['date', new Date('2026-01-01')], ['set', new Set(['foreign'])]] as const)
  it(`keeps exotic/function-bearing graphs uncached: ${label}`, () => {
    const ctx = {...context(), foreign}; const compute = vi.spyOn(computation, 'computeBiologyScores');
    const scope = createDashboardBiologyProjectionScope(); scope.projectCoherenceWidget(ctx); scope.projectScoreWidget(ctx, 'ironHandling');
    expect(compute).toHaveBeenCalledTimes(2);
  });

for (const mode of ['desktop', 'mobile'] as const) it(`actual ${mode} composition shares a contiguous segment and starts fresh on same-ctx next render`, () => {
  const views = ports[mode]!.getVisibleDashboardWidgetViews;
  const ctx = context(), selected = prefs(ids.map(widget));
  const compute = vi.spyOn(computation, 'computeBiologyScores');
  const first = views(ctx, selected); expect(first).toHaveLength(19); expect(compute).toHaveBeenCalledTimes(1);
  const second = views(ctx, selected); expect(second).toEqual(first); expect(compute).toHaveBeenCalledTimes(2);
});

it('hidden, excluded and absent Biology widgets never begin a calculation', () => {
  const compute = vi.spyOn(computation, 'computeBiologyScores'), ctx = context();
  const selected = prefs([widget('biologicalCoherence'), 'notes', widget('ironHandling')], [widget('biologicalCoherence'), widget('ironHandling')]);
  ports.desktop!.getVisibleDashboardWidgetViews(ctx, selected);
  ports.desktop!.getVisibleDashboardWidgetViews(ctx, prefs(['notes']));
  expect(compute).not.toHaveBeenCalled();
});

it('clears before non-Biology callbacks, preserving in-place context changes and reentrant render independence', () => {
  const ctx = context(), views = ports.desktop!.getVisibleDashboardWidgetViews;
  const compute = vi.spyOn(computation, 'computeBiologyScores');
  let inner: ReturnType<typeof views> | null = null;
  ports.onNotes = () => {
    state.importedData.diagnoses ||= {};
    state.importedData.diagnoses.flags ||= {};
    state.importedData.diagnoses.flags.lowMuscleMass = true;
    inner = views(ctx, prefs([widget('biologicalCoherence'), widget('ironHandling')]));
  };
  const outer = views(ctx, prefs([widget('biologicalCoherence'), 'notes', widget('ironHandling')]));
  expect(inner).toHaveLength(2); expect(outer).toHaveLength(3); expect(compute).toHaveBeenCalledTimes(3);
  expect(outer[2]!.content).toEqual({kind: 'biology-dashboard-score', view: projectDashboardBiologyScoreWidget(ctx, 'ironHandling')});
});

it('stops after an earlier non-Biology failure without calculating hidden future Biology content', () => {
  const fault = new Error('notes failed'), compute = vi.spyOn(computation, 'computeBiologyScores'); ports.onNotes = () => {throw fault;};
  expect(() => ports.desktop!.getVisibleDashboardWidgetViews(context(), prefs(['notes', widget('ironHandling')]))).toThrow(fault);
  expect(compute).not.toHaveBeenCalled();
});

it('shared/cyclic plain references finish eligibility without rereading or looping', () => {
  const ctx = Object.assign(context(), {repeat: null as unknown}); ctx.repeat = ctx;
  const compute = vi.spyOn(computation, 'computeBiologyScores');
  const scope = createDashboardBiologyProjectionScope(); scope.projectCoherenceWidget(ctx); scope.projectScoreWidget(ctx, 'ironHandling');
  expect(compute).toHaveBeenCalledTimes(1);
});

it('a failed calculation never publishes a cache entry and the next call retries', () => {
  const scores = computation.computeBiologyScores({}, {profileContext: {sex: 'male', ageYears: 38}});
  const fault = new Error('calculation failed');
  const compute = vi.spyOn(computation, 'computeBiologyScores').mockImplementationOnce(() => {throw fault;}).mockReturnValue(scores);
  const ctx = context(), scope = createDashboardBiologyProjectionScope();
  expect(() => scope.projectCoherenceWidget(ctx)).toThrow(fault);
  expect(scope.projectCoherenceWidget(ctx)).toEqual(projectDashboardBiologicalCoherenceWidget(ctx));
  expect(compute).toHaveBeenCalledTimes(3);
});

it('keeps a first context getter failure ahead of foreign DOB coercion on the uncached path', () => {
  const contextFault = new Error('context first'), dobFault = new Error('DOB must not run');
  const dob = {toString: vi.fn(() => {throw dobFault;})};
  (state as {profileDob: unknown}).profileDob = dob;
  const ctx = {get data(): never {throw contextFault;}};
  expect(() => projectDashboardBiologicalCoherenceWidget(ctx)).toThrow(contextFault);
  expect(() => createDashboardBiologyProjectionScope().projectCoherenceWidget(ctx)).toThrow(contextFault);
  expect(dob.toString).not.toHaveBeenCalled();
});

it('foreign coercing DOB values preserve original computation coercions and opt out of sharing', () => {
  const ctx = context(), dob = {toString: vi.fn(() => '1987-11-22')};
  (state as {profileDob: unknown}).profileDob = dob;
  const expected = projectDashboardBiologicalCoherenceWidget(ctx);
  const expectedReads = dob.toString.mock.calls.length; expect(expectedReads).toBeGreaterThan(0); dob.toString.mockClear();
  const compute = vi.spyOn(computation, 'computeBiologyScores'), scope = createDashboardBiologyProjectionScope();
  expect(scope.projectCoherenceWidget(ctx)).toEqual(expected); expect(dob.toString).toHaveBeenCalledTimes(expectedReads);
  dob.toString.mockClear(); scope.projectScoreWidget(ctx, 'ironHandling');
  expect(dob.toString).toHaveBeenCalledTimes(expectedReads); expect(compute).toHaveBeenCalledTimes(2);
});

it('a Light callback replacing imported data during calculation cannot publish the old result under its new owner', () => {
  const ctx = context(), replacement = structuredClone(state.importedData);
  replacement.diagnoses = {flags: {lowMuscleMass: true}};
  const compute = vi.spyOn(computation, 'computeBiologyScores');
  const vitaminD = vi.fn(() => {state.importedData = replacement; return 0;});
  const previousLight = configureProfileContextLightDeps({rollingVitaminDIU: vitaminD, rollingChannelTotals: null});
  try {
    const scope = createDashboardBiologyProjectionScope();
    scope.projectCoherenceWidget(ctx);
    expect(vitaminD).toHaveBeenCalled(); expect(state.importedData).toBe(replacement);
    const actual = scope.projectScoreWidget(ctx, 'ironHandling');
    expect(compute).toHaveBeenCalledTimes(2);
    const firstScores = compute.mock.results[0]!.value as ReturnType<typeof computation.computeBiologyScores>;
    const nextScores = compute.mock.results[1]!.value as ReturnType<typeof computation.computeBiologyScores>;
    expect(firstScores.find(score => score.id === 'ironHandling')).toMatchObject({profileContext: {lowMuscleMass: false}});
    expect(nextScores.find(score => score.id === 'ironHandling')).toMatchObject({profileContext: {lowMuscleMass: true}});
    expect(actual).toEqual(projectDashboardBiologyScoreWidget(ctx, 'ironHandling'));
    scope.projectCoherenceWidget(ctx); expect(compute).toHaveBeenCalledTimes(3);
  } finally {configureProfileContextLightDeps(previousLight);}
});

it('optional owner snapshots never consume an active state getter before the original calculation', () => {
  const ctx = context(), descriptor = Object.getOwnPropertyDescriptor(state, 'importedData')!;
  const fault = new Error('original profile getter'), read = vi.fn(() => {throw fault;});
  Object.defineProperty(state, 'importedData', {configurable: true, get: read});
  try {
    expect(() => projectDashboardBiologicalCoherenceWidget(ctx)).toThrow(fault);
    expect(read).toHaveBeenCalledTimes(1); read.mockClear();
    expect(() => createDashboardBiologyProjectionScope().projectCoherenceWidget(ctx)).toThrow(fault);
    expect(read).toHaveBeenCalledTimes(1);
  } finally {Object.defineProperty(state, 'importedData', descriptor);}
});
