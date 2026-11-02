// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import * as sessions from '../js/sun-sessions-store.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { rememberProfileData } from '../js/profile-data-writes.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { createBrowserAgentToolDependencies } from '../js/agent-tool-bindings.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import type { ProfileData } from '../types/app-state.js';
const previous = { profile: state.currentProfile, data: state.importedData };
let profile: string, key: string;
const evidence = 'That recorded Sun session lasted twenty minutes. My eyes were exposed for two minutes. Remove that Sun session. I exposed my face and the front of my arms, behind glass, changed sides, wore UV-blocking sunglasses with amber lenses, and was sitting by water.';
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
const tools = () => createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) });
const analyze = vi.fn(), weather = vi.fn(async () => ({ uvIndex: 3, ozoneDU: 300 }));
async function propose(patch = '{"durationMin":20}', operation = 'update', create = false, recordId = 'sun-recorded') {
  const runtime = tools(), read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'sunSessions', ...(create ? { create: true } : { recordId }) } });
  expect(read.success, read.contentItems[0].text).toBe(true); const current = JSON.parse(read.contentItems[0].text);
  const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'sunSessions', operation, snapshotId: current.snapshotId, patch, evidence, reason: 'The user reported a Sun session correction.' } });
  return { result, current, draft: runtime.getDrafts()[0] ? { ...runtime.getDrafts()[0]!, profileId: profile } : null };
}
beforeEach(async () => {
  profile = `sun-chat-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported'); localStorage.setItem('labcharts-active-profile', profile);
  state.currentProfile = profile; state.importedData = createDefaultProfileData(); setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, true);
  state.importedData.contextNotes = 'Keep unrelated context'; state.importedData.sunDefaults = { fitzpatrick: 'III', coords: { lat: 12.34567, lon: 45.12345 } };
  state.importedData.sunSessions = [{ id: 'sun-recorded', startedAt: Date.now() - 3600000, endedAt: Date.now() - 3000000, durationMin: 10,
    location: { lat: 12.34567, lon: 45.12345, source: '/private/location' }, bodyExposure: { fraction: 0.05, glassBetween: false, sunscreenSPF: 0, rotatedSides: false },
    eyeExposure: { mode: 'direct', durationSec: 120 }, posture: 'standing', surfaceAlbedo: 'grass', notes: 'Original note', atmosphere: { uvIndex: 1 }, doses: { vitamin_d: 2 }, safety: { sed: 1 },
    exposureSegments: [{ durationMin: 10, doses: { vitamin_d: 2 } }], aiAnalysis: { detail: 'sun-session-private-sentinel' }, calculationStatus: 'computed', engineVersion: 9 }];
  expect(await saveImportedData()).toBe(true); analyze.mockClear(); weather.mockClear(); sessions.resetSunSessionsStoreState();
  sessions.configureSunSessionsStore({ fetchAtmosphere: weather, reconstructSpectrum: () => null, computeChannelDoses: options => ({ vitamin_d: options?.durationMin ?? 0 }), erythemalSED: () => 1, fractionOfMED: () => 0.1, retinalUVdose: () => 2, solarZenithAngle: () => 40, maybeAnalyzeSessionAfterFinish: analyze });
});
afterEach(async () => {
  sessions.resetSunSessionsStoreState(); vi.restoreAllMocks(); clearSyncSaveTimers(); await storage.encryptedRemoveItem(key); setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, true);
  state.currentProfile = previous.profile; state.importedData = previous.data;
});
it('reviews a duration correction, retains private source evidence and recalculates only after Apply', async () => {
  const before = await stored(), { current, result, draft } = await propose(); expect(result.success).toBe(true);
  expect(JSON.stringify({ current, result })).not.toMatch(/sun-session-private-sentinel|\/private\/|12\.34567|45\.12345/); expect(await stored()).toEqual(before); expect(weather).not.toHaveBeenCalled();
  await applyAgentDraft(draft); const saved = await stored(), row = saved.sunSessions![0]!;
  expect(row.durationMin).toBe(20); expect(row.eyeExposure.durationSec).toBe(120); expect(row.editHistory[0].record).toEqual(before.sunSessions![0]); expect(row.doses.vitamin_d).toBe(20); expect(row.calculationStatus).toBe('computed');
  expect(saved.contextNotes).toBe(before.contextNotes); expect(saved.sunDefaults).toEqual(before.sunDefaults); expect(analyze).toHaveBeenCalledOnce();
});
it('removes only the reviewed session and records its deletion', async () => {
  const before = await stored(), { result, draft } = await propose('{}', 'remove'); expect(result.success).toBe(true);
  await applyAgentDraft(draft); const saved = await stored(); expect(saved.sunSessions).toEqual([]); expect(saved._deleted?.sunSessions).toContain('sun-recorded'); expect(saved.contextNotes).toBe(before.contextNotes);
});
it('records a known time and duration without inventing exposure facts or estimates', async () => {
  const at = new Date(Date.now() - 7200000).toISOString(), { result, draft, current } = await propose(JSON.stringify({ startedAt: at, durationMin: 15 }), 'add', true); expect(result.success).toBe(true);
  await applyAgentDraft(draft); const row = (await stored()).sunSessions!.find(row => row.id === current.recordId)!;
  expect(row.startedAt).toBe(Date.parse(at)); expect(row.durationMin).toBe(15); expect(row.bodyExposure?.fraction ?? null).toBeNull(); expect(row.posture ?? null).toBeNull(); expect(row.doses).toBeNull(); expect(row.calculationStatus).toBe('needs-inputs'); expect(weather).not.toHaveBeenCalled();
});
it('creates the first chat record in a never-saved profile with remembered constructor defaults', async () => {
  await storage.encryptedRemoveItem(key); state.importedData = createDefaultProfileData(); rememberProfileData(state.importedData);
  const at = new Date(Date.now() - 7200000).toISOString(), { result, draft, current } = await propose(JSON.stringify({ startedAt: at, durationMin: 15 }), 'add', true); expect(result.success).toBe(true);
  await applyAgentDraft(draft); expect((await stored()).sunSessions).toHaveLength(1); expect((await stored()).sunSessions![0]!.id).toBe(current.recordId);
});
it('calculates a partial record only after its missing reported inputs arrive, and clears estimates when an input becomes unknown', async () => {
  const at = new Date(Date.now() - 7200000).toISOString(), created = await propose(JSON.stringify({ startedAt: at, durationMin: 15 }), 'add', true); expect(created.result.success).toBe(true); await applyAgentDraft(created.draft);
  expect(weather).not.toHaveBeenCalled(); const id = created.current.recordId;
  const complete = await propose('{"exposurePreset":"face_hands","sunscreenSPF":0,"glassBetween":false,"eyeMode":"direct","eyeDurationMin":15,"posture":"standing","surfaceAlbedo":"grass","useSavedLocation":true}', 'update', false, id); expect(complete.result.success).toBe(true);
  await applyAgentDraft(complete.draft); expect((await stored()).sunSessions!.find(row => row.id === id)?.calculationStatus).toBe('computed'); expect(weather).toHaveBeenCalledOnce();
  const unknown = await propose('{"sunscreenSPF":null}', 'update', false, id); expect(unknown.result.success).toBe(true); await applyAgentDraft(unknown.draft);
  const row = (await stored()).sunSessions!.find(row => row.id === id)!; expect(row.sunscreenSPF).toBeUndefined(); expect(row.bodyExposure.sunscreenSPF).toBeNull(); expect(row.doses).toBeNull(); expect(row.calculationStatus).toBe('needs-inputs'); expect(weather).toHaveBeenCalledOnce();
});
it('corrects an active note without turning it into a stopped or re-timed session', async () => {
  state.importedData.sunSessions![0]!.endedAt = null; expect(await saveImportedData()).toBe(true); const before = await stored();
  const { result, draft } = await propose('{"notes":"Recorded note correction"}'); expect(result.success).toBe(true); await applyAgentDraft(draft);
  const row = (await stored()).sunSessions![0]!; expect(row.endedAt).toBeNull(); expect(row.startedAt).toBe(before.sunSessions![0]!.startedAt); expect(row.notes).toBe('Recorded note correction'); expect(weather).not.toHaveBeenCalled();
});
it('rejects active physical changes and revoked disclosure without changing saved data', async () => {
  state.importedData.sunSessions![0]!.endedAt = null; expect(await saveImportedData()).toBe(true); const before = await stored();
  expect((await propose()).result.success).toBe(false); const note = await propose('{"notes":"Recorded note correction"}'); expect(note.result.success).toBe(true);
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, false); await expect(applyAgentDraft(note.draft)).rejects.toThrow();
  const read = await tools().execute({ tool: 'getbased_read_data', arguments: { resource: 'sunSessions', recordId: 'sun-recorded' } }); expect(read.success).toBe(false); expect(await stored()).toEqual(before);
});
it('rejects stale source changes and storage failures without publishing a proposal', async () => {
  const before = await stored(), { result, draft } = await propose(); expect(result.success).toBe(true); const write = storage.encryptedSetItem;
  const spy = vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic disk failure'); return write(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow(); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before); expect(weather).not.toHaveBeenCalled();
  spy.mockRestore(); const peer = await stored(); peer.sunSessions![0]!.location.lat = 1; await write(key, JSON.stringify(peer));
  await expect(applyAgentDraft(draft)).rejects.toThrow(/changed|review/i); expect(await stored()).toEqual(peer);
});
it('shows every corrected exposure input in the human approval card using the native option labels', async () => {
  const { result, draft } = await propose(JSON.stringify({ regions: ['face', 'arms-front'], glassBetween: true, rotatedSides: true, eyeMode: 'sunglasses', lensTint: 'amber', posture: 'sitting', surfaceAlbedo: 'water' })); expect(result.success).toBe(true);
  const card = projectAgentDraftCards({ agentDrafts: [draft] })[0]!, text = card.rows.find(row => row.label === 'Proposed')!.value;
  for (const expected of ['Face', 'Arms (front)', 'UV-blocking sunglasses', 'Amber / red', 'Glass between body and sunlight: Yes', 'Side change recorded: Yes', 'Sitting / reclined', 'Water / pool']) expect(text).toContain(expected);
});
it.each([{ doses: {} }, { aiAnalysis: {} }, { durationMin: -1 }, { durationMin: 1500 }, { startedAt: '2026-10-24' }, { eyeDurationMin: 40 }, { latitude: 100, longitude: 0 }])('rejects unsupported or inconsistent fields %j', async patch => {
  const before = await stored(), { result } = await propose(JSON.stringify(patch)); expect(result.success).toBe(false); expect(await stored()).toEqual(before);
});
