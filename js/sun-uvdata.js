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
// Self-hosters override `METEO_BASE_URL` via Settings → Light & Sun → Sun Data Source.

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
//            airQuality: { pm25, aod, no2 }, source, confidence, fetchedAt }
export async function fetchAtmosphere({ lat, lon, isoTime } = {}) {
  if (lat == null || lon == null) {
    throw new Error('fetchAtmosphere requires { lat, lon }');
  }
  const cfg = getMeteoConfig();
  const { rLat, rLon } = roundCoords(lat, lon, cfg.privacyRounding);
  const time = isoTime || new Date().toISOString();
  const cacheKey = makeCacheKey(rLat, rLon, time);

  // Cache hit
  const cached = readCache(cacheKey);
  if (cached) return cached;

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

const PROVIDERS = {
  selfhost: {
    name: 'selfhost',
    available: (cfg) => Boolean(cfg.selfhostUrl),
    fetch: async ({ lat, lon, isoTime, cfg }) => {
      const url = `${cfg.selfhostUrl.replace(/\/$/, '')}/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=uv_index,uv_index_clear_sky,ozone,cloud_cover,temperature_2m`;
      const headers = {};
      if (cfg.selfhostBearer) headers.Authorization = `Bearer ${cfg.selfhostBearer}`;
      const json = await fetchJson(url, { headers });
      return shapeOpenMeteoResponse(json, isoTime, 'selfhost');
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
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=uv_index,uv_index_clear_sky,cloud_cover,temperature_2m`;
      const json = await fetchJson(url, {});
      return shapeOpenMeteoResponse(json, isoTime, 'open_meteo');
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

function shapeOpenMeteoResponse(json, isoTime, sourceLabel) {
  if (!json?.hourly?.time || !json.hourly.uv_index) return null;
  const idx = nearestHourIndex(json.hourly.time, isoTime);
  if (idx < 0) return null;
  const get = (k) => Array.isArray(json.hourly[k]) ? json.hourly[k][idx] : null;
  return {
    uvIndex: get('uv_index'),
    uvClearSky: get('uv_index_clear_sky'),
    ozoneDU: get('ozone'),
    cloudCover: get('cloud_cover'),
    temperatureC: get('temperature_2m'),
    airQuality: null,
    source: sourceLabel,
    confidence: UV_SOURCE_CONFIDENCE[sourceLabel] ?? 0.6,
    fetchedAt: Date.now(),
  };
}

function shapeCamsResponse(json, isoTime, sourceLabel) {
  // Placeholder shape — CAMS ADS responses are reshaped by api/proxy.js
  // to match the Open-Meteo hourly format for client uniformity.
  return shapeOpenMeteoResponse(json, isoTime, sourceLabel);
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

function writeCache(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) {}
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

function nearestHourIndex(timeArray, isoTime) {
  if (!Array.isArray(timeArray)) return -1;
  const target = new Date(isoTime).getTime();
  let bestIdx = -1, bestDelta = Infinity;
  for (let i = 0; i < timeArray.length; i++) {
    const t = new Date(timeArray[i]).getTime();
    const delta = Math.abs(t - target);
    if (delta < bestDelta) { bestDelta = delta; bestIdx = i; }
  }
  return bestIdx;
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
    getMeteoConfig,
    saveMeteoConfig,
    solarZenithAngle,
  });
}
