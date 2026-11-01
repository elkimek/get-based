// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import { setGroupInAIContext } from '../js/lab-context-settings.js';
import { MARKER_SCHEMA } from '../js/marker-schema.js';
import { createBrowserAgentToolDependencies, canDiscloseAgentDraftReview } from '../js/agent-tool-bindings.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { normalizeChatMessages } from '../js/chat-storage-safety.js';
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { labPanelId } from '../js/lab-panel-identity.js';
import type { ProfileData } from '../types/app-state.js';

const markerKey = 'biochemistry.glucose', day = '2026-10-20', evidence = 'Correct my morning glucose to 108 mg/dL.';
const groups = ['biochemistry', 'diabetes'].map(key => String(MARKER_SCHEMA[key]!.group || MARKER_SCHEMA[key]!.label));
const initial = { profile: state.currentProfile, data: state.importedData };
let profile: string, key: string;
async function stored() { return JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData; }
function runtime() { return createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) }); }
async function propose(operation = 'update', patch: object = { value: 108, unit: 'mg/dL' }, id = `morning.${markerKey}`) {
  const tools = runtime(), read = await tools.execute({ tool: 'getbased_read_data', arguments: { resource: 'labResults', recordId: id } });
  expect(read.success, read.contentItems[0].text).toBe(true); const snapshot = JSON.parse(read.contentItems[0].text);
  const result = await tools.execute({ tool: 'getbased_draft_data', arguments: { resource: 'labResults', operation, snapshotId: snapshot.snapshotId, patch: JSON.stringify(patch), evidence, reason: 'An explicit correction of the selected sample.' } });
  return { result, snapshot, draft: { ...tools.getDrafts()[0]!, profileId: profile } };
}
beforeEach(async () => {
  profile = `lab-tools-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported'); state.currentProfile = profile; state.importedData = createDefaultProfileData();
  localStorage.setItem('labcharts-active-profile', profile); setContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, true); groups.forEach(group => setGroupInAIContext(group, true));
  state.importedData.entries = [
    { panelId: 'morning', date: day, specimen: 'serum', context: { sampleTime: '08:00', fasting: true }, markers: { [markerKey]: 5, 'diabetes.insulin': 10, 'diabetes.homaIR': 2.22 },
      markerSources: { [markerKey]: { file: '/private/first.pdf', snapshotId: 'secret-snapshot', at: 1 } }, sourceFile: '/private/first.pdf' },
    { panelId: 'evening', date: day, specimen: 'serum', context: { sampleTime: '16:00' }, markers: { [markerKey]: 7 }, sourceFile: '/private/second.pdf' },
  ];
  state.importedData.markerValueNotes = { [`${markerKey}:${day}`]: 'Shared date note' };
  expect(await saveImportedData()).toBe(true);
});
afterEach(async () => { vi.restoreAllMocks(); clearSyncSaveTimers(); groups.forEach(group => setGroupInAIContext(group, true)); setContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, true); await storage.encryptedRemoveItem(key); state.currentProfile = initial.profile; state.importedData = initial.data; });

it('lists exact samples, reads durable data, freezes converted review and retains evidence privately until Apply', async () => {
  const raw = await storage.encryptedGetItem(key), tools = runtime(), list = await tools.execute({ tool: 'getbased_read_data', arguments: { resource: 'labResults', query: 'glucose' } });
  const listed = JSON.parse(list.contentItems[0].text); expect(listed.records.filter((row: { markerKey: string }) => row.markerKey === markerKey).map((row: { recordId: string }) => row.recordId).sort()).toEqual([`evening.${markerKey}`, `morning.${markerKey}`]);
  const { snapshot, result, draft } = await propose(); expect(result.success, result.contentItems[0].text).toBe(true);
  expect(JSON.parse(String(draft.payload.patch))).toEqual({ value: 5.99401, unit: 'mmol/l' });
  expect(snapshot.current).toMatchObject({ panelId: 'morning', value: 5, unit: 'mmol/l', sampleTime: '08:00', fasting: true, specimen: 'serum' });
  expect(JSON.stringify({ list, snapshot, draft })).not.toMatch(/first\.pdf|second\.pdf|secret-snapshot|\/private/);
  const review = projectAgentDraftCards({ agentDrafts: [draft] }); expect(JSON.stringify(review)).toContain('5.99401 mmol/l'); expect(JSON.stringify(review)).toContain('2.22 → 2.66');
  expect(await storage.encryptedGetItem(key)).toBe(raw); state.unitSystem = 'US'; await applyAgentDraft(draft); state.unitSystem = 'EU';
  const saved = await stored(); expect(saved.entries[0]!.markers![markerKey]).toBe(5.99401); expect(saved.entries[0]!.markers!['diabetes.homaIR']).toBe(2.66);
  expect(saved.entries[1]).toEqual(JSON.parse(raw!).entries[1]); expect(saved.markerValueNotes).toEqual(JSON.parse(raw!).markerValueNotes);
  expect(saved.entries[0]!.markerSources![markerKey]).toMatchObject({ file: '/private/first.pdf', snapshotId: 'secret-snapshot', manuallyEdited: true });
  expect(canDiscloseAgentDraftReview(draft)).toBe(true);
});
it('Reverts the selected sample with its original imported source and value', async () => {
  const first = await propose(); await applyAgentDraft(first.draft); const { result, draft } = await propose('revert', {}); expect(result.success).toBe(true);
  await applyAgentDraft(draft); const saved = await stored(); expect(saved.entries[0]!.markers![markerKey]).toBe(5); expect(saved.entries[1]!.markers![markerKey]).toBe(7);
  expect(saved.entries[0]!.markerSources![markerKey]).toMatchObject({ snapshotId: 'secret-snapshot' }); expect(saved.entries[0]!.markerSources![markerKey]).not.toHaveProperty('manuallyEdited');
  expect(saved.entries[0]!.manualOriginals![markerKey]).toBeNull();
});
it('removes only the selected result and linked calculation, retaining same-day siblings and shared note', async () => {
  const { result, draft } = await propose('remove', {}); expect(result.success).toBe(true); await applyAgentDraft(draft);
  const saved = await stored(); expect(saved.entries[0]!.markers).toEqual({ 'diabetes.insulin': 10 }); expect(saved.entries[1]!.markers![markerKey]).toBe(7);
  expect(saved.markerValueNotes[`${markerKey}:${day}`]).toBe('Shared date note'); expect(canDiscloseAgentDraftReview(draft)).toBe(true);
});
it('reviews and clears a shared note when the final result leaves its date', async () => {
  const peer = await stored(); peer.entries = [peer.entries[0]!]; await storage.encryptedSetItem(key, JSON.stringify(peer));
  const { draft } = await propose('remove', {}); expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft] }))).toContain('dated note will be cleared');
  await applyAgentDraft(draft); expect((await stored()).markerValueNotes[`${markerKey}:${day}`]).toBeNull();
});
it('adopts an explicit stable sample identity on the first correction of a single legacy row', async () => {
  const peer = await stored(); peer.entries = [peer.entries[0]!]; delete peer.entries[0]!.panelId; await storage.encryptedSetItem(key, JSON.stringify(peer));
  const panelId = labPanelId(peer.entries[0]!); const { draft, result } = await propose('update', { value: 6, unit: 'mmol/L' }, `${panelId}.${markerKey}`); expect(result.success).toBe(true);
  await applyAgentDraft(draft); const saved = await stored(); expect(saved.entries).toHaveLength(1); expect(saved.entries[0]!.panelId).toBe(panelId); expect(saved.entries[0]!.markers![markerKey]).toBe(6);
});
it.each([{ value: 6 }, { value: 6, unit: 'bananas' }, { value: '6', unit: 'mmol/L' }, { value: 5, unit: 'mmol/l' }, { value: 6, unit: 'mmol/L', date: '2026-10-19' }, { sourceFile: 'forged.pdf' }])('rejects unsupported, unchanged or incomplete correction fields %j', async patch => { const { result } = await propose('update', patch); expect(result.success).toBe(false); expect((await stored()).entries[0]!.markers![markerKey]).toBe(5); });
it('refuses Revert without an established original and refuses new lab results', async () => {
  expect((await propose('revert', {})).result.success).toBe(false);
  const read = await runtime().execute({ tool: 'getbased_read_data', arguments: { resource: 'labResults', create: true } }); expect(read.success).toBe(false);
});
it.each(['sameSample', 'sibling', 'note', 'source', 'definition', 'label', 'delete'] as const)('rejects changed %s after review', async kind => {
  const { draft } = await propose(), peer = await stored();
  if (kind === 'sameSample') peer.entries[0]!.markers![markerKey] = 5.5;
  if (kind === 'sibling') peer.entries[1]!.markers![markerKey] = 8;
  if (kind === 'note') peer.markerValueNotes[`${markerKey}:${day}`] = 'Peer';
  if (kind === 'source') peer.entries[0]!.markerSources![markerKey]!.snapshotId = 'different-source';
  if (kind === 'definition') peer.customMarkers[markerKey] = { name: 'Peer marker', unit: 'mg/L' };
  if (kind === 'label') peer.markerLabels = { [markerKey]: 'Peer label' };
  if (kind === 'delete') peer.entries.shift();
  await storage.encryptedSetItem(key, JSON.stringify(peer)); await expect(applyAgentDraft(draft)).rejects.toThrow(); expect(await stored()).toEqual(peer);
});
it.each(['value', 'definition', 'label', 'group', 'source', 'otherDate'] as const)('checks %s inside the locked commit', async kind => {
  const { draft } = await propose(), peer = await stored(), read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  if (kind === 'value') peer.entries[0]!.markers![markerKey] = 9;
  if (kind === 'definition') peer.customMarkers[markerKey] = { name: 'Peer marker', unit: 'mg/L' };
  if (kind === 'label') peer.markerLabels = { [markerKey]: 'Peer label' };
  if (kind === 'otherDate') peer.entries.push({ date: '2026-10-19', markers: { [markerKey]: 4 } });
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) { await write(key, JSON.stringify(peer)); if (kind === 'group') setGroupInAIContext(groups[1]!, false); if (kind === 'source') setContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, false); } return read(...args); });
  if (kind === 'otherDate') { await applyAgentDraft(draft); const saved = await stored(); expect(saved.entries[0]!.markers![markerKey]).toBe(5.99401); expect(saved.entries.at(-1)!.date).toBe('2026-10-19'); }
  else { await expect(applyAgentDraft(draft)).rejects.toMatchObject({ noChangeApplied: true }); expect(await stored()).toEqual(peer); }
});
it('withholds reads and review receipts when a linked calculation group is disabled', async () => {
  const { draft } = await propose(); setGroupInAIContext(groups[1]!, false); expect(canDiscloseAgentDraftReview(draft)).toBe(false);
  const tools = runtime(), list = await tools.execute({ tool: 'getbased_read_data', arguments: { resource: 'labResults', query: 'glucose' } });
  expect(JSON.parse(list.contentItems[0].text).records).toEqual([]);
  expect((await tools.execute({ tool: 'getbased_read_data', arguments: { resource: 'labResults', recordId: `morning.${markerKey}` } })).success).toBe(false);
});
it('retains exact proposals across chat persistence and fails retryably when the storage write fails', async () => {
  const { draft } = await propose(), before = await stored();
  expect(normalizeChatMessages([{ role: 'assistant', content: 'Review.', agentDrafts: [draft] }])[0]!.agentDrafts![0]!.payload).toEqual(draft.payload);
  const write = storage.encryptedSetItem; vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic disk failure'); return write(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow('Could not save'); expect(await stored()).toEqual(before); vi.restoreAllMocks(); await applyAgentDraft(draft); expect((await stored()).entries[0]!.markers![markerKey]).toBe(5.99401);
});
it.each([false, true])('reviews glucose changes with the saved HOMA ownership mode (suppressed %s)', async suppressed => {
  const peer = await stored();
  if (suppressed) { delete peer.entries[0]!.markers['diabetes.homaIR']; peer.entries[0]!.deletedMarkers = { 'diabetes.homaIR': 500 }; }
  else { peer.entries[0]!.markers['diabetes.homaIR'] = 3; peer.entries[0]!.markerSources!['diabetes.homaIR'] = { file: null, reported: true, at: 500 }; }
  await storage.encryptedSetItem(key, JSON.stringify(peer)); const { result, draft } = await propose(); expect(result.success, result.contentItems[0].text).toBe(true); await applyAgentDraft(draft);
  const saved = await stored(); expect(saved.entries[0]!.markers[markerKey]).toBe(5.99401);
  if (suppressed) expect(saved.entries[0]!.markers).not.toHaveProperty('diabetes.homaIR'); else expect(saved.entries[0]!.markers['diabetes.homaIR']).toBe(3);
});
it('reads legacy same-day panels without pre-approval identity writes', async () => {
  const peer = await stored(); peer.entries.forEach(row => delete row.panelId); await storage.encryptedSetItem(key, JSON.stringify(peer));
  const raw = await storage.encryptedGetItem(key), id = `${labPanelId(peer.entries[0]!)}.${markerKey}`;
  const { result, draft } = await propose('update', { value: 6, unit: 'mmol/l' }, id); expect(result.success).toBe(true); expect(await storage.encryptedGetItem(key)).toBe(raw);
  await applyAgentDraft(draft); const saved = await stored(); expect(saved.entries[0]!.markers![markerKey]).toBe(6); expect(saved.entries[1]!.markers![markerKey]).toBe(7); expect(saved.entries[0]!.panelId).toBe(labPanelId(peer.entries[0]!));
});
it('excludes stale whole-date removals and permits a later explicit restoration', async () => {
  const peer = await stored(); peer._deleted = { entries: [day] }; peer._deletedAt = { entries: { [day]: 100 } }; await storage.encryptedSetItem(key, JSON.stringify(peer));
  const tools = runtime(), list = await tools.execute({ tool: 'getbased_read_data', arguments: { resource: 'labResults' } }); expect(JSON.parse(list.contentItems[0].text).records).toEqual([]);
  expect((await tools.execute({ tool: 'getbased_read_data', arguments: { resource: 'labResults', recordId: `morning.${markerKey}` } })).success).toBe(false);
  peer._deletedClearedAt = { entries: { [day]: 101 } }; await storage.encryptedSetItem(key, JSON.stringify(peer)); expect((await propose()).result.success).toBe(true);
});
it('guards raw rows but excludes a removed stale sibling when reviewing final-note removal', async () => {
  const peer = await stored(); peer.labPanelTombstones = { [`evening.${day}`]: { deletedAt: 100, restoredAt: 0, updatedAt: 100 } }; await storage.encryptedSetItem(key, JSON.stringify(peer));
  const { draft, result } = await propose('remove', {}); expect(result.success).toBe(true); expect(JSON.stringify(projectAgentDraftCards({ agentDrafts: [draft] }))).toContain('dated note will be cleared');
  await applyAgentDraft(draft); const saved = await stored(); expect(saved.entries.every(row => !Object.hasOwn(row.markers, markerKey))).toBe(true); expect(saved.markerValueNotes[`${markerKey}:${day}`]).toBeNull();
});
it('uses declared units for new custom markers and keeps built-in storage units when legacy metadata disagrees', async () => {
  const peer = await stored(), custom = 'biochemistry.synthetic'; peer.customMarkers[custom] = { name: 'Synthetic marker', unit: 'widgets' }; peer.entries[0]!.markers[custom] = 1; await storage.encryptedSetItem(key, JSON.stringify(peer));
  const { snapshot, result, draft } = await propose('update', { value: 2, unit: 'widgets' }, `morning.${custom}`); expect(snapshot.current.inputUnits).toEqual(['widgets']); expect(result.success).toBe(true); await applyAgentDraft(draft); expect((await stored()).entries[0]!.markers[custom]).toBe(2);
  const changed = await stored(); changed.customMarkers[markerKey] = { name: 'Custom glucose unit', unit: 'mg/L' }; await storage.encryptedSetItem(key, JSON.stringify(changed));
  const read = await runtime().execute({ tool: 'getbased_read_data', arguments: { resource: 'labResults', recordId: `morning.${markerKey}` } }); expect(read.success).toBe(true); const snapshot2 = JSON.parse(read.contentItems[0].text); expect(snapshot2.current.unit).toBe('mmol/l'); expect(snapshot2.current.inputUnits).toContain('mg/dl');
});
