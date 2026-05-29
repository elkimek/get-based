// light-env.js — Light Environment module: rooms, screens, indoor light dose.
//
// Peer of js/emf.js. Tracks the user's continuous indoor light exposure
// (dominant for most users — 8–14 hours/day under LEDs, fluorescent, or
// mixed sources). Feeds the deficit/junk-light axes that complement the
// episodic Sun Sessions log.
//
// Schema (already migrated in profile.js):
//   importedData.lightEnvironment = {
//     rooms: [{ name, primarySource, cct, hoursOccupiedPerDay,
//                eveningUseAfterSunset, flickerScore, ... }],
//     screens: [{ device, hoursPerDay, eveningUseAfterSunset, ... }],
//   }
//
// FIXME(legacy): `eveningUseAfterSunset` is the v1.5-era binary —
// chip-pickers now write `eveningHoursAfterSunset` (numeric). Both
// fields are dual-written here for backcompat. Removal requires a
// full consumer sweep across light-{audit,burden,env,screen}-ai-analysis.js
// + sun-context.js + 7 test asserts + a migration that converts older
// synced clients' boolean → numeric on read. Out-of-scope for the
// audit branch; landed as separate cleanup PR.

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification, showPromptDialog, showConfirmDialog } from './utils.js';
import { saveImportedData } from './data.js';
import { recordTombstone } from './data-merge.js';
import {
  configureLightEnvAudits,
  getLightAudits,
  renderLightAuditsBlock,
} from './light-env-audits.js';

export { getLightAudits, saveLightAudit, updateLightAudit, deleteLightAudit } from './light-env-audits.js';

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

// ─── Public API ────────────────────────────────────────────────────────

export function getEnvironment() {
  if (!state.importedData) return null;
  if (!state.importedData.lightEnvironment) {
    state.importedData.lightEnvironment = { rooms: [], screens: [] };
  }
  return state.importedData.lightEnvironment;
}

// Common room names used as smarter defaults — cycle through these in order
// before falling back to "Room N" so a fresh user lands on familiar labels.
const DEFAULT_ROOM_NAMES = ['Bedroom', 'Living room', 'Kitchen', 'Office', 'Bathroom'];

export async function addRoom(name) {
  const env = getEnvironment();
  if (!Array.isArray(env.rooms)) env.rooms = [];

  // Pre-fill primarySource from sunDefaults.homeLight when the user already
  // answered Home lighting in the Light setup card — saves a redundant pick.
  const homeLight = state.importedData?.sunDefaults?.homeLight;
  // Pre-fill hours by room name — bedroom/office default high, kitchen/
  // bath default low. User adjusts via chip row if their pattern differs;
  // beats opening the room to a lonely empty number field.
  const presetHours = defaultHoursForName(name);

  const id = `room_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  env.rooms.push({
    id,
    name: name || 'Room',
    primarySource: homeLight || 'unknown',
    cct: null,
    flickerScore: null,
    hoursOccupiedPerDay: presetHours,
    // New chip-picker field for evening exposure — null means unanswered.
    // Legacy `eveningUseAfterSunset` boolean stays at false for back-compat
    // with rooms saved before the chip picker existed.
    eveningHoursAfterSunset: null,
    eveningUseAfterSunset: false,
    notes: '',
  });
  await saveImportedData();
  // Return the new room's id so cross-module callers (Tool 8 Eye-Level
  // Audit auto-create-room path) can chain `await addRoom(label)` →
  // `saveMeasurement('lux', value, { roomId })` without having to grep
  // env.rooms[length-1] to find what they just created.
  return id;
}

// Pick the next default room name based on which common names haven't been
// used yet. Names are matched case-insensitively so "bedroom" and "Bedroom"
// don't collide. Falls back to "Room N" once the curated list is exhausted.
export function nextDefaultRoomName() {
  const env = getEnvironment();
  const usedLC = new Set((env?.rooms || []).map(r => (r.name || '').trim().toLowerCase()));
  for (const candidate of DEFAULT_ROOM_NAMES) {
    if (!usedLC.has(candidate.toLowerCase())) return candidate;
  }
  return `Room ${(env?.rooms?.length || 0) + 1}`;
}

// `updatedAt` is bumped on every patch so the per-array sync merge can
// resolve cross-device edit conflicts (higher updatedAt wins).
export async function updateRoom(id, patch) {
  const env = getEnvironment();
  const room = (env.rooms || []).find(r => r.id === id);
  if (!room) return;
  Object.assign(room, patch);
  room.updatedAt = Date.now();
  await saveImportedData();
}

export async function deleteRoom(id) {
  const env = getEnvironment();
  recordTombstone(state.importedData, 'lightEnvironment.rooms', id);
  env.rooms = (env.rooms || []).filter(r => r.id !== id);
  // Measurements are meaningful only in the room context where they
  // were taken. Deleting the room removes those readings instead of
  // moving them into an unmapped "portable" bucket.
  const measurements = state.importedData?.lightMeasurements;
  if (Array.isArray(measurements)) {
    state.importedData.lightMeasurements = measurements.filter(m => !m || m.roomId !== id);
  }
  if (Array.isArray(env.screens)) {
    for (const sc of env.screens) {
      if (sc && sc.roomId === id) sc.roomId = null;
    }
  }
  await saveImportedData();
}

export async function addScreen(device, roomId = null) {
  const env = getEnvironment();
  if (!Array.isArray(env.screens)) env.screens = [];
  env.screens.push({
    id: `scr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    device: device || 'phone',
    roomId: roomId || null,
    hoursPerDay: null,
    eveningUseAfterSunset: null,
    blueBlockerEnabled: false,
    flickerScore: null,
  });
  await saveImportedData();
}

// Filter screens to those belonging to a given room (or portable when
// roomId is null). Existing screen records without a roomId field are
// treated as portable so no migration is needed.
export function getScreensForRoom(roomId) {
  const env = getEnvironment();
  return (env?.screens || []).filter(s => (s.roomId || null) === (roomId || null));
}

// Today's date as YYYY-MM-DD in local time — used to scope per-day
// "skip today" toggles. Local date because the user's "today" is a
// circadian construct, not a UTC day.
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// True when an item (room or screen) is counted toward today's
// exposure. Default is active. A `todayOverride` field stamped with
// today's date can flip it to inactive ("skipped today"); stamps from
// any earlier date are ignored — the toggle auto-resets overnight
// without needing a cron / scheduler.
export function isActiveToday(item) {
  if (!item) return false;
  const ov = item.todayOverride;
  if (!ov || ov.date !== todayKey()) return true;
  return ov.active !== false;
}

// Toggle the "in use today" state for a room or screen. Always stamps
// today's date so a skip from yesterday auto-clears.
export async function setTodayActive(kind, id, active) {
  const env = getEnvironment();
  const list = kind === 'room' ? (env?.rooms || []) : (env?.screens || []);
  const item = list.find(x => x.id === id);
  if (!item) return;
  item.todayOverride = { date: todayKey(), active: !!active };
  item.updatedAt = Date.now();
  await saveImportedData();
}

export async function updateScreen(id, patch) {
  const env = getEnvironment();
  const scr = (env.screens || []).find(s => s.id === id);
  if (!scr) return;
  Object.assign(scr, patch);
  scr.updatedAt = Date.now();
  await saveImportedData();
}

export async function deleteScreen(id) {
  const env = getEnvironment();
  recordTombstone(state.importedData, 'lightEnvironment.screens', id);
  env.screens = (env.screens || []).filter(s => s.id !== id);
  await saveImportedData();
}

// ─── Per-room severity (Baubiologie-style at-a-glance dot) ───────────
//
// Mirrors the EMF Assessment severity-dot pattern: each room earns a 0–4
// tier from green (good) to red (concerning) based on what we know about
// it. Inputs:
//   • primarySource — fluorescent + cool LED bias the score upward
//   • after-sunset use of cool/tunable LED → blue-evening contamination
//   • flicker measurement (latest, if any) — the strongest signal we have
//     because IEEE PAR1789 thresholds are well-defined
//   • lux measurement (latest) — too-low daytime lux drags toward yellow,
//     too-bright bedroom evenings drag toward orange
// Returns { tier, color, label, reason } so the dot + tooltip can render
// from one source.
//
// Tier → CSS color token mapping intentionally matches EMF's so the two
// surfaces feel like one design system.

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
  const hasEvening = room.eveningHoursAfterSunset != null || room.eveningUseAfterSunset === true;
  const hasMeas = (measurements || []).length > 0;
  return hasSource || hasHours || hasEvening || hasMeas;
}

