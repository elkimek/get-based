// @ts-check
// light-conditions-interpretation.js — Pure UV, sun, atmosphere, and timing interpretation.

/** @type {{ solarZenithAngle: null | ((date: Date, lat: number, lon: number) => number) }} */
const interpretationDeps = {
  solarZenithAngle: null,
};

export function configureLightConditionsInterpretation(deps = {}) {
  const previous = { ...interpretationDeps };
  if (Object.hasOwn(deps, 'solarZenithAngle')
      && (deps.solarZenithAngle === null || typeof deps.solarZenithAngle === 'function')) {
    interpretationDeps.solarZenithAngle = deps.solarZenithAngle;
  }
  return previous;
}

export function _solarZenithAngle(date, coords) {
  if (!coords || typeof interpretationDeps.solarZenithAngle !== 'function') return null;
  try {
    return interpretationDeps.solarZenithAngle(date, coords.lat, coords.lon);
  } catch (_) {
    return null;
  }
}

// Current-condition interpretation follows the WHO UVI protection bands.
// UVI is erythema-weighted, so this widget deliberately does not infer
// vitamin-D synthesis or a personal burn time from the scalar value.
export function _uviConditionLabel(uvi) {
  if (!Number.isFinite(uvi)) return '';
  if (uvi < 1) return 'Very low UV';
  if (uvi < 3) return 'Low UV';
  if (uvi < 6) return 'Moderate UV · protection recommended';
  if (uvi < 8) return 'High UV · protection needed';
  if (uvi < 11) return 'Very high UV · extra protection';
  return 'Extreme UV · avoid unprotected exposure';
}

// Format minutes as "Xh Ym" / "Xm" / "<1m"
export function _fmtMinutes(minutes) {
  if (minutes == null) return '—';
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes - hours * 60);
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

// Sun-position headline — what the sun's doing, in plain English. Used
// as the value cell instead of bare degrees.
export function _sunPositionLabel(elevationDegrees) {
  if (elevationDegrees == null) return '—';
  if (elevationDegrees < 0) return 'Sun set';
  if (elevationDegrees < 5) return 'At horizon';
  if (elevationDegrees < 15) return 'Very low';
  if (elevationDegrees < 30) return 'Low';
  if (elevationDegrees < 50) return 'Mid-sky';
  if (elevationDegrees < 70) return 'High';
  return 'Overhead';
}

// Sun-position sub — geometry-only context. Actual UVI also depends on
// clouds, ozone, aerosols, altitude, and reflection.
export function _sunPositionSub(elevationDegrees) {
  if (elevationDegrees == null || elevationDegrees < 0) return 'solar UV potential absent';
  if (elevationDegrees < 5) return 'solar UV potential minimal';
  const ratio = 1 / Math.tan(elevationDegrees * Math.PI / 180);
  const roundedRatio = ratio.toFixed(1);
  if (elevationDegrees >= 70) return `UV potential peak · shadow ${roundedRatio}× height`;
  if (elevationDegrees >= 50) return `UV potential high · shadow ${roundedRatio}× height`;
  if (elevationDegrees >= 30) return `UV potential building · shadow ${roundedRatio}× height`;
  if (elevationDegrees >= 15) return `UV potential moderate · shadow ${roundedRatio}× height`;
  return `UV potential low · shadow ${roundedRatio}× height`;
}

// Compute crossings of a fixed 5° solar-elevation transition. This is an
// operational marker for when surface UV-A becomes a more substantial
// photobiological input, not a claim that UV-A is literally absent outside
// the window or that downstream biology flips as one whole-body switch.
//
// Returns { firstUVA: <Date>, lastUVA: <Date> } for the day, or nulls if
// the sun never rises high enough (polar winter) or coords unavailable.
//
export function _computeUvaWindow(coords, dateLike, offsetSeconds = 0) {
  if (!coords || typeof interpretationDeps.solarZenithAngle !== 'function') {
    return { firstUVA: null, lastUVA: null };
  }
  const baseDate = dateLike ? new Date(dateLike) : new Date();
  const offsetMs = (Number(offsetSeconds) || 0) * 1000;
  const localDate = new Date(baseDate.getTime() + offsetMs);
  const dayStartMs = Date.UTC(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth(),
    localDate.getUTCDate()
  ) - offsetMs;
  const SAMPLE_STEP_MIN = 1;
  const ELEVATION_THRESHOLD_DEG = 5;
  let firstUVA = null;
  let lastUVA = null;
  for (let minute = 0; minute < 24 * 60; minute += SAMPLE_STEP_MIN) {
    const time = new Date(dayStartMs + minute * 60_000);
    const zenith = _solarZenithAngle(time, coords);
    if (zenith == null) continue;
    const elevation = 90 - zenith;
    if (elevation >= ELEVATION_THRESHOLD_DEG) {
      if (!firstUVA) firstUVA = time;
      lastUVA = time;
    }
  }
  return { firstUVA, lastUVA };
}

export const SHADOW_RULE_HINT = 'Shadow rule: when your shadow is shorter than you, UV is high (strong sunburn risk). When shadow is longer than you, UV is weak. Used by dermatology orgs as a no-meter outdoor heuristic.';

// Friendly cloud-cover narrative — "Overcast" / "Partly cloudy" / "Clear sky".
export function _cloudNarrative(percent) {
  if (percent == null) return null;
  if (percent < 10) return 'Clear sky';
  if (percent < 30) return 'Mostly clear';
  if (percent < 60) return 'Partly cloudy';
  if (percent < 90) return 'Mostly cloudy';
  return 'Overcast';
}

