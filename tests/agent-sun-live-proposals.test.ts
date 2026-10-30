// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import * as sessions from '../js/sun-sessions-store.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { createAgentToolRuntime } from '../js/agent-tool-runtime.js';
import { createBrowserAgentToolDependencies } from '../js/agent-tool-bindings.js';
import { applyAgentDraft } from '../js/agent-drafts.js';
import { projectAgentDraftCards } from '../js/agent-draft-presentation.js';
import { CONTEXT_SOURCE_IDS, setContextSourceEnabled } from '../js/context-source-registry.js';
import type { ProfileData } from '../types/app-state.js';
const previous = { profile: state.currentProfile, data: state.importedData };
const actions = ['pause', 'resume', 'stop', 'setCoverage', 'setSunscreen', 'rotateSides'] as const;
let profile: string, key: string, now: number;
const publish = vi.fn(), clear = vi.fn(), resetRate = vi.fn(), analyze = vi.fn();
const evidence = 'Pause my active Sun timer. Resume my Sun timer. Stop my Sun timer. I now have my face uncovered. I just applied SPF 30. I changed sides.';
const stored = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
async function propose(action: string, patch: Record<string, unknown> = action === 'setCoverage' ? { regions: ['face'] } : action === 'setSunscreen' ? { sunscreenSPF: 30 } : {}) {
  const runtime = createAgentToolRuntime({ readContext: () => '', userMessage: evidence, ...createBrowserAgentToolDependencies(profile) });
  const read = await runtime.execute({ tool: 'getbased_read_data', arguments: { resource: 'sunSessions', recordId: 'sun-active' } });
  expect(read.success).toBe(true); const current = JSON.parse(read.contentItems[0].text);
  const result = await runtime.execute({ tool: 'getbased_draft_data', arguments: { resource: 'sunSessions', operation: action, snapshotId: current.snapshotId, patch: JSON.stringify(patch), evidence, reason: 'An explicitly reported live Sun action.' } });
  return { result, current, draft: runtime.getDrafts()[0] ? { ...runtime.getDrafts()[0]!, profileId: profile } : null };
}
async function seed(action = '') {
  const row = state.importedData.sunSessions![0]!; row.endedAt = null; delete row.durationMin;
  if (action === 'resume') { row.paused = true; row.pausedAt = now - 120000; }
  expect(await saveImportedData()).toBe(true);
}
beforeEach(async () => {
  profile = `sun-live-chat-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported'); localStorage.setItem('labcharts-active-profile', profile);
  state.currentProfile = profile; state.importedData = createDefaultProfileData(); setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, true); now = Date.now();
  state.importedData.contextNotes = 'Keep unrelated context'; state.importedData.sunDefaults = { fitzpatrick: 'III' };
  state.importedData.sunSessions = [{ id: 'sun-active', startedAt: now - 600000, endedAt: null, location: { lat: 12.34567, lon: 45.12345, source: '/private/location' },
    bodyExposure: { preset: 'face_hands', fraction: 0.05, glassBetween: false, sunscreenSPF: 0, rotatedSides: false }, eyeExposure: { mode: 'direct', durationSec: null },
    posture: 'standing', surfaceAlbedo: 'grass', exposureSegments: [], accumulatedPausedMs: 0, calculationStatus: 'pending', aiAnalysis: { detail: 'live-private-sentinel' } }];
  expect(await saveImportedData()).toBe(true); sessions.resetSunSessionsStoreState(); publish.mockClear(); clear.mockClear(); resetRate.mockClear(); analyze.mockClear();
  sessions.configureSunSessionsStore({ commitCurrentSlice: row => { row.exposureSegments ||= []; row.exposureSegments.push({ durationMin: (Date.now() - row.startedAt - (row.accumulatedPausedMs || 0)) / 60000, doses: { vitamin_d: 1 }, bodyExposure: structuredClone(row.bodyExposure) }); return publish; }, clearLiveState: clear, setLiveState: resetRate,
    fetchAtmosphere: async () => ({ uvIndex: 3 }), reconstructSpectrum: () => null, computeChannelDoses: () => ({ vitamin_d: 1 }), erythemalSED: () => 1, retinalUVdose: () => 1, fractionOfMED: () => 0.1, solarZenithAngle: () => 40, maybeAnalyzeSessionAfterFinish: analyze });
});
afterEach(async () => { sessions.resetSunSessionsStoreState(); vi.restoreAllMocks(); clearSyncSaveTimers(); await storage.encryptedRemoveItem(key); setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, true); state.currentProfile = previous.profile; state.importedData = previous.data; });
it.each(actions)('reviews and applies live %s through native durable controls at Apply time', async action => {
  await seed(action); const before = await stored(), { result, current, draft } = await propose(action); expect(result.success, result.contentItems[0].text).toBe(true);
  expect(JSON.stringify({ current, result })).not.toMatch(/live-private-sentinel|\/private\/|12\.34567|45\.12345/); expect(await stored()).toEqual(before); expect(publish).not.toHaveBeenCalled();
  const card = projectAgentDraftCards({ agentDrafts: [draft] })[0]!; expect(card.rows.find(row => row.label === 'Action timing')?.value).toMatch(/when.*Apply/i);
  vi.spyOn(Date, 'now').mockReturnValue(now + 30000); await applyAgentDraft(draft); const saved = await stored(), row = saved.sunSessions![0]!;
  expect(row.editHistory[0].record).toEqual(before.sunSessions![0]); expect(saved.contextNotes).toBe(before.contextNotes); expect(saved.sunDefaults).toEqual(before.sunDefaults);
  if (action === 'pause') { expect(row.pausedAt).toBe(now + 30000); expect(row.paused).toBe(true); }
  if (action === 'resume') { expect(row.resumedAt).toBe(now + 30000); expect(row.accumulatedPausedMs).toBe(150000); expect(row.paused).toBe(false); expect(publish).not.toHaveBeenCalled(); }
  if (action === 'stop') { expect(row.endedAt).toBe(now + 30000); expect(row.durationMin).toBe(10.5); expect(clear).toHaveBeenCalledOnce(); }
  if (action === 'setCoverage') expect(row.bodyExposure.regions).toEqual(['face']);
  if (action === 'setSunscreen') expect(row.bodyExposure.sunscreenSPF).toBe(30);
  if (action === 'rotateSides') { expect(row.bodyExposure.rotatedSides).toBe(true); expect(row.bodyExposure.fraction).toBe(0.05); }
  if (action !== 'resume') { expect(publish).toHaveBeenCalledOnce(); expect(row.exposureSegments[0].bodyExposure.sunscreenSPF).toBe(0); }
});
it.each(actions)('does not publish live %s or runtime effects when durable storage rejects', async action => {
  await seed(action); const before = await stored(), { result, draft } = await propose(action); expect(result.success, result.contentItems[0].text).toBe(true);
  const write = storage.encryptedSetItem; vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw Error('Synthetic disk failure'); return write(...args); });
  await expect(applyAgentDraft(draft)).rejects.toThrow(); expect(await stored()).toEqual(before); expect(state.importedData).toEqual(before); expect(publish).not.toHaveBeenCalled(); expect(clear).not.toHaveBeenCalled(); expect(resetRate).not.toHaveBeenCalled(); expect(analyze).not.toHaveBeenCalled();
});
it('rejects a stale peer action and permission revocation before any live mutation', async () => {
  const { result, draft } = await propose('pause'); expect(result.success).toBe(true); const peer = await stored(); peer.sunSessions![0]!.notes = 'Peer edit'; await storage.encryptedSetItem(key, JSON.stringify(peer));
  await expect(applyAgentDraft(draft)).rejects.toThrow(/changed|review/i); expect(await stored()).toEqual(peer); expect(publish).not.toHaveBeenCalled();
  setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, false); await expect(applyAgentDraft(draft)).rejects.toThrow(); expect(await stored()).toEqual(peer);
});
it('retains explicit no-sunscreen as zero and records a boundary while leaving body coverage alone', async () => {
  state.importedData.sunSessions![0]!.bodyExposure.sunscreenSPF = 30; expect(await saveImportedData()).toBe(true); const { result, draft } = await propose('setSunscreen', { sunscreenSPF: 0 }); expect(result.success).toBe(true);
  await applyAgentDraft(draft); const row = (await stored()).sunSessions![0]!; expect(row.bodyExposure.sunscreenSPF).toBe(0); expect(row.bodyExposure.fraction).toBe(0.05); expect(row.exposureSegments[0].bodyExposure.sunscreenSPF).toBe(30);
});
it('reports an accepted action truthfully if permission changes after the durable write completes', async () => {
  const { result, draft } = await propose('pause'); expect(result.success).toBe(true);
  const write = storage.encryptedSetItem; vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => {
    const result = await write(...args); if (args[0] === key) setContextSourceEnabled(CONTEXT_SOURCE_IDS.LIGHT_SUN, false); return result;
  });
  await expect(applyAgentDraft(draft)).resolves.toMatch(/paused/i); expect((await stored()).sunSessions![0]!.paused).toBe(true);
  expect(publish).not.toHaveBeenCalled(); expect(resetRate).not.toHaveBeenCalled(); expect(analyze).not.toHaveBeenCalled();
});
it('checks the reviewed source again after another queued write changes the live timer', async () => {
  const { result, draft } = await propose('pause'); expect(result.success).toBe(true);
  const first = sessions.setSessionCoverage('sun-active', ['face']);
  await expect(applyAgentDraft(draft)).rejects.toThrow(/changed|review/i); await first;
  const row = (await stored()).sunSessions![0]!; expect(row.paused).not.toBe(true); expect(row.bodyExposure.regions).toEqual(['face']);
});
it.each(actions)('does not use live %s on a completed record', async action => {
  state.importedData.sunSessions![0]!.endedAt = now; state.importedData.sunSessions![0]!.durationMin = 10; expect(await saveImportedData()).toBe(true); const before = await stored();
  expect((await propose(action)).result.success).toBe(false); expect(await stored()).toEqual(before);
});
