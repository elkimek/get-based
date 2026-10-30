// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, createProfile, profileStorageKey, getProfiles, saveProfiles } from '../js/profile.js';
import { saveImportedData, getActiveData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import { MARKER_SCHEMA } from '../js/marker-schema.js';
import { setGroupInAIContext } from '../js/lab-context-settings.js';
import { canDiscloseAgentDraftReview } from '../js/agent-tool-bindings.js';
import { readCurrentMarkerRange, commitReviewedMarkerRange } from '../js/marker-range-records.js';
import { displayMarkerRange, projectMarkerRange } from '../js/marker-range-commands.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
async function applyNativeRange(draft: { payload: AgentDataProposal }) { return commitReviewedMarkerRange(profile, draft.payload, () => state.currentProfile === profile && isContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS)); }
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled, isContextSourceEnabled } from '../js/context-source-registry.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { saveRefRangeOverride, revertRefRangeOverride } from '../js/marker-detail-store.js';
import { ensureCustomMarkerIdentity } from '../js/custom-marker-identity.js';
import type { ProfileData } from '../types/app-state.js';

const markerKey = 'biochemistry.glucose', group = MARKER_SCHEMA.biochemistry!.group || MARKER_SCHEMA.biochemistry!.label;
const initial = { profile: state.currentProfile, data: state.importedData, sex: state.profileSex };
const previousActiveProfile = localStorage.getItem('labcharts-active-profile');
const evidence = 'Set my glucose reference range to 5.1–5.8 mmol/l.';
let profile: string, key: string;
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
// Native range transaction coverage remains independent of retired chat controls.
async function propose(patch: Record<string, unknown> = { min: 5.1, max: 5.8, unit: 'mmol/l' }, kind = 'reference', operation: AgentDataProposal['operation'] = 'update', selected = markerKey) {
  const baseline = await readCurrentMarkerRange(profile, `${kind}.${selected}`);
  const payload: AgentDataProposal = { resource: 'markerRanges', operation, recordId: `${kind}.${selected}`, baseline: JSON.stringify(baseline), patch: JSON.stringify(patch), evidence, reason: 'Native range review', effectiveDate: '2026-10-29', recordedAt: Date.now() };
  projectMarkerRange(payload, patch);
  return { snapshot: { current: displayMarkerRange(baseline) }, draft: { kind: 'data' as const, status: 'pending' as const, id: crypto.randomUUID(), payload, profileId: profile } };
}
beforeEach(async () => {
  profile = await createProfile('Synthetic marker range', { sex: 'female', skipInitialSync: true }); key = profileStorageKey(profile, 'imported');
  state.currentProfile = profile; state.profileSex = 'female'; state.importedData = createDefaultProfileData();
  localStorage.setItem('labcharts-active-profile', profile);
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, true); setGroupInAIContext(group, true);
  state.importedData.entries = [{ date: '2026-10-20', markers: { [markerKey]: 5 }, sourceFile: 'PRIVATE_REPORT.pdf' }];
  state.importedData.contextNotes = 'PRIVATE_UNRELATED_CONTEXT';
  state.importedData.refOverrides = { [markerKey]: { refMin: 4, refMax: 6, refSource: 'import' }, 'biochemistry.alt': { optimalMin: 1, optimalMax: 2, optimalSource: 'manual' } };
  expect(await saveImportedData()).toBe(true);
});
afterEach(async () => {
  vi.restoreAllMocks(); document.body.innerHTML = ''; clearSyncSaveTimers(); setGroupInAIContext(group, true);
  await storage.encryptedRemoveItem(key); await saveProfiles(getProfiles().filter(row => row.id !== profile));
  state.currentProfile = initial.profile; state.importedData = initial.data; state.profileSex = initial.sex;
  if (previousActiveProfile === null) localStorage.removeItem('labcharts-active-profile'); else localStorage.setItem('labcharts-active-profile', previousActiveProfile);
});

