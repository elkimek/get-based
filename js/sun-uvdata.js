// sun-uvdata.js — Multi-source UV/ozone/atmosphere client for Sun Sessions
//
// Provider priority (each falls through on error):
//   1. User-configured self-host (CAMS-mirrored or own data)
//   2. CAMS direct (default — KNMI-validated, 5nm 280-340nm, satellite-assimilated ozone)
//   3. NOAA NWS (US users only — official US National Weather Service UV)
//   4. Open-Meteo (degraded fallback — GFS-based simplified approximation)
//   5. Local zenith-angle clear-sky calc (offline)
//   6. Manual entry — always available, highest confidence weight
//
// Each session record stores `uvSource` + a confidence weight; AI sees the source.
// Manual UV-meter entries weighted highest (1.0). Estimated fallbacks discounted.
//
// Privacy: lat/lon may be rounded to 0.1° (~11km grid) before any network call.
// Self-hosters configure the data source on the Light & Sun page itself
// (☀ Sun data source & privacy details panel) — moved out of Settings →
// Privacy in v1.7.x because URL/bearer/mode are feature config, not
// privacy posture.

const STORAGE_KEY = 'labcharts-meteo-config';
const CACHE_PREFIX = 'meteo:';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const NETWORK_TIMEOUT_MS = 8000;

// Confidence weights — AI uses these to discount correlations
export const UV_SOURCE_CONFIDENCE = {
  manual_meter: 1.0,    // user with calibrated UV meter
  manual_entry: 0.85,   // user-entered without meter
  selfhost: 0.95,       // user-controlled CAMS mirror
  cams: 0.95,           // primary, KNMI-validated
  noaa_nws: 0.90,       // US official
  open_meteo: 0.65,     // GFS approximation
  zenith_offline: 0.40, // offline clear-sky-only estimate
};

// ─── Config ────────────────────────────────────────────────────────────

export function getMeteoConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultConfig();
    return Object.assign(defaultConfig(), JSON.parse(raw));
  } catch (e) {
    return defaultConfig();
  }
}

export function saveMeteoConfig(cfg) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); }
  catch (e) {}
}

function defaultConfig() {
  return {
    mode: 'auto',          // 'auto' | 'cams' | 'noaa' | 'open-meteo' | 'selfhost' | 'manual'
    selfhostUrl: '',       // user's getbased-uvdata server URL
    selfhostBearer: '',    // optional bearer token for selfhost
    privacyRounding: 0.1,  // round lat/lon to this precision (deg) before network calls
  };
}

// ─── Public API ────────────────────────────────────────────────────────

// Fetch UV/ozone/atmosphere for a given location and time.
// Returns: { uvIndex, uvClearSky, ozoneDU, cloudCover, temperatureC,
//            airQuality: { pm25, aod, no2 }, source, confidence, fetchedAt,
//            _stale?: boolean } — _stale flagged when serving cache after
// network failure so the UI can render a "cached N min ago" indicator.
//
// Pass `{ noCache: true }` to bypass both the fresh and stale cache layers
// for a user-triggered force refresh — guarantees a fresh provider call.
export async function fetchAtmosphere({ lat, lon, isoTime, noCache } = {}) {
  if (lat == null || lon == null) {
    throw new Error('fetchAtmosphere requires { lat, lon }');
  }
  const cfg = getMeteoConfig();
  const { rLat, rLon } = roundCoords(lat, lon, cfg.privacyRounding);
  const time = isoTime || new Date().toISOString();
  const cacheKey = makeCacheKey(rLat, rLon, time);

  // Fresh cache hit (within TTL) — fast path, no network. Skipped on
  // noCache so user-triggered "force refresh" always reaches the provider.
  if (!noCache) {
    const cached = readCache(cacheKey);
    if (cached) return cached;
  }

  // Provider order based on config
  const order = providerOrder(cfg);

  let lastError = null;
  for (const provider of order) {
    try {
      const result = await provider.fetch({ lat: rLat, lon: rLon, isoTime: time, cfg });
      if (result) {
        writeCache(cacheKey, result);
        return result;
      }
    } catch (e) {
      lastError = e;
      // continue to next provider
    }
  }

  // All network providers failed → try a stale cache lookup before falling
  // back to the zenith-only estimate. Useful when the user goes outside,
  // toggles airplane mode to cut EMF, and runs a session 30 min later.
  // Skipped on noCache so a user-triggered "force refresh" surfaces the
  // failure rather than silently returning stale data.
  if (!noCache) {
    const stale = readStaleCache(rLat, rLon);
    if (stale) {
      return Object.assign({}, stale, { _stale: true, source: stale.source + '_stale' });
    }
  }

  // Final fallback: offline zenith-angle estimate
  const offline = zenithOfflineEstimate({ lat: rLat, lon: rLon, isoTime: time });
  return offline;
}

