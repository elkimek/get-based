// sun-uvdata.js — Multi-source UV/ozone/atmosphere client for Sun Sessions
import { encryptedGetItem, encryptedSetItem, getEncryptionEnabled } from './crypto.js';
import { isValidExternalUrl } from './url-safety.js';
//
// Storage: meteo config (mode, selfhostUrl, selfhostBearer, privacyRounding)
// is encrypted at rest via crypto.js's encryptedSetItem / encryptedGetItem.
// `selfhostBearer` is sensitive — same threat-model class as the AI provider
// keys. The key `labcharts-meteo-config` is in `SENSITIVE_PATTERNS` (crypto.js)
// so encryptedSetItem auto-encrypts when the user has encryption enabled.
//
// To preserve the existing synchronous getMeteoConfig() API (sun-context.js,
// settings.js, the Sun-data-source picker all call it from sync paths),
// the decrypted config is cached in module state, refreshed at startup
// via initMeteoConfigCache(), and re-refreshed on encryption-state changes
// (disableEncryption / passphrase change). Cache miss falls back to a raw
// localStorage read which is correct for users without encryption enabled.
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
let _warnedAboutEmptySelfhost = false;
// Sync-friendly decrypted-config cache. Populated by initMeteoConfigCache()
// on startup + after every saveMeteoConfig(). Lets the rest of the app
// keep calling getMeteoConfig() synchronously even though the at-rest
// representation is AES-GCM-encrypted via encryptedGetItem.
let _meteoConfigCache = null;
// v2: invalidates old entries that baked sunrise/sunset/uvIndexMax from
// daily.sunrise[0] (which was 2-day-old data under past_days=2). Bump
// again any time the cached payload shape changes meaning.
const CACHE_PREFIX = 'meteo:v2:';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const NETWORK_TIMEOUT_MS = 8000;

// Per-source BASELINE confidence — best-case under ideal conditions
// (fresh snapshot, clear sky, sun high overhead, UVI well above the
// threshold gate). The real confidence shown to the user is computed
// from these via `computeUVConfidence()` below, which weights snapshot
// age, cloud cover, solar elevation, and UVI band so a CAMS reading
// at zenith=80° under heavy cloud isn't dishonestly reported as 95%.
//
// AI uses the COMPUTED value to discount correlations, not the static
// number — so a stale-grid session at low sun gets correctly down-
// weighted in the rolling correlation engine.
export const UV_SOURCE_CONFIDENCE = {
  manual_meter: 1.0,    // user with calibrated UV meter
  manual_entry: 0.85,   // user-entered without meter
  selfhost: 0.95,       // user-controlled CAMS mirror
  cams: 0.95,           // primary, KNMI-validated
  noaa_nws: 0.90,       // US official
  open_meteo: 0.65,     // GFS approximation
  zenith_offline: 0.40, // offline clear-sky-only estimate
};