export function computeRoomSeverity(room, measurements = []) {
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

  // After-sunset blue-light contamination — derive the boolean from the
  // newer eveningHoursAfterSunset chip-picker if present, else fall back
  // to the legacy boolean field.
  const eveningActive = (room.eveningHoursAfterSunset != null)
    ? (+room.eveningHoursAfterSunset) > 0
    : !!room.eveningUseAfterSunset;
  if (eveningActive && (src === 'led-cool' || src === 'led-tunable' || src === 'fluorescent')) {
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
  const screensHere = getScreensForRoom(room.id).filter(isActiveToday);
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

// ─── Step 1 helpers — chip-picker mappings ─────────────────────────────
//
// The Step 1 form was a wall of dropdowns + lonely number fields. These
// helpers translate the underlying schema (10 source options, free-form
// numbers, boolean flag) into 4-archetype source chips, hours buckets,
// and evening-hours buckets — answers the user can give by *looking*
// at a bulb / their day.

// 4 archetypes the user can pick from a glance, mapped to canonical
// schema values. Power users hit "More options…" to drill down into
// the 10-option dropdown.
const SOURCE_ARCHETYPES = [
  { key: 'warm',         emoji: '🌅', label: 'Warm yellow',     storeAs: 'led-warm',    matches: ['led-warm', 'incandescent', 'halogen', 'candle'] },
  { key: 'cool',         emoji: '☀️', label: 'Cool white',      storeAs: 'led-cool',    matches: ['led-cool', 'led-tunable'] },
  { key: 'fluorescent',  emoji: '🌫️', label: 'Fluorescent tube', storeAs: 'fluorescent', matches: ['fluorescent'] },
  { key: 'mixed',        emoji: '❓', label: 'Mixed / unsure',   storeAs: 'mixed',       matches: ['mixed', 'unknown'] },
];

function activeSourceArchetype(primarySource) {
  if (!primarySource) return null;
  for (const a of SOURCE_ARCHETYPES) {
    if (a.matches.includes(primarySource)) return a.key;
  }
  return null; // covers natural-only — power-user-only
}

// Hours buckets — store the bucket midpoint so downstream tiering math
// (currently "≥ 2 hr / ≥ 4 hr" thresholds) keeps working unchanged.
const HOURS_BUCKETS = [
  { key: 'short',  label: '< 1 hr',   min: 0,    max: 1,   midpoint: 0.5 },
  { key: 'some',   label: '1–3 hr',   min: 1,    max: 3,   midpoint: 2 },
  { key: 'lots',   label: '3–6 hr',   min: 3,    max: 6,   midpoint: 4.5 },
  { key: 'most',   label: '6+ hr',    min: 6,    max: 24,  midpoint: 8 },
];

function activeHoursBucket(hours) {
  if (hours == null || hours === '' || isNaN(+hours)) return null;
  const h = +hours;
  for (const b of HOURS_BUCKETS) {
    if (h >= b.min && h < b.max) return b.key;
  }
  return 'most';
}

// Evening-hours buckets — replaces the binary eveningUseAfterSunset
// checkbox. Stored as a number on the new `eveningHoursAfterSunset`
// field; legacy boolean is left untouched but read as 1.5 (mid of
// "1–3 hr") when only the boolean is set.
const EVENING_BUCKETS = [
  { key: 'none', label: 'None',     midpoint: 0 },
  { key: 'lt1',  label: '< 1 hr',   midpoint: 0.5 },
  { key: 'mid',  label: '1–3 hr',   midpoint: 2 },
  { key: 'gt3',  label: '3+ hr',    midpoint: 4 },
];

function activeEveningBucket(room) {
  if (room.eveningHoursAfterSunset != null) {
    const h = +room.eveningHoursAfterSunset;
    if (h <= 0) return 'none';
    if (h < 1) return 'lt1';
    if (h < 3) return 'mid';
    return 'gt3';
  }
  if (room.eveningUseAfterSunset === true) return 'mid';  // legacy bool → 1–3 hr
  if (room.eveningUseAfterSunset === false) return 'none';
  return null; // unanswered
}

// Step 1 chip-picker render helpers — produce the inline chip rows
// for source / hours / evening, plus the "More options" reveal that
// drops back to the full 10-option dropdown for power users.

function renderSourcePicker(r) {
  const active = activeSourceArchetype(r.primarySource);
  const chips = SOURCE_ARCHETYPES.map(a => {
    const isActive = active === a.key;
    return `<button type="button" class="light-env-chip${isActive ? ' light-env-chip-active' : ''}" aria-pressed="${isActive ? 'true' : 'false'}" onclick="window.setLightEnvRoomSourceArchetype('${escapeAttr(r.id)}','${a.key}')">${a.emoji} ${escapeHTML(a.label)}</button>`;
  }).join('');
  // Power-user reveal — keep the full 10-option dropdown for users who
  // know their CCT spec or want "natural-only" / "tunable LED".
  const showFullDropdown = !active; // expand by default if we couldn't map their saved value into an archetype
  return `<div class="light-env-picker">
    <span class="light-env-picker-label">Light source</span>
    <div class="light-env-chip-row">${chips}</div>
    <details class="light-env-picker-more"${showFullDropdown ? ' open' : ''}>
      <summary>More source types…</summary>
      <select class="ctx-select" onchange="window.updateLightEnvRoomAndRender('${escapeAttr(r.id)}', { primarySource: this.value })" aria-label="Primary light source">
        ${PRIMARY_SOURCES.map(s => `<option value="${escapeAttr(s.key)}"${r.primarySource === s.key ? ' selected' : ''}>${escapeHTML(s.label)}</option>`).join('')}
      </select>
    </details>
  </div>`;
}

function renderHoursPicker(r) {
  const active = activeHoursBucket(r.hoursOccupiedPerDay);
  const chips = HOURS_BUCKETS.map(b => {
    const isActive = active === b.key;
    return `<button type="button" class="light-env-chip${isActive ? ' light-env-chip-active' : ''}" aria-pressed="${isActive ? 'true' : 'false'}" onclick="window.setLightEnvRoomHoursBucket('${escapeAttr(r.id)}','${b.key}')">${escapeHTML(b.label)}</button>`;
  }).join('');
  return `<div class="light-env-picker">
    <span class="light-env-picker-label">Time you spend here</span>
    <div class="light-env-chip-row">${chips}</div>
    <details class="light-env-picker-more">
      <summary>Set exact hours…</summary>
      <input type="number" min="0" max="24" step="0.5" class="ctx-input" placeholder="hr/day" value="${r.hoursOccupiedPerDay ?? ''}" oninput="window.updateLightEnvRoom('${escapeAttr(r.id)}', { hoursOccupiedPerDay: parseFloat(this.value) || 0 })" aria-label="Hours per day" />
    </details>
  </div>`;
}

function renderEveningPicker(r) {
  const active = activeEveningBucket(r);
  const chips = EVENING_BUCKETS.map(b => {
    const isActive = active === b.key;
    return `<button type="button" class="light-env-chip${isActive ? ' light-env-chip-active' : ''}" aria-pressed="${isActive ? 'true' : 'false'}" onclick="window.setLightEnvRoomEveningBucket('${escapeAttr(r.id)}','${b.key}')">${escapeHTML(b.label)}</button>`;
  }).join('');
  return `<div class="light-env-picker">
    <span class="light-env-picker-label">Time here after sunset</span>
    <div class="light-env-chip-row">${chips}</div>
  </div>`;
}

// Default occupancy hours seeded by room name on first add. User can
// adjust immediately via the chip row — this just keeps them out of
// the lonely-empty-number-field cold start.
function defaultHoursForName(name) {
  const n = (name || '').toLowerCase();
  if (/bedroom|sleep/.test(n)) return 8;
  if (/office|study|work/.test(n)) return 8;
  if (/living|family|den|lounge/.test(n)) return 4;
  if (/kitchen/.test(n)) return 2;
  if (/bath/.test(n)) return 1;
  return 4;
}

// ─── Per-screen status (mirror of computeRoomSeverity) ─────────────────
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
export function computeIndoorBurden() {
  const { d2, d3 } = computeDeficitAxes();
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
    const env = getEnvironment();
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

// ─── Derived deficit signals ──────────────────────────────────────────

// Returns { d2: hours, d3: hours, junkLightHours }
// d2: estimated daytime indoor-light deficit (low-lux hours during the solar day)
// d3: junk-light contamination (LED-only / blue-after-sunset hours)
export function computeDeficitAxes() {
  const env = getEnvironment();
  if (!env) return { d2: 0, d3: 0 };
  let d2 = 0, d3 = 0;
  for (const r of env.rooms || []) {
    if (!isActiveToday(r)) continue;
    const hours = r.hoursOccupiedPerDay || 0;
    if (hours <= 0) continue;
    // d2: any indoor hour without daylight contribution counts toward deficit
    d2 += hours;
    // d3: LED/fluorescent contamination
    if (['led-cool', 'led-warm', 'led-tunable', 'fluorescent'].includes(r.primarySource)) {
      d3 += hours * 0.6;
    }
    if (r.eveningUseAfterSunset && ['led-cool', 'led-tunable', 'fluorescent'].includes(r.primarySource)) {
      d3 += 1; // bonus penalty for blue-after-sunset
    }
  }
  for (const s of env.screens || []) {
    if (!isActiveToday(s)) continue;
    const eveningHours = s.eveningUseAfterSunset || 0;
    if (eveningHours > 0 && !s.blueBlockerEnabled) d3 += eveningHours * 0.5;
  }
  return { d2, d3 };
}

// ─── UI: Light Environment page (lives at /light-environment route) ───
//
// Layout: disclosure list (collapsed-by-default cards with severity
// dots; expanding reveals a Step 1/2/3 form). Mirrors the EMF
// Assessment + Light Audits pattern so the three sub-modules share one
// mental model. First render auto-expands a useful room, but explicit
// user collapse is preserved.

const ACTIVE_ROOM_KEY = 'labcharts-light-env-active-room';
const COLLAPSED_ROOM_ID = '__none__';

function readActiveRoomId() {
  try { return localStorage.getItem(ACTIVE_ROOM_KEY); } catch (e) { return null; }
}
function writeActiveRoomId(id) {
  try { id ? localStorage.setItem(ACTIVE_ROOM_KEY, id) : localStorage.removeItem(ACTIVE_ROOM_KEY); } catch (e) {}
}
function isRoomCollapseSentinel(id) {
  return id === COLLAPSED_ROOM_ID;
}
function cssAttrSelectorValue(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
function lightEnvRoomAnchor(id) {
  return `.light-env-room-disclosure[data-id="${cssAttrSelectorValue(id)}"]`;
}
function lightEnvScreenAnchor(id) {
  return `.light-env-screen-card[data-id="${cssAttrSelectorValue(id)}"]`;
}
function defaultActiveRoomId(rooms) {
  if (!Array.isArray(rooms) || rooms.length === 0) return null;
  if (rooms.length === 1) return rooms[0]?.id || null;
  const sorted = rooms.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return sorted[0]?.id || null;
}
function resolveActiveRoomId(rooms) {
  const storedActiveId = readActiveRoomId();
  if (isRoomCollapseSentinel(storedActiveId)) return null;
  if (storedActiveId && rooms.find(r => r.id === storedActiveId)) return storedActiveId;
  return defaultActiveRoomId(rooms);
}

function getMeasurementsFor(roomId) {
  if (typeof window.getMeasurementsForRoom !== 'function') return [];
  return window.getMeasurementsForRoom(roomId);
}

function fmtMeasureValue(m) {
  if (m.tool === 'lux') return Math.round(m.value).toLocaleString() + ' lux';
  if (m.tool === 'flicker') return ['pristine', 'mild', 'moderate', 'severe'][Math.min(m.value || 0, 3)] + ' flicker';
  if (m.tool === 'cct') return Math.round(m.value).toLocaleString() + ' K';
  if (m.tool === 'darkness') return (m.value < 1 ? m.value.toFixed(2) : Math.round(m.value)) + ' lux (sleep)';
  if (m.tool === 'spectrum') return String(m.value);
  if (m.tool === 'glass-transmission') return Math.round((m.value || 0) * 100) + '% transmits';
  if (m.tool === 'audit') {
    const n = Number.isFinite(m.value) ? m.value : (m?.extra?.rooms?.length || 0);
    return `${n} room snapshot${n === 1 ? '' : 's'}`;
  }
  return String(m.value);
}

function fmtMeasureTime(ts) {
  const days = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.round(days / 7)}w ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const TOOL_ICONS = {
  lux: '📏', flicker: '⚡', cct: '🎨', darkness: '🌙', spectrum: '🔬', 'glass-transmission': '🪟',
  audit: '👁',
};

// Per-day "in use today / skipped today" toggle. Auto-resets at
// midnight via the date stamp on the override (todayKey() check).
// Header-mode is icon-only (a check or slash) with a tooltip — most
// users never touch this so the verbose pill of the old layout was
// burning header real estate. `compact: true` collapses to icon;
// callers in body footers can pass false for the full text label.
function _renderTodayToggle(kind, id, activeToday, opts = {}) {
  const compact = opts.compact !== false;
  const cls = `light-env-today-toggle${activeToday ? ' light-env-today-on' : ' light-env-today-off'}${compact ? ' light-env-today-compact' : ''}`;
  const icon = activeToday ? '✓' : '⊘';
  const label = activeToday ? 'In use today' : 'Skipped today';
  const flipTo = activeToday ? 'false' : 'true';
  const tip = activeToday
    ? "Click to skip today — won't count toward today's exposure. Resets to 'in use' tomorrow."
    : "Click to use today — counts toward today's exposure.";
  const inner = compact ? `<span aria-hidden="true">${icon}</span><span class="visually-hidden">${escapeHTML(label)}</span>` : `${icon} ${escapeHTML(label)}`;
  return `<button type="button" class="${cls}" onclick="event.stopPropagation();window.setLightEnvTodayActive('${kind}', '${escapeAttr(id)}', ${flipTo})" title="${escapeAttr(tip)}" aria-label="${escapeAttr(label)} — click to flip" aria-pressed="${activeToday}">${inner}</button>`;
}

// Single screen card markup — used both at top level (portable) and
// nested inside a room card (compact mode). When compact, density
// ratchets down; the "Used in" dropdown lets the user reassign
// without leaving the page.
// Screen card — disclosure pattern matching rooms + audits + EMF.
// Collapsed header shows: status dot + device-icon + device-label +
// one-line summary (hours, evening, blocker) + today-toggle + chevron.
// Expanded body holds the full controls. Single global `_expandedScreenId`
// — tracking expansion isn't worth localStorage persistence here.
const SCREEN_DEVICE_ICONS = {
  phone: '📱', laptop: '💻', monitor: '🖥', tablet: '📲', tv: '📺',
};

let _expandedScreenId = null;

function _screenSummary(s, status) {
  const parts = [];
  const hours = s.hoursPerDay;
  if (hours != null && hours > 0) parts.push(`${hours} hr/day`);
  const eve = s.eveningUseAfterSunset;
  if (eve != null && eve > 0) parts.push(`${eve} hr evening`);
  else if (hours > 0) parts.push('daytime only');
  if (s.blueBlockerEnabled) parts.push('✓ blocker');
  return parts.join(' · ');
}

// Hours-per-day chip buckets — separate set from room HOURS_BUCKETS
// because screen total-day usage often skews lower (a phone is 3 hr,
// not 8). Stored as numeric midpoint, same as rooms.
const SCREEN_HOURS_BUCKETS = [
  { key: 'short',  label: '< 1 hr',  midpoint: 0.5, min: 0, max: 1 },
  { key: 'some',   label: '1–3 hr',  midpoint: 2,   min: 1, max: 3 },
  { key: 'lots',   label: '3–6 hr',  midpoint: 4.5, min: 3, max: 6 },
  { key: 'most',   label: '6+ hr',   midpoint: 8,   min: 6, max: 24 },
];

function activeScreenHoursBucket(hours) {
  if (hours == null || isNaN(+hours)) return null;
  const h = +hours;
  for (const b of SCREEN_HOURS_BUCKETS) if (h >= b.min && h < b.max) return b.key;
  return 'most';
}

function activeScreenEveningBucket(eve) {
  if (eve == null) return null;
  const h = +eve;
  if (h <= 0) return 'none';
  if (h < 1) return 'lt1';
  if (h < 3) return 'mid';
  return 'gt3';
}

function renderScreenCard(s, opts = {}) {
  const status = computeScreenStatus(s);
  const activeToday = isActiveToday(s);
  const expanded = _expandedScreenId === s.id;
  const env = getEnvironment();
  const rooms = env?.rooms || [];
  const deviceIcon = SCREEN_DEVICE_ICONS[s.device] || '📱';
  const deviceLabel = (SCREEN_DEVICES.find(d => d.key === s.device)?.label) || 'Device';
  const summary = _screenSummary(s, status);

  let html = `<div class="light-env-screen-card light-env-card-sev-${status.color}${activeToday ? '' : ' light-env-card-skipped'}${expanded ? ' expanded' : ''}" data-id="${escapeAttr(s.id)}">
    <div class="light-env-screen-card-head" role="button" tabindex="0" aria-expanded="${expanded ? 'true' : 'false'}" aria-label="${escapeAttr(deviceLabel + ' — ' + status.label + (summary ? ', ' + summary : '') + (expanded ? ', expanded' : ', collapsed'))}" onclick="window.toggleLightEnvScreenExpanded('${escapeAttr(s.id)}', event)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.toggleLightEnvScreenExpanded('${escapeAttr(s.id)}', event)}">
      <span class="light-env-sev-dot light-env-sev-${status.color}" title="${escapeAttr(status.label + ' — ' + status.reason)}"><span class="sr-only">${escapeHTML(status.label)}</span></span>
      <span class="light-env-screen-card-icon" aria-hidden="true">${deviceIcon}</span>
      <span class="light-env-screen-card-name">${escapeHTML(deviceLabel)}</span>
      ${expanded ? '' : `<span class="light-env-screen-card-summary">${escapeHTML(summary || 'Tap to set up')}</span>`}
      <span class="light-env-room-disclosure-spacer"></span>
      ${_renderTodayToggle('screen', s.id, activeToday)}
      ${expanded ? `<button class="light-env-overflow" onclick="event.stopPropagation();window.deleteLightEnvScreenConfirm('${escapeAttr(s.id)}')" title="Delete screen" aria-label="Delete screen">⋯</button>` : ''}
      <span class="light-env-room-disclosure-chevron" aria-hidden="true">${expanded ? '▾' : '▸'}</span>
    </div>`;

  if (expanded) html += renderScreenExpandedBody(s, rooms);
  html += `</div>`;
  return html;
}

function renderScreenExpandedBody(s, rooms) {
  const hoursActive = activeScreenHoursBucket(s.hoursPerDay);
  const eveActive = activeScreenEveningBucket(s.eveningUseAfterSunset);

  const hoursChips = SCREEN_HOURS_BUCKETS.map(b =>
    `<button type="button" class="light-env-chip${hoursActive === b.key ? ' light-env-chip-active' : ''}" aria-pressed="${hoursActive === b.key ? 'true' : 'false'}" onclick="window.setLightEnvScreenHoursBucket('${escapeAttr(s.id)}','${b.key}')">${escapeHTML(b.label)}</button>`
  ).join('');

  const eveBuckets = [
    { key: 'none', label: 'None',     midpoint: 0 },
    { key: 'lt1',  label: '< 1 hr',   midpoint: 0.5 },
    { key: 'mid',  label: '1–3 hr',   midpoint: 2 },
    { key: 'gt3',  label: '3+ hr',    midpoint: 4 },
  ];
  const eveChips = eveBuckets.map(b =>
    `<button type="button" class="light-env-chip${eveActive === b.key ? ' light-env-chip-active' : ''}" aria-pressed="${eveActive === b.key ? 'true' : 'false'}" onclick="window.setLightEnvScreenEveningBucket('${escapeAttr(s.id)}','${b.key}')">${escapeHTML(b.label)}</button>`
  ).join('');

  const roomOptions = rooms.length > 0
    ? `<select class="ctx-select light-env-screen-room" onchange="window.updateLightEnvScreenAndRender('${escapeAttr(s.id)}', { roomId: this.value || null })" aria-label="Used in room">
        <option value=""${!s.roomId ? ' selected' : ''}>Portable / multiple rooms</option>
        ${rooms.map(r => `<option value="${escapeAttr(r.id)}"${s.roomId === r.id ? ' selected' : ''}>${escapeHTML(r.name || 'Room')}</option>`).join('')}
      </select>`
    : '';

  return `<div class="light-env-screen-card-body">
    <div class="light-env-screen-meta-row">
      <label class="ctx-label">Device
        <select class="ctx-select" onchange="window.updateLightEnvScreenAndRender('${escapeAttr(s.id)}', { device: this.value })" aria-label="Device type">
          ${SCREEN_DEVICES.map(d => `<option value="${escapeAttr(d.key)}"${s.device === d.key ? ' selected' : ''}>${escapeHTML(d.label)}</option>`).join('')}
        </select>
      </label>
      ${roomOptions ? `<label class="ctx-label">Used in
        ${roomOptions}
      </label>` : ''}
    </div>
    <div class="light-env-picker">
      <span class="light-env-picker-label">Hours per day</span>
      <div class="light-env-chip-row">${hoursChips}</div>
    </div>
    <div class="light-env-picker">
      <span class="light-env-picker-label">Time after sunset</span>
      <div class="light-env-chip-row">${eveChips}</div>
    </div>
    <div class="light-env-screen-blocker" style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:8px">
      <span style="flex:1;min-width:0;font-size:13px;color:var(--text-secondary)">Blue blocker active
        <span style="display:block;font-size:11px;color:var(--text-muted);margin-top:2px">Glasses, f.lux, Night Shift, amber tint — zeroes the circadian penalty.</span>
      </span>
      <label class="toggle-switch">
        <input type="checkbox"${s.blueBlockerEnabled ? ' checked' : ''} onchange="window.updateLightEnvScreenAndRender('${escapeAttr(s.id)}', { blueBlockerEnabled: this.checked })" />
        <span class="toggle-slider"></span>
      </label>
    </div>
    ${typeof window !== 'undefined' && window.renderScreenAIBlock ? window.renderScreenAIBlock(s) : ''}
  </div>`;
}

// Quick-pick chip row for adding common rooms — eliminates the
// "Room 1" footgun and accelerates the common path. Hides chips for
// names already in use; "Other…" opens a prompt for custom names.
const ROOM_QUICK_PICKS = ['Bedroom', 'Living room', 'Kitchen', 'Office', 'Bathroom'];
const SCREEN_QUICK_PICK_LABELS = {
  phone: '📱 Phone',
  laptop: '💻 Laptop',
  monitor: '🖥 Monitor',
  tablet: '📲 Tablet',
  tv: '📺 TV',
};

function renderRoomQuickPicks(rooms) {
  const usedLC = new Set((rooms || []).map(r => (r.name || '').trim().toLowerCase()));
  const chips = ROOM_QUICK_PICKS
    .filter(name => !usedLC.has(name.toLowerCase()))
    .map(name => `<button class="light-env-quickpick" onclick="window.addLightEnvRoomNamed('${escapeAttr(name)}')">${escapeHTML(name)}</button>`)
    .join('');
  return `<div class="light-env-quickpicks-row">
    <span class="light-env-quickpicks-label">${rooms.length === 0 ? 'Start with' : 'Add'}:</span>
    ${chips}
    <button class="light-env-quickpick light-env-quickpick-other" onclick="window.addLightEnvRoomCustom()">Other…</button>
  </div>`;
}

function renderScreenQuickPicks(screens, roomId = null, preferred = ['phone', 'laptop', 'monitor', 'tablet', 'tv']) {
  const existing = new Set((screens || []).filter(s => (s.roomId || null) === (roomId || null)).map(s => s.device));
  const roomArg = roomId ? `'${escapeAttr(roomId)}'` : 'null';
  const chips = preferred
    .filter(device => !existing.has(device))
    .map(device => `<button class="light-env-quickpick" onclick="window.addLightEnvScreenWithDevice(${roomArg},'${escapeAttr(device)}')">${escapeHTML(SCREEN_QUICK_PICK_LABELS[device] || device)}</button>`)
    .join('');
  return `<div class="light-env-quickpicks-row light-env-screen-quickpicks">
    <span class="light-env-quickpicks-label">${existing.size === 0 ? 'Start with' : 'Add'}:</span>
    ${chips}
    <button class="light-env-quickpick light-env-quickpick-other" onclick="window.addLightEnvScreen(${roomArg})">Other…</button>
  </div>`;
}

// Compact source label for the collapsed header — full PRIMARY_SOURCES
// labels are too verbose ("LED — cool/daylight (4000K+)"). Returns
// '' for unknown so the header doesn't show a dangling "I don't know".
const PRIMARY_SOURCE_SHORT = {
  'led-cool': 'Cool LED',
  'led-warm': 'Warm LED',
  'led-tunable': 'Tunable LED',
  'fluorescent': 'Fluorescent',
  'incandescent': 'Incandescent',
  'halogen': 'Halogen',
  'candle': 'Candle',
  'mixed': 'Mixed',
  'natural-only': 'Natural only',
};

function renderEnvironmentLoadSummary() {
  const burden = computeIndoorBurden();
  const interpHTML = (typeof window !== 'undefined' && window.renderBurdenInterp)
    ? window.renderBurdenInterp(burden)
    : `<p class="light-env-summary-interp">${escapeHTML(burden.interp)}</p>`;
  // Reconcile the banner label with the AI verdict's dot when one exists.
  // The deterministic computeIndoorBurden() tier crosses to "Heavy" at
  // d2 > 8 hr — but the AI looks at the broader picture (sleep-room
  // contamination, evening blue, room-by-room context) and may legitimately
  // call it "moderate". Showing "HEAVY LOAD" as a header above an AI body
  // that says "moderate" was contradictory copy. When the AI verdict is
  // present + ok, drive the banner label/color from its dot so header +
  // body agree. Gray / missing AI → fall through to the deterministic
  // tier (this preserves behaviour for users without an AI provider).
  const aiVerdict = getEnvironment()?.burdenAI || null;
  const aiOk = aiVerdict?.status === 'ok' && ['green','yellow','red'].includes(aiVerdict?.dot);
  const bannerColor = aiOk ? aiVerdict.dot : burden.color;
  const bannerLabel = aiOk
    ? ({ green: 'Light load', yellow: 'Moderate load', red: 'Heavy load' }[aiVerdict.dot])
    : burden.label;
  return `<div class="light-env-summary light-env-summary-top light-env-summary-${bannerColor}">
    <div class="light-env-summary-kicker">Indoor light load</div>
    <div class="light-env-summary-head">
      <span class="light-env-summary-tier">${escapeHTML(bannerLabel)}</span>
      ${burden.parts.length ? `<span class="light-env-summary-parts">${escapeHTML(burden.parts.join(' · '))}</span>` : ''}
    </div>
    ${interpHTML}
  </div>`;
}

function formatLatestLightAudit(audits) {
  if (!audits.length) return 'No saved snapshots';
  const latest = audits
    .slice()
    .sort((a, b) => (b.createdAt || Date.parse(b.date || '') || 0) - (a.createdAt || Date.parse(a.date || '') || 0))[0];
  const label = latest?.label ? ` · ${latest.label}` : '';
  const date = latest?.date ? fmtMeasureTime(new Date(latest.date + 'T00:00:00').getTime()) : 'latest';
  return `${audits.length} audit${audits.length === 1 ? '' : 's'} · ${date}${label}`;
}

export function renderEnvironmentAssessmentSummary() {
  const env = getEnvironment();
  const rooms = env?.rooms || [];
  const screens = env?.screens || [];
  const audits = getLightAudits();
  const measurements = state.importedData?.lightMeasurements || [];
  const roomIds = new Set(rooms.map(r => r.id).filter(Boolean));
  const mappedMeasurements = measurements.filter(m => m?.roomId && roomIds.has(m.roomId));
  const burden = computeIndoorBurden();
  const activeRooms = rooms.filter(isActiveToday).length;
  const activeScreens = screens.filter(isActiveToday).length;
  const measuredRooms = new Set(mappedMeasurements.map(m => m.roomId)).size;
  const hasMapped = rooms.length > 0 || screens.length > 0;
  const hasRooms = rooms.length > 0;
  const actionLabel = hasMapped ? 'Open assessment' : 'Start assessment';
  const lead = hasMapped
    ? burden.interp
    : 'Map your bedroom, work areas, and screens once; update the assessment when bulbs, monitors, or evening routines change.';
  const metrics = [
    {
      label: 'Rooms',
      value: String(rooms.length),
      sub: rooms.length ? `${activeRooms} active today` : 'Start with bedroom',
    },
    {
      label: 'Screens',
      value: String(screens.length),
      sub: screens.length ? `${activeScreens} active today` : 'Portable or room-bound',
    },
  ];
  if (hasRooms) {
    metrics.push({
      label: 'Readings',
      value: String(mappedMeasurements.length),
      sub: measuredRooms ? `${measuredRooms} room${measuredRooms === 1 ? '' : 's'} measured` : 'Run lux/flicker/CCT',
    }, {
      label: 'Audits',
      value: String(audits.length),
      sub: formatLatestLightAudit(audits),
    });
  }
  return `<div class="light-env-assessment-summary light-env-assessment-summary-${escapeAttr(burden.color)}">
    <div class="light-env-assessment-status">
      <span class="light-env-summary-kicker">Indoor light load</span>
      <span class="light-env-assessment-tier">${escapeHTML(burden.label)}</span>
      ${burden.parts.length ? `<span class="light-env-assessment-parts">${escapeHTML(burden.parts.join(' · '))}</span>` : ''}
    </div>
    <p class="light-env-assessment-lead">${escapeHTML(lead)}</p>
    <div class="light-env-assessment-metrics">
      ${metrics.map(m => `<div class="light-env-assessment-metric">
        <span class="light-env-assessment-metric-label">${escapeHTML(m.label)}</span>
        <strong>${escapeHTML(m.value)}</strong>
        <span>${escapeHTML(m.sub)}</span>
      </div>`).join('')}
    </div>
    <div class="light-env-assessment-actions">
      <button class="dashboard-action-btn dashboard-action-btn-primary" onclick="window.openLightEnvironmentAssessment && window.openLightEnvironmentAssessment()">${escapeHTML(actionLabel)}</button>
      ${rooms.length ? `<button class="dashboard-action-btn" onclick="window.openLightEnvironmentAssessment && window.openLightEnvironmentAssessment();setTimeout(() => window.saveLightAuditFromUI && window.saveLightAuditFromUI(), 0)">Save audit</button>` : ''}
    </div>
  </div>`;
}

const LIGHT_ENV_ASSESSMENT_OVERLAY_ID = 'light-env-assessment-overlay';

function getLightEnvironmentAssessmentOverlay() {
  return document.getElementById(LIGHT_ENV_ASSESSMENT_OVERLAY_ID);
}

function isLightEnvironmentAssessmentOpen() {
  return !!getLightEnvironmentAssessmentOverlay();
}

function renderLightEnvironmentAssessmentModal() {
  let overlay = getLightEnvironmentAssessmentOverlay();
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = LIGHT_ENV_ASSESSMENT_OVERLAY_ID;
    overlay.className = 'modal-overlay show light-env-assessment-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) window.closeLightEnvironmentAssessment?.();
    });
    document.body.appendChild(overlay);
  }
  overlay.classList.add('show');
  overlay.innerHTML = `<div class="modal light-env-assessment-modal" role="dialog" aria-modal="true" aria-labelledby="light-env-assessment-title">
    <button class="modal-close" onclick="window.closeLightEnvironmentAssessment && window.closeLightEnvironmentAssessment()" aria-label="Close">×</button>
    <div class="modal-header">
      <h3 id="light-env-assessment-title">Indoor Light Assessment</h3>
    </div>
    <p class="light-env-assessment-modal-copy">Map the rooms, screens, and readings that shape your indoor day. Save audit snapshots before and after changes to compare what moved.</p>
    ${renderEnvironmentSection({ embedded: true })}
  </div>`;
}

export function openLightEnvironmentAssessment() {
  renderLightEnvironmentAssessmentModal();
}

export function closeLightEnvironmentAssessment() {
  getLightEnvironmentAssessmentOverlay()?.remove();
}

export function refreshLightEnvironmentAssessment() {
  if (isLightEnvironmentAssessmentOpen()) renderLightEnvironmentAssessmentModal();
}

function setLightEnvironmentAssessmentScrollTop(scrollTop) {
  const modal = getLightEnvironmentAssessmentOverlay()?.querySelector('.light-env-assessment-modal');
  if (!modal) return;
  const apply = () => { modal.scrollTop = Math.max(0, scrollTop || 0); };
  apply();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply);
}

