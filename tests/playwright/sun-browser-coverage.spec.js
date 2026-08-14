import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?sunBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const FORMER_SUN_GLOBALS = [
  'SUN_ENGINE_VERSION', '_refreshSunSurfaces', 'quickLogSunSession', 'startSession', 'stopSession',
  'pauseSession', 'resumeSession', 'pauseSunSession', 'resumeSunSession', 'applySunscreenMidSession',
  'changeCoverageMidSession', 'flipSidesMidSession', 'setOzoneOverrideMidSession', '_forgotStopPrompt',
  'logCompletedSession', 'updateSession', 'editSunSessionDuration', 'deleteSunSession', 'hydrateSession',
  'rehydrateStaleSessions', 'getSessions', 'getActiveSession', 'rollingChannelTotals', 'dailyChannelBreakdown',
  'dailyVitaminDIUBreakdown', 'rollingVitaminDIU', 'cumulativeMEDToday', 'cumulativeMEDYesterday',
  'cumulativeVitaminDIUToday', 'vitaminDBudgetStatus', '_applyAtmOverrides', 'renderSessionsList',
  'renderSunSessionRow', 'getSunCoords', 'requestPreciseLocation', 'openDetailedSessionDialog',
  'openStartSunSessionDialog', 'openSunSessionDetail', 'renderBodySilhouette', 'bindBodySilhouette',
  '_testLoadRegionMap', '_testRegionAtSource', '_testRegionColorRGB', '_testStockImg',
  '_testRegionBandLandmarks', 'trapModalFocus', '_wireBackdropClose', '_resumeActiveTickerIfNeeded',
  '_ensureActiveTicker', 'BODY_REGIONS', 'EXPOSURE_PRESETS', 'EYE_MODES', 'LENS_TINTS',
  'CHANNEL_DISPLAY', 'channelTier', 'weeklyChannelTier', 'tierLabel', 'formatChannelUnit', 'tierDots',
];

function expectAll(outcomes) {
  const failed = Object.entries(outcomes)
    .filter(([, value]) => value !== true)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  expect(failed).toEqual([]);
}

test('sun session model browser coverage exercises safety defaults and caveats', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async ({ caveatsUrl, modelUrl }) => {
    const [caveats, model] = await Promise.all([
      import(caveatsUrl),
      import(modelUrl),
    ]);
    const outcomes = {};

    outcomes.photosensitiveTiersNormalizeLegacyAndUnknownInputs =
      model.PHOTOSENSITIVE_MED_TIERS.map(tier => tier.key).join(',') === 'unknown,none,mild,moderate,severe'
      && model.photosensitiveMedScale('moderate') === null
      && model.photosensitiveMedScale('severe') === null
      && model.photosensitiveMedScale('unknown-tier') === null
      && model._normalizePSMTier(true) === 'moderate'
      && model._normalizePSMTier(false) === 'none'
      && model._normalizePSMTier(null) === 'unknown'
      && model._normalizePSMTier(undefined) === 'unknown'
      && model._normalizePSMTier('mild') === 'mild'
      && model._normalizePSMTier('bad') === 'unknown';

    outcomes.exposurePostureAndSurfaceOptionsExposeExpectedDefaults =
      model.EXPOSURE_PRESETS.some(preset => preset.key === 'face_hands' && preset.fraction === 0.05)
      && model.EXPOSURE_PRESETS.some(preset => preset.key === 'sunbathing' && preset.fraction === 0.5)
      && model.EXPOSURE_PRESETS.every(preset => preset.fraction > 0 && preset.fraction <= 0.5)
      && model.POSTURE_OPTIONS.some(option => option.key === 'lying-supine')
      && model.POSTURE_MULTIPLIERS.standing === 1
      && model.POSTURE_MULTIPLIERS['lying-supine'] === 1.4
      && model.POSTURE_MULTIPLIERS['lying-prone'] === 1.4
      && model.SURFACE_OPTIONS.some(option => option.key === 'snow')
      && model.SURFACE_ALBEDO.grass === 0.03
      && model.SURFACE_ALBEDO.snow === 0.8;

    outcomes.lightingHardwareCaveatsLoadAsPromptBlock =
      Array.isArray(caveats.LIGHTING_HARDWARE_CAVEATS)
      && caveats.LIGHTING_HARDWARE_CAVEATS.length >= 5
      && caveats.LIGHTING_HARDWARE_CAVEATS.every(entry => typeof entry === 'string' && entry.length > 0)
      && caveats.LIGHTING_HARDWARE_CAVEATS_TEXT === caveats.LIGHTING_HARDWARE_CAVEATS.join('\n')
      && /temporal light modulation/i.test(caveats.LIGHTING_HARDWARE_CAVEATS_TEXT)
      && /TRIAC/i.test(caveats.LIGHTING_HARDWARE_CAVEATS_TEXT)
      && /dimmable LED/i.test(caveats.LIGHTING_HARDWARE_CAVEATS_TEXT)
      && /reducing light leakage/i.test(caveats.LIGHTING_HARDWARE_CAVEATS_TEXT);

    return outcomes;
  }, {
    caveatsUrl: moduleUrl('/js/lighting-hardware-caveats.js'),
    modelUrl: moduleUrl('/js/sun-session-model.js'),
  });

  expectAll(outcomes);
});