// Compute real-time UV-source confidence from the baseline source +
// observable signals. Returns 0.05–0.99 (never 0 — we always have some
// signal — and never 1.0 unless the user typed a meter reading).
//
// Multiplicative penalty stack:
//   snapshotAgeSec > 24h    → ×0.50  (stale CAMS grid)
//   snapshotAgeSec > 12h    → ×0.85
//   snapshotAgeSec >  6h    → ×0.92
//   cloudCover > 0.8        → ×0.75  (heavy cloud destroys UV math)
//   cloudCover > 0.5        → ×0.92
//   zenithDeg > 80°         → ×0.55  (very low sun, model breaks down)
//   zenithDeg > 70°         → ×0.75
//   zenithDeg > 60°         → ×0.92
//   uvIndex < 0.5           → ×0.40  (essentially zero, model error dominant)
//   uvIndex < 2.0           → ×0.70  (below threshold-gate ramp)
//   isStale flag            → ×0.50  (server-side stale beacon)
//
// All penalties are independent — they reflect distinct uncertainty
// sources. Each is calibrated against the existing vitaminDIURange()
// per-zenith band so the two readouts stay in lockstep.
export function computeUVConfidence(opts = {}) {
  const {
    source = 'open_meteo',
    snapshotAgeSec = null,
    cloudCover = null,        // 0-1 OR 0-100; we normalise
    zenithDeg = null,
    uvIndex = null,
    isStale = false,
    manualOverridden = false, // user typed a UVI override → trust it absolutely
  } = opts;
  if (manualOverridden || source === 'manual_meter') return 1.0;
  let c = UV_SOURCE_CONFIDENCE[source] ?? 0.6;
  // Normalise cloud cover (some atm payloads use percent).
  let cc = cloudCover;
  if (cc != null && cc > 1) cc = cc / 100;
  // Snapshot age — only meaningful for sources that publish freshness.
  if (Number.isFinite(snapshotAgeSec)) {
    if (snapshotAgeSec > 86400) c *= 0.50;
    else if (snapshotAgeSec > 43200) c *= 0.85;
    else if (snapshotAgeSec > 21600) c *= 0.92;
  }
  // Cloud cover — composition data quality is independent of cloud,
  // but the UVI we COMPUTE from atmosphere + clouds + sun-angle is
  // less certain when clouds dominate.
  if (Number.isFinite(cc)) {
    if (cc > 0.8) c *= 0.75;
    else if (cc > 0.5) c *= 0.92;
  }
  // Solar elevation — at zenith>80° (elevation<10°) the air-mass scaling
  // amplifies any model error, exactly the same band where
  // vitaminDIURange widens to ±45%.
  if (Number.isFinite(zenithDeg)) {
    if (zenithDeg > 80) c *= 0.55;
    else if (zenithDeg > 70) c *= 0.75;
    else if (zenithDeg > 60) c *= 0.92;
  }
  // UVI band — below the synthesis threshold the relative model error
  // is huge even at high sun.
  if (Number.isFinite(uvIndex)) {
    if (uvIndex < 0.5) c *= 0.40;
    else if (uvIndex < 2.0) c *= 0.70;
  }
  if (isStale) c *= 0.50;
  // Floor + ceiling — never 0 (always some signal), never 1 unless meter.
  return Math.max(0.05, Math.min(0.99, c));
}

// ─── Config ────────────────────────────────────────────────────────────

// Build a sanitized config from a parsed JSON value. Allowlist-style — only
// the four known fields, type-checked. Defence-in-depth against a stored
// value bearing `{"__proto__": {...}}` from spoofing config: building a
// fresh defaultConfig() and assigning known keys means a hostile parsed
// value can't reach Object.prototype.
function _buildConfigFromParsed(parsed) {
  const cfg = defaultConfig();
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    if (typeof parsed.mode === 'string') cfg.mode = parsed.mode;
    if (typeof parsed.selfhostUrl === 'string') cfg.selfhostUrl = parsed.selfhostUrl;
    if (typeof parsed.selfhostBearer === 'string') cfg.selfhostBearer = parsed.selfhostBearer;
    if (Number.isFinite(parsed.privacyRounding)) cfg.privacyRounding = parsed.privacyRounding;
  }
  return cfg;
}

// Apply runtime migrations + selfhost-empty-URL sanity. Returns a possibly-
// new config plus a flag indicating whether the persisted record needs
// rewriting (legacy `cams`/`noaa` mode → `auto`).
function _applyConfigRuntimeFixups(cfg) {
  let needsPersist = false;
  // Migration: pre-v1.7.x configs may carry `mode: 'cams'` or `mode: 'noaa'`
  // — both removed from the picker as confusing / unhelpful (cams-only
  // breaks clouds/temp; NOAA blocks CORS). Map to 'auto' silently.
  if (cfg.mode === 'cams' || cfg.mode === 'noaa') {
    cfg.mode = 'auto';
    needsPersist = true;
  }
  // Sanity: `mode: 'selfhost'` with an empty `selfhostUrl` is a config
  // trap — the selfhost path falls through to Open-Meteo every request,
  // user expected CAMS quality. Treat as in-memory `auto` for sensible
  // behaviour, warn once per session, leave the persisted record alone
  // (the picker still shows what the user clicked).
  if (cfg.mode === 'selfhost' && (!cfg.selfhostUrl || cfg.selfhostUrl.trim() === '')) {
    if (!_warnedAboutEmptySelfhost) {
      try {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[meteo] mode=selfhost with empty selfhostUrl — falling back to auto for this session. Set the URL in Light & Sun → Sun data source, or switch mode to auto explicitly.');
        }
      } catch {}
      _warnedAboutEmptySelfhost = true;
    }
    cfg.mode = 'auto';
  }
  return { cfg, needsPersist };
}