function scrollLightEnvironmentAssessmentTo(selector, fallbackSelector = '') {
  const overlay = getLightEnvironmentAssessmentOverlay();
  const modal = overlay?.querySelector('.light-env-assessment-modal');
  const target = selector ? modal?.querySelector(selector) : null;
  const fallback = fallbackSelector ? modal?.querySelector(fallbackSelector) : null;
  const anchor = target || fallback;
  if (!modal || !anchor) return;
  const apply = () => {
    const modalRect = modal.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    modal.scrollTop = Math.max(0, modal.scrollTop + anchorRect.top - modalRect.top - 8);
  };
  apply();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply);
  setTimeout(apply, 0);
  setTimeout(apply, 60);
}

function refreshLightEnvironmentUI(options = {}) {
  const modal = getLightEnvironmentAssessmentOverlay()?.querySelector('.light-env-assessment-modal');
  const priorScrollTop = modal?.scrollTop || 0;
  refreshLightEnvironmentAssessment();
  if (options.scrollAnchor) scrollLightEnvironmentAssessmentTo(options.scrollAnchor, options.fallbackScrollAnchor);
  else if (priorScrollTop) setLightEnvironmentAssessmentScrollTop(priorScrollTop);
  if (window.navigate && state.currentView === 'light') {
    window.navigate('light', options.scrollAnchor ? { scrollAnchor: options.scrollAnchor } : undefined);
  }
}