// Manual UV index entry — bypasses network entirely.
// Source confidence depends on whether user has a UV meter configured.
export function manualAtmosphere({ uvIndex, ozoneDU = null, hasMeter = false, notes = '' }) {
  return {
    uvIndex,
    uvClearSky: uvIndex,
    ozoneDU,
    cloudCover: null,
    temperatureC: null,
    airQuality: null,
    source: hasMeter ? 'manual_meter' : 'manual_entry',
    confidence: hasMeter ? UV_SOURCE_CONFIDENCE.manual_meter : UV_SOURCE_CONFIDENCE.manual_entry,
    fetchedAt: Date.now(),
    notes,
  };
}

// ─── Providers ─────────────────────────────────────────────────────────

// Validate the user-provided self-host URL before sending the bearer
// token to it. Block private/loopback/link-local hosts so a bad config
// can't smuggle credentials to internal services (Redis on 6379, etc).
//
// `withBearer=true` enforces stricter rules — the bearer token is the
// thing worth stealing, and DNS rebinding is the canonical attack
// (attacker controls a public domain, first DNS lookup returns a public
// IP, subsequent lookups return 169.254.169.254 or a LAN IP; the browser
// is opaque to us and the bearer travels with the rebound request). We
// can't pin DNS in a browser, so the defence is: when a bearer is
// present, REQUIRE HTTPS (eliminates the plain-text MITM and ensures
// the rebound endpoint must present a valid certificate for the
// hostname — DNS rebinding to a LAN IP without a matching cert fails
// the TLS handshake before the bearer is sent in headers).
//
// Plain HTTP remains allowed when no bearer is configured (local dev
// against an unauthenticated LAN endpoint is a legitimate use case
// and there's no credential to leak).
//
// Returns true if the URL is safe to fetch, false otherwise.
function _isValidSelfhostUrl(raw, withBearer = false) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  // v1.7.8 hardening: bearer-bearing requests require HTTPS so DNS
  // rebinding to a LAN/metadata IP fails at the TLS layer (rebound
  // host won't have a cert for the original domain).
  if (withBearer && u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  // Block IP-literal forms targeting internal hosts. Hostnames go through
  // DNS at fetch time — those can still resolve to private IPs, but with
  // the bearer-requires-HTTPS rule above, a rebound request fails TLS
  // before the bearer leaves the device. Catching the obvious cases is
  // still what matters for non-bearer configs and for refusing ambiguous
  // pastes outright.
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') return false;
  if (host === '0.0.0.0') return false;
  // RFC1918 + link-local + cloud-metadata IP literals
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const o = ipv4.slice(1, 5).map(Number);
    if (o[0] === 10) return false;                              // 10.0.0.0/8
    if (o[0] === 127) return false;                             // 127.0.0.0/8
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return false; // 172.16.0.0/12
    if (o[0] === 192 && o[1] === 168) return false;             // 192.168.0.0/16
    if (o[0] === 169 && o[1] === 254) return false;             // link-local (incl. cloud-metadata 169.254.169.254)
    if (o[0] === 100 && o[1] >= 64 && o[1] <= 127) return false; // 100.64.0.0/10 carrier-grade NAT
    if (o[0] >= 224) return false;                              // multicast / reserved
  }
  if (host.startsWith('[fe80:')) return false; // IPv6 link-local literal
  return true;
}

