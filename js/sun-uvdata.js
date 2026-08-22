// @ts-check
// sun-uvdata.js — Multi-source UV/ozone/atmosphere client for Sun Sessions
import { getErrorName } from './caught-error.js';
import { getProxyApiUrl } from './proxy-runtime.js';
import { isOfficialGetbasedHost } from './url-safety.js';
import { isValidExternalUrl } from './url-safety.js';
import { isSunDebugRuntime } from './sun-runtime.js';
import { initMeteoConfigCache, getMeteoConfig, saveMeteoConfig } from './sun-uvdata-config.js';
import {
  UV_SOURCE_CONFIDENCE,
  computeUVConfidence,
  interpolateAtmosphere,
  nearestHourIndex,
  parseProviderTimeMs,
  shapeCamsResponse,
  shapeNoaaResponse,
  shapeOpenMeteoResponse,
  solarZenithAngle,
  zenithOfflineEstimate,
} from './sun-uvdata-atmosphere.js';
export { initMeteoConfigCache, getMeteoConfig, saveMeteoConfig };
export {
  UV_SOURCE_CONFIDENCE,
  computeUVConfidence,
  interpolateAtmosphere,
  nearestHourIndex,
  parseProviderTimeMs,
  solarZenithAngle,
};

// Provider priority (each falls through on error):
//   1. User-configured self-host (CAMS-mirrored or own data)
//   2. Deployment CAMS relay (fixed private route on official hosts)
//   3. NOAA NWS (US users only — official US National Weather Service UV)
//   4. Open-Meteo (browser-direct default — GFS-based approximation)
//   5. Local zenith-angle clear-sky calc (offline)
// Each session record stores `uvSource` + a confidence weight; AI sees the source.
//
// Privacy: official hosts always round lat/lon to 0.1° (~11km grid) before
// any network call. Self-hosters can choose the same default or opt out.
// Self-hosters configure the data source on the Light & Sun page itself
// (☀ Sun data source & privacy details panel) — moved out of Settings →
// Privacy in v1.7.x because URL/bearer/mode are feature config, not
// privacy posture.

let _warnedAboutRejectedSelfhostUrl = false;
// v5 invalidates CAMS rows missing daily or AQI context. Live conditions use
// a five-minute TTL; historical forecasts remain cached longer.
const CACHE_PREFIX = 'meteo:v5:';
const NETWORK_TIMEOUT_MS = 8000;

// ─── Public API ────────────────────────────────────────────────────────

// Fetch UV/ozone/atmosphere for a given location and time.
// Returns: { uvIndex, uvClearSky, ozoneDU, cloudCover, temperatureC,
//            airQuality: { pm25, aod, no2 }, source, confidence, fetchedAt,
//            _stale?: boolean } — _stale flagged when serving cache after
// network failure so the UI can render a "cached N min ago" indicator.
//
// Pass `{ noCache: true }` to bypass both the fresh and stale cache layers
// for a user-triggered force refresh — guarantees a fresh provider call.
/**
 * @param {{ lat?: number, lon?: number, isoTime?: string, noCache?: boolean }} [opts]
 */
