// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProfileData } from '../types/app-state.js';
import { rebaseLiveProfileData, adoptProfileData, rememberProfileData, profileDataBaseline } from '../js/profile-data-writes.js';
import type { AIVerdictAnalysis } from '../js/ai-verdict-engine.js';
type Row = { id: string; analysis: AIVerdictAnalysis | null };
type FixtureRoot = { label: string; analysis: AIVerdictAnalysis | null; rows?: Row[] };
const root = (data: ProfileData) => data as unknown as FixtureRoot;
const fixture = vi.hoisted(() => ({
  state: { currentProfile: 'a', importedData: { label: 'A', analysis: null } as FixtureRoot },
  call: vi.fn(), save: vi.fn(), refresh: vi.fn(), push: vi.fn(),
}));
vi.mock('../js/state.js', () => ({ state: fixture.state }));
vi.mock('../js/ai-feature-routing.js', () => ({ hasAssistantFeatureProvider: () => true, callAssistantFeatureAI: fixture.call }));
vi.mock('../js/data.js', () => ({ saveImportedDataForProfile: fixture.save, notifyProfileDataContextChanged: () => {} }));
vi.mock('../js/sync.js', () => ({ isSyncEnabled: () => true, pushCurrentProfile: fixture.push }));
vi.mock('../js/ai-verdict-engine-runtime.js', () => ({
  dispatchAIVerdictUpdatedRuntime: () => {}, getAIVerdictConcurrencyCapRuntime: () => 1,
  hasAIVerdictRuntime: () => false, isAIVerdictEngineDisabledRuntime: () => false,
  refreshSunSurfacesRuntime: fixture.refresh,
}));
import { createAIVerdict, getAIVerdictSlotsDebug } from '../js/ai-verdict-engine.js';
function gate<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(accept => { resolve = accept; }); return { promise, resolve }; }
const verdict = (tip = 'A result') => JSON.stringify({ dot: 'green', tip, detail: 'Context' });
function engine() {
  const singleton = { id: 'default' };
  return { singleton, engine: createAIVerdict({
    getTarget: () => singleton, getId: target => target.id,
    getAIAnalysis: (_, data) => root(data).analysis,
    setAIAnalysis: (_, value, data) => { root(data).analysis = value; },
    getFingerprint: () => fixture.state.importedData.label,
    buildContext: () => fixture.state.importedData.label,
    systemPrompt: 'Return a verdict', autoFireRetryDelaysMs: [40],
  }) };
}
beforeEach(() => {
  fixture.state.currentProfile = 'a'; fixture.state.importedData = { label: 'A', analysis: null };
  fixture.call.mockReset(); fixture.save.mockReset().mockImplementation(async (profile: string, draft: ProfileData, options: { baseData: ProfileData }) => {
    if (fixture.state.currentProfile === profile) {
      const live = fixture.state.importedData;
      const result = rebaseLiveProfileData(profileDataBaseline(live) || options.baseData, live, draft);
      adoptProfileData(live, result.data); rememberProfileData(live, result.baseline);
    }
    rememberProfileData(draft); return true;
  });
  fixture.push.mockReset().mockResolvedValue(undefined); fixture.refresh.mockReset();
});
afterEach(() => { vi.useRealTimers(); expect(getAIVerdictSlotsDebug()).toMatchObject({ active: 0, waiting: 0 }); });

it('discards a singleton response after profile switching without writing or refreshing the replacement', async () => {
  const response = gate<string>(); fixture.call.mockReturnValue(response.promise);
  const owner = engine(), source = fixture.state.importedData, pending = owner.engine.analyze(owner.singleton);
  await vi.waitFor(() => expect(fixture.call).toHaveBeenCalledTimes(1));
  fixture.state.currentProfile = 'b'; fixture.state.importedData = { label: 'B', analysis: null };
  const before = structuredClone(fixture.state.importedData); fixture.refresh.mockClear();
  response.resolve(verdict()); expect(await pending).toBeNull();
  expect(source.analysis).toBeNull(); expect(fixture.state.importedData).toEqual(before);
  expect(fixture.save).not.toHaveBeenCalled(); expect(fixture.push).not.toHaveBeenCalled(); expect(fixture.refresh).not.toHaveBeenCalled();
});
it('does not mark or block the same target ID in another profile', async () => {
  const first = gate<string>(), second = gate<string>(); fixture.call.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const owner = engine(), a = owner.engine.analyze(owner.singleton);
  await vi.waitFor(() => expect(fixture.call).toHaveBeenCalledTimes(1));
  fixture.state.currentProfile = 'b'; fixture.state.importedData = { label: 'B', analysis: null };
  const initialStatus = owner.engine.getStatus(owner.singleton), initialAnalyzing = owner.engine.isAnalyzing('default');
  const b = owner.engine.analyze(owner.singleton); expect(owner.engine.getStatus(owner.singleton)).toBe('analyzing');
  first.resolve(verdict()); const oldResult = await a;
  second.resolve(verdict('B result')); const newResult = await b;
  expect(initialStatus).toBe('idle'); expect(initialAnalyzing).toBe(false); expect(oldResult).toBeNull();
  expect(fixture.call).toHaveBeenCalledTimes(2); expect(newResult?.tip).toBe('B result'); expect(fixture.state.importedData.analysis?.tip).toBe('B result');
});
it('does not build or submit queued work from a replacement profile', async () => {
  const first = gate<string>(); fixture.call.mockReturnValue(first.promise);
  const one = engine(), two = engine(), a = one.engine.analyze(one.singleton);
  await vi.waitFor(() => expect(fixture.call).toHaveBeenCalledTimes(1));
  const queued = two.engine.analyze(two.singleton);
  fixture.state.currentProfile = 'b'; fixture.state.importedData = { label: 'B', analysis: null };
  first.resolve(verdict()); await a; expect(await queued).toBeNull();
  expect(fixture.call).toHaveBeenCalledTimes(1); expect(fixture.state.importedData.analysis).toBeNull();
});
it('does not turn an old profile parse failure into a replacement-profile error state', async () => {
  const response = gate<string>(); fixture.call.mockReturnValue(response.promise);
  const owner = engine(), pending = owner.engine.analyze(owner.singleton);
  await vi.waitFor(() => expect(fixture.call).toHaveBeenCalledTimes(1));
  fixture.state.currentProfile = 'b'; fixture.state.importedData = { label: 'B', analysis: null };
  response.resolve('Malformed'); await pending;
  expect(fixture.state.importedData.analysis).toBeNull(); expect(fixture.save).not.toHaveBeenCalled();
});
it('retires an auto-fire retry when its profile is replaced during the backoff', async () => {
  vi.useFakeTimers(); fixture.call.mockResolvedValue('Malformed');
  const owner = engine(); owner.engine.maybeAfterFinish(owner.singleton);
  await vi.advanceTimersByTimeAsync(1); expect(fixture.call).toHaveBeenCalledTimes(1);
  fixture.state.currentProfile = 'b'; fixture.state.importedData = { label: 'B', analysis: { status: 'error' } };
  await vi.advanceTimersByTimeAsync(100);
  expect(fixture.call).toHaveBeenCalledTimes(1); expect(fixture.state.importedData.analysis).toEqual({ status: 'error' });
});

