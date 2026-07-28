// @ts-check
// sun-uvdata.js — Multi-source UV/ozone/atmosphere client for Sun Sessions
import { getErrorName } from './caught-error.js';
import { isValidExternalUrl } from './url-safety.js';
import { isSunDebugRuntime } from './sun-runtime.js';
import { initMeteoConfigCache, getMeteoConfig, saveMeteoConfig } from './sun-uvdata-config.js';
import {
  UV_SOURCE_CONFIDENCE,
  computeUVConfidence,
  interpolateAtmosphere,
  nearestHourIndex,
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
  solarZenithAngle,
};

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

let _warnedAboutRejectedSelfhostUrl = false;
// v2: invalidates old entries that baked sunrise/sunset/uvIndexMax from
// daily.sunrise[0] (which was 2-day-old data under past_days=2). Bump
// again any time the cached payload shape changes meaning.
const CACHE_PREFIX = 'meteo:v2:';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
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
  const { rLat, rLon } = roundCoords(lat, lon, cfg.privacyRounding);
  const time = isoTime || new Date().toISOString();
  const cacheKey = makeCacheKey(rLat, rLon, time);

  // Fresh cache hit (within TTL) — fast path, no network. Skipped on
  // noCache so user-triggered "force refresh" always reaches the provider.
  if (!noCache) {
    const cached = readCache(cacheKey);
    if (cached && cacheMatchesConfig(cached, cfg)) return cached;
  }

  // Provider order based on config
  const order = providerOrder(cfg, { lat: rLat, lon: rLon });

  for (let i = 0; i < order.length; i++) {
    const provider = order[i];
    try {
      const result = await provider.fetch({ lat: rLat, lon: rLon, isoTime: time, cfg });
      if (result) {
        // CAMS sometimes returns a structurally valid response with
        // sparse hourly fields (uvIndex/cloudCover/temperatureC all null
        // — only DU and AQI populated). The "Conditions now" widget then
        // renders a dash for UV even though Open-Meteo would have served
        // a real number. When that happens AND we have a downstream
        // provider, fetch it too and merge the missing primary fields,
        // keeping CAMS's superior DU/AOD overlay.
        const sparseUv = result.uvIndex == null && result.cloudCover == null;
        const hasFallback = i + 1 < order.length;
        if (sparseUv && hasFallback) {
          for (let j = i + 1; j < order.length; j++) {
            try {
              const fallback = await order[j].fetch({ lat: rLat, lon: rLon, isoTime: time, cfg });
              if (fallback && fallback.uvIndex != null) {
                const merged = Object.assign({}, fallback, {
                  // Preserve CAMS strengths over Open-Meteo where present.
                  ozoneDU: result.ozoneDU ?? fallback.ozoneDU,
                  airQuality: result.airQuality || fallback.airQuality,
                  // Annotate the merge for the inspector.
                  source: `${result.source}+${fallback.source}`,
                  confidence: Math.min(result.confidence ?? 1, fallback.confidence ?? 1),
                  fetchedAt: Date.now(),
                });
                writeCache(cacheKey, merged);
                return merged;
              }
            } catch (e) { /* fall through to next */ }
          }
        }
        writeCache(cacheKey, result);
        return result;
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
      // Hosted CAMS relay → /api/proxy POSTs to the maintainer's
      // getbased-uvdata instance, which fronts the CDS-API and merges
      // Open-Meteo's hourly clouds/temp/UVI into the response. The
      // bearer for getbased-uvdata is injected server-side so the
      // token never reaches the browser. Self-hosters bypass this and
      // use the `selfhost` provider directly.
      const json = await fetchJson('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meteo: 'cams', latitude: lat, longitude: lon, time: isoTime }),
      });
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
      // Forecast API — UV/clouds/temp + daily sunrise/sunset for today and
      // hourly UVI across the day (for peak-finder). Open-Meteo's forecast
      // endpoint does not return total-column ozone (despite older docs);
      // ozone lives on the air-quality endpoint as `ozone` (µg/m³, NOT DU).
      // past_days=7 covers a typical week of retro-logging; without it
      // hydrating a session 3+ days old snaps to today's first available
      // hour (UVI 0) and the persisted atmosphere reads as wrong-day data.
      // Sessions older than 7 days fall through `_validateAtmCovers` below.
      const fcUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=uv_index,uv_index_clear_sky,cloud_cover,temperature_2m&daily=sunrise,sunset,uv_index_max&timezone=auto&past_days=7&forecast_days=1`;
      // Air-quality API — PM2.5, PM10, AOD, NO2, total-column ozone (DU
      // conversion handled in shape function — ~2.144 µg/m³ ≈ 1 DU at
      // standard atmosphere). Same past_days widening so hydrating past
      // sessions gets matching air-quality samples.
      const aqUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&hourly=pm10,pm2_5,nitrogen_dioxide,aerosol_optical_depth,ozone&current=pm2_5,pm10,european_aqi&past_days=7`;
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

function providerOrder(cfg, coords = {}) {
  const ctx = Object.assign({}, cfg, coords);
  // NOAA NWS doesn't allow browser CORS, so it's explicit-only and only
  // useful for non-browser callers. CAMS now runs through the
  // getbased-uvdata relay (api/proxy?meteo=cams) — the deploy decides
  // whether the upstream is wired by setting UVDATA_UPSTREAM env; when
  // it isn't, CAMS returns 503 and the auto-fallback chain reaches
  // Open-Meteo so the user still gets data.
  if (cfg.mode === 'manual') return [];
  if (cfg.mode === 'selfhost') return availableProviders([PROVIDERS.selfhost, PROVIDERS.openMeteo], ctx);
  if (cfg.mode === 'cams') return availableProviders([PROVIDERS.cams, PROVIDERS.openMeteo], ctx);
  if (cfg.mode === 'noaa') return availableProviders([PROVIDERS.noaa, PROVIDERS.openMeteo], ctx);
  if (cfg.mode === 'open-meteo') return availableProviders([PROVIDERS.openMeteo], ctx);
  // 'auto' — selfhost (if configured) → CAMS hosted relay → Open-Meteo.
  // CAMS goes ahead of Open-Meteo because the deploy controls whether
  // the upstream is reachable; if it isn't, it 503s fast and the chain
  // moves on. Per-coord CAMS calls are server-side cached by the
  // getbased-uvdata grid index, so the cost is one HTTPS round trip.
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

function cacheMatchesConfig(cached, cfg) {
  const source = String(cached?.source || '');
  if (!source) return true;
  if (cfg.mode === 'open-meteo') return source.startsWith('open_meteo');
  if (cfg.mode === 'manual') return false;
  if (cfg.mode === 'selfhost' && cfg.selfhostUrl) {
    return source.startsWith('selfhost');
  }
  if (cfg.mode === 'auto') {
    return source.startsWith('selfhost') || source.startsWith('cams') || source.startsWith('manual');
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

// One-time sweep of pre-v2 cache entries on first import. Idempotent —
// the marker key is only written once, so subsequent loads are no-ops.
try {
  if (typeof localStorage !== 'undefined' && !localStorage.getItem('meteo-cache-v2-purged')) {
    const stale = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('meteo:') && !k.startsWith('meteo:v2:')) stale.push(k);
    }
    for (const k of stale) localStorage.removeItem(k);
    localStorage.setItem('meteo-cache-v2-purged', '1');
  }
} catch (e) {
  if (isSunDebugRuntime()) {
    console.warn('[sun-uvdata] pre-v2 cache sweep failed', getErrorName(e) || e);
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

// Wipe every meteo:v2:* entry from localStorage. Wired into the user-
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
