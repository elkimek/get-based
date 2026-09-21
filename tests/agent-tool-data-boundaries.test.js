import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ data: vi.fn(), enabled: vi.fn(), group: vi.fn(), ranges: vi.fn(), wearable: vi.fn(), knowledge: vi.fn(), navigate: vi.fn(), detail: vi.fn() }));
vi.mock('../js/data.js', () => ({ getActiveData: mocks.data, navigateDataViewRuntime: mocks.navigate, showDataMarkerDetailRuntime: mocks.detail }));
vi.mock('../js/marker-analysis.js', () => ({ getMarkerRangesForChat: mocks.ranges }));
vi.mock('../js/context-source-registry.js', async original => ({ ...await original(), isContextSourceEnabled: mocks.enabled }));
vi.mock('../js/lab-context-settings.js', () => ({ isGroupInAIContext: mocks.group }));
vi.mock('../js/lab-context-wearables.js', () => ({ buildWearableSeriesSection: mocks.wearable }));
vi.mock('../js/lens.js', () => ({ queryLens: mocks.knowledge }));
import { state } from '../js/state.js';
import { createBrowserAgentToolDependencies, searchAgentMarkers, readAgentMarkerHistory, readAgentNutritionSummary, readAgentWearableSeries, searchAgentKnowledge, navigateFromAgent } from '../js/agent-tool-bindings.js';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.group.mockReturnValue(true);
  mocks.ranges.mockReturnValue([{ kind: 'reference', label: 'Reference', min: 4, max: 6, source: 'lab', usedForStatus: true, privateMetadata: 'must not escape' }]);
  mocks.data.mockReturnValue({ dates: ['2026-01-01', '2026-02-01', '2026-03-01'], categories: {
    biochemistry: { label: 'Blood', markers: {
      glucose: { name: 'Glucose', unit: 'mmol/l', values: [4.8, null, 5.8] },
      empty: { name: 'Empty', values: [null, null, null] },
    } },
    custom: { label: 'Specialty', group: 'Private', markers: { glucose: { name: 'Glucose', unit: 'mg/l', values: [7], singlePoint: true, singleDate: '2026-02-15' } } },
  } });
  state.currentProfile = 'a';
  state.importedData = { entries: [], nutritionMeals: [] };
});
afterEach(() => vi.useRealTimers());

describe('agent marker disclosure', () => {
  it('omits empty markers and disabled groups instead of disclosing their existence', () => {
    mocks.group.mockImplementation(group => group !== 'Private');
    const result = searchAgentMarkers({ query: '', limit: 10 });
    expect(result.matches).toEqual([{ key: 'biochemistry.glucose', name: 'Glucose', category: 'Blood', unit: 'mmol/l', latestValue: 5.8, latestDate: '2026-03-01', recordedValues: 2 }]);
    expect(result.totalMatches).toBe(1);
  });
  it('requires disambiguation for duplicate names and accepts a canonical key', () => {
    expect(readAgentMarkerHistory({ marker: 'Glucose', limit: 10 })).toMatchObject({ available: false, reason: 'Marker name is ambiguous.' });
    expect(readAgentMarkerHistory({ marker: 'biochemistry.glucose', limit: 10 })).toMatchObject({ available: true, totalValuesInRange: 2 });
    expect(readAgentMarkerHistory({ marker: 'missing', limit: 10 })).toMatchObject({ available: false, reason: 'Marker was not found.' });
  });
  it('filters dates inclusively, omits missing readings and returns the newest limited values', () => {
    const result = readAgentMarkerHistory({ marker: 'biochemistry.glucose', from: '2026-01-01', to: '2026-03-01', limit: 1 });
    expect(result).toMatchObject({ returnedValues: 1, totalValuesInRange: 2, values: [{ date: '2026-03-01', value: 5.8, unit: 'mmol/l' }] });
    expect(result.values[0].ranges[0]).not.toHaveProperty('privateMetadata');
    expect(readAgentMarkerHistory({ marker: 'biochemistry.glucose', from: '2026-02-01', to: '2026-02-28', limit: 10 }).values).toEqual([]);
  });
  it('uses the actual collection date for a single-point marker', () => {
    expect(readAgentMarkerHistory({ marker: 'custom.glucose', limit: 1 }).values[0]).toMatchObject({ date: '2026-02-15', value: 7 });
  });
  it('blocks marker search and history before reading data when context is disabled', () => {
    mocks.enabled.mockReturnValue(false);
    expect(searchAgentMarkers({ query: '', limit: 10 }).available).toBe(false);
    expect(readAgentMarkerHistory({ marker: 'biochemistry.glucose', limit: 10 }).available).toBe(false);
    expect(mocks.data).not.toHaveBeenCalled();
  });
});

