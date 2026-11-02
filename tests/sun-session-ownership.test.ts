// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { state } from '../js/state.js';
import { createDefaultProfileData, profileStorageKey } from '../js/profile.js';
import { saveImportedData } from '../js/data.js';
import * as storage from '../js/crypto.js';
import * as store from '../js/sun-sessions-store.js';
import { clearSyncSaveTimers } from '../js/sync-save-hooks.js';
import { rememberProfileData } from '../js/profile-data-writes.js';
import type { ProfileData } from '../types/app-state.js';
const previous = { profile: state.currentProfile, data: state.importedData };
let profile: string, key: string;
const analyze = vi.fn(), clearLive = vi.fn(), publishSlice = vi.fn();
const weather = vi.fn(async () => ({ uvIndex: 3, ozoneDU: 300 }));
const persisted = async () => JSON.parse((await storage.encryptedGetItem(key))!) as ProfileData;
function failWrites() {
  const original = storage.encryptedSetItem;
  return vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key) throw new Error('Synthetic storage failure'); return original(...args); });
}
beforeEach(async () => {
  profile = `sun-session-owned-${crypto.randomUUID()}`; key = profileStorageKey(profile, 'imported');
  localStorage.setItem('labcharts-active-profile', profile); state.currentProfile = profile; state.importedData = createDefaultProfileData();
  const now = Date.now();
  state.importedData.contextNotes = 'Keep unrelated context'; state.importedData.sunDefaults = { fitzpatrick: 'III' };
  state.importedData.sunSessions = [{ id: 'recorded-sun', startedAt: now - 3600000, endedAt: now - 3000000, durationMin: 10, location: { lat: 50, lon: 14 },
    bodyExposure: { fraction: 0.05 }, eyeExposure: { mode: 'direct', durationSec: 600 }, notes: 'Original note', atmosphere: { uvIndex: 1 }, doses: { vitamin_d: 2 }, safety: { sed: 1 }, engineVersion: 9, calculationStatus: 'computed', aiAnalysis: { detail: 'Original analysis' } }];
  expect(await saveImportedData()).toBe(true); store.resetSunSessionsStoreState();
  analyze.mockClear(); clearLive.mockClear(); publishSlice.mockClear(); weather.mockClear();
  store.configureSunSessionsStore({ fetchAtmosphere: weather, reconstructSpectrum: () => null, computeChannelDoses: options => ({ vitamin_d: options?.durationMin ?? 0 }), erythemalSED: () => 1, fractionOfMED: () => 0.1,
    retinalUVdose: () => 2, solarZenithAngle: () => 40, maybeAnalyzeSessionAfterFinish: analyze, clearLiveState: clearLive,
    commitCurrentSlice: draft => { draft.exposureSegments ||= []; draft.exposureSegments.push({ durationMin: 1, doses: { vitamin_d: 1 } }); return () => publishSlice(); } });
});
afterEach(async () => {
  store.resetSunSessionsStoreState(); vi.restoreAllMocks(); clearSyncSaveTimers(); await storage.encryptedRemoveItem(key);
  state.currentProfile = previous.profile; state.importedData = previous.data; document.body.innerHTML = '';
});
it('does not publish a failed native completed-session add', async () => {
  const before = await persisted(); failWrites(); await expect(store.logCompletedSession({ startedAt: Date.now() - 600000, endedAt: Date.now(), notes: 'New session' })).rejects.toThrow();
  expect(state.importedData).toEqual(before); expect(await persisted()).toEqual(before); expect(analyze).not.toHaveBeenCalled();
});
it.each([false, true])('initializes a genuinely empty profile with remembered defaults %s without rejecting its first write', async remembered => {
  await storage.encryptedRemoveItem(key); state.importedData = createDefaultProfileData();
  if (remembered) rememberProfileData(state.importedData);
  const id = await store.startSession(); expect((await persisted()).sunSessions![0]!.id).toBe(id);
});
it.each([false, true])('rejects an empty root with remembered defaults %s when the profile already has saved sessions', async remembered => {
  const before = await persisted(); state.importedData = createDefaultProfileData();
  if (remembered) rememberProfileData(state.importedData);
  await expect(store.startSession()).rejects.toThrow(/changed|reload/i); expect(await persisted()).toEqual(before); expect(state.importedData.sunSessions).toEqual([]);
});
it('does not publish a failed native removal or clear live state', async () => {
  const before = await persisted(); failWrites(); await expect(store.deleteSession('recorded-sun')).rejects.toThrow();
  expect(state.importedData).toEqual(before); expect(await persisted()).toEqual(before); expect(clearLive).not.toHaveBeenCalled();
});
it('does not publish failed native input edits or clear original calculations', async () => {
  const before = await persisted(); failWrites(); await expect(store.updateSession('recorded-sun', { durationMin: 20, notes: 'Corrected' })).rejects.toThrow();
  expect(state.importedData).toEqual(before); expect(await persisted()).toEqual(before); expect(weather).not.toHaveBeenCalled(); expect(analyze).not.toHaveBeenCalled();
});
it('does not clear a computed native record when the pending-state save fails', async () => {
  const before = await persisted(); failWrites(); await expect(store.hydrateSession('recorded-sun')).rejects.toThrow();
  expect(state.importedData).toEqual(before); expect(await persisted()).toEqual(before); expect(weather).not.toHaveBeenCalled(); expect(analyze).not.toHaveBeenCalled();
});
it.each(['stop', 'pause', 'resume', 'sunscreen', 'coverage', 'side', 'periodic-slice'] as const)('keeps failed native %s changes and live effects unpublished', async action => {
  const row = state.importedData.sunSessions![0]!; row.endedAt = null; row.eyeExposure.durationSec = null;
  if (action === 'resume') { row.paused = true; row.pausedAt = Date.now() - 60000; }
  expect(await saveImportedData()).toBe(true); const before = await persisted();
  document.body.innerHTML = '<span data-live-elapsed-for="recorded-sun">Live</span>'; failWrites();
  const run = () => action === 'stop' ? store.stopSession(row.id) : action === 'pause' ? store.pauseSession(row.id) : action === 'resume' ? store.resumeSession(row.id) : action === 'sunscreen' ? store.setSessionSunscreen(row.id, 30) : action === 'coverage' ? store.setSessionCoverage(row.id, []) : action === 'periodic-slice' ? store.persistActiveSunSlice(row.id) : store.markSessionRotated(row.id);
  await expect(run()).rejects.toThrow(); expect(state.importedData).toEqual(before); expect(await persisted()).toEqual(before);
  expect(publishSlice).not.toHaveBeenCalled(); expect(clearLive).not.toHaveBeenCalled(); expect(document.querySelector('[data-live-elapsed-for="recorded-sun"]')?.textContent).toBe('Live');
});
it('retains original inputs, segments and interpretation privately after a native duration correction', async () => {
  state.importedData.sunSessions![0]!.exposureSegments = [{ durationMin: 10, doses: { vitamin_d: 2 } }]; expect(await saveImportedData()).toBe(true); const before = await persisted();
  await store.updateSession('recorded-sun', { durationMin: 20 }); const saved = await persisted();
  expect(saved.sunSessions![0]!.durationMin).toBe(20); expect(saved.sunSessions![0]!.editHistory[0].record).toEqual(before.sunSessions![0]);
  expect(saved.sunSessions![0]!.doses.vitamin_d).toBe(20); expect(saved.contextNotes).toBe(before.contextNotes);
});
it('never pairs newer unsaved inputs with a computed result accepted during the write', async () => {
  const original = storage.encryptedSetItem; let writes = 0, entered!: () => void, release!: () => void;
  const writing = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  vi.spyOn(storage, 'encryptedSetItem').mockImplementation(async (...args) => { if (args[0] === key && ++writes === 2) { entered(); await gate; } return original(...args); });
  const pending = store.hydrateSession('recorded-sun'); await writing;
  const row = state.importedData.sunSessions![0]!; row.durationMin = 20; row.updatedAt = Date.now() + 1; release();
  expect(await pending).toBeNull(); expect(row.durationMin).toBe(20); expect(row.doses).toBeNull(); expect(row.safety).toBeNull(); expect(analyze).not.toHaveBeenCalled();
  const saved = (await persisted()).sunSessions![0]!; expect(saved.durationMin).toBe(10); expect(saved.doses.vitamin_d).toBe(10);
});
it('preserves an explicitly shorter eye-exposure interval during a duration correction', async () => {
  state.importedData.sunSessions![0]!.eyeExposure.durationSec = 120; expect(await saveImportedData()).toBe(true);
  await store.updateSession('recorded-sun', { durationMin: 20 }); expect((await persisted()).sunSessions![0]!.eyeExposure.durationSec).toBe(120);
});
it('retains unmeasured input intervals and retries their native calculations instead of applying final coverage to the whole timer', async () => {
  const now = Date.now(); vi.spyOn(Date, 'now').mockReturnValue(now);
  const row = state.importedData.sunSessions![0]!; row.startedAt = now - 600000; row.endedAt = null; delete row.durationMin; row.eyeExposure.durationSec = null;
  row.bodyExposure = { fraction: 0.05, sunscreenSPF: 0, glassBetween: false }; row.doses = null; row.atmosphere = null; row.safety = null;
  expect(await saveImportedData()).toBe(true); sessionsWithoutRate();
  await store.setSessionCoverage(row.id, ['face']); vi.mocked(Date.now).mockReturnValue(now + 60000); await store.stopSession(row.id);
  const before = await persisted(); expect(before.sunSessions![0]!.exposureSegments).toHaveLength(2);
  expect(before.sunSessions![0]!.exposureSegments[0]).toMatchObject({ durationMin: 10, bodyExposure: { fraction: 0.05 }, calculationStatus: 'pending' });
  const compute = vi.fn((options: { durationMin?: number; bodyExposureFraction?: number }) => ({ vitamin_d: (options.durationMin || 0) * (options.bodyExposureFraction || 0) }));
  const retryWeather = vi.fn().mockResolvedValueOnce(null).mockResolvedValue({ uvIndex: 3 }); store.configureSunSessionsStore({ fetchAtmosphere: retryWeather, computeChannelDoses: compute });
  expect(await store.hydrateSession(row.id)).toBeNull(); expect((await persisted()).sunSessions![0]!).toMatchObject({ doses: null, calculationStatus: 'atmosphere-unavailable' });
  await store.hydrateSession(row.id); const saved = (await persisted()).sunSessions![0]!;
  expect(saved.durationMin).toBe(11); expect(saved.calculationStatus).toBe('computed'); expect(saved.exposureSegments.every((segment: { calculationStatus: string }) => segment.calculationStatus === 'computed')).toBe(true);
  expect(compute.mock.calls[0]![0]).toMatchObject({ durationMin: 10, bodyExposureFraction: 0.05 });
  expect(compute.mock.calls[1]![0]).toMatchObject({ durationMin: 1, bodyExposureFraction: saved.bodyExposure.fraction });
  expect(saved.doses.vitamin_d).toBeCloseTo(0.5 + saved.bodyExposure.fraction); expect(saved.editHistory[0].record.bodyExposure.fraction).toBe(0.05);
});
function sessionsWithoutRate() { store.configureSunSessionsStore({ commitCurrentSlice: () => {} }); }
