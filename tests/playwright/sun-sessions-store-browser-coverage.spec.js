import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?sunSessionsStoreCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('sun sessions store browser coverage exercises lifecycle edits hydration and deletion', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async ({ storeUrl }) => {
    const [store, { state }, data] = await Promise.all([
      import(storeUrl),
      import('/js/state.js'),
      import('/js/data.js'),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, label) => {
      for (let i = 0; i < 160; i += 1) {
        if (await predicate()) return true;
        await wait(25);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };

    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const saved = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
      profiles: clone(state.profiles),
      consoleWarn: console.warn,
    };
    const results = {};
    const depCalls = [];
    const aiCalls = [];
    const warnings = [];
    let fetchCalls = 0;
    let lastSpectrumArgs = null;
    let lastDoseArgs = null;
    let holdAtmosphereFetch = false;
    let releaseAtmosphereFetch = null;

    try {
      state.currentProfile = 'sun-sessions-store-coverage';
      state.profiles = [{
        id: state.currentProfile,
        name: 'Sun Sessions Store Coverage',
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        tags: [],
        notes: '',
        status: 'active',
        pinned: false,
      }];
      state.importedData = {
        entries: [],
        notes: [],
        supplements: [],
        healthGoals: [],
        sunSessions: [],
        sunDefaults: {
          fitzpatrick: 'II',
          photosensitiveMeds: 'moderate',
          overrides: {
            uvIndex: 7,
            cloudCover: 40,
            ozoneDU: 310,
          },
        },
        lightCircadian: { skinType: 'IV olive' },
      };
      data.invalidateActiveDataCache();

      store.configureSunSessionsStore({
        commitCurrentSlice: sess => depCalls.push(['commit', sess.id]),
        setLiveState: (id, liveState) => depCalls.push([
          'live',
          id,
          liveState && Object.prototype.hasOwnProperty.call(liveState, 'ratePerMin')
            ? liveState.ratePerMin
            : 'other',
        ]),
        clearLiveState: id => depCalls.push(['clear', id]),
        formatElapsed: ms => `elapsed:${Math.round(ms / 1000)}s`,
        maybeAnalyzeSessionAfterFinish: sess => aiCalls.push(sess.id),
      });
      console.warn = (...args) => warnings.push(args.map(String).join(' '));

      const fetchAtmosphere = async () => {
        fetchCalls += 1;
        if (holdAtmosphereFetch) {
          await new Promise(resolve => { releaseAtmosphereFetch = resolve; });
        }
        return {
          uvIndex: 5,
          cloudCover: 20,
          ozoneDU: 300,
          airQuality: { aod: 0.15 },
        };
      };
      const reconstructSpectrum = args => {
        lastSpectrumArgs = args;
        return { wavelengths: [300, 305], irradiance: [1, 0.8] };
      };
      const computeChannelDoses = args => {
        lastDoseArgs = args;
        return { vitamin_d: 66, circadian: 11 };
      };
      const erythemalSED = () => 13;
      const fractionOfMED = () => 0.25;
      const retinalUVdose = () => 0.02;
      const solarZenithAngle = () => 35;
      store.configureSunSessionsStore({
        fetchAtmosphere,
        reconstructSpectrum,
        computeChannelDoses,
        erythemalSED,
        fractionOfMED,
        retinalUVdose,
        solarZenithAngle,
      });

      const activeId = await store.startSession({
        regions: ['face', 'arms-front'],
        eyeMode: 'direct',
        lensTint: 'clear',
        glassBetween: true,
        location: { lat: 50.1, lon: 14.4, altitudeM: 220 },
        posture: 'lying-supine',
        surfaceAlbedo: 'sand',
      });
      const active = store.getActiveSession();
      active.startedAt = Date.now() - 125000;
      results.startSessionUsesDetailedRegionsAndActiveLookup = active?.id === activeId
        && active.bodyExposure?.preset === 'detailed'
        && active.bodyExposure?.regions?.join(',') === 'face,arms-front'
        && active.bodyExposure?.fraction > 0.08
        && active.eyeExposure?.mode === 'glass-window';

      const paused = await store.pauseSession(activeId);
      const pausedState = paused?.paused === true;
      const resumed = await store.resumeSession(activeId);
      const resumedState = resumed?.paused === false && resumed?.pausedAt == null;
      const rotated = await store.markSessionRotated(activeId);
      const rotatedState = rotated?.bodyExposure?.rotatedSides === true;
      await store.markSessionRotated(activeId);
      const spf30 = await store.setSessionSunscreen(activeId, 30);
      const spfAfter30 = spf30?.bodyExposure?.sunscreenSPF;
      const spfZero = await store.setSessionSunscreen(activeId, 0);
      const spfAfterZero = spfZero?.bodyExposure?.sunscreenSPF;
      const invalidSpf = await store.setSessionSunscreen(activeId, 101);
      const covered = await store.setSessionCoverage(activeId, ['face', 'unknown-region', 'face', 'arms-front']);
      results.activeSessionEditsCommitAndNormalizeState = pausedState
        && resumedState
        && rotatedState
        && spfAfter30 === 30
        && spfAfterZero === null
        && invalidSpf === null
        && covered?.bodyExposure?.regions?.join(',') === 'face,arms-front'
        && depCalls.filter(call => call[0] === 'commit').length >= 3
        && depCalls.some(call => call[0] === 'live' && call[2] === null);

      const elapsed = document.createElement('span');
      elapsed.dataset.liveElapsedFor = activeId;
      document.body.appendChild(elapsed);
      const stopped = await store.stopSession(activeId);
      results.stopSessionFreezesLiveElapsedWithoutPrematureAi = stopped?.endedAt
        && stopped.durationMin > 1
        && stopped.eyeExposure?.durationSec > 60
        && !elapsed.hasAttribute('data-live-elapsed-for')
        && elapsed.textContent.startsWith('elapsed:')
        && depCalls.some(call => call[0] === 'clear' && call[1] === activeId)
        && !aiCalls.includes(activeId)
        && stopped.calculationStatus === 'pending';
      elapsed.remove();
      await store.hydrateSession(activeId, { lat: 50.1, lon: 14.4 });
      results.completedHydrationTriggersSessionAnalysis = aiCalls.includes(activeId)
        && store.getSessions().find(sess => sess.id === activeId)?.calculationStatus === 'computed';

      const loggedId = await store.logCompletedSession({
        startedAt: Date.now() - 60 * 60000,
        endedAt: Date.now() - 35 * 60000,
        location: { lat: 50.1, lon: 14.4, altitudeM: 220 },
        bodyExposure: {
          preset: 'detailed',
          fraction: 0.12,
          regions: ['face'],
          sunscreenSPF: 15,
          glassBetween: true,
          rotatedSides: false,
        },
        eyeExposure: { mode: 'direct', lensTint: 'clear', durationSec: 1500 },
        posture: 'lying-supine',
        surfaceAlbedo: 'sand',
        engineVersion: store.SUN_ENGINE_VERSION - 1,
        notes: 'initial logged note',
      });
      const logged = store.getSessions().find(sess => sess.id === loggedId);
      results.logCompletedSessionAddsDurationWithoutPrematureAi = !!logged
        && logged.durationMin > 20
        && !aiCalls.includes(loggedId)
        && logged.calculationStatus === 'pending';

      logged.doses = { vitamin_d: 999 };
      logged.safety = { medFraction: 0.99 };
      logged.calculationStatus = 'computed';
      holdAtmosphereFetch = true;
      const updatePromise = store.updateSession(loggedId, { durationMin: 20, notes: 'updated note' });
      await waitFor(() => typeof releaseAtmosphereFetch === 'function', 'duration edit pending fetch');
      const pendingEdit = store.getSessions().find(sess => sess.id === loggedId);
      results.durationEditHidesStaleDerivedValuesWhilePending = pendingEdit?.calculationStatus === 'pending'
        && pendingEdit.doses == null
        && pendingEdit.safety == null
        && pendingEdit.atmosphere == null;
      holdAtmosphereFetch = false;
      releaseAtmosphereFetch?.();
      releaseAtmosphereFetch = null;
      await updatePromise;
      await waitFor(() => store.getSessions().find(sess => sess.id === loggedId)?.engineVersion === store.SUN_ENGINE_VERSION, 'duration edit hydration');
      const hydrated = store.getSessions().find(sess => sess.id === loggedId);
      results.updateSessionAwaitsHydrationAndAppliesAllowedOverrides = hydrated?.notes === 'updated note'
        && hydrated?.durationMin === 20
        && hydrated?.doses?.vitamin_d === 66
        && hydrated?.safety?.medFraction === 0.25
        && hydrated?.atmosphere?.uvIndex === 5
        && hydrated?.atmosphere?.cloudCover === 40
        && hydrated?.atmosphere?.ozoneDU === 310
        && hydrated?.atmosphere?._uvOverridden == null
        && lastSpectrumArgs?.zenithDeg === 35
        && lastSpectrumArgs?.ozoneDU === 310
        && lastDoseArgs?.durationMin === 20
        && lastDoseArgs?.bodyExposureFraction === 0.12
        && lastDoseArgs?.skinIrradianceMultiplier > 1
        && lastDoseArgs?.eyeExposure?.mode === 'glass-window'
        && aiCalls.includes(loggedId);

      const staleId = await store.logCompletedSession({
        startedAt: Date.now() - 120 * 60000,
        endedAt: Date.now() - 90 * 60000,
        location: { lat: 51.5, lon: -0.1 },
        bodyExposure: { preset: 'face_hands', fraction: 0.05, regions: [], sunscreenSPF: null, glassBetween: false, rotatedSides: false },
        eyeExposure: { mode: 'indoor', lensTint: 'clear', durationSec: 0 },
        engineVersion: store.SUN_ENGINE_VERSION - 1,
      });
      const beforeRehydrateFetches = fetchCalls;
      const rehydrateResult = await store.rehydrateStaleSessions();
      const stale = store.getSessions().find(sess => sess.id === staleId);
      const freshRehydrateResult = await store.rehydrateStaleSessions();
      results.rehydrateStaleSessionsHydratesOnlyOldCompletedSessions = rehydrateResult.rehydrated >= 1
        && stale?.engineVersion === store.SUN_ENGINE_VERSION
        && freshRehydrateResult.rehydrated === 0
        && fetchCalls > beforeRehydrateFetches;

      const failedId = await store.logCompletedSession({
        startedAt: Date.now() - 50 * 60000,
        endedAt: Date.now() - 30 * 60000,
        location: { lat: 50.1, lon: 14.4 },
        bodyExposure: { preset: 'face_hands', fraction: 0.05, regions: [] },
        eyeExposure: { mode: 'indirect', lensTint: 'clear', durationSec: 1200 },
      });
      store.configureSunSessionsStore({ fetchAtmosphere: async () => { throw new Error('expected atmosphere failure'); } });
      const failedHydration = await store.hydrateSession(failedId, { lat: 50.1, lon: 14.4 });
      const failedSession = store.getSessions().find(sess => sess.id === failedId);
      results.hydrationFailurePersistsExplicitErrorWithoutDerivedValues = failedHydration === null
        && failedSession?.calculationStatus === 'calculation-error'
        && failedSession.doses == null
        && failedSession.safety == null
        && failedSession.atmosphere == null
        && !aiCalls.includes(failedId)
        && warnings.some(message => message.includes('hydrateSession failed'));
      store.configureSunSessionsStore({ fetchAtmosphere });

      const deleted = await store.deleteSession(loggedId);
      const deletedAgain = await store.deleteSession('missing-session-id');
      store.resetSunSessionsStoreState();
      results.deleteSessionRemovesSessionAndClearsLiveState = deleted === true
        && deletedAgain === false
        && !store.getSessions().some(sess => sess.id === loggedId)
        && depCalls.some(call => call[0] === 'clear' && call[1] === loggedId);
    } finally {
      document.querySelectorAll('[data-live-elapsed-for]').forEach(el => el.remove());
      store.configureSunSessionsStore({
        commitCurrentSlice: () => {},
        setLiveState: () => {},
        clearLiveState: () => {},
        formatElapsed: ms => `${Math.max(0, Math.floor((ms || 0) / 60000))}m`,
        maybeAnalyzeSessionAfterFinish: () => {},
        fetchAtmosphere: async () => null,
        reconstructSpectrum: () => null,
        computeChannelDoses: () => ({}),
        erythemalSED: () => 0,
        fractionOfMED: () => 0,
        retinalUVdose: () => 0,
        solarZenithAngle: () => 90,
      });
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      state.profiles = saved.profiles;
      data.invalidateActiveDataCache();
      console.warn = saved.consoleWarn;
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return results;
  }, { storeUrl: moduleUrl('/js/sun-sessions-store.js') });

  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
});