it('reads exact base ranges and provenance without private report/context disclosure or pre-approval writes', async () => {
  const raw = await storage.encryptedGetItem(key), { snapshot, draft } = await propose();
  expect(snapshot.current).toMatchObject({ id: `reference.${markerKey}`, markerKey, min: 4, max: 6, source: 'import', canRevert: false });
  expect(JSON.stringify(snapshot)).not.toMatch(/PRIVATE_|sourceFile|entries|contextNotes/); expect(String(draft.payload.baseline)).not.toMatch(/PRIVATE_|sourceFile|entries|contextNotes/);
  expect(await storage.encryptedGetItem(key)).toBe(raw); expect(projectAgentDraftCards({ agentDrafts: [draft] })[0]).toMatchObject({ nativeOnly: true });
});
it('applies only the reviewed range, preserves imported originals and restores them through a new review', async () => {
  const before = await stored(), { draft } = await propose(); await applyNativeRange(draft);
  const after = await stored(); expect(after.refOverrides[markerKey]).toMatchObject({ refMin: 5.1, refMax: 5.8, refSource: 'manual', labRefMin: 4, labRefMax: 6 });
  expect({ ...after, refOverrides: before.refOverrides }).toEqual(before);
  expect(getActiveData().categories.biochemistry!.markers.glucose).toMatchObject({ refMin: 5.1, refMax: 5.8, referenceRangeSource: 'manual' });
  const restore = await propose({}, 'reference', 'revert'); await applyNativeRange(restore.draft);
  expect((await stored()).refOverrides[markerKey]).toEqual(before.refOverrides[markerKey]);
});
it('keeps omitted bounds and converts an explicitly selected supported input unit', async () => {
  const read = await propose({ min: 5.1, unit: 'mmol/l' }); await applyNativeRange(read.draft);
  expect((await stored()).refOverrides[markerKey]).toMatchObject({ refMin: 5.1, refMax: 6 });
  const next = await propose({ min: 90, max: 108, unit: read.snapshot.current.inputUnits.find((unit: string) => unit.toLowerCase() === 'mg/dl') });
  await applyNativeRange(next.draft); expect((await stored()).refOverrides[markerKey].refMin).toBeCloseTo(5, 1);
});
it('edits optimal bounds independently and supports explicitly open bounds', async () => {
  const before = await stored(), { draft } = await propose({ min: null, max: 5.7, unit: 'mmol/l' }, 'optimal'); await applyNativeRange(draft);
  expect((await stored()).refOverrides[markerKey]).toMatchObject({ ...before.refOverrides[markerKey], optimalMin: null, optimalMax: 5.7, optimalSource: 'manual' });
});
it.each([{ min: 7, max: 4, unit: 'mmol/l' }, { min: '5.1', unit: 'mmol/l' }, { min: 5.1 }, { min: 5.1, unit: 'unrecognized' }, { min: 5.1, unit: 'mmol/l', source: 'import' }, {}])('rejects invalid, ambiguous or unsupported bounds %j', async patch => {
  const raw = await storage.encryptedGetItem(key); await expect(propose(patch)).rejects.toThrow(); expect(await storage.encryptedGetItem(key)).toBe(raw);
});
it('cannot remove imported limits through revert and cannot replay a completed approval', async () => {
  await expect(propose({}, 'reference', 'revert')).rejects.toThrow();
  const { draft } = await propose(); await applyNativeRange(draft); await expect(applyNativeRange(draft)).rejects.toThrow();
});
it.each([false, true])('guards the selected stored override at the locked save while preserving peer changes (same marker %s)', async sameMarker => {
  const { draft } = await propose(), peer = await stored(), changed = sameMarker ? markerKey : 'biochemistry.alt';
  peer.refOverrides[changed] = { refMin: 1, refMax: 2, refSource: 'import' };
  const read = storage.encryptedGetItem, write = storage.encryptedSetItem; let reads = 0;
  vi.spyOn(storage, 'encryptedGetItem').mockImplementation(async (...args) => { if (args[0] === key && ++reads === 2) await write(key, JSON.stringify(peer)); return read(...args); });
  if (sameMarker) await expect(applyNativeRange(draft)).rejects.toMatchObject({ noChangeApplied: true }); else await applyNativeRange(draft);
  expect((await stored()).refOverrides[changed]).toEqual(peer.refOverrides[changed]); expect((await stored()).entries).toEqual(peer.entries);
});
it.each(['group', 'source', 'profile', 'native-editor', 'unsaved-range'] as const)('blocks a retired or conflicting %s review without losing data', async cause => {
  const { draft } = await propose(), raw = await storage.encryptedGetItem(key);
  if (cause === 'group') { setGroupInAIContext(group, false); expect(canDiscloseAgentDraftReview(draft)).toBe(false); }
  if (cause === 'source') setContextSourceEnabled(CONTEXT_SOURCE_IDS.LAB_MARKERS, false);
  if (cause === 'profile') state.currentProfile = 'other';
  if (cause === 'native-editor') document.body.innerHTML = '<span class="ref-edit-form"><input value="unsaved"></span>';
  if (cause === 'unsaved-range') state.importedData.refOverrides[markerKey].refMin = 3.5;
  await expect(applyNativeRange(draft)).rejects.toThrow(); expect(await storage.encryptedGetItem(key)).toBe(raw);
});
it('does not publish a failed write into live ranges or change recorded observations', async () => {
  const { draft } = await propose(), before = await stored(), write = storage.encryptedSetItem;
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic quota failure'); return write(...args); });
  await expect(applyNativeRange(draft)).rejects.toThrow(); expect(await stored()).toEqual(before); expect(state.importedData.refOverrides).toEqual(before.refOverrides);
});
it('native and reviewed edits preserve a single-bound imported range and share restoration semantics', async () => {
  state.importedData.refOverrides[markerKey] = { refMax: 6, refSource: 'import' }; await saveImportedData();
  const nativeBefore = getActiveData().categories.biochemistry!.markers.glucose!;
  await saveRefRangeOverride(markerKey, 'reference', { min: 5.1, max: 5.8 });
  expect((await stored()).refOverrides[markerKey]).toMatchObject({ labRefMin: nativeBefore.refMin, labRefMax: 6 });
  await revertRefRangeOverride(markerKey, 'reference');
  expect(getActiveData().categories.biochemistry!.markers.glucose).toMatchObject({ refMin: nativeBefore.refMin, refMax: 6, referenceRangeSource: 'import' });
});
it.each(['reference.biochemistry.toString', 'reference.biochemistry.__proto__', 'reference.constructor.fake', 'reference.biochemistry.glucose.extra'])('rejects nonexistent or inherited range identity %s without a write', async recordId => {
  const raw = await storage.encryptedGetItem(key); await expect(readCurrentMarkerRange(profile, recordId)).rejects.toThrow(); expect(await storage.encryptedGetItem(key)).toBe(raw); expect(Object.prototype.toString).not.toHaveProperty('refMin');
});
it('supports an explicitly dimensionless range without guessing a physical unit', async () => {
  const [category, definition] = Object.entries(MARKER_SCHEMA).find(([, value]) => Object.values(value.markers).some(marker => marker.unit === ''))!;
  const marker = Object.keys(definition.markers).find(key => definition.markers[key]!.unit === '')!, selected = `${category}.${marker}`;
  setGroupInAIContext(definition.group || definition.label, true);
  const { snapshot, draft } = await propose({ min: 0, max: 1, unit: '' }, 'reference', 'update', selected);
  expect(snapshot.current.inputUnits).toContain(''); await applyNativeRange(draft);
  expect((await stored()).refOverrides[selected]).toMatchObject({ refMin: 0, refMax: 1, refSource: 'manual' });
});
it('retains custom marker definitions and their exact unit when a custom default is overridden and restored', async () => {
  const selected = 'biochemistry.syntheticRange'; state.importedData.customMarkers[selected] = { name: 'Synthetic custom marker', unit: 'widgets', refMin: 2, refMax: 8 };
  ensureCustomMarkerIdentity(state.importedData.customMarkers[selected], state.importedData.customMarkers); await saveImportedData(); const original = structuredClone((await stored()).customMarkers[selected]);
  const { snapshot, draft } = await propose({ min: 3, max: 7, unit: 'widgets' }, 'reference', 'update', selected);
  expect(snapshot.current).toMatchObject({ unit: 'widgets', inputUnits: ['widgets'], source: 'custom marker', min: 2, max: 8 });
  await applyNativeRange(draft);
  expect((await stored()).refOverrides[selected]).toMatchObject({ refMin: 3, refMax: 7, refSource: 'manual' });
  expect((await stored()).customMarkers[selected]).toEqual(original);
  const restored = await propose({}, 'reference', 'revert', selected); await applyNativeRange(restored.draft);
  expect((await stored()).customMarkers[selected]).toEqual(original); expect((await stored()).refOverrides[selected]).toBeUndefined();
});
it('redacts unrecognized private provenance while preserving its original bytes through an override', async () => {
  const source = '/PRIVATE_LOCAL_REPORT_PATH/report.pdf'; state.importedData.refOverrides[markerKey].refSource = source; await saveImportedData();
  const { snapshot, draft } = await propose(); expect(snapshot.current.source).toBe('custom'); expect(JSON.stringify(snapshot)).not.toContain(source); expect(String(draft.payload.baseline)).not.toContain(source);
  await applyNativeRange(draft); expect((await stored()).refOverrides[markerKey].labRefSource).toBe(source);
  const revert = await propose({}, 'reference', 'revert'); await applyNativeRange(revert.draft); expect((await stored()).refOverrides[markerKey].refSource).toBe(source);
});
