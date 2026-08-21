import { expect, test } from './coverage-fixture.js';

function moduleUrl(path) {
  return `${path}?sunUvdataBrowserCoverage=${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function expectAll(outcomes) {
  const failed = Object.entries(outcomes)
    .filter(([, value]) => value !== true)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  expect(failed).toEqual([]);
}

test('sun uvdata browser coverage handles config cache module API and purging', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async ({ sunUrl }) => {
    const outcomes = {};
    const storageKey = 'labcharts-meteo-config';
    const originalConfig = localStorage.getItem(storageKey);
    const originalWarn = console.warn;
    const cleanup = () => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (
          key === 'meteo-cache-v5-purged' ||
          key === 'meteo:legacy-a' ||
          key === 'meteo:v1:keep-a' ||
          key?.startsWith('meteo:v2:') ||
          key?.startsWith('meteo:v3:') ||
          key?.startsWith('meteo:v4:') ||
          key?.startsWith('meteo:v5:')
        ) {
          keys.push(key);
        }
      }
      keys.forEach(key => localStorage.removeItem(key));
    };

    try {
      cleanup();
      localStorage.removeItem('meteo-cache-v5-purged');
      localStorage.setItem('meteo:legacy-a', 'old-cache');
      localStorage.setItem('meteo:v2:old-a', 'old-version-cache');
      localStorage.setItem('meteo:v4:old-a', 'old-version-cache');
      localStorage.setItem('meteo:v5:keep-a', 'fresh-cache');

      const mod = await import(sunUrl);
      const cryptoStore = await import('/js/crypto.js');
      const waitForSecureConfig = async () => {
        for (let attempt = 0; attempt < 100; attempt += 1) {
          const raw = localStorage.getItem(storageKey);
          if (raw?.startsWith('d1:') || raw?.startsWith('v1:')) return raw;
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        return null;
      };

      outcomes.importSweepsOnlyLegacyMeteoCache =
        localStorage.getItem('meteo:legacy-a') === null
        && localStorage.getItem('meteo:v2:old-a') === null
        && localStorage.getItem('meteo:v3:keep-a') === null
        && localStorage.getItem('meteo:v4:old-a') === null
        && localStorage.getItem('meteo:v5:keep-a') === 'fresh-cache'
        && localStorage.getItem('meteo-cache-v5-purged') === '1';

      outcomes.uvdataExportsStayModuleOnly = [
        'fetchAtmosphere',
        'interpolateAtmosphere',
        'getMeteoConfig',
        'saveMeteoConfig',
        'purgeMeteoCache',
        'solarZenithAngle',
        'computeUVConfidence',
      ].every(name => !(name in window));

      outcomes.manualAtmosphereIsNotExported = !('manualAtmosphere' in mod);

      localStorage.setItem(storageKey, '{bad json');
      const invalidConfig = mod.getMeteoConfig();
      outcomes.invalidStoredConfigFallsBackToDefaults =
        invalidConfig.mode === 'auto'
        && invalidConfig.selfhostUrl === ''
        && invalidConfig.selfhostBearer === ''
        && invalidConfig.privacyRounding === 0.1;

      localStorage.setItem(storageKey, JSON.stringify({
        mode: 'cams',
        selfhostUrl: 'https://legacy.example/uv',
        selfhostBearer: 123,
        privacyRounding: 0.25,
        extra: 'ignored',
      }));
      const migrated = mod.getMeteoConfig();
      const migratedEnvelope = await waitForSecureConfig();
      const persistedMigration = JSON.parse(await cryptoStore.encryptedGetItem(storageKey));
      outcomes.legacyModeMigratesAndSanitizesStoredConfig =
        migrated.mode === 'auto'
        && migrated.selfhostUrl === 'https://legacy.example/uv'
        && migrated.selfhostBearer === ''
        && migrated.privacyRounding === 0.25
        && migratedEnvelope?.startsWith('d1:')
        && !migratedEnvelope.includes('legacy.example')
        && persistedMigration.mode === 'auto'
        && persistedMigration.extra === undefined;

      localStorage.setItem(storageKey, JSON.stringify({ mode: 'manual', privacyRounding: 0.1 }));
      outcomes.legacyManualModeMigratesToAuto = mod.getMeteoConfig().mode === 'auto';
      await waitForSecureConfig();

      const warnings = [];
      console.warn = (...args) => warnings.push(args.join(' '));
      localStorage.setItem(storageKey, JSON.stringify({
        mode: 'selfhost',
        selfhostUrl: '',
        selfhostBearer: 'secret',
        privacyRounding: 0.5,
      }));
      const emptySelfhost = mod.getMeteoConfig();
      const persistedSelfhost = JSON.parse(localStorage.getItem(storageKey));
      outcomes.emptySelfhostFallsBackInMemoryAndWarnsOnce =
        emptySelfhost.mode === 'auto'
        && persistedSelfhost.mode === 'selfhost'
        && warnings.length === 1
        && warnings[0].includes('mode=selfhost with empty selfhostUrl');

      mod.saveMeteoConfig({
        mode: 'selfhost',
        selfhostUrl: 'https://uv.example',
        selfhostBearer: 'secret-token',
        privacyRounding: 0.25,
      });
      await waitForSecureConfig();
      localStorage.setItem(storageKey, 'v1:opaque-encrypted-envelope');
      const encryptedFallback = mod.getMeteoConfig();
      outcomes.encryptedEnvelopeUsesCachedDecryptedConfig =
        encryptedFallback.mode === 'selfhost'
        && encryptedFallback.selfhostUrl === 'https://uv.example'
        && encryptedFallback.selfhostBearer === 'secret-token'
        && encryptedFallback.privacyRounding === 0.25;

      localStorage.setItem('meteo:v1:keep-a', '{}');
      localStorage.setItem('meteo:v5:purge-a', '{}');
      localStorage.setItem('meteo:v5:purge-b', '{}');
      const beforePurge = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
        .filter(key => key?.startsWith('meteo:v5:')).length;
      const removed = mod.purgeMeteoCache();
      const afterPurge = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
        .filter(key => key?.startsWith('meteo:v5:')).length;
      outcomes.purgeMeteoCacheCountsAndRemovesOnlyCurrentEntries =
        beforePurge === 3
        && removed === beforePurge
        && afterPurge === 0
        && localStorage.getItem('meteo:v1:keep-a') === '{}';

      const lowConfidence = mod.computeUVConfidence({
        source: 'cams',
        snapshotAgeSec: 90000,
        cloudCover: 90,
        zenithDeg: 84,
        uvIndex: 0.2,
        isStale: true,
      });
      outcomes.confidenceHandlesLegacyFlagsPenaltiesAndBounds =
        mod.computeUVConfidence({ source: 'open_meteo', manualOverridden: true }) === 0.65
        && lowConfidence >= 0.05
        && lowConfidence < 0.1
        && mod.computeUVConfidence({ source: 'unknown-provider', uvIndex: 99 }) <= 0.99;
    } finally {
      console.warn = originalWarn;
      cleanup();
      if (originalConfig == null) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, originalConfig);
    }

    return outcomes;
  }, { sunUrl: moduleUrl('/js/sun-uvdata.js') });

  expectAll(outcomes);
});

test('sun uvdata browser coverage drives provider chain cache stale and offline paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async ({ sunUrl }) => {
    const outcomes = {};
    const storageKey = 'labcharts-meteo-config';
    const originalConfig = localStorage.getItem(storageKey);
    const originalFetch = window.fetch;
    const originalWarn = console.warn;
    const mod = await import(sunUrl);
    const iso = '2026-06-01T12:30:00.000Z';
    const jsonResponse = (json, init = {}) => new Response(JSON.stringify(json), {
      status: init.status || 200,
      headers: {
        'content-type': 'application/json',
        ...(init.headers || {}),
      },
    });
    const forecast = (uvIndex = 4.4, extra = {}) => ({
      utc_offset_seconds: 0,
      hourly: {
        time: ['2026-06-01T12:00'],
        uv_index: [uvIndex],
        uv_index_clear_sky: [Number.isFinite(uvIndex) ? uvIndex + 1 : uvIndex],
        cloud_cover: [20],
        temperature_2m: [22],
        ...(extra.hourly || {}),
      },
      daily: {
        time: ['2026-06-01'],
        sunrise: ['2026-06-01T05:10'],
        sunset: ['2026-06-01T20:35'],
        uv_index_max: [Number.isFinite(uvIndex) ? uvIndex + 1 : uvIndex],
        ...(extra.daily || {}),
      },
      ...extra.root,
    });
    const airQuality = {
      utc_offset_seconds: 0,
      hourly: {
        time: ['2026-06-01T12:00'],
        pm10: [11],
        pm2_5: [6],
        nitrogen_dioxide: [14],
        aerosol_optical_depth: [0.08],
        ozone: [70],
        european_aqi: [18],
        european_aqi_pm2_5: [10],
        european_aqi_pm10: [12],
        european_aqi_nitrogen_dioxide: [8],
        european_aqi_ozone: [16],
      },
      current: { pm2_5: 6, pm10: 11, european_aqi: 18 },
    };
    const saveConfig = cfg => mod.saveMeteoConfig({
      mode: cfg.mode,
      selfhostUrl: cfg.selfhostUrl || '',
      selfhostBearer: cfg.selfhostBearer || '',
      privacyRounding: cfg.privacyRounding ?? 0.1,
    });
    const cleanupCache = () => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('meteo:v5:')) keys.push(key);
      }
      keys.forEach(key => localStorage.removeItem(key));
    };

    try {
      cleanupCache();

      saveConfig({
        mode: 'selfhost',
        selfhostUrl: 'https://uvdata.example/base/',
        selfhostBearer: 'token',
      });
      const selfhostCalls = [];
      window.fetch = async (url, opts = {}) => {
        selfhostCalls.push({
          url: String(url),
          authorization: opts.headers?.Authorization || '',
        });
        return jsonResponse(forecast(5.2));
      };
      const selfhost = await mod.fetchAtmosphere({
        lat: 120,
        lon: -250,
        isoTime: iso,
        noCache: true,
      });
      outcomes.selfhostAddsBearerClampsCoordsAndShapes =
        selfhost.source === 'selfhost'
        && selfhost.uvIndex === 5.2
        && selfhostCalls[0].authorization === 'Bearer token'
        && selfhostCalls[0].url.includes('latitude=90.000000')
        && selfhostCalls[0].url.includes('longitude=-180.000000');

      saveConfig({
        mode: 'selfhost',
        selfhostUrl: 'https://uvdata.example/base',
      });
      const fallbackCalls = [];
      window.fetch = async (url) => {
        const href = String(url);
        fallbackCalls.push(href);
        if (href.startsWith('https://uvdata.example')) return jsonResponse({ ok: true });
        if (href.includes('air-quality')) return jsonResponse(airQuality);
        return jsonResponse(forecast(4.2));
      };
      const selfhostFallback = await mod.fetchAtmosphere({
        lat: 50,
        lon: 14,
        isoTime: iso,
        noCache: true,
      });
      outcomes.invalidSelfhostShapeFallsBackToOpenMeteo =
        selfhostFallback.source === 'open_meteo'
        && selfhostFallback.uvIndex === 4.2
        && fallbackCalls.some(call => call.startsWith('https://uvdata.example'))
        && fallbackCalls.some(call => call.includes('historical-forecast-api.open-meteo.com'))
        && fallbackCalls.some(call => call.includes('start_date=2026-05-31'))
        && fallbackCalls.some(call => call.includes('end_date=2026-06-02'))
        && fallbackCalls.some(call => call.includes('air-quality-api.open-meteo.com'));

      saveConfig({
        mode: 'selfhost',
        selfhostUrl: 'http://127.0.0.1:9000',
      });
      const rejectedSelfhostCalls = [];
      const rejectedSelfhostWarnings = [];
      console.warn = (...args) => rejectedSelfhostWarnings.push(args.join(' '));
      window.fetch = async (url) => {
        const href = String(url);
        rejectedSelfhostCalls.push(href);
        if (href.includes('air-quality')) return jsonResponse(airQuality);
        return jsonResponse(forecast(3.9));
      };
      const rejectedSelfhostFallback = await mod.fetchAtmosphere({
        lat: 50,
        lon: 14,
        isoTime: iso,
        noCache: true,
      });
      console.warn = originalWarn;
      outcomes.rejectedSelfhostAvailabilityWarnsAndFallsBack =
        rejectedSelfhostFallback.source === 'open_meteo'
        && rejectedSelfhostFallback.uvIndex === 3.9
        && !rejectedSelfhostCalls.some(call => call.startsWith('http://127.0.0.1'))
        && rejectedSelfhostCalls.some(call => call.includes('api.open-meteo.com'))
        && rejectedSelfhostWarnings.some(line => line.includes('selfhost URL rejected'));

      saveConfig({ mode: 'auto' });
      window.fetch = async (url) => {
        const href = String(url);
        if (href === '/api/proxy') {
          return jsonResponse(forecast(null, {
            hourly: {
              cloud_cover: [null],
              temperature_2m: [null],
              ozone_du: [315],
              aod: [0.07],
            },
            root: {
              airQuality,
              _camsMeta: { ageSec: 600 },
            },
            daily: {
              uv_index_max_cams: [7.4],
              uv_index_max_cams_at: ['2026-06-01T13:00'],
            },
          }));
        }
        if (href.includes('air-quality')) return jsonResponse(airQuality);
        return jsonResponse(forecast(6.6));
      };
      const merged = await mod.fetchAtmosphere({
        lat: 50,
        lon: 14,
        isoTime: iso,
        noCache: true,
      });
      outcomes.sparseCamsResultMergesOpenMeteoFallback =
        merged.source === 'cams+open_meteo'
        && merged.uvIndex === 6.6
        && merged.ozoneDU === 315
        && merged.airQuality?.aod === 0.07
        && Math.abs(merged.confidence - 0.65) < 0.01;

      window.fetch = async url => {
        if (String(url) !== '/api/proxy') throw new Error('direct CAMS relay should not need browser fallback');
        return jsonResponse(forecast(5.8, {
          hourly: {
            uv_index_source: ['cams_uvbedcs+satellite_cmf'],
            uv_index_cams_total_sky: [6.1],
            uv_index_cams_clear_sky: [6.8],
            uv_index_satellite_adjusted: [5.8],
            ozone_du: [308],
            aod: [0.06],
          },
          root: {
            airQuality,
            _camsMeta: { ageSec: 300, requestedTimeInRange: true, directUv: true },
            _openMeteoMeta: { stale: false, satelliteSource: 'dwd_sis_europe_africa_v4' },
            _fieldSources: {
              uvIndex: 'cams_uvbedcs+satellite_cmf',
              ozoneDU: 'cams_global_forecast',
              cloudCover: 'open_meteo_best_match',
            },
          },
        }));
      };
      const enhanced = await mod.fetchAtmosphere({
        lat: 50,
        lon: 14,
        isoTime: iso,
        noCache: true,
      });
      outcomes.directCamsSatelliteProvenanceSurvivesShaping =
        enhanced.source === 'cams_satellite'
        && enhanced.uvIndex === 5.8
        && enhanced.ozoneDU === 308
        && enhanced.confidence === mod.UV_SOURCE_CONFIDENCE.cams_satellite
        && enhanced.fieldSources?.uvIndex === 'cams_uvbedcs+satellite_cmf'
        && enhanced.hourly?.uv_index_cams_total_sky?.[0] === 6.1;

      saveConfig({ mode: 'noaa' });
      const legacyNoaaCalls = [];
      window.fetch = async (url) => {
        const href = String(url);
        legacyNoaaCalls.push(href);
        if (href.includes('air-quality')) return jsonResponse(airQuality);
        return jsonResponse(forecast(2.8, { root: { airQuality } }));
      };
      const legacyNoaa = await mod.fetchAtmosphere({
        lat: 40,
        lon: -100,
        isoTime: iso,
        noCache: true,
      });
      outcomes.legacyNoaaModeMigratesToAutoProviderOrder =
        legacyNoaa.source === 'cams'
        && legacyNoaa.uvIndex === 2.8
        && legacyNoaaCalls.length === 1
        && legacyNoaaCalls[0] === '/api/proxy';

      const shapedNoaa = mod._testShapeNoaaResponse({ UVI: 6.1, ozone: 307 }, iso);
      outcomes.noaaTestHooksCoverLegacyShaperAndUsPredicate =
        shapedNoaa?.source === 'noaa_nws'
        && shapedNoaa.uvIndex === 6.1
        && shapedNoaa.ozoneDU === 307
        && shapedNoaa.confidence === mod.UV_SOURCE_CONFIDENCE.noaa_nws
        && mod._testShapeNoaaResponse({}, iso) === null
        && mod._testIsUSCoords(40, -100) === true
        && mod._testIsUSCoords(61, -150) === true
        && mod._testIsUSCoords(20.5, -157) === true
        && mod._testIsUSCoords(50, 14) === false;

      saveConfig({ mode: 'open-meteo' });
      cleanupCache();
      let cacheFetches = 0;
      window.fetch = async (url) => {
        cacheFetches += 1;
        return String(url).includes('air-quality')
          ? jsonResponse(airQuality)
          : jsonResponse(forecast(3.3));
      };
      const first = await mod.fetchAtmosphere({ lat: 40.11, lon: -73.22, isoTime: iso });
      const second = await mod.fetchAtmosphere({ lat: 40.11, lon: -73.22, isoTime: iso });
      const bypass = await mod.fetchAtmosphere({ lat: 40.11, lon: -73.22, isoTime: iso, noCache: true });
      outcomes.freshCacheHitAndNoCacheBypass =
        first.source === 'open_meteo'
        && second.source === 'open_meteo'
        && bypass.source === 'open_meteo'
        && cacheFetches === 4;

      cleanupCache();
      localStorage.setItem('meteo:v5:50.00_14.00_2026-06-01T08', JSON.stringify({
        uvIndex: 2.2,
        uvClearSky: 3.0,
        ozoneDU: 300,
        cloudCover: 30,
        temperatureC: 12,
        airQuality: null,
        source: 'open_meteo',
        confidence: 0.5,
        fetchedAt: Date.now() - 2 * 60 * 60 * 1000,
      }));
      window.fetch = () => Promise.reject(new Error('offline'));
      const stale = await mod.fetchAtmosphere({ lat: 50, lon: 14, isoTime: iso });
      outcomes.staleCacheFallbackUsesLatestMatchingCoords =
        stale._stale === true
        && stale.source === 'open_meteo_stale'
        && stale.uvIndex === 2.2;

      cleanupCache();
      const offline = await mod.fetchAtmosphere({
        lat: 0,
        lon: 0,
        isoTime: '2026-03-20T12:00:00.000Z',
        noCache: true,
      });
      outcomes.allProvidersFailedUsesZenithOfflineEstimate =
        offline.source === 'zenith_offline'
        && offline._offline === true
        && offline.uvIndex > 10
        && offline.ozoneDU === 300;
    } finally {
      window.fetch = originalFetch;
      console.warn = originalWarn;
      cleanupCache();
      if (originalConfig == null) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, originalConfig);
    }

    return outcomes;
  }, { sunUrl: moduleUrl('/js/sun-uvdata.js') });

  expectAll(outcomes);
});

test('sun uvdata browser coverage handles response caps shapers and interpolation', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async ({ sunUrl }) => {
    const outcomes = {};
    const storageKey = 'labcharts-meteo-config';
    const originalConfig = localStorage.getItem(storageKey);
    const originalFetch = window.fetch;
    const mod = await import(sunUrl);
    const saveOpenMeteo = () => mod.saveMeteoConfig({
      mode: 'open-meteo',
      selfhostUrl: '',
      selfhostBearer: '',
      privacyRounding: 0.1,
    });
    const cleanupCache = () => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('meteo:v5:')) keys.push(key);
      }
      keys.forEach(key => localStorage.removeItem(key));
    };

    try {
      saveOpenMeteo();
      cleanupCache();
      window.fetch = async () => new Response('{}', {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'content-length': String(300000),
        },
      });
      const declaredCap = await mod.fetchAtmosphere({
        lat: 1,
        lon: 1,
        isoTime: '2026-06-01T12:00:00.000Z',
        noCache: true,
      });
      outcomes.declaredContentLengthCapFallsThroughToOffline =
        declaredCap.source === 'zenith_offline';

      cleanupCache();
      window.fetch = async () => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(300000));
          controller.close();
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
      const streamedCap = await mod.fetchAtmosphere({
        lat: 2,
        lon: 2,
        isoTime: '2026-06-01T12:00:00.000Z',
        noCache: true,
      });
      outcomes.streamingBodyCapFallsThroughToOffline =
        streamedCap.source === 'zenith_offline';

      cleanupCache();
      const forecast = {
        utc_offset_seconds: 7200,
        hourly: {
          time: [
            '2026-05-31T12:00',
            '2026-06-01T11:00',
            '2026-06-01T12:00',
            '2026-06-01T13:00',
          ],
          uv_index: [8, 3, 5, 7],
          uv_index_clear_sky: [9, 4, 6, 8],
          cloud_cover: [60, 30, 20, 10],
          temperature_2m: [16, 19, 21, 23],
        },
        daily: {
          time: ['2026-05-31', '2026-06-01'],
          sunrise: ['2026-05-31T05:30', '2026-06-01T05:10'],
          sunset: ['2026-05-31T20:20', '2026-06-01T20:35'],
          uv_index_max: [9, 7],
        },
      };
      const airQuality = {
        utc_offset_seconds: 0,
        hourly: {
          time: ['2026-06-01T10:00'],
          pm10: [20],
          pm2_5: [7],
          nitrogen_dioxide: [12],
          aerosol_optical_depth: [0.08],
          ozone: [80],
        },
        current: { pm2_5: 9, pm10: 18, european_aqi: 2 },
      };
      window.fetch = async (url) => new Response(JSON.stringify(
        String(url).includes('air-quality') ? airQuality : forecast
      ), { status: 200, headers: { 'content-type': 'application/json' } });

      const shaped = await mod.fetchAtmosphere({
        lat: 50.08,
        lon: 14.43,
        isoTime: '2026-06-01T10:30:00.000Z',
        noCache: true,
      });
      outcomes.openMeteoShaperUsesLocalDayPeakAndSurfaceOzone =
        shaped.source === 'open_meteo'
        && shaped.uvIndex === 5
        && shaped.ozoneDU === null
        && shaped.airQuality?.surfaceOzoneUgM3 === 80
        && shaped.airQuality?.european_aqi === 2
        && shaped.daily?.sunrise === '2026-06-01T05:10'
        && shaped.daily?.sunset === '2026-06-01T20:35'
        && shaped.daily?.uvIndexMax === 7
        && shaped.daily?.peakAt === '2026-06-01T13:00'
        && shaped.hourly?.utcOffsetSeconds === 7200;

      const lerped = mod.interpolateAtmosphere(shaped, '2026-06-01T10:30:00.000Z');
      const nearest = mod.interpolateAtmosphere(shaped, '2026-06-02T00:00:00.000Z');
      const invalidTarget = mod.interpolateAtmosphere(shaped, 'not a date');
      const invalidTimes = mod.interpolateAtmosphere({ hourly: { time: ['bad'], uv_index: [1] } }, '2026-06-01T10:30:00.000Z');
      outcomes.interpolateAtmosphereCoversLerpNearestAndInvalid =
        Math.abs(lerped.uvIndex - 6) < 0.001
        && Math.abs(lerped.uvClearSky - 7) < 0.001
        && Math.abs(lerped.cloudCover - 15) < 0.001
        && Math.abs(lerped.temperatureC - 22) < 0.001
        && nearest.uvIndex === 7
        && invalidTarget === null
        && invalidTimes === null;
    } finally {
      window.fetch = originalFetch;
      cleanupCache();
      if (originalConfig == null) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, originalConfig);
    }

    return outcomes;
  }, { sunUrl: moduleUrl('/js/sun-uvdata.js') });

  expectAll(outcomes);
});
