import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?lightConditionsCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function expectAll(outcomes) {
  for (const [name, passed] of Object.entries(outcomes)) {
    expect.soft(passed, name).toBe(true);
  }
}

test('conditions now browser coverage covers current semantics, refresh cache, and inspect paths', async ({ page }) => {
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
      validAt: Date.now() - 7 * 60000,
      fetchedAt: Date.now() - 5 * 60000,
      daily: {
        sunrise: isoAt(-240),
        sunset: isoAt(240),
        peakAt: isoAt(60),
        uvIndexMax: 7.1,
      },
      hourly: {
        time: [isoAt(0), isoAt(60), isoAt(120), isoAt(180), isoAt(240)],
        utcOffsetSeconds: 0,
        uv_index: [6.4, 7.1, 5.0, 2.0, 0.3],
      },
      airQuality: {
        pm25: 22,
        pm10: 80,
        no2: 140,
        surfaceOzoneUgM3: 185,
        european_aqi: 75,
        european_aqi_pm2_5: 30,
        european_aqi_pm10: 40,
        european_aqi_nitrogen_dioxide: 75,
        european_aqi_ozone: 65,
      },
      _requestCoords: { lat: 50.1, lon: 14.4, privacyRounded: true },
      ...overrides,
    });
    const slotText = id => document.getElementById(id)?.textContent || '';
    const waitForFullSlotIdle = label => waitUntil(() => {
      const slot = document.getElementById('cond-now-coverage-full');
      return !!slot && slot.getAttribute('aria-busy') === 'false' && !slot.classList.contains('is-refreshing');
    }, label);

    try {
      restoreDeps = conditions.configureLightConditionsNow({
        getSunCoords: () => coords,
        solarZenithAngle: () => 38,
        computeUVConfidence: opts => {
          calls.push(['confidence', opts]);
          return 0.73;
        },
        purgeMeteoCache: () => calls.push(['purge']),
        showNotification: (message, tone) => calls.push(['notification', message, tone]),
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
      outcomes.fullRenderLabelsModeledFreshnessWithoutLiveClaim = slotText('cond-now-coverage-full').includes('current model')
        && !slotText('cond-now-coverage-full').includes('live');
      outcomes.fullRenderPrioritizesGroundOzoneOverColumnSeverity = slotText('cond-now-coverage-full').includes('Ground ozone')
        && !slotText('cond-now-coverage-full').includes('Ozone column');
      outcomes.fullRenderPreservesUvaTransitionsWithPreciseTooltips = slotText('cond-now-coverage-full').includes('UV-A on')
        && slotText('cond-now-coverage-full').includes('UV-A off')
        && Array.from(host.querySelectorAll('.conditions-now-event-uva')).some(el => el.getAttribute('data-conditions-tooltip')?.includes('switch-like'))
        && Array.from(host.querySelectorAll('.conditions-now-event-uva')).some(el => el.getAttribute('data-conditions-tooltip')?.includes('does not stop instantly'));
      outcomes.fullRenderOmitsPersistentMethodCaveat = host.querySelector('.conditions-now-footnote') === null;
      outcomes.fullRenderOmitsManualModelControl = host.querySelector('#manual-uvi-input') === null;
      outcomes.fullRenderOmitsBurnAndVitaminDClaims = !slotText('cond-now-coverage-full').includes('burn')
        && !slotText('cond-now-coverage-full').includes('vit-D');
      outcomes.cachedAtmosphereAvailable = conditions.getCachedConditionsAtmosphere()?._appliedByTest === true;

      const compactHtml = conditions.renderConditionsNow({ variant: 'compact', slotId: 'cond-now-coverage-full' });
      outcomes.cacheHitRendersCompactRow = compactHtml.includes('conditions-now-row');
      outcomes.cacheHitRendersCompactSource = compactHtml.includes('Open-Meteo');
      outcomes.elapsedShortFormatsMinutes = conditions._formatElapsedShort(65_000) === '1:05';
      outcomes.elapsedShortFormatsHours = conditions._formatElapsedShort(3_661_000) === '1:01:01';

      conditions._inspectConditionsNow();
      const modal = document.querySelector('.modal-overlay.show .modal');
      outcomes.inspectModalRenders = !!modal;
      outcomes.inspectModalShowsComputedConfidence = modal?.textContent.includes('73%') === true;
      outcomes.inspectModalShowsRawPayload = modal?.textContent.includes('"uvIndex": 6.4') === true;
      outcomes.inspectModalListsCacheState = modal?.textContent.includes('localStorage cache') === true;
      outcomes.inspectModalSeparatesValidAndRetrievedTimes = modal?.textContent.includes('Valid at') === true
        && modal?.textContent.includes('Retrieved at') === true;
      outcomes.inspectModalShowsProviderCoordinates = modal?.textContent.includes('privacy-rounded') === true;
      modal?.closest('.modal-overlay')?.remove();
      outcomes.manualUviActionsAreNotExported = !('_setManualUvi' in conditions)
        && !('_clearManualUvi' in conditions);
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
      outcomes.offlineRefreshFallsBackToClearlyMarkedData = slotText('cond-now-coverage-full').includes('offline');
      outcomes.offlineRefreshCallsFetch = calls.some(call => call[0] === 'fetch-error');

      const warningCoords = { lat: 51.08, lon: 15.43, source: 'profile-precise' };
      conditions.configureLightConditionsNow({
        getSunCoords: () => warningCoords,
        solarZenithAngle: () => 100,
        fetchAtmosphere: async () => makeAtmosphere({
          uvIndex: 17,
          cloudCover: 130,
          ozoneDU: 50,
          source: 'open_meteo',
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
      outcomes.uviWarningIsVisibleInHero = slotText('cond-now-coverage-warning').includes('UVI data looks inconsistent');
      outcomes.uviWarningSuppressesProtectionInference = !slotText('cond-now-coverage-warning').includes('avoid unprotected exposure');

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
            european_aqi_pm2_5: 10,
            european_aqi_pm10: 12,
            european_aqi_nitrogen_dioxide: 8,
            european_aqi_ozone: 120,
          },
        }),
      });
      host.innerHTML = conditions.renderConditionsNow({ variant: 'full', slotId: 'cond-now-coverage-surface-ozone' });
      await waitUntil(() => document.getElementById('cond-now-coverage-surface-ozone')?.getAttribute('aria-busy') === 'false', 'surface ozone render');
      outcomes.surfaceOzoneUsesProviderEuropeanIndex = slotText('cond-now-coverage-surface-ozone').includes('Extremely poor')
        && slotText('cond-now-coverage-surface-ozone').includes('EU index 120');

      conditions.configureLightConditionsNow({ getSunCoords: () => null });
      host.innerHTML = conditions.renderConditionsNow({ variant: 'full', slotId: 'cond-now-coverage-no-coords' });
      await waitUntil(() => slotText('cond-now-coverage-no-coords').includes('Set a country'), 'no coords render');
      outcomes.noCoordsRenderShowsProfilePrompt = slotText('cond-now-coverage-no-coords').includes('Set a country');
    } finally {
      if (restoreDeps) conditions.configureLightConditionsNow(restoreDeps);
      state.importedData = saved.importedData;
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
