// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createProfile, createDefaultProfileData, getProfiles, saveProfiles, profileStorageKey } from '../js/profile.js';
import { saveImportedData, invalidateActiveDataCache } from '../js/data.js';
import * as crypto from '../js/crypto.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { configureDataRuntimeDeps } from '../js/data-view-controls.js';
import { readLabCorrelations, openLabCorrelations } from '../js/correlation-view-controls.js';
import { saveCorrelationWorkspace, restoreCorrelationWorkspace, readCorrelationWorkspaceSnapshot } from '../js/correlation-workspace-store.js';
import { setContextSourceEnabled } from '../js/context-source-registry.js';
import { setGroupInAIContext } from '../js/lab-context-settings.js';
import { createAppControlSession } from '../js/app-control-session.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
const original = { profile: state.currentProfile, data: state.importedData, thread: state.currentThreadId, history: state.chatHistory, view: state.currentView, markers: state.selectedCorrelationMarkers, therapies: state.selectedCorrelationSupplements, correlation: state.correlationView }, active = localStorage.getItem('labcharts-active-profile'), locks = navigator.locks;
let profile: string, healthKey: string, workspaceKey: string, restore: ReturnType<typeof configureDataRuntimeDeps>;
beforeEach(async () => {
  const queues = new Map<string, Promise<unknown>>(); Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (name: string, options: unknown, callback?: () => unknown) => { const run = typeof options === 'function' ? options as () => unknown : callback!; const pending = (queues.get(name) || Promise.resolve()).then(run); queues.set(name, pending.catch(() => {})); return pending; } } });
  profile = await createProfile('Synthetic correlation control', { skipInitialSync: true }); healthKey = profileStorageKey(profile, 'imported'); workspaceKey = profileStorageKey(profile, 'correlation-workspace');
  state.currentProfile = profile; state.importedData = createDefaultProfileData(); state.currentThreadId = 'correlation-thread'; state.chatHistory = []; state.currentView = 'dashboard'; state.selectedCorrelationMarkers = []; state.selectedCorrelationSupplements = []; state.correlationView = {}; localStorage.setItem('labcharts-active-profile', profile);
  state.importedData.entries = Array.from({ length: 6 }, (_, i) => ({ date: `2026-0${i + 1}-01`, markers: { 'biochemistry.glucose': 4 + i, 'biochemistry.urea': 2 + i * 2, 'diabetes.hba1c': 5 + i }, sourceFile: 'PRIVATE_REPORT.pdf' }));
  state.importedData.entries.push({ date: '2026-10-27', markers: { 'privateOnly.fixture': 777 }, sourceFile: 'PRIVATE_REPORT.pdf' }); state.importedData.customMarkers = { 'privateOnly.fixture': { markerId: 'custom:correlation-private', name: 'PRIVATE_MARKER', unit: '', categoryLabel: 'PRIVATE_GROUP', contextGroup: 'PRIVATE_GROUP', group: 'PRIVATE_GROUP' } };
  state.importedData.contextNotes = 'PRIVATE_NOTE'; state.importedData.supplements = [{ id: 'fixture-treatment', name: 'Fixture treatment', type: 'supplement', startDate: '2025-01-01', dosage: 'PRIVATE_DOSE' }];
  setContextSourceEnabled('lab-markers', true); setContextSourceEnabled('supplements-meds', true); setGroupInAIContext('Biochemistry', true); setGroupInAIContext('Blood sugar', true); setGroupInAIContext('PRIVATE_GROUP', false); expect(await saveImportedData()).toBe(true);
  document.body.innerHTML = '<main id="main-content"><p>Retained view</p></main><div id="detail-modal"></div>'; restore = configureDataRuntimeDeps({ navigate: () => false });
});
afterEach(async () => {
  vi.restoreAllMocks(); clearSyncSaveTimers(); configureDataRuntimeDeps(restore); document.body.innerHTML = '';
  await crypto.encryptedRemoveItem(healthKey, { throwOnBlobError: true }); for (const name of Object.keys(localStorage).filter(name => name.startsWith(`labcharts-${profile}-`))) await crypto.encryptedRemoveItem(name); await saveProfiles(getProfiles().filter(row => row.id !== profile));
  state.currentProfile = original.profile; state.importedData = original.data; state.currentThreadId = original.thread; state.chatHistory = original.history; state.currentView = original.view; state.selectedCorrelationMarkers = original.markers; state.selectedCorrelationSupplements = original.therapies; state.correlationView = original.correlation; invalidateActiveDataCache(); Object.defineProperty(navigator, 'locks', { configurable: true, value: locks });
  if (active === null) localStorage.removeItem('labcharts-active-profile'); else localStorage.setItem('labcharts-active-profile', active);
});
async function read() { const result = await readLabCorrelations(profile); expect(result.snapshotId).toBeTypeOf('string'); return result; }
async function command(patch: object, snapshot?: Awaited<ReturnType<typeof read>>) { snapshot ??= await read(); return openLabCorrelations({ view: 'correlations', marker: '', snapshotId: snapshot.snapshotId!, correlation: JSON.stringify(patch) }, () => true); }
async function undo(undoId: string, snapshot?: Awaited<ReturnType<typeof read>>) { snapshot ??= await read(); return openLabCorrelations({ view: 'correlations', marker: '', snapshotId: snapshot.snapshotId!, undoId }, () => true); }
const markers = ['biochemistry.glucose', 'biochemistry.urea'];
it('reads only permitted metadata without measurements, doses, private notes or saved preferences', async () => {
  const before = await crypto.encryptedGetItem(healthKey), result = await read(); expect(result.items.some(item => item.id === markers[0])).toBe(true); expect(result.items.some(item => item.id === 'fixture-treatment')).toBe(true); expect(JSON.stringify(result)).not.toMatch(/PRIVATE_|sourceFile|refMin|"values"/); expect(result.current?.markers).toEqual([]); expect(await crypto.encryptedGetItem(workspaceKey)).toBeNull(); expect(await crypto.encryptedGetItem(healthKey)).toBe(before);
});
it('saves exact selections, reports a failed native open truthfully and restores the captured absence with guarded Undo', async () => {
  const before = await crypto.encryptedGetItem(healthKey), result = await command({ markers }); expect(result).toMatchObject({ changed: true, settingsSaved: true, dataSaved: false, opened: null }); expect(result.undoId).toBeTypeOf('string'); expect(state.selectedCorrelationMarkers).toEqual(markers); expect(JSON.parse((await crypto.encryptedGetItem(workspaceKey))!).markers).toEqual(markers); expect(await crypto.encryptedGetItem(healthKey)).toBe(before);
  expect((await read()).undoIds).toContain(result.undoId); expect(await undo(result.undoId!)).toMatchObject({ undone: true, settingsSaved: true }); expect(state.selectedCorrelationMarkers).toEqual([]); expect(await crypto.encryptedGetItem(workspaceKey)).toBeNull(); expect(await crypto.encryptedGetItem(healthKey)).toBe(before); expect(await undo(result.undoId!)).toMatchObject({ changed: false });
});
it('keeps selected treatments when replacing markers or applying a native preset', async () => {
  await command({ therapies: ['fixture-treatment'] }); await command({ markers }); expect(state.selectedCorrelationSupplements).toEqual(['fixture-treatment']); await command({ preset: 'native:2' }); expect(state.selectedCorrelationMarkers).toContain('biochemistry.glucose'); expect(state.selectedCorrelationMarkers).not.toContain('biochemistry.urea'); expect(state.selectedCorrelationSupplements).toEqual(['fixture-treatment']);
});
it('retains all seven selected treatments and limits a native preset to one marker', async () => {
  state.importedData.supplements = Array.from({ length: 7 }, (_, i) => ({ id: 'fixture-' + i, name: 'Fixture ' + i, type: 'supplement' })); expect(await saveImportedData()).toBe(true); state.selectedCorrelationSupplements = state.importedData.supplements.map(row => row.id!); await command({ preset: 'native:2' }); expect(state.selectedCorrelationMarkers).toEqual(['biochemistry.glucose']); expect(state.selectedCorrelationSupplements).toHaveLength(7);
});
it('uses exact current pairs and native timeline bounds for view controls', async () => {
  await command({ markers }); const current = await read(), pair = current.pairs[0]!.id;
  await command({ view: { rangePreset: 'custom', start: '2026-01-01', end: '2026-06-01', layout: 'lanes', grouping: 'separate', tab: 'data', pairKey: pair, hidden: [markers[1]], analysisOpen: true, inspectDate: '2026-03-01' } }, current);
  expect(state.correlationView).toMatchObject({ start: '2026-01-01', end: '2026-06-01', layout: 'lanes', grouping: 'separate', tab: 'data', pairKey: pair, hidden: [markers[1]], analysisOpen: true, inspectDate: '2026-03-01' }); await command({ view: { inspectDate: null, hidden: [] } }); expect(state.correlationView).not.toHaveProperty('inspectDate'); expect(state.correlationView.hidden).toEqual([]);
});
it('does not reveal a stale pair key left behind by an older private selection', async () => {
  state.correlationView.pairKey = 'PRIVATE_OLD_PAIR'; const current = await read(); expect(JSON.stringify(current)).not.toContain('PRIVATE_OLD_PAIR'); expect(current.current?.view).not.toHaveProperty('pairKey');
});
it('withholds workspace details and command authority for a currently private selection', async () => {
  state.selectedCorrelationMarkers = ['privateOnly.fixture']; const current = await readLabCorrelations(profile); expect(current.snapshotId).toBeNull(); expect(current.current).toBeNull(); expect(JSON.stringify(current)).not.toContain('privateOnly.fixture'); expect(await crypto.encryptedGetItem(workspaceKey)).toBeNull();
});
it.each(['profile', 'thread', 'root', 'selection', 'inventory', 'source', 'group'] as const)('rejects a stale %s before durable writes', async cause => {
  const current = await read(); if (cause === 'profile') state.currentProfile = 'other'; if (cause === 'thread') state.currentThreadId = 'other'; if (cause === 'root') state.importedData = structuredClone(state.importedData); if (cause === 'selection') state.selectedCorrelationMarkers = [markers[0]!]; if (cause === 'inventory') { state.importedData.entries[0]!.markers['biochemistry.glucose'] = 50; invalidateActiveDataCache(); } if (cause === 'source') setContextSourceEnabled('lab-markers', false); if (cause === 'group') setGroupInAIContext('Biochemistry', false);
  expect(await command({ markers }, current)).toMatchObject({ changed: false, settingsSaved: false }); expect(await crypto.encryptedGetItem(workspaceKey)).toBeNull();
});
it('rejects a newer saved footprint and leaves it intact', async () => {
  const current = await read(), raw = JSON.stringify({ version: 1, markers: [], therapies: [], view: { hidden: [], ingredients: {}, tab: 'data' } }); await crypto.encryptedSetItem(workspaceKey, raw); expect(await command({ markers }, current)).toMatchObject({ changed: false }); expect(await crypto.encryptedGetItem(workspaceKey)).toBe(raw); expect(state.selectedCorrelationMarkers).toEqual([]);
});
it('cannot undo over a newer native selection or replay a consumed snapshot', async () => {
  const current = await read(), result = await command({ markers }, current); expect(await command({ markers: [] }, current)).toMatchObject({ changed: false }); state.selectedCorrelationMarkers = [markers[0]!]; await saveCorrelationWorkspace(); expect(await undo(result.undoId!)).toMatchObject({ changed: false }); expect(state.selectedCorrelationMarkers).toEqual([markers[0]]);
});
it('rejects forged Undo IDs and unknown items without changing settings', async () => {
  expect(await undo('forged-proof')).toMatchObject({ changed: false }); await expect(command({ markers: ['privateOnly.fixture'] })).rejects.toMatchObject({ noChangeApplied: true }); expect(await crypto.encryptedGetItem(workspaceKey)).toBeNull();
});
it('keeps an unfamiliar saved workspace intact and offers no write snapshot', async () => {
  const raw = '{"version":2,"future":{"keep":true}}'; await crypto.encryptedSetItem(workspaceKey, raw); const current = await readLabCorrelations(profile); expect(current.snapshotId).toBeNull(); expect(current.current).toBeNull(); expect(await crypto.encryptedGetItem(workspaceKey)).toBe(raw);
});
it('does not claim a failed preference write was saved or publish a selection', async () => {
  const write = Storage.prototype.setItem; vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) { if (key === workspaceKey) throw new Error('Synthetic preference failure'); return write.call(this, key, value); }); expect(await command({ markers })).toMatchObject({ changed: false, settingsSaved: false }); expect(state.selectedCorrelationMarkers).toEqual([]); expect(await crypto.encryptedGetItem(workspaceKey)).toBeNull();
});
it('preserves the actual saved outcome and withholds Undo after source withdrawal during rendering', async () => {
  configureDataRuntimeDeps({ navigate: () => { setContextSourceEnabled('lab-markers', false); return false; } }); const result = await command({ markers }); expect(result).toMatchObject({ changed: true, settingsSaved: true, dataSaved: false, opened: null }); expect(result).not.toHaveProperty('undoId'); expect(JSON.parse((await crypto.encryptedGetItem(workspaceKey))!).markers).toEqual(markers);
});
it('restores selected workspace preferences without changing clinical records', async () => {
  const before = await crypto.encryptedGetItem(healthKey); await command({ markers }); state.selectedCorrelationMarkers = []; state.correlationView = {}; await restoreCorrelationWorkspace(profile); expect(state.selectedCorrelationMarkers).toEqual(markers); expect(await crypto.encryptedGetItem(healthKey)).toBe(before);
});
it('uses the shared provider-neutral tools without creating data proposals or review cards', async () => {
  const message = 'Compare glucose and urea trends.', session = createAppControlSession(message, () => true, new AbortController().signal), tools = createAgentToolRuntime({ readContext: () => '', userMessage: message, ...session.tools, navigate: request => openLabCorrelations(request, () => true) });
  const result = await tools.execute({ tool: 'getbased_read_app', arguments: { action: 'labs.correlations' } }); expect(result.success).toBe(true); const current = JSON.parse(result.contentItems[0].text); const selected = await tools.execute({ tool: 'getbased_navigate', arguments: { view: 'correlations', snapshotId: current.snapshotId, correlation: JSON.stringify({ markers }) } }); expect(selected.success).toBe(true); expect(JSON.parse(selected.contentItems[0].text)).toMatchObject({ settingsSaved: true, dataSaved: false }); expect(session.finish()).toEqual([]); expect(tools.getDrafts()).toEqual([]); expect((await readCorrelationWorkspaceSnapshot(profile)).workspace.markers).toEqual(markers);
});
