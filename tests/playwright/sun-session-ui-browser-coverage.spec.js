import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?sunSessionUiCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function expectAll(outcomes) {
  for (const [name, passed] of Object.entries(outcomes)) {
    expect(passed, name).toBe(true);
  }
}

test('sun session UI covers alternate list detail and chip rendering paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ sunSessionUrl }) => {
    const [{ state }, sunUI] = await Promise.all([
      import('/js/state.js'),
      import(sunSessionUrl),
    ]);
    const outcomes = {};
    const saved = {
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      solarZenithAngle: window.solarZenithAngle,
      reconstructSpectrum: window.reconstructSpectrum,
      vitaminDIU: window.vitaminDIU,
      vitaminDIUPerSession: window.vitaminDIUPerSession,
      pbmJoulesPerCm2: window.pbmJoulesPerCm2,
      circadianMelanopicLux: window.circadianMelanopicLux,
      geneticVitaminDMultiplier: window.geneticVitaminDMultiplier,
      renderSessionAIInline: window.renderSessionAIInline,
      renderSessionAIDetail: window.renderSessionAIDetail,
    };
    const now = Date.now();
    const sessions = [
      {
        id: 'paused-rotated',
        startedAt: now - 13 * 3600 * 1000,
        endedAt: null,
        paused: true,
        bodyExposure: {
          preset: 'detailed',
          fraction: 0.18,
          regions: ['face', 'arms-front'],
          rotatedSides: true,
          glassBetween: true,
          sunscreenSPF: 20,
        },
        eyeExposure: { mode: 'direct', lensTint: 'clear' },
        safety: { medFraction: 1.12, fitzpatrick: 'I' },
        doses: { vitamin_d: 80, pomc: 50, no_cv: 25, violet_eye: 8 },
      },
      {
        id: 'ended-no-duration',
        startedAt: Date.UTC(2026, 5, 7, 8, 0),
        endedAt: Date.UTC(2026, 5, 7, 8, 20),
        bodyExposure: { preset: 'face_hands', fraction: 0.05, regions: [] },
        eyeExposure: { mode: 'sunglasses', lensTint: 'amber' },
        safety: { medFraction: 0.12, fitzpatrick: 'III' },
        doses: null,
      },
      {
        id: 'manual-atm',
        startedAt: Date.UTC(2026, 5, 7, 10, 0),
        endedAt: Date.UTC(2026, 5, 7, 10, 45),
        durationMin: 45,
        location: { lat: 50.08, lon: 14.43, altitudeM: 0, source: 'gps' },
        bodyExposure: { preset: 'face_hands', fraction: 0.05, regions: [] },
        eyeExposure: { mode: 'indirect', lensTint: 'clear' },
        safety: { medFraction: 0.42, fitzpatrick: 'III' },
        atmosphere: {
          uvIndex: 3.4,
          ozoneDU: null,
          cloudCover: null,
          source: 'manual',
          _uvOverridden: true,
          airQuality: {},
        },
        doses: { circadian: 20 },
      },
    ];

    const baseDeps = {
      getSessions: () => sessions,
      deleteSession: async () => true,
      updateSession: async () => null,
      logCompletedSession: async () => null,
      hydrateSession: async () => null,
      getSunCoords: () => ({ lat: 50.08, lon: 14.43, source: 'test' }),
      refreshSurfaces: () => {},
      wireBackdropClose: () => {},
      trapModalFocus: () => {},
      summarizeBodyExposure: sess => `${sess.bodyExposure?.regions?.length || 0} regions`,
      formatElapsed: () => '13:00:00',
      exposurePresets: [{ key: 'face_hands', label: 'Face + hands' }, { key: 'detailed', label: 'Detailed' }],
      eyeModes: [
        { key: 'direct', label: 'Eyes uncovered', pickerLabel: 'Eyes uncovered' },
        { key: 'indirect', label: 'Indirect light' },
        { key: 'sunglasses', label: 'Sunglasses' },
      ],
      lensTints: [{ key: 'clear', label: 'Clear' }, { key: 'amber', label: 'Amber' }],
      postureOptions: [{ key: 'standing', label: 'Standing' }, { key: 'lying', label: 'Lying flat' }],
      surfaceOptions: [{ key: 'grass', label: 'Grass' }, { key: 'snow', label: 'Snow' }],
      channelDisplay: {
        vitamin_d: { icon: 'D', label: 'Vitamin D', dailyTarget: 300, what: 'Vitamin D' },
        pomc: { icon: 'P', label: 'POMC', dailyTarget: 100, what: 'POMC' },
        no_cv: { icon: 'NO', label: 'NO', dailyTarget: 100, what: 'NO' },
        violet_eye: { icon: 'V', label: 'Violet', dailyTarget: 100, what: 'Violet' },
        circadian: { icon: 'C', label: 'Circadian', dailyTarget: 100, what: 'Circadian' },
        nir_solar: { icon: 'N', label: 'NIR', dailyTarget: 100, what: 'NIR' },
      },
      channelTier: value => value >= 100 ? 3 : value > 0 ? 2 : 0,
      tierLabel: tier => ['none', 'low', 'moderate', 'high'][tier] || 'none',
      formatChannelUnit: (key, value) => `${Math.round(value)} ${key}`,
      tooShortForChannelVerdictMin: 2,
    };

    try {
      state.importedData = { ...state.importedData, genetics: { snps: [] } };
      window.solarZenithAngle = () => 100;
      window.reconstructSpectrum = () => {
        throw new Error('nighttime spectrum should not be reconstructed');
      };
      window.vitaminDIU = () => 900;
      window.vitaminDIUPerSession = () => 20;
      window.pbmJoulesPerCm2 = () => 8.4;
      window.circadianMelanopicLux = () => 5200;
      window.geneticVitaminDMultiplier = () => ({ mult: 1, contributors: [] });
      window.renderSessionAIInline = () => '<span class="ai-inline-test">AI inline</span>';
      window.renderSessionAIDetail = () => '<section class="ai-detail-test">AI detail</section>';

      sunUI.configureSunSessionUI({ ...baseDeps, getSessions: () => [] });
      const emptyHost = document.createElement('div');
      emptyHost.innerHTML = sunUI.renderSessionsList();
      outcomes.emptyListShowsFirstSessionAction = emptyHost.textContent.includes('No sun sessions logged yet')
        && !!emptyHost.querySelector('[data-sun-session-action="quick-log-sun"]');

      sunUI.configureSunSessionUI(baseDeps);
      const sortedHost = document.createElement('div');
      sortedHost.innerHTML = sunUI.renderSessionsList();
      outcomes.sessionListSortsAndIncludesInlineAI = sortedHost.querySelector('.sun-session')?.dataset.id === 'paused-rotated'
        && sortedHost.querySelectorAll('.ai-inline-test').length === sessions.length;

      const activeHost = document.createElement('div');
      activeHost.innerHTML = sunUI.renderSunSessionRow(sessions[0]);
      outcomes.pausedRotatedActiveRowShowsControlVariants = !!activeHost.querySelector('.sun-session-paused')
        && !!activeHost.querySelector('[data-sun-session-action="resume-session"]')
        && !!activeHost.querySelector('button[aria-label="Rotated"][disabled]')
        && !!activeHost.querySelector('[data-sun-session-action="forgot-stop"]')
        && activeHost.textContent.includes('over threshold')
        && !!activeHost.querySelector('.sun-eye-warn');

      const endedHost = document.createElement('div');
      endedHost.innerHTML = sunUI.renderSunSessionRow(sessions[1]);
      outcomes.endedRowWithoutDurationFallsBackToInProgress = endedHost.textContent.includes('in progress')
        && endedHost.textContent.includes('safe')
        && endedHost.textContent.includes('Sunglasses');

      outcomes.noDosesRenderNoChips = sunUI.renderChannelChips(null) === '';

      const edgeChipHost = document.createElement('div');
      edgeChipHost.innerHTML = [
        sunUI.renderChannelChips({ vitamin_d: 80 }, { durationMin: 15, safety: { fitzpatrick: 'III' }, atmosphere: { uvIndex: 5 }, bodyExposure: {} }),
        sunUI.renderChannelChips({ nir_solar: 40 }, { durationMin: 15 }),
        sunUI.renderChannelChips({ circadian: 40 }, { durationMin: 15 }),
        sunUI.renderChannelChips({ no_cv: 120 }, { durationMin: 15 }),
      ].join('');
      const pomcLowHost = document.createElement('div');
      pomcLowHost.innerHTML = sunUI.renderChannelChips({ pomc: 4 }, { durationMin: 15 });
      outcomes.edgeChipValuesUseExpectedUnitsAndThresholds = edgeChipHost.textContent.includes('~900 IU')
        && edgeChipHost.textContent.includes('8.4 J/cm')
        && edgeChipHost.textContent.includes('~5.2k lux')
        && edgeChipHost.textContent.includes('\u2713 120%')
        && pomcLowHost.textContent.includes('POMC')
        && !pomcLowHost.querySelector('[data-channel="pomc"] .sun-chip-value');

      window.vitaminDIUPerSession = () => 1500;
      window.pbmJoulesPerCm2 = () => 12.4;
      window.circadianMelanopicLux = () => 12600;
      const shortChipHost = document.createElement('div');
      shortChipHost.innerHTML = sunUI.renderChannelChips({ vitamin_d: 80, circadian: 70, nir_solar: 60 }, { durationMin: 1 });
      outcomes.shortSessionsSuppressInlineChipValues = shortChipHost.querySelectorAll('.sun-chip-value').length === 0
        && !shortChipHost.querySelector('.sun-chip-more');

      sunUI.openSunSessionDetail('missing-session');
      outcomes.missingDetailDoesNothing = !document.querySelector('.sun-detail-modal');

      sunUI.openSunSessionDetail('ended-no-duration');
      const emptyDetail = document.querySelector('.sun-detail-modal')?.closest('.modal-overlay');
      const emptyText = emptyDetail?.textContent || '';
      outcomes.detailHandlesNoDosesLocationAndDefaultBody = emptyText.includes('No channel doses computed')
        && emptyText.includes('Location not recorded')
        && emptyText.includes('Face + hands')
        && emptyText.includes('Amber');
      emptyDetail?.remove();

      sunUI.openSunSessionDetail('paused-rotated');
      const activeDetail = document.querySelector('.sun-detail-modal')?.closest('.modal-overlay');
      outcomes.activeDetailOmitsEditDuration = !!activeDetail
        && !activeDetail.textContent.includes('Edit duration')
        && activeDetail.textContent.includes('AI detail');
      activeDetail?.remove();

      sunUI.openSunSessionDetail('manual-atm');
      const manualDetail = document.querySelector('.sun-detail-modal')?.closest('.modal-overlay');
      const manualText = manualDetail?.textContent || '';
      outcomes.manualAtmosphereShowsOverrideWithoutUvSplit = manualText.includes('UVI (manual)')
        && manualText.includes('Manual entry')
        && manualText.includes('sea level')
        && !manualText.includes('UV split');
      manualDetail?.remove();
    } finally {
      state.importedData = saved.importedData;
      window.solarZenithAngle = saved.solarZenithAngle;
      window.reconstructSpectrum = saved.reconstructSpectrum;
      window.vitaminDIU = saved.vitaminDIU;
      window.vitaminDIUPerSession = saved.vitaminDIUPerSession;
      window.pbmJoulesPerCm2 = saved.pbmJoulesPerCm2;
      window.circadianMelanopicLux = saved.circadianMelanopicLux;
      window.geneticVitaminDMultiplier = saved.geneticVitaminDMultiplier;
      window.renderSessionAIInline = saved.renderSessionAIInline;
      window.renderSessionAIDetail = saved.renderSessionAIDetail;
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
      });
      document.querySelectorAll('.modal-overlay,.notification-container,.notification-toast').forEach(el => el.remove());
    }

    return outcomes;
  }, { sunSessionUrl: moduleUrl('/js/sun-session-ui.js') });

  expectAll(results);
});