// Defence-in-depth: validates that a selfhost response payload looks
// like the Open-Meteo shape we expect. If the URL gets DNS-rebound to
// a service that returns valid JSON but isn't Open-Meteo (a router
// admin page, a cloud metadata service that returns JSON, etc), this
// rejects it before we treat the result as authoritative atmosphere
// data. Fails closed: returns false on any structural mismatch.
function _looksLikeOpenMeteoResponse(json) {
  if (!json || typeof json !== 'object') return false;
  const h = json.hourly;
  if (!h || typeof h !== 'object') return false;
  // Must have a time array AND at least one of the requested data series.
  if (!Array.isArray(h.time) || h.time.length === 0) return false;
  const expectedSeries = ['uv_index', 'uv_index_clear_sky', 'cloud_cover', 'temperature_2m'];
  return expectedSeries.some(k => Array.isArray(h[k]));
}

const PROVIDERS = {
  selfhost: {
    name: 'selfhost',
    available: (cfg) => Boolean(cfg.selfhostUrl) && _isValidSelfhostUrl(cfg.selfhostUrl, Boolean(cfg.selfhostBearer)),
    fetch: async ({ lat, lon, isoTime, cfg }) => {
      const hasBearer = Boolean(cfg.selfhostBearer);
      if (!_isValidSelfhostUrl(cfg.selfhostUrl, hasBearer)) {
        throw new Error(hasBearer
          ? 'selfhost URL rejected — bearer-bearing requests require https:// (DNS-rebinding hardening; see v1.7.8)'
          : 'selfhost URL rejected — must be public https/http, not loopback / RFC1918 / link-local');
      }
      // v1.7.13 audit defence-in-depth: lat/lon are interpolated into
      // the URL string. Caller chain validates them as numbers, but a
      // future code path (corrupted profile, reflection, test stub)
      // could pass a string containing `?` or `&` that would split the
      // URL. Coerce explicitly + clamp to valid earth coordinates.
      const safeLat = Math.max(-90, Math.min(90, Number(lat))) || 0;
      const safeLon = Math.max(-180, Math.min(180, Number(lon))) || 0;
      const url = `${cfg.selfhostUrl.replace(/\/$/, '')}/v1/forecast?latitude=${safeLat.toFixed(6)}&longitude=${safeLon.toFixed(6)}&hourly=uv_index,uv_index_clear_sky,ozone,cloud_cover,temperature_2m`;
      const headers = {};
      if (cfg.selfhostBearer) headers.Authorization = `Bearer ${cfg.selfhostBearer}`;
      const json = await fetchJson(url, { headers });
      // v1.7.8 defence-in-depth: validate response shape before trusting
      // it. A DNS-rebound endpoint (or a misconfigured selfhost server)
      // could return valid JSON that isn't Open-Meteo — refuse it loudly
      // so downstream code never treats foreign data as authoritative.
      if (!_looksLikeOpenMeteoResponse(json)) {
        throw new Error('selfhost response did not match Open-Meteo shape — refusing to trust the payload (DNS rebinding or misconfiguration?)');
      }
      // Selfhost is expected to return Open-Meteo-shaped JSON. No air-quality
      // companion endpoint contract yet — pass null and the shaper handles it.
      return shapeOpenMeteoResponse(json, null, isoTime, 'selfhost');
    },
  },
  cams: {
    name: 'cams',
    available: () => true,
    fetch: async ({ lat, lon, isoTime }) => {
      // CAMS is proxied via Vercel Edge to keep API keys server-side.
      // Endpoint TBD — placeholder structure matches CAMS ADS response shape.
      // For v1.7.0a we route CAMS through api/proxy.js with a server-injected key.
      const url = `/api/proxy?meteo=cams&latitude=${lat}&longitude=${lon}`;
      const json = await fetchJson(url, {});
      return shapeCamsResponse(json, isoTime, 'cams');
    },
  },
  noaa: {
    name: 'noaa_nws',
    available: ({ lat, lon }) => isUSCoords(lat, lon),
    fetch: async ({ lat, lon, isoTime }) => {
      // NOAA Air Resources Lab UV index endpoint
      const url = `https://www.cpc.ncep.noaa.gov/products/stratosphere/uv_index/json/uv_${Math.round(lat * 10)}_${Math.round(lon * 10)}.json`;
      const json = await fetchJson(url, {});
      return shapeNoaaResponse(json, isoTime);
    },
  },
  openMeteo: {
    name: 'open_meteo',
    available: () => true,
    fetch: async ({ lat, lon, isoTime }) => {
      // Forecast API — UV/clouds/temp + daily sunrise/sunset for today and
      // hourly UVI across the day (for peak-finder). Open-Meteo's forecast
      // endpoint does not return total-column ozone (despite older docs);
      // ozone lives on the air-quality endpoint as `ozone` (µg/m³, NOT DU).
      // past_days=2 covers hydrating yesterday + day-before sessions; without
      // it the hourly arrays only carry today, so nearestHourIndex() snaps
      // any past timestamp to today's first available hour (00:00 → UVI 0)
      // and the persisted atmosphere reads as a midnight session.
      const fcUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=uv_index,uv_index_clear_sky,cloud_cover,temperature_2m&daily=sunrise,sunset,uv_index_max&timezone=auto&past_days=2&forecast_days=1`;
      // Air-quality API — PM2.5, PM10, AOD, NO2, total-column ozone (DU
      // conversion handled in shape function — ~2.144 µg/m³ ≈ 1 DU at
      // standard atmosphere). Same past_days widening so hydrating past
      // sessions gets matching air-quality samples.
      const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=pm10,pm2_5,nitrogen_dioxide,aerosol_optical_depth,ozone&current=pm2_5,pm10,european_aqi&past_days=2`;
      // Fire both in parallel; tolerate AQ failure (stratospheric ozone is
      // nice-to-have, not critical for sunburn-dose math).
      const [fcJson, aqJson] = await Promise.allSettled([
        fetchJson(fcUrl, {}),
        fetchJson(aqUrl, {}),
      ]);
      if (fcJson.status !== 'fulfilled') return null;
      return shapeOpenMeteoResponse(
        fcJson.value,
        aqJson.status === 'fulfilled' ? aqJson.value : null,
        isoTime,
        'open_meteo'
      );
    },
  },
};

