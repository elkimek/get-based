// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { configureLightTools, saveMeasurement, getMeasurements, normalizeLightMeasurements } from '../js/light-tools.js';
import { configureLightEnvAudits } from '../js/light-env-audits.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { createBrowserAgentToolDependencies } from '../js/agent-tool-bindings.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import type { ProfileData } from '../types/app-state.js';

const previous = { profile: state.currentProfile, data: state.importedData, view: state.currentView };
let profile: string, key: string, auditDeps: ReturnType<typeof configureLightEnvAudits>;
const analyzeMeasurement = vi.fn(), analyzeAudit = vi.fn();
const evidence = 'My office meter reading was actually 250 lux. Save a checkpoint called Baseline. Remove that saved reading.';
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
const tools = () => createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) });
async function propose(resource = 'lightMeasurements', recordId = 'measure-office', patch = '{"value":250,"unit":"lux"}', operation = 'update', create = false) {
  const runtime = tools(), read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource, ...(create ? { create: true } : { recordId }) } });
  expect(read.success, read.contentItems[0].text).toBe(true); const current = JSON.parse(read.contentItems[0].text);
  const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource, operation, snapshotId: current.snapshotId, patch, evidence, reason: 'The user reported this measurement correction or checkpoint.' } });
  expect(result.success, result.contentItems[0].text).toBe(true);
  return { runtime, current, result, draft: { ...runtime.getDrafts()[0]!, profileId: profile } };
}
beforeEach(async () => {
  profile = `light-measurement-tools-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported');
  localStorage.setItem('labcharts-active-profile', profile); state.currentProfile = profile; state.currentView = 'dashboard'; state.importedData = createDefaultProfileData();
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, true);
  state.importedData.contextNotes = 'Preserve this unrelated note';
  state.importedData.lightEnvironment = { rooms: [{ id: 'room-office', name: 'Office', primarySource: 'led-warm', hoursOccupiedPerDay: 8 }], screens: [] };
  state.importedData.lightMeasurements = [{ id: 'measure-office', tool: 'lux', value: 100, capturedAt: Date.now() - 3600000, roomId: 'room-office', confidence: 0.85, extra: { source: 'manual-entry', context: 'daytime', annotation: '/private/measurement-sentinel' } }];
  state.importedData.lightAudits = [{ id: 'audit-before', date: '2026-10-23', label: 'Original', notes: '', createdAt: 1792749600000, rooms: structuredClone(state.importedData.lightEnvironment.rooms), screens: [], measurements: structuredClone(state.importedData.lightMeasurements) }];
  expect(await saveImportedData()).toBe(true);
  analyzeMeasurement.mockClear(); analyzeAudit.mockClear(); configureLightTools({ maybeAnalyzeMeasurementAfterSave: analyzeMeasurement });
  auditDeps = configureLightEnvAudits({ maybeAnalyzeAuditAfterSave: analyzeAudit });
});
afterEach(async () => {
  configureLightTools({ maybeAnalyzeMeasurementAfterSave: () => {} }); configureLightEnvAudits(auditDeps); vi.restoreAllMocks(); clearSyncSaveTimers();
  await storage.encryptedRemoveItem(key); state.currentProfile = previous.profile; state.importedData = previous.data; state.currentView = previous.view;
});
it('reviews and persists an exact meter correction without rewriting its frozen audit evidence', async () => {
  const before = await stored(), { draft, result } = await propose();
  expect(JSON.stringify(result)).not.toMatch(/private|measurement-sentinel/); expect(await stored()).toEqual(before);
  await applyAgentDraft(draft); const saved = await stored();
  expect(saved.lightMeasurements![0].value).toBe(250); expect(saved.lightAudits).toEqual(before.lightAudits); expect(saved.contextNotes).toBe(before.contextNotes);
});

it('does not publish a native replacement or start analysis after storage failure', async () => {
  const before = await stored(), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic disk failure'); return write(...args); });
  expect(await saveMeasurement('lux', 200, { roomId: 'room-office', extra: { source: 'manual-entry' } })).toBeNull();
  expect(state.importedData).toEqual(before); expect(await stored()).toEqual(before); expect(analyzeMeasurement).not.toHaveBeenCalled();
});


it('reviews latest-key replacement and retains original acquisition privately', async () => {
  const before = await stored(), at = new Date(Date.now() - 60000).toISOString();
  const { draft, result, current } = await propose('lightMeasurements', '', JSON.stringify({ tool: 'lux', value: 300, unit: 'lux', method: 'meter-entry', roomId: 'room-office', capturedAt: at }), 'add', true);
  const review = JSON.parse(result.contentItems[0].text).review; expect(review.effects.replacedMeasurements).toHaveLength(1); expect(review.effects.preservedAuditCount).toBe(1);
  await applyAgentDraft(draft); const saved = await stored(), row = saved.lightMeasurements![0];
  expect(row.id).toBe(current.recordId); expect(row.value).toBe(300); expect(row.confidence).toBeNull();
  expect(row.readingHistory[0].record.extra.annotation).toBe('/private/measurement-sentinel'); expect(saved._deleted?.lightMeasurements).toContain('measure-office'); expect(saved.lightAudits).toEqual(before.lightAudits);
});
it('preserves only the reported value while retaining original inputs and invalidating saved analysis', async () => {
  state.importedData.lightMeasurements![0].aiAnalysis = { status: 'ok', detail: 'Original result' }; expect(await saveImportedData()).toBe(true);
  const before = await stored(), { draft, result } = await propose(); expect(JSON.parse(result.contentItems[0].text).review.effects.analysisCleared).toBe(true);
  await applyAgentDraft(draft); const row = (await stored()).lightMeasurements![0];
  expect(row.extra.source).toBe('manual-entry'); expect(row.aiAnalysis).toBeUndefined(); expect(row.readingHistory[0].record).toEqual(before.lightMeasurements![0]);
});
it.each([
  { value: -1, unit: 'lux' }, { value: 250 }, { unit: 'lux' }, { value: 250, unit: 'fc' },
  { tool: 'darkness' }, { method: 'meter-entry' }, { confidence: 1 }, { extra: { source: 'meter-entry' } },
  { capturedAt: '2026-02-30T10:00:00Z' }, { capturedAt: '2026-10-23' }, { capturedAt: '2099-01-01T10:00:00Z' }, { roomId: 'missing-room' },
])('rejects unsupported or fabricated measurement facts without saving (%j)', async patch => {
  const before = await stored(), runtime = tools(), read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'lightMeasurements', recordId: 'measure-office' } });
  expect(read.success).toBe(true); const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'lightMeasurements', operation: 'update', snapshotId: JSON.parse(read.contentItems[0].text).snapshotId, patch: JSON.stringify(patch), evidence, reason: 'Reported change' } });
  expect(result.success).toBe(false); expect(runtime.getDrafts()).toHaveLength(0); expect(await stored()).toEqual(before);
});
it('does not replace a newer current reading with an older historical report', async () => {
  const before = await stored(), runtime = tools(), read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'lightMeasurements', create: true } });
  const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'lightMeasurements', operation: 'add', snapshotId: JSON.parse(read.contentItems[0].text).snapshotId, patch: JSON.stringify({ tool: 'lux', value: 50, unit: 'lux', capturedAt: new Date(Date.now() - 7200000).toISOString(), roomId: 'room-office' }), evidence, reason: 'Reported old reading' } });
  expect(result.success).toBe(false); expect(result.contentItems[0].text).toContain('newer'); expect(await stored()).toEqual(before);
});
it('keeps an explicitly reported camera darkness percentage qualitative and confidence unknown', async () => {
  const { draft } = await propose('lightMeasurements', '', JSON.stringify({ tool: 'darkness', value: 10, unit: 'camera-percent', method: 'camera-report', capturedAt: new Date(Date.now() - 60000).toISOString(), roomId: 'room-office' }), 'add', true);
  await applyAgentDraft(draft); const row = (await stored()).lightMeasurements!.find(row => row.tool === 'darkness');
  expect(row).toMatchObject({ value: 10, confidence: null, extra: { source: 'reported', method: 'camera-relative', cameraLevel: 10 } });
  expect(row.extra.method).not.toBe('meter-entry');
});
it('keeps failures retryable and does not publish a staged correction', async () => {
  const before = await stored(), { draft } = await propose(), write = storage.encryptedSetItem;
  const spy = vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic disk failure'); return write(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow('Could not save'); expect(state.importedData).toEqual(before); expect(await stored()).toEqual(before);
  spy.mockRestore(); await applyAgentDraft(draft); expect((await stored()).lightMeasurements![0].value).toBe(250);
});
it('rechecks private evidence changes inside the locked canonical write', async () => {
  const before = await stored(), { draft } = await propose(), read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  const peer = structuredClone(before); peer.lightAudits![0].measurements[0].extra.annotation = 'Private peer source';
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) await write(key, JSON.stringify(peer)); return read(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow('changed'); expect(await stored()).toEqual(peer); expect(state.importedData).toEqual(before);
});
it('rechecks revoked Light disclosure inside the locked canonical write', async () => {
  const before = await stored(), { draft } = await propose(), read = storage.encryptedGetItem; let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, false); return read(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow(/authorization|authorized/); expect(await stored()).toEqual(before);
});
it('preserves an unrelated visible draft without writing it during Apply', async () => {
  const before = await stored(), { draft } = await propose(); state.importedData.contextNotes = 'Unsubmitted note draft';
  await applyAgentDraft(draft); expect(state.importedData.contextNotes).toBe('Unsubmitted note draft'); expect((await stored()).contextNotes).toBe(before.contextNotes);
});


it('publishes legacy normalization only after durable success and retains superseded sources', async () => {
  const prior = { ...structuredClone(state.importedData.lightMeasurements![0]), id: 'older', capturedAt: Date.now() - 7200000, value: 20 };
  state.importedData.lightMeasurements!.push(prior); expect(await saveImportedData()).toBe(true); const before = await stored(), write = storage.encryptedSetItem;
  const spy = vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic disk failure'); return write(...args); });
  expect(getMeasurements()).toHaveLength(1); await normalizeLightMeasurements(); expect(state.importedData).toEqual(before); expect(await stored()).toEqual(before);
  spy.mockRestore(); expect(await normalizeLightMeasurements()).toBe(true); const saved = await stored();
  expect(saved.lightMeasurements).toHaveLength(1); expect(saved.lightMeasurements![0].readingHistory[0].record.id).toBe('older'); expect(saved._deleted?.lightMeasurements).toContain('older');
});

it('saves native walkthrough rooms and readings in one durable command', async () => {
  const module = await import('../js/light-measurement-store.js'), save = Reflect.get(module, 'saveNativeLightWalkthrough');
  expect(typeof save).toBe('function'); const before = await stored(), write = storage.encryptedSetItem; let writes = 0;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) writes++; return write(...args); });
  const result = await save([{ label: 'Office', cameraLevel: 20, lux: null, levelLabel: 'Medium' }, { label: 'New room', cameraLevel: 60, lux: null, levelLabel: 'Brighter' }]);
  expect(result).toBeTruthy(); expect(writes).toBe(1); const saved = await stored(); expect(saved.lightMeasurements).toHaveLength(4); expect(saved.lightEnvironment!.rooms).toHaveLength(2);
  expect(saved.lightMeasurements!.filter(row => row.tool === 'brightness-proxy')).toHaveLength(2); expect(saved.lightAudits).toEqual(before.lightAudits);
});
it('rolls back every native walkthrough room and reading when the single save fails', async () => {
  const module = await import('../js/light-measurement-store.js'), save = Reflect.get(module, 'saveNativeLightWalkthrough');
  expect(typeof save).toBe('function'); const before = await stored(), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic disk failure'); return write(...args); });
  expect(await save([{ label: 'New room', cameraLevel: 60, lux: null, levelLabel: 'Brighter' }])).toBeNull();
  expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
});

it('keeps saved checkpoint history visible after the final live room is removed', async () => {
  state.importedData.lightEnvironment = { rooms: [], screens: [] }; expect(await saveImportedData()).toBe(true);
  const { renderEnvironmentSection } = await import('../js/light-env.js'); expect(renderEnvironmentSection()).toContain('Light audits');
});

import { retiredRecordActions } from './helpers/retired-health-record-actions.js';
retiredRecordActions('lightAudits',['add','update','remove']);
