// @ts-check
// light-env-model.js — deterministic Light Environment scoring and picker model.
//
// Keep this module free of app state and persistence. light-env.js owns storage,
// "today" overrides, and rendering; this file owns canonical option lists and
// pure scoring math so tests and future AI/context code can use one source.

import {
  getRoomEveningHoursAfterSunset,
  hasRoomEveningAnswer,
} from './light-env-evening.js';

export const PRIMARY_SOURCES = [
  { key: 'led-cool',       label: 'LED — cool/daylight (4000K+)' },
  { key: 'led-warm',       label: 'LED — warm white (2700–3000K)' },
  { key: 'led-tunable',    label: 'LED — tunable / colour-changing' },
  { key: 'fluorescent',    label: 'Fluorescent / CFL' },
  { key: 'incandescent',   label: 'Incandescent (filament)' },
  { key: 'halogen',        label: 'Halogen' },
  { key: 'candle',         label: 'Candle / firelight' },
  { key: 'mixed',          label: 'Mixed (multiple sources)' },
  { key: 'natural-only',   label: 'Daylight only (no artificial)' },
  { key: 'unknown',        label: "I don't know" },
];

export const SCREEN_DEVICES = [
  { key: 'phone',   label: 'Phone' },
  { key: 'laptop',  label: 'Laptop' },
  { key: 'monitor', label: 'External monitor' },
  { key: 'tablet',  label: 'Tablet' },
  { key: 'tv',      label: 'TV' },
];

export const DAYLIGHT_LEVELS = [
  { key: 'low', label: 'Little' },
  { key: 'some', label: 'Some' },
  { key: 'strong', label: 'Strong' },
];

// 4 archetypes the user can pick from a glance, mapped to canonical
// schema values. Power users hit "More options…" to drill down into
// the 10-option dropdown.
export const SOURCE_ARCHETYPES = [
  { key: 'warm',         emoji: '🌅', label: 'Warm yellow',      storeAs: 'led-warm',    matches: ['led-warm', 'incandescent', 'halogen', 'candle'] },
  { key: 'cool',         emoji: '☀️', label: 'Cool white',       storeAs: 'led-cool',    matches: ['led-cool', 'led-tunable'] },
  { key: 'fluorescent',  emoji: '🌫️', label: 'Fluorescent tube', storeAs: 'fluorescent', matches: ['fluorescent'] },
  { key: 'mixed',        emoji: '❓', label: 'Mixed / unsure',   storeAs: 'mixed',       matches: ['mixed', 'unknown'] },
];

export function activeSourceArchetype(primarySource) {
  if (!primarySource) return null;
  for (const a of SOURCE_ARCHETYPES) {
    if (a.matches.includes(primarySource)) return a.key;
  }
  return null; // covers natural-only — power-user-only
}

// Hours buckets — store the bucket midpoint so downstream tiering math
// (currently "≥ 2 hr / ≥ 4 hr" thresholds) keeps working unchanged.
export const HOURS_BUCKETS = [
  { key: 'short',  label: '< 1 hr',   min: 0,    max: 1,   midpoint: 0.5 },
  { key: 'some',   label: '1–3 hr',   min: 1,    max: 3,   midpoint: 2 },
  { key: 'lots',   label: '3–6 hr',   min: 3,    max: 6,   midpoint: 4.5 },
  { key: 'most',   label: '6+ hr',    min: 6,    max: 24,  midpoint: 8 },
];

export function activeHoursBucket(hours) {
  if (hours == null || hours === '' || isNaN(+hours)) return null;
  const h = +hours;
  for (const b of HOURS_BUCKETS) {
    if (h >= b.min && h < b.max) return b.key;
  }
  return 'most';
}

// Evening-hours buckets. Stored as numeric `eveningHoursAfterSunset`;
// legacy boolean rows are normalized before rendering.
export const EVENING_BUCKETS = [
  { key: 'none', label: 'None',     midpoint: 0 },
  { key: 'lt1',  label: '< 1 hr',   midpoint: 0.5 },
  { key: 'mid',  label: '1–3 hr',   midpoint: 2 },
  { key: 'gt3',  label: '3+ hr',    midpoint: 4 },
];