function providerOrder(cfg) {
  // Until the CAMS-via-proxy endpoint and the getbased-uvdata companion repo
  // ship, CAMS is a configured-only path (selfhost or explicit 'cams' mode).
  // NOAA NWS doesn't allow browser CORS, so it's also explicit-only and only
  // useful for non-browser callers.
  if (cfg.mode === 'manual') return [];
  if (cfg.mode === 'selfhost') return cfg.selfhostUrl ? [PROVIDERS.selfhost, PROVIDERS.openMeteo] : [PROVIDERS.openMeteo];
  if (cfg.mode === 'cams') return [PROVIDERS.cams, PROVIDERS.openMeteo];
  if (cfg.mode === 'noaa') return [PROVIDERS.noaa, PROVIDERS.openMeteo];
  if (cfg.mode === 'open-meteo') return [PROVIDERS.openMeteo];
  // 'auto' — selfhost (if configured) → Open-Meteo. CAMS + NOAA are
  // explicitly opt-in until their ingestion paths are real.
  const order = [];
  if (cfg.selfhostUrl) order.push(PROVIDERS.selfhost);
  order.push(PROVIDERS.openMeteo);
  return order;
}

// ─── Response shapers ──────────────────────────────────────────────────

function shapeOpenMeteoResponse(fcJson, aqJson, isoTime, sourceLabel) {
  if (!fcJson?.hourly?.time || !fcJson.hourly.uv_index) return null;
  // Forecast endpoint is queried with `timezone=auto` so its time strings are
  // local-clock at the location, no offset suffix. AQ endpoint defaults to
  // GMT so its strings are UTC-clock. JS `new Date(naiveString)` interprets
  // either as the *device's* local tz, which gives the wrong hour-index when
  // the device tz != location tz (the 5.9 vs 1.8 cross-device bug).
  const fcOffsetS = Number.isFinite(fcJson?.utc_offset_seconds) ? fcJson.utc_offset_seconds : 0;
  const aqOffsetS = Number.isFinite(aqJson?.utc_offset_seconds) ? aqJson.utc_offset_seconds : 0;
  const idx = nearestHourIndex(fcJson.hourly.time, isoTime, fcOffsetS);
  if (idx < 0) return null;
  const fc = (k) => Array.isArray(fcJson.hourly[k]) ? fcJson.hourly[k][idx] : null;

  // Air-quality lookup — same hourly index strategy. Some fields also live
  // on `current` (no time series); use those as a fallback when present.
  let aqIdx = -1;
  if (aqJson?.hourly?.time) aqIdx = nearestHourIndex(aqJson.hourly.time, isoTime, aqOffsetS);
  const aq = (k) => {
    if (aqIdx >= 0 && Array.isArray(aqJson.hourly?.[k])) return aqJson.hourly[k][aqIdx];
    if (aqJson?.current?.[k] != null) return aqJson.current[k];
    return null;
  };

  const pm25 = aq('pm2_5');
  const pm10 = aq('pm10');
  const aod = aq('aerosol_optical_depth');
  const no2 = aq('nitrogen_dioxide');
  // Open-Meteo's `ozone` (µg/m³) is GROUND-LEVEL ozone — i.e. air pollution,
  // not the protective stratospheric column. Surface ozone is harmful when
  // exercising outdoors; track + display it as a distinct AQ field. The
  // total-column DU figure (used by the UV math) needs CAMS or a similar
  // satellite source — it's not available on Open-Meteo's free tier.
  const surfaceOzone = aq('ozone');
  // European AQI — pre-aggregated multi-pollutant index (1=Good 6=Extreme).
  // Open-Meteo returns this on the `current` block when requested.
  const european_aqi = aqJson?.current?.european_aqi ?? null;
  const airQuality = (pm25 != null || pm10 != null || aod != null || no2 != null || surfaceOzone != null || european_aqi != null)
    ? { pm25, pm10, aod, no2, surfaceOzoneUgM3: surfaceOzone, european_aqi }
    : null;

  // Daily sun-events + peak UVI (today). Open-Meteo's `daily` arrays
  // (sunrise/sunset/uv_index_max) are single-element with forecast_days=1.
  // The hourly array now spans 3 calendar days because we request
  // past_days=2 (needed to hydrate past sessions) — so the peak-finder
  // MUST filter to today's calendar date in the location's timezone,
  // otherwise it picks the absolute max across all 72 hours and pegs
  // peakAt to a past or future moment that breaks the sun-arc sort.
  const daily = fcJson.daily || {};
  const sunrise = Array.isArray(daily.sunrise) ? daily.sunrise[0] : null;
  const sunset = Array.isArray(daily.sunset) ? daily.sunset[0] : null;
  const uvIndexMax = Array.isArray(daily.uv_index_max) ? daily.uv_index_max[0] : null;
  // Today's local date string in the LOCATION's timezone. Prefer the
  // canonical anchor from `daily.time[0]` (Open-Meteo's authoritative
  // "today" for the requested location, immune to DST edge cases) and
  // only fall back to `utc_offset_seconds + Date.now()` derivation
  // when the daily array is missing. v1.7.15 audit fix: the previous
  // derivation drifted at DST boundaries — opening the app at 23:55
  // local time the day before a DST jump computed yesterday's date
  // for the next morning's hourly entries because `getUTCDate()` on
  // an offset-shifted Date doesn't track DST transitions.
  let todayPrefix = null;
  if (typeof daily.time?.[0] === 'string' && /^\d{4}-\d{2}-\d{2}/.test(daily.time[0])) {
    todayPrefix = daily.time[0].slice(0, 10);
  } else {
    try {
      const offsetMs = (Number.isFinite(fcJson?.utc_offset_seconds) ? fcJson.utc_offset_seconds : 0) * 1000;
      const localNow = new Date(Date.now() + offsetMs);
      const y = localNow.getUTCFullYear();
      const m = String(localNow.getUTCMonth() + 1).padStart(2, '0');
      const d = String(localNow.getUTCDate()).padStart(2, '0');
      todayPrefix = `${y}-${m}-${d}`;
    } catch (e) {}
  }
  let peakAt = null;
  if (uvIndexMax != null && Array.isArray(fcJson.hourly?.uv_index) && Array.isArray(fcJson.hourly.time)) {
    let bestI = -1, bestV = -Infinity;
    for (let i = 0; i < fcJson.hourly.uv_index.length; i++) {
      const t = fcJson.hourly.time[i];
      // Skip hours that aren't today (past_days=2 puts yesterday + day-
      // before-yesterday in the array; without this filter the peak
      // could be from any of those days).
      if (todayPrefix && typeof t === 'string' && !t.startsWith(todayPrefix)) continue;
      const v = fcJson.hourly.uv_index[i];
      if (Number.isFinite(v) && v > bestV) { bestV = v; bestI = i; }
    }
    if (bestI >= 0) peakAt = fcJson.hourly.time[bestI];
  }

  return {
    uvIndex: fc('uv_index'),
    uvClearSky: fc('uv_index_clear_sky'),
    // Total-column ozone (Dobson Units, stratospheric) — Open-Meteo
    // doesn't expose this on the free tier. Engine falls back to 300 DU.
    ozoneDU: null,
    cloudCover: fc('cloud_cover'),
    temperatureC: fc('temperature_2m'),
    airQuality,
    daily: {
      sunrise,
      sunset,
      uvIndexMax,
      peakAt,
    },
    // Today's hourly forecast arrays — used by views.js for "time to MED"
    // integration AND by sun.js _liveDosesFor for sub-hourly atm
    // interpolation during active sessions (so a 10:55 session reading
    // doesn't snap-step to the 11:00 cloud cover at the hour boundary).
    hourly: Array.isArray(fcJson.hourly?.time) ? {
      time: fcJson.hourly.time,
      utcOffsetSeconds: fcOffsetS,
      uv_index: fcJson.hourly.uv_index || [],
      uv_index_clear_sky: fcJson.hourly.uv_index_clear_sky || [],
      cloud_cover: fcJson.hourly.cloud_cover || [],
      temperature_2m: fcJson.hourly.temperature_2m || [],
    } : null,
    source: sourceLabel,
    confidence: UV_SOURCE_CONFIDENCE[sourceLabel] ?? 0.6,
    fetchedAt: Date.now(),
  };
}