// Disclosure-pattern room card. Header shows: name · severity dot ·
// hours · source · today-toggle · expand affordance. Click anywhere on
// the header (except interactive children) to toggle expand. Expanded
// state reveals the Step 1/2/3 body.
function renderRoomDisclosure(r, expanded) {
  const measurements = getMeasurementsFor(r.id).sort((a, b) => b.capturedAt - a.capturedAt);
  const sev = computeRoomSeverity(r, measurements);
  const activeToday = isActiveToday(r);
  const sourceShort = PRIMARY_SOURCE_SHORT[r.primarySource] || '';
  const hours = r.hoursOccupiedPerDay;
  const hoursLabel = hours ? `${hours} hr/day` : '';

  // Whether the evening-after-sunset signal is "on" in the current schema —
  // newer chip-picker field wins, falls back to legacy boolean.
  const eveningOn = (r.eveningHoursAfterSunset != null) ? (+r.eveningHoursAfterSunset) > 0 : !!r.eveningUseAfterSunset;
  const roomAriaLabel = `${r.name || 'Room'} — ${sev.label}${hoursLabel ? ', ' + hoursLabel : ''}${sourceShort ? ', ' + sourceShort : ''}${expanded ? ', expanded' : ', collapsed'}`;
  let html = `<div class="light-env-room-disclosure light-env-card-sev-${sev.color}${activeToday ? '' : ' light-env-card-skipped'}${expanded ? ' expanded' : ''}" data-id="${escapeAttr(r.id)}">
    <div class="light-env-room-disclosure-head" role="button" tabindex="0" aria-expanded="${expanded ? 'true' : 'false'}" aria-label="${escapeAttr(roomAriaLabel)}" onclick="window.toggleLightEnvRoomExpanded('${escapeAttr(r.id)}', event)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window.toggleLightEnvRoomExpanded('${escapeAttr(r.id)}', event)}">
      <span class="light-env-sev-dot light-env-sev-${sev.color}" title="${escapeAttr(sev.label + ' — ' + sev.reason)}"><span class="sr-only">${escapeHTML(sev.label)}</span></span>
      <span class="light-env-room-disclosure-name">${escapeHTML(r.name || 'Room')}</span>
      ${expanded ? '' : `<span class="light-env-room-disclosure-signals">
        ${hoursLabel ? `<span class="light-env-room-signal">${escapeHTML(hoursLabel)}</span>` : ''}
        ${sourceShort ? `<span class="light-env-room-signal">${escapeHTML(sourceShort)}</span>` : ''}
        ${eveningOn ? `<span class="light-env-room-signal">evening</span>` : ''}
      </span>`}
      <span class="light-env-room-disclosure-spacer"></span>
      ${expanded ? '' : _renderTodayToggle('room', r.id, activeToday)}
      ${expanded ? `<button class="light-env-overflow" onclick="event.stopPropagation();window.deleteLightEnvRoomConfirm('${escapeAttr(r.id)}')" title="Delete room" aria-label="Delete room">⋯</button>` : ''}
      <span class="light-env-room-disclosure-chevron" aria-hidden="true">${expanded ? '▾' : '▸'}</span>
    </div>`;

  if (expanded) html += renderRoomExpandedBody(r, measurements, sev);
  html += `</div>`;
  return html;
}