it('discards a response after the active data root is replaced without changing the profile ID', async () => {
  const response = gate<string>(); fixture.call.mockReturnValue(response.promise);
  const owner = engine(), pending = owner.engine.analyze(owner.singleton);
  await vi.waitFor(() => expect(fixture.call).toHaveBeenCalledTimes(1));
  fixture.state.importedData = { label: 'Reloaded A', analysis: null };
  response.resolve(verdict()); expect(await pending).toBeNull();
  expect(fixture.state.importedData.analysis).toBeNull(); expect(fixture.save).not.toHaveBeenCalled();
});
it('retires an away-and-back request even if the exact original profile root is restored', async () => {
  const response = gate<string>(); fixture.call.mockReturnValue(response.promise);
  const owner = engine(), source = fixture.state.importedData, pending = owner.engine.analyze(owner.singleton);
  await vi.waitFor(() => expect(fixture.call).toHaveBeenCalledTimes(1));
  fixture.state.currentProfile = 'b'; fixture.state.importedData = { label: 'B', analysis: null };
  globalThis.dispatchEvent(new CustomEvent('labcharts-profile-switched'));
  fixture.state.currentProfile = 'a'; fixture.state.importedData = source;
  globalThis.dispatchEvent(new CustomEvent('labcharts-profile-switched'));
  response.resolve(verdict()); expect(await pending).toBeNull(); expect(source.analysis).toBeNull();
  expect(fixture.save).not.toHaveBeenCalled();
});
it('captures queued context together with its fingerprint before the first asynchronous wait', async () => {
  const first = gate<string>(); fixture.call.mockReturnValueOnce(first.promise).mockResolvedValueOnce(verdict());
  const one = engine(), two = engine(), active = one.engine.analyze(one.singleton);
  await vi.waitFor(() => expect(fixture.call).toHaveBeenCalledTimes(1));
  const queued = two.engine.analyze(two.singleton); fixture.state.importedData.label = 'Edited A';
  first.resolve(verdict()); await active; const value = await queued;
  expect(fixture.call.mock.calls[1]![0].messages).toEqual([{ role: 'user', content: 'A' }]);
  expect(value?.fingerprint).toBe('A');
});
it('applies a row verdict to its current record and never revives a deleted target', async () => {
  let row: Row | null = { id: 'row', analysis: null };
  fixture.state.importedData.rows = [row];
  const owner = createAIVerdict<Row>({ getTarget: (id, data) => root(data).rows?.find(value => value.id === id), getId: value => value.id,
    getAIAnalysis: value => value.analysis, setAIAnalysis: (value, analysis) => { value.analysis = analysis; },
    getFingerprint: () => 'same', buildContext: () => 'Record facts', systemPrompt: 'Return a verdict' });
  const original = row, response = gate<string>(); fixture.call.mockReturnValueOnce(response.promise);
  const pending = owner.analyze(row); await vi.waitFor(() => expect(fixture.call).toHaveBeenCalledTimes(1));
  row = { id: 'row', analysis: null }; fixture.state.importedData.rows = [row]; response.resolve(verdict()); await pending;
  expect(original.analysis).toBeNull(); expect(row.analysis?.tip).toBe('A result');
  const deletedResponse = gate<string>(); fixture.call.mockReturnValueOnce(deletedResponse.promise);
  const deleted = owner.analyze(row, { force: true }); await vi.waitFor(() => expect(fixture.call).toHaveBeenCalledTimes(2));
  row = null; fixture.state.importedData.rows = []; fixture.save.mockClear(); deletedResponse.resolve(verdict()); expect(await deleted).toBeNull();
  expect(fixture.save).not.toHaveBeenCalled();
});