function shapeCamsResponse(json, isoTime, sourceLabel) {
  // Placeholder shape — CAMS ADS responses are reshaped by api/proxy.js
  // to match the Open-Meteo hourly format for client uniformity. CAMS does
  // include atmospheric ozone + AQ in the same response so we pass it as
  // both args (ie reusing the same JSON for the air-quality lookup).
  return shapeOpenMeteoResponse(json, json, isoTime, sourceLabel);
}

function shapeNoaaResponse(json, isoTime) {
  if (!json) return null;
  // NOAA endpoint shape varies — extract UV index, fall through if not parseable
  const uvi = json.uv_index ?? json.UVI ?? null;
  if (uvi == null) return null;
  return {
    uvIndex: uvi,
    uvClearSky: null,
    ozoneDU: json.ozone ?? null,
    cloudCover: null,
    temperatureC: null,
    airQuality: null,
    source: 'noaa_nws',
    confidence: UV_SOURCE_CONFIDENCE.noaa_nws,
    fetchedAt: Date.now(),
  };
}

// ─── Offline zenith-angle clear-sky estimate ───────────────────────────

// When all providers fail (offline / network outage), estimate UV index
// from solar geometry alone. Crude — ignores ozone, aerosol, clouds.
// Marked as low-confidence in AI context.
function zenithOfflineEstimate({ lat, lon, isoTime }) {
  const date = new Date(isoTime);
  const zenith = solarZenithAngle(date, lat, lon);
  if (zenith == null || zenith >= 90) {
    // Sun below horizon
    return {
      uvIndex: 0,
      uvClearSky: 0,
      ozoneDU: null,
      cloudCover: null,
      temperatureC: null,
      airQuality: null,
      source: 'zenith_offline',
      confidence: UV_SOURCE_CONFIDENCE.zenith_offline,
      fetchedAt: Date.now(),
    };
  }
  // Madronich-style approximation: UVI ≈ 12.5 * cos(zenith)^2 at sea level
  // with typical 300 DU ozone. Real-world span is much wider; this is
  // explicitly a placeholder for correlation purposes only.
  const cosz = Math.cos(zenith * Math.PI / 180);
  const estimated = Math.max(0, 12.5 * cosz * cosz);
  return {
    uvIndex: estimated,
    uvClearSky: estimated,
    ozoneDU: 300,
    cloudCover: null,
    temperatureC: null,
    airQuality: null,
    source: 'zenith_offline',
    confidence: UV_SOURCE_CONFIDENCE.zenith_offline,
    fetchedAt: Date.now(),
  };
}

