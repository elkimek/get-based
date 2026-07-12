import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?lightConditionsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function expectAll(outcomes) {
  for (const [name, passed] of Object.entries(outcomes)) {
    expect.soft(passed, name).toBe(true);
  }
}

test('conditions now browser coverage covers refresh cache manual override and inspect paths', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/app', { waitUntil: 'load' });

  const results = await page.evaluate(async ({ conditionsUrl }) => {
    const [conditions, { state }] = await Promise.all([
      import(conditionsUrl),
      import('/js/state.js'),
    ]);
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const saved = {
      importedData: clone(state.importedData),
      currentProfile: state.currentProfile,
    };
    let restoreDeps = null;
    const storage = new Map(Array.from({ length: localStorage.length }, (_, i) => {
      const key = localStorage.key(i);
      return [key, localStorage.getItem(key)];
    }));
    const outcomes = {};
    const calls = [];
    const host = document.createElement('div');
    const coords = { lat: 50.08, lon: 14.43, source: 'profile-precise' };
    let currentCoords = null;
    const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
    const waitUntil = async (predicate, label) => {
      for (let i = 0; i < 100; i += 1) {
        if (predicate()) return;
        await wait(25);
      }
      throw new Error(`Timed out waiting for ${label}`);
    };
    const isoAt = minutes => new Date(Date.now() + minutes * 60000).toISOString().slice(0, 16);
    const makeAtmosphere = (overrides = {}) => ({
      uvIndex: 6.4,
      uvClearSky: 8.2,
      ozoneDU: 282,
      cloudCover: 72,
      source: 'open_meteo_cams',
      confidence: 0.91,
      fetchedAt: Date.now() - 5 * 60000,
      daily: {
        sunrise: isoAt(-240),
        sunset: isoAt(240),
        peakAt: isoAt(60),
        uvIndexMax: 7.1,
      },
      hourly: {
        time: [isoAt(0), isoAt(60), isoAt(120), isoAt(180), isoAt(240)],
        uv_index: [6.4, 7.1, 5.0, 2.0, 0.3],
      },
      airQuality: {
        pm25: 22,
        pm10: 80,
        no2: 140,
        surfaceOzoneUgM3: 185,
        european_aqi: 75,
      },
      ...overrides,
    });
    const slotText = id => document.getElementById(id)?.textContent || '';
    const waitForFullSlotIdle = label => waitUntil(() => {
      const slot = document.getElementById('cond-now-coverage-full');
      return !!slot && slot.getAttribute('aria-busy') === 'false' && !slot.classList.contains('is-refreshing');
    }, label);

    try {
      restoreDeps = conditions.configureLightConditionsNow({
        getSunCoords: () => currentCoords,
        solarZenithAngle: () => 38,
        computeUVConfidence: opts => {
          calls.push(['confidence', opts]);
          return 0.73;
        },
        purgeMeteoCache: () => calls.push(['purge']),
        showNotification: (message, tone) => calls.push(['notification', message, tone]),
        saveImportedData: async () => calls.push(['save']),
        applyAtmOverrides: atm => ({ ...atm, _appliedByTest: true }),
        fetchAtmosphere: async opts => {
          calls.push(['fetch', opts]);
          await wait(0);
          return makeAtmosphere();
        },
      });
      document.body.append(host);
      state.importedData = {
        ...(state.importedData || {}),
        sunDefaults: { fitzpatrick: 'II' },
        lightCircadian: { skinType: 'II - fair' },
      };

      const transitionHost = document.createElement('div');
      document.body.append(transitionHost);
      transitionHost.innerHTML = conditions.renderConditionsNow({ variant: 'full', slotId: 'cond-now-location-transition' });
      await waitUntil(() => slotText('cond-now-location-transition').includes('Set a country'), 'missing-location conditions state');
      const fetchesBeforeLocation = calls.filter(call => call[0] === 'fetch').length;
      currentCoords = coords;
      transitionHost.innerHTML = conditions.renderConditionsNow({ variant: 'full', slotId: 'cond-now-location-transition' });
      await waitUntil(() => slotText('cond-now-location-transition').includes('UV index'), 'location-aware rerender');
      outcomes.locationAddedRefreshesExistingSlotImmediately = calls.filter(call => call[0] === 'fetch').length > fetchesBeforeLocation;
      transitionHost.remove();

      host.innerHTML = conditions.renderLightConditionsWidgetBody({ variant: 'full', slotId: 'cond-now-coverage-full' });
      conditions.installLightConditionsActionDelegates(host);
      outcomes.widgetBodyRendersRefreshButton = !!host.querySelector('.conditions-now-refresh');
      outcomes.widgetBodyRendersInspectButton = !!host.querySelector('.conditions-now-inspect');
      outcomes.widgetBodyUsesDelegatedActions = !!host.querySelector('[data-light-conditions-action="refresh"]')
        && !!host.querySelector('[data-light-conditions-action="inspect"]')
        && !host.innerHTML.includes('onclick=');
      await waitUntil(() => document.getElementById('cond-now-coverage-full')?.getAttribute('aria-busy') === 'false', 'initial conditions render');
      outcomes.initialRefreshFetchesCoords = calls.some(call => call[0] === 'fetch' && call[1].lat === coords.lat && call[1].lon === coords.lon);
      outcomes.fullRenderShowsUvIndex = slotText('cond-now-coverage-full').includes('UV index');
      outcomes.fullRenderShowsTimeline = slotText('cond-now-coverage-full').includes("Today's sun timeline");
      outcomes.fullRenderShowsAirQuality = slotText('cond-now-coverage-full').includes('Air quality');
      outcomes.fullRenderShowsSource = slotText('cond-now-coverage-full').includes('Open-Meteo');
      outcomes.cachedAtmosphereAvailable = conditions.getCachedConditionsAtmosphere()?._appliedByTest === true;
      state.currentProfile = 'coverage-other-profile';
      outcomes.conditionsCacheIsProfileScoped = conditions.getCachedConditionsAtmosphere() === null;
      state.currentProfile = saved.currentProfile;

      const constantMed = conditions._timeToMed(10, 'III', null);
      const sensitiveMed = conditions._timeToMed(10, 'III', null, 0.5);
      outcomes.burnTimeUsesLocalIrradianceNotBodyArea = constantMed.kind === 'minutes' && constantMed.value === 20;
      outcomes.photosensitivityConservativelyShortensBurnEstimate = sensitiveMed.kind === 'minutes' && sensitiveMed.value === 10;
      const offsetSeconds = 5 * 3600;
      const locationLocalAt = minutes => new Date(Date.now() + minutes * 60000 + offsetSeconds * 1000).toISOString().slice(0, 16);
      const timezoneMed = conditions._timeToMed(10, 'III', {
        daily: { sunset: locationLocalAt(120) },
        hourly: {
          time: [locationLocalAt(0), locationLocalAt(60), locationLocalAt(120)],
          uv_index: [10, 10, 0],
          utcOffsetSeconds: offsetSeconds,
        },
      });
      outcomes.burnTimeParsesLocationTimezoneIndependently = timezoneMed.kind === 'minutes'
        && Math.abs(timezoneMed.value - 20) <= 1;

      const compactHtml = conditions.renderConditionsNow({ variant: 'compact', slotId: 'cond-now-coverage-full' });
      outcomes.cacheHitRendersCompactRow = compactHtml.includes('conditions-now-row');
      outcomes.cacheHitRendersCompactSource = compactHtml.includes('Open-Meteo');
      conditions.configureLightConditionsNow({ computeUVConfidence: () => 0.4 });
      const lowConfidenceHtml = conditions.renderConditionsNow({ variant: 'compact', slotId: 'cond-now-coverage-full' });
      outcomes.lowConfidenceWithholdsExactBurnCountdown = lowConfidenceHtml.includes('burn timing withheld')
        && !lowConfidenceHtml.includes('to sunburn dose');
      conditions.configureLightConditionsNow({ computeUVConfidence: () => 0.9 });
      state.importedData.sunDefaults.photosensitiveMeds = 'moderate';
      const medicationHtml = conditions.renderConditionsNow({ variant: 'compact', slotId: 'cond-now-coverage-full' });
      outcomes.medicationFlagWithholdsPersonalizedBurnCountdown = medicationHtml.includes('medication sensitivity')
        && !medicationHtml.includes('to sunburn dose');
      state.importedData.sunDefaults.photosensitiveMeds = 'none';
      conditions.configureLightConditionsNow({ computeUVConfidence: () => 0.73 });
      outcomes.elapsedShortFormatsMinutes = conditions._formatElapsedShort(65_000) === '1:05';
      outcomes.elapsedShortFormatsHours = conditions._formatElapsedShort(3_661_000) === '1:01:01';

      conditions._inspectConditionsNow();
      const modal = document.querySelector('.modal-overlay.show .modal');
      outcomes.inspectModalRenders = !!modal;
      outcomes.inspectModalShowsComputedConfidence = modal?.textContent.includes('73%') === true;
      outcomes.inspectModalShowsRawPayload = modal?.textContent.includes('"uvIndex": 6.4') === true;
      outcomes.inspectModalListsCacheState = modal?.textContent.includes('localStorage cache') === true;
      modal?.closest('.modal-overlay')?.remove();

      const manualInput = /** @type {HTMLInputElement | null} */ (document.getElementById('manual-uvi-input'));
      if (manualInput) manualInput.value = '22';
      await conditions._setManualUvi();
      outcomes.invalidManualUviNotifiesError = calls.some(call => call[0] === 'notification' && String(call[1]).includes('between 0 and 20'));
      calls.length = 0;
      if (manualInput) manualInput.value = '5.5';
      await conditions._setManualUvi();
      outcomes.validManualUviPersistsOverride = state.importedData.sunDefaults.overrides.uvIndex === 5.5;
      outcomes.validManualUviSavesData = calls.some(call => call[0] === 'save');
      outcomes.validManualUviForcesRefresh = calls.some(call => call[0] === 'fetch' && call[1].noCache === true);
      await waitForFullSlotIdle('manual UVI refresh settle');
      calls.length = 0;
      await conditions._clearManualUvi();
      outcomes.clearManualUviRemovesOverride = !('uvIndex' in (state.importedData.sunDefaults.overrides || {}));
      outcomes.clearManualUviSavesData = calls.some(call => call[0] === 'save');
      outcomes.clearManualUviForcesRefresh = calls.some(call => call[0] === 'fetch' && call[1].noCache === true);

      await waitForFullSlotIdle('clear manual UVI refresh settle');
      localStorage.setItem('meteo:coverage-stale', 'cached');
      calls.length = 0;
      conditions._refreshConditionsNow();
      await waitUntil(() => calls.some(call => call[0] === 'fetch' && call[1].noCache === true), 'forced refresh fetch');
      outcomes.forceRefreshCallsPurgeHook = calls.some(call => call[0] === 'purge');
      outcomes.forceRefreshClearsMeteoCache = localStorage.getItem('meteo:coverage-stale') === null;

      await waitForFullSlotIdle('forced refresh settle');
      calls.length = 0;
      conditions.configureLightConditionsNow({ fetchAtmosphere: async opts => {
        calls.push(['fetch-error', opts]);
        throw new Error('offline now');
      } });
      conditions._refreshConditionsNow();
      await waitUntil(() => slotText('cond-now-coverage-full').includes('offline') || slotText('cond-now-coverage-full').includes('cached'), 'offline cached render');
      outcomes.offlineRefreshFallsBackToCache = slotText('cond-now-coverage-full').includes('cached');
      outcomes.offlineRefreshCallsFetch = calls.some(call => call[0] === 'fetch-error');

      const warningCoords = { lat: 51.08, lon: 15.43, source: 'profile-precise' };
      conditions.configureLightConditionsNow({
        getSunCoords: () => warningCoords,
        solarZenithAngle: () => 100,
        fetchAtmosphere: async () => makeAtmosphere({
          uvIndex: 17,
          cloudCover: 130,
          ozoneDU: 50,
          source: 'manual_override',
          daily: { sunrise: isoAt(-240), sunset: isoAt(240), peakAt: isoAt(20), uvIndexMax: 10 },
          airQuality: {
            pm25: -2,
            pm10: -1,
            no2: -1,
            surfaceOzoneUgM3: 1200,
            european_aqi: 600,
          },
        }),
      });
      host.innerHTML = conditions.renderConditionsNow({ variant: 'full', slotId: 'cond-now-coverage-warning' });
      await waitUntil(() => document.getElementById('cond-now-coverage-warning')?.getAttribute('aria-busy') === 'false', 'warning render');
      outcomes.sanityWarningsRender = slotText('cond-now-coverage-warning').includes('sanity warning');
      outcomes.warningRenderUsesManualProviderLabel = slotText('cond-now-coverage-warning').includes('manual entry');

      const surfaceOzoneCoords = { lat: 52.08, lon: 16.43, source: 'profile-precise' };
      conditions.configureLightConditionsNow({
        getSunCoords: () => surfaceOzoneCoords,
        solarZenithAngle: () => 38,
        fetchAtmosphere: async () => makeAtmosphere({
          ozoneDU: null,
          airQuality: {
            pm25: 8,
            pm10: 20,
            no2: 20,
            surfaceOzoneUgM3: 245,
            european_aqi: 18,
          },
        }),
      });
      host.innerHTML = conditions.renderConditionsNow({ variant: 'full', slotId: 'cond-now-coverage-surface-ozone' });
      await waitUntil(() => document.getElementById('cond-now-coverage-surface-ozone')?.getAttribute('aria-busy') === 'false', 'surface ozone render');
      outcomes.surfaceOzoneFallbackShowsHazardLabel = slotText('cond-now-coverage-surface-ozone').includes('Hazardous');
      outcomes.surfaceOzoneFallbackShowsAction = slotText('cond-now-coverage-surface-ozone').includes('avoid outdoor exercise');

      conditions.configureLightConditionsNow({ getSunCoords: () => null });
      host.innerHTML = conditions.renderConditionsNow({ variant: 'full', slotId: 'cond-now-coverage-no-coords' });
      await waitUntil(() => slotText('cond-now-coverage-no-coords').includes('Set a country'), 'no coords render');
      outcomes.noCoordsRenderShowsProfilePrompt = slotText('cond-now-coverage-no-coords').includes('Set a country');
    } finally {
      if (restoreDeps) conditions.configureLightConditionsNow(restoreDeps);
      state.importedData = saved.importedData;
      state.currentProfile = saved.currentProfile;
      localStorage.clear();
      for (const [key, value] of storage) {
        if (key && value != null) localStorage.setItem(key, value);
      }
      document.querySelectorAll('.modal-overlay.show').forEach(el => el.remove());
      host.remove();
    }

    return outcomes;
  }, { conditionsUrl: moduleUrl('/js/light-conditions-now.js') });

  expectAll(results);
});
