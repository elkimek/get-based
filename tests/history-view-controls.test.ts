// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createProfile, createDefaultProfileData, getProfiles, saveProfiles, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as crypto from '../js/crypto.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { setContextSourceEnabled } from '../js/context-source-registry.js';
import { readHistoryViews, openHistoryView } from '../js/history-view-controls.js';
import { readHistoryViewPreferences } from '../js/history-view-preferences.js';
import { createAppControlSession } from '../js/app-control-session.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { NUTRITION_VIEW_RANGES, WEARABLE_VIEW_RANGES } from '../shared/history-view-contract.js';
const renderer = vi.hoisted(() => ({ nutrition: vi.fn(async () => false), load: vi.fn(async () => ({})), styles: vi.fn(async () => true), nutritionStyles: vi.fn<() => Promise<Event | void>>(async () => undefined) }));
vi.mock('../js/nutrition-history.js', () => ({ openNutritionHistory: renderer.nutrition }));
vi.mock('../js/nutrition-context.js', () => ({ loadNutritionFeature: async () => ({}) }));
vi.mock('../js/nutrition-render.js', () => ({ ensureNutritionStylesheet: renderer.nutritionStyles }));
vi.mock('../js/wearables-runtime.js', () => ({ loadWearablesModule: renderer.load, loadWearablesStylesheetForAction: renderer.styles }));
const original = { profile: state.currentProfile, data: state.importedData, thread: state.currentThreadId, history: state.chatHistory }, locks = navigator.locks;
let profile: string, healthKey: string;
beforeEach(async () => {
  localStorage.clear(); renderer.nutrition.mockReset().mockResolvedValue(false); renderer.load.mockClear(); renderer.styles.mockReset().mockResolvedValue(true); renderer.nutritionStyles.mockReset().mockResolvedValue(undefined);
  const queues = new Map<string, Promise<unknown>>(); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (name: string, options: unknown, callback?: () => unknown) => { const run = typeof options === 'function' ? options as () => unknown : callback!; const pending = (queues.get(name) || Promise.resolve()).then(run); queues.set(name, pending.catch(() => {})); return pending; } } });
  profile = await createProfile('Synthetic history controls', { skipInitialSync: true }); healthKey = profileStorageKey(profile, 'imported'); state.currentProfile = profile; state.importedData = createDefaultProfileData(); state.currentThreadId = 'history-thread'; state.chatHistory = [];
  state.importedData.contextNotes = 'PRIVATE_NOTE'; state.importedData.wearableSummary = { sources: { manual: { privateToken: 'PRIVATE_SOURCE' } }, metrics: { weight: { primarySource: 'manual', latest: 777, baseline: 888, weekly: [{ value: 999 }] }, bp_systolic: { primarySource: 'manual' }, bp_diastolic: { primarySource: 'manual' }, unknown_private: { primarySource: 'manual' }, steps: { primarySource: '' } } };
  setContextSourceEnabled('wearables', true); expect(await saveImportedData()).toBe(true);
});
afterEach(async () => {
  vi.restoreAllMocks(); clearSyncSaveTimers(); await crypto.encryptedRemoveItem(healthKey); await saveProfiles(getProfiles().filter(row => row.id !== profile)); state.currentProfile = original.profile; state.importedData = original.data; state.currentThreadId = original.thread; state.chatHistory = original.history; Object.defineProperty(navigator, 'locks', { configurable: true, value: locks }); document.body.innerHTML = '';
});
const read = () => readHistoryViews(profile);
const command = (view: string, patch: object, snapshot = read()) => openHistoryView({ view, marker: '', snapshotId: snapshot.snapshotId, history: JSON.stringify(patch) }, () => true);
const undo = (view: string, undoId: string) => openHistoryView({ view, marker: '', snapshotId: read().snapshotId, undoId }, () => true);
it('reads only canonical permitted identifiers and scoped display settings without measurements or private source details', async () => {
  const before = await crypto.encryptedGetItem(healthKey), current = read(); expect(current.wearableMetrics).toEqual([{ id: 'weight', label: 'Weight' }, { id: 'bp_systolic', label: 'BP', aliases: ['bp_diastolic'] }]); expect(current.scopes).toMatchObject({ nutritionRange: 'browser', wearableRange: 'browser' }); expect(JSON.stringify(current)).not.toMatch(/PRIVATE_|latest|baseline|weekly|privateToken|"(?:777|888|999)"|:(?:777|888|999)(?=[,}\]])/); expect(readHistoryViews(profile, { offset: 1, limit: 1 }).wearableMetrics.map(row => row.id)).toEqual(['bp_systolic']); expect(readHistoryViews(profile, { query: 'weight' }).totalMetrics).toBe(1); expect(await crypto.encryptedGetItem(healthKey)).toBe(before);
});
it('withholds metric presence and detail authority when wearable disclosure is off', async () => {
  setContextSourceEnabled('wearables', false); expect(read().wearableMetrics).toEqual([]); expect(read().currentWearableMetric).toBeNull(); expect(await command('wearableDetail', { metricId: 'weight', wearableRange: 'all' })).toMatchObject({ changed: false, settingsSaved: false }); expect(renderer.load).not.toHaveBeenCalled(); expect(localStorage.getItem('wearable-detail-range')).toBeNull();
});
it.each(NUTRITION_VIEW_RANGES.flatMap(range => ['meals', 'trends'].map(view => [range, view] as const)))('commits native nutrition range %s and tab %s without claiming a failed native paint opened', async (nutritionRange, nutritionView) => {
  const before = await crypto.encryptedGetItem(healthKey), result = await command('nutritionHistory', { nutritionRange, nutritionView }); expect(result).toMatchObject({ settingsSaved: true, dataSaved: false, opened: null }); expect(localStorage.getItem('nutrition-history-range')).toBe(nutritionRange); expect(localStorage.getItem('nutrition-history-view')).toBe(nutritionView); expect(renderer.nutrition).toHaveBeenCalledExactlyOnceWith(nutritionRange, { view: nutritionView, persistPreferences: false }, expect.any(Function)); expect(await crypto.encryptedGetItem(healthKey)).toBe(before);
});
it.each(WEARABLE_VIEW_RANGES)('commits supported wearable range %s using an exact available metric', async wearableRange => {
  // A missing modal is deliberately not a successful paint; persistence is still verifiable.
  expect(await command('wearableDetail', { metricId: 'weight', wearableRange })).toMatchObject({ settingsSaved: true, dataSaved: false, opened: null }); expect(localStorage.getItem('wearable-detail-range')).toBe(wearableRange);
});
it('rejects unavailable metric IDs before loading the feature or touching preferences', async () => {
  expect(await command('wearableDetail', { metricId: 'unknown_private', wearableRange: 'all' })).toMatchObject({ changed: false }); expect(renderer.load).not.toHaveBeenCalled(); expect(localStorage.getItem('wearable-detail-range')).toBeNull();
});
it('returns exact field guidance for a malformed model call and permits a corrected retry without consuming its snapshot', async () => {
  const snapshot = read(), tools = createAgentToolRuntime({ readContext: () => '', navigate: request => openHistoryView(request, () => true) }); expect(snapshot.historyFields.wearableDetail.required).toEqual(['metricId']); const bad = await tools.execute({ tool: 'getbased_navigate', arguments: { view: 'wearableDetail', snapshotId: snapshot.snapshotId, history: '{"wearableMetricId":"weight","wearableRange":"all"}' } }); expect(bad.success).toBe(false); expect(bad.contentItems[0].text).toContain('metricId (required)'); expect(localStorage.getItem('wearable-detail-range')).toBeNull(); expect(renderer.load).not.toHaveBeenCalled(); const corrected = await tools.execute({ tool: 'getbased_navigate', arguments: { view: 'wearableDetail', snapshotId: snapshot.snapshotId, history: '{"metricId":"weight","wearableRange":"all"}' } }); expect(corrected.success).toBe(true); expect(JSON.parse(corrected.contentItems[0].text)).toMatchObject({ settingsSaved: true, dataSaved: false });
});
it('preserves exact absent and unfamiliar raw values with one-use, field-scoped Undo', async () => {
  localStorage.setItem('nutrition-history-range', 'future-range'); const first = read(), result = await command('nutritionHistory', { nutritionRange: 'all' }, first); expect(result.undoId).toBeTypeOf('string'); expect(await command('nutritionHistory', { nutritionView: 'trends' }, first)).toMatchObject({ changed: false }); localStorage.setItem('wearable-detail-range', '1y'); expect(await undo('nutritionHistory', result.undoId!)).toMatchObject({ undone: true, settingsSaved: true }); expect(localStorage.getItem('nutrition-history-range')).toBe('future-range'); expect(localStorage.getItem('wearable-detail-range')).toBe('1y'); expect(await undo('nutritionHistory', result.undoId!)).toMatchObject({ changed: false });
  const tab = await command('nutritionHistory', { nutritionView: 'trends' }); expect(await undo('nutritionHistory', tab.undoId!)).toMatchObject({ undone: true }); expect(localStorage.getItem('nutrition-history-view')).toBeNull();
});
it('rejects a changed target while preserving unrelated newer preferences', async () => {
  const first = read(), unrelated = read(); localStorage.setItem('nutrition-history-range', '1y'); expect(await command('nutritionHistory', { nutritionRange: 'all' }, first)).toMatchObject({ changed: false }); expect(localStorage.getItem('nutrition-history-range')).toBe('1y'); expect(await command('nutritionHistory', { nutritionView: 'trends' }, unrelated)).toMatchObject({ settingsSaved: true }); expect(localStorage.getItem('nutrition-history-range')).toBe('1y');
});
it('rejects forged, mismatched or superseded Undo without overwriting the native preference', async () => {
  expect(await undo('nutritionHistory', 'forged')).toMatchObject({ changed: false }); const result = await command('nutritionHistory', { nutritionRange: 'all' }); expect(await undo('wearableStrip', result.undoId!)).toMatchObject({ changed: false }); localStorage.setItem('nutrition-history-range', '6m'); expect(read().undoChoices).toEqual([]); expect(await undo('nutritionHistory', result.undoId!)).toMatchObject({ changed: false }); expect(localStorage.getItem('nutrition-history-range')).toBe('6m');
});
it.each(['profile', 'thread', 'history', 'root', 'source'] as const)('rejects stale %s ownership before saving', async cause => {
  const current = read(); if (cause === 'profile') state.currentProfile = 'replacement'; if (cause === 'thread') state.currentThreadId = 'replacement'; if (cause === 'history') state.chatHistory = []; if (cause === 'root') state.importedData = structuredClone(state.importedData); if (cause === 'source') setContextSourceEnabled('wearables', false); expect(await command('nutritionHistory', { nutritionRange: 'all' }, current)).toMatchObject({ changed: false, settingsSaved: false }); expect(localStorage.getItem('nutrition-history-range')).toBeNull();
});
it('rejects an editor guard and a failed stylesheet before preference writes', async () => {
  expect(await openHistoryView({ view: 'nutritionHistory', marker: '', snapshotId: read().snapshotId, history: '{"nutritionRange":"all"}' }, () => false)).toMatchObject({ changed: false }); renderer.styles.mockResolvedValueOnce(false); expect(await command('wearableDetail', { metricId: 'weight', wearableRange: 'all' })).toMatchObject({ changed: false }); expect(localStorage.getItem('wearable-detail-range')).toBeNull();
});
it('rejects a failed nutrition stylesheet before saving preferences or mounting content', async () => {
  renderer.nutritionStyles.mockResolvedValueOnce(new Event('error')); expect(await command('nutritionHistory', { nutritionRange: 'all' })).toMatchObject({ changed: false, settingsSaved: false }); expect(localStorage.getItem('nutrition-history-range')).toBeNull(); expect(renderer.nutrition).not.toHaveBeenCalled();
});
it('reports a rejected storage write accurately and never asks the renderer to paint it', async () => {
  const set = Storage.prototype.setItem; vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) { if (key === 'nutrition-history-view') throw new Error('Synthetic full storage'); return set.call(this, key, value); }); expect(await command('nutritionHistory', { nutritionRange: 'all', nutritionView: 'trends' })).toMatchObject({ changed: false, settingsSaved: false, dataSaved: false }); expect(localStorage.getItem('nutrition-history-range')).toBeNull(); expect(renderer.nutrition).not.toHaveBeenCalled();
});
it('retains the confirmed save receipt and withholds old details after ownership retires during presentation', async () => {
  renderer.nutrition.mockImplementationOnce(async () => { state.currentThreadId = 'replacement'; return false; }); const result = await command('nutritionHistory', { nutritionRange: 'all' }); expect(result).toMatchObject({ changed: true, settingsSaved: true, dataSaved: false, opened: null }); expect(result).not.toHaveProperty('undoId'); expect(localStorage.getItem('nutrition-history-range')).toBe('all');
});
it('does not erase a confirmed save when the optional Undo proof read fails', async () => {
  renderer.nutrition.mockImplementationOnce(async () => { const get = Storage.prototype.getItem; vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) { if (key === 'nutrition-history-range') throw new Error('Synthetic post-save read failure'); return get.call(this, key); }); return false; }); const result = await command('nutritionHistory', { nutritionRange: 'all' }); expect(result).toMatchObject({ settingsSaved: true, dataSaved: false, opened: null }); expect(result).not.toHaveProperty('undoId');
});
it('uses the same provider-neutral action tools without creating clinical proposals', async () => {
  const message = 'Show my nutrition history as Trends for the last year.', session = createAppControlSession(message, () => true, new AbortController().signal), tools = createAgentToolRuntime({ readContext: () => '', userMessage: message, ...session.tools, navigate: request => openHistoryView(request, () => true) }); const result = await tools.execute({ tool: 'getbased_read_app', arguments: { action: 'history.views' } }); expect(result.success).toBe(true); const current = JSON.parse(result.contentItems[0].text), moved = await tools.execute({ tool: 'getbased_navigate', arguments: { view: 'nutritionHistory', snapshotId: current.snapshotId, history: '{"nutritionRange":"1y","nutritionView":"trends"}' } }); expect(moved.success).toBe(true); expect(JSON.parse(moved.contentItems[0].text)).toMatchObject({ settingsSaved: true, dataSaved: false }); expect(session.finish()).toEqual([]); expect(tools.getDrafts()).toEqual([]); expect(readHistoryViewPreferences(profile).values).toMatchObject({ nutritionRange: '1y', nutritionView: 'trends' });
});