// The expanded body — three numbered steps so the linear flow is
// obvious (versus the old layout where 5 concerns competed for
// attention all at once).
function renderRoomExpandedBody(r, measurements, sev) {
  const latestByTool = new Map();
  for (const m of measurements) {
    if (!latestByTool.has(m.tool)) latestByTool.set(m.tool, m);
  }

  // activeToday is recomputed here so the in-body toggle reflects the
  // same per-day flag the collapsed-row toggle would use.
  const _activeToday = isActiveToday(r);
  let html = `<div class="light-env-room-disclosure-body">

    <div class="light-env-room-step light-env-room-step-about">
      <div class="light-env-room-step-head">
        <span>Room setup</span>
        <span class="light-env-room-status-pill light-env-room-status-${escapeAttr(sev.color)}">${escapeHTML(sev.label)}</span>
      </div>
      <div class="light-env-room-step-body light-env-room-setup-body">
        <label class="ctx-label light-env-room-name-field">Room name
          <input type="text" class="ctx-input light-env-room-name-input" value="${escapeAttr(r.name)}" oninput="window.updateLightEnvRoom('${escapeAttr(r.id)}', { name: this.value })" aria-label="Room name" />
        </label>
        <div class="light-env-room-today-row">
          <span class="light-env-room-today-copy">Use today
            <span>Skip only for travel, sick days, or rooms you did not use.</span>
          </span>
          ${_renderTodayToggle('room', r.id, _activeToday)}
        </div>
        ${renderSourcePicker(r)}
        ${renderHoursPicker(r)}
        ${renderEveningPicker(r)}
      </div>
    </div>

    <div class="light-env-room-step light-env-room-step-measure">
      <div class="light-env-room-step-head">
        <span>Measure this room</span>
        <span class="light-env-room-step-tag">Optional</span>
      </div>
      <div class="light-env-room-step-body">
        <div class="light-env-room-tools light-env-measure-toolbar" aria-label="Room measurement tools">
          <button class="light-env-tool-pill light-env-tool-pill-primary" onclick="window.openSpectrumClassifier && window.openSpectrumClassifier({ roomId: '${escapeAttr(r.id)}' })" title="Identify the spectrum (auto-detects warm/cool/fluorescent)">🔬 Spectrum</button>
          <button class="light-env-tool-pill" onclick="window.openLuxMeter && window.openLuxMeter({ roomId: '${escapeAttr(r.id)}' })" title="Measure lux">📏 Lux</button>
          <button class="light-env-tool-pill" onclick="window.openFlickerDetector && window.openFlickerDetector({ roomId: '${escapeAttr(r.id)}' })" title="Test for flicker">⚡ Flicker</button>
          <button class="light-env-tool-pill" onclick="window.openCCTMeter && window.openCCTMeter({ roomId: '${escapeAttr(r.id)}' })" title="Color temperature">🎨 CCT</button>
          ${/bedroom|sleep/i.test(r.name || '') ? `<button class="light-env-tool-pill" onclick="window.openDarknessMeter && window.openDarknessMeter({ roomId: '${escapeAttr(r.id)}' })" title="Sleep darkness">🌙 Sleep dark</button>` : ''}
        </div>`;

  if (latestByTool.size === 0) {
    html += `<p class="light-env-room-empty">No measurements yet. Run any tool above and the result lives here.</p>`;
  } else {
    html += `<div class="light-env-room-readings">`;
    for (const [tool, m] of latestByTool) {
      const icon = TOOL_ICONS[tool] || '·';
      html += `<div class="light-env-reading">
        <span class="light-env-reading-icon">${icon}</span>
        <span class="light-env-reading-value">${escapeHTML(fmtMeasureValue(m))}</span>
        <span class="light-env-reading-time">${escapeHTML(fmtMeasureTime(m.capturedAt))}</span>
      </div>${typeof window !== 'undefined' && window.renderMeasurementAIInline ? window.renderMeasurementAIInline(m) : ''}`;
    }
    html += `</div>`;
  }
  html += `</div></div>`;

  // AI verdict block (between Measure and Screens) — synthesizes the room
  // signals into a single circadian-friendliness verdict.
  if (typeof window !== 'undefined' && window.renderRoomAIBlock) {
    html += window.renderRoomAIBlock(r);
  }

  // Step 3: screens used here. Step head + empty-state copy customize
  // per room because the dominant device differs sharply (bedroom →
  // phone, office → laptop / monitor, living room → TV). The phone-in-
  // bed signal in particular is high-leverage: junk-light memory note
  // says it's the dominant vector for most users, so the copy nudges
  // toward it for bedroom rooms.
  const screensHere = getScreensForRoom(r.id);
  const roomName = (r.name || '').toLowerCase();
  let stepHead, emptyCopy, quickPicks;
  if (/bedroom|sleep/.test(roomName)) {
    stepHead = 'Screens used in bed';
    emptyCopy = 'Phone in bed is the single biggest pull on melatonin most users have. Add it here so the AI weights evening blue accurately.';
    quickPicks = ['phone', 'tablet', 'tv'];
  } else if (/office|study|desk|work/.test(roomName)) {
    stepHead = 'Screens at this desk';
    emptyCopy = 'Long stretches in front of a laptop or monitor add up. Map them here so daytime exposure isn\'t overweighted vs evening.';
    quickPicks = ['laptop', 'monitor', 'phone'];
  } else if (/living|family|den|lounge/.test(roomName)) {
    stepHead = 'Screens in this room';
    emptyCopy = 'TV after sunset shifts melatonin most when it\'s a wall of cool blue. Worth mapping.';
    quickPicks = ['tv', 'phone', 'tablet'];
  } else {
    stepHead = 'Screens used here';
    emptyCopy = 'Map any phone, tablet, laptop, monitor, or TV used in this room.';
    quickPicks = ['phone', 'laptop', 'tv'];
  }

  html += `<div class="light-env-room-step">
    <div class="light-env-room-step-head">${escapeHTML(stepHead)}</div>
    <div class="light-env-room-step-body">`;
  if (screensHere.length === 0) {
    html += `<p class="light-env-room-empty">${escapeHTML(emptyCopy)}</p>`;
  } else {
    html += `<div class="light-env-room-screens-list">`;
    for (const s of screensHere) html += renderScreenCard(s, { compact: true });
    html += `</div>`;
  }
  // Quick-pick chip row — one-click adds a screen with the right device
  // type. "Other…" falls back to the original generic "+ Add screen"
  // path which infers device by room name.
  html += renderScreenQuickPicks(screensHere, r.id, quickPicks);
  html += `    </div>
  </div>`;

  // Delete moved to the header overflow (⋯) — keeps destructive actions
  // out of the primary scan path inside the body.
  html += `</div>`;
  return html;
}