// Solar zenith angle in degrees. Standard NOAA solar position algorithm
// (simplified — accurate to ~1° for civil purposes, plenty for our use).
export function solarZenithAngle(date, lat, lon) {
  const dayOfYear = Math.floor((date - new Date(Date.UTC(date.getUTCFullYear(), 0, 0))) / 86400000);
  const fractionalYear = (2 * Math.PI / 365) * (dayOfYear - 1 + (date.getUTCHours() - 12) / 24);
  // Solar declination
  const decl = 0.006918
    - 0.399912 * Math.cos(fractionalYear)
    + 0.070257 * Math.sin(fractionalYear)
    - 0.006758 * Math.cos(2 * fractionalYear)
    + 0.000907 * Math.sin(2 * fractionalYear)
    - 0.002697 * Math.cos(3 * fractionalYear)
    + 0.001480 * Math.sin(3 * fractionalYear);
  // Equation of time (minutes)
  const eqtime = 229.18 * (
    0.000075
    + 0.001868 * Math.cos(fractionalYear)
    - 0.032077 * Math.sin(fractionalYear)
    - 0.014615 * Math.cos(2 * fractionalYear)
    - 0.040849 * Math.sin(2 * fractionalYear)
  );
  // True solar time (minutes)
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const tst = utcMinutes + eqtime + 4 * lon;
  // Hour angle
  const ha = (tst / 4 - 180) * Math.PI / 180;
  const latRad = lat * Math.PI / 180;
  // Zenith
  const cosZenith = Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.cos(ha);
  return Math.acos(Math.max(-1, Math.min(1, cosZenith))) * 180 / Math.PI;
}

