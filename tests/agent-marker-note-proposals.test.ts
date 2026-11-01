// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import { MARKER_SCHEMA } from '../js/marker-schema.js';
import { setGroupInAIContext } from '../js/lab-context-settings.js';
import { createBrowserAgentToolDependencies, canDiscloseAgentDraftReview } from '../js/agent-tool-bindings.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { normalizeChatMessages } from '../js/chat-storage-safety.js';
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import type { ProfileData } from '../types/app-state.js';
import type { AgentDataResource } from '../shared/agent-data-contract.js';

const category = Object.keys(MARKER_SCHEMA).find(key => MARKER_SCHEMA[key]!.markers.glucose)!;
const markerKey = `${category}.glucose`, day = '2026-10-20', group = String(MARKER_SCHEMA[category]!.group || MARKER_SCHEMA[category]!.label);
const evidence = 'Correct the notes I reported for my glucose results.';
const initial = { profile: state.currentProfile, data: state.importedData };
let profile: string, key: string;
async function stored() { return JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData; }
function runtime() { return createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) }); }
async function propose(resource: AgentDataResource = 'markerNotes', text = 'Corrected note', operation = 'update') {
  const tools = runtime(), recordId = resource === 'markerValueNotes' ? `${day}.${markerKey}` : markerKey;
  const read = await tools.execute({ tool: 'getbased_read_data', arguments: { resource, recordId } }); expect(read.success, read.contentItems[0].text).toBe(true);
  const snapshot = JSON.parse(read.contentItems[0].text);
  const result = await tools.execute({ tool: 'getbased_draft_data', arguments: { resource, operation, snapshotId: snapshot.snapshotId, patch: JSON.stringify(operation === 'remove' ? {} : { text }), evidence, reason: 'An explicitly reported note correction.' } });
  return { result, snapshot, draft: { ...tools.getDrafts()[0]!, profileId: profile } };
}
beforeEach(async () => {
  profile = `marker-note-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported'); state.currentProfile = profile; state.importedData = createDefaultProfileData();
  localStorage.setItem('labcharts-active-profile', profile);
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, true); setGroupInAIContext(group, true);
  state.importedData.entries = [{ date: day, markers: { [markerKey]: 5 }, sourceFile: 'private-original.pdf', markerSources: { [markerKey]: { file: 'private-original.pdf', at: 1 } } }];
  state.importedData.markerNotes = { [markerKey]: 'Original marker note', 'synthetic.peer': 'Keep peer note' };
  state.importedData.markerValueNotes = { [`${markerKey}:${day}`]: 'Original dated note' };
  expect(await saveImportedData()).toBe(true);
});
afterEach(async () => {
  vi.restoreAllMocks(); clearSyncSaveTimers(); setGroupInAIContext(group, true); await storage.encryptedRemoveItem(key);
  state.currentProfile = initial.profile; state.importedData = initial.data;
});
it('reads exact notes without disclosing source filenames and does not write before approval', async () => {
  const raw = await storage.encryptedGetItem(key), { result, snapshot, draft } = await propose('markerValueNotes'); expect(result.success).toBe(true);
  expect(snapshot.current).toMatchObject({ markerKey, date: day, text: 'Original dated note', values: [5] });
  expect(JSON.stringify(snapshot)).not.toContain('private-original.pdf'); expect(String(draft.payload.baseline)).not.toContain('private-original.pdf');
  expect(await storage.encryptedGetItem(key)).toBe(raw); expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft] }))).toContain('separate same-day panels');
  await applyAgentDraft(draft); const saved = await stored();
  expect(saved.markerValueNotes[`${markerKey}:${day}`]).toBe('Corrected note'); expect(saved.entries).toEqual(JSON.parse(raw!).entries);
  expect(saved.markerNotes['synthetic.peer']).toBe('Keep peer note');
});
it.each(['markerNotes', 'markerValueNotes'] as const)('uses the ordinary clear representation for %s', async resource => {
  const { draft, result } = await propose(resource, '', 'remove'); expect(result.success).toBe(true); await applyAgentDraft(draft);
  const saved = await stored();
  if (resource === 'markerNotes') expect(saved.markerNotes).not.toHaveProperty(markerKey);
  else expect(saved.markerValueNotes[`${markerKey}:${day}`]).toBeNull();
  expect(saved.entries[0]!.markers![markerKey]).toBe(5);
});
it('lists dated identities and reads an empty note without a create operation', async () => {
  const peer = await stored(); delete peer.markerValueNotes[`${markerKey}:${day}`]; await storage.encryptedSetItem(key, JSON.stringify(peer));
  const tools = runtime(), list = await tools.execute({ tool: 'getbased_read_data', arguments: { resource: 'markerValueNotes', query: 'Glucose', limit: 1 } });
  expect(list.success).toBe(true); expect(JSON.parse(list.contentItems[0].text).records[0].recordId).toBe(`${day}.${markerKey}`);
  const { snapshot, draft } = await propose('markerValueNotes'); expect(snapshot.current.text).toBe(''); await applyAgentDraft(draft);
  expect((await stored()).markerValueNotes[`${markerKey}:${day}`]).toBe('Corrected note');
});
it('refreshes stale live notes from durable storage before preparing a proposal', async () => {
  const peer = await stored(); peer.markerNotes[markerKey] = 'Durable peer note'; await storage.encryptedSetItem(key, JSON.stringify(peer));
  expect(state.importedData.markerNotes[markerKey]).toBe('Original marker note');
  const { snapshot, draft } = await propose(); expect(snapshot.current.text).toBe('Durable peer note'); await applyAgentDraft(draft);
  expect((await stored()).markerNotes[markerKey]).toBe('Corrected note');
});
it.each([false, true])('checks exact note keys inside the locked commit (target changed %s)', async targetChanged => {
  const { draft } = await propose(), peer = await stored(); peer.markerNotes[targetChanged ? markerKey : 'synthetic.peer'] = 'Peer correction';
  const read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) await write(key, JSON.stringify(peer)); return read(...args); });
  if (targetChanged) await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true }); else await applyAgentDraft(draft);
  expect((await stored()).markerNotes[markerKey]).toBe(targetChanged ? 'Peer correction' : 'Corrected note');
  expect((await stored()).markerNotes['synthetic.peer']).toBe(targetChanged ? 'Keep peer note' : 'Peer correction');
});
it.each([false, true])('guards dated source results while preserving other dates (same date %s)', async sameDate => {
  const { draft } = await propose('markerValueNotes'), peer = await stored();
  if (sameDate) peer.entries[0]!.markers![markerKey] = 6;
  else peer.entries.push({ date: '2026-10-19', markers: { [markerKey]: 4.9 } });
  const read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) await write(key, JSON.stringify(peer)); return read(...args); });
  if (sameDate) await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true }); else await applyAgentDraft(draft);
  const saved = await stored(); expect(saved.markerValueNotes[`${markerKey}:${day}`]).toBe(sameDate ? 'Original dated note' : 'Corrected note'); expect(saved.entries).toEqual(peer.entries);
});
it('describes date-wide scope when distinct same-day panels contain different results', async () => {
  state.importedData.entries.push({ date: day, markers: { [markerKey]: 5.5 }, sourceFile: 'second-private.pdf' }); expect(await saveImportedData()).toBe(true);
  const { draft, snapshot } = await propose('markerValueNotes'); expect(snapshot.current.values).toEqual([5, 5.5]);
  expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft] }))).toContain('all results'); await applyAgentDraft(draft); expect((await stored()).entries).toHaveLength(2);
});
it.each(['source', 'group'] as const)('honors %s revocation inside the locked read and withholds next-turn reviews', async kind => {
  const { draft } = await propose(), read = storage.encryptedGetItem; let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { const raw = await read(...args); if (args[0] === key && ++reads === 2) {
    if (kind === 'source') setContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, false); else setGroupInAIContext(group, false);
  } return raw; });
  await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true }); expect((await stored()).markerNotes[markerKey]).toBe('Original marker note');
  expect(canDiscloseAgentDraftReview(draft)).toBe(false);
});
it('does not disclose disabled groups through list or exact note reads', async () => {
  const oldApplied = { profileId: profile, kind: 'note', status: 'applied', payload: { scope: 'marker', marker: markerKey, text: 'Older report' } };
  expect(canDiscloseAgentDraftReview(oldApplied)).toBe(true);
  setGroupInAIContext(group, false); const tools = runtime();
  expect(canDiscloseAgentDraftReview(oldApplied)).toBe(false);
  const list = await tools.execute({ tool: 'getbased_read_data', arguments: { resource: 'markerNotes' } }); expect(list.success).toBe(true); expect(JSON.parse(list.contentItems[0].text).records).toEqual([]);
  const exact = await tools.execute({ tool: 'getbased_read_data', arguments: { resource: 'markerNotes', recordId: markerKey } }); expect(exact.success).toBe(false); expect(exact.contentItems[0].text).not.toContain('Original marker note');
});
it.each([{ operation: 'add', patch: { text: 'New' } }, { operation: 'update', patch: { text: '' } }, { operation: 'update', patch: { value: 7 } }, { operation: 'update', patch: { text: 'a'.repeat(501) } }])('rejects invalid dated-note operations %j', async ({ operation, patch }) => {
  const tools = runtime(), read = await tools.execute({ tool: 'getbased_read_data', arguments: { resource: 'markerValueNotes', recordId: `${day}.${markerKey}` } }); expect(read.success).toBe(true);
  const result = await tools.execute({ tool: 'getbased_draft_data', arguments: { resource: 'markerValueNotes', operation, snapshotId: JSON.parse(read.contentItems[0].text).snapshotId, patch: JSON.stringify(patch), evidence, reason: 'Reported correction.' } }); expect(result.success).toBe(false);
});
it('keeps exact note proposals through ordinary chat normalization', async () => {
  const { draft } = await propose(); expect(normalizeChatMessages([{ role: 'assistant', content: 'Review.', agentDrafts: [draft] }])[0]!.agentDrafts![0]!.payload).toEqual(draft.payload);
});
it('rejects unsafe custom namespaces before merging note target metadata', async () => {
  const data = await stored(); data.customMarkers[`${category}.__proto__`] = { name: 'Unsafe', specimen: 'synthetic-pollution' }; await storage.encryptedSetItem(key, JSON.stringify(data));
  const result = await runtime().execute({ tool: 'getbased_read_data', arguments: { resource: 'markerNotes', recordId: markerKey } });
  expect(result.success).toBe(false); expect(Object.prototype).not.toHaveProperty('specimen');
});
it.each([false, true])('reads fresh context-card state and guards approval authorization (revoked %s)', async revoked => {
  const peer = await stored(); peer.diet = { bloating: 'moderate' }; await storage.encryptedSetItem(key, JSON.stringify(peer));
  const message = 'My bloating changed to severe.', tools = createAgentToolRuntime({ readContext: () => '', userMessage: message, ...createBrowserAgentToolDependencies(profile) });
  const read = await tools.execute({ tool: 'getbased_read_context_card', arguments: { card: 'diet' } }); expect(read.success).toBe(true);
  const snapshot = JSON.parse(read.contentItems[0].text); expect(snapshot.fields.find((field: { key: string }) => field.key === 'bloating').value).toBe('moderate');
  const result = await tools.execute({ tool: 'getbased_draft_context', arguments: { card: 'diet', snapshotId: snapshot.snapshotId, changes: [{ field: 'bloating', value: 'severe' }], evidence: message, reason: 'A reported change.' } }); expect(result.success).toBe(true);
  if (revoked) { const get = storage.encryptedGetItem; let reads = 0; vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { const raw = await get(...args); if (args[0] === key && ++reads === 2) setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, false); return raw; }); }
  const draft = { ...tools.getDrafts()[0]!, profileId: profile };
  if (revoked) await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true }); else await applyAgentDraft(draft);
  expect((await stored()).diet).toMatchObject({ bloating: revoked ? 'moderate' : 'severe' });
});
it.each(['diagnoses', 'diet', 'exercise', 'sleepRest'] as const)('preserves a legacy text-only %s card through an exact reviewed edit', async card => {
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS, true);
  const peer = await stored(), oldText = `Original ${card} history`; peer[card] = oldText; await storage.encryptedSetItem(key, JSON.stringify(peer));
  const before = await storage.encryptedGetItem(key), message = 'Please save my explicitly reported context change.';
  const tools = createAgentToolRuntime({ readContext: () => '', userMessage: message, ...createBrowserAgentToolDependencies(profile) });
  const read = await tools.execute({ tool: 'getbased_read_context_card', arguments: { card } }); expect(read.success).toBe(true);
  const snapshot = JSON.parse(read.contentItems[0].text); expect(snapshot.fields.find((field: { key: string }) => field.key === 'note').value).toBe(oldText);
  const choice = snapshot.fields.find((field: { kind: string; options?: unknown[] }) => field.kind === 'single' && field.options?.length);
  const change = card === 'diagnoses' ? { field: 'conditions', operation: 'add', record: { name: 'Synthetic reported condition' } } : { field: choice.key, value: choice.options[0].value };
  const result = await tools.execute({ tool: 'getbased_draft_context', arguments: { card, snapshotId: snapshot.snapshotId, changes: [change], evidence: message, reason: 'An explicit report.' } }); expect(result.success, result.contentItems[0].text).toBe(true);
  expect(await storage.encryptedGetItem(key)).toBe(before); await applyAgentDraft({ ...tools.getDrafts()[0]!, profileId: profile });
  expect((await stored())[card]).toMatchObject({ note: oldText, ...(card === 'diagnoses' ? { conditions: [expect.objectContaining({ name: 'Synthetic reported condition' })] } : { [choice.key]: choice.options[0].value }) });
});
