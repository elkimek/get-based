// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedDataForProfile } from '../js/data.js';
import * as storage from '../js/crypto.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { createBrowserAgentToolDependencies } from '../js/agent-tool-bindings.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { renderAgentDraftCards } from '../js/agent-draft-component.js';
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import { createLifestyleFormSession } from '../js/context-lifestyle-form-session.js';
import { lifestyleDraft, lifestyleFields, lifestyleFormModel } from '../js/context-lifestyle-form-model.js';
import type { ProfileData } from '../types/app-state.js';
import type { AgentContextChange } from '../shared/agent-tool-contract.js';
const origin = { profile: state.currentProfile, data: state.importedData };
let profile: string, key: string;
const evidence = 'My WiFi router is nearby and I now turn WiFi off at night.';
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
const runtime = () => createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) });
const assessment = () => ({ assessments: [{ id: 'report', date: '2026-10-20', rooms: [{ id: 'bedroom', name: 'Bedroom', sleeping: true, measurements: {}, photos: [{ base64: 'private-image-sentinel', mediaType: 'image/png' }] }], source: '/private/report' }] });
async function read(tools = runtime()) {
  const result = await tools.execute({ tool: 'getbased_read_context_card', arguments: { card: 'environment' } });
  expect(result.success, result.contentItems[0].text).toBe(true); return { tools, card: JSON.parse(result.contentItems[0].text) };
}
async function propose(changes: AgentContextChange[] = [{ field: 'emf', values: ['WiFi router nearby'] }, { field: 'emfMitigation', values: ['WiFi off at night'] }], input?: Awaited<ReturnType<typeof read>>) {
  const { tools, card } = input || await read();
  const result = await tools.execute({ tool: 'getbased_draft_context', arguments: { card: 'environment', snapshotId: card.snapshotId, changes, evidence, reason: 'The user reported changed home EMF context.' } });
  return { tools, card, result, draft: tools.getDrafts()[0] ? { ...tools.getDrafts()[0]!, profileId: profile } : null };
}
beforeEach(async () => {
  profile = `environment-tools-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported'); localStorage.setItem('labcharts-active-profile', profile);
  state.currentProfile = profile; state.importedData = createDefaultProfileData(); setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true);
  state.importedData.environment = { setting: 'urban', emf: ['WiFi router in bedroom'], emfMitigation: ['minimal Bluetooth'], note: 'Keep this note' };
  state.importedData.contextNotes = 'Protected unrelated note'; state.importedData.nutritionMeals = [];
  expect(await saveImportedDataForProfile(profile, state.importedData, { forceProfileScope: true })).toBe(true);
});
afterEach(async () => { vi.restoreAllMocks(); clearSyncSaveTimers(); await storage.encryptedRemoveItem(key); state.currentProfile = origin.profile; state.importedData = origin.data; });

it('returns the ordinary self-report choices without disclosing other profile data', async () => {
  const before = await stored(), { card } = await read();
  expect(card.emf.mode).toBe('selfReport');
  expect(card.fields).toContainEqual(expect.objectContaining({ key: 'emf', kind: 'multiple', value: ['WiFi router in bedroom'], options: expect.arrayContaining([{ value: 'WiFi router nearby', label: 'WiFi router nearby' }]) }));
  expect(card.fields).toContainEqual(expect.objectContaining({ key: 'emfMitigation', kind: 'multiple', value: ['minimal Bluetooth'] }));
  expect(JSON.stringify(card)).not.toContain('Protected unrelated note'); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
});
it('saves the explicitly reviewed quick answers without inventing an assessment or changing other data', async () => {
  const before = await stored(), { result, draft } = await propose(); expect(result.success, result.contentItems[0].text).toBe(true);
  expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before);
  const html = renderAgentDraftCards({ agentDrafts: [draft!] }, 0); expect(html).toContain('Self-reported EMF context'); expect(html).toContain('EMF exposure'); expect(html).toContain('EMF mitigation');
  await applyAgentDraft(draft); const saved = await stored(); expect(saved.environment).toEqual({ ...before.environment, emf: ['WiFi router nearby'], emfMitigation: ['WiFi off at night'] }); expect(saved.emfAssessment).toBeNull();
  const protectedFields = (data: ProfileData) => Object.fromEntries(Object.entries(data).filter(([key]) => !['environment', 'changeHistory'].includes(key)));
  expect(protectedFields(saved)).toEqual(protectedFields(before)); expect(state.importedData).toEqual(saved);
});
it('retains existing custom quick choices in both native and chat edits while refusing invented choices', async () => {
  state.importedData.environment!.emf!.push('Legacy custom source'); expect(await saveImportedDataForProfile(profile, state.importedData, { forceProfileScope: true })).toBe(true);
  const model = lifestyleFormModel('environment', state.importedData, null); expect(lifestyleDraft(model, state.importedData).emf).toContain('Legacy custom source'); expect(lifestyleFields(model).find(field => field.key === 'emf')!.options).toContainEqual({ label: 'Legacy custom source', value: 'Legacy custom source' });
  const next = await propose([{ field: 'emf', values: ['WiFi router nearby', 'Legacy custom source'] }]); expect(next.result.success, next.result.contentItems[0].text).toBe(true); await applyAgentDraft(next.draft); expect((await stored()).environment!.emf).toEqual(['WiFi router nearby', 'Legacy custom source']);
  const invalid = await propose([{ field: 'emf', values: ['Invented new quick option'] }]); expect(invalid.result.success).toBe(false);
});
it('routes assessment-backed context to room resources and never exposes private assessment evidence', async () => {
  state.importedData.emfAssessment = assessment(); expect(await saveImportedDataForProfile(profile, state.importedData, { forceProfileScope: true })).toBe(true); const before = await stored(), { card } = await read();
  expect(card.emf).toMatchObject({ mode: 'assessments', resources: ['emfAssessments', 'emfRooms', 'emfMeasurements'] }); expect(card.fields.map((field: { key: string }) => field.key)).not.toContain('emf'); expect(card.fields.map((field: { key: string }) => field.key)).not.toContain('emfMitigation'); expect(JSON.stringify(card)).not.toMatch(/private-image-sentinel|\/private\//);
  expect((await propose()).result.success).toBe(false); const ordinary = await propose([{ field: 'note', value: 'Other environment facts' }]); expect(ordinary.result.success).toBe(true); await applyAgentDraft(ordinary.draft); expect((await stored()).emfAssessment).toEqual(before.emfAssessment); expect((await stored()).environment!.emf).toEqual(before.environment!.emf);
});
it('rejects a proposal when an assessment appeared after its read snapshot', async () => {
  const snapshot = await read(); state.importedData.emfAssessment = assessment(); expect(await saveImportedDataForProfile(profile, state.importedData, { forceProfileScope: true })).toBe(true); const before = await stored();
  expect((await propose(undefined, snapshot)).result.success).toBe(false); expect(snapshot.tools.getDrafts()).toEqual([]); expect(await stored()).toEqual(before);
});
it('rejects a reloaded quick proposal when another client has added an assessment', async () => {
  const { draft } = await propose(), peer = await stored(); peer.emfAssessment = assessment(); await storage.encryptedSetItem(key, JSON.stringify(peer));
  await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true }); expect(await stored()).toEqual(peer);
});
it('rechecks assessment ownership inside the canonical transaction', async () => {
  const { draft } = await propose(), peer = await stored(), readItem = storage.encryptedGetItem; peer.emfAssessment = assessment(); let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) await storage.encryptedSetItem(key, JSON.stringify(peer)); return readItem(...args); });
  await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true }); expect(reads).toBeGreaterThanOrEqual(2); expect(await stored()).toEqual(peer);
});
it.each(['environment', 'emfAssessment'] as const)('does not overwrite an unsaved %s draft', async field => {
  const { draft } = await propose(), before = await stored(); if (field === 'environment') state.importedData.environment!.note = 'Unsaved native note'; else state.importedData.emfAssessment = assessment(); const local = structuredClone(state.importedData);
  await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true }); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(local);
});
it.each(['consent', 'root'] as const)('rejects retired %s at the last canonical boundary', async retirement => {
  const { draft } = await propose(), before = await stored(), readItem = storage.encryptedGetItem; let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { const result = await readItem(...args); if (args[0] === key && ++reads === 2) { if (retirement === 'consent') setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, false); else state.importedData = structuredClone(state.importedData); } return result; });
  await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true }); expect(await stored()).toEqual(before);
});
it('leaves live and durable data unchanged on failed storage and permits retry', async () => {
  const { draft } = await propose(), before = await stored(), write = storage.encryptedSetItem;
  const failing = vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic storage failure'); return write(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow(/save/i); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before); failing.mockRestore(); await applyAgentDraft(draft); expect((await stored()).environment!.emfMitigation).toEqual(['WiFi off at night']);
});
it('prevents a native quick form from saving over a newly introduced assessment', async () => {
  const model = lifestyleFormModel('environment', state.importedData, null), value = lifestyleDraft(model, state.importedData), session = createLifestyleFormSession('environment'); value.emfMitigation = ['WiFi off at night']; const peer = await stored(); peer.emfAssessment = assessment(); await storage.encryptedSetItem(key, JSON.stringify(peer));
  expect(await session.save(value)).toBe('conflict'); expect(await stored()).toEqual(peer);
});

it.each([{}, { assessments: 'private-corrupt-sentinel' }])('requires review of malformed saved assessment containers: %j', async emf => {
  state.importedData.emfAssessment = emf; await storage.encryptedSetItem(key, JSON.stringify(state.importedData));
  const before = await stored(), { card } = await read(); expect(card.emf.mode).toBe('reviewRequired'); expect(JSON.stringify(card)).not.toContain('private-corrupt-sentinel'); expect(card.fields.map((field: { key: string }) => field.key)).not.toContain('emf'); expect((await propose()).result.success).toBe(false); expect(await stored()).toEqual(before);
});
it('reports a committed quick change truthfully after its profile retires at storage acknowledgement', async () => {
  const { draft } = await propose(), write = storage.encryptedSetItem, replacement = createDefaultProfileData();
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { const result = await write(...args); if (args[0] === key) { state.currentProfile = 'replacement'; state.importedData = replacement; } return result; });
  await expect(applyAgentDraft(draft)).resolves.toContain('updated'); expect((await stored()).environment!.emfMitigation).toEqual(['WiFi off at night']); expect(state.importedData).toBe(replacement); expect(replacement.environment).toBeNull();
});

it('does not disclose a context read after its captured profile root is replaced', async () => {
  const tools = runtime(), readItem = storage.encryptedGetItem; let replaced = false;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { const result = await readItem(...args); if (args[0] === key && !replaced) { replaced = true; state.importedData = structuredClone(state.importedData); } return result; });
  const result = await tools.execute({ tool: 'getbased_read_context_card', arguments: { card: 'environment' } }); expect(result.success).toBe(false); expect(JSON.stringify(result)).not.toContain('Keep this note');
});