// ─── Helpers ───────────────────────────────────────────────────────────

function roundCoords(lat, lon, precision) {
  if (!precision || precision <= 0) return { rLat: lat, rLon: lon };
  const f = 1 / precision;
  return {
    rLat: Math.round(lat * f) / f,
    rLon: Math.round(lon * f) / f,
  };
}

function makeCacheKey(lat, lon, isoTime) {
  // Bucket by hour
  const hourBucket = isoTime.slice(0, 13); // YYYY-MM-DDTHH
  return `${CACHE_PREFIX}${lat.toFixed(2)}_${lon.toFixed(2)}_${hourBucket}`;
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.fetchedAt) return null;
    if (Date.now() - obj.fetchedAt > CACHE_TTL_MS) return null;
    return obj;
  } catch (e) { return null; }
}

// Walk every cached entry for these coords (any time bucket) and return the
// most recently fetched one regardless of TTL. Used as the airplane-mode
// fallback when all network providers fail.
function readStaleCache(rLat, rLon) {
  try {
    const prefix = `${CACHE_PREFIX}${rLat.toFixed(2)}_${rLon.toFixed(2)}_`;
    let best = null;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(prefix)) continue;
      try {
        const obj = JSON.parse(localStorage.getItem(k));
        if (obj && obj.fetchedAt && (!best || obj.fetchedAt > best.fetchedAt)) best = obj;
      } catch (e) {}
    }
    return best;
  } catch (e) { return null; }
}

