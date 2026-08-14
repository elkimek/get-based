import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?lightSunCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

test('sun session UI covers list detail edit delete and past-session save paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ sunSessionUiUrl }) => {
    const [{ state }, sunUI] = await Promise.all([
      import('/js/state.js'),
      import(sunSessionUiUrl),
    ]);
    const outcomes = {};
    const originalView = state.currentView;
    let sessions = [
      {
        id: 'sun-ended',
        startedAt: Date.UTC(2026, 5, 7, 9, 0),
        endedAt: Date.UTC(2026, 5, 7, 9, 35),
        durationMin: 35,
        location: { lat: 50.08, lon: 14.43, altitudeM: 250, source: 'profile' },
        bodyExposure: {
          preset: 'detailed',
          fraction: 0.21,
          regions: ['face', 'arms-front', 'breast-chest'],
          sunscreenSPF: 15,
          glassBetween: true,
          rotatedSides: true,
        },
        eyeExposure: { mode: 'direct', lensTint: 'amber' },
        posture: 'lying',
        surfaceAlbedo: 'sand',
        atmosphere: {
          uvIndex: 7.2,
          ozoneDU: null,
          cloudCover: 12,
          source: 'open_meteo',
          airQuality: { pm25: 6, aod: 0.12 },
        },
        safety: { medFraction: 0.72, fitzpatrick: 'II' },
        doses: {
          vitamin_d: 320,
          circadian: 85,
          nir_solar: 110,
          no_cv: 30,
          pomc: 18,
          violet_eye: 12,
        },
        notes: 'Midday patio session',
      },
      {
        id: 'sun-active',
        startedAt: Date.now() - 13 * 3600 * 1000,
        endedAt: null,
        paused: false,
        bodyExposure: { fraction: 0.08, regions: ['face'], rotatedSides: false },
        eyeExposure: { mode: 'sunglasses', lensTint: 'clear' },
        doses: { circadian: 10 },
      },
    ];
    const calls = [];

    try {
      state.currentView = 'light';
      state.importedData = {
        ...state.importedData,
        sunDefaults: { ...(state.importedData?.sunDefaults || {}), fitzpatrick: 'II', completedAt: Date.now() },
      };
      const solarZenithAngle = () => 42.4;
      const reconstructSpectrum = () => ({
        wavelengths: [280, 300, 320, 340, 360, 380, 400, 420],
        irradiance: [0.2, 0.4, 1.2, 2.2, 2.1, 1.6, 0.8, 0.1],
      });
      const vitaminDIU = () => 1500;
      const vitaminDIUPerSession = () => 2400;
      const pbmJoulesPerCm2 = () => 8.6;
      const circadianMelanopicLux = () => 12500;
      const geneticVitaminDMultiplier = () => ({
        mult: 0.82,
        contributors: [{ gene: 'GC', genotype: 'TT', multiplier: 0.82 }],
      });
      sunUI.configureSunSessionUI({
        getSessions: () => sessions,
        deleteSession: async id => {
          calls.push(['delete', id]);
          sessions = sessions.filter(sess => sess.id !== id);
          return true;
        },
        updateSession: async (id, patch) => {
          calls.push(['update', id, patch]);
          const sess = sessions.find(item => item.id === id);
          if (sess) Object.assign(sess, patch);
          return sess;
        },
        logCompletedSession: async opts => {
          calls.push(['log-completed', opts]);
          sessions.push({ id: 'sun-logged', ...opts, doses: { vitamin_d: 1 } });
          return 'sun-logged';
        },
        hydrateSession: async id => calls.push(['hydrate', id]),
        getSunCoords: () => ({ lat: 50.08, lon: 14.43, source: 'test' }),
        refreshSurfaces: () => calls.push(['refresh']),
        wireBackdropClose: () => calls.push(['wire-backdrop']),
        trapModalFocus: () => calls.push(['trap-focus']),
        summarizeBodyExposure: sess => `${sess.bodyExposure?.regions?.length || 0} regions`,
        formatElapsed: () => '13:00:00',
        exposurePresets: [{ key: 'detailed', label: 'Detailed' }, { key: 'face_hands', label: 'Face + hands' }],
        eyeModes: [
          { key: 'direct', label: 'Eyes uncovered', pickerLabel: 'Eyes uncovered' },
          { key: 'sunglasses', label: 'Sunglasses' },
        ],
        lensTints: [{ key: 'clear', label: 'Clear' }, { key: 'amber', label: 'Amber' }],
        postureOptions: [{ key: 'standing', label: 'Standing' }, { key: 'lying', label: 'Lying flat' }],
        surfaceOptions: [{ key: 'grass', label: 'Grass' }, { key: 'sand', label: 'Sand' }],
        channelDisplay: {
          vitamin_d: { icon: 'D', label: 'Vitamin D', dailyTarget: 300, what: 'Vitamin D' },
          circadian: { icon: 'C', label: 'Circadian', dailyTarget: 100, what: 'Circadian' },
          nir_solar: { icon: 'N', label: 'NIR', dailyTarget: 100, what: 'NIR' },
          no_cv: { icon: 'NO', label: 'NO', dailyTarget: 100, what: 'NO' },
          pomc: { icon: 'P', label: 'POMC', dailyTarget: 100, what: 'POMC' },
          violet_eye: { icon: 'V', label: 'Violet', dailyTarget: 100, what: 'Violet' },
        },
        channelTier: value => value >= 100 ? 3 : value > 20 ? 2 : value > 0 ? 1 : 0,
        tierLabel: tier => ['none', 'low', 'moderate', 'high'][tier] || 'none',
        formatChannelUnit: (key, value) => `${Math.round(value)} ${key}`,
        tooShortForChannelVerdictMin: 2,
        renderSessionAIInline: () => '<span class="ai-inline-test">AI inline</span>',
        renderSessionAIDetail: () => '<section class="ai-detail-test">AI detail</section>',
        navigate: route => calls.push(['navigate', route]),
        solarZenithAngle,
        reconstructSpectrum,
        geneticVitaminDMultiplier,
        vitaminDIU,
        vitaminDIUPerSession,
        pbmJoulesPerCm2,
        circadianMelanopicLux,
      });

      const listHost = document.createElement('div');
      listHost.innerHTML = sunUI.renderSessionsList();
      const activeRow = listHost.querySelector('[data-id="sun-active"]');
      const completedRow = listHost.querySelector('[data-id="sun-ended"]');
      outcomes.sessionListIncludesActiveControls = !!activeRow?.querySelector('[data-sun-session-action="pause-session"]')
        && !!activeRow?.querySelector('[data-sun-session-action="forgot-stop"]')
        && !listHost.querySelector('.ai-inline-test')
        && completedRow?.classList.contains('light-session-complete')
        && !completedRow?.querySelector('.sun-channel-chips,.sun-session-delete');

      const chipsHost = document.createElement('div');
      chipsHost.innerHTML = sunUI.renderChannelChips(sessions[0].doses, sessions[0]);
      outcomes.channelChipsShowTopChannelsAndMore = !!chipsHost.querySelector('.sun-chip-more')
        && chipsHost.textContent.includes('Vitamin D');

      sunUI.openSunSessionDetail('sun-ended');
      const detailOverlay = document.querySelector('.sun-detail-modal')?.closest('.modal-overlay');
      const detailText = detailOverlay?.textContent || '';
      const detailHtml = detailOverlay?.innerHTML || '';
      outcomes.detailShowsAtmosphereGenesAndModifiers = !!detailOverlay
        && detailText.includes('UV split')
        && detailHtml.includes('GC TT')
        && detailText.includes('Behind glass')
        && detailOverlay.querySelectorAll('.sun-detail-channel-row').length >= 6
        && !!detailOverlay.querySelector('.ai-detail-test');
      detailOverlay?.remove();

      sunUI.openDetailedSessionDialog();
      const detailedOverlay = document.querySelector('.sun-detailed-modal')?.closest('.modal-overlay');
      if (detailedOverlay) {
        const pad = value => String(value).padStart(2, '0');
        const localDateTimeValue = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
        const endedAt = new Date(Date.now() - 10 * 60 * 1000);
        const startedAt = new Date(endedAt.getTime() - 20 * 60 * 1000);
        detailedOverlay.querySelector('#det-started-at').value = localDateTimeValue(startedAt);
        detailedOverlay.querySelector('#det-ended-at').value = localDateTimeValue(endedAt);
        detailedOverlay.querySelector('#det-spf').value = '8';
        detailedOverlay.querySelector('#det-glass').checked = true;
        detailedOverlay.querySelector('#det-notes').value = 'Backfilled session';
        detailedOverlay.querySelector('#det-save').click();
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      const loggedPastSession = calls.find(call => call[0] === 'log-completed')?.[1] || null;
      outcomes.pastSessionSaveLogsPayload = !!loggedPastSession;
      outcomes.pastSessionSaveTimes = Number.isFinite(loggedPastSession?.startedAt)
        && Number.isFinite(loggedPastSession?.endedAt)
        && loggedPastSession.startedAt < loggedPastSession.endedAt;
      outcomes.pastSessionSaveGlassAndSpf = loggedPastSession?.bodyExposure?.glassBetween === true
        && loggedPastSession?.bodyExposure?.sunscreenSPF === 8;
      outcomes.pastSessionSaveNotes = loggedPastSession?.notes === 'Backfilled session';
      outcomes.pastSessionSaveHydrates = calls.some(call => call[0] === 'hydrate' && call[1] === 'sun-logged');
      outcomes.pastSessionSaveNavigates = calls.some(call => call[0] === 'navigate' && call[1] === 'light');

      const editPromise = sunUI.editSunSessionDuration('sun-ended');
      await Promise.resolve();
      document.getElementById('prompt-dialog-input').value = '42';
      document.getElementById('prompt-ok').click();
      await editPromise;
      outcomes.editDurationUpdatesSession = sessions.find(sess => sess.id === 'sun-ended')?.durationMin === 42
        && calls.some(call => call[0] === 'update' && call[1] === 'sun-ended' && call[2].durationMin === 42);

      const missingEdit = sunUI.editSunSessionDuration('missing-session');
      await missingEdit;
      outcomes.missingEditShowsNoUpdate = !calls.some(call => call[0] === 'update' && call[1] === 'missing-session');

      const deletePromise = sunUI.deleteSunSession('sun-ended');
      await Promise.resolve();
      document.getElementById('confirm-ok').click();
      await deletePromise;
      outcomes.deleteConfirmsAndRefreshes = !sessions.some(sess => sess.id === 'sun-ended')
        && calls.some(call => call[0] === 'delete' && call[1] === 'sun-ended')
        && calls.some(call => call[0] === 'refresh');
    } finally {
      state.currentView = originalView;
      sunUI.configureSunSessionUI({
        getSessions: () => [],
        deleteSession: async () => false,
        updateSession: async () => null,
        logCompletedSession: async () => null,
        hydrateSession: async () => null,
        getSunCoords: () => null,
        refreshSurfaces: () => {},
        wireBackdropClose: () => {},
        trapModalFocus: () => {},
        summarizeBodyExposure: () => 'Body unset',
        formatElapsed: () => '0:00',
        exposurePresets: [],
        eyeModes: [],
        lensTints: [],
        postureOptions: [],
        surfaceOptions: [],
        channelDisplay: {},
        channelTier: () => 0,
        tierLabel: () => 'none',
        formatChannelUnit: () => '',
        tooShortForChannelVerdictMin: 2,
        renderSessionAIInline: () => '',
        renderSessionAIDetail: () => '',
        navigate: () => {},
        solarZenithAngle: null,
        reconstructSpectrum: null,
        geneticVitaminDMultiplier: () => ({ mult: 1.0, contributors: [] }),
        vitaminDIU: null,
        vitaminDIUPerSession: null,
        pbmJoulesPerCm2: null,
        circadianMelanopicLux: null,
      });
      document.querySelectorAll('.modal-overlay,.confirm-overlay,.notification-container').forEach(el => el.remove());
    }

    return outcomes;
  }, {
    sunSessionUiUrl: moduleUrl('/js/sun-session-ui.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('sun active session covers start dialog stop summary and live dose helpers', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ activeUrl, sessionUiUrl }) => {
    const [{ state }, active, sunUI] = await Promise.all([
      import('/js/state.js'),
      import(activeUrl),
      import(sessionUiUrl),
    ]);
    const outcomes = {};
    const originalImported = JSON.parse(JSON.stringify(state.importedData || {}));
    let sessions = [{
      id: 'last-ended',
      startedAt: Date.now() - 3600000,
      endedAt: Date.now() - 1800000,
      durationMin: 30,
      bodyExposure: { regions: ['face', 'arms-front'], fraction: 0.09 },
      eyeExposure: { mode: 'sunglasses', lensTint: 'clear' },
      posture: 'standing',
      surfaceAlbedo: 'grass',
    }];
    const calls = [];

    try {
      state.importedData = {
        ...state.importedData,
        sunDefaults: { fitzpatrick: 'II', photosensitiveMeds: 'moderate' },
        lightCircadian: { skinType: 'II - fair' },
        genetics: { rsTest: 'AA' },
      };
      sunUI.configureSunSessionUI({
        channelDisplay: {
          vitamin_d: { icon: 'D', label: 'Vitamin D', dailyTarget: 300, what: 'Vitamin D' },
          circadian: { icon: 'C', label: 'Circadian', dailyTarget: 100, what: 'Circadian' },
        },
        channelTier: value => value > 0 ? 2 : 0,
        tierLabel: tier => tier ? 'moderate' : 'none',
        formatChannelUnit: (key, value) => `${Math.round(value)} ${key}`,
        tooShortForChannelVerdictMin: 2,
      });
      active.configureSunActiveSession({
        getSessions: () => sessions,
        getActiveSession: () => sessions.find(sess => !sess.endedAt) || null,
        startSession: async opts => {
          calls.push(['start', opts]);
          sessions.push({
            id: 'active-sun',
            startedAt: Date.now() - 11 * 60 * 1000,
            endedAt: null,
            location: opts.location,
            bodyExposure: { fraction: 0.11, regions: opts.regions, glassBetween: opts.glassBetween, rotatedSides: opts.rotatedSides },
            eyeExposure: { mode: opts.eyeMode, lensTint: opts.lensTint },
            posture: opts.posture,
            surfaceAlbedo: opts.surfaceAlbedo,
          });
          return 'active-sun';
        },
        stopSession: async id => {
          calls.push(['stop', id]);
          const sess = sessions.find(item => item.id === id);
          Object.assign(sess, {
            endedAt: Date.now(),
            durationMin: 24,
            doses: { vitamin_d: 220 },
            safety: { medFraction: 0.83, fitzpatrick: 'II' },
            atmosphere: { uvIndex: 8.5 },
          });
          return sess;
        },
        hydrateSession: async id => calls.push(['hydrate', id]),
        getSunCoords: () => ({ lat: 50.08, lon: 14.43, altitudeM: 200 }),
        saveImportedData: async () => calls.push(['save']),
        applyAtmOverrides: atm => ({ ...atm, uvIndex: atm.uvIndex + 0.1 }),
        refreshSurfaces: () => calls.push(['refresh']),
        normalizePSMTier: raw => raw || 'none',
        photosensitiveMedScale: tier => tier === 'moderate' ? 0.65 : 1,
        eyeModes: [{ key: 'direct', label: 'Eyes uncovered' }, { key: 'sunglasses', label: 'Sunglasses' }],
        lensTints: [{ key: 'clear', label: 'Clear' }, { key: 'amber', label: 'Amber' }],
        postureOptions: [{ key: 'standing', label: 'Standing' }, { key: 'lying', label: 'Lying' }],
        surfaceOptions: [{ key: 'grass', label: 'Grass' }, { key: 'sand', label: 'Sand' }],
      });

      const fetchAtmosphere = async () => ({ uvIndex: 11.2, cloudCover: 10, ozoneDU: 290, source: 'open_meteo', confidence: 0.9, temperatureC: 34 });
      const reconstructSpectrum = () => ({ wavelengths: [300, 350, 400], irradiance: [1.2, 0.9, 0.4] });
      const computeChannelDoses = ({ durationMin }) => ({ vitamin_d: 3 * durationMin, circadian: 2 * durationMin });
      const erythemalSED = ({ durationMin }) => 0.4 * durationMin;
      const fractionOfMED = ({ sed, medScale }) => sed / (10 * medScale);
      const solarZenithAngle = () => 35;
      const interpolateAtmosphere = atm => ({ ...atm, uvIndex: atm.uvIndex + 0.2 });
      const vitaminDIU = () => 1300;
      const vitaminDIUPerSession = () => 2600;
      const renderLightChannelsLive = () => calls.push(['render-live']);
      const renderLightTodayStrip = () => '<div id="today-light-strip-test">today</div>';
      active.configureSunActiveSession({
        fetchAtmosphere,
        reconstructSpectrum,
        computeChannelDoses,
        erythemalSED,
        ocularActinicUVdose: () => 0.04,
        fractionOfMED,
        solarZenithAngle,
        interpolateAtmosphere,
        vitaminDIU,
        vitaminDIUPerSession,
        renderLightChannelsLive,
        renderLightTodayStrip,
      });

      await active.openStartSunSessionDialog();
      await new Promise(resolve => setTimeout(resolve, 0));
      const overlay = document.querySelector('.sun-start-modal')?.closest('.modal-overlay');
      outcomes.startDialogShowsUvPreflight = !!overlay
        && overlay.querySelector('#sun-start-uvi-banner')?.hidden === false
        && overlay.textContent.includes('Extreme UV');
      outcomes.startDialogPassesSelectedDefaults = false;
      if (overlay) {
        overlay.querySelector('#start-eye-mode').value = 'direct';
        overlay.querySelector('#start-lens-tint').value = 'amber';
        overlay.querySelector('#start-posture').value = 'lying';
        overlay.querySelector('#start-surface').value = 'sand';
        overlay.querySelector('#start-glass').checked = true;
        overlay.querySelector('#start-confirm').click();
        await Promise.resolve();
        outcomes.startDialogPassesSelectedDefaults = calls.some(call => call[0] === 'start'
          && call[1].regions.includes('face')
          && call[1].lensTint === 'amber'
          && call[1].glassBetween === true
          && call[1].posture === 'lying'
          && call[1].surfaceAlbedo === 'sand'
          && call[1].eyeMode === 'glass-window'
          && call[1].rotatedSides === false
          && !overlay.querySelector('#start-rotated'));
      }

      active.setSunLiveState('active-sun', {
        ratePerMin: { vitamin_d: 2, circadian: 1 },
        sedPerMin: 0.5,
        fitzpatrick: 'II',
        medScale: 0.65,
        psmTier: 'moderate',
        atm: { uvIndex: 8.4, cloudCover: 20, temperatureC: 35, source: 'open_meteo', confidence: 0.9 },
        zenith: 35,
        snapshotAt: Date.now() - 90 * 1000,
        committedDoses: { pomc: 4 },
        committedSED: 0.5,
        committedRetinalUV: 2,
        fractionOfMEDFn: fractionOfMED,
        pending: false,
      });
      const live = active.liveDosesFor(sessions.find(sess => sess.id === 'active-sun'));
      outcomes.liveDosesIntegrateCurrentSlice = live.doses.vitamin_d > 0
        && live.doses.pomc === 4
        && live.medFraction > 0
        && live.retinalUV > 2;

      sessions.find(sess => sess.id === 'active-sun').paused = true;
      const paused = active.liveDosesFor(sessions.find(sess => sess.id === 'active-sun'));
      outcomes.pausedLiveDosesUseCommittedValues = paused.paused === true
        && paused.doses.pomc === 4
        && paused.retinalUV === 2;
      sessions.find(sess => sess.id === 'active-sun').paused = false;

      const activeSession = sessions.find(sess => sess.id === 'active-sun');
      const committedSegment = active.commitSunLiveSlice(activeSession);
      const afterCommit = active.liveDosesFor(activeSession);
      outcomes.commitSliceAccumulatesDoses = committedSegment?.durationMin > 0
        && activeSession.exposureSegments?.length === 1
        && afterCommit.doses.vitamin_d >= live.doses.vitamin_d;

      await active.quickLogSunSession();
      outcomes.quickLogStopsActiveSession = calls.some(call => call[0] === 'stop' && call[1] === 'active-sun')
        && calls.some(call => call[0] === 'hydrate' && call[1] === 'active-sun')
        && calls.some(call => call[0] === 'refresh');

      outcomes.elapsedFormattingCoversHourAndMinute = active._formatElapsed(3723000) === '1:02:03'
        && active._formatElapsed(65000) === '1:05';
    } finally {
      state.importedData = originalImported;
      active.resetSunActiveSessionState();
      active.configureSunActiveSession({
        getSessions: () => [],
        getActiveSession: () => null,
        startSession: async () => null,
        stopSession: async () => null,
        hydrateSession: async () => null,
        getSunCoords: () => null,
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
        interpolateAtmosphere: () => null,
        vitaminDIU: (channelAu, _fitzpatrick = 'III', _uvi = null, rotatedSides = false) => channelAu * 60 * (rotatedSides ? 2 : 1),
        vitaminDIUPerSession: null,
        renderLightChannelsLive: () => {},
        renderLightTodayStrip: () => '',
      });
      document.querySelectorAll('.modal-overlay,.notification-container').forEach(el => el.remove());
    }

    return outcomes;
  }, {
    activeUrl: moduleUrl('/js/sun-active-session.js'),
    sessionUiUrl: moduleUrl('/js/sun-session-ui.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('light camera tool modals cover denied and manual fallback contracts', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ modalsUrl }) => {
    const modals = await import(modalsUrl);
    const outcomes = {};
    const savedMediaDevices = navigator.mediaDevices;
    const hadALS = Object.prototype.hasOwnProperty.call(window, 'AmbientLightSensor');
    const originalALS = window.AmbientLightSensor;
    const saved = [];

    try {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => { throw new DOMException('denied', 'NotAllowedError'); } },
      });
      window.AmbientLightSensor = undefined;
      const deps = {
        saveMeasurement: async (kind, value, meta) => {
          saved.push({ kind, value, meta });
        },
      };

      await modals.openLuxMeter({ roomId: 'bedroom' }, deps);
      const luxInput = document.getElementById('lux-manual-input');
      outcomes.luxDeniedShowsManualInput = !!luxInput
        && document.getElementById('lux-source-line')?.textContent.includes('Camera unavailable');
      outcomes.luxManualSavePersistsReading = false;
      if (luxInput) {
        luxInput.value = '420';
        luxInput.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('lux-save')?.click();
        await Promise.resolve();
        outcomes.luxManualSavePersistsReading = saved.some(item => item.kind === 'lux'
          && item.value === 420
          && item.meta.roomId === 'bedroom'
          && item.meta.extra.source === 'manual-entry');
      }

      await modals.openSpectrumClassifier({ roomId: 'desk' }, deps);
      outcomes.spectrumDeniedShowsManualChoices = !!document.querySelector('[data-spec-manual="Warm LED (2700-3000K)"],[data-spec-manual="Warm LED (2700–3000K)"]')
        && document.getElementById('spec-result')?.textContent.includes('Camera access denied');
      document.querySelector('[data-spec-manual]')?.click();
      document.getElementById('spec-save').click();
      await Promise.resolve();
      outcomes.spectrumManualSavePersistsSelection = saved.some(item => item.kind === 'spectrum'
        && item.meta.roomId === 'desk'
        && item.meta.extra.reason.includes('manual selection'));

      await modals.openFlickerDetector({ roomId: 'office' }, deps);
      outcomes.flickerDeniedExplainsCameraRequirement = document.getElementById('flicker-result')?.textContent.includes('Camera access denied');
      document.getElementById('flicker-save').click();
      await Promise.resolve();
      modals.closeFlickerDetector();

      await modals.openCCTMeter({ roomId: 'office' }, deps);
      outcomes.cctDeniedSetsCameraDeniedValue = document.getElementById('cct-value')?.textContent === 'Camera denied';
      document.getElementById('cct-save').click();
      await Promise.resolve();
      modals.closeCCTMeter();

      await modals.openDarknessMeter({ roomId: 'bedroom' }, deps);
      document.getElementById('dark-start').click();
      await Promise.resolve();
      outcomes.darknessDeniedShowsUnavailableMessage = document.getElementById('dark-status')?.textContent.includes('Camera access denied');
      modals.closeDarknessMeter();

      outcomes.deniedToolsDoNotSaveWithoutResult = saved.filter(item => item.kind !== 'lux' && item.kind !== 'spectrum').length === 0;
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: savedMediaDevices,
      });
      if (hadALS) window.AmbientLightSensor = originalALS;
      else delete window.AmbientLightSensor;
      [
        modals.closeLuxMeter,
        modals.closeSpectrumClassifier,
        modals.closeFlickerDetector,
        modals.closeCCTMeter,
        modals.closeDarknessMeter,
        modals.closeGlassTransmission,
      ].forEach(close => {
        try { close(); } catch (_) {}
      });
      document.querySelectorAll('.modal-overlay,.notification-container').forEach(el => el.remove());
    }

    return outcomes;
  }, {
    modalsUrl: moduleUrl('/js/light-tool-camera-modals.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('light camera tool modals cover mocked camera readings and save paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ modalsUrl }) => {
    const modals = await import(modalsUrl);
    const outcomes = {};
    const savedReadings = [];
    const savedMediaDevices = navigator.mediaDevices;
    const savedPlay = HTMLMediaElement.prototype.play;
    const savedGetContext = HTMLCanvasElement.prototype.getContext;
    const savedRaf = window.requestAnimationFrame;
    const savedCancelRaf = window.cancelAnimationFrame;
    const savedSetTimeout = window.setTimeout;
    const hadALS = Object.prototype.hasOwnProperty.call(window, 'AmbientLightSensor');
    const originalALS = window.AmbientLightSensor;
    const streamStops = [];
    let cameraPattern = 'lux';
    let rafId = 0;
    const rafTimers = new Map();
    const delay = ms => new Promise(resolve => savedSetTimeout(resolve, ms));
    const waitFor = async (predicate, attempts = 400) => {
      for (let i = 0; i < attempts; i++) {
        if (predicate()) return true;
        await delay(5);
      }
      return false;
    };
    const makeFrame = (width, height) => {
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          let r = 80;
          let g = 80;
          let b = 80;
          if (cameraPattern === 'flicker') {
            const v = y % 4 < 2 ? 240 : 24;
            r = v; g = v; b = v;
          } else if (cameraPattern === 'cct') {
            const bright = y % 4 < 2;
            r = bright ? 20 : 6;
            g = bright ? 80 : 24;
            b = bright ? 230 : 90;
          } else if (cameraPattern === 'glass-inside') {
            r = 40; g = 40; b = 40;
          } else if (cameraPattern === 'glass-outside') {
            r = 100; g = 100; b = 100;
          }
          data[i] = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = 255;
        }
      }
      return data;
    };
    const makeTrack = label => ({
      stop: () => streamStops.push(label),
      getSettings: () => ({
        frameRate: 120,
        exposureMode: 'manual',
        whiteBalanceMode: 'manual',
        focusMode: 'manual',
      }),
      getCapabilities: () => ({
        exposureMode: ['manual'],
        whiteBalanceMode: ['manual'],
        focusMode: ['manual'],
        exposureTime: { min: 1, max: 500 },
        iso: { min: 50, max: 800 },
        colorTemperature: { min: 2000, max: 8000 },
      }),
      applyConstraints: async constraints => {
        outcomes.cameraLockRequestsAdvancedConstraints = Array.isArray(constraints?.advanced)
          && constraints.advanced.length > 0;
      },
    });
    const makeStream = label => {
      const track = makeTrack(label);
      const stream = new MediaStream();
      Object.defineProperty(stream, 'getTracks', { configurable: true, value: () => [track] });
      Object.defineProperty(stream, 'getVideoTracks', { configurable: true, value: () => [track] });
      return stream;
    };
    const deps = {
      saveMeasurement: async (kind, value, meta) => {
        await delay(0);
        savedReadings.push({ kind, value, meta });
      },
    };

    try {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => makeStream(cameraPattern) },
      });
      delete window.AmbientLightSensor;
      HTMLMediaElement.prototype.play = async function play() {
        return undefined;
      };
      HTMLCanvasElement.prototype.getContext = function getContext(type, options) {
        if (type !== '2d') return savedGetContext.call(this, type, options);
        const canvas = this;
        return {
          drawImage: () => {},
          getImageData: () => ({ data: makeFrame(canvas.width, canvas.height) }),
        };
      };
      window.requestAnimationFrame = callback => {
        const id = ++rafId;
        const timer = savedSetTimeout(() => {
          rafTimers.delete(id);
          callback(performance.now());
        }, 1);
        rafTimers.set(id, timer);
        return id;
      };
      window.cancelAnimationFrame = id => {
        const timer = rafTimers.get(id);
        if (timer) clearTimeout(timer);
        rafTimers.delete(id);
      };

      cameraPattern = 'lux';
      localStorage.removeItem('labcharts-lux-calibration');
      await modals.openLuxMeter({ roomId: 'workbench' }, deps);
      const luxReady = await waitFor(() => document.getElementById('lux-value')?.textContent !== '—');
      const calInput = document.getElementById('lux-cal-reference');
      if (calInput) calInput.value = '6400';
      document.getElementById('lux-cal-apply')?.click();
      await delay(5);
      document.getElementById('lux-save')?.click();
      await waitFor(() => savedReadings.some(item => item.kind === 'lux'));
      const luxSaved = savedReadings.find(item => item.kind === 'lux');
      outcomes.luxCameraPathCalibratesAndSaves = luxReady
        && !!luxSaved
        && luxSaved.meta.roomId === 'workbench'
        && luxSaved.meta.extra.source === 'camera-estimate'
        && luxSaved.meta.extra.calibrationFactor >= 1.9
        && !document.querySelector('[aria-label="Lux meter"]');

      cameraPattern = 'flicker';
      await modals.openFlickerDetector({ roomId: 'bench' }, deps);
      const flickerReady = await waitFor(() => document.getElementById('flicker-result')?.textContent.includes('banding'));
      document.getElementById('flicker-save')?.click();
      await waitFor(() => savedReadings.some(item => item.kind === 'flicker'));
      const flickerSaved = savedReadings.find(item => item.kind === 'flicker');
      outcomes.flickerCameraPathScoresAndSaves = flickerReady
        && !!flickerSaved
        && flickerSaved.value >= 2
        && flickerSaved.meta.extra.bandingRatio > 0.1
        && flickerSaved.meta.roomId === 'bench';

      cameraPattern = 'cct';
      await modals.openCCTMeter({ roomId: 'bench' }, deps);
      const cctReady = await waitFor(() => /^~\d+ K$/.test(document.getElementById('cct-value')?.textContent || ''));
      document.getElementById('cct-save')?.click();
      await waitFor(() => savedReadings.some(item => item.kind === 'cct'));
      const cctSaved = savedReadings.find(item => item.kind === 'cct');
      outcomes.cctCameraPathComputesMelanopicPwmAndSaves = cctReady
        && !!cctSaved
        && cctSaved.value >= 5000
        && cctSaved.meta.extra.melanopic > 0.5
        && cctSaved.meta.extra.pwmActive === true;

      await modals.openGlassTransmission({ roomId: 'window' }, deps);
      cameraPattern = 'glass-inside';
      document.getElementById('glass-measure-inside')?.click();
      const insideReady = await waitFor(() => document.getElementById('glass-reading-inside')?.textContent.includes('camera level'));
      cameraPattern = 'glass-outside';
      document.getElementById('glass-measure-outside')?.click();
      const outsideReady = await waitFor(() => document.getElementById('glass-save')?.disabled === false);
      document.getElementById('glass-save')?.click();
      await waitFor(() => savedReadings.some(item => item.kind === 'glass-transmission'));
      const glassSaved = savedReadings.find(item => item.kind === 'glass-transmission');
      outcomes.glassCameraPathComputesRatioAndSaves = insideReady
        && outsideReady
        && !!glassSaved
        && glassSaved.value > 0.35
        && glassSaved.value < 0.45
        && glassSaved.meta.extra.lockMode === 'manual'
        && glassSaved.meta.roomId === 'window';
      const stopCounts = streamStops.reduce((acc, label) => {
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      }, {});
      outcomes.cameraStreamsAreStoppedOnClose = streamStops.length === 5
        && stopCounts.lux === 1
        && stopCounts.flicker === 1
        && stopCounts.cct === 1
        && stopCounts['glass-inside'] === 1
        && stopCounts['glass-outside'] === 1;
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: savedMediaDevices,
      });
      HTMLMediaElement.prototype.play = savedPlay;
      HTMLCanvasElement.prototype.getContext = savedGetContext;
      window.requestAnimationFrame = savedRaf;
      window.cancelAnimationFrame = savedCancelRaf;
      if (hadALS) window.AmbientLightSensor = originalALS;
      else delete window.AmbientLightSensor;
      [
        modals.closeLuxMeter,
        modals.closeFlickerDetector,
        modals.closeCCTMeter,
        modals.closeGlassTransmission,
      ].forEach(close => {
        try { close(); } catch (_) {}
      });
      document.querySelectorAll('.modal-overlay,.notification-container').forEach(el => el.remove());
    }

    return outcomes;
  }, {
    modalsUrl: moduleUrl('/js/light-tool-camera-modals.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});

test('light devices cover session detail edit log active card and rendered list paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ devicesUrl }) => {
    const [
      { state },
      lightDevices,
      lightDevicesRuntime,
      recommendationRuntime,
      { profileStorageKey },
      blobStorage,
    ] = await Promise.all([
      import('/js/state.js'),
      import(devicesUrl),
      import('/js/light-devices-runtime.js'),
      import('/js/recommendations-runtime.js'),
      import('/js/profile.js'),
      import('/js/blob-storage.js'),
    ]);
    const outcomes = {};
    const originalImported = JSON.parse(JSON.stringify(state.importedData || {}));
    const importedStorageKey = profileStorageKey(state.currentProfile || 'default', 'imported');
    const originalImportedLocalValue = localStorage.getItem(importedStorageKey);
    const originalImportedBlobValue = await blobStorage.getBlob(importedStorageKey);
    const calls = [];
    const previousLightDevicesRuntimeDeps = lightDevicesRuntime.configureLightDevicesRuntimeDeps({
      showPromptDialog: async () => '17',
      channelTier: value => value > 30 ? 3 : value > 10 ? 2 : value > 0 ? 1 : 0,
      tierLabel: tier => ['none', 'low', 'moderate', 'high'][tier] || 'none',
      formatChannelUnit: (key, value) => `${Math.round(value)} ${key}`,
      channelDisplay: {
        vitamin_d: { icon: 'D', label: 'Vitamin D', what: 'Vitamin D' },
        circadian: { icon: 'C', label: 'Circadian', what: 'Circadian' },
        pbm_red: { icon: 'R', label: 'Red', what: 'Red light' },
        pbm_nir: { icon: 'N', label: 'NIR', what: 'NIR' },
      },
      navigate: route => calls.push(['navigate', route]),
      openChannelOnLightPage: channel => calls.push(['open-channel', channel]),
    });
    const previousRecommendationBridge = recommendationRuntime.configureRecommendationModuleBridge({
      loadCatalog: async () => ({ items: [] }),
      renderLightDeviceAffiliateRow: (_catalog, slug) => `<a class="affiliate-test">${slug}</a>`,
    });

    try {
      state.currentView = 'light';
      state.unitSystem = 'metric';
      const device = {
        id: 'dev-panel',
        brand: 'TestLight',
        model: 'Panel 900',
        type: 'combined',
        peakWavelengths: [630, 660, 810, 850],
        mwPerCm2At15cm: 55,
        recommendedDistanceCm: 20,
        channels: ['vitamin_d', 'circadian', 'pbm_red', 'pbm_nir'],
        modes: [
          { id: 'combo', label: 'Combo', groups: ['red', 'nir'], default: true },
          { id: 'red', label: 'Red only', groups: ['red'] },
          { id: 'blocked', label: 'Blocked', groups: ['blocked'] },
        ],
        coupling: [{ if: 'blocked', requires: ['missing'], reason: 'blocked test mode' }],
        catalogSlug: 'testlight-panel-900',
        addedAt: Date.now() - 9 * 86400000,
        lastSession: {
          durationMin: 12,
          distanceCm: 25,
          bodyAreas: ['breast-chest', 'arms-front'],
          eyesProtected: true,
          mode: 'combo',
        },
      };
      const session = {
        id: 'devsess-one',
        deviceId: 'dev-panel',
        startedAt: Date.now() - 3 * 86400000,
        endedAt: Date.now() - 3 * 86400000 + 12 * 60000,
        durationMin: 12,
        distanceCm: 25,
        bodyArea: 'torso',
        bodyAreas: ['breast-chest', 'arms-front'],
        eyesProtected: false,
        mode: 'combo',
        doses: { vitamin_d: 22, circadian: 35, pbm_red: 12 },
        notes: 'Desk panel test',
      };
      state.importedData = {
        ...state.importedData,
        sunDefaults: { ...(state.importedData?.sunDefaults || {}), fitzpatrick: 'III', completedAt: Date.now() },
        lightDevices: [device],
        deviceSessions: [session],
      };
      lightDevices.configureLightDevices({
        renderDeviceSessionAIDetail: () => '<section class="device-ai-detail-test">Device AI</section>',
      });

      const devicesHtml = await lightDevices.renderDevicesSection();
      const devicesHost = document.createElement('div');
      devicesHost.innerHTML = devicesHtml;
      lightDevices.installLightDevicesActionDelegates(devicesHost);
      outcomes.renderDevicesSectionShowsStatsAndAffiliate = devicesHost.textContent.includes('TestLight Panel 900')
        && devicesHost.textContent.includes('1 session')
        && !!devicesHost.querySelector('.affiliate-test')
        && devicesHost.textContent.includes('630')
        && devicesHost.textContent.includes('850')
        && !!devicesHost.querySelector('.light-device-feed-chip');
      outcomes.renderDevicesSectionUsesDelegatedActions = !!devicesHost.querySelector('[data-light-devices-action="add-device"]')
        && !!devicesHost.querySelector('[data-light-devices-action="delete-device"][data-light-device-id="dev-panel"]')
        && !!devicesHost.querySelector('[data-light-devices-action="log-device-session"][data-light-device-id="dev-panel"]')
        && !devicesHost.innerHTML.includes('onclick=');

      lightDevices.openDeviceSessionDetail('devsess-one');
      let detailOverlay = document.querySelector('[data-session-kind="device"]')?.closest('.modal-overlay');
      outcomes.deviceDetailShowsModeBodyChannelsAndAI = !!detailOverlay
        && detailOverlay.textContent.includes('Combo')
        && detailOverlay.textContent.includes('Upper chest')
        && detailOverlay.textContent.includes('Device AI')
        && detailOverlay.querySelectorAll('.sun-detail-channel-row').length >= 3;
      outcomes.deviceDetailChannelRowsOpenLightPage = false;
      if (detailOverlay) {
        detailOverlay.querySelector('.sun-detail-channel-row')?.click();
        outcomes.deviceDetailChannelRowsOpenLightPage = calls.some(call => call[0] === 'open-channel' && call[1] === 'vitamin_d');
      }

      await lightDevices.editDeviceSessionDuration('devsess-one');
      outcomes.editDurationUsesPromptAndRecomputes = state.importedData.deviceSessions[0].durationMin === 17
        && calls.some(call => call[0] === 'navigate' && call[1] === 'light');

      await lightDevices.editDeviceSessionMode('devsess-one');
      const modeOverlay = document.querySelector('[aria-label="Edit session mode"]')?.closest('.modal-overlay');
      if (modeOverlay) {
        modeOverlay.querySelector('#dev-edit-mode').value = 'red';
        modeOverlay.querySelector('#dev-edit-mode-save').click();
        await Promise.resolve();
      }
      outcomes.editModeFiltersAndSavesMode = state.importedData.deviceSessions[0].mode === 'red'
        && !modeOverlay?.textContent.includes('Blocked');

      await lightDevices.openDeviceSessionDialog('dev-panel');
      const logOverlay = document.querySelector('[aria-label="Log device session"]')?.closest('.modal-overlay');
      const logDurationInput = logOverlay?.querySelector('#dev-session-duration');
      const logModeInput = logOverlay?.querySelector('#dev-session-mode');
      const logAreaHint = logOverlay?.querySelector('#dev-session-area-hint');
      const logSaveButton = logOverlay?.querySelector('#dev-session-save');
      outcomes.logDialogUsesLastSessionDefaults = !!logOverlay
        && logDurationInput?.value === '12'
        && logModeInput?.value === 'combo'
        && logAreaHint?.textContent.includes('region');
      outcomes.logDialogSavesNewSession = false;
      if (logDurationInput && logSaveButton) {
        logDurationInput.value = '9';
        logSaveButton.click();
        await Promise.resolve();
        outcomes.logDialogSavesNewSession = state.importedData.deviceSessions.length === 2
          && state.importedData.deviceSessions[1].durationMin === 9
          && state.importedData.deviceSessions[1].bodyAreas.includes('breast-chest');
      }

      state.importedData.deviceSessions.push({
        id: 'devsess-active',
        deviceId: 'dev-panel',
        startedAt: Date.now() - 65000,
        endedAt: null,
        distanceCm: 20,
        bodyAreas: ['face', 'arms-front', 'legs-front', 'legs-back'],
        eyesProtected: true,
        doses: {},
      });
      const activeHtml = lightDevices.renderActiveDeviceSessionCard();
      outcomes.activeDeviceCardShowsElapsedAndStop = activeHtml.includes('data-live-elapsed-for="devsess-active"')
        && activeHtml.includes('Stop &amp; save')
        && activeHtml.includes('+1 more');
    } finally {
      state.importedData = originalImported;
      if (originalImportedBlobValue == null) await blobStorage.deleteBlob(importedStorageKey);
      else await blobStorage.setBlob(importedStorageKey, originalImportedBlobValue);
      if (originalImportedLocalValue == null) localStorage.removeItem(importedStorageKey);
      else localStorage.setItem(importedStorageKey, originalImportedLocalValue);
      lightDevices.configureLightDevices({ renderDeviceSessionAIDetail: () => '' });
      lightDevicesRuntime.configureLightDevicesRuntimeDeps(previousLightDevicesRuntimeDeps);
      recommendationRuntime.configureRecommendationModuleBridge(previousRecommendationBridge);
      document.querySelectorAll('.modal-overlay,.notification-container').forEach(el => el.remove());
    }

    return outcomes;
  }, {
    devicesUrl: moduleUrl('/js/light-devices.js'),
  });

  for (const [name, passed] of Object.entries(results)) {
    expect(passed, name).toBe(true);
  }
});
