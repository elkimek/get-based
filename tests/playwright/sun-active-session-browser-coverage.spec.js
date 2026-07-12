import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?sunActiveSessionCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function expectAll(outcomes) {
  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
}

test('sun active session covers default dependencies and live ticker card branches', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ activeUrl }) => {
    const [{ state }, active] = await Promise.all([
      import('/js/state.js'),
      import(activeUrl),
    ]);
    const outcomes = {};
    const saved = {
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      currentView: state.currentView,
    };
    const waitFor = async predicate => {
      for (let i = 0; i < 40; i += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      return false;
    };
    const toasts = () => Array.from(document.querySelectorAll('.notification-toast')).map(el => el.textContent || '');
    const clickRegion = (overlay, region = 'face') => {
      overlay?.querySelector(`[data-region="${region}"]`)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    };

    try {
      state.importedData = {
        ...state.importedData,
        genetics: { snps: [] },
        sunDefaults: { fitzpatrick: 'I', photosensitiveMeds: 'severe' },
      };

      await active.quickLogSunSession();
      const defaultOverlay = document.querySelector('.sun-start-modal')?.closest('.modal-overlay');
      outcomes.defaultStartDialogUsesGetActiveAndEmptyRegionFallbacks = defaultOverlay?.querySelector('#start-confirm')?.disabled === true
        && defaultOverlay?.querySelector('#sun-start-hint')?.textContent.includes('Tap any body region');
      defaultOverlay?.remove();

      state.importedData.sunDefaults = { fitzpatrick: 'III', photosensitiveMeds: 'none' };
      let preflightFetches = 0;
      active.configureSunActiveSession({
        getSunCoords: () => ({ lat: 50.08, lon: 14.43, source: 'profile' }),
        getCachedConditionsAtmosphere: () => ({ uvIndex: 3.2, source: 'conditions-now' }),
        fetchAtmosphere: async () => {
          preflightFetches += 1;
          return new Promise(() => {});
        },
      });
      await active.openStartSunSessionDialog();
      await waitFor(() => document.querySelector('#sun-start-uvi-banner')?.textContent?.includes('Current UVI 3.2 is ready'));
      const cachedOverlay = document.querySelector('.sun-start-modal')?.closest('.modal-overlay');
      outcomes.startDialogReusesConditionsNowUviAndSettlesOrdinaryUv = preflightFetches === 0
        && cachedOverlay?.querySelector('#sun-start-uvi-banner')?.textContent?.includes('Current UVI 3.2 is ready');
      cachedOverlay?.remove();

      state.importedData.sunDefaults = { fitzpatrick: 'I', photosensitiveMeds: 'severe' };
      active.configureSunActiveSession({
        getSunCoords: () => ({ lat: 50.08, lon: 14.43, source: 'profile' }),
        getCachedConditionsAtmosphere: () => null,
        fetchAtmosphere: async () => ({ uvIndex: 9.1, ozoneDU: 285, cloudCover: 15, source: 'manual' }),
      });
      await active.openStartSunSessionDialog();
      await waitFor(() => document.querySelector('#sun-start-uvi-banner')?.textContent?.includes('Very high UV'));
      const startOverlay = document.querySelector('.sun-start-modal')?.closest('.modal-overlay');
      const preflightText = startOverlay?.querySelector('#sun-start-uvi-banner')?.textContent || '';
      clickRegion(startOverlay);
      startOverlay?.querySelector('#start-confirm')?.click();
      await waitFor(() => !document.body.contains(startOverlay));
      outcomes.defaultStartSessionUsesPreflightAndStartFallbacks = preflightText.includes('Very high UV')
        && toasts().some(text => text.includes('high UV 9.1')
          && text.includes('sun-sensitivity precautions')
          && text.includes('use shade and sun protection'));
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      active.resetSunActiveSessionState();

      active.configureSunActiveSession({
        getCachedConditionsAtmosphere: () => null,
        fetchAtmosphere: async () => new Promise(() => {}),
        uviFetchTimeoutMs: 5,
      });
      await active.openStartSunSessionDialog();
      await waitFor(() => document.querySelector('#sun-start-uvi-banner')?.textContent?.includes('Live UVI unavailable'));
      const timeoutOverlay = document.querySelector('.sun-start-modal')?.closest('.modal-overlay');
      outcomes.startDialogSettlesWhenAtmosphereRequestHangs = timeoutOverlay?.querySelector('#sun-start-uvi-banner')?.textContent?.includes('Live UVI unavailable');
      timeoutOverlay?.remove();

      const stoppingSession = {
        id: 'default-stop-session',
        startedAt: Date.now() - 6 * 60000,
        endedAt: null,
        durationMin: 6,
        bodyExposure: { fraction: 0.08, regions: ['face'], glassBetween: true },
        eyeExposure: { mode: 'indirect', lensTint: 'clear' },
        atmosphere: { uvIndex: 1.4 },
        doses: {},
        safety: { medFraction: 0.12, fitzpatrick: 'III' },
      };
      active.configureSunActiveSession({
        getActiveSession: () => stoppingSession,
        getSessions: () => [stoppingSession],
        getSunCoords: () => ({ lat: 49.2, lon: 16.6, altitudeM: 540, source: 'profile' }),
      });
      await active.quickLogSunSession();
      outcomes.defaultStopPathUsesStopSaveHydrateAndRefreshFallbacks = stoppingSession.location?.source === 'profile'
        && stoppingSession.location?.altitudeM === 540
        && toasts().some(text => text.includes('UVB blocked by glass'));
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      active.resetSunActiveSessionState();

      let checkpointSaves = 0;
      const checkpointSession = {
        id: 'checkpoint-session',
        startedAt: Date.now() - 60_000,
        endedAt: null,
        bodyExposure: { fraction: 0.2, regions: ['face'] },
        eyeExposure: { mode: 'indoor', lensTint: 'clear' },
        location: { lat: 50, lon: 14, altitudeM: 250 },
      };
      active.configureSunActiveSession({
        saveImportedData: async () => { checkpointSaves += 1; },
        reconstructSpectrum: () => ({ wavelengths: [500], irradiance: [1] }),
        computeChannelDoses: () => ({ vitamin_d: 1 }),
        erythemalSED: () => 0.1,
        retinalUVdose: () => 0,
        solarZenithAngle: () => 30,
        interpolateAtmosphere: () => null,
        fractionOfMED: ({ sed }) => sed / 3,
      });
      active.setSunLiveState(checkpointSession.id, {
        ratePerMin: { vitamin_d: 1 }, sedPerMin: 0.1,
        committedDoses: {}, committedSED: 0, committedRetinalUV: 0,
        doseSegments: [], snapshotAt: Date.now() - 1000,
        fractionOfMEDFn: ({ sed }) => sed / 3,
        fitzpatrick: 'III', medScale: 1, psmTier: 'none', zenith: 30,
        atm: { uvIndex: 5, source: 'open_meteo', fetchedAt: Date.now() },
      });
      active.commitSunLiveSlice(checkpointSession);
      await waitFor(() => checkpointSaves > 0);
      const checkpointDose = checkpointSession.liveCheckpoint?.committedDoses?.vitamin_d || 0;
      active.resetSunActiveSessionState();
      const restoredDose = active.liveDosesFor(checkpointSession, checkpointSession.liveCheckpoint.snapshotAt);
      outcomes.liveCheckpointSurvivesRuntimeReset = checkpointDose > 0
        && restoredDose?.doses?.vitamin_d === checkpointDose
        && checkpointSession.liveCheckpoint?.doseSegments?.length === 1;
      active.resetSunActiveSessionState();

      const tickerSession = {
        id: 'ticker-session',
        startedAt: Date.now() - 45 * 60000,
        endedAt: null,
        paused: true,
        bodyExposure: { fraction: 0.22, regions: ['face', 'arms-front'], rotatedSides: true },
        eyeExposure: { mode: 'direct', lensTint: 'clear' },
        atmosphere: { uvIndex: 8.8 },
        safety: { fitzpatrick: 'II' },
      };
      state.currentView = 'light';
      active.configureSunActiveSession({
        getSessions: () => [tickerSession],
        getActiveSession: () => tickerSession,
        vitaminDIU: () => 1400,
        vitaminDIUPerSession: () => 1400,
        renderLightChannelsLive: () => {
          outcomes.liveChannelRefreshCalled = true;
        },
      });
      active.setSunLiveState(tickerSession.id, {
        committedDoses: { vitamin_d: 20, circadian: 15, nir_solar: 10 },
        committedSED: 4,
        committedRetinalUV: 35,
        fractionOfMEDFn: () => 1.1,
        fitzpatrick: 'II',
        medScale: 1,
        psmTier: 'none',
        atm: { uvIndex: 8.8, temperatureC: 34, source: 'manual' },
        pending: false,
      });
      localStorage.removeItem('gb_jargon_seen_med');
      const card = document.createElement('div');
      card.dataset.id = tickerSession.id;
      card.innerHTML = '<div class="sun-session-head"><span class="sun-session-duration">old</span></div><div class="sun-channel-chips"><span>old chips</span></div>';
      const elapsed = document.createElement('span');
      elapsed.dataset.liveElapsedFor = tickerSession.id;
      elapsed.textContent = 'old elapsed';
      document.body.append(card, elapsed);
      active.ensureActiveTicker();
      await waitFor(() => card.textContent.includes('burn dose') && card.textContent.includes('vitamin-D potential'));
      outcomes.liveTickerPatchesActiveCardsAndJargonAlerts = card.textContent.includes('~110% modeled burn dose')
        && card.textContent.includes('vitamin-D potential')
        && card.textContent.includes('take a break')
        && card.textContent.includes('eye UV')
        && elapsed.textContent !== 'old elapsed'
        && toasts().some(text => text.includes('MED ='));
      outcomes.liveChannelRefreshCalled = outcomes.liveChannelRefreshCalled === true;
    } finally {
      state.importedData = saved.importedData;
      state.currentView = saved.currentView;
      active.resetSunActiveSessionState();
      active.configureSunActiveSession({
        getSessions: () => [],
        getActiveSession: () => null,
        startSession: async () => null,
        stopSession: async () => null,
        hydrateSession: async () => null,
        getSunCoords: () => null,
        getCachedConditionsAtmosphere: () => null,
        uviFetchTimeoutMs: 5000,
        saveImportedData: async () => {},
        applyAtmOverrides: atm => atm,
        refreshSurfaces: () => {},
        normalizePSMTier: raw => raw || 'none',
        photosensitiveMedScale: () => 1,
        eyeModes: [],
        lensTints: [],
        postureOptions: [],
        surfaceOptions: [],
        fetchAtmosphere: async () => null,
        reconstructSpectrum: () => null,
        computeChannelDoses: () => ({}),
        erythemalSED: () => 0,
        fractionOfMED: () => 0,
        solarZenithAngle: () => 90,
        computeUVConfidence: () => 0.5,
        interpolateAtmosphere: () => null,
        vitaminDIU: (channelAu, _fitzpatrick = 'III', _uvi = null, rotatedSides = false) => channelAu * 60 * (rotatedSides ? 2 : 1),
        vitaminDIUPerSession: null,
        retinalUVdose: () => 0,
        skinTypeToFitzpatrick: skinType => (String(skinType || '').match(/^(I{1,3}|IV|VI?)\b/) || [])[1] || null,
        renderLightChannelsLive: () => {},
        renderLightTodayStrip: () => '',
      });
      document.querySelectorAll('.modal-overlay,.notification-container,.notification-toast,[data-id="ticker-session"],[data-live-elapsed-for="ticker-session"]').forEach(el => el.remove());
    }

    return outcomes;
  }, { activeUrl: moduleUrl('/js/sun-active-session.js') });

  expectAll(results);
});
