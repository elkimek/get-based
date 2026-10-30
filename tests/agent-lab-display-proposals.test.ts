import { readCurrentCustomMarker } from '../js/custom-marker-records.js';
// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, createProfile, profileStorageKey, getProfiles, saveProfiles } from '../js/profile.js';
import { saveImportedData, getActiveData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import { MARKER_SCHEMA, getBuiltinMarkerId } from '../js/marker-schema.js';
import { setGroupInAIContext } from '../js/lab-context-settings.js';
import { canDiscloseAgentDraftReview } from '../js/agent-tool-bindings.js';
import { readCurrentLabDisplay, listCurrentLabDisplay, commitReviewedLabDisplay } from '../js/lab-display-records.js';
import { projectLabDisplay } from '../js/lab-display-proposals.js';
import { agentDataDisplay } from '../js/agent-data-model.js';
import { isAgentDataEnabled } from '../js/agent-data-bindings.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
function applyNativeDisplay(draft: { payload: AgentDataProposal }) { return commitReviewedLabDisplay(profile, draft.payload, () => state.currentProfile === profile && isAgentDataEnabled(draft.payload.resource)); }
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { readNativeLabDisplay, commitNativeLabDisplay } from '../js/lab-display-store.js';
import { labToolMarker } from '../js/lab-tool-markers.js';
import { planCustomMarkerCreation, applyCustomMarkerCreation } from '../js/custom-marker-core.js';
import { labCategoryDisplay } from '../js/lab-display-core.js';
import type { ProfileData } from '../types/app-state.js';
import type { LabDisplayResource } from '../js/lab-display-core.js';

const selected = 'biochemistry.glucose', markerId = getBuiltinMarkerId(selected)!;
const groups = [MARKER_SCHEMA.biochemistry!.group || MARKER_SCHEMA.biochemistry!.label, MARKER_SCHEMA.lipids!.group || MARKER_SCHEMA.lipids!.label, 'Private Tests'];
const initial = { profile: state.currentProfile, data: state.importedData, view: state.currentView }, previous = localStorage.getItem('labcharts-active-profile');
const evidence = 'Rename my glucose marker to Fasting glucose and move its display into Lipids.';
let profile: string, key: string;
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
async function propose(resource: LabDisplayResource = 'markerDisplay', id = selected, patch: Record<string, unknown> = { name: 'Fasting glucose', category: 'lipids' }, operation: AgentDataProposal['operation'] = 'update') {
  const baseline = await readCurrentLabDisplay(profile, resource, id), payload: AgentDataProposal = { resource, operation, recordId: id, baseline: JSON.stringify(baseline), patch: JSON.stringify(patch), evidence, reason: 'Native presentation review', effectiveDate: '2026-10-29', recordedAt: Date.now() };
  projectLabDisplay(payload);
  return { snapshot: { current: agentDataDisplay(resource, baseline), choices: baseline.choices }, draft: { kind: 'data' as const, status: 'pending' as const, id: crypto.randomUUID(), profileId: profile, payload } };
}
beforeEach(async () => {
  profile = await createProfile('Synthetic lab display', { skipInitialSync: true }); key = profileStorageKey(profile, 'imported');
  state.currentProfile = profile; state.importedData = createDefaultProfileData(); localStorage.setItem('labcharts-active-profile', profile);
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, true); groups.forEach(group => setGroupInAIContext(group, true));
  state.importedData.entries = [{ date: '2026-10-20', markers: { [selected]: 5, 'diabetes.insulin': 5, 'diabetes.homaIR': 1.11 }, sourceFile: 'PRIVATE_REPORT.pdf' }];
  state.importedData.contextNotes = 'PRIVATE_UNRELATED_CONTEXT'; state.importedData.markerNotes = { [selected]: 'PRIVATE_MARKER_NOTE' };
  state.importedData.customMarkers = { 'privateTests.fixture': { markerId: 'custom:private-fixture', name: 'Private fixture', unit: 'widgets', categoryLabel: 'Private Tests', refMin: 1, refMax: 9 } };
  expect(await saveImportedData()).toBe(true);
});
afterEach(async () => {
  vi.restoreAllMocks(); document.body.innerHTML = ''; clearSyncSaveTimers(); groups.forEach(group => setGroupInAIContext(group, true));
  await storage.encryptedRemoveItem(key); await saveProfiles(getProfiles().filter(row => row.id !== profile)); state.currentProfile = initial.profile; state.importedData = initial.data; state.currentView = initial.view;
  if (previous === null) localStorage.removeItem('labcharts-active-profile'); else localStorage.setItem('labcharts-active-profile', previous);
});
it('reviews safe finite metadata without writes, then renames and moves only display metadata', async () => {
  const before = await stored(), raw = await storage.encryptedGetItem(key), { draft, snapshot } = await propose();
  expect(await storage.encryptedGetItem(key)).toBe(raw); expect(JSON.stringify({ draft, snapshot })).not.toMatch(/PRIVATE_|sourceFile|markerSources|entries/);
  expect(snapshot.current).toMatchObject({ id: selected, name: 'Glucose', category: { key: 'biochemistry' } });
  expect(JSON.stringify(projectLabDisplay(draft.payload))).toContain('Fasting glucose'); expect(projectAgentDraftCards({ agentDrafts: [draft] })[0]).toMatchObject({ nativeOnly: true });
  await applyNativeDisplay(draft); const after = await stored(); expect(after.markerLabels[selected]).toBe('Fasting glucose'); expect(after.markerPlacements[markerId]).toEqual({ categoryKey: 'lipids' });
  expect({ ...after, markerLabels: before.markerLabels, markerPlacements: before.markerPlacements }).toEqual(before);
  expect(getActiveData().categories.lipids!.markers.glucose).toMatchObject({ name: 'Fasting glucose', storageDotKey: selected, values: [5] });
  expect(getActiveData().categories.biochemistry!.markers.glucose).toBeUndefined(); await expect(applyNativeDisplay(draft)).rejects.toThrow();
});
it('reverts only explicitly selected marker fields and preserves future placement metadata', async () => {
  const first = await propose(); await applyNativeDisplay(first.draft);
  state.importedData.markerPlacements[markerId] = { categoryKey: 'lipids', future: { keep: true } }; await saveImportedData();
  const name = await propose('markerDisplay', selected, { fields: ['name'] }, 'revert'); await applyNativeDisplay(name.draft);
  expect((await stored()).markerLabels[selected]).toBeUndefined(); expect((await stored()).markerPlacements[markerId]).toEqual({ categoryKey: 'lipids', future: { keep: true } });
  const category = await propose('markerDisplay', selected, { fields: ['category'] }, 'revert'); await applyNativeDisplay(category.draft);
  expect((await stored()).markerPlacements[markerId]).toEqual({ future: { keep: true } }); expect(getActiveData().categories.biochemistry!.markers.glucose).toMatchObject({ name: 'Glucose' });
});
it('renames/reverts a custom category without rewriting its saved definition or disclosure group', async () => {
  const before = await stored(), first = await propose('labCategories', 'privateTests', { label: 'Renamed Tests' }); await applyNativeDisplay(first.draft);
  const after = await stored(); expect(after.customMarkers).toEqual(before.customMarkers); expect(after.categoryLabels.privateTests).toBe('Renamed Tests');
  expect(getActiveData().categories.privateTests).toMatchObject({ label: 'Renamed Tests', contextGroup: 'Private Tests' });
  setGroupInAIContext('Private Tests', false); expect(() => labToolMarker(state.importedData, 'privateTests.fixture')).toThrow(); expect(canDiscloseAgentDraftReview(first.draft)).toBe(false);
  await expect(readCurrentCustomMarker(profile, 'privateTests.fixture')).rejects.toThrow();
  setGroupInAIContext('Private Tests', true); const restore = await propose('labCategories', 'privateTests', {}, 'revert'); await applyNativeDisplay(restore.draft); expect(getActiveData().categories.privateTests!.label).toBe('Private Tests');
});
it('retains the saved base category and permissions when adding a marker after rename', async () => {
  const rename = await propose('labCategories', 'privateTests', { label: 'Renamed Tests' }); await applyNativeDisplay(rename.draft);
  const data = await stored(), plan = planCustomMarkerCreation(data, { name: 'Second fixture', unit: '', category: 'privateTests' }, 'custom:second-fixture');
  expect(plan.category.label).toBe('Renamed Tests'); expect(plan.definition).toMatchObject({ categoryLabel: 'Private Tests', contextGroup: 'Private Tests' });
  applyCustomMarkerCreation(data, plan); delete data.customMarkers['privateTests.fixture'];
  expect(labCategoryDisplay(data, 'privateTests')).toMatchObject({ label: 'Renamed Tests', baseLabel: 'Private Tests', group: 'Private Tests' });
});
it.each([{ name: '' }, { name: 'x'.repeat(161) }, { name: 'Wrong\nlabel' }, { category: 'calculatedRatios' }, { category: 'constructor' }, { name: 'Name', markerId: 'injected' }, { unit: 'mg/dL' }, { confirmed: true }, {}])('rejects unsupported or invalid marker patch %j without writes', async patch => {
  const raw = await storage.encryptedGetItem(key); await expect(propose('markerDisplay', selected, patch)).rejects.toThrow(); expect(await storage.encryptedGetItem(key)).toBe(raw);
});
it.each([{}, { fields: [] }, { fields: ['name', 'name'] }, { fields: ['everything'] }, { fields: ['name'], name: 'Injected' }])('requires explicit finite revert fields %j', async patch => {
  const raw = await storage.encryptedGetItem(key); await expect(propose('markerDisplay', selected, patch, 'revert')).rejects.toThrow(); expect(await storage.encryptedGetItem(key)).toBe(raw);
});
it.each(['source', 'origin-group', 'destination-group', 'profile', 'editor', 'unsaved-label', 'unsaved-placement'] as const)('retires a review after %s changes', async cause => {
  const { draft } = await propose(), raw = await storage.encryptedGetItem(key);
  if (cause === 'source') setContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, false);
  if (cause === 'origin-group') setGroupInAIContext(groups[0], false); if (cause === 'destination-group') setGroupInAIContext(groups[1], false);
  if (cause === 'profile') state.currentProfile = 'other'; if (cause === 'editor') document.body.innerHTML = '<div class="modal-overlay show"><div class="marker-placement-form"><input value="keep"></div></div>';
  if (cause === 'unsaved-label') state.importedData.markerLabels = { [selected]: 'Unsaved name' };
  if (cause === 'unsaved-placement') state.importedData.markerPlacements[markerId] = { categoryKey: 'hormones' };
  await expect(applyNativeDisplay(draft)).rejects.toThrow(); expect(await storage.encryptedGetItem(key)).toBe(raw);
});
it.each([false, true])('checks placement dependencies under the save lock while preserving peer results (related %s)', async related => {
  const { draft } = await propose(), peer = await stored(), read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  if (related) peer.markerPlacements[markerId] = { categoryKey: 'hormones' }; else { peer.entries[0]!.markers[selected] = 6; peer.entries[0]!.markers['diabetes.homaIR'] = 1.33; }
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) await write(key, JSON.stringify(peer)); return read(...args); });
  if (related) await expect(applyNativeDisplay(draft)).rejects.toMatchObject({ noChangeApplied: true }); else await applyNativeDisplay(draft);
  expect((await stored()).entries).toEqual(peer.entries); if (related) expect((await stored()).markerPlacements).toEqual(peer.markerPlacements);
});
it('keeps live and stored metadata unchanged after a failed write', async () => {
  const { draft } = await propose(), before = await stored(), live = structuredClone(state.importedData), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic write failure'); return write(...args); });
  await expect(applyNativeDisplay(draft)).rejects.toThrow(); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(live);
});
it('native commands share exact identity, durable-save and late-owner checks', async () => {
  const expected = await readNativeLabDisplay(profile, 'markerDisplay', selected), raw = await storage.encryptedGetItem(key);
  await expect(commitNativeLabDisplay(profile, expected, { name: 'Native name' }, () => false)).rejects.toMatchObject({ noChangeApplied: true }); expect(await storage.encryptedGetItem(key)).toBe(raw);
  await commitNativeLabDisplay(profile, expected, { name: 'Native name', category: 'lipids' }); expect((await stored()).markerLabels[selected]).toBe('Native name');
  await expect(commitNativeLabDisplay(profile, expected, { name: 'Stale native name' })).rejects.toMatchObject({ noChangeApplied: true });
});
it('excludes disabled categories and their destinations from exact reads and choices', async () => {
  setGroupInAIContext(groups[1], false);
  const read = await readCurrentLabDisplay(profile, 'markerDisplay', selected); expect(read.choices.some(row => row.key === 'lipids')).toBe(false);
  expect((await listCurrentLabDisplay(profile, 'labCategories')).some(row => row.id === 'lipids')).toBe(false);
});
