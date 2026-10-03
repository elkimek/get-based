import { createExpectAll } from '../helpers/browser-outcomes.js';
import { createModuleUrl } from '../helpers/browser-module-url.js';
import { expect, test } from './coverage-fixture.js';

const moduleUrl = createModuleUrl('sunUvdataBrowserCoverage');

const expectAll = createExpectAll(expect, 'collect');

test('sun uvdata browser coverage handles config cache module API and purging', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async ({ sunUrl }) => {
    const outcomes: Record<string, unknown> = {};
    const storageKey = 'labcharts-meteo-config';
    const originalConfig = localStorage.getItem(storageKey);
    const originalEncryptionEnabled = localStorage.getItem('labcharts-encryption-enabled');
    const originalWearablesTest = (window as unknown as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST;
    const originalWarn = console.warn;
    const cleanup = () => {
      const keys: unknown[] = [];
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
      keys.forEach(key => (localStorage.removeItem as (key:unknown)=>void)(key));
    };

    try {
      cleanup();
      localStorage.removeItem('meteo-cache-v5-purged');
      localStorage.setItem('meteo:legacy-a', 'old-cache');
      localStorage.setItem('meteo:v2:old-a', 'old-version-cache');
      localStorage.setItem('meteo:v4:old-a', 'old-version-cache');
      localStorage.setItem('meteo:v5:keep-a', 'fresh-cache');

      const mod = (await import(sunUrl) as unknown) as Pick<typeof import('../../js/sun-uvdata.js'), "getMeteoConfig" | "saveMeteoConfig" | "initMeteoConfigCache" | "purgeMeteoCache" | "computeUVConfidence" | "fetchAtmosphere" | "UV_SOURCE_CONFIDENCE" | "_testShapeNoaaResponse" | "_testIsUSCoords" | "interpolateAtmosphere">;
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
      const persistedMigration = ((JSON.parse as (text: unknown) => unknown)(await cryptoStore.encryptedGetItem(storageKey)) as unknown);
      outcomes.legacyModeMigratesAndSanitizesStoredConfig =
        migrated.mode === 'auto'
        && migrated.selfhostUrl === 'https://legacy.example/uv'
        && migrated.selfhostBearer === ''
        && migrated.privacyRounding === 0.25
        && migratedEnvelope?.startsWith('d1:')
        && !migratedEnvelope.includes('legacy.example')
        && (persistedMigration as {mode: unknown}).mode === 'auto'
        && (persistedMigration as {extra: unknown}).extra === undefined;

      localStorage.setItem(storageKey, JSON.stringify({ mode: 'manual', privacyRounding: 0.1 }));
      outcomes.legacyManualModeMigratesToAuto = mod.getMeteoConfig().mode === 'auto';
      await waitForSecureConfig();

      const warnings:string[] = [];
      console.warn = (...args: unknown[]) => warnings.push(args.join(' '));
      localStorage.setItem(storageKey, JSON.stringify({
        mode: 'selfhost',
        selfhostUrl: '',
        selfhostBearer: 'secret',
        privacyRounding: 0.5,
      }));
      const emptySelfhost = mod.getMeteoConfig();
      const persistedSelfhost = ((JSON.parse as (text: unknown) => unknown)(localStorage.getItem(storageKey)) as unknown);
      outcomes.emptySelfhostFallsBackInMemoryAndWarnsOnce =
        emptySelfhost.mode === 'auto'
        && (persistedSelfhost as {mode: unknown}).mode === 'selfhost'
        && warnings.length === 1
        && warnings[0]!.includes('mode=selfhost with empty selfhostUrl');

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

      localStorage.removeItem('labcharts-encryption-enabled');
      const firstSave = mod.saveMeteoConfig({
        mode: 'selfhost',
        selfhostUrl: 'https://first.example',
        selfhostBearer: 'first-token',
        privacyRounding: 0.1,
      });
      const latestSave = mod.saveMeteoConfig({
        mode: 'selfhost',
        selfhostUrl: 'https://latest.example',
        selfhostBearer: 'latest-token',
        privacyRounding: 0.5,
      });
      const orderedSaveResults = await Promise.all([firstSave, latestSave]);
      const latestDurableRaw = localStorage.getItem(storageKey);
      const latestDurableConfig = ((JSON.parse as (text: unknown) => unknown)(await cryptoStore.encryptedGetItem(storageKey)) as unknown);

      (window as unknown as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST = true;
      localStorage.setItem('labcharts-encryption-enabled', 'true');
      await cryptoStore._setTestSessionKey(null);
      const failedSaveResult = await mod.saveMeteoConfig({
        mode: 'open-meteo',
        selfhostUrl: 'https://unsaved.example',
        selfhostBearer: 'unsaved-token',
        privacyRounding: 0,
      });
      const durableRawAfterFailure = localStorage.getItem(storageKey);
      localStorage.removeItem('labcharts-encryption-enabled');
      await mod.initMeteoConfigCache();
      outcomes.secureConfigSavesAreOrderedAndPreserveLastDurableValue =
        orderedSaveResults.every(Boolean)
        && latestDurableRaw?.startsWith('d1:') === true
        && !latestDurableRaw.includes('latest-token')
        && (latestDurableConfig as {selfhostUrl: unknown}).selfhostUrl === 'https://latest.example'
        && failedSaveResult === false
        && durableRawAfterFailure === latestDurableRaw
        && mod.getMeteoConfig().selfhostUrl === 'https://latest.example';

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
      if (originalEncryptionEnabled == null) localStorage.removeItem('labcharts-encryption-enabled');
      else localStorage.setItem('labcharts-encryption-enabled', originalEncryptionEnabled);
      if (originalWearablesTest === undefined) delete (window as unknown as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST;
      else (window as unknown as {__WEARABLES_TEST?: unknown}).__WEARABLES_TEST = originalWearablesTest;
    }

    return outcomes;
  }, { sunUrl: moduleUrl('/js/sun-uvdata.js') });

  expectAll(outcomes);
});

test('sun uvdata browser coverage drives provider chain cache stale and offline paths', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'load' });

  const outcomes = await page.evaluate(async ({ sunUrl }) => {
    const outcomes: Record<string, unknown> = {};
    const storageKey = 'labcharts-meteo-config';
    const originalConfig = localStorage.getItem(storageKey);
    const originalFetch = window.fetch;
    const originalWarn = console.warn;
    const mod = (await import(sunUrl) as unknown) as Pick<typeof import('../../js/sun-uvdata.js'), "getMeteoConfig" | "saveMeteoConfig" | "initMeteoConfigCache" | "purgeMeteoCache" | "computeUVConfidence" | "fetchAtmosphere" | "UV_SOURCE_CONFIDENCE" | "_testShapeNoaaResponse" | "_testIsUSCoords" | "interpolateAtmosphere">;
    const iso = '2026-06-01T12:30:00.000Z';
    const jsonResponse = (json: unknown, init:ResponseInit = {}) => new Response(JSON.stringify(json), {
      status: init.status || 200,
      headers: {
        'content-type': 'application/json',
        ...(init.headers || {}),
      },
    });
    const forecast = (uvIndex:number|null = 4.4, extra:{hourly?:Record<string,unknown>;daily?:Record<string,unknown>;root?:Record<string,unknown>} = {}) => ({
      utc_offset_seconds: 0,
      hourly: {
        time: ['2026-06-01T12:00'],
        uv_index: [uvIndex],
        uv_index_clear_sky: [Number.isFinite(uvIndex) ? (uvIndex as number) + 1 : uvIndex],
        cloud_cover: [20],
        temperature_2m: [22],
        ...(extra.hourly || {}),
      },
      daily: {
        time: ['2026-06-01'],
        sunrise: ['2026-06-01T05:10'],
        sunset: ['2026-06-01T20:35'],
        uv_index_max: [Number.isFinite(uvIndex) ? (uvIndex as number) + 1 : uvIndex],
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
    const saveConfig = (cfg: unknown) => mod.saveMeteoConfig({
      mode: (cfg as {mode: unknown}).mode,
      selfhostUrl: (cfg as {selfhostUrl: unknown}).selfhostUrl || '',
      selfhostBearer: (cfg as {selfhostBearer: unknown}).selfhostBearer || '',
      privacyRounding: (cfg as {privacyRounding: unknown}).privacyRounding ?? 0.1,
    });
    const cleanupCache = () => {
      const keys: unknown[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('meteo:v5:')) keys.push(key);
      }
      keys.forEach(key => (localStorage.removeItem as (key:unknown)=>void)(key));
    };

    try {
      cleanupCache();

      saveConfig({
        mode: 'selfhost',
        selfhostUrl: 'https://uvdata.example/base/',
        selfhostBearer: 'token',
      });
      const selfhostCalls:{url:string;authorization:unknown}[] = [];
      window.fetch = async (url: NonNullable<Parameters<typeof fetch>[0]>, opts: NonNullable<Parameters<typeof fetch>[1]> = {}) => {
        selfhostCalls.push({
          url: String(url),
          authorization: (opts.headers as {Authorization?:unknown}|null|undefined)?.Authorization || '',
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
        && (selfhostCalls[0] as {authorization: unknown}).authorization === 'Bearer token'
        && selfhostCalls[0]!.url.includes('latitude=90.000000')
        && selfhostCalls[0]!.url.includes('longitude=-180.000000');

      saveConfig({
        mode: 'selfhost',
        selfhostUrl: 'https://uvdata.example/base',
      });
      const fallbackCalls:string[] = [];
      window.fetch = async (url: NonNullable<Parameters<typeof fetch>[0]>) => {
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
      const rejectedSelfhostCalls:string[] = [];
      const rejectedSelfhostWarnings:string[] = [];
      console.warn = (...args: unknown[]) => rejectedSelfhostWarnings.push(args.join(' '));
      window.fetch = async (url: NonNullable<Parameters<typeof fetch>[0]>) => {
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
      window.fetch = async (url: NonNullable<Parameters<typeof fetch>[0]>) => {
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
        && (merged.airQuality as {aod: unknown})?.aod === 0.07
        && Math.abs((merged.confidence as number) - 0.65) < 0.01;

      window.fetch = async (url: NonNullable<Parameters<typeof fetch>[0]>) => {
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
        && (enhanced.fieldSources as {uvIndex: unknown})?.uvIndex === 'cams_uvbedcs+satellite_cmf'
        && ((enhanced.hourly as {uv_index_cams_total_sky: unknown})?.uv_index_cams_total_sky as unknown[])?.[0] === 6.1;

      saveConfig({ mode: 'noaa' });
      const legacyNoaaCalls:string[] = [];
      window.fetch = async (url: NonNullable<Parameters<typeof fetch>[0]>) => {
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

      const shapedNoaa = (mod._testShapeNoaaResponse as (...args:[...Parameters<typeof mod._testShapeNoaaResponse>,...ignored:unknown[]])=>ReturnType<typeof mod._testShapeNoaaResponse>)({ UVI: 6.1, ozone: 307 }, iso);
      outcomes.noaaTestHooksCoverLegacyShaperAndUsPredicate =
        shapedNoaa?.source === 'noaa_nws'
        && shapedNoaa.uvIndex === 6.1
        && shapedNoaa.ozoneDU === 307
        && shapedNoaa.confidence === mod.UV_SOURCE_CONFIDENCE.noaa_nws
        && (mod._testShapeNoaaResponse as (...args:[...Parameters<typeof mod._testShapeNoaaResponse>,...ignored:unknown[]])=>ReturnType<typeof mod._testShapeNoaaResponse>)({}, iso) === null
        && mod._testIsUSCoords(40, -100) === true
        && mod._testIsUSCoords(61, -150) === true
        && mod._testIsUSCoords(20.5, -157) === true
        && mod._testIsUSCoords(50, 14) === false;

      saveConfig({ mode: 'open-meteo' });
      cleanupCache();
      let cacheFetches = 0;
      window.fetch = async (url: NonNullable<Parameters<typeof fetch>[0]>) => {
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
        && (offline.uvIndex as number) > 10
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
    const outcomes: Record<string, unknown> = {};
    const storageKey = 'labcharts-meteo-config';
    const originalConfig = localStorage.getItem(storageKey);
    const originalFetch = window.fetch;
    const mod = (await import(sunUrl) as unknown) as Pick<typeof import('../../js/sun-uvdata.js'), "getMeteoConfig" | "saveMeteoConfig" | "initMeteoConfigCache" | "purgeMeteoCache" | "computeUVConfidence" | "fetchAtmosphere" | "UV_SOURCE_CONFIDENCE" | "_testShapeNoaaResponse" | "_testIsUSCoords" | "interpolateAtmosphere">;
    const saveOpenMeteo = () => mod.saveMeteoConfig({
      mode: 'open-meteo',
      selfhostUrl: '',
      selfhostBearer: '',
      privacyRounding: 0.1,
    });
    const cleanupCache = () => {
      const keys: unknown[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith('meteo:v5:')) keys.push(key);
      }
      keys.forEach(key => (localStorage.removeItem as (key:unknown)=>void)(key));
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
      window.fetch = async (url: NonNullable<Parameters<typeof fetch>[0]>) => new Response(JSON.stringify(
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
        && (shaped.airQuality as {surfaceOzoneUgM3: unknown})?.surfaceOzoneUgM3 === 80
        && (shaped.airQuality as {european_aqi: unknown})?.european_aqi === 2
        && (shaped.daily as {sunrise: unknown})?.sunrise === '2026-06-01T05:10'
        && (shaped.daily as {sunset: unknown})?.sunset === '2026-06-01T20:35'
        && (shaped.daily as {uvIndexMax?:unknown}|null|undefined)?.uvIndexMax === 7
        && (shaped.daily as {peakAt?:unknown}|null|undefined)?.peakAt === '2026-06-01T13:00'
        && (shaped.hourly as {utcOffsetSeconds: unknown})?.utcOffsetSeconds === 7200;

      const lerped = (mod.interpolateAtmosphere as (data:Record<string,unknown>|null|undefined,time:Parameters<typeof mod.interpolateAtmosphere>[1])=>ReturnType<typeof mod.interpolateAtmosphere>)(shaped, '2026-06-01T10:30:00.000Z');
      const nearest = (mod.interpolateAtmosphere as (data:Record<string,unknown>|null|undefined,time:Parameters<typeof mod.interpolateAtmosphere>[1])=>ReturnType<typeof mod.interpolateAtmosphere>)(shaped, '2026-06-02T00:00:00.000Z');
      const invalidTarget = (mod.interpolateAtmosphere as (data:Record<string,unknown>|null|undefined,time:Parameters<typeof mod.interpolateAtmosphere>[1])=>ReturnType<typeof mod.interpolateAtmosphere>)(shaped, 'not a date');
      const invalidTimes = (mod.interpolateAtmosphere as (data:Record<string,unknown>|null|undefined,time:Parameters<typeof mod.interpolateAtmosphere>[1])=>ReturnType<typeof mod.interpolateAtmosphere>)({ hourly: { time: ['bad'], uv_index: [1] } }, '2026-06-01T10:30:00.000Z');
      outcomes.interpolateAtmosphereCoversLerpNearestAndInvalid =
        Math.abs(lerped!.uvIndex! - 6) < 0.001
        && Math.abs(lerped!.uvClearSky! - 7) < 0.001
        && Math.abs(lerped!.cloudCover! - 15) < 0.001
        && Math.abs(lerped!.temperatureC! - 22) < 0.001
        && nearest!.uvIndex === 7
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