export async function fetchAtmosphere({ lat, lon, isoTime, noCache } = {}) {
  if (lat == null || lon == null) {
    throw new Error('fetchAtmosphere requires { lat, lon }');
  }
  const cfg = getMeteoConfig();
  const effectiveRounding = isOfficialGetbasedHost() ? 0.1 : cfg.privacyRounding;
  const { rLat, rLon } = roundCoords(lat, lon, effectiveRounding);
  const time = isoTime || new Date().toISOString();
  const cacheKey = makeCacheKey(rLat, rLon, time);
  const withRequestMeta = result => result ? Object.assign({}, result, {
    _requestCoords: {
      lat: rLat,
      lon: rLon,
      privacyRounded: Number(effectiveRounding) > 0,
    },
  }) : result;

  // Fresh cache hit (within TTL) — fast path, no network. Skipped on
  // noCache so user-triggered "force refresh" always reaches the provider.
  if (!noCache) {
    const cached = readCache(cacheKey, time);
    if (cached && cacheMatchesConfig(cached, cfg)) return withRequestMeta(cached);
  }

  // Provider order based on config
  const order = providerOrder(cfg, { lat: rLat, lon: rLon });

  for (let i = 0; i < order.length; i++) {
    const provider = order[i];
    try {
      const result = await provider.fetch({ lat: rLat, lon: rLon, isoTime: time, cfg });
      if (result) {
        // Direct CAMS UV can arrive without daily, weather, or AQI context.
        // Fill those gaps from the next provider while retaining CAMS data.
        const needsContextFallback = atmosphereNeedsContextFallback(result);
        const hasFallback = i + 1 < order.length;
        if (needsContextFallback && hasFallback) {
          for (let j = i + 1; j < order.length; j++) {
            try {
              const fallback = await order[j].fetch({ lat: rLat, lon: rLon, isoTime: time, cfg });
              if (fallback) {
                const merged = mergeAtmosphereContext(result, fallback);
                const annotated = withRequestMeta(merged);
                writeCache(cacheKey, annotated);
                return annotated;
              }
            } catch (e) { /* fall through to next */ }
          }
        }
        const annotated = withRequestMeta(result);
        writeCache(cacheKey, annotated);
        return annotated;
      }
    } catch {
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
      return withRequestMeta(Object.assign({}, stale, { _stale: true, source: stale.source + '_stale' }));
    }
  }

  // Final fallback: offline zenith-angle estimate
  const offline = zenithOfflineEstimate({ lat: rLat, lon: rLon, isoTime: time });
  return withRequestMeta(offline);
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
  // Bearer-bearing requests require HTTPS so DNS rebinding to a LAN/metadata
  // IP fails at the TLS layer (rebound host won't have a cert for the
  // original domain). Without a bearer, we still want to refuse ambiguous
  // private-range pastes outright. Both modes block loopback / RFC1918 /
  // link-local / cloud-metadata literals — see js/url-safety.js.
  return isValidExternalUrl(raw, { requireHttps: withBearer });
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
      const params = new URLSearchParams({
        latitude: safeLat.toFixed(6),
        longitude: safeLon.toFixed(6),
        time: isoTime,
        hourly: 'uv_index,uv_index_clear_sky,ozone,cloud_cover,temperature_2m',
      });
      const url = `${cfg.selfhostUrl.replace(/\/$/, '')}/uv?${params.toString()}`;
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
      return json._camsMeta || json._fieldSources
        ? shapeCamsResponse(json, isoTime, 'selfhost')
        : shapeOpenMeteoResponse(json, null, isoTime, 'selfhost');
    },
  },
  cams: {
    name: 'cams',
    available: () => true,
    fetch: async ({ lat, lon, isoTime }) => {
      // Official hosts accept only this fixed operation, re-round coordinates
      // server-side, and POST them to the CAMS-only private relay route.
      // Self-hosted deployments can instead wire their own compatible relay.
      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meteo: 'cams', latitude: lat, longitude: lon, time: isoTime }),
      };
      const json = await fetchJson(getProxyApiUrl(), options);
      return shapeCamsResponse(json, isoTime, 'cams');
    },
  },
  noaa: {
    name: 'noaa_nws',
    available: ({ lat, lon }) => isUSCoords(lat, lon),
    fetch: async ({ lat, lon }) => {
      // NOAA Air Resources Lab UV index endpoint
      const url = `https://www.cpc.ncep.noaa.gov/products/stratosphere/uv_index/json/uv_${Math.round(lat * 10)}_${Math.round(lon * 10)}.json`;
      const json = await fetchJson(url, {});
      return shapeNoaaResponse(json);
    },
  },
  openMeteo: {
    name: 'open_meteo',
    available: () => true,
    fetch: async ({ lat, lon, isoTime }) => {
      // Current and retro-session requests need different endpoints. Asking
      // the live endpoint for a fixed seven-day tail made older sessions snap
      // to whatever boundary hour happened to be returned. Use a bounded
      // date window, and the historical-forecast endpoint for older dates.
      const requestMs = Date.parse(isoTime || '');
      const targetMs = Number.isFinite(requestMs) ? requestMs : Date.now();
      const ageMs = Date.now() - targetMs;
      const liveRequest = Math.abs(ageMs) <= 2 * 24 * 60 * 60 * 1000;
      const historicalRequest = ageMs > 5 * 24 * 60 * 60 * 1000;
      const startDate = new Date(targetMs - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const endDate = new Date(targetMs + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const fcParams = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        hourly: 'uv_index,uv_index_clear_sky,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,temperature_2m,shortwave_radiation_instant,direct_radiation_instant,diffuse_radiation_instant',
        daily: 'sunrise,sunset,uv_index_max,uv_index_clear_sky_max',
        timezone: 'auto',
      });
      if (liveRequest) {
        fcParams.set('current', 'uv_index,uv_index_clear_sky,cloud_cover,temperature_2m,shortwave_radiation_instant');
        fcParams.set('past_days', '2');
        fcParams.set('forecast_days', '2');
      } else {
        fcParams.set('start_date', startDate);
        fcParams.set('end_date', endDate);
      }
      const fcBase = historicalRequest
        ? 'https://historical-forecast-api.open-meteo.com/v1/forecast'
        : 'https://api.open-meteo.com/v1/forecast';
      const fcUrl = `${fcBase}?${fcParams.toString()}`;
      // Air-quality API — raw concentrations remain useful context, while
      // provider-computed European AQI component indices supply the correctly
      // averaged classifications used by Conditions Now.
      const aqFields = 'pm10,pm2_5,nitrogen_dioxide,sulphur_dioxide,aerosol_optical_depth,ozone,european_aqi,european_aqi_pm2_5,european_aqi_pm10,european_aqi_nitrogen_dioxide,european_aqi_ozone,european_aqi_sulphur_dioxide';
      const aqParams = new URLSearchParams({
        latitude: String(lat),
        longitude: String(lon),
        hourly: aqFields,
      });
      if (liveRequest) {
        aqParams.set('current', aqFields);
        aqParams.set('past_days', '2');
      } else {
        aqParams.set('start_date', startDate);
        aqParams.set('end_date', endDate);
      }
      const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?${aqParams.toString()}`;
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

function providerIsAvailable(provider, ctx) {
  try {
    if (!provider.available) return true;
    const ok = provider.available(ctx);
    if (!ok && provider.name === 'selfhost' && ctx?.mode === 'selfhost' && ctx.selfhostUrl && !_warnedAboutRejectedSelfhostUrl) {
      try {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(ctx.selfhostBearer
            ? '[meteo] selfhost URL rejected — bearer-bearing requests require https:// and public hosts; falling back to Open-Meteo.'
            : '[meteo] selfhost URL rejected — must be public http(s), not loopback / RFC1918 / link-local; falling back to Open-Meteo.');
        }
      } catch {}
      _warnedAboutRejectedSelfhostUrl = true;
    }
    return ok;
  } catch (e) {
    try {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[meteo] provider availability check failed; skipping provider.', getErrorName(e) || e);
      }
    } catch {}
    return false;
  }
}

function availableProviders(candidates, ctx) {
  return candidates.filter(provider => providerIsAvailable(provider, ctx));
}

function hasUsefulProviderValue(value) {
  if (Array.isArray(value)) return value.some(hasUsefulProviderValue);
  return value != null
    && (typeof value !== 'number' || Number.isFinite(value))
    && (typeof value !== 'string' || value.trim().length > 0);
}

function mergeUsefulFields(fallback, primary) {
  const merged = { ...(fallback || {}) };
  for (const [key, value] of Object.entries(primary || {})) {
    if (hasUsefulProviderValue(value)) merged[key] = value;
  }
  return Object.keys(merged).length ? merged : null;
}

// Overlay CAMS samples on the fallback's complete, location-local time grid.
function mergeHourlyContext(primary, fallback) {
  const fallbackTimes = fallback?.time;
  const primaryTimes = primary?.time;
  if (!Array.isArray(fallbackTimes) || !fallbackTimes.length) return primary || fallback || null;
  if (!Array.isArray(primaryTimes) || !primaryTimes.length) return fallback;
  const fallbackOffset = Number(fallback.utcOffsetSeconds) || 0;
  const primaryOffset = Number(primary.utcOffsetSeconds) || 0;
  const merged = { ...fallback };
  for (const [key, values] of Object.entries(primary)) {
    if (key === 'time' || key === 'utcOffsetSeconds' || !Array.isArray(values)) continue;
    const output = Array.isArray(merged[key])
      ? merged[key].slice() : Array(fallbackTimes.length).fill(null);
    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (!hasUsefulProviderValue(value)) continue;
      const primaryMs = parseProviderTimeMs(primaryTimes[i], primaryOffset);
      if (!Number.isFinite(primaryMs)) continue;
      const fallbackIndex = nearestHourIndex(fallbackTimes, new Date(primaryMs).toISOString(), fallbackOffset);
      if (fallbackIndex < 0) continue;
      const fallbackMs = parseProviderTimeMs(fallbackTimes[fallbackIndex], fallbackOffset);
      if (!Number.isFinite(fallbackMs) || Math.abs(fallbackMs - primaryMs) > 90 * 60 * 1000) continue;
      output[fallbackIndex] = value;
    }
    merged[key] = output;
  }
  return { ...merged, time: fallbackTimes.slice(), utcOffsetSeconds: fallbackOffset };
}

function atmosphereNeedsContextFallback(result) {
  const daily = result?.daily || {};
  return String(result?.source || '').includes('cams')
    && [result?.uvIndex, result?.cloudCover, result?.temperatureC,
      daily.sunrise, daily.sunset, daily.peakAt,
      result?.airQuality?.european_aqi].some(value => !hasUsefulProviderValue(value));
}

function mergeAtmosphereContext(primary, fallback) {
  const merged = mergeUsefulFields(fallback, primary) || {};
  const source = [...new Set(`${primary?.source || ''}+${fallback?.source || ''}`
    .split('+').filter(Boolean))].join('+');
  return Object.assign(merged, {
    airQuality: mergeUsefulFields(fallback?.airQuality, primary?.airQuality),
    daily: mergeUsefulFields(fallback?.daily, primary?.daily),
    hourly: mergeHourlyContext(primary?.hourly, fallback?.hourly),
    source,
    confidence: Math.min(primary?.confidence ?? 1, fallback?.confidence ?? 1),
    fetchedAt: Date.now(),
  });
}

function providerOrder(cfg, coords = {}) {
  const ctx = Object.assign({}, cfg, coords);
  // NOAA NWS doesn't allow browser CORS, so it's explicit-only and only useful
  // for non-browser callers. CAMS runs through the deployment-owned fixed
  // operation; failure falls through to browser-direct Open-Meteo.
  if (cfg.mode === 'selfhost') return availableProviders([PROVIDERS.selfhost, PROVIDERS.openMeteo], ctx);
  if (cfg.mode === 'cams') return availableProviders([PROVIDERS.cams, PROVIDERS.openMeteo], ctx);
  if (cfg.mode === 'noaa') return availableProviders([PROVIDERS.noaa, PROVIDERS.openMeteo], ctx);
  if (cfg.mode === 'open-meteo') return availableProviders([PROVIDERS.openMeteo], ctx);
  // Auto: an explicit user server first, then the deployment CAMS operation,
  // then browser-direct Open-Meteo. On official hosts the CAMS operation is
  // pinned to the getbased relay and forced to the privacy grid server-side.
  const order = [];
  if (cfg.selfhostUrl) order.push(PROVIDERS.selfhost);
  order.push(PROVIDERS.cams);
  order.push(PROVIDERS.openMeteo);
  return availableProviders(order, ctx);
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

function cacheTtlMs(isoTime) {
  const requestMs = Date.parse(isoTime || '');
  if (!Number.isFinite(requestMs)) return 5 * 60 * 1000;
  const ageMs = Date.now() - requestMs;
  if (Math.abs(ageMs) <= 2 * 60 * 60 * 1000) return 5 * 60 * 1000;
  if (ageMs > 5 * 24 * 60 * 60 * 1000) return 24 * 60 * 60 * 1000;
  return 60 * 60 * 1000;
}

function readCache(key, isoTime) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.fetchedAt) return null;
    if (Date.now() - obj.fetchedAt > cacheTtlMs(isoTime)) return null;
    return obj;
  } catch (e) { return null; }
}

function cacheMatchesConfig(cached, cfg) {
  const source = String(cached?.source || '');
  if (!source) return true;
  if (cfg.mode === 'open-meteo') return source.startsWith('open_meteo');
  if (cfg.mode === 'selfhost' && cfg.selfhostUrl) {
    return source.startsWith('selfhost');
  }
  if (cfg.mode === 'auto') {
    return source.startsWith('selfhost') || source.startsWith('cams') || source.startsWith('open_meteo_cams');
  }
  return true;
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
        const cached = localStorage.getItem(k);
        if (!cached) continue;
        const obj = JSON.parse(cached);
        if (obj && obj.fetchedAt && (!best || obj.fetchedAt > best.fetchedAt)) best = obj;
      } catch (e) {
        if (isSunDebugRuntime()) {
          console.warn('[sun-uvdata] readStaleCache parse failed', k, getErrorName(e) || e);
        }
      }
    }
    return best;
  } catch (e) {
    if (isSunDebugRuntime()) {
      console.warn('[sun-uvdata] readStaleCache scan failed', getErrorName(e) || e);
    }
    return null;
  }
}

// One-time sweep of pre-v5 cache entries on first import. Idempotent —
// the marker key is only written once, so subsequent loads are no-ops.
try {
  if (typeof localStorage !== 'undefined' && !localStorage.getItem('meteo-cache-v5-purged')) {
    const stale = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('meteo:') && !k.startsWith('meteo:v5:')) stale.push(k);
    }
    for (const k of stale) localStorage.removeItem(k);
    localStorage.setItem('meteo-cache-v5-purged', '1');
  }
} catch (e) {
  if (isSunDebugRuntime()) {
    console.warn('[sun-uvdata] pre-v5 cache sweep failed', getErrorName(e) || e);
  }
}

function writeCache(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) {
    // Quota or serialization error. Surface in debug mode so the user
    // can triage why their conditions strip stops persisting across reloads.
    try {
      if (isSunDebugRuntime()) {
        console.warn('[sun-uvdata] writeCache failed', key, getErrorName(e) || e);
      }
    } catch {}
  }
}

// Wipe every current-version meteo cache entry from localStorage. Wired into the user-
// triggered "Refresh" button so a device that latched onto a degraded
// provider (e.g. cached an Open-Meteo-only response while CAMS was
// unreachable during a relay-side outage) can force a clean fetch
// without rebooting the tab. Also clears the readStaleCache fallback —
// otherwise a TTL'd entry would still resurrect after the next failed
// fetch. Returns the number of keys removed.
export function purgeMeteoCache() {
  let removed = 0;
  try {
    if (typeof localStorage === 'undefined') return 0;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    for (const k of keys) { try { localStorage.removeItem(k); removed++; } catch {} }
  } catch (e) {
    if (isSunDebugRuntime()) {
      console.warn('[sun-uvdata] purgeMeteoCache failed', getErrorName(e) || e);
    }
  }
  return removed;
}

// Response-size cap — matches api/proxy.js's CAMS relay guard
// (cc2e705). UV/atmosphere payloads are small JSON (hourly arrays for a
// few days, typically 10–50 KB); 256 KB leaves generous headroom for
// honest servers. Caps two distinct DoS surfaces:
//   1. User-configured selfhost URL serving a malicious huge payload
//      (Greptile re-review #175 caught this gap)
//   2. Compromised/buggy public endpoint suddenly returning a huge body
// Public-API paths are low risk in practice but still benefit from the
// same defence-in-depth — a bad day at Open-Meteo shouldn't OOM the tab.
const _UV_RESPONSE_CAP_BYTES = 256 * 1024;

async function fetchJson(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), NETWORK_TIMEOUT_MS);
  try {
    // Suppressing network errors as logging — providerOrder treats failures as
    // fallthrough signals, not bugs. The console error from a 404/CORS is
    // useful only when debugging a specific provider.
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Best-effort Content-Length pre-check — fast-fail when the server
    // honestly declares a too-large body. Server can lie or omit; the
    // streaming cap below is the actual guarantee.
    const declared = parseInt(res.headers.get('content-length') || '', 10);
    if (Number.isFinite(declared) && declared > _UV_RESPONSE_CAP_BYTES) {
      throw new Error(`Response declared ${declared} bytes — refusing (cap ${_UV_RESPONSE_CAP_BYTES})`);
    }
    // Streaming byte-counter cap — rejects mid-stream as soon as the
    // running total crosses the cap, before the full body buffers.
    // Falls through to res.json() when streaming isn't available
    // (older browsers / non-stream-capable response shapes).
    const reader = res.body?.getReader?.();
    if (!reader) return await res.json();
    const decoder = new TextDecoder();
    let total = 0;
    let text = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > _UV_RESPONSE_CAP_BYTES) {
        try { await reader.cancel(); } catch {}
        throw new Error(`Response exceeds ${_UV_RESPONSE_CAP_BYTES} bytes — refusing to trust`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } finally {
    clearTimeout(t);
  }
}

function isUSCoords(lat, lon) {
  // Continental US + Alaska + Hawaii rough bounding
  if (lat >= 24 && lat <= 49.5 && lon >= -125 && lon <= -66) return true;
  if (lat >= 51 && lat <= 71 && lon >= -180 && lon <= -130) return true; // AK
  if (lat >= 18 && lat <= 23 && lon >= -161 && lon <= -154) return true; // HI
  return false;
}

export {
  shapeNoaaResponse as _testShapeNoaaResponse,
  isUSCoords as _testIsUSCoords,
};
