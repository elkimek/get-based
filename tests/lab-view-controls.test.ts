// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ range: vi.fn(), layout: vi.fn(), navigate: vi.fn(), stylesheet: vi.fn() }));
vi.mock('../js/data.js', () => ({ getActiveData: () => ({ categories: { biochemistry: {} } }) }));
vi.mock('../js/data-view-controls.js', () => ({ setDateRange: native.range, navigateDataViewOutcomeRuntime: native.navigate }));
vi.mock('../js/category-page-runtime.js', () => ({ setCategoryViewMode: native.layout, loadCategoryViewsStylesheet: native.stylesheet }));
vi.mock('../js/category-page-view.js', () => ({}));
vi.mock('../js/health-data-loader.js', () => ({ loadChartsModule: async () => {} }));
import { openLabView } from '../js/lab-view-controls.js';
import { state } from '../js/state.js';
const before = { range: state.dateRangeFilter, layout: state.categoryView, view: state.currentView };
beforeEach(() => {
  vi.clearAllMocks(); state.dateRangeFilter = 'all'; state.categoryView = 'charts'; state.currentView = 'dashboard';
  native.range.mockImplementation((range: string) => { state.dateRangeFilter = range; return true; }); native.layout.mockImplementation((layout: string) => { state.categoryView = layout; return true; });
  native.stylesheet.mockResolvedValue(undefined); native.navigate.mockImplementation(async (view: string) => { state.currentView = view; return true; });
});
afterEach(() => { state.dateRangeFilter = before.range; state.categoryView = before.layout; state.currentView = before.view; });
it('rejects a missing category before publishing a range or loading its view', async () => {
  expect(await openLabView({ view: 'category', category: 'missing', marker: '' }, () => true)).toMatchObject({ changed: false });
  expect(native.range).not.toHaveBeenCalled(); expect(native.layout).not.toHaveBeenCalled(); expect(native.stylesheet).not.toHaveBeenCalled();
});
it('rechecks ownership after native preparation before publishing any session preference', async () => {
  let release!: () => void, owned = true; native.stylesheet.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const pending = openLabView({ view: 'category', category: 'biochemistry', marker: '' }, () => owned);
  await vi.waitFor(() => expect(native.stylesheet).toHaveBeenCalledOnce()); owned = false; release();
  expect(await pending).toMatchObject({ changed: false }); expect(native.range).not.toHaveBeenCalled(); expect(native.layout).not.toHaveBeenCalled(); expect(native.navigate).not.toHaveBeenCalled();
});
it('reports the actual session effect if the native renderer fails after choosing the view', async () => {
  native.navigate.mockImplementationOnce(async () => {state.currentView = 'labs'; throw new Error('Native render failed');});
  expect(await openLabView({ view: 'labs', marker: '' }, () => true)).toMatchObject({ changed: true, opened: null, labRange: 'all', dataSaved: false, settingsSaved: false });
  expect(native.range).not.toHaveBeenCalled(); expect(native.layout).not.toHaveBeenCalled();
});
it('does not claim a selection changed when an unavailable native view made no change', async () => {
  native.navigate.mockResolvedValueOnce(false);
  const result = await openLabView({ view: 'labs', marker: '' }, () => true);
  expect(result).toMatchObject({ changed: false, opened: null }); expect(result.reason).not.toContain('selection changed');
});

it.each(['charts', 'table', 'heatmap'])('rejects the retired %s layout command before native preparation or session changes', async layout => {
  await expect(openLabView({ view: 'category', category: 'biochemistry', marker: '', range: '3m', layout }, () => true)).rejects.toThrow('native settings');
  expect(native.range).not.toHaveBeenCalled(); expect(native.layout).not.toHaveBeenCalled(); expect(native.stylesheet).not.toHaveBeenCalled(); expect(native.navigate).not.toHaveBeenCalled();
  expect({ range: state.dateRangeFilter, layout: state.categoryView, view: state.currentView }).toEqual({ range: 'all', layout: 'charts', view: 'dashboard' });
});
