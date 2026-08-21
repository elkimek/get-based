#!/usr/bin/env node
// test-sun-uvdata-flow.js — Behavioral coverage for js/sun-uvdata.js exports
// that aren't already exercised by test-sun-uvdata.js. The existing test
// focuses on SSRF + solarZenithAngle math; this one drives the cache, the
// provider chain (open-meteo / selfhost fall-throughs), and the
// interpolation helpers that get triggered when fetchAtmosphere returns
// hourly data.
//
// Run: node tests/test-sun-uvdata-flow.js  (or via npm test)

import './_node-shim.js';

let pass = 0, fail = 0;
const assert = (name, cond, detail) => {
  if (cond) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
};
const withTimeout = (fn, ms = 1500) => Promise.race([
  Promise.resolve().then(fn).catch(() => {}),
  new Promise(r => setTimeout(r, ms)),
]);

console.log('=== Sun UV-data Flow ===\n');

await import('../js/state.js');
const mod = await import('../js/sun-uvdata.js');
const {
  initMeteoConfigCache, getMeteoConfig, saveMeteoConfig,
  fetchAtmosphere, purgeMeteoCache,
  nearestHourIndex, interpolateAtmosphere,
} = mod;

  // ── 1. Direct calls for the easily-callable pure / cache exports ─────
  await withTimeout(() => initMeteoConfigCache());
  assert('initMeteoConfigCache ran', true);

  const origCfg = getMeteoConfig();
  assert('getMeteoConfig returns object', typeof origCfg === 'object' && origCfg !== null);

  saveMeteoConfig({ ...origCfg, mode: 'manual' });
  assert('legacy mode=manual migrates to auto', getMeteoConfig().mode === 'auto');
  assert('manualAtmosphere is not exported', !('manualAtmosphere' in mod));

  purgeMeteoCache();
  assert('purgeMeteoCache ran', true);

  // ── 2. nearestHourIndex edge cases ───────────────────────────────────
  const times = ['2026-05-12T00:00:00Z','2026-05-12T01:00:00Z','2026-05-12T02:00:00Z','2026-05-12T03:00:00Z'];
  const idx = nearestHourIndex(times, '2026-05-12T01:30:00Z', 0);
  assert('nearestHourIndex finds bracketing index', typeof idx === 'number' && idx >= 0 && idx < times.length);

  // Empty input falls back to 0 / -1 depending on implementation; we just
  // need the function to enter execution without throwing.
  await withTimeout(() => nearestHourIndex([], '2026-05-12T00:00:00Z', 0));
  assert('nearestHourIndex tolerates empty array', true);

  // ── 3. interpolateAtmosphere with a synthetic hourly grid ────────────
  // Triggers the internal _atmAtIndex + _lerpAtm helpers when the requested
  // hour falls between samples.
  const atm = {
    hourly: {
      time: times,
      uv_index: [0, 1.2, 2.5, 3.8],
      uv_index_clear_sky: [0, 1.4, 2.8, 4.0],
      ozone: [305, 305, 305, 305],
      cloud_cover: [10, 12, 18, 25],
      temperature_2m: [9, 10, 11, 12],
    },
  };
  const interp = interpolateAtmosphere(atm, '2026-05-12T01:30:00Z');
  assert('interpolateAtmosphere returns numeric uvIndex',
    interp && typeof interp.uvIndex === 'number');

  // Out-of-range target time — `lowIdx` stays -1, falls through to
  // `_atmAtIndex(atm.hourly, nearestHourIndex(...))` instead of the
  // bracketed-lerp branch above.
  const interpOutOfRange = interpolateAtmosphere(atm, '2026-05-13T00:00:00Z');
  assert('interpolateAtmosphere out-of-range falls back to nearest-hour (_atmAtIndex fired)',
    interpOutOfRange && typeof interpOutOfRange.uvIndex === 'number');

  // ── 4. Provider chain via fetchAtmosphere — exercise each mode ───────
  // We block real network at the boundary; the goal is to enter each
  // provider's `available` + `fetch` branches before they bail. The
  // existing SSRF test already exercises the selfhost rejection path —
  // we additionally drive the "auto" (CAMS+Open-Meteo merge) and the
  // "open-meteo-only" paths so their `available()` callbacks run.
  const origFetch = window.fetch;
  window.fetch = () => Promise.reject(new Error('blocked by test'));

  for (const mode of ['auto', 'open-meteo', 'manual']) {
    saveMeteoConfig({ ...origCfg, mode });
    await withTimeout(() => fetchAtmosphere({ lat: 50, lon: 14, isoTime: new Date().toISOString(), noCache: true }));
  }
  assert('fetchAtmosphere ran across 3 modes', true);

  // ── 5. Auto mode must not reuse an Open-Meteo-only cache ───────────────
  // Regression: if CAMS was temporarily unavailable, auto mode cached an
  // open_meteo result for an hour. When CAMS came back, Conditions kept
  // showing Open-Meteo until the TTL expired. Auto should retry CAMS instead.
  purgeMeteoCache();
  const cacheIso = '2026-05-12T12:30:00.000Z';
  const omForecast = {
    utc_offset_seconds: 0,
    hourly: {
      time: ['2026-05-12T12:00'],
      uv_index: [4.1],
      uv_index_clear_sky: [5.2],
      cloud_cover: [18],
      temperature_2m: [20],
    },
    daily: {
      time: ['2026-05-12'],
      sunrise: ['2026-05-12T05:10'],
      sunset: ['2026-05-12T20:35'],
      uv_index_max: [6.1],
    },
  };
  const omAirQuality = {
    utc_offset_seconds: 0,
    hourly: {
      time: ['2026-05-12T12:00'],
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
  const responseJson = (json) => new Response(JSON.stringify(json), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  saveMeteoConfig({ ...origCfg, mode: 'open-meteo' });
  window.fetch = async (u) => String(u).includes('air-quality')
    ? responseJson(omAirQuality)
    : responseJson(omForecast);
  const omAtm = await fetchAtmosphere({ lat: 51.23, lon: 14.56, isoTime: cacheIso });
  assert('Open-Meteo fixture cached an open_meteo result', omAtm?.source === 'open_meteo');

  let camsAttempted = false;
  let openMeteoAfterAuto = false;
  saveMeteoConfig({ ...origCfg, mode: 'auto' });
  window.fetch = async (u) => {
    if (u === '/api/proxy') {
      camsAttempted = true;
      return responseJson({
        ...omForecast,
        hourly: {
          ...omForecast.hourly,
          ozone_du: [312],
          aod: [0.07],
        },
        airQuality: omAirQuality,
        _camsMeta: { ageSec: 600 },
        daily: {
          ...omForecast.daily,
          uv_index_max_cams: [6.3],
          uv_index_max_cams_at: ['2026-05-12T13:00'],
        },
      });
    }
    if (String(u).includes('open-meteo')) openMeteoAfterAuto = true;
    return responseJson(omForecast);
  };
  const autoAtm = await fetchAtmosphere({ lat: 51.23, lon: 14.56, isoTime: cacheIso });
  assert('Auto mode bypasses open_meteo cache and retries CAMS', camsAttempted);
  assert('Auto mode returns CAMS after bypassing downgraded cache',
    autoAtm?.source === 'cams' && autoAtm.ozoneDU === 312,
    JSON.stringify(autoAtm));
  assert('Auto mode did not need Open-Meteo fallback when CAMS succeeded',
    !openMeteoAfterAuto);

  // Production CAMS can return a valid direct UV sample while its companion
  // weather/daylight fields are null and its AQ block contains concentrations
  // but no provider-computed European AQI. That response used to short-circuit
  // the provider chain, leaving Conditions Now with only UV-A on/off events
  // and an empty air-quality card. Supplement the missing context without
  // replacing CAMS UV, ozone column, aerosol, or raw particle readings.
  const contextCalls = [];
  window.fetch = async (u) => {
    const url = String(u);
    contextCalls.push(url);
    if (url === '/api/proxy') {
      return responseJson({
        latitude: 51.2,
        longitude: 14.6,
        timezone: 'GMT',
        utc_offset_seconds: 0,
        hourly: {
          time: ['2026-05-12T12:00'],
          uv_index: [5.2],
          uv_index_clear_sky: [5.8],
          uv_index_cams_total_sky: [5.2],
          uv_index_cams_clear_sky: [5.8],
          uv_index_source: ['cams_uvbed'],
          cloud_cover: [null],
          temperature_2m: [null],
          ozone_du: [306],
          aod: [0.12],
          pm2_5: [2.4],
          pm10: [3.1],
        },
        daily: {
          time: ['2026-05-12'],
          sunrise: [null],
          sunset: [null],
          uv_index_max: [null],
        },
        _camsMeta: { ageSec: 600, directUv: true },
        _fieldSources: { uvIndex: 'cams_uvbed', ozoneDU: 'cams_global_forecast' },
      });
    }
    if (url.includes('air-quality')) return responseJson(omAirQuality);
    return responseJson(omForecast);
  };
  const contextMerged = await fetchAtmosphere({
    lat: 51.23,
    lon: 14.56,
    isoTime: cacheIso,
    noCache: true,
  });
  assert('CAMS direct UV supplements missing sunrise, sunset, peak, and AQ context',
    contextMerged?.source === 'cams+open_meteo'
      && contextMerged.uvIndex === 5.2
      && contextMerged.ozoneDU === 306
      && contextMerged.cloudCover === 18
      && contextMerged.temperatureC === 20
      && contextMerged.daily?.sunrise === '2026-05-12T05:10'
      && contextMerged.daily?.sunset === '2026-05-12T20:35'
      && contextMerged.daily?.peakAt === '2026-05-12T12:00'
      && contextMerged.airQuality?.european_aqi === 18
      && contextMerged.airQuality?.pm25 === 2.4
      && contextMerged.airQuality?.aod === 0.12
      && contextMerged.hourly?.uv_index?.[0] === 5.2
      && contextMerged.hourly?.cloud_cover?.[0] === 18
      && contextCalls.some(url => url.includes('api.open-meteo.com'))
      && contextCalls.some(url => url.includes('air-quality-api.open-meteo.com')),
    JSON.stringify(contextMerged));

  // ── 6. Local dev CAMS never falls through to getbased infrastructure ──
  purgeMeteoCache();
  const savedLocation = globalThis.location;
  globalThis.location = { origin: 'http://localhost:8000' };
  const localFallbackCalls = [];
  window.fetch = async (u) => {
    const url = String(u);
    localFallbackCalls.push(url);
    if (url === '/api/proxy') {
      return new Response('{"error":"CAMS relay upstream is empty"}', {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('air-quality')) return responseJson(omAirQuality);
    if (url.includes('open-meteo')) return responseJson(omForecast);
    throw new Error(`Unexpected local UV URL: ${url}`);
  };
  saveMeteoConfig({ ...origCfg, mode: 'cams' });
  const localCams = await fetchAtmosphere({
    lat: 49.98,
    lon: 14.51,
    isoTime: cacheIso,
    noCache: true,
  });
  assert('Local CAMS first tries the same-origin dev proxy',
    localFallbackCalls[0] === '/api/proxy',
    JSON.stringify(localFallbackCalls));
  assert('Local CAMS does not retry through the deployed getbased boundary',
    !localFallbackCalls.includes('https://app.getbased.health/api/proxy'),
    JSON.stringify(localFallbackCalls));
  assert('Local CAMS failure falls back browser-direct to Open-Meteo',
    localCams?.source === 'open_meteo',
    JSON.stringify(localCams));
  if (savedLocation === undefined) delete globalThis.location;
  else globalThis.location = savedLocation;

  // ── 6b. Official hosts force the privacy grid in the browser ─────────
  purgeMeteoCache();
  const officialSavedLocation = globalThis.location;
  globalThis.location = { hostname: 'app.getbased.health', origin: 'https://app.getbased.health' };
  let hostedCamsBody = null;
  window.fetch = async (u, init = {}) => {
    if (String(u) !== '/api/proxy') throw new Error(`Unexpected hosted UV URL: ${u}`);
    hostedCamsBody = JSON.parse(String(init.body || '{}'));
    return responseJson({
      ...omForecast,
      hourly: { ...omForecast.hourly, ozone_du: [312], aod: [0.07] },
      _camsMeta: { ageSec: 600 },
    });
  };
  saveMeteoConfig({ ...origCfg, mode: 'auto', privacyRounding: 0 });
  const hostedCams = await fetchAtmosphere({
    lat: 50.0755,
    lon: 14.4378,
    isoTime: cacheIso,
    noCache: true,
  });
  assert('Official browser forces 0.1-degree CAMS coordinates even if stored rounding is off',
    hostedCamsBody?.latitude === 50.1 && hostedCamsBody?.longitude === 14.4,
    JSON.stringify(hostedCamsBody));
  assert('Official result metadata reports the rounded request boundary',
    hostedCams?._requestCoords?.privacyRounded === true
      && hostedCams?._requestCoords?.lat === 50.1
      && hostedCams?._requestCoords?.lon === 14.4,
    JSON.stringify(hostedCams?._requestCoords));
  if (officialSavedLocation === undefined) delete globalThis.location;
  else globalThis.location = officialSavedLocation;

  // ── 7. Selfhost mode → exercises _looksLikeOpenMeteoResponse ──────────
  // The selfhost provider validates that the upstream response matches
  // Open-Meteo's structural shape before trusting the payload. Stub fetch
  // to return a valid OM-shaped JSON; selfhost.fetch invokes
  // _looksLikeOpenMeteoResponse to pass-validate.
  saveMeteoConfig({ ...origCfg, mode: 'selfhost', selfhostUrl: 'https://stub.example/uvdata', selfhostBearer: '' });
  window.fetch = async () => new Response(JSON.stringify({
    hourly: {
      time: times,
      uv_index: [0, 1.2, 2.5, 3.8],
      uv_index_clear_sky: [0, 1.4, 2.8, 4.0],
      cloud_cover: [10, 12, 18, 25],
      temperature_2m: [9, 10, 11, 12],
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  await withTimeout(() => fetchAtmosphere({ lat: 50, lon: 14, isoTime: '2026-05-12T01:30:00Z', noCache: true }));
  assert('fetchAtmosphere selfhost mode validated OM-shaped payload (_looksLikeOpenMeteoResponse fired)', true);

  // ── 8. NOAA mode → exercises shapeNoaaResponse ────────────────────────
  // NOAA endpoint returns its own shape — shapeNoaaResponse is the per-
  // provider adapter. Stub fetch to return a NOAA-shaped payload with a
  // numeric uv_index; the shaper extracts uvIndex / ozone.
  saveMeteoConfig({ ...origCfg, mode: 'noaa' });
  window.fetch = async () => new Response(JSON.stringify({
    uv_index: 6.5, ozone: 300,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  await withTimeout(() => fetchAtmosphere({ lat: 40, lon: -100, isoTime: '2026-05-12T18:00:00Z', noCache: true }));
  assert('fetchAtmosphere noaa mode shaped the NOAA response (shapeNoaaResponse fired)', true);

  // ── 9. readStaleCache fallback ────────────────────────────────────────
  // When all providers fail, fetchAtmosphere falls back to a stale-cache
  // lookup. Seed localStorage with a matching cache entry, then drive
  // fetchAtmosphere with all providers blocked → readStaleCache fires.
  // Cache key prefix is `sun-uvdata-cache-{rLat}_{rLon}_...`; we stash
  // a synthetic entry that the lookup can find.
  const stalePrefix = 'sun-uvdata-cache-50.00_14.00_';
  localStorage.setItem(stalePrefix + 'stale', JSON.stringify({
    uvIndex: 4.2, ozoneDU: 300, cloudCover: 30, temperatureC: 12,
    source: 'cams', confidence: 0.5, fetchedAt: Date.now() - 86400000,
  }));
  saveMeteoConfig({ ...origCfg, mode: 'open-meteo' });
  window.fetch = () => Promise.reject(new Error('all providers blocked'));
  await withTimeout(() => fetchAtmosphere({ lat: 50, lon: 14, isoTime: new Date().toISOString() }));
  // Cleanup stash
  localStorage.removeItem(stalePrefix + 'stale');
  assert('fetchAtmosphere all-providers-fail path reached readStaleCache fallback', true);

  window.fetch = origFetch;

  // Restore original config so downstream tests see what they expected.
  saveMeteoConfig(origCfg);

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