export function renderEnvironmentSection(options = {}) {
  const env = getEnvironment();
  const rooms = env?.rooms || [];
  const screens = env?.screens || [];
  const embedded = !!options.embedded;

  let html = `<div class="light-env-section${embedded ? ' light-env-section-embedded' : ''}">`;
  if (!embedded) {
    html += `<div class="light-env-head">
      <h3 class="light-section-title">Light environment</h3>
      <p class="light-section-hint">Indoor light is the dominant exposure most days. Map your spaces and screens — the rest of the app uses this to weight your channel pills + interpret your sleep data.</p>
    </div>`;
  }
  html += renderEnvironmentLoadSummary();

  // Rooms — disclosure list (mirrors EMF Assessment + Light Audits).
  // Each row is collapsed-by-default with name + severity + key
  // signals; clicking expands a Step 1/2/3 form. Auto-expands the
  // only room on first render (no click needed for the common starter
  // case), but respects explicit collapse stored in localStorage.
  html += `<div class="light-env-block">
    <div class="light-env-block-head">
      <strong>Rooms you spend time in</strong>
      <button class="import-btn import-btn-secondary" onclick="window.addLightEnvRoom()">+ Room</button>
    </div>`;
  if (rooms.length === 0) {
    html += `<div class="light-env-empty light-env-empty-cta">
      <p><strong>Map your bedroom first.</strong> Sleep-room contamination is the highest-leverage signal in the modern light-environment literature (Brown TM 2022) — even ~1 lux of melanopic-EDI light at night measurably suppresses melatonin. We grade it for melatonin-friendly darkness, flicker, cool-LED contamination, and evening-blue exposure — and feed that grade into your circadian channel.</p>
      ${renderRoomQuickPicks(rooms)}
    </div>`;
  } else {
    const activeId = resolveActiveRoomId(rooms);
    html += `<div class="light-env-room-list">`;
    for (const r of rooms) {
      html += renderRoomDisclosure(r, r.id === activeId);
    }
    html += `</div>`;
    html += `<div class="light-env-room-quickpicks">${renderRoomQuickPicks(rooms)}</div>`;
  }
  html += `</div>`;

  // Top-level screens block — now ONLY portable devices (no roomId).
  // Screens that live in a specific room render INSIDE that room's
  // card so the user has one place to look for their Office, Bedroom,
  // etc. Phone-style devices that move around stay here.
  const portableScreens = screens.filter(s => !s.roomId);
  html += `<div class="light-env-block">
    <div class="light-env-block-head">
      <strong>Portable screens</strong>
      <button class="import-btn import-btn-secondary" onclick="window.addLightEnvScreen()">+ Screen</button>
    </div>`;
  if (portableScreens.length === 0 && screens.length === 0 && rooms.length === 0) {
    // First-time: show the value-prop CTA only when the whole section is empty
    html += `<div class="light-env-empty light-env-empty-cta">
      <p><strong>Track your phone, TV, or any screen that moves between rooms.</strong> Screens you use in a specific room (laptop in the Office, TV in the Living Room) live inside that room's card — add them from there.</p>
      ${renderScreenQuickPicks(portableScreens)}
    </div>`;
  } else if (portableScreens.length === 0) {
    html += `<div class="light-env-empty light-env-empty-cta">
      <p>No portable screens yet. Devices that stay in one place are listed inside their room card above.</p>
      ${renderScreenQuickPicks(portableScreens)}
    </div>`;
  } else {
    html += `<div class="light-env-screen-cards">`;
    for (const s of portableScreens) html += renderScreenCard(s);
    html += `</div>`;
  }
  html += `</div>`;

  // Light Audits — frozen snapshots of rooms + screens + measurements.
  // Hidden until the user has at least one room mapped.
  if ((env?.rooms || []).length > 0) {
    html += renderLightAuditsBlock();
  }

  html += `</div>`;
  return html;
}

