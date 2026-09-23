// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../js/state.js', () => ({ state: { currentProfile: 'a', importedData: {}, currentView: 'other' } }));
vi.mock('../js/utils.js', () => ({ escapeHTML: String, escapeAttr: String, showNotification: vi.fn() }));
vi.mock('../js/sun-session-ui.js', () => ({ renderChannelChips: () => '' }));
vi.mock('../js/sun-session-actions.js', () => ({ setSunChannelChipsExpanded: vi.fn() }));
vi.mock('../js/sun-body-silhouette.js', () => ({ BODY_REGIONS: [], renderBodySilhouette: () => '', bindBodySilhouette: vi.fn() }));
import { state } from '../js/state.js';
import * as active from '../js/sun-active-session.js';
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let session, sessions, deps;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1000000); vi.spyOn(console, 'warn').mockImplementation(() => {});
  active.resetSunActiveSessionState(); document.body.innerHTML = '';
  state.currentProfile = 'a'; state.importedData = {}; state.currentView = 'other';
  session = { id: 'same-id', startedAt: 900000, location: { lat: 50, lon: 14 }, bodyExposure: { fraction: 0.1 } }; sessions = [session];
  deps = { getSessions: () => sessions, getActiveSession: () => sessions.find(s => !s.endedAt), getSunCoords: () => null,
    fetchAtmosphere: vi.fn(async () => ({ uvIndex: 3 })), applyAtmOverrides: a => a, reconstructSpectrum: vi.fn(() => ({})), computeChannelDoses: vi.fn(() => ({ vitamin_d: 2 })), erythemalSED: () => 1, fractionOfMED: () => 0.1, solarZenithAngle: () => 40, ocularActinicUVdose: () => 1, saveImportedData: vi.fn(async () => {}), hydrateSession: vi.fn(async () => {}), renderLightChannelsLive: vi.fn() };
  active.configureSunActiveSession(deps);
});
afterEach(() => { active.resetSunActiveSessionState(); vi.restoreAllMocks(); vi.useRealTimers(); });
const changes = {
  'profile switch': () => { state.currentProfile = 'b'; },
  'profile reload': () => { state.importedData = {}; },
  'session deletion': () => { sessions = []; },
  'same-id replacement': () => { sessions = [{ ...session }]; },
  'session stop': () => { session.endedAt = Date.now(); },
  'session pause': () => { session.paused = true; },
  'live state clear': () => active.clearSunLiveState(session.id),
  'runtime reset': () => active.resetSunActiveSessionState(),
  'exposure change': () => active.setSunLiveState(session.id, { ratePerMin: null }),
};
it.each(Object.keys(changes))('does not publish delayed live rates after %s', async change => {
  const wait = deferred(); deps.fetchAtmosphere.mockReturnValue(wait.promise);
  active.ensureActiveTicker(); expect(deps.fetchAtmosphere).toHaveBeenCalledTimes(1);
  changes[change](); wait.resolve({ uvIndex: 6 }); await vi.advanceTimersByTimeAsync(0);
  expect(deps.computeChannelDoses).not.toHaveBeenCalled();
});
it('retries when coordinates become available after the first tick', async () => {
  session.location = null; active.ensureActiveTicker(); await vi.advanceTimersByTimeAsync(0);
  session.location = { lat: 50, lon: 14 }; await vi.advanceTimersByTimeAsync(1000);
  expect(deps.fetchAtmosphere).toHaveBeenCalledTimes(1); expect(active.liveDosesFor(session)).not.toBeNull();
});
it('a cleared pending request cannot overwrite the replacement request', async () => {
  const first = deferred(); deps.fetchAtmosphere.mockReturnValueOnce(first.promise);
  active.ensureActiveTicker(); active.clearSunLiveState(session.id); await vi.advanceTimersByTimeAsync(1000);
  expect(active.liveDosesFor(session).atm.uvIndex).toBe(3);
  first.resolve({ uvIndex: 99 }); await vi.advanceTimersByTimeAsync(0);
  expect(active.liveDosesFor(session).atm.uvIndex).toBe(3);
});
it('old rejection cannot clear the pending flag of the replacement request', async () => {
  const first = deferred(), second = deferred(); deps.fetchAtmosphere.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  active.ensureActiveTicker(); active.clearSunLiveState(session.id); await vi.advanceTimersByTimeAsync(1000);
  first.reject(Error('old')); await vi.advanceTimersByTimeAsync(1000);
  expect(deps.fetchAtmosphere).toHaveBeenCalledTimes(2);
  second.resolve({ uvIndex: 4 }); await vi.advanceTimersByTimeAsync(0);
  expect(active.liveDosesFor(session).atm.uvIndex).toBe(4);
});
it.each(['profile switch', 'profile reload', 'session deletion', 'same-id replacement', 'runtime reset'])('does not hydrate a different session after coordinate save and %s', async change => {
  const wait = deferred(); deps.saveImportedData.mockReturnValue(wait.promise); active.configureSunActiveSession({ getSunCoords: () => ({ lat: 1, lon: 2 }) });
  const pending = active.hydrateSunSessionFromProfileCoords(session.id); changes[change](); wait.resolve(); await pending;
  expect(deps.hydrateSession).not.toHaveBeenCalled();
});
it('does not keep a timer alive when no session exists', () => {
  sessions = []; active.ensureActiveTicker(); expect(vi.getTimerCount()).toBe(0);
});
it.each(['profile switch', 'profile reload', 'same-id replacement', 'runtime reset'])('a quick-stop completion after %s cannot hydrate or refresh the new profile', async change => {
  const wait = deferred(), refresh = vi.fn(); active.configureSunActiveSession({ stopSession: () => wait.promise, refreshSurfaces: refresh });
  const pending = active.quickLogSunSession(); changes[change](); wait.resolve();
  expect(await pending).toBe(false); expect(deps.hydrateSession).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
});
it('weather failure is retried on the next live tick', async () => {
  deps.fetchAtmosphere.mockRejectedValueOnce(Error('offline'));
  active.ensureActiveTicker(); await vi.advanceTimersByTimeAsync(1000);
  expect(deps.fetchAtmosphere).toHaveBeenCalledTimes(2); expect(active.liveDosesFor(session)).not.toBeNull();
});
it('repeated ticker installation does not duplicate a pending request or timer', async () => {
  const wait = deferred(); deps.fetchAtmosphere.mockReturnValue(wait.promise);
  active.ensureActiveTicker(); active.ensureActiveTicker(); await vi.advanceTimersByTimeAsync(2000);
  expect(deps.fetchAtmosphere).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(1); wait.resolve({ uvIndex: 3 }); await vi.advanceTimersByTimeAsync(0);
});
it('reset cancels the interval and leaves no resurrected doses after a late rejection', async () => {
  const wait = deferred(); deps.fetchAtmosphere.mockReturnValue(wait.promise);
  active.ensureActiveTicker(); active.resetSunActiveSessionState(); wait.reject(Error('late')); await vi.advanceTimersByTimeAsync(5000);
  expect(active.liveDosesFor(session)).toBeNull(); expect(vi.getTimerCount()).toBe(0); expect(deps.fetchAtmosphere).toHaveBeenCalledTimes(1);
});
it('a paused session resumes with a fresh request after discarding pending weather', async () => {
  const wait = deferred(); deps.fetchAtmosphere.mockReturnValueOnce(wait.promise);
  active.ensureActiveTicker(); session.paused = true; wait.resolve({ uvIndex: 99 }); await vi.advanceTimersByTimeAsync(0);
  session.paused = false; await vi.advanceTimersByTimeAsync(1000);
  expect(deps.fetchAtmosphere).toHaveBeenCalledTimes(2); expect(active.liveDosesFor(session).atm.uvIndex).toBe(3);
});
it.each(['location', 'bodyExposure', 'updatedAt', 'sunDefaults'])('rejects live weather after in-place synchronized %s changes', async field => {
  const wait = deferred(); deps.fetchAtmosphere.mockReturnValue(wait.promise); active.ensureActiveTicker();
  if (field === 'sunDefaults') state.importedData.sunDefaults = { fitzpatrick: 'VI' };
  else session[field] = { location: { lat: 1, lon: 2 }, bodyExposure: { fraction: 0.8 }, updatedAt: 1234 }[field];
  wait.resolve({ uvIndex: 99 }); await vi.advanceTimersByTimeAsync(0);
  expect(deps.computeChannelDoses).not.toHaveBeenCalled();
});
it.each(['replacement', 'in-place edit'])('starts weather for a %s without waiting for the obsolete provider', async mode => {
  const wait = deferred(); deps.fetchAtmosphere.mockReturnValueOnce(wait.promise); active.ensureActiveTicker();
  if (mode === 'replacement') { session = { ...session }; sessions = [session]; }
  else session.location = { lat: 1, lon: 2 };
  await vi.advanceTimersByTimeAsync(1000); expect(deps.fetchAtmosphere).toHaveBeenCalledTimes(2);
  expect(active.liveDosesFor(session).atm.uvIndex).toBe(3);
  wait.resolve({ uvIndex: 99 }); await vi.advanceTimersByTimeAsync(0); expect(active.liveDosesFor(session).atm.uvIndex).toBe(3);
});
it('an explicitly installed live rate supersedes pending weather and preserves paused totals', async () => {
  const wait = deferred(); deps.fetchAtmosphere.mockReturnValueOnce(wait.promise); active.ensureActiveTicker();
  active.setSunLiveState(session.id, { ratePerMin: { vitamin_d: 1 }, committedDoses: { vitamin_d: 4 }, committedSED: 1, committedRetinalUV: 2, atm: { uvIndex: 3 }, pending: false });
  session.paused = true;
  expect(active.liveDosesFor(session)).toMatchObject({ paused: true, doses: { vitamin_d: 4 }, retinalUV: 2 });
  session.paused = false; wait.resolve({ uvIndex: 99 }); await vi.advanceTimersByTimeAsync(0);
  expect(active.liveDosesFor(session).atm.uvIndex).toBe(3);
});