test('sun session UI covers detailed dialog and edit delete guard rails', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ sunSessionUrl }) => {
    const [{ state }, sunUI] = await Promise.all([
      import('/js/state.js'),
      import(sunSessionUrl),
    ]);
    const outcomes = {};
    const calls = [];
    const saved = {
      currentView: state.currentView,
      navigate: window.navigate,
    };
    const sessions = [{
      id: 'editable-session',
      startedAt: Date.UTC(2026, 5, 7, 8, 0),
      endedAt: Date.UTC(2026, 5, 7, 8, 30),
      durationMin: 30,
      bodyExposure: { fraction: 0.05, regions: [] },
      eyeExposure: { mode: 'direct', lensTint: 'clear' },
    }];

    const configure = (overrides = {}) => sunUI.configureSunSessionUI({
      getSessions: () => sessions,
      deleteSession: async id => {
        calls.push(['delete', id]);
        return true;
      },
      updateSession: async (id, patch) => {
        calls.push(['update', id, patch]);
        const sess = sessions.find(item => item.id === id);
        if (sess) Object.assign(sess, patch);
        return sess;
      },
      logCompletedSession: async opts => {
        calls.push(['log', opts]);
        return 'logged-fallback';
      },
      hydrateSession: async id => calls.push(['hydrate', id]),
      getSunCoords: () => ({ lat: 50.08, lon: 14.43, source: 'test' }),
      refreshSurfaces: () => calls.push(['refresh']),
      wireBackdropClose: () => calls.push(['wire']),
      trapModalFocus: () => calls.push(['trap']),
      summarizeBodyExposure: sess => `${sess.bodyExposure?.regions?.length || 0} regions`,
      formatElapsed: () => '0:30',
      exposurePresets: [{ key: 'face_hands', label: 'Face + hands' }],
      eyeModes: [{ key: 'direct', label: 'Eyes uncovered', pickerLabel: 'Eyes uncovered' }],
      lensTints: [{ key: 'clear', label: 'Clear' }],
      postureOptions: [{ key: 'standing', label: 'Standing' }],
      surfaceOptions: [{ key: 'grass', label: 'Grass' }],
      channelDisplay: {},
      channelTier: () => 0,
      tierLabel: () => 'none',
      formatChannelUnit: () => '',
      tooShortForChannelVerdictMin: 2,
      ...overrides,
    });

    const getToasts = () => Array.from(document.querySelectorAll('.notification-toast')).map(el => el.textContent || '');
    const waitFor = async predicate => {
      for (let i = 0; i < 20; i += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      return false;
    };
    const waitForDialog = async selector => {
      for (let i = 0; i < 10; i += 1) {
        const el = document.querySelector(selector);
        if (el) return el;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      return null;
    };

    try {
      state.currentView = 'dashboard';
      window.navigate = route => calls.push(['navigate', route]);
      configure({ getSessions: () => [] });

      sunUI.openDetailedSessionDialog();
      const firstOverlay = document.querySelector('.sun-detailed-modal')?.closest('.modal-overlay');
      const firstHint = firstOverlay?.querySelector('.modal-body-hint')?.textContent || '';
      firstOverlay?.querySelector('[data-region="face"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const regionHint = firstOverlay?.querySelector('#sun-silhouette-hint')?.textContent || '';
      const start = firstOverlay?.querySelector('#det-started-at');
      const end = firstOverlay?.querySelector('#det-ended-at');
      if (start && end) {
        start.value = '2026-06-07T06:00';
        end.value = '2026-06-07T11:15';
        end.dispatchEvent(new Event('input', { bubbles: true }));
      }
      outcomes.detailedDialogNoHistoryAndRegionHintBranches = firstOverlay
        && !firstHint.includes('default to your last session')
        && regionHint.includes('1 region exposed')
        && firstOverlay.querySelector('#det-duration-hint')?.textContent.includes('over 4 hours');
      firstOverlay?.remove();

      sunUI.openDetailedSessionDialog();
      const invalidOverlay = document.querySelector('.sun-detailed-modal')?.closest('.modal-overlay');
      const invalidStart = invalidOverlay?.querySelector('#det-started-at');
      const invalidEnd = invalidOverlay?.querySelector('#det-ended-at');
      if (invalidStart && invalidEnd) {
        Object.defineProperty(invalidStart, 'value', { configurable: true, get: () => 'not-a-date' });
        Object.defineProperty(invalidEnd, 'value', { configurable: true, get: () => 'also-not-a-date' });
      }
      invalidOverlay?.querySelector('#det-save')?.click();
      await new Promise(resolve => setTimeout(resolve, 0));
      outcomes.invalidDateDetailedDialogShowsError = getToasts().some(text => text.includes('Invalid Started at / Ended at'))
        && !calls.some(call => call[0] === 'log');
      invalidOverlay?.remove();
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());

      sunUI.openDetailedSessionDialog();
      const fallbackOverlay = document.querySelector('.sun-detailed-modal')?.closest('.modal-overlay');
      const fallbackStart = fallbackOverlay?.querySelector('#det-started-at');
      const fallbackEnd = fallbackOverlay?.querySelector('#det-ended-at');
      const fallbackBefore = calls.length;
      if (fallbackStart && fallbackEnd) {
        fallbackStart.value = '';
        fallbackEnd.value = '';
      }
      fallbackOverlay?.querySelector('#det-save')?.click();
      await waitFor(() => calls.slice(fallbackBefore).some(call => call[0] === 'hydrate' && call[1] === 'logged-fallback'));
      const fallbackCalls = calls.slice(fallbackBefore);
      const logged = fallbackCalls.find(call => call[0] === 'log')?.[1];
      outcomes.emptyTimestampFallbackSavesDefaultExposureWithoutNavigate = !!logged
        && logged.bodyExposure?.preset === 'face_hands'
        && logged.bodyExposure?.fraction === 0.05
        && Array.isArray(logged.bodyExposure?.regions)
        && logged.bodyExposure.regions.length === 0
        && fallbackCalls.some(call => call[0] === 'hydrate' && call[1] === 'logged-fallback')
        && !fallbackCalls.some(call => call[0] === 'navigate');

      configure();
      const deleteBefore = calls.length;
      const deletePromise = sunUI.deleteSunSession('editable-session');
      await waitForDialog('#confirm-cancel');
      document.getElementById('confirm-cancel')?.click();
      await deletePromise;
      outcomes.deleteCancelSkipsMutation = calls.length === deleteBefore;

      const editCancelBefore = calls.length;
      const cancelEdit = sunUI.editSunSessionDuration('editable-session');
      await waitForDialog('#prompt-cancel');
      document.getElementById('prompt-cancel')?.click();
      await cancelEdit;
      outcomes.editCancelSkipsMutation = calls.length === editCancelBefore;

      const invalidEditBefore = calls.length;
      const invalidEdit = sunUI.editSunSessionDuration('editable-session');
      await waitForDialog('#prompt-dialog-input');
      document.getElementById('prompt-dialog-input').value = '601';
      document.getElementById('prompt-ok')?.click();
      await invalidEdit;
      outcomes.invalidEditShowsError = calls.length === invalidEditBefore
        && getToasts().some(text => text.includes('between 0 and 600 minutes'));
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());

      const sameEditBefore = calls.length;
      const sameEdit = sunUI.editSunSessionDuration('editable-session');
      await waitForDialog('#prompt-dialog-input');
      document.getElementById('prompt-dialog-input').value = '30';
      document.getElementById('prompt-ok')?.click();
      await sameEdit;
      outcomes.sameDurationEditSkipsMutation = calls.length === sameEditBefore;

      const successEditBefore = calls.length;
      const successEdit = sunUI.editSunSessionDuration('editable-session');
      await waitForDialog('#prompt-dialog-input');
      document.getElementById('prompt-dialog-input').value = '31';
      document.getElementById('prompt-ok')?.click();
      await successEdit;
      const successCalls = calls.slice(successEditBefore);
      outcomes.successEditUpdatesWithoutDashboardNavigate = sessions[0].durationMin === 31
        && successCalls.some(call => call[0] === 'update' && call[1] === 'editable-session' && call[2].durationMin === 31)
        && !successCalls.some(call => call[0] === 'navigate');
    } finally {
      state.currentView = saved.currentView;
      if (saved.navigate) window.navigate = saved.navigate;
      else delete window.navigate;
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
      });
      document.querySelectorAll('.modal-overlay,.confirm-overlay,.notification-container,.notification-toast').forEach(el => el.remove());
    }

    return outcomes;
  }, { sunSessionUrl: moduleUrl('/js/sun-session-ui.js') });

  expectAll(results);
});