export function activeEveningBucket(room) {
  if (!hasRoomEveningAnswer(room)) return null;
  const h = getRoomEveningHoursAfterSunset(room);
  if (h <= 0) return 'none';
  if (h < 1) return 'lt1';
  if (h < 3) return 'mid';
  return 'gt3';
}

// Default occupancy hours seeded by room name on first add. User can
// adjust immediately via the chip row — this just keeps them out of
// the lonely-empty-number-field cold start.
export function defaultHoursForName(name) {
  const n = (name || '').toLowerCase();
  if (/bedroom|sleep/.test(n)) return 8;
  if (/office|study|work/.test(n)) return 8;
  if (/living|family|den|lounge/.test(n)) return 4;
  if (/kitchen/.test(n)) return 2;
  if (/bath/.test(n)) return 1;
  return 4;
}

// True when the room has nothing graders can use — no source picked
// (or "I don't know"), no daylight answer, no measurements, and no
// evening-hours answer. Occupancy alone cannot grade light. The helper returns an "incomplete"
// gray-dot in that case so users don't read the default green dot
// as "we verified you're good" when really it means "we know nothing
// about this room yet."
function _hasAnyRoomSignal(room, measurements, screens = []) {
  if (!room) return false;
  const hasSource = room.primarySource && room.primarySource !== 'unknown';
  const hasDaylight = room.daylightLevel && room.daylightLevel !== 'unknown';
  const hasEvening = hasRoomEveningAnswer(room);
  const hasMeas = (measurements || []).length > 0;
  const hasScreen = (screens || []).length > 0;
  return hasSource || hasDaylight || hasEvening || hasMeas || hasScreen;
}

function _latestMeasurement(measurements, tool) {
  return (measurements || [])
    .filter(m => m?.tool === tool)
    .sort((a, b) => (b.capturedAt || 0) - (a.capturedAt || 0))[0] || null;
}

export function isQuantitativeLuxMeasurement(measurement) {
  if (!measurement || measurement.tool !== 'lux' || !Number.isFinite(Number(measurement.value))) return false;
  const source = measurement.extra?.source;
  // A phone camera remains an approximate brightness proxy even after a
  // one-point calibration: exposure pipelines, lenses, and spectral
  // response vary by device and light source. Keep camera estimates useful
  // in the UI, but do not let them drive the screening calculation.
  return source === 'AmbientLightSensor' || source === 'manual-entry' || source === 'meter-entry';
}

export function isQuantitativeDarknessMeasurement(measurement) {
  if (!measurement || measurement.tool !== 'darkness' || !Number.isFinite(Number(measurement.value))) return false;
  return measurement.extra?.method === 'meter-entry' || measurement.extra?.source === 'meter-entry';
}

function _isLikelyDaytimeMeasurement(measurement) {
  if (!measurement) return false;
  if (measurement.extra?.context === 'daytime') return true;
  if (measurement.extra?.context === 'evening' || measurement.extra?.context === 'sleep') return false;
  if (!measurement.capturedAt) return false;
  const hour = new Date(measurement.capturedAt).getHours();
  return hour >= 7 && hour < 19;
}

