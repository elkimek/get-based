// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import * as sessions from '../js/sun-sessions-store.js';
import * as location from '../js/sun-location.js';
import { resetSunActiveSessionState } from '../js/sun-active-session.js';
import { sunSessionMissingInputs } from '../js/sun-session-mutations.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { createBrowserAgentToolDependencies } from '../js/agent-tool-bindings.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import type { ProfileData } from '../types/app-state.js';
const previous = { profile: state.currentProfile, data: state.importedData };
let profile: string, key: string;
const evidence = 'Start a Sun timer using my saved location with only my face exposed. No sunscreen or glass. My eyes are uncovered, I am standing on grass. Stop my Sun timer.';
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
const weather = vi.fn(async () => ({ uvIndex: 3 }));
async function propose(patch: Record<string, unknown> = { regions: ['face'], useSavedLocation: true }, operation = 'start', id?: string) {
  const runtime = createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) });
  const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'sunSessions', ...(id ? { recordId: id } : { create: true }) } });
  expect(read.success).toBe(true); const current = JSON.parse(read.contentItems[0].text);
  const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'sunSessions', operation, snapshotId: current.snapshotId, patch: JSON.stringify(patch), evidence, reason: 'The user explicitly reported the timer action and these exposure facts.' } });
  return { result, current, draft: runtime.getDrafts()[0] ? { ...runtime.getDrafts()[0]!, profileId: profile } : null };
}
beforeEach(async () => {
  profile = `sun-start-chat-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported'); localStorage.setItem('labcharts-active-profile', profile);
  state.currentProfile = profile; state.importedData = createDefaultProfileData(); setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, true);
  state.importedData.contextNotes = 'Keep unrelated context'; state.importedData.sunDefaults = { fitzpatrick: 'III', coords: { lat: 12.34567, lon: 45.12345 } };
  expect(await saveImportedData()).toBe(true); sessions.resetSunSessionsStoreState(); resetSunActiveSessionState(); weather.mockClear();
  sessions.configureSunSessionsStore({ commitCurrentSlice: () => {}, fetchAtmosphere: weather, reconstructSpectrum: () => null, computeChannelDoses: options => ({ vitamin_d: options?.durationMin ?? 0 }), erythemalSED: () => 1, retinalUVdose: () => 1, fractionOfMED: () => 0.1, solarZenithAngle: () => 40, maybeAnalyzeSessionAfterFinish: () => {} });
});
afterEach(async () => { sessions.resetSunSessionsStoreState(); resetSunActiveSessionState(); vi.restoreAllMocks(); clearSyncSaveTimers(); await storage.encryptedRemoveItem(key); setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, true); state.currentProfile = previous.profile; state.importedData = previous.data; });
it('reviews a new live timer without saving or inventing inputs, and starts it at Apply time', async () => {
  const before = await stored(), { result, current, draft } = await propose(); expect(result.success, result.contentItems[0].text).toBe(true);
  expect(current.requirements.start).toEqual({ skinTypeConfigured: true, savedLocationSpecific: true, activeSessionId: null });
  expect(JSON.stringify({ current, result })).not.toMatch(/12\.34567|45\.12345/); expect(await stored()).toEqual(before); expect(weather).not.toHaveBeenCalled();
  const card = projectAgentDraftCards({ agentDrafts: [draft] })[0]!; expect(card.rows.find(row => row.label === 'Action timing')?.value).toMatch(/when.*Apply/i); expect(card.rows.find(row => row.label === 'Operation')?.value).toBe('Start timer');
  const at = Date.now() + 30000; vi.spyOn(Date, 'now').mockReturnValue(at); await applyAgentDraft(draft); const saved = await stored(), row = saved.sunSessions![0]!;
  expect(row.id).toBe(current.recordId); expect(row.startedAt).toBe(at); expect(row.endedAt).toBeNull(); expect(row.durationMin).toBeUndefined(); expect(row.reportedInputsVersion).toBe(1); expect(row.bodyExposure.regions).toEqual(['face']);
  expect(row.bodyExposure.sunscreenSPF ?? null).toBeNull(); expect(row.bodyExposure.glassBetween ?? null).toBeNull(); expect(row.eyeExposure?.mode ?? null).toBeNull(); expect(row.posture ?? null).toBeNull(); expect(row.surfaceAlbedo ?? null).toBeNull();
  expect(row.calculationStatus).toBe('needs-inputs'); expect(row.doses).toBeNull(); expect(saved.contextNotes).toBe(before.contextNotes); expect(saved.sunDefaults).toEqual(before.sunDefaults);
});
it('keeps partially known live intervals unknown after stop instead of applying calculation defaults', async () => {
  const started = await propose(); expect(started.result.success).toBe(true); await applyAgentDraft(started.draft);
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60000); const stopped = await propose({}, 'stop', started.current.recordId); expect(stopped.result.success).toBe(true); await applyAgentDraft(stopped.draft);
  const row = (await stored()).sunSessions![0]!; expect(row.calculationStatus).toBe('needs-inputs'); expect(row.doses).toBeNull(); expect(row.exposureSegments[0].reportedInputsVersion).toBe(1); expect(row.exposureSegments[0].eyeExposure.mode).toBeUndefined(); expect(weather).not.toHaveBeenCalled();
});
it('tracks the known eye mode over the live interval without inventing lens tint, then calculates through the native owner', async () => {
  const started = await propose({ regions: ['face'], useSavedLocation: true, sunscreenSPF: 0, glassBetween: false, eyeMode: 'direct', posture: 'standing', surfaceAlbedo: 'grass' }); expect(started.result.success).toBe(true); await applyAgentDraft(started.draft);
  const row = (await stored()).sunSessions![0]!; expect(sunSessionMissingInputs(row)).toEqual([]); expect(row.eyeExposure.lensTint).toBeUndefined(); expect(row.eyeExposure.durationSec).toBeNull();
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60000); const stopped = await propose({}, 'stop', started.current.recordId); expect(stopped.result.success).toBe(true); await applyAgentDraft(stopped.draft);
  const saved = (await stored()).sunSessions![0]!; expect(saved.calculationStatus).toBe('computed'); expect(saved.durationMin).toBeGreaterThanOrEqual(1); expect(saved.eyeExposure.durationSec).toBeGreaterThanOrEqual(60); expect(saved.doses.vitamin_d).toBeGreaterThanOrEqual(1); expect(weather).toHaveBeenCalled();
});
it.each(['skin', 'missing location', 'country location', 'unreported coverage'] as const)('retains native start prerequisites: %s', async missing => {
  if (missing === 'skin') delete state.importedData.sunDefaults!.fitzpatrick;
  if (missing === 'missing location') vi.spyOn(location, 'getSunCoords').mockReturnValue(null);
  if (missing === 'country location') vi.spyOn(location, 'getSunCoords').mockReturnValue({ lat: 50, lon: 14, source: 'country-band' });
  expect(await saveImportedData()).toBe(true); const before = await stored(); const proposal = await propose(missing === 'unreported coverage' ? { useSavedLocation: true } : undefined);
  expect(proposal.result.success).toBe(false); expect(await stored()).toEqual(before); expect(weather).not.toHaveBeenCalled();
});
it('does not publish a new live timer after failed storage or revoked source permission', async () => {
  const before = await stored(), proposal = await propose(); expect(proposal.result.success).toBe(true); const write = storage.encryptedSetItem;
  const spy = vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw Error('Synthetic disk failure'); return write(...args); });
  await expect(applyAgentDraft(proposal.draft)).rejects.toThrow(); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before); expect(weather).not.toHaveBeenCalled();
  spy.mockRestore(); setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, false); await expect(applyAgentDraft(proposal.draft)).rejects.toThrow(); expect(await stored()).toEqual(before);
});
it('rejects a reviewed start when another live timer has already started', async () => {
  const proposal = await propose(); expect(proposal.result.success).toBe(true); await sessions.startSession({ regions: ['face'] }); const before = await stored();
  await expect(applyAgentDraft(proposal.draft)).rejects.toThrow(/changed|review/i); expect(await stored()).toEqual(before); expect(before.sunSessions).toHaveLength(1);
});
it.each([{ startedAt: '2026-10-25T10:00:00Z' }, { durationMin: 15 }, { eyeDurationMin: 2 }, { doses: {} }, { useSavedLocation: false }])('rejects unsupported live-start fields %j', async patch => {
  const before = await stored(), proposal = await propose({ regions: ['face'], useSavedLocation: true, ...patch }); expect(proposal.result.success).toBe(false); expect(await stored()).toEqual(before);
});

it('does not round a tracked eye interval beyond a fractional live timer duration', async () => {
  const started = await propose({ regions: ['face'], useSavedLocation: true, sunscreenSPF: 0, glassBetween: false, eyeMode: 'direct', posture: 'standing', surfaceAlbedo: 'grass' }); expect(started.result.success).toBe(true); await applyAgentDraft(started.draft);
  const row = (await stored()).sunSessions![0]!; vi.spyOn(Date, 'now').mockReturnValue(row.startedAt + 60600);
  const stopped = await propose({}, 'stop', started.current.recordId); expect(stopped.result.success).toBe(true); await applyAgentDraft(stopped.draft);
  const saved = (await stored()).sunSessions![0]!; expect(saved.calculationStatus).toBe('computed'); expect(saved.eyeExposure.durationSec).toBeCloseTo(60.6); expect(saved.durationMin).toBeCloseTo(1.01);
});
