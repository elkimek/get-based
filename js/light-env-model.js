// light-env-model.js — deterministic Light Environment scoring and picker model.
//
// Keep this module free of app state and persistence. light-env.js owns storage,
// "today" overrides, and rendering; this file owns canonical option lists and
// pure scoring math so tests and future AI/context code can use one source.

import {
  getRoomEveningHoursAfterSunset,
  hasRoomEveningAnswer,
  roomUsesEveningAfterSunset,
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
// (or "I don't know"), no occupancy answer, no measurements, no
// evening-hours answer. The severity helper returns an "incomplete"
// gray-dot in that case so users don't read the default green dot
// as "we verified you're good" when really it means "we know nothing
// about this room yet."
function _hasAnyRoomSignal(room, measurements) {
  if (!room) return false;
  const hasSource = room.primarySource && room.primarySource !== 'unknown';
  const hasHours = (+room.hoursOccupiedPerDay) > 0;
  const hasEvening = hasRoomEveningAnswer(room);
  const hasMeas = (measurements || []).length > 0;
  return hasSource || hasHours || hasEvening || hasMeas;
}

export function computeRoomSeverityForRoom(room, measurements = [], options = {}) {
  if (!room) return { tier: 0, color: 'green', label: 'Unknown', reason: 'No data yet' };

  // Gray-dot incomplete state for empty rooms — distinct from "Good".
  if (!_hasAnyRoomSignal(room, measurements)) {
    return { tier: 0, color: 'incomplete', label: 'Needs setup', reason: 'No signals yet — pick a light source, hours, or run a measurement.' };
  }

  let tier = 0;
  const reasons = [];

  // Source-based bias
  const src = room.primarySource;
  if (src === 'fluorescent') {
    tier = Math.max(tier, 2);
    reasons.push('fluorescent / CFL primary');
  } else if (src === 'led-cool' || src === 'led-tunable') {
    tier = Math.max(tier, 1);
    reasons.push('cool LED primary');
  } else if (src === 'natural-only' || src === 'incandescent' || src === 'halogen' || src === 'candle') {
    // friendly sources stay at 0 unless other signals pull them up
  }

  // After-sunset blue-light contamination.
  if (roomUsesEveningAfterSunset(room) && (src === 'led-cool' || src === 'led-tunable' || src === 'fluorescent')) {
    tier = Math.max(tier, 2);
    reasons.push('blue light after sunset');
  }

  // Latest flicker measurement (use most recent — flicker doesn't decay)
  const flickers = measurements.filter(m => m.tool === 'flicker').sort((a, b) => b.capturedAt - a.capturedAt);
  if (flickers.length) {
    const score = flickers[0].value;
    // saveMeasurement stores 0–3 for { Pristine, Mild, Moderate, Severe }
    if (score >= 3) { tier = Math.max(tier, 4); reasons.push('severe flicker measured'); }
    else if (score >= 2) { tier = Math.max(tier, 3); reasons.push('moderate flicker measured'); }
    else if (score >= 1) { tier = Math.max(tier, 1); reasons.push('mild flicker measured'); }
  }

  // Daytime lux (low → yellow). Treat any reading < 100 lux as low-indoor.
  const luxes = measurements.filter(m => m.tool === 'lux').sort((a, b) => b.capturedAt - a.capturedAt);
  if (luxes.length) {
    const lux = luxes[0].value;
    if (lux < 50 && (room.hoursOccupiedPerDay || 0) >= 2) {
      tier = Math.max(tier, 2);
      reasons.push('very low daytime lux for hours occupied');
    } else if (lux < 200 && (room.hoursOccupiedPerDay || 0) >= 4) {
      tier = Math.max(tier, 1);
      reasons.push('lower than office-bright for prolonged hours');
    }
  }

  // Bedroom-specific: any sleep-darkness reading tells a story
  const dark = measurements.filter(m => m.tool === 'darkness').sort((a, b) => b.capturedAt - a.capturedAt);
  if (dark.length && /bedroom|sleep/i.test(room.name || '')) {
    const lux = dark[0].value;
    if (lux > 1) { tier = Math.max(tier, 3); reasons.push('bedroom not dark enough for melatonin'); }
    else if (lux > 0.1) { tier = Math.max(tier, 2); reasons.push('measurable light leak in bedroom'); }
  }

  // Screens-in-this-room contribution: heavy evening blue exposure from
  // a screen in this room rolls into the room's severity. Compounds
  // multiplicatively with after-sunset use of cool-LED room lighting —
  // a bedroom with cool LED + a phone for 3 evening hours is worse
  // than either signal alone. Screens skipped today don't count.
  const isActiveToday = options.isActiveToday || (() => true);
  const screensHere = (options.screens || []).filter(s => s && isActiveToday(s));
  let unblockedEveHours = 0;
  for (const s of screensHere) {
    if (!s.blueBlockerEnabled && (s.eveningUseAfterSunset || 0) > 0) {
      unblockedEveHours += s.eveningUseAfterSunset;
    }
  }
  if (unblockedEveHours >= 3) {
    tier = Math.max(tier, 3);
    reasons.push(`${unblockedEveHours.toFixed(1)} hr/day evening screen exposure here`);
  } else if (unblockedEveHours >= 1) {
    tier = Math.max(tier, 2);
    reasons.push(`${unblockedEveHours.toFixed(1)} hr/day evening screen exposure here`);
  }

  const colorMap = ['green', 'yellow', 'orange', 'red', 'red'];
  const labelMap = ['Sleep-friendly', 'Mild', 'Moderate', 'Concerning', 'Severe'];
  return {
    tier,
    color: colorMap[Math.min(tier, 4)],
    label: labelMap[Math.min(tier, 4)],
    reason: reasons.length ? reasons.join(' · ') : 'No issues detected',
  };
}

// Evening blue exposure is the dominant junk-light vector for screens.
// Blocking the blue end (via blue-blocker glasses, software like
// f.lux/Night Shift, or amber-tinted filters) effectively zeroes the
// circadian penalty even at long evening hours. Without that, exposure
// scales with hours after sunset.
export function computeScreenStatus(screen) {
  if (!screen) return { tier: 0, color: 'green', label: 'Unknown', reason: 'no data' };
  const eveHours = screen.eveningUseAfterSunset || 0;
  const blocker = !!screen.blueBlockerEnabled;
  if (blocker) return { tier: 0, color: 'green', label: 'Mitigated', reason: 'blue blocker enabled' };
  if (eveHours <= 0) return { tier: 0, color: 'green', label: 'Daytime only', reason: 'no evening exposure' };
  if (eveHours < 1) return { tier: 1, color: 'yellow', label: 'Mild', reason: '< 1 evening hour' };
  if (eveHours < 3) return { tier: 2, color: 'orange', label: 'Moderate', reason: `${eveHours} evening hours without blocker` };
  return { tier: 3, color: 'red', label: 'Heavy', reason: `${eveHours}+ evening hours without blocker` };
}

// Returns { d2: hours, d3: hours, junkLightHours }
// d2: estimated daytime indoor-light deficit (low-lux hours during the solar day)
// d3: junk-light contamination (LED-only / blue-after-sunset hours)
export function computeDeficitAxesForEnvironment(env, options = {}) {
  if (!env) return { d2: 0, d3: 0 };
  const isActiveToday = options.isActiveToday || (() => true);
  let d2 = 0, d3 = 0;
  for (const r of env.rooms || []) {
    if (!r || !isActiveToday(r)) continue;
    const hours = r.hoursOccupiedPerDay || 0;
    if (hours <= 0) continue;
    // d2: any indoor hour without daylight contribution counts toward deficit
    d2 += hours;
    // d3: LED/fluorescent contamination
    if (['led-cool', 'led-warm', 'led-tunable', 'fluorescent'].includes(r.primarySource)) {
      d3 += hours * 0.6;
    }
    if (roomUsesEveningAfterSunset(r) && ['led-cool', 'led-tunable', 'fluorescent'].includes(r.primarySource)) {
      d3 += 1; // bonus penalty for blue-after-sunset
    }
  }
  for (const s of env.screens || []) {
    if (!s || !isActiveToday(s)) continue;
    const eveningHours = s.eveningUseAfterSunset || 0;
    if (eveningHours > 0 && !s.blueBlockerEnabled) d3 += eveningHours * 0.5;
  }
  return { d2, d3 };
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
  const { d2, d3 } = options.axes || computeDeficitAxesForEnvironment(env, { isActiveToday });
  // Tiers: 0 light, 1 moderate, 2 heavy
  let tier = 0, parts = [];
  // Round to integers — these are estimates, sub-hour precision is
  // false confidence ("8.2 hr/day" reads more rigorous than it is).
  if (d2 > 8) { tier = Math.max(tier, 2); parts.push(`${Math.round(d2)} hr indoors`); }
  else if (d2 > 4) { tier = Math.max(tier, 1); parts.push(`${Math.round(d2)} hr indoors`); }
  else if (d2 > 0) parts.push(`${Math.round(d2)} hr indoors`);
  if (d3 > 4) { tier = Math.max(tier, 2); parts.push(`${Math.round(d3)} hr blue-after-sunset`); }
  else if (d3 > 2) { tier = Math.max(tier, 1); parts.push(`${Math.round(d3)} hr blue-after-sunset`); }
  else if (d3 > 0) parts.push(`${Math.round(d3)} hr blue-after-sunset`);
  const labelMap = ['Light load', 'Moderate load', 'Heavy load'];
  const colorMap = ['green', 'orange', 'red'];
  let interp = '';
  if (d2 + d3 === 0) {
    // Distinguish "nothing mapped yet" from "everything skipped today."
    const totalItems = (env?.rooms?.length || 0) + (env?.screens?.length || 0);
    interp = totalItems === 0
      ? 'No mapped exposure yet — add a room or screen to start.'
      : 'Everything is skipped today — looks like a mostly-outdoor day.';
  }
  else if (tier === 0) interp = 'Mostly daylight-aligned with friendly indoor sources. Keep doing what you\'re doing.';
  else if (tier === 1 && d3 > d2 / 2) interp = 'Evening blue exposure is the bigger pull right now. Warmer bulbs after sunset or a blue blocker on screens would move the needle most.';
  else if (tier === 1) interp = 'Plenty of indoor daytime hours. More outdoor light — especially before 10am — is the highest-leverage fix.';
  else if (tier === 2 && d3 >= d2) interp = 'Long indoor hours AND heavy evening blue. Evening sources are dragging melatonin — fix those first, then add outdoor morning light.';
  else interp = 'Long daytime hours indoors plus meaningful evening contamination. Outdoor morning light + warmer evening bulbs would help.';
  return {
    tier,
    color: colorMap[tier],
    label: labelMap[tier],
    parts,
    interp,
    d2, d3,
  };
}
