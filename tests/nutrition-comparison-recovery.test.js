// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const deps = vi.hoisted(() => ({ analyze: vi.fn(), prepare: vi.fn(), load: vi.fn(), save: vi.fn(), render: vi.fn(), notify: vi.fn() }));
vi.mock('../js/nutrition-analysis.js', () => ({ analyzeMealPhoto: deps.analyze, prepareMealPhotos: deps.prepare, mealImagesFromPreparedPhotos: () => [] }));
vi.mock('../js/nutrition-store.js', () => ({ getLocalNutritionComparison: deps.load, setLocalNutritionComparison: deps.save }));
vi.mock('../js/nutrition-comparison-results.js', () => ({ comparisonTotalWeight: () => 0, renderNutritionComparisonResults: deps.render, exitComparisonPresentation: vi.fn(), toggleComparisonPresentation: vi.fn() }));
vi.mock('../js/nutrition-ai-settings.js', () => ({ hydrateNutritionLocalAICatalog: vi.fn(), listNutritionVisionModels: () => ['a', 'b'].map(model => ({value:model, model, provider:'fixture', modelDisplay:model, providerDisplay:'Fixture'})) }));
vi.mock('../js/utils.js', () => ({ escapeHTML: value => String(value), escapeAttr: value => String(value), isDebugMode: () => true, showNotification: deps.notify }));
vi.mock('../js/nutrition-render.js', () => ({ actionAttrs: () => '', renderComparisonModelPicker: () => '' }));
import { state } from '../js/state.js';
import * as ui from '../js/nutrition-comparison-ui.js';
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; }
const result = { analysis: { mealName: 'Lunch', components: [], nutrients: {} } };
const snapshot = { version:1, runs:[{route:{provider:'fixture',model:'saved'},result}], savedAt:'2026-09-23T00:00:00Z' };
let files, finish;
beforeEach(() => {
  vi.useFakeTimers();
  deps.save.mockResolvedValue(undefined);
  ui.resetNutritionComparison();
  vi.clearAllMocks();
  state.currentProfile = 'origin'; state.importedData = {entries:[]};
  document.body.innerHTML = '<input type="checkbox" checked data-nutrition-comparison-model value="a"><input type="checkbox" checked data-nutrition-comparison-model value="b">';
  files = vi.fn().mockResolvedValue([new File(['fixture'], 'meal.jpg')]);
  finish = vi.fn();
  ui.configureNutritionComparisonUI({ analysisFiles: (...args) => files(...args), startRequest: () => new AbortController(), isRequestActive: c => !c.signal.aborted, finishRequest: finish, updateCorrectionState: vi.fn(), hasPhotos: () => true, beforeApplyAnalysis: vi.fn(), applyAnalysis: vi.fn(), setStatus: vi.fn() });
  deps.prepare.mockResolvedValue([{fixture:true}]); deps.analyze.mockResolvedValue(result); deps.load.mockResolvedValue(snapshot);
});
afterEach(() => { ui.resetNutritionComparison(); vi.clearAllTimers(); vi.useRealTimers(); });