// Async loader — decrypts via crypto.js's encryptedGetItem (which routes
// through the session key when encryption is enabled, falls through to
// raw localStorage otherwise). Called at startup from main.js's init
// sequence, and after encryption-state changes. Migration of pre-encrypt
// plaintext configs is automatic: encryptedGetItem returns the plaintext
// on first read, then saveMeteoConfig's encryptedSetItem writes it back
// in the new envelope.
export async function initMeteoConfigCache() {
  try {
    const raw = await encryptedGetItem(STORAGE_KEY);
    if (!raw) {
      _meteoConfigCache = defaultConfig();
      return;
    }
    let parsed;
    try { parsed = JSON.parse(raw); } catch { _meteoConfigCache = defaultConfig(); return; }
    const cfg = _buildConfigFromParsed(parsed);
    const { needsPersist } = _applyConfigRuntimeFixups(cfg);
    _meteoConfigCache = cfg;
    if (needsPersist) {
      // Persist via saveMeteoConfig so legacy plaintext lands in the
      // encrypted envelope on its first migration save.
      saveMeteoConfig(cfg);
    }
  } catch (e) {
    _meteoConfigCache = defaultConfig();
  }
}

export function getMeteoConfig() {
  // Read localStorage every call so direct writes (tests, cross-tab)
  // are observed without cache invalidation gymnastics. Only the
  // encrypted-envelope path needs the cache (decryption is async; the
  // cache holds the post-startup decrypted form so this function can
  // stay synchronous).
  let raw;
  try { raw = localStorage.getItem(STORAGE_KEY); } catch { raw = null; }
  if (!raw) return defaultConfig();
  // Encrypted envelope — return the decrypted form from the cache that
  // initMeteoConfigCache populated at startup. If the cache is empty
  // (race window or test env), fall back to defaults rather than treat
  // ciphertext as JSON.
  if (typeof raw === 'string' && raw.startsWith('v1:')) {
    if (_meteoConfigCache) {
      const { cfg } = _applyConfigRuntimeFixups(Object.assign({}, _meteoConfigCache));
      return cfg;
    }
    return defaultConfig();
  }
  // Plaintext path — parse inline, apply runtime fixups, persist if a
  // legacy mode was migrated. Tests that use raw localStorage.setItem
  // exercise this branch directly.
  try {
    const parsed = JSON.parse(raw);
    const cfg = _buildConfigFromParsed(parsed);
    const { cfg: out, needsPersist } = _applyConfigRuntimeFixups(cfg);
    if (needsPersist) {
      try { saveMeteoConfig(out); } catch {}
    }
    return out;
  } catch (e) {
    return defaultConfig();
  }
}

export function saveMeteoConfig(cfg) {
  // Cache update first — keeps the synchronous getMeteoConfig contract
  // working immediately. Read sequence: getMeteoConfig hits localStorage,
  // sees the value below, parses inline. Cache only matters as a fallback
  // for the encrypted-envelope branch where parsing inline would fail.
  _meteoConfigCache = _buildConfigFromParsed(cfg);
  const json = JSON.stringify(cfg);
  // Sync plaintext write when encryption is OFF — getMeteoConfig
  // observes the new value immediately on next read (covers tests + the
  // common no-encryption case). When encryption is ON, skip the sync
  // plaintext write so we don't briefly expose the bearer on disk; reads
  // in the gap fall back to the in-memory cache populated above.
  let encryptionOn = false;
  try { encryptionOn = getEncryptionEnabled(); } catch {}
  if (!encryptionOn) {
    try { localStorage.setItem(STORAGE_KEY, json); } catch {}
    return;
  }
  // Encryption ON — async write through encryptedSetItem so the bearer
  // is encrypted at rest. Fire-and-forget; existing callers don't await.
  (async () => {
    try {
      await encryptedSetItem(STORAGE_KEY, json);
    } catch (_) {
      // Last-resort fallback so a crypto.js failure doesn't lose the save
      try { localStorage.setItem(STORAGE_KEY, json); } catch {}
    }
  })();
}

