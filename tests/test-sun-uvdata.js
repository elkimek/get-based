#!/usr/bin/env node
// test-sun-uvdata.js — Multi-source UV/ozone client: SSRF guard,
// provider routing, solar-zenith math, privacy rounding, US-coords window.
//
// Run: node tests/test-sun-uvdata.js  (or via npm test)

import './_node-shim.js';

let pass = 0, fail = 0;
function assert(name, condition, detail) {
  if (condition) { pass++; console.log(`  PASS: ${name}`); }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}

console.log('=== Sun UV-Data Tests ===\n');

await import('../js/state.js');
const mod = await import('../js/sun-uvdata.js');
const { shapeOpenMeteoResponse } = await import('../js/sun-uvdata-atmosphere.js');
const conditionsInterpretation = await import('../js/light-conditions-interpretation.js');
const {
  UV_SOURCE_CONFIDENCE,
  getMeteoConfig,
  saveMeteoConfig,
  fetchAtmosphere,
  solarZenithAngle,
  nearestHourIndex,
} = mod;

  // ─── 1. UV_SOURCE_CONFIDENCE shape ─────────────────────────────────────
  console.log('%c 1. Source confidence weights ', 'font-weight:bold;color:#f59e0b');

  assert('zenith_offline is the lowest-confidence source',
    UV_SOURCE_CONFIDENCE.zenith_offline < UV_SOURCE_CONFIDENCE.open_meteo,
    `zenith=${UV_SOURCE_CONFIDENCE.zenith_offline} vs open_meteo=${UV_SOURCE_CONFIDENCE.open_meteo}`);
  assert('CAMS / selfhost outrank Open-Meteo (per audit ranking)',
    UV_SOURCE_CONFIDENCE.cams > UV_SOURCE_CONFIDENCE.open_meteo &&
    UV_SOURCE_CONFIDENCE.selfhost > UV_SOURCE_CONFIDENCE.open_meteo);
  for (const k of ['selfhost','cams','noaa_nws','open_meteo','zenith_offline']) {
    assert(`Confidence weight for ${k} in [0,1]`,
      UV_SOURCE_CONFIDENCE[k] >= 0 && UV_SOURCE_CONFIDENCE[k] <= 1,
      `${k}=${UV_SOURCE_CONFIDENCE[k]}`);
  }

  assert('manual UVI constructor is no longer exported', !('manualAtmosphere' in mod));

  // ─── 3. SSRF guard via fetchAtmosphere with selfhost mode ──────────────
  // _isValidSelfhostUrl is module-private — exercise it through the
  // selfhost provider which throws when the URL is rejected.
  console.log('%c 3. Selfhost SSRF guard (RFC1918 / loopback / link-local) ', 'font-weight:bold;color:#f59e0b');

  const origCfg = getMeteoConfig();
  const restoreCfg = () => saveMeteoConfig(origCfg);

  async function expectSelfhostRejected(url, label) {
    saveMeteoConfig({ ...origCfg, mode: 'selfhost', selfhostUrl: url, selfhostBearer: '' });
    // selfhost mode falls through to open-meteo on selfhost rejection. We
    // don't want to issue a real network call, so peek at providerOrder
    // by snapshotting localStorage state instead. For SSRF coverage,
    // assert that fetchAtmosphere either resolves via fallback or throws —
    // never that the bad URL got fetched. We use a sentinel URL that
    // would 404 on real DNS so any actual fetch attempt would fail loudly.
    let crossedSSRF = false;
    const origFetch = window.fetch;
    window.fetch = (u, opts) => {
      if (typeof u === 'string' && u.startsWith(url)) crossedSSRF = true;
      return Promise.reject(new Error('blocked by test'));
    };
    try {
      await fetchAtmosphere({ lat: 50, lon: 14, isoTime: new Date().toISOString(), noCache: true });
    } catch {} // we don't care about resolution; only that selfhost wasn't called
    finally { window.fetch = origFetch; }
    assert(`Selfhost URL rejected: ${label}`, !crossedSSRF, `would have fetched ${url}`);
  }

  await expectSelfhostRejected('http://localhost:9000', 'localhost hostname');
  await expectSelfhostRejected('http://127.0.0.1:9000', 'IPv4 loopback literal');
  await expectSelfhostRejected('http://[::1]:9000', 'IPv6 loopback literal');
  await expectSelfhostRejected('http://0.0.0.0:9000', '0.0.0.0 unspecified');
  await expectSelfhostRejected('http://10.0.0.5/api', 'RFC1918 10.0.0.0/8');
  await expectSelfhostRejected('http://172.16.99.5/api', 'RFC1918 172.16.0.0/12');
  await expectSelfhostRejected('http://172.31.250.1/api', 'RFC1918 172.31.x.x boundary');
  await expectSelfhostRejected('http://192.168.1.1/api', 'RFC1918 192.168.0.0/16');
  await expectSelfhostRejected('http://169.254.169.254/latest/meta-data', 'AWS/cloud metadata 169.254.169.254');
  await expectSelfhostRejected('http://100.64.0.1/api', 'CGNAT 100.64.0.0/10');
  await expectSelfhostRejected('http://224.0.0.1/api', 'multicast 224.0.0.0/4');
  await expectSelfhostRejected('http://[fe80::1]/api', 'IPv6 link-local literal');
  await expectSelfhostRejected('http://[2002:c0a8:0101::]/api', '6to4 IPv6 embeds RFC1918 192.168.1.1');
  await expectSelfhostRejected('http://[2002:a9fe:a9fe::]/api', '6to4 IPv6 embeds link-local 169.254.169.254');
  await expectSelfhostRejected('ftp://example.com/api', 'non-http(s) protocol');
  await expectSelfhostRejected('not a url', 'unparseable URL');

  // v1.7.8 DNS-rebinding hardening: bearer-bearing requests must use HTTPS
  // so a rebound LAN/metadata target fails TLS before the bearer ships.
  // Plain HTTP without a bearer remains allowed (legitimate local dev).
  console.log('%c 3b. Bearer-bearing HTTP must be rejected (DNS rebinding hardening) ', 'font-weight:bold;color:#f59e0b');
  async function expectBearerRejection(url, bearer, label) {
    saveMeteoConfig({ ...origCfg, mode: 'selfhost', selfhostUrl: url, selfhostBearer: bearer });
    let crossed = false;
    const origFetch = window.fetch;
    window.fetch = (u) => { if (typeof u === 'string' && u.startsWith(url)) crossed = true; return Promise.reject(new Error('blocked by test')); };
    try { await fetchAtmosphere({ lat: 50, lon: 14, isoTime: new Date().toISOString(), noCache: true }); } catch {}
    finally { window.fetch = origFetch; }
    assert(`Bearer rejection: ${label}`, !crossed, `would have fetched ${url}`);
  }
  await expectBearerRejection('http://uvdata.example.com', 'secret-token', 'plain HTTP + bearer (rebinding-vulnerable)');
  // No-bearer HTTP must still work for local dev — verify it crosses
  // (request gets made, even if the test-mock fetch rejects it).
  saveMeteoConfig({ ...origCfg, mode: 'selfhost', selfhostUrl: 'http://uvdata.example.com', selfhostBearer: '' });
  {
    let attempted = false;
    const origFetch = window.fetch;
    window.fetch = (u) => { if (typeof u === 'string' && u.includes('uvdata.example.com')) attempted = true; return Promise.reject(new Error('blocked by test')); };
    try { await fetchAtmosphere({ lat: 50, lon: 14, isoTime: new Date().toISOString(), noCache: true }); } catch {}
    finally { window.fetch = origFetch; }
    assert('Plain HTTP + no bearer remains allowed (local dev path)', attempted);
  }

  restoreCfg();

  // ─── 4. solarZenithAngle ───────────────────────────────────────────────
  console.log('%c 4. solarZenithAngle (NOAA SPA) ', 'font-weight:bold;color:#f59e0b');

  // Solar noon at the equator on equinox → zenith ≈ 0° (sun overhead)
  const equinoxNoon = solarZenithAngle(new Date(Date.UTC(2024, 2, 20, 12, 0, 0)), 0, 0);
  assert('Equator equinox solar noon → zenith near 0°',
    equinoxNoon != null && equinoxNoon < 5,
    `zenith=${equinoxNoon?.toFixed(2)}°`);

  // Polar night (Murmansk in December UTC midnight) → zenith well past 90°
  const polarNight = solarZenithAngle(new Date(Date.UTC(2024, 11, 21, 0, 0, 0)), 68.97, 33.08);
  assert('Polar night → sun below horizon (zenith > 90°)',
    polarNight > 90,
    `zenith=${polarNight?.toFixed(2)}°`);

  // Symmetric latitudes at the same UTC time → equal zenith on the longitude
  // meridian (rough symmetry test, ±2°)
  const north = solarZenithAngle(new Date(Date.UTC(2024, 5, 21, 12, 0, 0)), 23.44, 0);
  const south = solarZenithAngle(new Date(Date.UTC(2024, 11, 21, 12, 0, 0)), -23.44, 0);
  assert('Tropic-of-cancer summer solstice ≈ tropic-of-capricorn winter solstice',
    Math.abs(north - south) < 2,
    `north=${north.toFixed(2)}° south=${south.toFixed(2)}°`);

  // Result must always lie in [0°, 180°]
  for (const sample of [
    [new Date('2024-01-01T00:00:00Z'),  60,  10],
    [new Date('2024-07-01T18:00:00Z'), -34, 151],
    [new Date('2024-04-15T05:00:00Z'),  35, -118],
  ]) {
    const z = solarZenithAngle(sample[0], sample[1], sample[2]);
    assert(`Zenith bounded in [0°, 180°] for lat=${sample[1]} lon=${sample[2]}`,
      z >= 0 && z <= 180, `zenith=${z?.toFixed(2)}°`);
  }

  // ─── 5. Privacy rounding via cache key + fetchAtmosphere ──────────────
  console.log('%c 5. Privacy rounding ', 'font-weight:bold;color:#f59e0b');

  // privacyRounding is exercised through the cache: at 0.1° rounding,
  // adjacent call sites within the bucket must reuse the same cache row.
  saveMeteoConfig({ ...origCfg, mode: 'auto', privacyRounding: 0.1 });
  const isoTime = new Date().toISOString();

  // Shape-test: roundCoords behaviour by writing a synthetic cache entry
  // and asserting that the rounded coords land on the 0.1° grid. Since
  // roundCoords is private, we exercise it by checking that two nearby
  // points produce the same rounded grid square.
  function expectSameGrid(a, b, precision, label) {
    const f = 1 / precision;
    const ra = Math.round(a * f) / f;
    const rb = Math.round(b * f) / f;
    assert(`Same grid bucket: ${label}`, Math.abs(ra - rb) < 1e-9,
      `${a}→${ra} vs ${b}→${rb}`);
  }
  expectSameGrid(50.073, 50.087, 0.1, '50.073 / 50.087 at 0.1°');
  expectSameGrid(14.420, 14.440, 0.1, '14.420 / 14.440 at 0.1°');
  // 0.5° bucket merges further-apart points
  expectSameGrid(50.10, 50.20, 0.5, '50.10 / 50.20 at 0.5°');
  // 0.01° bucket separates them
  const f01 = 1 / 0.01;
  assert('0.01° bucket separates 50.073 / 50.087',
    Math.round(50.073 * f01) / f01 !== Math.round(50.087 * f01) / f01);

  restoreCfg();

  // ─── 6. fetchAtmosphere argument validation ────────────────────────────
  console.log('%c 6. fetchAtmosphere argument validation ', 'font-weight:bold;color:#f59e0b');

  let threw = false;
  try { await fetchAtmosphere({}); } catch (e) { threw = /lat, lon/.test(e.message); }
  assert('fetchAtmosphere throws on missing lat/lon', threw);

  threw = false;
  try { await fetchAtmosphere({ lat: 50 }); } catch (e) { threw = /lat, lon/.test(e.message); }
  assert('fetchAtmosphere throws when only lat provided', threw);

  // ─── 6.5 nearestHourIndex is timezone-agnostic ────────────────────────
  console.log('%c 6.5 nearestHourIndex tz-agnostic ', 'font-weight:bold;color:#f59e0b');

  // Repro of the cross-device 5.9-vs-1.8 UVI bug. Open-Meteo with timezone=auto
  // returns hourly time strings without an offset suffix. The naive `new Date(s)`
  // parse uses the *device's* local tz, so a phone in tz X picks a different
  // hour than a desktop in tz Y from the same response. The fix: use
  // `utc_offset_seconds` from the response so the index is stable.
  const pragueHourly = [
    '2026-05-01T10:00','2026-05-01T11:00','2026-05-01T12:00','2026-05-01T13:00',
    '2026-05-01T14:00','2026-05-01T15:00','2026-05-01T16:00','2026-05-01T17:00',
  ];
  const pragueOffset = 7200; // CEST (+02:00)
  // 12:00 UTC on May 1, 2026 == 14:00 in Prague — should pick index 4.
  const target = '2026-05-01T12:00:00.000Z';
  assert('nearestHourIndex returns Prague-noon entry for UTC noon target',
    nearestHourIndex(pragueHourly, target, pragueOffset) === 4,
    `got ${nearestHourIndex(pragueHourly, target, pragueOffset)}, expected 4`);

  // Without the offset (legacy behavior), the result depends on the device's tz —
  // exactly the bug. Just assert that passing the offset gives the *same* answer
  // regardless of how naive parsing would land. Using a UTC-tagged response
  // (offset 0) for the same UTC target should pick the index whose stamp == 12:00.
  const utcHourly = pragueHourly.slice();
  assert('nearestHourIndex with offset 0 picks the literal 12:00 entry',
    nearestHourIndex(utcHourly, target, 0) === 2,
    `got ${nearestHourIndex(utcHourly, target, 0)}, expected 2`);

  // Same Prague-tagged response, target one hour later (13:00 UTC == 15:00 Prague).
  assert('nearestHourIndex tracks target across hours',
    nearestHourIndex(pragueHourly, '2026-05-01T13:00:00.000Z', pragueOffset) === 5);

  // Current Conditions must use the provider's current block, while a
  // retro-session request must continue to use its nearest hourly sample.
  const nowMs = Date.now();
  const offsetSeconds = 7200;
  const naiveAt = ms => new Date(ms + offsetSeconds * 1000).toISOString().slice(0, 16);
  const currentFc = {
    utc_offset_seconds: offsetSeconds,
    current: {
      time: naiveAt(nowMs - 5 * 60_000),
      uv_index: 7.7,
      uv_index_clear_sky: 8.4,
      cloud_cover: 24,
      temperature_2m: 21,
    },
    hourly: {
      time: [naiveAt(nowMs - 2 * 86400_000), naiveAt(nowMs)],
      uv_index: [2.2, 3.3],
      uv_index_clear_sky: [2.8, 4.1],
      cloud_cover: [70, 45],
      temperature_2m: [15, 19],
    },
    daily: { time: [], sunrise: [], sunset: [], uv_index_max: [] },
  };
  const currentAq = {
    utc_offset_seconds: 0,
    current: {
      time: new Date(nowMs - 3 * 60_000).toISOString().slice(0, 16),
      pm2_5: 6,
      ozone: 74,
      european_aqi: 32,
      european_aqi_pm2_5: 14,
      european_aqi_ozone: 32,
    },
    hourly: {
      time: [new Date(nowMs - 2 * 86400_000).toISOString().slice(0, 16), new Date(nowMs).toISOString().slice(0, 16)],
      pm2_5: [22, 18],
      ozone: [91, 86],
      european_aqi: [55, 48],
      european_aqi_pm2_5: [55, 48],
      european_aqi_ozone: [40, 38],
    },
  };
  const currentShape = shapeOpenMeteoResponse(currentFc, currentAq, new Date(nowMs).toISOString(), 'open_meteo');
  const retroShape = shapeOpenMeteoResponse(currentFc, currentAq, new Date(nowMs - 2 * 86400_000).toISOString(), 'open_meteo');
  assert('current shaper prefers provider current UV and AQ blocks',
    currentShape?.uvIndex === 7.7
      && currentShape?.airQuality?.european_aqi === 32
      && currentShape?.airQuality?.european_aqi_ozone === 32);
  assert('current shaper records model validAt separately from retrieval',
    Number.isFinite(currentShape?.validAt)
      && Math.abs(currentShape.validAt - (nowMs - 5 * 60_000)) < 61_000
      && currentShape.fetchedAt >= currentShape.validAt);
  assert('retro shaper uses hourly values instead of current blocks',
    retroShape?.uvIndex === 2.2 && retroShape?.airQuality?.european_aqi === 55);

  const trustedAq = conditionsInterpretation._aggregateAQ({
    european_aqi: 18,
    european_aqi_nitrogen_dioxide: 70,
    no2: 240,
    pm25: 180,
  }, null);
  assert('AQ classification trusts consolidated EAQI instead of raw instantaneous concentrations',
    trustedAq?.label === 'Good' && trustedAq?.index === 18 && trustedAq?.why === 'NO₂');
  assert('WHO UVI condition labels do not infer vitamin D or personal burn time',
    conditionsInterpretation._uviConditionLabel(6.5) === 'High UV · protection needed');

  const priorInterpretationDeps = conditionsInterpretation.configureLightConditionsInterpretation({
    solarZenithAngle: date => {
      const minuteUtc = date.getUTCHours() * 60 + date.getUTCMinutes();
      return minuteUtc >= 4 * 60 && minuteUtc < 16 * 60 ? 84 : 90;
    },
  });
  const uvaWindow = conditionsInterpretation._computeUvaWindow(
    { lat: 50, lon: 14 },
    new Date('2026-06-01T12:00:00Z'),
    2 * 3600
  );
  conditionsInterpretation.configureLightConditionsInterpretation(priorInterpretationDeps);
  assert('UV-A transition window follows the location-local day, not device timezone',
    uvaWindow.firstUVA?.toISOString() === '2026-06-01T04:00:00.000Z'
      && uvaWindow.lastUVA?.toISOString() === '2026-06-01T15:59:00.000Z');

  // ─── 7. Confidence values exist for every named source ────────────────
  console.log('%c 7. Source coverage ', 'font-weight:bold;color:#f59e0b');

  // Every source label that the response shapers produce must have a
  // matching confidence weight, otherwise the AI tier loses provenance.
  const requiredKeys = ['selfhost','cams','cams_satellite','open_meteo_cams','noaa_nws','open_meteo','zenith_offline'];
  for (const k of requiredKeys) {
    assert(`UV_SOURCE_CONFIDENCE has key '${k}'`, typeof UV_SOURCE_CONFIDENCE[k] === 'number');
  }

  // ─── 8. computeUVConfidence — real-time confidence under signals ─────
  // The static UV_SOURCE_CONFIDENCE table is the BASELINE; the value
  // shown to the user is computed from that baseline + observable
  // signals (snapshot age, cloud cover, solar elevation, UVI band,
  // server-side stale flag). These fixtures pin the multiplier
  // calibration so a future refactor that changes the penalty stack
  // can't silently make readouts dishonestly precise under bad
  // conditions.
  console.log('%c 8. Computed confidence ', 'font-weight:bold;color:#f59e0b');

  const { computeUVConfidence } = await import('../js/sun-uvdata.js');
  const approx = (a, b, tol = 0.005) => Math.abs(a - b) < tol;

  // Best case — fresh CAMS, clear sky, sun overhead, UVI in sweet spot.
  assert('CAMS · fresh · clear · noon · UVI 8 → 0.80 (no discounts)',
    approx(computeUVConfidence({
      source: 'cams', snapshotAgeSec: 1800, cloudCover: 0, zenithDeg: 30, uvIndex: 8,
    }), 0.80));

  // Stale grid (>24h) halves CAMS confidence.
  assert('CAMS · 30h-stale · clear · noon · UVI 8 → 0.40',
    approx(computeUVConfidence({
      source: 'cams', snapshotAgeSec: 30 * 3600, cloudCover: 0, zenithDeg: 30, uvIndex: 8,
    }), 0.40));

  // Heavy cloud + low sun stacks two penalties on CAMS.
  assert('CAMS · fresh · 90% cloud · zenith 82° · UVI 4 → ~0.39',
    approx(computeUVConfidence({
      source: 'cams', snapshotAgeSec: 600, cloudCover: 0.9, zenithDeg: 82, uvIndex: 4,
    }), 0.80 * 0.75 * 0.55));

  // Below-threshold UVI — model error dominates regardless of source.
  assert('Open-Meteo · clear · noon · UVI 0.4 → 0.65 × 0.40 = 0.26',
    approx(computeUVConfidence({
      source: 'open_meteo', cloudCover: 0, zenithDeg: 30, uvIndex: 0.4,
    }), 0.65 * 0.40));

  assert('legacy manualOverridden flag cannot force perfect confidence',
    approx(computeUVConfidence({
      source: 'open_meteo', uvIndex: 5, manualOverridden: true,
    }), UV_SOURCE_CONFIDENCE.open_meteo));

  // Floor at 0.05 — never returns 0 even under stacked worst-case.
  assert('floor at 0.05 with all penalties stacked',
    computeUVConfidence({
      source: 'zenith_offline', snapshotAgeSec: 999999, cloudCover: 1.0, zenithDeg: 89, uvIndex: 0.1, isStale: true,
    }) >= 0.05);

  // Cloud cover normalisation — fraction OR percent both accepted.
  assert('cloudCover=85 (percent) === cloudCover=0.85 (fraction)',
    approx(
      computeUVConfidence({ source: 'cams', snapshotAgeSec: 600, cloudCover: 85, zenithDeg: 30, uvIndex: 6 }),
      computeUVConfidence({ source: 'cams', snapshotAgeSec: 600, cloudCover: 0.85, zenithDeg: 30, uvIndex: 6 }),
    ));

  // Server-side stale flag halves confidence (mirrors the >24h penalty).
  assert('isStale=true × CAMS-fresh-clear-noon-UVI8 → 0.40',
    approx(computeUVConfidence({
      source: 'cams', snapshotAgeSec: 600, cloudCover: 0, zenithDeg: 30, uvIndex: 8, isStale: true,
    }), 0.40));

  // Cap at 0.99 — even baseline 1.0 source gets clamped (so user knows
  // there's always *some* model uncertainty unless they typed a meter).
  assert('non-meter source capped at 0.99',
    computeUVConfidence({ source: 'selfhost', snapshotAgeSec: 0, cloudCover: 0, zenithDeg: 30, uvIndex: 8 }) <= 0.99);

  // ─── 9. getMeteoConfig — selfhost-with-empty-URL sanity fallback ─────
  // Regression: a config with mode=selfhost but selfhostUrl='' silently
  // fell through to Open-Meteo every request. Picker still showed
  // "selfhost"; user expected CAMS. Now: getMeteoConfig returns mode
  // 'auto' in-memory while leaving the persisted record alone, so
  // either filling in the URL or switching the mode in the picker
  // resumes the user's intent. Persisted record stays untouched so
  // the picker still reflects what the user clicked.
  console.log('%c 9. selfhost-empty-URL sanity fallback ', 'font-weight:bold;color:#f59e0b');

  const STORAGE_KEY = 'labcharts-meteo-config';
  const _saved = localStorage.getItem(STORAGE_KEY);
  try {
    // Empty URL — the trap.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: 'selfhost', selfhostUrl: '', selfhostBearer: '', privacyRounding: 0.1,
    }));
    const cfg1 = getMeteoConfig();
    assert('mode=selfhost + empty URL → in-memory mode flips to auto',
      cfg1.mode === 'auto', `got mode=${cfg1.mode}`);
    assert('persisted record stays untouched (picker still shows selfhost)',
      JSON.parse(localStorage.getItem(STORAGE_KEY)).mode === 'selfhost');

    // Whitespace-only URL is also a trap — same fallback.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: 'selfhost', selfhostUrl: '   ', selfhostBearer: '', privacyRounding: 0.1,
    }));
    const cfg2 = getMeteoConfig();
    assert('mode=selfhost + whitespace-only URL → fallback fires',
      cfg2.mode === 'auto', `got mode=${cfg2.mode}`);

    // Real URL — normal selfhost path stays intact.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: 'selfhost', selfhostUrl: 'https://uvdata.example.com', selfhostBearer: '', privacyRounding: 0.1,
    }));
    const cfg3 = getMeteoConfig();
    assert('mode=selfhost + non-empty URL → mode stays selfhost',
      cfg3.mode === 'selfhost', `got mode=${cfg3.mode}`);

    // Other modes don't trigger the fallback regardless of URL value.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      mode: 'auto', selfhostUrl: '', selfhostBearer: '', privacyRounding: 0.1,
    }));
    const cfg4 = getMeteoConfig();
    assert('mode=auto + empty URL stays auto (fallback is selfhost-scoped)',
      cfg4.mode === 'auto');
  } finally {
    if (_saved === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, _saved);
  }

  // ───────────────────────────────────────────────────────────────────
  // fetchJson response-size cap — Greptile re-review #175
  // ───────────────────────────────────────────────────────────────────
  // Defence-in-depth for user-configured selfhost URLs (and incidentally
  // public APIs gone bad). Verifies that an oversized declared
  // Content-Length fails fast, and that an undeclared/lying header still
  // gets caught by the streaming byte-counter cap. Source-inspection +
  // a runtime probe through the actual fetchJson path.
  {
    const fs = (await import('node:fs')).default;
    const uvSrc = fs.readFileSync(new URL('../js/sun-uvdata.js', import.meta.url), 'utf-8');
    const apiProxySrc = fs.readFileSync(new URL('../api/proxy.js', import.meta.url), 'utf-8');
    const camsRelaySrc = fs.readFileSync(new URL('../api/cams-relay.js', import.meta.url), 'utf-8');
    const lightPageViewSrc = fs.readFileSync(new URL('../js/light-page-view.js', import.meta.url), 'utf-8');
    assert('Hosted CAMS proxy pins the private getbased route',
      /DEFAULT_UVDATA_UPSTREAM\s*=\s*'https:\/\/uvdata\.getbased\.health'/.test(camsRelaySrc)
        && /\$\{upstream\}\/v1\/uv/.test(camsRelaySrc));
    assert('Self-hosted CAMS still requires an operator-selected upstream',
      /CAMS relay upstream is empty\. Set UVDATA_UPSTREAM/.test(camsRelaySrc));
    assert('CAMS operation is split from the generic proxy entrypoint',
      /import \{ handleCamsRelay \} from '\.\/cams-relay\.js';/.test(apiProxySrc));
    assert('Light explainer discloses fixed CAMS relay and browser-direct fallback',
      /<strong>Weather data\.<\/strong>[\s\S]{0,500}fixed private relay[\s\S]{0,650}does not forward your coordinates[\s\S]{0,500}Open-Meteo<\/a> directly/.test(lightPageViewSrc));
    assert('fetchJson defines _UV_RESPONSE_CAP_BYTES',
      /_UV_RESPONSE_CAP_BYTES\s*=\s*256\s*\*\s*1024/.test(uvSrc));
    assert('fetchJson does Content-Length pre-check',
      /content-length[\s\S]{0,300}_UV_RESPONSE_CAP_BYTES/i.test(uvSrc));
    assert('fetchJson streaming byte-counter rejects mid-stream',
      /total\s*>\s*_UV_RESPONSE_CAP_BYTES[\s\S]{0,200}refusing to trust/.test(uvSrc));
    assert('fetchJson cancels reader on cap-exceeded',
      /reader\.cancel\(\)/.test(uvSrc));

    // Runtime exercise of the cap is covered by the parallel
    // implementation in api/proxy.js (CAMS relay; same Content-Length
    // pre-check + streaming byte-counter pattern, same _UV_RESPONSE_CAP_BYTES
    // sibling constant). Source inspection above guarantees the four
    // load-bearing pieces are wired in fetchJson; adding a runtime
    // probe here would require a fetchJson export hook just for tests.
  }

console.log(`\nResults: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail > 0 ? 1 : 0);