export function _europeanAQCategory(index) {
  if (!Number.isFinite(index)) return null;
  if (index <= 20) return { cls: 'good', label: 'Good', score: 0 };
  if (index <= 40) return { cls: 'good', label: 'Fair', score: 1 };
  if (index <= 60) return { cls: 'moderate', label: 'Moderate', score: 2 };
  if (index <= 80) return { cls: 'unhealthy-sensitive', label: 'Poor', score: 3 };
  if (index <= 100) return { cls: 'unhealthy', label: 'Very poor', score: 4 };
  return { cls: 'hazardous', label: 'Extremely poor', score: 5 };
}

// Trust the provider's consolidated European AQI and component indices.
// Raw instantaneous concentrations are not reclassified locally because
// the official pollutant bands use specific rolling-average windows.
export function _aggregateAQ(airQuality, fallbackEaqi) {
  const index = Number.isFinite(airQuality?.european_aqi)
    ? airQuality.european_aqi : fallbackEaqi;
  const category = _europeanAQCategory(index);
  if (!category) return null;
  const components = [
    ['PM2.5', airQuality?.european_aqi_pm2_5],
    ['PM10', airQuality?.european_aqi_pm10],
    ['NO₂', airQuality?.european_aqi_nitrogen_dioxide],
    ['O₃', airQuality?.european_aqi_ozone],
    ['SO₂', airQuality?.european_aqi_sulphur_dioxide],
  ].filter(([, value]) => Number.isFinite(value));
  components.sort((a, b) => Number(b[1]) - Number(a[1]));
  return { ...category, index, why: components[0]?.[0] || 'EAQI' };
}

export function _fmtTime(iso) {
  if (!iso) return '—';
  const match = iso.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : iso;
}

export const SMOG_HINT = 'Ground-level ozone (O₃) is an air pollutant. The displayed category uses the provider-computed European AQI ozone component; the µg/m³ value is context, not a category inferred from one instantaneous reading.';

export function _humanProviderLabel(source) {
  if (!source) return 'unknown';
  const normalized = source.replace(/_stale$/, '');
  if (normalized.includes('cams') && normalized.includes('open_meteo')) return 'CAMS + Open-Meteo';
  if (normalized.startsWith('open_meteo')) return 'Open-Meteo';
  if (normalized.startsWith('selfhost')) return 'self-hosted';
  if (normalized.startsWith('cams')) return 'CAMS';
  if (normalized.startsWith('noaa')) return 'NOAA NWS';
  if (normalized.startsWith('manual')) return 'legacy manual entry';
  if (normalized.startsWith('zenith_offline') || normalized.startsWith('offline')) return 'offline estimate';
  return normalized;
}

// Check the atmosphere response for plausibility — flag suspicious values
// that suggest a parser bug, a stale provider, or a cosmic-ray bit-flip.
export function _sanityCheckAtmosphere(atm, coords) {
  const warnings = [];
  if (atm.uvIndex != null) {
    if (atm.uvIndex < 0) warnings.push(`UVI is ${atm.uvIndex} (should be ≥ 0)`);
    if (atm.uvIndex > 16) warnings.push(`UVI is ${atm.uvIndex} (extreme — typical max ~12-13)`);
    const peak = atm.daily?.uvIndexMax;
    if (Number.isFinite(peak) && peak > 0 && atm.uvIndex > peak * 1.2) {
      warnings.push(`UVI ${atm.uvIndex.toFixed(1)} exceeds today's forecast peak (${peak.toFixed(1)}) — likely stale data, try Refresh`);
    }
    if (coords) {
      const zenith = _solarZenithAngle(new Date(atm.validAt || Date.now()), coords);
      if (zenith != null && zenith > 95 && atm.uvIndex > 0.3) {
        warnings.push(`UVI ${atm.uvIndex} reported but sun is ${Math.round(zenith - 90)}° below horizon`);
      }
    }
  }
  if (atm.cloudCover != null && (atm.cloudCover < 0 || atm.cloudCover > 100)) {
    warnings.push(`Cloud cover ${atm.cloudCover}% out of 0-100 range`);
  }
  const airQuality = atm.airQuality || {};
  if (airQuality.pm25 != null && airQuality.pm25 < 0) warnings.push(`PM2.5 reported as negative (${airQuality.pm25})`);
  if (airQuality.pm10 != null && airQuality.pm10 < 0) warnings.push(`PM10 reported as negative (${airQuality.pm10})`);
  if (airQuality.no2 != null && airQuality.no2 < 0) warnings.push(`NO₂ reported as negative (${airQuality.no2})`);
  if (airQuality.surfaceOzoneUgM3 != null) {
    if (airQuality.surfaceOzoneUgM3 < 0) warnings.push(`Surface ozone reported as negative (${airQuality.surfaceOzoneUgM3})`);
    else if (airQuality.surfaceOzoneUgM3 > 1000) warnings.push(`Surface ozone ${airQuality.surfaceOzoneUgM3} µg/m³ extreme — typical max ~400`);
  }
  if (airQuality.european_aqi != null && (airQuality.european_aqi < 0 || airQuality.european_aqi > 500)) {
    warnings.push(`European AQI ${airQuality.european_aqi} outside 0-500 range`);
  }
  if (atm.ozoneDU != null && (atm.ozoneDU < 100 || atm.ozoneDU > 600)) {
    warnings.push(`Ozone column ${atm.ozoneDU} DU outside typical 200-450 range`);
  }
  return warnings;
}

// Format elapsed milliseconds as mm:ss (under 1hr) or h:mm:ss (above).
export function _formatElapsedShort(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = value => String(value).padStart(2, '0');
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}
