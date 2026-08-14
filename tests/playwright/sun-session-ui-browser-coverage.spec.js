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
    };
    const hydrateCalls = [];
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const math = {
      solarZenithAngle: () => 100,
      reconstructSpectrum: () => {
        throw new Error('nighttime spectrum should not be reconstructed');
      },
      vitaminDIU: () => 900,
      vitaminDIUPerSession: () => 20,
      pbmJoulesPerCm2: () => 8.4,
      circadianMelanopicLux: () => 5200,
      geneticVitaminDMultiplier: () => ({ mult: 1, contributors: [] }),
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
        safety: null,
        doses: null,
        calculationStatus: 'calculation-error',
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
      hydrateSession: async (id, coords) => {
        hydrateCalls.push([id, coords]);
        const session = sessions.find(item => item.id === id);
        if (session) session.calculationStatus = 'computed';
        return session || null;
      },
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
      renderSessionAIInline: () => '<span class="ai-inline-test">AI inline</span>',
      renderSessionAIDetail: () => '<section class="ai-detail-test">AI detail</section>',
      solarZenithAngle: (...args) => math.solarZenithAngle(...args),
      reconstructSpectrum: (...args) => math.reconstructSpectrum(...args),
      vitaminDIU: (...args) => math.vitaminDIU(...args),
      vitaminDIUPerSession: (...args) => math.vitaminDIUPerSession(...args),
      pbmJoulesPerCm2: (...args) => math.pbmJoulesPerCm2(...args),
      circadianMelanopicLux: (...args) => math.circadianMelanopicLux(...args),
      geneticVitaminDMultiplier: (...args) => math.geneticVitaminDMultiplier(...args),
    };

    try {
      state.importedData = { ...state.importedData, genetics: { snps: [] } };

      sunUI.configureSunSessionUI({ ...baseDeps, getSessions: () => [] });
      const emptyHost = document.createElement('div');
      emptyHost.innerHTML = sunUI.renderSessionsList();
      outcomes.emptyListShowsFirstSessionAction = emptyHost.textContent.includes('No sun sessions logged yet')
        && !!emptyHost.querySelector('[data-sun-session-action="quick-log-sun"]');

      sunUI.configureSunSessionUI(baseDeps);
      const sortedHost = document.createElement('div');
      sortedHost.innerHTML = sunUI.renderSessionsList();
      outcomes.sessionListSortsAndKeepsAIOutOfHistory = sortedHost.querySelector('.sun-session')?.dataset.id === 'paused-rotated'
        && sortedHost.querySelectorAll('.ai-inline-test').length === 0;

      const activeHost = document.createElement('div');
      activeHost.innerHTML = sunUI.renderSunSessionRow(sessions[0]);
      outcomes.pausedRotatedActiveRowShowsControlVariants = !!activeHost.querySelector('.sun-session-paused')
        && !!activeHost.querySelector('[data-sun-session-action="resume-session"]')
        && !!activeHost.querySelector('button[aria-label="Side change recorded"][disabled]')
        && !!activeHost.querySelector('[data-sun-session-action="forgot-stop"]')
        && activeHost.textContent.includes('over threshold')
        && !!activeHost.querySelector('.sun-eye-warn')
        && !!activeHost.querySelector('.sun-session-live-readouts .sun-session-vitd')
        && !activeHost.querySelector('.sun-session-head .sun-session-med')
        && !activeHost.querySelector('.sun-session-delete');
      outcomes.liveChannelOverflowExplainsAndExposesHiddenChannels = activeHost.querySelectorAll('button.sun-chip-extra').length === 1
        && activeHost.querySelector('.sun-chip-more')?.getAttribute('aria-expanded') === 'false'
        && activeHost.querySelector('.sun-chip-more-collapsed')?.textContent.includes('1 more channel')
        && activeHost.querySelector('.sun-chip-more-expanded')?.textContent.includes('Show fewer');

      const endedHost = document.createElement('div');
      endedHost.innerHTML = sunUI.renderSunSessionRow(sessions[1]);
      outcomes.endedRowWithoutDurationUsesCompactHistoryHierarchy = endedHost.textContent.includes('20 min')
        && endedHost.textContent.includes('Sunlight')
        && !!endedHost.querySelector('.light-session-complete')
        && !endedHost.textContent.includes('low modeled dose')
        && !endedHost.textContent.includes('Sunglasses')
        && !endedHost.querySelector('.sun-session-delete,.sun-channel-chips,.ai-inline-test');

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
      outcomes.edgeChipValuesKeepPhysicalUnitsWithoutTargetPercentages = edgeChipHost.textContent.includes('~900 IU')
        && edgeChipHost.textContent.includes('8.4 J/cm')
        && edgeChipHost.textContent.includes('~5.2k est. mel lx')
        && !edgeChipHost.querySelector('[data-channel="no_cv"] .sun-chip-value')
        && !edgeChipHost.textContent.includes('%')
        && pomcLowHost.textContent.includes('POMC')
        && !pomcLowHost.querySelector('[data-channel="pomc"] .sun-chip-value');
      outcomes.sessionChannelChipsOpenInformationalDetails = Array.from(edgeChipHost.querySelectorAll('.sun-chip')).every(chip =>
        chip instanceof HTMLButtonElement
        && chip.dataset.sunSessionAction === 'open-channel'
        && chip.dataset.sunSessionChannel === chip.dataset.channel
        && chip.getAttribute('aria-label')?.includes('Open channel details'));

      math.vitaminDIUPerSession = () => 1500;
      math.pbmJoulesPerCm2 = () => 12.4;
      math.circadianMelanopicLux = () => 12600;
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
        && emptyText.includes('Amber')
        && emptyDetail?.querySelectorAll('details.sun-detail-disclosure').length === 2;
      const retryCalculation = emptyDetail?.querySelector('[data-sun-session-action="retry-calculation"]');
      retryCalculation?.click();
      await delay(0);
      outcomes.failedCalculationOffersWorkingRetry = !!retryCalculation
        && emptyText.includes('No stale estimate is being shown')
        && hydrateCalls.some(([id, coords]) => id === 'ended-no-duration' && coords?.lat === 50.08);
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
      outcomes.legacyManualAtmosphereShowsSourceWithoutActiveOverride = manualText.includes('UVI')
        && !manualText.includes('UVI (manual)')
        && manualText.includes('Manual entry')
        && manualText.includes('sea level')
        && !manualText.includes('UV split');
      manualDetail?.remove();
    } finally {
      state.importedData = saved.importedData;
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
        solarZenithAngle: null,
        reconstructSpectrum: null,
        geneticVitaminDMultiplier: () => ({ mult: 1.0, contributors: [] }),
        vitaminDIU: null,
        vitaminDIUPerSession: null,
        pbmJoulesPerCm2: null,
        circadianMelanopicLux: null,
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
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
    };
    const sessions = [{
      id: 'editable-session',
      startedAt: Date.UTC(2026, 5, 7, 8, 0),
      endedAt: Date.UTC(2026, 5, 7, 8, 30),
      durationMin: 30,
      bodyExposure: { fraction: 0.05, regions: [] },
      eyeExposure: { mode: 'direct', lensTint: 'clear' },
    }, {
      id: 'previous-detailed-session',
      startedAt: Date.UTC(2026, 5, 7, 9, 0),
      endedAt: Date.UTC(2026, 5, 7, 9, 20),
      durationMin: 20,
      bodyExposure: { fraction: 0.18, regions: ['face', 'arms-front'] },
      eyeExposure: { mode: 'indirect', lensTint: 'amber' },
      posture: 'lying',
      surfaceAlbedo: 'snow',
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
      exposurePresets: [{ key: 'face_hands', label: 'Face + hands' }, { key: 'detailed', label: 'Detailed' }],
      eyeModes: [
        { key: 'direct', label: 'Eyes uncovered', pickerLabel: 'Eyes uncovered' },
        { key: 'indirect', label: 'Indirect light' },
      ],
      lensTints: [{ key: 'clear', label: 'Clear' }, { key: 'amber', label: 'Amber' }],
      postureOptions: [{ key: 'standing', label: 'Standing' }, { key: 'lying', label: 'Lying flat' }],
      surfaceOptions: [{ key: 'grass', label: 'Grass' }, { key: 'snow', label: 'Snow' }],
      channelDisplay: {},
      channelTier: () => 0,
      tierLabel: () => 'none',
      formatChannelUnit: () => '',
      tooShortForChannelVerdictMin: 2,
      navigate: route => calls.push(['navigate', route]),
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
      state.importedData = {
        ...state.importedData,
        sunDefaults: {},
      };
      let setupOpenCount = 0;
      configure({
        getSessions: () => [],
        openLightSetup: () => { setupOpenCount += 1; },
      });
      const blockedPastLog = sunUI.openDetailedSessionDialog();
      outcomes.unconfirmedFitzpatrickBlocksPastSunLog = blockedPastLog === false
        && setupOpenCount === 1
        && !document.querySelector('.sun-detailed-modal');
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());
      state.importedData.sunDefaults = { fitzpatrick: 'III', completedAt: Date.now() };

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
        && logged.bodyExposure?.preset === 'covered'
        && logged.bodyExposure?.fraction === 0
        && Array.isArray(logged.bodyExposure?.regions)
        && logged.bodyExposure.regions.length === 0
        && fallbackCalls.some(call => call[0] === 'hydrate' && call[1] === 'logged-fallback')
        && !fallbackCalls.some(call => call[0] === 'navigate');

      configure();
      state.currentView = 'light';
      sunUI.openDetailedSessionDialog();
      const defaultOverlay = document.querySelector('.sun-detailed-modal')?.closest('.modal-overlay');
      const defaultHint = defaultOverlay?.querySelector('#sun-silhouette-hint')?.textContent || '';
      const defaultBefore = calls.length;
      const defaultStart = defaultOverlay?.querySelector('#det-started-at');
      const defaultEnd = defaultOverlay?.querySelector('#det-ended-at');
      if (defaultStart && defaultEnd) {
        defaultStart.value = '2026-06-07T09:45';
        defaultEnd.value = '2026-06-07T10:05';
        defaultEnd.dispatchEvent(new Event('input', { bubbles: true }));
      }
      defaultOverlay?.querySelector('[data-region="legs-front"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      const expandedHint = defaultOverlay?.querySelector('#sun-silhouette-hint')?.textContent || '';
      const spfInput = defaultOverlay?.querySelector('#det-spf');
      const glassInput = defaultOverlay?.querySelector('#det-glass');
      const notesInput = defaultOverlay?.querySelector('#det-notes');
      if (spfInput) spfInput.value = '30';
      if (glassInput) glassInput.checked = true;
      if (notesInput) notesInput.value = 'Bright snow field';
      defaultOverlay?.querySelector('#det-save')?.click();
      await waitFor(() => calls.slice(defaultBefore).some(call => call[0] === 'hydrate' && call[1] === 'logged-fallback'));
      const defaultCalls = calls.slice(defaultBefore);
      const defaultLogged = defaultCalls.find(call => call[0] === 'log')?.[1];
      outcomes.lastSessionDefaultsDetailedPayloadAndLightNavigate = !!defaultOverlay
        && defaultOverlay.querySelector('#det-eye-mode')?.value === 'indirect'
        && defaultOverlay.querySelector('#det-lens-tint')?.value === 'amber'
        && defaultOverlay.querySelector('#det-posture')?.value === 'lying'
        && defaultOverlay.querySelector('#det-surface')?.value === 'snow'
        && defaultHint.includes('2 regions exposed')
        && expandedHint.includes('3 regions exposed')
        && defaultLogged?.bodyExposure?.preset === 'detailed'
        && defaultLogged.bodyExposure.fraction > 0.18
        && defaultLogged.bodyExposure.regions.includes('face')
        && defaultLogged.bodyExposure.regions.includes('arms-front')
        && defaultLogged.bodyExposure.regions.includes('legs-front')
        && defaultLogged.bodyExposure.sunscreenSPF === 30
        && defaultLogged.bodyExposure.glassBetween === true
        && defaultLogged.eyeExposure?.mode === 'indirect'
        && defaultLogged.eyeExposure?.lensTint === 'amber'
        && defaultLogged.eyeExposure?.durationSec === 20 * 60
        && defaultLogged.posture === 'lying'
        && defaultLogged.surfaceAlbedo === 'snow'
        && defaultLogged.notes === 'Bright snow field'
        && defaultLogged.location?.source === 'test'
        && defaultCalls.some(call => call[0] === 'hydrate' && call[1] === 'logged-fallback')
        && defaultCalls.some(call => call[0] === 'navigate' && call[1] === 'light');
      state.currentView = 'dashboard';

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
      state.importedData = saved.importedData;
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
        navigate: () => {},
      });
      document.querySelectorAll('.modal-overlay,.confirm-overlay,.notification-container,.notification-toast').forEach(el => el.remove());
    }

    return outcomes;
  }, { sunSessionUrl: moduleUrl('/js/sun-session-ui.js') });

  expectAll(results);
});

