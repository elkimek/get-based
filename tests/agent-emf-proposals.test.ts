// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { createBrowserAgentToolDependencies } from '../js/agent-tool-bindings.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import type { ProfileData } from '../types/app-state.js';
const origin = { profile: state.currentProfile, data: state.importedData };
let profile: string, key: string;
const evidence = 'My bedroom AC electric reading is now 2 V/m. The room is used for sleeping. The report date is 2026-10-24. Remove the old photo.';
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
const tools = () => createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) });
async function list(resource: string) {
  const result = await tools().execute({ tool: 'getbased_read_data', arguments: { resource } });
  expect(result.success, result.contentItems[0].text).toBe(true); return JSON.parse(result.contentItems[0].text);
}
async function propose(resource = 'emfAssessments', recordId = 'assessment', patch: object = { label: 'Corrected report' }, operation = 'update', create = false) {
  const runtime = tools(), read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource, ...(create ? { create: true } : { recordId }) } });
  expect(read.success, read.contentItems[0].text).toBe(true); const snapshot = JSON.parse(read.contentItems[0].text);
  const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource, operation, snapshotId: snapshot.snapshotId, patch: JSON.stringify(patch), evidence, reason: 'The user reported a changed EMF assessment.' } });
  return { runtime, snapshot, result, draft: runtime.getDrafts()[0] ? { ...runtime.getDrafts()[0]!, profileId: profile } : null };
}
beforeEach(async () => {
  profile = `emf-tools-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported');
  localStorage.setItem('labcharts-active-profile', profile); state.currentProfile = profile; state.importedData = createDefaultProfileData();
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true);
  state.importedData.emfAssessment = { assessments: [{ id: 'assessment', date: '2026-10-20', label: 'Original', note: '', consultant: 'Surveyor', privateSource: '/private/emf-source',
    rooms: [{ name: 'Bedroom', sleeping: true, location: 'Pillow', note: '', measurements: { acElectric: { value: 8, unit: 'V/m', meter: 'Meter', source: '/private/meter-source', extension: { original: true } } }, photos: [{ base64: 'PRIVATE_PHOTO_BYTES', name: 'private-image' }], sources: ['WiFi router'], mitigations: ['custom mitigation'] }],
    interpretation: { text: 'PRIVATE_ANALYSIS' } }], comparisonInterpretation: { text: 'PRIVATE_COMPARISON' }, extension: { retained: true } };
  state.importedData.contextNotes = 'Unrelated note'; expect(await saveImportedData()).toBe(true);
});
afterEach(async () => { document.body.innerHTML = ''; vi.restoreAllMocks(); clearSyncSaveTimers(); setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true); await storage.encryptedRemoveItem(key); state.currentProfile = origin.profile; state.importedData = origin.data; });
it('lists exact assessment, room and measurement IDs without exposing photos, analysis or private source', async () => {
  const before = await stored();
  for (const resource of ['emfAssessments', 'emfRooms', 'emfMeasurements']) {
    const rows = await list(resource); expect(rows.records).toHaveLength(1);
    const { snapshot } = await propose(resource, rows.records[0].recordId, {});
    expect(JSON.stringify({ rows, snapshot })).not.toMatch(/PRIVATE_|\/private\/|private-image/);
  }
  expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
});
it('saves only after Apply and refreshes the native assessment while retaining previous private evidence', async () => {
  const before = await stored(), { result, draft } = await propose(); expect(result.success, result.contentItems[0].text).toBe(true);
  expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
  const cards = projectAgentDraftCards({ agentDrafts: [draft] }); expect(JSON.stringify(cards)).toContain('Source history');
  await applyAgentDraft(draft); const saved = await stored(), row = saved.emfAssessment!.assessments[0];
  expect(row.label).toBe('Corrected report'); expect(row.privateSource).toBe('/private/emf-source'); expect(row.rooms[0].photos).toEqual(before.emfAssessment!.assessments[0].rooms[0].photos);
  expect(row.editHistory[0].snapshot.interpretation).toEqual(before.emfAssessment!.assessments[0].interpretation);
  expect(row.interpretation).toBeUndefined(); expect(saved.emfAssessment!.comparisonInterpretation).toBeUndefined();
  expect(saved.emfAssessment!.extension).toEqual({ retained: true }); expect(saved.contextNotes).toBe(before.contextNotes); expect(state.importedData.emfAssessment).toEqual(saved.emfAssessment);
});
it('corrects a reading with explicit canonical units and keeps original meter evidence privately', async () => {
  const id = (await list('emfMeasurements')).records[0].recordId, before = await stored();
  const { result, draft } = await propose('emfMeasurements', id, { value: 2, unit: 'V/m' }); expect(result.success, result.contentItems[0].text).toBe(true);
  await applyAgentDraft(draft); const row = (await stored()).emfAssessment!.assessments[0];
  expect(row.rooms[0].measurements.acElectric).toMatchObject({ value: 2, unit: 'V/m', meter: 'Meter', extension: { original: true } });
  expect(row.editHistory[0].snapshot.rooms[0].measurements.acElectric).toEqual(before.emfAssessment!.assessments[0].rooms[0].measurements.acElectric);
});
it('removes a selected room photo while disclosing that its original remains in private history', async () => {
  const id = (await list('emfRooms')).records[0].recordId, { result, draft } = await propose('emfRooms', id, { keepPhotoIndices: [] });
  expect(result.success, result.contentItems[0].text).toBe(true); expect(JSON.parse(result.contentItems[0].text).review.effects.retainedHistory).toBe(true);
  expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft] }))).toContain('Source history');
  await applyAgentDraft(draft); const row = (await stored()).emfAssessment!.assessments[0]; expect(row.rooms[0].photos).toEqual([]); expect(row.editHistory[0].snapshot.rooms[0].photos[0].base64).toBe('PRIVATE_PHOTO_BYTES');
});
it.each([{ value: -1, unit: 'V/m' }, { value: 2 }, { value: 2, unit: 'mG' }, { interpretation: {} }, { source: 'forged' }, { type: 'acMagnetic' }])('rejects an invalid or derived reading patch %j', async patch => {
  const id = (await list('emfMeasurements')).records[0].recordId, before = await stored(), { result } = await propose('emfMeasurements', id, patch);
  expect(result.success).toBe(false); expect(await stored()).toEqual(before);
});
it('creates an assessment only from an actual date, room name and explicitly reported use', async () => {
  const missing = await propose('emfAssessments', '', { date: '2026-10-24', roomName: 'Office' }, 'add', true); expect(missing.result.success).toBe(false);
  const good = await propose('emfAssessments', '', { date: '2026-10-24', roomName: 'Office', sleeping: false }, 'add', true); expect(good.result.success, good.result.contentItems[0].text).toBe(true);
  await applyAgentDraft(good.draft); const row = (await stored()).emfAssessment!.assessments[1]; expect(row.date).toBe('2026-10-24'); expect(row.rooms[0]).toMatchObject({ name: 'Office', sleeping: false, measurements: {} }); expect(row.rooms[0].measurements).toEqual({});
});
it('keeps legacy room identity stable after inserting and removing another room', async () => {
  const first = (await list('emfRooms')).records[0].recordId;
  const add = await propose('emfRooms', '', { assessmentId: 'assessment', name: 'Office', sleeping: false }, 'add', true); expect(add.result.success, add.result.contentItems[0].text).toBe(true); await applyAgentDraft(add.draft);
  const rows = (await list('emfRooms')).records; expect(rows[0].recordId).toBe(first);
  const remove = await propose('emfRooms', first, {}, 'remove'); expect(remove.result.success).toBe(true); await applyAgentDraft(remove.draft);
  expect((await list('emfRooms')).records[0].recordId).toBe(rows[1].recordId);
});
it('refuses removing the only room and supports whole assessment removal with its own local history', async () => {
  const id = (await list('emfRooms')).records[0].recordId, room = await propose('emfRooms', id, {}, 'remove'); expect(room.result.success).toBe(false);
  const all = await propose('emfAssessments', 'assessment', {}, 'remove'); expect(all.result.success).toBe(true); await applyAgentDraft(all.draft);
  expect((await stored()).emfAssessment!.assessments).toEqual([]); expect((await stored()).contextNotes).toBe('Unrelated note');
});
it('rejects changed private evidence, revoked consent and unsaved native edits', async () => {
  const first = await propose(); const peer = await stored(); peer.emfAssessment!.assessments[0].privateSource = 'changed'; await storage.encryptedSetItem(key, JSON.stringify(peer));
  await expect(applyAgentDraft(first.draft)).rejects.toThrow(/changed/i); expect(await stored()).toEqual(peer);
  state.importedData.emfAssessment!.assessments[0].privateSource = 'changed'; const second = await propose(); setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, false); await expect(applyAgentDraft(second.draft)).rejects.toThrow(); expect(await stored()).toEqual(peer);
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true); const third = await propose(); state.importedData.emfAssessment!.assessments[0].note = 'Unsaved native draft'; await expect(applyAgentDraft(third.draft)).rejects.toThrow(/changed/i); expect(await stored()).toEqual(peer);
});
it('publishes nothing on a storage failure and permits retry', async () => {
  const before = await stored(), { draft, result } = await propose(); expect(result.success).toBe(true);
  const write = storage.encryptedSetItem, spy = vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic storage failure'); return write(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow(); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
  spy.mockRestore(); await applyAgentDraft(draft); expect((await stored()).emfAssessment!.assessments[0].label).toBe('Corrected report');
});
it('adds, updates and removes a room reading while retaining other measurement types', async () => {
  const roomId = (await list('emfRooms')).records[0].recordId;
  const first = await propose('emfMeasurements', '', { roomId, type: 'acMagnetic', value: 45, unit: 'nT', meter: 'New meter' }, 'add', true); expect(first.result.success, first.result.contentItems[0].text).toBe(true);
  await applyAgentDraft(first.draft); const created = (await list('emfMeasurements')).records.find((row: { recordId: string }) => row.recordId === first.snapshot.recordId); expect(created).toBeTruthy();
  const duplicate = await propose('emfMeasurements', '', { roomId, type: 'acMagnetic', value: 50, unit: 'nT' }, 'add', true); expect(duplicate.result.success).toBe(false);
  const correction = await propose('emfMeasurements', created.recordId, { value: 30, unit: 'nT' }); expect(correction.result.success).toBe(true); await applyAgentDraft(correction.draft);
  const remove = await propose('emfMeasurements', created.recordId, {}, 'remove'); expect(remove.result.success).toBe(true); await applyAgentDraft(remove.draft);
  const row = (await stored()).emfAssessment!.assessments[0]; expect(row.rooms[0].measurements.acMagnetic).toBeUndefined(); expect(row.rooms[0].measurements.acElectric.value).toBe(8); expect(row.editHistory).toHaveLength(3);
});
it('rejects no-op patches, invalid dates, missing parents and fabricated photo bytes', async () => {
  const roomId = (await list('emfRooms')).records[0].recordId, before = await stored();
  for (const [resource, id, patch, operation, create] of [
    ['emfAssessments', 'assessment', { label: 'Original' }, 'update', false],
    ['emfAssessments', 'assessment', { date: '2026-02-30' }, 'update', false],
    ['emfRooms', roomId, { sleeping: null }, 'update', false],
    ['emfRooms', roomId, { keepPhotoIndices: [1] }, 'update', false],
    ['emfRooms', roomId, { photos: [{ base64: 'invented' }] }, 'update', false],
    ['emfRooms', '', { assessmentId: 'missing', name: 'Office', sleeping: false }, 'add', true],
  ] as const) expect((await propose(resource, id, patch, operation, create)).result.success).toBe(false);
  expect(await stored()).toEqual(before);
});
it('fails a changed frozen effects plan and repeated application without any second write', async () => {
  const { draft, result } = await propose(); expect(result.success).toBe(true); const originalPayload = structuredClone(draft!.payload), payload = draft!.payload as { baseline: string };
  const snapshot = JSON.parse(payload.baseline); snapshot.plan.effects.retainedHistory = false; payload.baseline = JSON.stringify(snapshot);
  const before = await stored(); await expect(applyAgentDraft(draft)).rejects.toThrow(/changed/i); expect(await stored()).toEqual(before);
  draft!.payload = originalPayload; await applyAgentDraft(draft); const saved = await stored(); await expect(applyAgentDraft(draft)).rejects.toThrow(/changed/i); expect(await stored()).toEqual(saved);
});
it('keeps unrelated unsaved context out of the durable write', async () => {
  const { draft } = await propose(), before = await stored(); state.importedData.contextNotes = 'Unsaved unrelated note';
  await applyAgentDraft(draft); expect(state.importedData.contextNotes).toBe('Unsaved unrelated note'); expect((await stored()).contextNotes).toBe(before.contextNotes);
});
it('rejects a profile switch and disabled Insight reads without disclosing records', async () => {
  const before = await stored(), { draft } = await propose(); state.currentProfile = 'replacement'; await expect(applyAgentDraft(draft)).rejects.toThrow(); expect(await stored()).toEqual(before);
  state.currentProfile = profile; setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, false);
  const result = await tools().execute({ tool: 'getbased_read_data', arguments: { resource: 'emfAssessments' } }); expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toContain('Surveyor');
});
it('keeps large chosen photos local while permitting compact metadata correction', async () => {
  state.importedData.emfAssessment!.assessments[0].rooms[0].photos[0].base64 = 'PRIVATE_'.repeat(20000); expect(await saveImportedData()).toBe(true);
  const { snapshot, result, draft } = await propose(); expect(result.success).toBe(true); expect(JSON.stringify(snapshot).length).toBeLessThan(6000);
  await applyAgentDraft(draft); expect((await stored()).emfAssessment!.assessments[0].rooms[0].photos[0].base64).toHaveLength(160000);
});
it('ordinary measurement edits retain source extensions and custom tags remain editable', async () => {
  const controller = await import('../js/emf.js'), editor = await import('../js/emf-editor.js');
  document.body.innerHTML = '<div id="modal-overlay"><div id="detail-modal"></div></div>';
  localStorage.setItem('labcharts-show-product-recs', 'false'); controller.updateEMFMeasurement('assessment', 0, 'acElectric', 4);
  await expect.poll(async () => (await stored()).emfAssessment!.assessments[0].rooms[0].measurements.acElectric.value).toBe(4);
  expect((await stored()).emfAssessment!.assessments[0].rooms[0].measurements.acElectric.extension).toEqual({ original: true });
  editor.emfEditorState.editingAssessmentId = 'assessment'; editor.emfEditorState.activeRoomIdx = 0; editor.emfEditorState.compareMode = false;
  const host = document.createElement('div'); editor.renderEMFEditor(host); expect(host.textContent).toContain('custom mitigation'); expect(host.querySelectorAll('.ctx-tag.active')).toHaveLength(2);
});
it('ordinary room removal preserves the surviving legacy room identity instead of reusing a deleted ID', async () => {
  state.importedData.emfAssessment!.assessments[0].rooms.push({ name: 'Office', sleeping: false, measurements: {} }); expect(await saveImportedData()).toBe(true);
  const before = await list('emfRooms'); document.body.innerHTML = '<div id="modal-overlay"><div id="detail-modal"></div></div>'; localStorage.setItem('labcharts-show-product-recs', 'false');
  (await import('../js/emf.js')).removeEMFRoom('assessment', 0);
  await expect.poll(async () => (await stored()).emfAssessment!.assessments[0].rooms.length).toBe(1);
  const after = await list('emfRooms'); expect(after.records[0].recordId).toBe(before.records[1].recordId); expect(after.records[0].recordId).not.toBe(before.records[0].recordId);
});
it('exposes native source and mitigation choices while preserving reported custom tags', async () => {
  const read = await list('emfRooms'); expect(read.choices.mitigations).toContain('WiFi off at night'); expect(read.choices.sources).toContain('WiFi router');
  const id = read.records[0].recordId, proposal = await propose('emfRooms', id, { mitigations: ['custom mitigation', 'WiFi off at night'] }); expect(proposal.result.success).toBe(true);
  await applyAgentDraft(proposal.draft); expect((await stored()).emfAssessment!.assessments[0].rooms[0].mitigations).toEqual(['custom mitigation', 'WiFi off at night']);
});
it('rechecks the source after waiting behind another EMF command', async () => {
  const { queueEMFRecordWrite } = await import('../js/emf-record-store.js'); const { draft } = await propose();
  let release!: () => void; const blocker = queueEMFRecordWrite(profile, () => new Promise<void>(resolve => { release = resolve; })); await Promise.resolve();
  const applying = applyAgentDraft(draft); state.importedData.emfAssessment!.assessments[0].note = 'Native edit while queued'; expect(await saveImportedData()).toBe(true); const changed = await stored();
  release(); await blocker; await expect(applying).rejects.toThrow(/changed/i); expect(await stored()).toEqual(changed);
});
it('rechecks permission inside the canonical read/write boundary', async () => {
  const before = await stored(), { draft } = await propose(), read = storage.encryptedGetItem; let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { const result = await read(...args); if (args[0] === key && ++reads === 2) setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, false); return result; });
  await expect(applyAgentDraft(draft)).rejects.toThrow(); expect(reads).toBeGreaterThanOrEqual(2); expect(await stored()).toEqual(before);
});
it('reports an accepted write truthfully when its profile retires after storage acceptance', async () => {
  const { draft } = await propose(), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { const result = await write(...args); if (args[0] === key) state.currentProfile = 'replacement'; return result; });
  await expect(applyAgentDraft(draft)).resolves.toContain('EMF record updated'); expect((await stored()).emfAssessment!.assessments[0].label).toBe('Corrected report'); expect(state.currentProfile).toBe('replacement');
});
it('can record a reported instrument with an explicitly unknown value through reviewed chat', async () => {
  const roomId = (await list('emfRooms')).records[0].recordId, before = await stored();
  const next = await propose('emfMeasurements', '', { roomId, type: 'acMagnetic', value: null, unit: 'nT', meter: 'Reported instrument' }, 'add', true); expect(next.result.success, next.result.contentItems[0].text).toBe(true);
  expect(await stored()).toEqual(before); await applyAgentDraft(next.draft);
  expect((await stored()).emfAssessment!.assessments[0].rooms[0].measurements.acMagnetic).toMatchObject({ value: null, unit: 'nT', meter: 'Reported instrument' });
});