test('sun sessions store default dependency callbacks preserve lifecycle behavior', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async ({ storeUrl }) => {
    const [store, { state }, data] = await Promise.all([
      import(storeUrl),
      import('/js/state.js'),
      import('/js/data.js'),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const saved = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
      profiles: clone(state.profiles),
    };
    const results = {};

    try {
      state.currentProfile = 'sun-session-default-deps';
      state.profiles = [{
        id: state.currentProfile,
        name: 'Sun Session Defaults',
        createdAt: Date.now(),
        lastUpdated: Date.now(),
        tags: [],
        notes: '',
        status: 'active',
        pinned: false,
      }];
      state.importedData = {
        entries: [],
        notes: [],
        supplements: [],
        healthGoals: [],
        sunSessions: [],
      };
      data.invalidateActiveDataCache();
      store.configureSunSessionsStore({
        commitCurrentSlice: () => {},
        setLiveState: () => {},
        clearLiveState: () => {},
        formatElapsed: ms => `${Math.max(0, Math.floor((ms || 0) / 60000))}m`,
        maybeAnalyzeSessionAfterFinish: () => {},
      });

      const id = await store.startSession({ exposurePreset: 'face_hands' });
      const active = store.getActiveSession();
      active.startedAt = Date.now() - 135000;
      const paused = await store.pauseSession(id);
      results.defaultPauseDepsAreNoopsButStatePersists =
        paused?.paused === true
        && paused.pausedAt
        && paused.id === id;

      const elapsed = document.createElement('span');
      elapsed.dataset.liveElapsedFor = id;
      document.body.appendChild(elapsed);
      const stopped = await store.stopSession(id);
      const expectedElapsed = `${Math.max(0, Math.floor((stopped.endedAt - stopped.startedAt) / 60000))}m`;
      results.noopStopDepsFreezeElapsed =
        stopped?.endedAt
        && stopped.durationMin >= 2
        && stopped.eyeExposure?.durationSec >= 120
        && !elapsed.hasAttribute('data-live-elapsed-for')
        && elapsed.textContent === expectedElapsed;
      elapsed.remove();
    } finally {
      document.querySelectorAll('[data-live-elapsed-for]').forEach(el => el.remove());
      store.configureSunSessionsStore({
        maybeAnalyzeSessionAfterFinish: () => {},
      });
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      state.profiles = saved.profiles;
      data.invalidateActiveDataCache();
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
    }

    return results;
  }, { storeUrl: moduleUrl('/js/sun-sessions-store.js') });

  const expectedOutcomes = [
    'defaultPauseDepsAreNoopsButStatePersists',
    'noopStopDepsFreezeElapsed',
  ];
  for (const key of expectedOutcomes) {
    expect(outcomes, `outcome key '${key}' was never set`).toHaveProperty(key);
  }
  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
});