test('sun session UI covers default dependency callbacks', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ sunSessionUrl }) => {
    const [{ state }, sunUI] = await Promise.all([
      import('/js/state.js'),
      import(sunSessionUrl),
    ]);
    const outcomes = {};
    const saved = {
      currentView: state.currentView,
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
    };
    const windowKeys = [
      'navigate',
    ];
    const savedWindow = Object.fromEntries(windowKeys.map(key => [
      key,
      { had: Object.prototype.hasOwnProperty.call(window, key), value: window[key] },
    ]));
    const session = {
      id: 'default-deps-session',
      startedAt: Date.now() - 20 * 60000,
      endedAt: Date.now(),
      durationMin: 20,
      location: { lat: 50.08, lon: 14.43, source: 'test' },
      bodyExposure: { preset: 'face_hands', fraction: 0.05, regions: [], glassBetween: false },
      eyeExposure: { mode: 'direct', lensTint: 'clear' },
      atmosphere: { uvIndex: 4.2, source: 'manual' },
      safety: { medFraction: 0.25, fitzpatrick: 'III' },
      doses: { vitamin_d: 12, circadian: 6, nir_solar: 3 },
    };
    const waitFor = async predicate => {
      for (let i = 0; i < 30; i += 1) {
        if (predicate()) return true;
        await new Promise(resolve => setTimeout(resolve, 0));
      }
      return false;
    };
    const toasts = () => Array.from(document.querySelectorAll('.notification-toast')).map(el => el.textContent || '');

    try {
      state.currentView = 'dashboard';
      state.importedData = {
        ...state.importedData,
        sunDefaults: { ...(state.importedData?.sunDefaults || {}), fitzpatrick: 'III', completedAt: Date.now() },
      };
      window.navigate = route => {
        outcomes.unexpectedNavigate = route;
      };

      const emptyList = sunUI.renderSessionsList();
      outcomes.defaultEmptyListUsesGetSessions = emptyList.includes('No sun sessions logged yet');

      const activeHost = document.createElement('div');
      activeHost.innerHTML = sunUI.renderSunSessionRow({
        id: 'default-active',
        startedAt: Date.now() - 60000,
        endedAt: null,
        bodyExposure: { fraction: 0.05, regions: ['face'] },
        eyeExposure: { mode: 'unknown' },
        safety: { medFraction: 0.1, fitzpatrick: 'III' },
        doses: { vitamin_d: 4, pomc: 2 },
      });
      outcomes.defaultRowUsesSummaryElapsedAndChipHelpers = activeHost.textContent.includes('0:00')
        && activeHost.textContent.includes('Body unset')
        && activeHost.textContent.includes('Eyes unset')
        && activeHost.textContent.includes('vitamin d')
        && !!activeHost.querySelector('.sun-chip-tier-2');

      sunUI.configureSunSessionUI({
        getSessions: () => [session],
        solarZenithAngle: () => 48,
        geneticVitaminDMultiplier: () => ({ mult: 1, contributors: [] }),
      });
      sunUI.openSunSessionDetail(session.id);
      const detailOverlay = document.querySelector('.sun-detail-modal')?.closest('.modal-overlay');
      outcomes.defaultDetailUsesModalAndChannelDeps = !!detailOverlay
        && detailOverlay.textContent.includes('Sun session')
        && detailOverlay.textContent.includes('Sunlight');
      detailOverlay?.remove();

      sunUI.openDetailedSessionDialog();
      const defaultLogOverlay = document.querySelector('.sun-detailed-modal')?.closest('.modal-overlay');
      defaultLogOverlay?.querySelector('[data-region="face"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      defaultLogOverlay?.querySelector('#det-save')?.click();
      await waitFor(() => !document.body.contains(defaultLogOverlay));
      outcomes.defaultDetailedSaveUsesLogAndCoordsFallbacks = toasts().some(text => text.includes('Detailed session saved'));
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());

      sunUI.configureSunSessionUI({
        getSessions: () => [session],
        logCompletedSession: async () => 'default-hydrate-session',
      });
      sunUI.openDetailedSessionDialog();
      const defaultHydrateOverlay = document.querySelector('.sun-detailed-modal')?.closest('.modal-overlay');
      defaultHydrateOverlay?.querySelector('[data-region="face"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      defaultHydrateOverlay?.querySelector('#det-save')?.click();
      await waitFor(() => !document.body.contains(defaultHydrateOverlay));
      outcomes.defaultDetailedSaveUsesHydrateFallback = toasts().some(text => text.includes('Detailed session saved'));
      document.querySelectorAll('.notification-toast').forEach(el => el.remove());

      const deletePromise = sunUI.deleteSunSession(session.id);
      await waitFor(() => !!document.getElementById('confirm-ok'));
      document.getElementById('confirm-ok')?.click();
      await deletePromise;
      outcomes.defaultDeleteUsesDeleteAndRefreshFallbacks = !document.getElementById('confirm-dialog-overlay')?.classList.contains('show');

      const editPromise = sunUI.editSunSessionDuration(session.id);
      await waitFor(() => !!document.getElementById('prompt-dialog-input'));
      const input = document.getElementById('prompt-dialog-input');
      if (input) {
        input.value = '21';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      document.getElementById('prompt-ok')?.click();
      await editPromise;
      outcomes.defaultEditUsesUpdateFallback = toasts().some(text => text.includes('Session duration set to 21 min'))
        && !outcomes.unexpectedNavigate;
    } finally {
      state.currentView = saved.currentView;
      state.importedData = saved.importedData;
      for (const [key, info] of Object.entries(savedWindow)) {
        if (info.had) window[key] = info.value;
        else delete window[key];
      }
      document.querySelectorAll('.modal-overlay,.confirm-overlay,.notification-container,.notification-toast').forEach(el => el.remove());
    }

    return outcomes;
  }, { sunSessionUrl: moduleUrl('/js/sun-session-ui.js') });

  expectAll(results);
});