function defaultConfig() {
  return {
    // 'auto'       — CAMS for ozone/aerosols + Open-Meteo for clouds/temp (best)
    // 'open-meteo' — Open-Meteo only, skip CAMS (privacy from CDS-API)
    // 'selfhost'   — user-run getbased-uvdata server (full privacy)
    // 'manual'     — UV-meter only, no network
    // Legacy values 'cams' and 'noaa' migrate to 'auto' on load (see getMeteoConfig).
    mode: 'auto',
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

function providerOrder(cfg) {
  // NOAA NWS doesn't allow browser CORS, so it's explicit-only and only
  // useful for non-browser callers. CAMS now runs through the
  // getbased-uvdata relay (api/proxy?meteo=cams) — the deploy decides
  // whether the upstream is wired by setting UVDATA_UPSTREAM env; when
  // it isn't, CAMS returns 503 and the auto-fallback chain reaches
  // Open-Meteo so the user still gets data.
  if (cfg.mode === 'manual') return [];
  if (cfg.mode === 'selfhost') return cfg.selfhostUrl ? [PROVIDERS.selfhost, PROVIDERS.openMeteo] : [PROVIDERS.openMeteo];
  if (cfg.mode === 'cams') return [PROVIDERS.cams, PROVIDERS.openMeteo];
  if (cfg.mode === 'noaa') return [PROVIDERS.noaa, PROVIDERS.openMeteo];
  if (cfg.mode === 'open-meteo') return [PROVIDERS.openMeteo];
  // 'auto' — selfhost (if configured) → CAMS hosted relay → Open-Meteo.
  // CAMS goes ahead of Open-Meteo because the deploy controls whether
  // the upstream is reachable; if it isn't, it 503s fast and the chain
  // moves on. Per-coord CAMS calls are server-side cached by the
  // getbased-uvdata grid index, so the cost is one HTTPS round trip.
  const order = [];
  if (cfg.selfhostUrl) order.push(PROVIDERS.selfhost);
  order.push(PROVIDERS.cams);
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

  // Daily sun-events + peak UVI (today). With past_days=2 +
  // forecast_days=1 the `daily` arrays span 3 calendar days
  // (day-before-yesterday, yesterday, today) — so we MUST locate today's
  // index via `daily.time` instead of blindly indexing [0], otherwise
  // sunrise/sunset/uvIndexMax come from 2 days ago and the sun-arc
  // events sort wrong (the now-marker ends up past the stale sunset
  // even though the user is mid-morning today).
  const daily = fcJson.daily || {};
  // Date prefix for the SESSION's local day, not wall-clock now. Anchoring
  // on isoTime (the session midpoint) means a retro-logged or pre-dawn
  // session pins to the day it actually happened — not "today" at fetch
  // time. The `daily` and `peakAt` resolutions below need the right day
  // or they pin to the wrong slice of past_days=2 + forecast_days=1.
  let todayPrefix = null;
  try {
    const offsetMs = (Number.isFinite(fcJson?.utc_offset_seconds) ? fcJson.utc_offset_seconds : 0) * 1000;
    const anchorMs = isoTime ? Date.parse(isoTime) : Date.now();
    const local = new Date((Number.isFinite(anchorMs) ? anchorMs : Date.now()) + offsetMs);
    const y = local.getUTCFullYear();
    const m = String(local.getUTCMonth() + 1).padStart(2, '0');
    const d = String(local.getUTCDate()).padStart(2, '0');
    todayPrefix = `${y}-${m}-${d}`;
  } catch (e) {}
  let todayDailyIdx = -1;
  if (Array.isArray(daily.time) && todayPrefix) {
    for (let i = 0; i < daily.time.length; i++) {
      const t = daily.time[i];
      if (typeof t === 'string' && t.startsWith(todayPrefix)) { todayDailyIdx = i; break; }
    }
  }
  // Last-resort fallback: assume Open-Meteo packed today as the LAST
  // entry (consistent with past_days=N + forecast_days=1) so we don't
  // silently regress to the day-before-yesterday bug if `daily.time`
  // is missing or formatted unexpectedly.
  if (todayDailyIdx < 0 && Array.isArray(daily.sunrise) && daily.sunrise.length > 0) {
    todayDailyIdx = daily.sunrise.length - 1;
  }
  const sunrise = Array.isArray(daily.sunrise) && todayDailyIdx >= 0 ? daily.sunrise[todayDailyIdx] : null;
  const sunset = Array.isArray(daily.sunset) && todayDailyIdx >= 0 ? daily.sunset[todayDailyIdx] : null;
  const uvIndexMax = Array.isArray(daily.uv_index_max) && todayDailyIdx >= 0 ? daily.uv_index_max[todayDailyIdx] : null;
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
  // getbased-uvdata returns an Open-Meteo-shaped envelope (with optional
  // Open-Meteo merge) PLUS two extra hourly arrays (`ozone_du`, `aod`)
  // and a `_camsMeta` block. Run the standard Open-Meteo shaper first so
  // we inherit nearestHourIndex / unit conversions / sanity checks, then
  // overlay the CAMS extras: real DU ozone (vs Open-Meteo's missing or
  // tropospheric-only field) and the snapshot freshness metadata.
  if (!json) return null;
  const aqEnvelope = json.airQuality || json;
  const shaped = shapeOpenMeteoResponse(json, aqEnvelope, isoTime, sourceLabel);
  if (!shaped) return null;
  // Overlay CAMS DU. shapeOpenMeteoResponse picked an hourly index based
  // on isoTime; replicate that to slice the same array slot here.
  const fcOffsetS = Number.isFinite(json?.utc_offset_seconds) ? json.utc_offset_seconds : 0;
  const idx = Array.isArray(json?.hourly?.time)
    ? nearestHourIndex(json.hourly.time, isoTime, fcOffsetS) : -1;
  if (idx >= 0 && Array.isArray(json?.hourly?.ozone_du)) {
    const du = json.hourly.ozone_du[idx];
    if (Number.isFinite(du)) shaped.ozoneDU = du;
  }
  if (idx >= 0 && Array.isArray(json?.hourly?.aod)) {
    const aod = json.hourly.aod[idx];
    if (Number.isFinite(aod)) {
      shaped.airQuality = shaped.airQuality || {};
      shaped.airQuality.aod = aod;
    }
  }
  if (json._camsMeta) shaped._camsMeta = json._camsMeta;
  // Server-computed daily peak UVI — `daily.uv_index_max_cams[0]` is
  // produced by the relay running Bird-Riordan reconstruction over each
  // hourly snapshot timestep with real CAMS ozone + AOD. More accurate
  // than Open-Meteo's GFS-approximated `daily.uv_index_max[0]` at edge
  // cases (low sun, broken cloud, ozone anomalies). Prefer the CAMS-fed
  // value when present; fall through to Open-Meteo's daily peak (which
  // shapeOpenMeteoResponse already wrote to `shaped.daily.uvIndexMax`)
  // when the relay didn't compute one.
  const daily = json?.daily;
  if (daily && Array.isArray(daily.uv_index_max_cams) && Number.isFinite(daily.uv_index_max_cams[0])) {
    shaped.daily = shaped.daily || {};
    shaped.daily.uvIndexMax = daily.uv_index_max_cams[0];
    if (Array.isArray(daily.uv_index_max_cams_at) && daily.uv_index_max_cams_at[0]) {
      shaped.daily.peakAt = daily.uv_index_max_cams_at[0];
    }
  }
  shaped.confidence = UV_SOURCE_CONFIDENCE.cams;
  shaped.source = sourceLabel || 'cams';
  return shaped;
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
      } catch (e) {
        if (typeof window !== 'undefined' && window.isDebugMode && window.isDebugMode()) {
          console.warn('[sun-uvdata] readStaleCache parse failed', k, e?.name || e);
        }
      }
    }
    return best;
  } catch (e) {
    if (typeof window !== 'undefined' && window.isDebugMode && window.isDebugMode()) {
      console.warn('[sun-uvdata] readStaleCache scan failed', e?.name || e);
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
  if (typeof window !== 'undefined' && window.isDebugMode && window.isDebugMode()) {
    console.warn('[sun-uvdata] pre-v2 cache sweep failed', e?.name || e);
  }
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
    if (typeof window !== 'undefined' && window.isDebugMode && window.isDebugMode()) {
      console.warn('[sun-uvdata] purgeMeteoCache failed', e?.name || e);
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
    purgeMeteoCache,
    solarZenithAngle,
    computeUVConfidence,
  });
}