configureLightEnvAudits({
  getEnvironment,
  computeRoomSeverity,
  refreshLightEnvironmentUI,
});

if (typeof window !== 'undefined') {
  Object.assign(window, {
    getLightEnvironment: getEnvironment,
    addLightEnvRoom: async () => {
      const env = getEnvironment();
      const before = env?.rooms?.length || 0;
      await addRoom(nextDefaultRoomName());
      // Auto-expand the new room so the user can fill it out immediately
      const after = env?.rooms || [];
      if (after.length > before) writeActiveRoomId(after[after.length - 1].id);
      refreshLightEnvironmentUI();
    },
    // Quick-pick chip handler — adds a room with the exact chosen name
    // (no "Room N" fallback). Auto-expands the new room.
    addLightEnvRoomNamed: async (name) => {
      const env = getEnvironment();
      const before = env?.rooms?.length || 0;
      await addRoom(name);
      const after = env?.rooms || [];
      if (after.length > before) writeActiveRoomId(after[after.length - 1].id);
      refreshLightEnvironmentUI();
    },
    // "Other…" quick-pick — opens the prompt dialog for a custom name.
    addLightEnvRoomCustom: async () => {
      const name = await showPromptDialog('Room name', {
        defaultValue: '',
        okLabel: 'Add room',
        placeholder: 'e.g. Workshop, Garage, Studio',
      });
      if (name === null) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      const env = getEnvironment();
      const before = env?.rooms?.length || 0;
      await addRoom(trimmed);
      const after = env?.rooms || [];
      if (after.length > before) writeActiveRoomId(after[after.length - 1].id);
      refreshLightEnvironmentUI();
    },
    // Disclosure toggle — clicking the header expands/collapses. The
    // event check ignores clicks on interactive children (the today-
    // toggle button, severity dot tooltip area) so they don't double-
    // fire as both their own action AND a card toggle.
    toggleLightEnvRoomExpanded: (id, event) => {
      if (event) {
        event.preventDefault?.();
        event.stopPropagation?.();
      }
      // Bail if the click landed on an interactive descendant (button,
      // input, select, label, anchor) — let it handle its own action.
      if (event && event.target) {
        const t = event.target;
        if (t.closest('button, input, select, textarea, a, label')) {
          // The header itself doesn't have buttons that should bubble;
          // the today-toggle is a button, so its click reaches here too.
          // Only allow expand-toggle when the click was on a non-
          // interactive part of the header.
          if (!t.classList.contains('light-env-room-disclosure-head')
              && !t.classList.contains('light-env-room-disclosure-name')
              && !t.classList.contains('light-env-room-disclosure-signals')
              && !t.classList.contains('light-env-room-signal')
              && !t.classList.contains('light-env-room-disclosure-chevron')
              && !t.classList.contains('light-env-room-disclosure-spacer')
              && !t.classList.contains('light-env-sev-dot')) {
            return;
          }
        }
      }
      const rooms = getEnvironment()?.rooms || [];
      const current = resolveActiveRoomId(rooms);
      writeActiveRoomId(current === id ? COLLAPSED_ROOM_ID : id);
      refreshLightEnvironmentUI({ scrollAnchor: lightEnvRoomAnchor(id) });
    },
    updateLightEnvRoom: async (id, patch) => { await updateRoom(id, patch); },
    // Chip-picker setters — translate archetype/bucket choices into
    // canonical schema values, then call updateRoom + re-render so the
    // active chip + severity dot reflect the new state.
    setLightEnvRoomSourceArchetype: async (id, archetypeKey) => {
      const a = SOURCE_ARCHETYPES.find(x => x.key === archetypeKey);
      if (!a) return;
      await updateRoom(id, { primarySource: a.storeAs });
      refreshLightEnvironmentUI();
    },
    setLightEnvRoomHoursBucket: async (id, bucketKey) => {
      const b = HOURS_BUCKETS.find(x => x.key === bucketKey);
      if (!b) return;
      await updateRoom(id, { hoursOccupiedPerDay: b.midpoint });
      refreshLightEnvironmentUI();
    },
    // Auto-fill a room's primarySource from the Spectrum tool's
    // classification — only when the user hasn't picked one yet, so
    // we don't silently overwrite a manual answer. Mapping mirrors
    // light-tools.js classifyLight() label values.
    suggestRoomSourceFromSpectrum: async (roomId, spectrumLabel) => {
      const env = getEnvironment();
      const room = (env?.rooms || []).find(r => r.id === roomId);
      if (!room) return;
      // Bail if user has already given us a non-default source.
      if (room.primarySource && room.primarySource !== 'unknown') return;
      const SPECTRUM_TO_SOURCE = {
        'Fluorescent / CFL':            'fluorescent',
        'Incandescent / halogen':       'incandescent',
        'Cool LED (4000K+)':            'led-cool',
        'Cool LED with PWM dimming':    'led-cool',
        'Warm LED (2700–3000K)':        'led-warm',
        'Warm LED with PWM dimming':    'led-warm',
        'Daylight or full-spectrum':    'natural-only',
        'Mixed / unclassified':         'mixed',
      };
      const mapped = SPECTRUM_TO_SOURCE[spectrumLabel];
      if (!mapped) return;
      await updateRoom(roomId, { primarySource: mapped });
      showNotification(`Auto-set ${room.name || 'this room'}'s light source to ${mapped.replace('-', ' ')} from spectrum reading.`);
    },
    setLightEnvRoomEveningBucket: async (id, bucketKey) => {
      const b = EVENING_BUCKETS.find(x => x.key === bucketKey);
      if (!b) return;
      // Write the new chip-picker field; keep the legacy boolean in sync
      // so any code still reading the old name (or older synced clients)
      // gets a sensible value.
      await updateRoom(id, {
        eveningHoursAfterSunset: b.midpoint,
        eveningUseAfterSunset: b.midpoint > 0,
      });
      refreshLightEnvironmentUI();
    },
    // Discrete-toggle variant — same persistence as updateLightEnvRoom
    // but refreshes the Light page / assessment modal so the severity
    // chip and accent strip update. Use for select/checkbox handlers
    // where focus-loss isn't a concern; keep plain updateLightEnvRoom
    // for text + number inputs to preserve cursor mid-typing.
    updateLightEnvRoomAndRender: async (id, patch) => {
      await updateRoom(id, patch);
      refreshLightEnvironmentUI();
    },
    deleteLightEnvRoom: async (id) => {
      await deleteRoom(id);
      if (readActiveRoomId() === id) writeActiveRoomId(null);
      refreshLightEnvironmentUI();
    },
    // Confirm-dialog wrapped delete — reachable from the expanded
    // room's footer. The bare delete handler stays in case anything
    // else wires it up without confirmation.
    deleteLightEnvRoomConfirm: async (id) => {
      if (await showConfirmDialog('Delete this room? Room-linked readings will be removed.')) {
        await deleteRoom(id);
        if (readActiveRoomId() === id) writeActiveRoomId(null);
        refreshLightEnvironmentUI();
      }
    },
    setActiveLightEnvRoom: (id) => {
      writeActiveRoomId(id);
      refreshLightEnvironmentUI();
    },
    // Quick-pick variant — adds a screen with an explicit device type
    // (phone / laptop / monitor / tablet / tv). Auto-expands the new
    // screen card so the user can fill in hours immediately.
    addLightEnvScreenWithDevice: async (roomId, device) => {
      const validDevices = SCREEN_DEVICES.map(d => d.key);
      const deviceKey = validDevices.includes(device) ? device : 'phone';
      await addScreen(deviceKey, roomId || null);
      const env = getEnvironment();
      const after = env?.screens || [];
      if (after.length > 0) _expandedScreenId = after[after.length - 1].id;
      refreshLightEnvironmentUI();
    },
    addLightEnvScreen: async (roomId = null) => {
      // Sensible default device by room name — laptop for office, TV
      // for living room, phone for everything else (incl. portable).
      // User can change immediately via the device dropdown.
      let device = 'phone';
      if (roomId) {
        const env = getEnvironment();
        const room = (env?.rooms || []).find(r => r.id === roomId);
        const name = (room?.name || '').toLowerCase();
        if (/office|study|desk/.test(name)) device = 'laptop';
        else if (/living|family|tv/.test(name)) device = 'tv';
        else if (/bedroom|sleep/.test(name)) device = 'phone';
      }
      await addScreen(device, roomId);
      refreshLightEnvironmentUI();
    },
    updateLightEnvScreen: async (id, patch) => { await updateScreen(id, patch); },
    updateLightEnvScreenAndRender: async (id, patch) => {
      await updateScreen(id, patch);
      refreshLightEnvironmentUI();
    },
    deleteLightEnvScreen: async (id) => {
      await deleteScreen(id);
      refreshLightEnvironmentUI();
    },
    deleteLightEnvScreenConfirm: async (id) => {
      if (await showConfirmDialog('Delete this screen?')) {
        await deleteScreen(id);
        if (_expandedScreenId === id) _expandedScreenId = null;
        refreshLightEnvironmentUI();
      }
    },
    // Disclosure toggle for screen cards — same event-target gating as
    // the room toggle so clicks on inner controls don't double-fire.
    toggleLightEnvScreenExpanded: (id, event) => {
      if (event) {
        event.preventDefault?.();
        event.stopPropagation?.();
      }
      if (event && event.target) {
        const t = event.target;
        if (t.closest('button, input, select, textarea, a, label')
            && !t.classList.contains('light-env-screen-card-head')
            && !t.classList.contains('light-env-screen-card-name')
            && !t.classList.contains('light-env-screen-card-icon')
            && !t.classList.contains('light-env-screen-card-summary')
            && !t.classList.contains('light-env-room-disclosure-chevron')
            && !t.classList.contains('light-env-room-disclosure-spacer')
            && !t.classList.contains('light-env-sev-dot')) {
          return;
        }
      }
      _expandedScreenId = (_expandedScreenId === id) ? null : id;
      refreshLightEnvironmentUI({ scrollAnchor: lightEnvScreenAnchor(id) });
    },
    setLightEnvScreenHoursBucket: async (id, bucketKey) => {
      const b = SCREEN_HOURS_BUCKETS.find(x => x.key === bucketKey);
      if (!b) return;
      await updateScreen(id, { hoursPerDay: b.midpoint });
      refreshLightEnvironmentUI();
    },
    setLightEnvScreenEveningBucket: async (id, bucketKey) => {
      const map = { none: 0, lt1: 0.5, mid: 2, gt3: 4 };
      if (!(bucketKey in map)) return;
      await updateScreen(id, { eveningUseAfterSunset: map[bucketKey] });
      refreshLightEnvironmentUI();
    },
    computeLightDeficitAxes: computeDeficitAxes,
    computeDeficitAxes,
    computeRoomSeverity,
    computeScreenStatus,
    computeIndoorBurden,
    getScreensForRoom,
    // Rooms accessor + adder so cross-module callers (Tool 8 Eye-Level
    // Audit, recommendations engine, AI helpers) don't have to dig
    // into state.importedData.lightEnvironment directly.
    getRooms: () => (state.importedData?.lightEnvironment?.rooms) || [],
    addRoom,
    isLightEnvActiveToday: isActiveToday,
    setLightEnvTodayActive: async (kind, id, active) => {
      await setTodayActive(kind, id, active);
      refreshLightEnvironmentUI();
    },
    renderEnvironmentSection,
    renderEnvironmentAssessmentSummary,
    openLightEnvironmentAssessment,
    closeLightEnvironmentAssessment,
    refreshLightEnvironmentAssessment,
  });
}
