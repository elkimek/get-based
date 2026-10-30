// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import { createBrowserAgentToolDependencies } from '../js/agent-tool-bindings.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { prepareLegacyAgentDraftReview } from '../js/agent-draft-upgrade.js';
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { logManualBP, logManualMetric } from '../js/wearables-manual.js';
import { getDaily, deleteWearablesDB } from '../js/wearables-store.js';
import { deleteNutritionDB } from '../js/nutrition-store.js';
import { MARKER_SCHEMA } from '../js/marker-schema.js';
import type { ProfileData } from '../types/app-state.js';
import type { AgentLegacyDraftKind } from '../shared/agent-data-contract.js';

const day = '2026-10-20', evidence = 'Please save the personal details I explicitly reported.';
const markerKey = `${Object.keys(MARKER_SCHEMA).find(key => MARKER_SCHEMA[key]!.markers.glucose)!}.glucose`;
const initial = { profile: state.currentProfile, data: state.importedData };
let profile: string, key: string;
async function stored() { return JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData; }
function runtime() { return createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) }); }
async function propose(tool: string, args: object) {
  const tools = runtime(), result = await tools.execute({ tool, arguments: args });
  return { result, drafts: tools.getDrafts().map(draft => ({ ...draft, profileId: profile })) };
}
beforeEach(async () => {
  profile = `legacy-proposal-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported'); state.currentProfile = profile; state.importedData = createDefaultProfileData();
  localStorage.setItem('labcharts-active-profile', profile);
  for (const source of [CONTEXT_SOURCE_IDS.INSIGHT_CARDS, CONTEXT_SOURCE_IDS.LAB_MARKERS, CONTEXT_SOURCE_IDS.NUTRITION, CONTEXT_SOURCE_IDS.SUPPLEMENTS_MEDS, CONTEXT_SOURCE_IDS.WEARABLES]) setContextSourceEnabled(source, true);
  state.importedData.contextNotes = 'Original context'; state.importedData.markerNotes = { [markerKey]: 'Original marker note' };
  state.importedData.entries = [{ date: day, markers: { [markerKey]: 5 } }];
  state.importedData.supplements = [{ id: 'existing-therapy', name: 'Example', type: 'supplement', startDate: day, periods: [{ start: day, end: null }], schedule: { mode: 'prn', details: 'As reported' }, extension: 'keep' }];
  expect(await saveImportedData()).toBe(true);
});
afterEach(async () => {
  vi.restoreAllMocks(); clearSyncSaveTimers(); await deleteWearablesDB(profile); await deleteNutritionDB(profile); await storage.encryptedRemoveItem(key);
  state.currentProfile = initial.profile; state.importedData = initial.data;
});
it('freezes a compatibility profile append against the exact current text before approval', async () => {
  const { result, drafts } = await propose('getbased_draft_note', { scope: 'profile', mode: 'append', text: 'New note' }); expect(result.success, result.contentItems[0].text).toBe(true);
  expect(drafts).toHaveLength(1); expect(drafts[0]).toMatchObject({ kind: 'data', payload: { resource: 'profileNotes', baseline: '"Original context"' } });
  expect(JSON.parse(String(drafts[0]!.payload.patch))).toEqual({ text: 'Original context\n\nNew note' });
  expect((await stored()).contextNotes).toBe('Original context');
  const peer = await stored(); peer.contextNotes = 'Peer note'; await storage.encryptedSetItem(key, JSON.stringify(peer));
  await expect(applyAgentDraft(drafts[0]!)).rejects.toMatchObject({ noChangeApplied: true }); expect((await stored()).contextNotes).toBe('Peer note');
});
it('routes a marker note shortcut through exact note review and the normal note owner', async () => {
  const { result, drafts } = await propose('getbased_draft_note', { scope: 'marker', marker: 'Glucose', text: 'New note' }); expect(result.success, result.contentItems[0].text).toBe(true);
  expect(drafts[0]).toMatchObject({ kind: 'data', payload: { resource: 'markerNotes', recordId: markerKey } });
  expect((await stored()).markerNotes[markerKey]).toBe('Original marker note'); await applyAgentDraft(drafts[0]!); expect((await stored()).markerNotes[markerKey]).toBe('Original marker note\n\nNew note');
});
it('prepares a matching dated weight correction and rejects a late replacement', async () => {
  await logManualMetric(profile, 'weight', { date: day, value: 80 });
  const { result, drafts } = await propose('getbased_draft_biometric', { metric: 'weight', date: day, value: 81, unit: 'kg' }); expect(result.success).toBe(true);
  expect(drafts[0]).toMatchObject({ kind: 'data', payload: { resource: 'manualReadings', operation: 'update', recordId: `weight.${day}` } });
  expect((await getDaily(profile, 'manual', day))!.weight).toBe(80); await logManualMetric(profile, 'weight', { date: day, value: 82 });
  await expect(applyAgentDraft(drafts[0]!)).rejects.toMatchObject({ noChangeApplied: true }); expect((await getDaily(profile, 'manual', day))!.weight).toBe(82);
});
it('saves explicit blood pressure, pulse and shared context together in one reviewed commit', async () => {
  await logManualBP(profile, { date: day, systolic: 120, diastolic: 80, pulse: 60, note: 'Original context' });
  const { result, drafts } = await propose('getbased_draft_biometric', { metric: 'bp', date: day, systolic: 122, diastolic: 82, pulse: 62, note: 'Seated reading' }); expect(result.success, result.contentItems[0].text).toBe(true);
  expect(drafts).toHaveLength(1); expect(drafts[0]).toMatchObject({ kind: 'data', payload: { resource: 'manualReadings', operation: 'update' } });
  const write = vi.spyOn(storage, 'encryptedSetItem'); await applyAgentDraft(drafts[0]!);
  expect(await getDaily(profile, 'manual', day)).toMatchObject({ bp_systolic: 122, bp_diastolic: 82, rhr: 62, note: 'Seated reading' });
  const saves = write.mock.calls.filter(([name]) => name === key).map(([, value]) => JSON.parse(value!));
  expect(saves.length).toBeGreaterThan(0); expect(saves[0].manualBodyReadings[`bp_systolic.${day}`].value).toBe(122); expect(saves[0].manualBodyReadings[`rhr.${day}`].value).toBe(62);
  const saved = await stored(); expect(saved.manualBodyReadings![`bp_systolic.${day}`]!.updatedAt).toBe(saved.manualBodyReadings![`rhr.${day}`]!.updatedAt);
});
it('updates an unambiguous existing therapy without another record or a guessed daily schedule', async () => {
  const { result, drafts } = await propose('getbased_draft_supplement', { name: 'Example', type: 'supplement', startDate: day, dosage: 'Reported dose' }); expect(result.success, result.contentItems[0].text).toBe(true);
  expect(drafts[0]).toMatchObject({ kind: 'data', payload: { operation: 'update', recordId: 'existing-therapy' } }); await applyAgentDraft(drafts[0]!);
  const saved = await stored(); expect(saved.supplements).toHaveLength(1); expect(saved.supplements[0]).toMatchObject({ dosage: 'Reported dose', schedule: { mode: 'prn', details: 'As reported' }, extension: 'keep' });
});
it('keeps an unreported schedule unknown for a compatibility therapy addition', async () => {
  const { result, drafts } = await propose('getbased_draft_supplement', { name: 'New example', type: 'medication', startDate: day }); expect(result.success).toBe(true); await applyAgentDraft(drafts[0]!);
  expect((await stored()).supplements.find(row => row.name === 'New example')!.schedule).toMatchObject({ mode: 'other', details: 'Schedule not reported' });
});
it('requires explicit history operations for a different start date on an existing therapy', async () => {
  const { result, drafts } = await propose('getbased_draft_supplement', { name: 'Example', type: 'supplement', startDate: '2026-10-21' }); expect(result.success).toBe(false); expect(drafts).toEqual([]);
  expect(result.contentItems[0].text).toContain('different start date'); expect((await stored()).supplements).toHaveLength(1);
});
it('uses a canonical meal proposal with a frozen instant and explicitly reported nutrients', async () => {
  const { result, drafts } = await propose('getbased_draft_meal', { name: 'Lunch', eatenAt: '2026-10-20T12:00:00Z', proteinG: 24 }); expect(result.success, result.contentItems[0].text).toBe(true);
  expect(drafts[0]).toMatchObject({ kind: 'data', payload: { resource: 'meals', operation: 'add' } }); expect((await stored()).nutritionMeals || []).toEqual([]); await applyAgentDraft(drafts[0]!);
  expect((await stored()).nutritionMeals).toEqual([expect.objectContaining({ name: 'Lunch', eatenAt: '2026-10-20T12:00:00.000Z', nutrients: { proteinG: 24 } })]);
});
it.each([
  ['note', { scope: 'profile', mode: 'append', text: 'New note' }], ['meal', { name: 'Lunch', eatenAt: '2026-10-20T12:00Z', nutrients: {} }],
  ['biometric', { metric: 'weight', date: day, value: 81, unit: 'kg' }], ['supplement', { name: 'New example', type: 'supplement', startDate: day }],
] as const)('refreshes a saved %s card without applying it, then requires an explicit second approval', async (kind, payload) => {
  const old = { id: 'old', profileId: profile, status: 'pending', kind, payload }, before = await storage.encryptedGetItem(key);
  await expect(applyAgentDraft(old)).rejects.toMatchObject({ noChangeApplied: true, requiresReview: true }); expect(await storage.encryptedGetItem(key)).toBe(before);
  const fresh = await prepareLegacyAgentDraftReview(old, evidence); expect(fresh).toHaveLength(1); expect(fresh[0]).toMatchObject({ kind: 'data', profileId: profile, status: 'pending' });
  expect(await storage.encryptedGetItem(key)).toBe(before); await applyAgentDraft(fresh[0]!); expect(await storage.encryptedGetItem(key)).not.toBe(before);
});
it.each([
  ['meal', { name: 'Undated lunch' }], ['biometric', { metric: 'weight', value: 81, unit: 'kg' }],
  ['biometric', { metric: 'weight', date: day, value: 81 }], ['supplement', { name: 'Undated therapy', type: 'supplement' }],
] as const)('never invents missing dates or units while refreshing old %s cards', async (kind, payload) => {
  const before = await storage.encryptedGetItem(key);
  await expect(prepareLegacyAgentDraftReview({ id: 'old', profileId: profile, status: 'pending', kind, payload }, evidence)).rejects.toThrow(); expect(await storage.encryptedGetItem(key)).toBe(before);
});
it.each(['note', 'meal', 'biometric', 'supplement'] as AgentLegacyDraftKind[])('refuses to refresh %s without an original user message', async kind => {
  await expect(prepareLegacyAgentDraftReview({ kind, status: 'pending', profileId: profile, payload: {} }, '')).rejects.toThrow('original user message');
});
it('does not add a partial BP proposal when the explicitly reported pulse is invalid', async () => {
  const { result, drafts } = await propose('getbased_draft_biometric', { metric: 'bp', date: day, systolic: 120, diastolic: 80, pulse: 300 }); expect(result.success).toBe(false); expect(drafts).toEqual([]); expect(await getDaily(profile, 'manual', day)).toBeNull();
});
it.each(['meal', 'supplement'] as const)('gives a refreshed new %s stable draft and record identities across stale renderers', async kind => {
  const payload = kind === 'meal' ? { name: 'Same lunch', eatenAt: '2026-10-20T12:00Z', nutrients: {} } : { name: 'Same therapy', type: 'supplement', startDate: day };
  const old = { id: 'shared-old', profileId: profile, status: 'pending', kind, payload };
  const [first, second] = await Promise.all([prepareLegacyAgentDraftReview(old, evidence), prepareLegacyAgentDraftReview(old, evidence)]);
  expect(first[0]!.id).toBe(second[0]!.id); expect(first[0]!.payload.recordId).toBe(second[0]!.payload.recordId);
  await applyAgentDraft(first[0]!); await expect(applyAgentDraft(second[0]!)).rejects.toMatchObject({ noChangeApplied: true });
  const saved = await stored(); expect(kind === 'meal' ? saved.nutritionMeals!.filter(row => row.name === 'Same lunch') : saved.supplements.filter(row => row.name === 'Same therapy')).toHaveLength(1);
});