test('sun browser coverage exercises facade totals prompts and location paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async ({ sunUrl, utilsUrl, formerSunGlobals }) => {
    const [{ state }, sun, utils, sunRuntime] = await Promise.all([
      import('/js/state.js'),
      import(sunUrl),
      import(utilsUrl),
      import('/js/sun-runtime.js'),
    ]);
    const outcomes = {};
    const profileId = `sun-browser-${Date.now()}`;
    const activeId = 'sun-active-coverage';
    const now = Date.now();
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;
    const saved = {
      importedData: JSON.parse(JSON.stringify(state.importedData || {})),
      profilesState: state.profiles ? JSON.parse(JSON.stringify(state.profiles)) : state.profiles,
      currentProfile: state.currentProfile,
      profiles: localStorage.getItem('labcharts-profiles'),
      geolocation: Object.getOwnPropertyDescriptor(navigator, 'geolocation'),
    };
    const previousSunRuntimeDeps = sunRuntime.configureSunRuntimeDeps({
      buildSidebar: () => {},
      navigate: () => {},
    });
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitFor = async (predicate, attempts = 100) => {
      for (let i = 0; i < attempts; i += 1) {
        try {
          if (await predicate()) return true;
        } catch {}
        await delay(10);
      }
      return false;
    };
    const toasts = () => Array.from(document.querySelectorAll('.notification-toast')).map(el => el.textContent || '');
    const clearToasts = () => document.querySelectorAll('.notification-toast').forEach(el => el.remove());
    const setPromptValue = async value => {
      await waitFor(() => document.getElementById('prompt-dialog-input'));
      const input = document.getElementById('prompt-dialog-input');
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('prompt-ok')?.click();
    };
    const confirmDialog = async () => {
      await waitFor(() => document.getElementById('confirm-dialog-overlay')?.classList.contains('show'));
      document.getElementById('confirm-ok')?.click();
    };
    const todaySession = {
      id: 'sun-ended-today',
      startedAt: todayStart + 10 * 3600000,
      endedAt: todayStart + 10.5 * 3600000,
      durationMin: 30,
      location: { lat: 50.08, lon: 14.43, altitudeM: 230, source: 'gps' },
      bodyExposure: { preset: 'detailed', fraction: 0.24, regions: ['face', 'arms-front'], sunscreenSPF: null, glassBetween: false, rotatedSides: true },
      eyeExposure: { mode: 'direct', lensTint: 'clear', durationSec: 1800 },
      atmosphere: { uvIndex: 6.8, ozoneDU: 310 },
      doses: { vitamin_d: 3200, no_cv: 6000, circadian: 50000, nir_solar: 42000 },
      safety: { medFraction: 0.42, fitzpatrick: 'II' },
    };
    const yesterdaySession = {
      id: 'sun-ended-yesterday',
      startedAt: yesterdayStart + 12 * 3600000,
      endedAt: yesterdayStart + 12.4 * 3600000,
      durationMin: 24,
      bodyExposure: { preset: 'face_hands', fraction: 0.05, regions: [], sunscreenSPF: null, glassBetween: false, rotatedSides: false },
      eyeExposure: { mode: 'sunglasses', lensTint: 'amber', durationSec: 1440 },
      atmosphere: { uvIndex: 3.2 },
      doses: { vitamin_d: 900, no_cv: 1500, circadian: 14000 },
      safety: { medFraction: 0.31, fitzpatrick: 'III' },
    };
    const oldSession = {
      id: 'sun-old-ended',
      startedAt: now - 12 * 86400000,
      endedAt: now - 12 * 86400000 + 1800000,
      durationMin: 30,
      bodyExposure: { preset: 'face_hands', fraction: 0.05, regions: [] },
      eyeExposure: { mode: 'direct', lensTint: 'clear' },
      doses: { vitamin_d: 9999, no_cv: 9999 },
      safety: { medFraction: 0.99, fitzpatrick: 'III' },
    };
    const activeSession = {
      id: activeId,
      startedAt: now - 13 * 3600000,
      endedAt: null,
      bodyExposure: { preset: 'detailed', fraction: 0.12, regions: [], sunscreenSPF: null, glassBetween: false, rotatedSides: false },
      eyeExposure: { mode: 'direct', lensTint: 'clear' },
      atmosphere: { uvIndex: 5.4 },
      doses: null,
      safety: { medFraction: 0.1, fitzpatrick: 'III' },
    };

    try {
      state.currentProfile = profileId;
      state.profiles = [{
        id: profileId,
        name: 'Sun Browser',
        location: { country: 'Japan', zip: '' },
      }];
      localStorage.setItem('labcharts-profiles', JSON.stringify([{
        id: profileId,
        name: 'Sun Browser',
        location: { country: 'Japan', zip: '' },
      }]));
      state.importedData = {
        ...state.importedData,
        genetics: { snps: [] },
        sunDefaults: { fitzpatrick: 'II', overrides: {} },
        sunSessions: [todaySession, yesterdaySession, oldSession, activeSession],
        deviceSessions: [{
          id: 'stored-device-vitd',
          startedAt: todayStart + 11 * 3600000,
          endedAt: todayStart + 11.2 * 3600000,
          bodyArea: 'whole-body',
          doses: { vitamin_d: 2200, no_cv: 300, circadian: 800 },
        }],
        supplements: [{
          name: 'D stack',
          startDate: new Date(todayStart).toISOString().slice(0, 10),
          ingredients: [
            { name: 'Vitamin D3', amount: '125 mcg', timesPerDay: 1 },
            { name: 'Topical vitamin D cream', amount: 1000, unit: 'IU' },
          ],
        }],
      };

      const defaultEmptyPrompt = utils.showPromptDialog('Default empty prompt');
      await setPromptValue('');
      const defaultEmptyResult = await defaultEmptyPrompt;
      const allowEmptyPrompt = utils.showPromptDialog('Allow empty prompt', { allowEmpty: true });
      await setPromptValue('');
      const allowEmptyResult = await allowEmptyPrompt;
      outcomes.promptAllowEmptyPreservesDefaultSemantics = defaultEmptyResult === null
        && allowEmptyResult === '';

      outcomes.sunFacadeStaysModuleOnly = formerSunGlobals.every(name => !(name in window))
        && typeof sun.rollingChannelTotals === 'function'
        && typeof sun.applySunscreenMidSession === 'function'
        && Number.isFinite(sun.SUN_ENGINE_VERSION);
      outcomes.tierHelpersCoverDailyWeeklyAndFallbacks = sun.channelTier(0, 'vitamin_d') === 0
        && sun.channelTier(200, 'vitamin_d') === 3
        && sun.weeklyChannelTier(560, 'pomc') === 4
        && sun.tierLabel(99) === 'none'
        && sun.tierDots(3) === '●●●○';
      outcomes.formatChannelUnitsCoverThresholdsAndFallbacks =
        sun.formatChannelUnit('vitamin_d', 2000, 30, 'II', 6, null, true, 0.24).includes('IU-eq')
        && sun.formatChannelUnit('vitamin_d', 2000, 30, 'II', 1, null, false, 0.24).includes('IU-eq')
        && sun.formatChannelUnit('vitamin_d', 12000, 30, 'II', 6, null, true, 0.8).includes('reporting ceiling')
        && sun.formatChannelUnit('nir_solar', 12400, 20) === '1.2 J/cm²'
        && sun.formatChannelUnit('circadian', 52000, 10).includes('estimated melanopic-equivalent lx')
        && sun.formatChannelUnit('no_cv', 200, 20) === ''
        && sun.formatChannelUnit('circadian', 200, 1) === 'session too short';

      const totals = sun.rollingChannelTotals(7);
      const channelBreakdown = sun.dailyChannelBreakdown('vitamin_d', 3);
      const iuBreakdown = sun.dailyVitaminDIUBreakdown(3);
      const rollingIU = sun.rollingVitaminDIU(7);
      const todayIU = sun.cumulativeVitaminDIUToday();
      const budget = sun.vitaminDBudgetStatus();
      outcomes.aggregateTotalsAndBreakdownsIncludeSunAndDeviceData = totals.vitamin_d === 4100
        && totals.no_cv === 7500
        && channelBreakdown.at(-1).sun === 3200
        && channelBreakdown.at(-1).device === 2200
        && iuBreakdown.at(-1).sun > 0
        && iuBreakdown.at(-1).device > 0
        && rollingIU >= todayIU
        && budget.supplementIU === 5000
        && budget.exceedsSupplementUL === true;
      outcomes.medTotalsSplitTodayAndYesterday = sun.cumulativeMEDToday() === 0.42
        && sun.cumulativeMEDYesterday() === 0.31;

      await sun.pauseSunSession(activeId);
      await sun.resumeSunSession(activeId);
      await sun.flipSidesMidSession(activeId);
      await sun.flipSidesMidSession(activeId);
      outcomes.sessionLifecycleNotificationsAndRotation =
        activeSession.paused === false
        && activeSession.bodyExposure.rotatedSides === true
        && toasts().some(text => text.includes('Session paused'))
        && toasts().some(text => text.includes('Session resumed'))
        && toasts().some(text => text.includes('Side change already recorded'));
      clearToasts();

      const invalidSunscreen = sun.applySunscreenMidSession(activeId);
      await setPromptValue('101');
      await invalidSunscreen;
      const validSunscreen = sun.applySunscreenMidSession(activeId);
      await setPromptValue('45');
      await validSunscreen;
      outcomes.sunscreenPromptHandlesInvalidAndValidValues =
        activeSession.bodyExposure.sunscreenSPF === 45
        && toasts().some(text => text.includes('SPF must be 0-100'))
        && toasts().some(text => text.includes('SPF updated to 45'));
      clearToasts();

      await sun.changeCoverageMidSession(activeId);
      const coverageOverlay = document.querySelector('.sun-start-modal')?.closest('.modal-overlay');
      const coverageHint = coverageOverlay?.querySelector('#sun-coverage-hint')?.textContent || '';
      coverageOverlay?.querySelector('#coverage-confirm')?.click();
      await waitFor(() => toasts().some(text => text.includes('fully clothed')));
      outcomes.coverageModalAppliesEmptyRegionState = coverageHint.includes('No regions exposed')
        && activeSession.bodyExposure.fraction === 0
        && activeSession.bodyExposure.regions.length === 0
        && toasts().some(text => text.includes('fully clothed'));
      clearToasts();

      const ozoneInvalid = sun.setOzoneOverrideMidSession();
      await setPromptValue('99');
      await ozoneInvalid;
      const ozoneSet = sun.setOzoneOverrideMidSession();
      await setPromptValue('320');
      await ozoneSet;
      const ozoneClear = sun.setOzoneOverrideMidSession();
      await setPromptValue('');
      await ozoneClear;
      outcomes.ozonePromptValidatesSetsAndClearsOverride =
        state.importedData.sunDefaults.overrides.ozoneDU === null
        && toasts().some(text => text.includes('Ozone DU must be 100-600'))
        && toasts().some(text => text.includes('Ozone override set: 320 DU'))
        && toasts().some(text => text.includes('Ozone override cleared'));
      clearToasts();

      const forgetStop = sun._forgotStopPrompt(activeId);
      await confirmDialog();
      await forgetStop;
      outcomes.forgotStopConfirmEndsActiveSession = Number.isFinite(activeSession.endedAt)
        && activeSession.durationMin > 700
        && toasts().some(text => text.includes('Session ended'));
      clearToasts();

      const countryCoords = sun.getSunCoords();
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition(resolve) {
            resolve({ coords: { latitude: 40.7, longitude: -74.0, altitude: null } });
          },
        },
      });
      const precise = await sun.requestPreciseLocation();
      sun.clearCurrentLocation();
      delete state.importedData.sunDefaults.coords;
      state.profiles = [{ id: profileId, name: 'Sun Browser', location: { country: '', zip: '' } }];
      localStorage.setItem('labcharts-profiles', JSON.stringify([{ id: profileId, name: 'Sun Browser', location: { country: '', zip: '' } }]));
      const noCoords = sun.getSunCoords();
      outcomes.locationFallbacksAndPreciseRequest =
        countryCoords.source === 'country-band'
        && Math.abs(countryCoords.lat - 36.2) < 0.1
        && precise?.lat === 40.7
        && precise?.lon === -74
        && noCoords === null
        && precise?.source === 'current-device'
        && toasts().some(text => text.includes('Current location is active for today'));
    } finally {
      state.importedData = saved.importedData;
      state.profiles = saved.profilesState;
      state.currentProfile = saved.currentProfile;
      if (saved.profiles == null) localStorage.removeItem('labcharts-profiles');
      else localStorage.setItem('labcharts-profiles', saved.profiles);
      sunRuntime.configureSunRuntimeDeps(previousSunRuntimeDeps);
      if (saved.geolocation) Object.defineProperty(navigator, 'geolocation', saved.geolocation);
      else delete navigator.geolocation;
      document.querySelectorAll('.notification-container,.notification-toast,#prompt-dialog-overlay,#confirm-dialog-overlay,.modal-overlay').forEach(el => el.remove());
    }
    return outcomes;
  }, {
    sunUrl: moduleUrl('/js/sun.js'),
    utilsUrl: moduleUrl('/js/utils.js'),
    formerSunGlobals: FORMER_SUN_GLOBALS,
  });

  expectAll(outcomes);
});