describe('agent non-lab disclosure', () => {
  it.each(['7d', '30d'])('returns aggregate nutrition for %s without individual meal details', range => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T12:00:00Z'));
    state.importedData.nutritionMeals = [{ id: 'private-id', name: 'Private meal name', note: 'Private diary', eatenAt: '2026-09-20T12:00:00Z', nutrients: { energyKcal: 500 } }];
    const result = readAgentNutritionSummary({ range });
    expect(result.available).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/private-id|Private meal|Private diary/);
    expect(result.period).toBeTruthy();
  });
  it('does not build wearable series when wearable context is disabled', async () => {
    mocks.enabled.mockReturnValue(false);
    expect(readAgentNutritionSummary({ range: '7d' }).available).toBe(false);
    await expect(readAgentWearableSeries({ days: 7 })).resolves.toMatchObject({ available: false });
    expect(mocks.wearable).not.toHaveBeenCalled();
  });
  it('distinguishes missing wearable data from an available series', async () => {
    mocks.wearable.mockResolvedValueOnce('').mockResolvedValueOnce('Recorded steps: 5000');
    await expect(readAgentWearableSeries({ days: 7 })).resolves.toMatchObject({ available: false });
    await expect(readAgentWearableSeries({ days: 7 })).resolves.toMatchObject({ available: true, days: 7, series: 'Recorded steps: 5000' });
  });
  it('limits knowledge excerpts and exposes only source labels and text', async () => {
    mocks.knowledge.mockResolvedValue({ chunks: [{ source: 'S'.repeat(300), text: 'T'.repeat(5000), embedding: [1, 2], privateKey: 'secret' }, { source: 'extra', text: 'omit' }] });
    const result = await searchAgentKnowledge({ query: 'test', limit: 1 });
    expect(result.chunks).toEqual([{ source: 'S'.repeat(240), text: 'T'.repeat(4000) }]);
    expect(mocks.knowledge).toHaveBeenCalledWith('test', { topK: 1 });
    mocks.knowledge.mockResolvedValue({ chunks: [] });
    await expect(searchAgentKnowledge({ query: 'test', limit: 1 })).resolves.toMatchObject({ available: false });
  });
  it('does not navigate an ambiguous marker or claim success when the view is unavailable', async () => {
    await expect(navigateFromAgent({ view: 'labs', marker: 'Glucose' })).resolves.toMatchObject({ changed: false });
    expect(mocks.navigate).not.toHaveBeenCalled();
    mocks.navigate.mockReturnValue(false);
    await expect(navigateFromAgent({ view: 'labs', marker: '' })).resolves.toMatchObject({ changed: false });
    mocks.navigate.mockReturnValue(true);
    mocks.detail.mockReturnValue(true);
    await expect(navigateFromAgent({ view: 'labs', marker: 'biochemistry.glucose' })).resolves.toMatchObject({ changed: true, opened: 'marker' });
  });
  it('keeps the complete browser dependency factory attached to the original profile', async () => {
    const tools = createBrowserAgentToolDependencies('a');
    state.currentProfile = 'b';
    await expect(tools.readMarkerHistory({ marker: 'biochemistry.glucose', limit: 1 })).resolves.toMatchObject({ available: false });
    await expect(tools.searchKnowledge({ query: 'test', limit: 1 })).resolves.toMatchObject({ available: false });
    expect(mocks.data).not.toHaveBeenCalled();
    expect(mocks.knowledge).not.toHaveBeenCalled();
  });
});
