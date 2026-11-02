// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, createProfile, profileStorageKey, getProfiles, saveProfiles } from '../js/profile.js';
import { saveImportedData, getActiveData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import * as utils from '../js/utils.js';
import { MARKER_SCHEMA } from '../js/marker-schema.js';
import { setGroupInAIContext } from '../js/lab-context-settings.js';
import { createBrowserAgentToolDependencies, canDiscloseAgentDraftReview } from '../js/agent-tool-bindings.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { readCurrentCustomMarkerCreation, readCurrentCustomMarker, listCurrentCustomMarkers, prepareReviewedCustomMarker, commitReviewedCustomMarker } from '../js/custom-marker-records.js';
import { agentDataDisplay } from '../js/agent-data-model.js';
import { isAgentDataEnabled } from '../js/agent-data-bindings.js';
import { agentDataObject } from '../shared/agent-data-contract.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
function applyNativeMarker(draft: { payload: AgentDataProposal }) { return commitReviewedCustomMarker(profile, draft.payload, () => state.currentProfile === profile && isAgentDataEnabled('customMarkers')); }
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import type { ProfileData } from '../types/app-state.js';

const group = MARKER_SCHEMA.biochemistry!.group || MARKER_SCHEMA.biochemistry!.label;
const initial = { profile: state.currentProfile, data: state.importedData }, previous = localStorage.getItem('labcharts-active-profile');
const evidence = 'Create a marker named Synthetic Marker in Biochemistry, with unit widgets and reference limits 1 to 9.', input = { name: 'Synthetic Marker', unit: 'widgets', category: 'biochemistry', refMin: 1, refMax: 9 };
let profile: string, key: string;
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
const runtime = () => createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) });
async function propose(patch: Record<string, unknown> = input, recordId = '', operation: AgentDataProposal['operation'] = 'add') {
  const baseline = operation === 'add' ? await readCurrentCustomMarkerCreation(profile) : await readCurrentCustomMarker(profile, recordId);
  if (!baseline) throw new Error('Missing native marker');
  const payload: AgentDataProposal = { resource: 'customMarkers', operation, recordId, baseline: JSON.stringify(baseline), patch: JSON.stringify(patch), evidence, reason: 'Native marker review', effectiveDate: '2026-10-29', recordedAt: Date.now() };
  await prepareReviewedCustomMarker(profile, payload);
  const snapshot = { current: agentDataDisplay('customMarkers', operation === 'add' ? null : baseline), choices: { categories: 'categories' in baseline ? baseline.categories : [] } };
  return { snapshot, draft: { kind: 'data' as const, status: 'pending' as const, id: crypto.randomUUID(), profileId: profile, payload } };
}
beforeEach(async () => {
  profile = await createProfile('Synthetic chat custom marker', { skipInitialSync: true }); key = profileStorageKey(profile, 'imported');
  state.currentProfile = profile; state.importedData = createDefaultProfileData(); localStorage.setItem('labcharts-active-profile', profile);
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, true); setGroupInAIContext(group, true);
  state.importedData.entries = [{ date: '2026-10-20', markers: { 'biochemistry.glucose': 5 }, sourceFile: 'PRIVATE_REPORT.pdf' }];
  state.importedData.contextNotes = 'PRIVATE_UNRELATED_CONTEXT'; expect(await saveImportedData()).toBe(true);
  vi.spyOn(utils, 'showConfirmDialog').mockResolvedValue(true);
});
afterEach(async () => {
  vi.restoreAllMocks(); document.body.innerHTML = ''; clearSyncSaveTimers(); setGroupInAIContext(group, true);
  await storage.encryptedRemoveItem(key); await saveProfiles(getProfiles().filter(row => row.id !== profile));
  state.currentProfile = initial.profile; state.importedData = initial.data;
  if (previous === null) localStorage.removeItem('labcharts-active-profile'); else localStorage.setItem('labcharts-active-profile', previous);
});
it('creates only after native Apply, projects into the native UI and never invents results', async () => {
  const raw = await storage.encryptedGetItem(key), { draft, snapshot } = await propose();
  expect(snapshot.choices.categories.some((row: {key:string}) => row.key === 'biochemistry')).toBe(true);
  expect(await storage.encryptedGetItem(key)).toBe(raw); expect(JSON.stringify(draft)).not.toMatch(/PRIVATE_|sourceFile|contextNotes/);
  expect(projectAgentDraftCards({ agentDrafts: [draft] })[0]).toMatchObject({ nativeOnly: true });
  await applyNativeMarker(draft); const after = await stored(), markerKey = String((draft.payload as {recordId:string}).recordId);
  expect(after.customMarkers[markerKey]).toMatchObject({ name: input.name, unit: 'widgets', refMin: 1, refMax: 9 });
  expect(after.entries).toEqual(JSON.parse(raw!).entries); expect(getActiveData().categories.biochemistry!.markers[markerKey.split('.')[1]!]).toMatchObject({ name: input.name });
  await expect(applyNativeMarker(draft)).rejects.toThrow();
});
it('supports explicitly dimensionless markers and explicitly named new categories', async () => {
  const { draft } = await propose({ name: 'Dimensionless Marker', unit: '', newCategory: 'Synthetic Tests', optimalMax: 4 });
  await applyNativeMarker(draft); const after = await stored(), markerKey = String((draft.payload as {recordId:string}).recordId);
  expect(after.customMarkers[markerKey]).toMatchObject({ unit: '', categoryLabel: 'Synthetic Tests', refMin: null, refMax: null });
  expect(after.refOverrides[markerKey]).toEqual({ optimalMin: null, optimalMax: 4, optimalSource: 'manual' });
});
it.each([{ name: 'Missing unit', category: 'biochemistry' }, { name: 'Missing category', unit: '' }, { ...input, refMin: '1' }, { ...input, optimalMin: 5, optimalMax: 1 }, { ...input, confirmed: true }, { ...input, markerId: 'custom:injected' }, { ...input, sourceFile: 'private' }, { ...input, icon: 'x' }, { ...input, category: 'constructor' }])('rejects unsupported or incomplete creation %j', async patch => {
  const raw = await storage.encryptedGetItem(key); await expect(propose(patch)).rejects.toThrow(); expect(await storage.encryptedGetItem(key)).toBe(raw);
});
it('reviews removal counts without private history, cancels safely, then removes only after actual confirmation', async () => {
  const added = await propose(); await applyNativeMarker(added.draft); const markerKey = (added.draft.payload as {recordId:string}).recordId;
  state.importedData.entries[0]!.markers[markerKey] = 4; state.importedData.markerValueNotes = { [markerKey + ':2026-10-20']: 'PRIVATE_DATED_NOTE' }; await saveImportedData();
  const raw = await storage.encryptedGetItem(key), first = await propose({}, markerKey, 'remove');
  expect(agentDataObject(first.snapshot.current).effects).toMatchObject({ results: 1, datedNotes: 1, originalReportsKept: true }); expect(JSON.stringify(first)).not.toMatch(/PRIVATE_|sourceFile|markerSources/);
  expect(await storage.encryptedGetItem(key)).toBe(raw); expect(projectAgentDraftCards({ agentDrafts: [first.draft] })[0]).toMatchObject({ nativeOnly: true });
  vi.mocked(utils.showConfirmDialog).mockResolvedValue(false); await expect(applyNativeMarker(first.draft)).rejects.toMatchObject({ cancelledBeforeSave: true }); expect(await storage.encryptedGetItem(key)).toBe(raw);
  const second = await propose({}, markerKey, 'remove'); vi.mocked(utils.showConfirmDialog).mockResolvedValue(true); await applyNativeMarker(second.draft);
  const after = await stored(); expect(after.customMarkers[markerKey]).toBeUndefined(); expect(after.entries[0]!.markers).toEqual({ 'biochemistry.glucose': 5 }); expect(after.entries[0]!.sourceFile).toBe('PRIVATE_REPORT.pdf');
});
it.each(['source', 'group', 'profile', 'editor', 'peer-name'] as const)('retires a creation review after %s changes', async cause => {
  const { draft } = await propose(), raw = await storage.encryptedGetItem(key);
  if (cause === 'source') setContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, false);
  if (cause === 'group') { setGroupInAIContext(group, false); expect(canDiscloseAgentDraftReview(draft)).toBe(false); }
  if (cause === 'profile') state.currentProfile = 'other';
  if (cause === 'editor') document.body.innerHTML = '<div class="modal-overlay show"><div class="marker-form-modal"><input value="keep"></div></div>';
  if (cause === 'peer-name') { const peer = await stored(); peer.markerLabels = { 'biochemistry.glucose': input.name }; await storage.encryptedSetItem(key, JSON.stringify(peer)); }
  await expect(applyNativeMarker(draft)).rejects.toThrow(); if (cause !== 'peer-name') expect(await storage.encryptedGetItem(key)).toBe(raw);
});
it('hides disabled category definitions, creation choices and removal receipts', async () => {
  const added = await propose(); await applyNativeMarker(added.draft); const markerKey = (added.draft.payload as {recordId:string}).recordId;
  const removal = await propose({}, markerKey, 'remove'); setGroupInAIContext(group, false); expect(canDiscloseAgentDraftReview(removal.draft)).toBe(false);
  expect(await listCurrentCustomMarkers(profile)).toEqual([]);
  const creation = await readCurrentCustomMarkerCreation(profile); expect(creation.categories.some(row => row.key === 'biochemistry')).toBe(false);
  await expect(readCurrentCustomMarker(profile, markerKey)).rejects.toThrow();
});
it('cannot delete built-in markers, invent a removal confirmation or use a creation snapshot for update', async () => {
  const read = await runtime().execute({ tool: 'getbased_read_data', arguments: { resource: 'customMarkers', recordId: 'biochemistry.glucose' } }); expect(read.success).toBe(false);
  const created = await propose(); await applyNativeMarker(created.draft); const markerKey = (created.draft.payload as {recordId:string}).recordId;
  await expect(propose({ confirmed: true }, markerKey, 'remove')).rejects.toThrow();
  await expect(propose({ name: 'Rename' }, markerKey, 'update')).rejects.toThrow();
});