export function computeRoomSeverityForRoom(room, measurements = [], options = {}) {
  if (!room) return { tier: 0, color: 'incomplete', label: 'Unknown', reason: 'No data yet' };
  const isActiveToday = options.isActiveToday || (() => true);
  const screensHere = (options.screens || []).filter(s => s && isActiveToday(s));

  // Gray-dot incomplete state for empty rooms — distinct from "Good".
  if (!_hasAnyRoomSignal(room, measurements, screensHere)) {
    return { tier: 0, color: 'incomplete', label: 'Needs setup', reason: 'No signals yet — pick a light source, hours, or run a measurement.' };
  }

  let tier = 0;
  const reasons = [];

  // Source type alone is context, not a dose. Treat it as a concern only
  // when after-sunset use is also reported.
  const src = room.primarySource;
  const eveningHours = getRoomEveningHoursAfterSunset(room);
  if (eveningHours > 0 && (src === 'led-cool' || src === 'led-tunable' || src === 'fluorescent')) {
    tier = Math.max(tier, eveningHours >= 3 ? 2 : 1);
    reasons.push(`${eveningHours} hr after sunset under a cool-spectrum source; brightness is unknown`);
  } else if (eveningHours >= 3 && src === 'mixed') {
    tier = Math.max(tier, 1);
    reasons.push('long evening use under mixed lighting; brightness is unknown');
  }

  const flicker = _latestMeasurement(measurements, 'flicker');
  if (flicker) {
    const score = Number(flicker.value);
    if (score >= 3) { tier = Math.max(tier, 4); reasons.push('strong camera banding detected'); }
    else if (score >= 2) { tier = Math.max(tier, 3); reasons.push('clear camera banding detected'); }
    else if (score >= 1) { tier = Math.max(tier, 1); reasons.push('some camera banding detected'); }
  }

  // Grade photopic lux only when it came from a sensor or meter/manual
  // entry. Camera estimates stay contextual. Never call it melanopic EDI.
  const luxReading = _latestMeasurement(measurements, 'lux');
  if (isQuantitativeLuxMeasurement(luxReading) && _isLikelyDaytimeMeasurement(luxReading)) {
    const lux = Number(luxReading.value);
    if (lux < 50 && (room.hoursOccupiedPerDay || 0) >= 2) {
      tier = Math.max(tier, 2);
      reasons.push('very dim daytime spot check for a frequently used room');
    } else if (lux < 200 && (room.hoursOccupiedPerDay || 0) >= 4) {
      tier = Math.max(tier, 1);
      reasons.push('dim daytime spot check; spectrum-weighted light is unknown');
    }
  }

  // A camera darkness check stays qualitative. Only a user-entered meter
  // reading gets numerical grading, and photopic lux is still a rough
  // screen because the source spectrum is unknown.
  const dark = _latestMeasurement(measurements, 'darkness');
  if (isQuantitativeDarknessMeasurement(dark) && /bedroom|sleep/i.test(room.name || '')) {
    const lux = Number(dark.value);
    if (lux > 5) { tier = Math.max(tier, 3); reasons.push('sleep-time light measured; spectrum-weighted level is unknown'); }
    else if (lux > 1) { tier = Math.max(tier, 2); reasons.push('sleep-time light measured; check the source and spectrum'); }
    else if (lux > 0.1) { tier = Math.max(tier, 1); reasons.push('small sleep-time light leak measured'); }
  }

  // Screens-in-this-room contribution: reported evening screen use rolls
  // into the room's screening tier. Screens skipped today don't count.
  let screenTier = 0;
  let screenHours = 0;
  for (const s of screensHere) {
    const status = computeScreenStatus(s);
    screenTier = Math.max(screenTier, status.tier || 0);
    screenHours += Math.max(0, Number(s.eveningUseAfterSunset) || 0);
  }
  if (screenTier > 0) {
    tier = Math.max(tier, screenTier);
    reasons.push(`${screenHours.toFixed(1)} hr evening screen use here${screensHere.some(s => s.blueBlockerEnabled) ? '; blue reduction noted but not treated as zero exposure' : ''}`);
  }

  const colorMap = ['green', 'yellow', 'orange', 'red', 'red'];
  const labelMap = ['No concern flagged', 'Worth checking', 'Needs attention', 'High signal', 'Strong signal'];
  return {
    tier,
    color: colorMap[Math.min(tier, 4)],
    label: labelMap[Math.min(tier, 4)],
    reason: reasons.length ? reasons.join(' · ') : 'No issues detected',
  };
}

