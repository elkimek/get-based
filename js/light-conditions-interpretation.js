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

// What the UVI means for vit-D synthesis (Holick threshold).
export function _vitDLabel(uvi) {
  if (uvi == null || uvi < 1) return 'no vit-D synthesis';
  if (uvi < 3) return 'vit-D synthesis weak';
  if (uvi < 6) return 'vit-D synthesis moderate';
  if (uvi < 9) return 'vit-D synthesis strong';
  return 'vit-D synthesis ample (burn risk dominates)';
}

// "Time to MED" for the user — accounts for the real UVI curve from now
// until sunset, not a naive constant-UVI extrapolation. At 6pm with UVI
// 1.7 falling toward 0, naive math says "burn in 14 hours" which is
// nonsense — the sun sets first.
//
// Integrates the user's accumulated erythemal dose hour-by-hour using
// Open-Meteo's hourly forecast. Returns one of:
//   { kind: 'no-uv' }                  — UV near zero, no risk to compute
//   { kind: 'safe-til-sunset' }        — won't burn before sun is down
//   { kind: 'minutes', value: N }      — N minutes from now to MED
export function _timeToMed(uvi, fitzpatrick, atm) {
  if (uvi == null || uvi < 0.5) return { kind: 'no-uv' };
  // Standard MED in J/m² by Fitzpatrick type. UVI 1 ≈ 25 mW/m² erythemal.
  const medJoules = { I: 200, II: 250, III: 300, IV: 450, V: 600, VI: 1000 };
  const joulesToMed = medJoules[fitzpatrick] || medJoules.III;
  const bodyFraction = 0.20; // face + arms + hands + neck default
  const ratePerUvi = 25 * bodyFraction; // mW/m² of erythemal per UVI unit

  // Try the integrated path first — uses Open-Meteo's hourly UVI forecast
  // for today, accumulating dose from now until sunset.
  const hourly = atm?.hourly;
  const sunset = atm?.daily?.sunset;
  if (Array.isArray(hourly?.time) && Array.isArray(hourly?.uv_index) && sunset) {
    const sunsetMs = new Date(sunset).getTime();
    const now = Date.now();
    if (sunsetMs <= now) return { kind: 'no-uv' }; // already past sunset
    let cumulativeJ = 0;
    let lastT = now;
    for (let index = 0; index < hourly.time.length; index++) {
      const segmentStartTime = new Date(hourly.time[index]).getTime();
      const segmentEndTime = index + 1 < hourly.time.length
        ? new Date(hourly.time[index + 1]).getTime()
        : segmentStartTime + 3600000;
      // Skip hours fully before now
      if (segmentEndTime <= now) continue;
      // Stop at sunset
      if (segmentStartTime >= sunsetMs) break;
      const segmentStart = Math.max(segmentStartTime, lastT, now);
      const segmentEnd = Math.min(segmentEndTime, sunsetMs);
      if (segmentEnd <= segmentStart) continue;
      const segmentMinutes = (segmentEnd - segmentStart) / 60000;
      const hourlyUvi = hourly.uv_index[index] || 0;
      const erythemalRate = hourlyUvi * ratePerUvi; // mW/m²
      const joulesPerMinute = erythemalRate * 60 / 1000;
      const segmentJoules = joulesPerMinute * segmentMinutes;
      if (cumulativeJ + segmentJoules >= joulesToMed) {
        const remainingJoules = joulesToMed - cumulativeJ;
        const minutesIntoSegment = joulesPerMinute > 0 ? remainingJoules / joulesPerMinute : 0;
        const minutesFromNow = Math.round((segmentStart - now) / 60000 + minutesIntoSegment);
        return { kind: 'minutes', value: Math.max(0, minutesFromNow) };
      }
      cumulativeJ += segmentJoules;
      lastT = segmentEnd;
    }
    return { kind: 'safe-til-sunset' };
  }

  // Fallback — no hourly forecast available (e.g. CAMS / NOAA / offline).
  // Use constant-UVI extrapolation, but clamp at "won't burn today" if the
  // result exceeds time until sunset (when known).
  const erythemalRate = uvi * ratePerUvi;
  if (erythemalRate <= 0) return { kind: 'no-uv' };
  const joulesPerMinute = erythemalRate * 60 / 1000;
  const naiveMinutes = Math.round(joulesToMed / joulesPerMinute);
  if (sunset) {
    const minutesToSunset = Math.max(0, (new Date(sunset).getTime() - Date.now()) / 60000);
    if (naiveMinutes > minutesToSunset) return { kind: 'safe-til-sunset' };
  }
  return { kind: 'minutes', value: naiveMinutes };
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

// Sun-position sub — supporting context with shadow ratio + UV strength.
export function _sunPositionSub(elevationDegrees) {
  if (elevationDegrees == null || elevationDegrees < 0) return 'no UV';
  if (elevationDegrees < 5) return 'UV negligible';
  const ratio = 1 / Math.tan(elevationDegrees * Math.PI / 180);
  const roundedRatio = ratio.toFixed(1);
  if (elevationDegrees >= 70) return `UV peak · shadow ${roundedRatio}× height`;
  if (elevationDegrees >= 50) return `UV strong · shadow ${roundedRatio}× height`;
  if (elevationDegrees >= 30) return `UV building · shadow ${roundedRatio}× height`;
  if (elevationDegrees >= 15) return `UV moderate · shadow ${roundedRatio}× height`;
  return `UV weak · shadow ${roundedRatio}× height`;
}

// Compute the time of day when UV-A first reaches the ground (and when
// it stops). UV-A 320-400 nm requires sun elevation ~5° above the horizon
// — below that, atmospheric path is too long for meaningful 320-400 nm to
// penetrate. This is "biological dawn" / "biological dusk" — the moments
// when the eye + skin actually start receiving the violet/UV-A signals
// that drive circadian entrainment, α-MSH / β-endorphin release, and
// retinal dopamine. Much more biologically meaningful than civil sunrise.
//
// Returns { firstUVA: <Date>, lastUVA: <Date> } for the day, or nulls if
// the sun never rises high enough (polar winter) or coords unavailable.
//
// Threshold: 5° elevation. Reference: Hattar / Lambert eye-skin axis
// literature; OZONE-corrected UV-A penetration models (Madronich 1998).
export function _computeUvaWindow(coords, dateLike) {
  if (!coords || typeof interpretationDeps.solarZenithAngle !== 'function') {
    return { firstUVA: null, lastUVA: null };
  }
  const baseDate = dateLike ? new Date(dateLike) : new Date();
  const day = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  const SAMPLE_STEP_MIN = 1;
  const ELEVATION_THRESHOLD_DEG = 5;
  let firstUVA = null;
  let lastUVA = null;
  for (let minute = 0; minute < 24 * 60; minute += SAMPLE_STEP_MIN) {
    const time = new Date(day.getTime() + minute * 60_000);
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

export const TANNING_MODIFIERS_NOTE = 'Estimate based on Fitzpatrick skin type alone. Actual burn time also depends on genetics (e.g. MC1R variants), diet (omega-3 / antioxidants), recent sun history (tan), circadian state, sleep, and hydration. Use as a starting point, not gospel.';

// Friendly cloud-cover narrative — "Overcast" / "Partly cloudy" / "Clear sky".
export function _cloudNarrative(percent) {
  if (percent == null) return null;
  if (percent < 10) return 'Clear sky';
  if (percent < 30) return 'Mostly clear';
  if (percent < 60) return 'Partly cloudy';
  if (percent < 90) return 'Mostly cloudy';
  return 'Overcast';
}

// Aggregate AQ from multiple pollutants — return the worst-of category so
// a user with high NO2 but low PM2.5 isn't told "Good" (false reassurance).
export function _aggregateAQ(airQuality, fallbackEaqi) {
  const categories = [];
  if (Number.isFinite(fallbackEaqi)) {
    if (fallbackEaqi <= 20) categories.push({ cls: 'good', label: 'Good', score: 0, why: 'EAQI' });
    else if (fallbackEaqi <= 40) categories.push({ cls: 'good', label: 'Fair', score: 1, why: 'EAQI' });
    else if (fallbackEaqi <= 60) categories.push({ cls: 'moderate', label: 'Moderate', score: 2, why: 'EAQI' });
    else if (fallbackEaqi <= 80) categories.push({ cls: 'unhealthy-sensitive', label: 'Poor', score: 3, why: 'EAQI' });
    else if (fallbackEaqi <= 100) categories.push({ cls: 'unhealthy', label: 'Very poor', score: 4, why: 'EAQI' });
    else categories.push({ cls: 'hazardous', label: 'Extremely poor', score: 5, why: 'EAQI' });
  }
  if (airQuality) {
    const pm25 = airQuality.pm25;
    const pm10 = airQuality.pm10;
    const no2 = airQuality.no2;
    if (Number.isFinite(pm25)) {
      if (pm25 < 12) categories.push({ cls: 'good', label: 'Good', score: 0, why: 'PM2.5' });
      else if (pm25 < 35) categories.push({ cls: 'moderate', label: 'Moderate', score: 2, why: 'PM2.5' });
      else if (pm25 < 55) categories.push({ cls: 'unhealthy-sensitive', label: 'Unhealthy for sensitive', score: 3, why: 'PM2.5' });
      else if (pm25 < 150) categories.push({ cls: 'unhealthy', label: 'Unhealthy', score: 4, why: 'PM2.5' });
      else categories.push({ cls: 'hazardous', label: 'Hazardous', score: 5, why: 'PM2.5' });
    }
    if (Number.isFinite(pm10)) {
      if (pm10 < 54) categories.push({ cls: 'good', label: 'Good', score: 0, why: 'PM10' });
      else if (pm10 < 154) categories.push({ cls: 'moderate', label: 'Moderate', score: 2, why: 'PM10' });
      else if (pm10 < 254) categories.push({ cls: 'unhealthy-sensitive', label: 'Unhealthy for sensitive', score: 3, why: 'PM10' });
      else categories.push({ cls: 'unhealthy', label: 'Unhealthy', score: 4, why: 'PM10' });
    }
    if (Number.isFinite(no2)) {
      if (no2 < 40) categories.push({ cls: 'good', label: 'Good', score: 0, why: 'NO₂' });
      else if (no2 < 90) categories.push({ cls: 'moderate', label: 'Moderate', score: 2, why: 'NO₂' });
      else if (no2 < 120) categories.push({ cls: 'unhealthy-sensitive', label: 'Unhealthy for sensitive', score: 3, why: 'NO₂' });
      else if (no2 < 230) categories.push({ cls: 'unhealthy', label: 'Unhealthy', score: 4, why: 'NO₂' });
      else categories.push({ cls: 'hazardous', label: 'Hazardous', score: 5, why: 'NO₂' });
    }
  }
  if (categories.length === 0) return null;
  categories.sort((a, b) => b.score - a.score);
  return categories[0];
}

export function _fmtTime(iso) {
  if (!iso) return '—';
  const match = iso.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : iso;
}

export function _surfaceOzoneCls(microgramsPerCubicMeter) {
  if (microgramsPerCubicMeter == null) return null;
  if (microgramsPerCubicMeter < 50) return 'good';
  if (microgramsPerCubicMeter < 100) return 'moderate';
  if (microgramsPerCubicMeter < 180) return 'unhealthy-sensitive';
  if (microgramsPerCubicMeter < 240) return 'unhealthy';
  return 'hazardous';
}

export function _surfaceOzoneLabel(microgramsPerCubicMeter) {
  if (microgramsPerCubicMeter == null) return null;
  if (microgramsPerCubicMeter < 50) return { label: 'Clean', action: 'fine for any outdoor activity' };
  if (microgramsPerCubicMeter < 100) return { label: 'Mild', action: 'fine for most · sensitive may feel it' };
  if (microgramsPerCubicMeter < 180) return { label: 'Moderate', action: 'go easy on hard cardio outdoors' };
  if (microgramsPerCubicMeter < 240) return { label: 'Unhealthy', action: 'limit outdoor exercise' };
  return { label: 'Hazardous', action: 'avoid outdoor exercise' };
}

export const SMOG_HINT = 'Smog = ground-level ozone (O₃), formed when sunlight reacts with vehicle exhaust + industrial emissions. Higher levels irritate lungs and reduce exercise capacity, especially for asthma, COPD, kids, elderly. WHO 8-hour guideline: 100 µg/m³.';

export function _humanProviderLabel(source) {
  if (!source) return 'unknown';
  if (source.startsWith('open_meteo')) return 'Open-Meteo';
  if (source.startsWith('selfhost')) return 'self-hosted';
  if (source.startsWith('cams')) return 'CAMS';
  if (source.startsWith('noaa')) return 'NOAA NWS';
  if (source.startsWith('manual')) return 'manual entry';
  if (source.startsWith('zenith_offline') || source.startsWith('offline')) return 'offline estimate';
  return source.replace(/_stale$/, '');
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
      const zenith = _solarZenithAngle(new Date(), coords);
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
