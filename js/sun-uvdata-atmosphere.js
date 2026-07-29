// @ts-check
// sun-uvdata-atmosphere.js — Atmosphere normalization and solar/time math.

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

// ─── Response shapers ──────────────────────────────────────────────────

export function shapeOpenMeteoResponse(fcJson, aqJson, isoTime, sourceLabel) {
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

export function shapeCamsResponse(json, isoTime, sourceLabel) {
  // getbased-uvdata returns an Open-Meteo-shaped envelope (with optional
  // Open-Meteo merge) PLUS two extra hourly arrays (`ozone_du`, `aod`)
  // and a `_camsMeta` block. Run the standard Open-Meteo shaper first so
  // we inherit nearestHourIndex / unit conversions / sanity checks, then
  // overlay the CAMS extras: real DU ozone (vs Open-Meteo's missing or
  // tropospheric-only field) and the snapshot freshness metadata.
  if (!json) return null;
  const aqEnvelope = json.airQuality || json;
  const shaped = /** @type {any} */ (shapeOpenMeteoResponse(json, aqEnvelope, isoTime, sourceLabel));
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

export function shapeNoaaResponse(json) {
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

// When all providers fail (offline / network outage), estimate UV index
// from solar geometry alone. Crude — ignores ozone, aerosol, clouds.
// Marked as low-confidence in AI context.
export function zenithOfflineEstimate({ lat, lon, isoTime }) {
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
  const dayOfYear = Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000);
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
    return atmosphereAtIndex(atm.hourly, idx);
  }
  const t0 = parseNaiveHourMs(times[lowIdx], offsetS);
  const t1 = parseNaiveHourMs(times[lowIdx + 1], offsetS);
  const span = t1 - t0;
  const frac = span > 0 ? (targetMs - t0) / span : 0;
  return interpolateAtmosphereAtIndexes(atm.hourly, lowIdx, lowIdx + 1, frac);
}

function atmosphereAtIndex(hourly, i) {
  return {
    uvIndex: safeHourlyValue(hourly.uv_index, i),
    uvClearSky: safeHourlyValue(hourly.uv_index_clear_sky, i),
    cloudCover: safeHourlyValue(hourly.cloud_cover, i),
    temperatureC: safeHourlyValue(hourly.temperature_2m, i),
  };
}

function interpolateAtmosphereAtIndexes(hourly, i, j, frac) {
  const lerp = (arr) => {
    const a = safeHourlyValue(arr, i);
    const b = safeHourlyValue(arr, j);
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

function safeHourlyValue(arr, i) {
  if (!Array.isArray(arr)) return null;
  const v = arr[i];
  return Number.isFinite(v) ? v : null;
}