it('keeps the successful model when another model fails and retries only the failure', async () => {
  deps.analyze.mockRejectedValueOnce(new Error('Provider unavailable')).mockResolvedValue(result);
  await ui.runModelComparison();
  expect(deps.render.mock.lastCall[0].runs.map(r => r.status)).toEqual(['error','complete']);
  await ui.retryComparisonRun(0);
  expect(deps.analyze).toHaveBeenCalledTimes(3);
  expect(deps.render.mock.lastCall[0].runs.map(r => r.status)).toEqual(['complete','complete']);
  expect(finish).toHaveBeenCalledTimes(3);
});
it('discards a cancelled model even if its provider returns successfully', async () => {
  const gate = deferred(); deps.analyze.mockReturnValueOnce(gate.promise);
  const pending = ui.runModelComparison();
  await vi.waitFor(() => expect(deps.analyze).toHaveBeenCalledTimes(2));
  expect(ui.cancelComparisonRun(0)).toBe(true);
  gate.resolve(result); await pending;
  expect(deps.render.mock.lastCall[0].runs[0]).toMatchObject({status:'cancelled',result:null});
  expect(deps.render.mock.lastCall[0].runs[1].status).toBe('complete');
});
it.each(['reset','profile','data'])('does not start a comparison after %s during file preparation', async boundary => {
  const gate = deferred(); files.mockReturnValueOnce(gate.promise);
  const pending = ui.runModelComparison();
  if (boundary === 'reset') ui.resetNutritionComparison();
  else if (boundary === 'profile') state.currentProfile = 'destination';
  else state.importedData = {entries:[]};
  gate.resolve([new File(['late'], 'late.jpg')]); await pending;
  expect(deps.analyze).not.toHaveBeenCalled();
  expect(ui.hasNutritionComparisonRuns()).toBe(false);
});
it('does not restore a closed comparison after a delayed storage read', async () => {
  const gate = deferred(); deps.load.mockReturnValueOnce(gate.promise);
  const pending = ui.restoreNutritionComparison();
  ui.resetNutritionComparison();
  gate.resolve(snapshot);
  expect(await pending).toBe(false);
  expect(ui.hasNutritionComparisonRuns()).toBe(false);
});
it('ignores history returned for a different profile', async () => {
  const gate = deferred(); deps.load.mockReturnValueOnce(gate.promise);
  const pending = ui.restoreNutritionComparison(); state.currentProfile = 'other'; gate.resolve(snapshot);
  expect(await pending).toBe(false);
});
it('reports photo preparation failure and releases every request', async () => {
  deps.prepare.mockRejectedValueOnce(new Error('Unreadable photo'));
  await ui.runModelComparison();
  expect(ui.isNutritionComparisonRunning()).toBe(false);
  expect(deps.render.mock.lastCall[0].runs.map(r => r.status)).toEqual(['error','error']);
  expect(finish).toHaveBeenCalledTimes(2);
  expect(deps.analyze).not.toHaveBeenCalled();
});
it('does not clear a newly restored profile after an old clear completes', async () => {
  await ui.restoreNutritionComparison();
  const gate = deferred(); deps.save.mockReturnValueOnce(gate.promise);
  const clearing = ui.clearSavedNutritionComparison();
  ui.resetNutritionComparison(); state.currentProfile = 'destination';
  await ui.restoreNutritionComparison();
  gate.resolve(); await clearing;
  expect(deps.render.mock.lastCall[0].runs).toHaveLength(1);
});
it('does not apply a result after reset while the editor handoff awaits', async () => {
  await ui.restoreNutritionComparison();
  const gate = deferred(); const apply = vi.fn();
  ui.configureNutritionComparisonUI({ beforeApplyAnalysis: () => gate.promise, applyAnalysis: apply });
  const pending = ui.useComparisonEstimate(0);
  ui.resetNutritionComparison(); gate.resolve(); await pending;
  expect(apply).not.toHaveBeenCalled();
});
it('does not apply a result after same-profile data replacement during handoff', async () => {
  await ui.restoreNutritionComparison();
  const gate = deferred(); const apply = vi.fn();
  ui.configureNutritionComparisonUI({ beforeApplyAnalysis: () => gate.promise, applyAnalysis: apply });
  const pending = ui.useComparisonEstimate(0);
  state.importedData = {entries:[]}; gate.resolve(); await pending;
  expect(apply).not.toHaveBeenCalled();
});
it('does not launch two batches from double activation while files load', async () => {
  const gate = deferred(); files.mockReturnValue(gate.promise);
  const first = ui.runModelComparison(); const second = ui.runModelComparison();
  gate.resolve([new File(['fixture'], 'meal.jpg')]);
  await Promise.all([first, second]);
  expect(deps.analyze).toHaveBeenCalledTimes(2);
});
it('keeps a restored result available if clearing storage fails', async () => {
  await ui.restoreNutritionComparison();
  deps.save.mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(ui.clearSavedNutritionComparison()).rejects.toThrow('Storage unavailable');
  expect(deps.render.mock.lastCall[0].runs).toHaveLength(1);
});
it('does not replace a newly executed comparison with an older storage response', async () => {
  const gate = deferred(); deps.load.mockReturnValueOnce(gate.promise);
  const restoring = ui.restoreNutritionComparison();
  await ui.runModelComparison(); gate.resolve(snapshot);
  expect(await restoring).toBe(false);
  expect(deps.render.mock.lastCall[0].runs).toHaveLength(2);
});
it('applies an unchanged restored estimate after the editor handoff', async () => {
  await ui.restoreNutritionComparison(); const apply = vi.fn();
  ui.configureNutritionComparisonUI({ applyAnalysis: apply });
  await ui.useComparisonEstimate(0);
  expect(apply).toHaveBeenCalledWith(expect.objectContaining({analysis:result.analysis,images:[]}), {quiet:true});
});
it('retains comparison images only in memory when saving history', async () => {
  deps.analyze.mockResolvedValueOnce({...result,image:'private-photo',images:['private-photo']});
  await ui.runModelComparison(); await vi.advanceTimersByTimeAsync(180);
  const saved = deps.save.mock.lastCall;
  expect(saved[0]).toBe('origin');
  expect(saved[1].runs[0].result).toMatchObject({image:null,images:[]});
});
it('reports a durable save failure without hiding a successful model result', async () => {
  deps.save.mockRejectedValueOnce(new Error('Quota exceeded'));
  await ui.runModelComparison(); await vi.advanceTimersByTimeAsync(180);
  expect(deps.notify).toHaveBeenCalledWith('Quota exceeded','error');
  expect(deps.render.mock.lastCall[0].runs.map(r => r.status)).toEqual(['complete','complete']);
});
it('clearing history cancels active requests and prevents late results from repopulating it', async () => {
  const gate = deferred(); deps.analyze.mockReturnValue(gate.promise);
  const pending = ui.runModelComparison();
  await vi.waitFor(() => expect(deps.analyze).toHaveBeenCalledTimes(2));
  await ui.clearSavedNutritionComparison();
  gate.resolve(result); await pending; await vi.advanceTimersByTimeAsync(180);
  expect(ui.isNutritionComparisonRunning()).toBe(false);
  expect(deps.render.mock.lastCall[0].runs).toHaveLength(0);
  expect(deps.save).toHaveBeenCalledTimes(1);
  expect(deps.save).toHaveBeenCalledWith('origin',null);
  expect(finish).toHaveBeenCalledTimes(2);
});