export function computeScreenStatus(screen) {
  if (!screen) return { tier: 0, color: 'incomplete', label: 'Unknown', reason: 'no data' };
  if (screen.eveningUseAfterSunset == null) {
    return { tier: 0, color: 'incomplete', label: 'Needs timing', reason: 'set time used after sunset' };
  }
  const eveHours = Math.max(0, Number(screen.eveningUseAfterSunset) || 0);
  const blocker = !!screen.blueBlockerEnabled;
  if (eveHours <= 0) return { tier: 0, color: 'green', label: 'Daytime only', reason: 'no use after sunset recorded' };
  let tier = eveHours < 1 ? 1 : eveHours < 3 ? 2 : 3;
  if (blocker) tier = Math.max(1, tier - 1);
  const colors = ['green', 'yellow', 'orange', 'red'];
  const labels = ['Daytime only', 'Low', 'Moderate', 'High'];
  return {
    tier,
    color: colors[tier],
    label: labels[tier],
    reason: `${eveHours} evening hour${eveHours === 1 ? '' : 's'}${blocker ? '; blue reduction may help, but brightness and duration still matter' : ''}`,
  };
}

// Two bounded screening scores, not doses or literal hours.
// d2: possible daytime-light opportunity gap, based on stated daylight or
//     a trustworthy daytime lux spot-check.
// d3: after-sunset exposure screen, based on reported hours and broad source.
export function computeDeficitAxesForEnvironment(env, options = {}) {
  if (!env) return { d2: 0, d3: 0, daylightKnown: 0, eveningKnown: 0, missingDaylightRooms: 0 };
  const isActiveToday = options.isActiveToday || (() => true);
  const getMeasurementsForRoom = options.getMeasurementsForRoom || (() => []);
  let d2 = 0, d3 = 0;
  let daylightKnown = 0, eveningKnown = 0, missingDaylightRooms = 0;
  for (const r of env.rooms || []) {
    if (!r || !isActiveToday(r)) continue;
    const hours = Math.min(24, Math.max(0, Number(r.hoursOccupiedPerDay) || 0));
    if (hours <= 0) continue;

    const measurements = getMeasurementsForRoom(r.id) || [];
    const lux = _latestMeasurement(measurements, 'lux');
    let daytimeFactor = null;
    if (isQuantitativeLuxMeasurement(lux) && _isLikelyDaytimeMeasurement(lux)) {
      const value = Number(lux.value);
      daytimeFactor = value < 50 ? 1 : value < 200 ? 0.7 : value < 500 ? 0.3 : 0;
    } else if (r.primarySource === 'natural-only' || r.daylightLevel === 'strong') {
      daytimeFactor = 0;
    } else if (r.daylightLevel === 'some') {
      daytimeFactor = 0.4;
    } else if (r.daylightLevel === 'low') {
      daytimeFactor = 0.8;
    }
    if (daytimeFactor == null) missingDaylightRooms++;
    else {
      daylightKnown++;
      d2 += Math.min(4, hours / 2) * daytimeFactor;
    }

    if (hasRoomEveningAnswer(r)) {
      eveningKnown++;
      const evening = Math.min(6, getRoomEveningHoursAfterSunset(r));
      const sourceWeight = {
        'natural-only': 0,
        candle: 0.1,
        incandescent: 0.25,
        halogen: 0.3,
        'led-warm': 0.45,
        mixed: 0.65,
        'led-tunable': 0.75,
        'led-cool': 1,
        fluorescent: 1,
        unknown: 0.6,
      }[r.primarySource] ?? 0.6;
      d3 += evening * sourceWeight;
    }
  }
  for (const s of env.screens || []) {
    if (!s || !isActiveToday(s)) continue;
    if (s.eveningUseAfterSunset == null) continue;
    eveningKnown++;
    const eveningHours = Math.min(6, Math.max(0, Number(s.eveningUseAfterSunset) || 0));
    d3 += eveningHours * (s.blueBlockerEnabled ? 0.6 : 1);
  }
  return {
    d2: Math.min(10, d2),
    d3: Math.min(10, d3),
    daylightKnown,
    eveningKnown,
    missingDaylightRooms,
  };
}

