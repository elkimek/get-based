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
      getSunCoords: window.getSunCoords,
      fetchAtmosphere: window.fetchAtmosphere,
      applyAtmOverrides: window._applyAtmOverrides,
      solarZenithAngle: window.solarZenithAngle,
      computeUVConfidence: window.computeUVConfidence,
      purgeMeteoCache: window.purgeMeteoCache,
      showNotification: window.showNotification,
      saveImportedData: window.saveImportedData,
    };
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
      document.body.append(host);
      state.importedData = {
        ...(state.importedData || {}),
        sunDefaults: { fitzpatrick: 'II' },
        lightCircadian: { skinType: 'II - fair' },
      };
      window.getSunCoords = () => coords;
      window.solarZenithAngle = () => 38;
      window.computeUVConfidence = opts => {
        calls.push(['confidence', opts]);
        return 0.73;
      };
      window.purgeMeteoCache = () => calls.push(['purge']);
      window.showNotification = (message, tone) => calls.push(['notification', message, tone]);
      window.saveImportedData = async () => calls.push(['save']);
      window._applyAtmOverrides = atm => ({ ...atm, _appliedByTest: true });
      window.fetchAtmosphere = async opts => {
        calls.push(['fetch', opts]);
        await wait(0);
        return makeAtmosphere();
      };

      host.innerHTML = conditions.renderLightConditionsWidgetBody({ variant: 'full', slotId: 'cond-now-coverage-full' });
      outcomes.widgetBodyRendersRefreshButton = !!host.querySelector('.conditions-now-refresh');
      outcomes.widgetBodyRendersInspectButton = !!host.querySelector('.conditions-now-inspect');
      await waitUntil(() => document.getElementById('cond-now-coverage-full')?.getAttribute('aria-busy') === 'false', 'initial conditions render');
      outcomes.initialRefreshFetchesCoords = calls.some(call => call[0] === 'fetch' && call[1].lat === coords.lat && call[1].lon === coords.lon);
      outcomes.fullRenderShowsUvIndex = slotText('cond-now-coverage-full').includes('UV index');
      outcomes.fullRenderShowsTimeline = slotText('cond-now-coverage-full').includes("Today's sun timeline");
      outcomes.fullRenderShowsAirQuality = slotText('cond-now-coverage-full').includes('Air quality');
      outcomes.fullRenderShowsSource = slotText('cond-now-coverage-full').includes('Open-Meteo');
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
      window.fetchAtmosphere = async opts => {
        calls.push(['fetch-error', opts]);
        throw new Error('offline now');
      };
      conditions._refreshConditionsNow();
      await waitUntil(() => slotText('cond-now-coverage-full').includes('offline') || slotText('cond-now-coverage-full').includes('cached'), 'offline cached render');
      outcomes.offlineRefreshFallsBackToCache = slotText('cond-now-coverage-full').includes('cached');
      outcomes.offlineRefreshCallsFetch = calls.some(call => call[0] === 'fetch-error');

      const warningCoords = { lat: 51.08, lon: 15.43, source: 'profile-precise' };
      window.getSunCoords = () => warningCoords;
      window.solarZenithAngle = () => 100;
      window.fetchAtmosphere = async () => makeAtmosphere({
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
      });
      host.innerHTML = conditions.renderConditionsNow({ variant: 'full', slotId: 'cond-now-coverage-warning' });
      await waitUntil(() => document.getElementById('cond-now-coverage-warning')?.getAttribute('aria-busy') === 'false', 'warning render');
      outcomes.sanityWarningsRender = slotText('cond-now-coverage-warning').includes('sanity warning');
      outcomes.warningRenderUsesManualProviderLabel = slotText('cond-now-coverage-warning').includes('manual entry');

      const surfaceOzoneCoords = { lat: 52.08, lon: 16.43, source: 'profile-precise' };
      window.getSunCoords = () => surfaceOzoneCoords;
      window.solarZenithAngle = () => 38;
      window.fetchAtmosphere = async () => makeAtmosphere({
        ozoneDU: null,
        airQuality: {
          pm25: 8,
          pm10: 20,
          no2: 20,
          surfaceOzoneUgM3: 245,
          european_aqi: 18,
        },
      });
      host.innerHTML = conditions.renderConditionsNow({ variant: 'full', slotId: 'cond-now-coverage-surface-ozone' });
      await waitUntil(() => document.getElementById('cond-now-coverage-surface-ozone')?.getAttribute('aria-busy') === 'false', 'surface ozone render');
      outcomes.surfaceOzoneFallbackShowsHazardLabel = slotText('cond-now-coverage-surface-ozone').includes('Hazardous');
      outcomes.surfaceOzoneFallbackShowsAction = slotText('cond-now-coverage-surface-ozone').includes('avoid outdoor exercise');

      window.getSunCoords = () => null;
      host.innerHTML = conditions.renderConditionsNow({ variant: 'full', slotId: 'cond-now-coverage-no-coords' });
      await waitUntil(() => slotText('cond-now-coverage-no-coords').includes('Set a country'), 'no coords render');
      outcomes.noCoordsRenderShowsProfilePrompt = slotText('cond-now-coverage-no-coords').includes('Set a country');
    } finally {
      state.importedData = saved.importedData;
      Object.assign(window, {
        getSunCoords: saved.getSunCoords,
        fetchAtmosphere: saved.fetchAtmosphere,
        _applyAtmOverrides: saved.applyAtmOverrides,
        solarZenithAngle: saved.solarZenithAngle,
        computeUVConfidence: saved.computeUVConfidence,
        purgeMeteoCache: saved.purgeMeteoCache,
        showNotification: saved.showNotification,
        saveImportedData: saved.saveImportedData,
      });
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