function writeCache(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) {
    // Quota or serialization error. Surface in debug mode so the user
    // can triage why their conditions strip stops persisting across reloads.
    try {
      if (typeof window !== 'undefined' && window.isDebugMode && window.isDebugMode()) {
        console.warn('[sun-uvdata] writeCache failed', key, e?.name || e);
      }
    } catch {}
  }
}

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), NETWORK_TIMEOUT_MS);
  try {
    // Suppressing network errors as logging — providerOrder treats failures as
    // fallthrough signals, not bugs. The console error from a 404/CORS is
    // useful only when debugging a specific provider.
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// Open-Meteo returns hourly time strings without an offset suffix
// (e.g. "2026-05-01T14:00"). With `timezone=auto` they're location-local;
// without it they're UTC. JS's `new Date(naiveString)` interprets them as
// the *device's* local tz, which gives a wrong hour-index whenever the
// device tz != response tz — and produced the cross-device 5.9-vs-1.8
// UVI divergence on phone-over-Tailscale. Parse the calendar fields with
// Date.UTC() and shift by the response's `utc_offset_seconds` to get a
// true UTC instant, regardless of device tz.
function parseNaiveHourMs(s, offsetSeconds) {
  const m = typeof s === 'string' && s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return NaN;
  const asUtcMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  return asUtcMs - (offsetSeconds || 0) * 1000;
}

export function nearestHourIndex(timeArray, isoTime, offsetSeconds = 0) {
  if (!Array.isArray(timeArray)) return -1;
  const target = new Date(isoTime).getTime();
  let bestIdx = -1, bestDelta = Infinity;
  for (let i = 0; i < timeArray.length; i++) {
    const t = parseNaiveHourMs(timeArray[i], offsetSeconds);
    if (!Number.isFinite(t)) continue;
    const delta = Math.abs(t - target);
    if (delta < bestDelta) { bestDelta = delta; bestIdx = i; }
  }
  return bestIdx;
}

// Linearly interpolate hourly atmospheric fields at an arbitrary instant.
// Open-Meteo / CAMS deliver hourly time series; without interpolation the
// live session math step-changes at every clock-hour boundary which reads
// as discontinuities in the channel readouts. Returns scalar overrides for
// uvIndex / cloudCover / temperatureC; caller merges into atm before
// computing the spectrum.
//
// Falls back to the nearest hour when the target is outside the array
// range. Returns null when the atm shape lacks `hourly` arrays (older
// cached entries, NOAA, manual fallback).
export function interpolateAtmosphere(atm, isoTime) {
  if (!atm || !atm.hourly || !Array.isArray(atm.hourly.time) || atm.hourly.time.length === 0) {
    return null;
  }
  const offsetS = atm.hourly.utcOffsetSeconds || 0;
  const targetMs = new Date(isoTime).getTime();
  if (!Number.isFinite(targetMs)) return null;

  // Find the bracketing pair (i, i+1) with t[i] <= target <= t[i+1].
  // Bail to nearest-hour at the array endpoints.
  const times = atm.hourly.time;
  let lowIdx = -1;
  for (let i = 0; i < times.length - 1; i++) {
    const t0 = parseNaiveHourMs(times[i], offsetS);
    const t1 = parseNaiveHourMs(times[i + 1], offsetS);
    if (!Number.isFinite(t0) || !Number.isFinite(t1)) continue;
    if (t0 <= targetMs && targetMs <= t1) { lowIdx = i; break; }
  }
  if (lowIdx < 0) {
    const idx = nearestHourIndex(times, isoTime, offsetS);
    if (idx < 0) return null;
    return _atmAtIndex(atm.hourly, idx);
  }
  const t0 = parseNaiveHourMs(times[lowIdx], offsetS);
  const t1 = parseNaiveHourMs(times[lowIdx + 1], offsetS);
  const span = t1 - t0;
  const frac = span > 0 ? (targetMs - t0) / span : 0;
  return _lerpAtm(atm.hourly, lowIdx, lowIdx + 1, frac);
}

function _atmAtIndex(hourly, i) {
  return {
    uvIndex: _safe(hourly.uv_index, i),
    uvClearSky: _safe(hourly.uv_index_clear_sky, i),
    cloudCover: _safe(hourly.cloud_cover, i),
    temperatureC: _safe(hourly.temperature_2m, i),
  };
}

function _lerpAtm(hourly, i, j, frac) {
  const lerp = (arr) => {
    const a = _safe(arr, i);
    const b = _safe(arr, j);
    if (!Number.isFinite(a)) return Number.isFinite(b) ? b : null;
    if (!Number.isFinite(b)) return a;
    return a + (b - a) * frac;
  };
  return {
    uvIndex: lerp(hourly.uv_index),
    uvClearSky: lerp(hourly.uv_index_clear_sky),
    cloudCover: lerp(hourly.cloud_cover),
    temperatureC: lerp(hourly.temperature_2m),
  };
}

function _safe(arr, i) {
  if (!Array.isArray(arr)) return null;
  const v = arr[i];
  return Number.isFinite(v) ? v : null;
}

function isUSCoords(lat, lon) {
  // Continental US + Alaska + Hawaii rough bounding
  if (lat >= 24 && lat <= 49.5 && lon >= -125 && lon <= -66) return true;
  if (lat >= 51 && lat <= 71 && lon >= -180 && lon <= -130) return true; // AK
  if (lat >= 18 && lat <= 23 && lon >= -161 && lon <= -154) return true; // HI
  return false;
}

// Expose for window.fn calls from inline HTML handlers
if (typeof window !== 'undefined') {
  Object.assign(window, {
    fetchAtmosphere,
    manualAtmosphere,
    interpolateAtmosphere,
    getMeteoConfig,
    saveMeteoConfig,
    solarZenithAngle,
  });
}
