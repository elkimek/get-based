import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../js/data.js', () => ({ saveImportedData: vi.fn(async () => {}) }));
vi.mock('../js/state.js', () => ({ state: { currentProfile: 'a', importedData: null } }));
import { state } from '../js/state.js';
import { saveImportedData } from '../js/data.js';
import * as store from '../js/sun-sessions-store.js';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const record = (patch = {}) => ({ id: 'sun-a', startedAt: 100000, endedAt: 700000, durationMin: 10, location: { lat: 50, lon: 14 }, bodyExposure: { fraction: 0.1 }, eyeExposure: { mode: 'direct', durationSec: 600 }, ...patch });
let session, deps;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1000000); vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  store.resetSunSessionsStoreState();
  session = record(); state.currentProfile = 'a'; state.importedData = { sunSessions: [session] };
  saveImportedData.mockResolvedValue(undefined);
  deps = { fetchAtmosphere: vi.fn(async () => ({ uvIndex: 3, ozoneDU: 300 })), reconstructSpectrum: vi.fn(() => ({})), computeChannelDoses: vi.fn(({ durationMin }) => ({ vitamin_d: durationMin })), erythemalSED: vi.fn(() => 1), fractionOfMED: vi.fn(() => 0.1), retinalUVdose: vi.fn(() => 2), solarZenithAngle: vi.fn(() => 40), maybeAnalyzeSessionAfterFinish: vi.fn(), commitCurrentSlice: vi.fn(), clearLiveState: vi.fn(), setLiveState: vi.fn() };
  store.configureSunSessionsStore(deps);
});
afterEach(() => { store.resetSunSessionsStoreState(); vi.restoreAllMocks(); vi.useRealTimers(); });
const changes = {
  'profile switch': () => { state.currentProfile = 'b'; },
  'profile data reload': () => { state.importedData = { sunSessions: [record()] }; },
  'session deletion': () => { state.importedData.sunSessions = []; },
  'same-id replacement': () => { state.importedData.sunSessions = [record()]; },
  'runtime reset': () => store.resetSunSessionsStoreState(),
};
it.each(Object.keys(changes))('discards atmosphere completion after %s', async change => {
  const wait = deferred(); deps.fetchAtmosphere.mockReturnValue(wait.promise);
  const pending = store.hydrateSession(session.id); await vi.waitFor(() => expect(deps.fetchAtmosphere).toHaveBeenCalled());
  changes[change](); saveImportedData.mockClear(); wait.resolve({ uvIndex: 5 });
  expect(await pending).toBeNull(); expect(deps.computeChannelDoses).not.toHaveBeenCalled(); expect(saveImportedData).not.toHaveBeenCalled(); expect(deps.maybeAnalyzeSessionAfterFinish).not.toHaveBeenCalled();
});
it.each(Object.keys(changes))('discards atmosphere rejection after %s', async change => {
  const wait = deferred(); deps.fetchAtmosphere.mockReturnValue(wait.promise);
  const pending = store.hydrateSession(session.id); await vi.waitFor(() => expect(deps.fetchAtmosphere).toHaveBeenCalled());
  changes[change](); saveImportedData.mockClear(); wait.reject(Error('offline'));
  expect(await pending).toBeNull(); expect(saveImportedData).not.toHaveBeenCalled();
});
it('does not request atmosphere after ownership changes during the pending-state save', async () => {
  const wait = deferred(); saveImportedData.mockReturnValueOnce(wait.promise);
  const pending = store.hydrateSession(session.id); await Promise.resolve(); changes['profile switch'](); wait.resolve();
  expect(await pending).toBeNull(); expect(deps.fetchAtmosphere).not.toHaveBeenCalled();
});
it('latest direct hydration wins when older weather arrives last', async () => {
  const first = deferred(); deps.fetchAtmosphere.mockReturnValueOnce(first.promise);
  const old = store.hydrateSession(session.id); await vi.waitFor(() => expect(deps.fetchAtmosphere).toHaveBeenCalledTimes(1));
  await store.hydrateSession(session.id); first.resolve({ uvIndex: 99 });
  expect(await old).toBeNull(); expect(session.atmosphere.uvIndex).toBe(3); expect(deps.maybeAnalyzeSessionAfterFinish).toHaveBeenCalledTimes(1);
});
it('clears partial computed fields when the dose engine throws', async () => {
  deps.erythemalSED.mockImplementation(() => { throw Error('engine'); });
  expect(await store.hydrateSession(session.id)).toBeNull();
  expect(session).toMatchObject({ doses: null, atmosphere: null, safety: null, calculationStatus: 'calculation-error' });
  expect(deps.maybeAnalyzeSessionAfterFinish).not.toHaveBeenCalled();
});
it('stopping an already stopped session preserves its original duration and dose boundary', async () => {
  const snapshot = structuredClone(session);
  expect(await store.stopSession(session.id)).toBe(session);
  expect(session).toEqual(snapshot); expect(deps.commitCurrentSlice).not.toHaveBeenCalled(); expect(saveImportedData).not.toHaveBeenCalled();
});
it('a duration edit invalidates older weather before its replacement calculation', async () => {
  const wait = deferred(); deps.fetchAtmosphere.mockReturnValueOnce(wait.promise);
  const old = store.hydrateSession(session.id); await vi.waitFor(() => expect(deps.fetchAtmosphere).toHaveBeenCalledTimes(1));
  await store.updateSession(session.id, { durationMin: 20 }); wait.resolve({ uvIndex: 90 });
  expect(await old).toBeNull(); expect(session.doses.vitamin_d).toBe(20); expect(session.atmosphere.uvIndex).toBe(3);
});
it('stale-batch iteration stops at a profile switch instead of hydrating matching ids', async () => {
  const wait = deferred(); state.importedData.sunSessions.push(record({ id: 'second' })); deps.fetchAtmosphere.mockReturnValueOnce(wait.promise);
  const pending = store.rehydrateStaleSessions(); await vi.waitFor(() => expect(deps.fetchAtmosphere).toHaveBeenCalledTimes(1));
  state.currentProfile = 'b'; state.importedData = { sunSessions: [record({ id: 'second' })] }; wait.resolve({ uvIndex: 3 });
  expect(await pending).toEqual({ rehydrated: 0, ofTotal: 2 }); expect(deps.fetchAtmosphere).toHaveBeenCalledTimes(1);
});
it('a new profile with the same session id does not share the old hydration queue', async () => {
  const wait = deferred(); deps.fetchAtmosphere.mockReturnValueOnce(wait.promise);
  const old = store.rehydrateStaleSessions(); await vi.waitFor(() => expect(deps.fetchAtmosphere).toHaveBeenCalledTimes(1));
  state.currentProfile = 'b'; const replacement = record(); state.importedData = { sunSessions: [replacement] };
  expect(await store.rehydrateStaleSessions()).toEqual({ rehydrated: 1, ofTotal: 1 });
  wait.resolve({ uvIndex: 99 }); await old; expect(replacement.atmosphere.uvIndex).toBe(3);
});
it('concurrent stale batches share the same record calculation', async () => {
  const wait = deferred(); deps.fetchAtmosphere.mockReturnValue(wait.promise);
  const one = store.rehydrateStaleSessions(), two = store.rehydrateStaleSessions();
  await vi.waitFor(() => expect(deps.fetchAtmosphere).toHaveBeenCalledTimes(1)); wait.resolve({ uvIndex: 3 });
  expect(await one).toEqual({ rehydrated: 1, ofTotal: 1 }); expect(await two).toEqual({ rehydrated: 1, ofTotal: 1 });
});
it('does not analyze a session when ownership changes during its computed-state save', async () => {
  const wait = deferred(); saveImportedData.mockResolvedValueOnce().mockReturnValueOnce(wait.promise);
  const pending = store.hydrateSession(session.id); await vi.waitFor(() => expect(saveImportedData).toHaveBeenCalledTimes(2));
  changes['profile switch'](); wait.resolve(); expect(await pending).toBeNull(); expect(deps.maybeAnalyzeSessionAfterFinish).not.toHaveBeenCalled();
});
it('does not queue edited-session hydration after profile reload during save', async () => {
  const wait = deferred(); saveImportedData.mockReturnValueOnce(wait.promise);
  const pending = store.updateSession(session.id, { durationMin: 20 }); changes['profile data reload'](); wait.resolve();
  expect(await pending).toBeNull(); expect(deps.fetchAtmosphere).not.toHaveBeenCalled();
});
it('a rejected pending-state save propagates without weather or analysis', async () => {
  saveImportedData.mockRejectedValueOnce(Error('disk'));
  await expect(store.hydrateSession(session.id)).rejects.toThrow('disk'); expect(deps.fetchAtmosphere).not.toHaveBeenCalled(); expect(deps.maybeAnalyzeSessionAfterFinish).not.toHaveBeenCalled();
});
it('a rejected computed-state save clears computed values and allows retry', async () => {
  saveImportedData.mockResolvedValueOnce().mockRejectedValueOnce(Error('disk'));
  expect(await store.hydrateSession(session.id)).toBeNull(); expect(session.doses).toBeNull(); expect(deps.maybeAnalyzeSessionAfterFinish).not.toHaveBeenCalled();
  expect(await store.hydrateSession(session.id)).toBe(session); expect(session.calculationStatus).toBe('computed');
});
it.each([null, 'reject'])('unavailable weather (%s) leaves no stale dose estimates', async mode => {
  session.doses = { vitamin_d: 999 }; session.safety = { sed: 99 };
  if (mode === null) deps.fetchAtmosphere.mockResolvedValue(null); else deps.fetchAtmosphere.mockRejectedValue(Error('offline'));
  expect(await store.hydrateSession(session.id)).toBeNull(); expect(session.doses).toBeNull(); expect(session.safety).toBeNull(); expect(deps.maybeAnalyzeSessionAfterFinish).not.toHaveBeenCalled();
});
it('missing coordinates clear estimates without requesting weather', async () => {
  session.location = null; session.doses = { vitamin_d: 9 };
  expect(await store.hydrateSession(session.id)).toBeNull(); expect(session.calculationStatus).toBe('needs-location'); expect(session.doses).toBeNull(); expect(deps.fetchAtmosphere).not.toHaveBeenCalled();
});
it.each(['missing', 'active'])('does not hydrate %s sessions', async mode => {
  if (mode === 'active') session.endedAt = null;
  expect(await store.hydrateSession(mode === 'missing' ? 'missing' : session.id)).toBeNull(); expect(saveImportedData).not.toHaveBeenCalled();
});
it('a synchronous analysis failure cannot undo a successful hydration', async () => {
  deps.maybeAnalyzeSessionAfterFinish.mockImplementation(() => { throw Error('analysis'); });
  expect(await store.hydrateSession(session.id)).toBe(session); expect(session.calculationStatus).toBe('computed');
});
it('completed exposure segments are summed without requesting new weather', async () => {
  session.exposureSegments = [{ durationMin: 2, doses: { vitamin_d: 3 }, sed: 0.2, ocularActinicUV: 0.3 }, { durationMin: 4, doses: { vitamin_d: 5, bad: NaN }, sed: 0.4, retinalUV: 0.7, atmosphere: { uvIndex: 4 } }];
  expect(await store.hydrateSession(session.id)).toBe(session);
  expect(session.durationMin).toBe(6); expect(session.doses).toEqual({ vitamin_d: 8 }); expect(session.safety.ocularActinicUV).toBe(1); expect(deps.fetchAtmosphere).not.toHaveBeenCalled();
});
it.each(['profile switch', 'runtime reset', 'session deletion'])('does not analyze saved segments after %s', async change => {
  session.exposureSegments = [{ durationMin: 2, doses: { vitamin_d: 3 } }];
  const wait = deferred(); saveImportedData.mockReturnValueOnce(wait.promise);
  const pending = store.hydrateSession(session.id); changes[change](); wait.resolve();
  expect(await pending).toBeNull(); expect(deps.maybeAnalyzeSessionAfterFinish).not.toHaveBeenCalled();
});
it('stale recovery skips active, fresh and location-free records', async () => {
  state.importedData.sunSessions = [record({ endedAt: null }), record({ engineVersion: store.SUN_ENGINE_VERSION }), record({ location: null })];
  expect(await store.rehydrateStaleSessions()).toEqual({ rehydrated: 0 }); expect(deps.fetchAtmosphere).not.toHaveBeenCalled();
});
it('stale recovery continues after one record fails', async () => {
  state.importedData.sunSessions.push(record({ id: 'second' })); deps.fetchAtmosphere.mockRejectedValueOnce(Error('offline'));
  expect(await store.rehydrateStaleSessions()).toEqual({ rehydrated: 1, ofTotal: 2 }); expect(deps.fetchAtmosphere).toHaveBeenCalledTimes(2);
});
it('pause and resume exclude paused time when stopping', async () => {
  session.endedAt = null; session.startedAt = Date.now(); session.eyeExposure.durationSec = null;
  vi.setSystemTime(1060000); await store.pauseSession(session.id); vi.setSystemTime(1180000); await store.resumeSession(session.id); vi.setSystemTime(1240000); await store.stopSession(session.id);
  expect(session.durationMin).toBe(2); expect(session.eyeExposure.durationSec).toBe(120); expect(session.accumulatedPausedMs).toBe(120000); expect(deps.commitCurrentSlice).toHaveBeenCalledTimes(2);
});
it('stopping while paused accounts for the final pause without committing another slice', async () => {
  session.endedAt = null; session.startedAt = 900000; session.paused = true; session.pausedAt = 960000;
  await store.stopSession(session.id); expect(session.durationMin).toBe(1); expect(deps.commitCurrentSlice).not.toHaveBeenCalled(); expect(deps.clearLiveState).toHaveBeenCalledWith(session.id);
});
it.each(['pauseSession', 'resumeSession', 'markSessionRotated', 'setSessionSunscreen', 'setSessionCoverage'])('%s does not edit an ended session', async method => {
  const before = structuredClone(session); expect(await store[method](session.id, 20)).toBeNull(); expect(session).toEqual(before); expect(saveImportedData).not.toHaveBeenCalled();
});
it.each([-1, 101, NaN, Infinity, 'wrong'])('invalid sunscreen %s does not commit a live slice', async spf => {
  session.endedAt = null; expect(await store.setSessionSunscreen(session.id, spf)).toBeNull(); expect(deps.commitCurrentSlice).not.toHaveBeenCalled(); expect(saveImportedData).not.toHaveBeenCalled();
});
it('coverage edits normalize duplicate/unknown regions and allow fully covered skin', async () => {
  session.endedAt = null; await store.setSessionCoverage(session.id, ['face', 'face', 'invalid']);
  expect(session.bodyExposure.regions).toEqual(['face']); expect(session.bodyExposure.fraction).toBeGreaterThan(0);
  await store.setSessionCoverage(session.id, []); expect(session.bodyExposure).toMatchObject({ regions: [], fraction: 0, preset: 'covered' }); expect(deps.commitCurrentSlice).toHaveBeenCalledTimes(2);
});
it('repeating pause and rotation does not duplicate dose slices', async () => {
  session.endedAt = null; await store.pauseSession(session.id); await store.pauseSession(session.id); await store.markSessionRotated(session.id); await store.markSessionRotated(session.id);
  expect(deps.commitCurrentSlice).toHaveBeenCalledTimes(2); expect(saveImportedData).toHaveBeenCalledTimes(2);
});
it('notes edits preserve computed dose inputs and immutable identity', async () => {
  session.doses = { vitamin_d: 10 }; await store.updateSession(session.id, { notes: 'edited', id: 'other', startedAt: 0 });
  expect(session.id).toBe('sun-a'); expect(session.startedAt).toBe(100000); expect(session.doses).toEqual({ vitamin_d: 10 }); expect(deps.fetchAtmosphere).not.toHaveBeenCalled();
});
it('an end-time edit clears timed segments and updates eye duration before calculation', async () => {
  session.exposureSegments = [{ durationMin: 1 }]; session.aiAnalysis = 'old'; session.engineVersion = 1;
  await store.updateSession(session.id, { endedAt: 1300000 }); expect(session.durationMin).toBe(20); expect(session.eyeExposure.durationSec).toBe(1200); expect(session.exposureSegments).toEqual([]); expect(session.aiAnalysis).toBeUndefined();
});
it.each(['startSession', 'stopSession', 'pauseSession', 'markSessionRotated', 'deleteSession', 'updateSession', 'hydrateSession'])('%s reports a false persistence result instead of success', async method => {
  saveImportedData.mockResolvedValue(false);
  if (['stopSession', 'pauseSession', 'markSessionRotated'].includes(method)) session.endedAt = null;
  const call = method === 'startSession' ? store.startSession() : store[method](session.id, method === 'updateSession' ? { notes: 'new' } : undefined);
  await expect(call).rejects.toThrow('could not be saved'); expect(deps.maybeAnalyzeSessionAfterFinish).not.toHaveBeenCalled();
});
it('a false final save cannot announce a computed session', async () => {
  saveImportedData.mockResolvedValueOnce().mockResolvedValueOnce(false).mockResolvedValueOnce();
  expect(await store.hydrateSession(session.id)).toBeNull(); expect(session.doses).toBeNull(); expect(deps.maybeAnalyzeSessionAfterFinish).not.toHaveBeenCalled();
});
it.each([[[]], [['unknown']]])('start rejects unusable regions %j without saving a phantom exposure', async regions => {
  await expect(store.startSession({ regions })).rejects.toThrow('regions'); expect(state.importedData.sunSessions).toHaveLength(1); expect(saveImportedData).not.toHaveBeenCalled();
});
it('a detailed start deduplicates regions and normalizes behind-glass eyes', async () => {
  const id = await store.startSession({ regions: ['face', 'face', 'unknown'], glassBetween: true });
  const added = store.getSessions().find(s => s.id === id); expect(added.bodyExposure.regions).toEqual(['face']); expect(added.eyeExposure.mode).toBe('glass-window'); expect(store.getActiveSession()).toBe(added);
});
it('a missing session deletion makes no writes', async () => {
  expect(await store.deleteSession('missing')).toBe(false); expect(saveImportedData).not.toHaveBeenCalled(); expect(deps.clearLiveState).not.toHaveBeenCalled();
});
it('duration edits without coordinates withhold stale results and do not fetch', async () => {
  session.location = null; session.doses = { vitamin_d: 3 }; await store.updateSession(session.id, { durationMin: 4 });
  expect(session).toMatchObject({ durationMin: 4, doses: null, calculationStatus: 'needs-location' }); expect(deps.fetchAtmosphere).not.toHaveBeenCalled();
});
it('scenario overrides do not persist private flags or restore retired manual UVI', async () => {
  state.importedData.sunDefaults = { overrides: { cloudCover: 42, ozoneDU: 320, uvIndex: 99 } };
  await store.hydrateSession(session.id); expect(session.atmosphere).toEqual({ uvIndex: 3, ozoneDU: 320, cloudCover: 42 });
});
it('completed manual logging persists defaults and computes duration from timestamps', async () => {
  const id = await store.logCompletedSession({ startedAt: 100000, endedAt: 220000 });
  expect(store.getSessions().find(s => s.id === id)).toMatchObject({ durationMin: 2, calculationStatus: 'needs-location', exposureSegments: [], eyeExposure: { mode: 'indoor', durationSec: 0 } });
  expect(saveImportedData).toHaveBeenCalledTimes(1);
});
it('completed manual logging preserves explicit exposure records', async () => {
  const payload = { startedAt: 100000, endedAt: 220000, durationMin: 1, location: { lat: 50, lon: 14 }, bodyExposure: { fraction: 0.3 }, eyeExposure: { mode: 'closed-eyes' }, atmosphere: { uvIndex: 1 }, doses: { vitamin_d: 2 }, safety: { sed: 0.1 }, notes: 'shade', exposureSegments: [{ durationMin: 1 }], accumulatedPausedMs: 60000 };
  const id = await store.logCompletedSession(payload); expect(store.getSessions().find(s => s.id === id)).toMatchObject(payload);
});
it('sunscreen removal preserves the preceding slice and clears live rate', async () => {
  session.endedAt = null; session.bodyExposure.sunscreenSPF = 30;
  await store.setSessionSunscreen(session.id, 0); expect(session.bodyExposure.sunscreenSPF).toBeNull(); expect(deps.commitCurrentSlice).toHaveBeenCalledTimes(1); expect(deps.setLiveState).toHaveBeenCalledWith(session.id, { ratePerMin: null });
});
it('sunscreen addition can repair a legacy missing bodyExposure record', async () => {
  session.endedAt = null; delete session.bodyExposure; await store.setSessionSunscreen(session.id, 30); expect(session.bodyExposure.sunscreenSPF).toBe(30);
});
it('reads repair missing session arrays and strip legacy live fields', () => {
  session._activeRate = {}; session._activeRatePending = true; session._fractionOfMED = 1;
  expect(store.getSessions()[0]._activeRate).toBeUndefined(); expect(session._fractionOfMED).toBeUndefined();
  state.importedData = {}; expect(store.getSessions()).toEqual([]); expect(store.getActiveSession()).toBeNull(); state.importedData = null; expect(store.getSessions()).toEqual([]);
});
it('legacy behind-glass sessions normalize eyes before both dose calculations', async () => {
  session.bodyExposure.glassBetween = true; await store.hydrateSession(session.id);
  expect(deps.computeChannelDoses.mock.calls[0][0].eyeExposure.mode).toBe('glass-window'); expect(deps.retinalUVdose.mock.calls[0][0].eyeExposure.mode).toBe('glass-window');
});
it('a stale recovery save failure is isolated and can be retried', async () => {
  saveImportedData.mockRejectedValueOnce(Error('disk'));
  expect(await store.rehydrateStaleSessions()).toEqual({ rehydrated: 0, ofTotal: 1 });
  expect(await store.rehydrateStaleSessions()).toEqual({ rehydrated: 1, ofTotal: 1 });
});
it('failed final persistence leaves the record eligible for stale recovery', async () => {
  saveImportedData.mockResolvedValueOnce().mockResolvedValueOnce(false).mockResolvedValueOnce();
  await store.hydrateSession(session.id); expect(session.engineVersion).toBeUndefined();
  expect(await store.rehydrateStaleSessions()).toEqual({ rehydrated: 1, ofTotal: 1 });
});
it('an asynchronous analysis failure does not leak a rejected background promise', async () => {
  deps.maybeAnalyzeSessionAfterFinish.mockRejectedValue(Error('analysis unavailable'));
  expect(await store.hydrateSession(session.id)).toBe(session); await Promise.resolve(); expect(session.calculationStatus).toBe('computed');
});
it('a malformed imported time reports calculation failure without fetching weather', async () => {
  session.startedAt = 'bad date'; expect(await store.hydrateSession(session.id)).toBeNull();
  expect(session.calculationStatus).toBe('calculation-error'); expect(deps.fetchAtmosphere).not.toHaveBeenCalled();
});