// Aggregate the deficit numbers into a plain-English burden tier.
// Used by the summary line at the bottom of the section so the user
// doesn't have to interpret raw "8.2 hr/day" numbers themselves.
//
// Interpretation copy follows three rules:
// - Verdict in 1 short sentence (what's heaviest right now).
// - Concrete action in 1 short sentence (the single thing that would
//   move the needle most given the tier + d2/d3 ratio).
// - Avoid "junk-light" jargon — say "evening blue exposure" instead,
//   which most users already understand.
export function computeIndoorBurdenForEnvironment(env, options = {}) {
  const isActiveToday = options.isActiveToday || (() => true);
  const axes = options.axes || computeDeficitAxesForEnvironment(env, {
    isActiveToday,
    getMeasurementsForRoom: options.getMeasurementsForRoom,
  });
  const { d2, d3 } = axes;
  let tier = 0;
  if (d2 > 5 || d3 > 5) tier = 2;
  else if (d2 > 2 || d3 > 2) tier = 1;
  const totalItems = (env?.rooms?.length || 0) + (env?.screens?.length || 0);
  const activeItems = [...(env?.rooms || []), ...(env?.screens || [])].filter(item => item && isActiveToday(item)).length;
  const allSkipped = totalItems > 0 && activeItems === 0;
  const knownSignals = (axes.daylightKnown || 0) + (axes.eveningKnown || 0);
  const incomplete = !allSkipped && totalItems > 0 && knownSignals === 0;
  const parts = [];
  if (axes.daylightKnown > 0) parts.push(`Daytime signal: ${d2 > 5 ? 'low' : d2 > 2 ? 'mixed' : 'supported'}`);
  if (axes.eveningKnown > 0) parts.push(`Evening light: ${d3 > 5 ? 'high' : d3 > 2 ? 'moderate' : 'lower'}`);
  if (axes.missingDaylightRooms > 0) parts.push(`${axes.missingDaylightRooms} daylight answer${axes.missingDaylightRooms === 1 ? '' : 's'} missing`);
  const labelMap = ['Generally aligned', 'Mixed signals', 'Needs attention'];
  const colorMap = ['green', 'orange', 'red'];
  let interp = '';
  if (d2 + d3 === 0) {
    interp = totalItems === 0
      ? 'No mapped exposure yet — add a room or screen to start.'
      : allSkipped
        ? 'Everything mapped is skipped today, so no current indoor-light screen is calculated.'
      : incomplete
        ? 'The rooms are mapped, but daylight and evening timing are still missing. Add those two signals before reading this as a verdict.'
        : 'No concern is flagged by the information entered. A room reading can make the picture more useful.';
  }
  else if (tier === 0) interp = 'The mapped pattern looks broadly day-and-evening aligned. This is a screening result, not a measured light dose.';
  else if (tier === 1 && d3 > d2) interp = 'Evening timing is the clearest opportunity. Lower brightness and warmer, less eye-direct light matter alongside any screen tint.';
  else if (tier === 1) interp = 'The daytime signal may be weak in one or more frequently used rooms. Confirm it with an eye-level reading or stronger daylight access.';
  else if (d3 >= d2) interp = 'The strongest signal is repeated after-sunset light exposure. Start with the brightest, closest source used near bedtime.';
  else interp = 'The strongest signal is a possible daytime-light gap. Confirm it before treating the screening score as a dose.';
  return {
    tier,
    color: incomplete || allSkipped ? 'incomplete' : colorMap[tier],
    label: allSkipped ? 'Skipped today' : incomplete ? 'Needs details' : labelMap[tier],
    parts,
    interp,
    d2, d3,
    daylightKnown: axes.daylightKnown || 0,
    eveningKnown: axes.eveningKnown || 0,
    missingDaylightRooms: axes.missingDaylightRooms || 0,
  };
}
