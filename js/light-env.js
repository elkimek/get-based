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

import { state } from './state.js';
import { escapeHTML, escapeAttr, showNotification } from './utils.js';
import { saveImportedData } from './data.js';

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

  env.rooms.push({
    id: `room_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: name || 'Room',
    primarySource: homeLight || 'unknown',
    cct: null,
    flickerScore: null,
    hoursOccupiedPerDay: null,
    eveningUseAfterSunset: false,
    notes: '',
  });
  await saveImportedData();
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

export async function updateRoom(id, patch) {
  const env = getEnvironment();
  const room = (env.rooms || []).find(r => r.id === id);
  if (!room) return;
  Object.assign(room, patch);
  await saveImportedData();
}

export async function deleteRoom(id) {
  const env = getEnvironment();
  env.rooms = (env.rooms || []).filter(r => r.id !== id);
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
    brightness: 'medium',
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
  await saveImportedData();
}

export async function updateScreen(id, patch) {
  const env = getEnvironment();
  const scr = (env.screens || []).find(s => s.id === id);
  if (!scr) return;
  Object.assign(scr, patch);
  await saveImportedData();
}

export async function deleteScreen(id) {
  const env = getEnvironment();
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

export function computeRoomSeverity(room, measurements = []) {
  if (!room) return { tier: 0, color: 'green', label: 'Unknown', reason: 'No data yet' };

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

  // After-sunset blue-light contamination
  if (room.eveningUseAfterSunset && (src === 'led-cool' || src === 'led-tunable' || src === 'fluorescent')) {
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
  const labelMap = ['Good', 'Mild', 'Moderate', 'Concerning', 'Severe'];
  return {
    tier,
    color: colorMap[Math.min(tier, 4)],
    label: labelMap[Math.min(tier, 4)],
    reason: reasons.length ? reasons.join(' · ') : 'No signals detected',
  };
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
export function computeIndoorBurden() {
  const { d2, d3 } = computeDeficitAxes();
  // Tiers: 0 light, 1 moderate, 2 heavy
  let tier = 0, parts = [];
  if (d2 > 8) { tier = Math.max(tier, 2); parts.push(`${d2.toFixed(1)} hr/day indoors`); }
  else if (d2 > 4) { tier = Math.max(tier, 1); parts.push(`${d2.toFixed(1)} hr/day indoors`); }
  else if (d2 > 0) parts.push(`${d2.toFixed(1)} hr/day indoors`);
  if (d3 > 4) { tier = Math.max(tier, 2); parts.push(`${d3.toFixed(1)} hr/day junk-light`); }
  else if (d3 > 2) { tier = Math.max(tier, 1); parts.push(`${d3.toFixed(1)} hr/day junk-light`); }
  else if (d3 > 0) parts.push(`${d3.toFixed(1)} hr/day junk-light`);
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
  else if (tier === 0) interp = 'Mostly daylight-aligned. Indoor exposure is short and mostly friendly sources.';
  else if (tier === 1 && d3 > d2 / 2) interp = "Indoor lighting after sunset is the bigger pull on your circadian rhythm — consider warmer evening sources or blue blockers.";
  else if (tier === 1) interp = 'Plenty of indoor hours during the day — consider getting more outdoor time, especially in the morning.';
  else if (tier === 2 && d3 >= d2) interp = 'Heavy blue-evening exposure plus long indoor hours. Both are pulling against melatonin — fixing screens or evening lighting would move the needle most.';
  else interp = 'Long daytime hours indoors and meaningful evening contamination. Outdoor morning light + warmer evening sources would help.';
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
// Layout mirrors EMF Assessment's at-a-glance pattern (severity dot per
// room, tabs when 3+ rooms, detail panel with measurements attached). Up
// to 2 rooms render as inline cards; 3+ activates the tabbed selector.

const ACTIVE_ROOM_KEY = 'labcharts-light-env-active-room';

function readActiveRoomId() {
  try { return localStorage.getItem(ACTIVE_ROOM_KEY); } catch (e) { return null; }
}
function writeActiveRoomId(id) {
  try { id ? localStorage.setItem(ACTIVE_ROOM_KEY, id) : localStorage.removeItem(ACTIVE_ROOM_KEY); } catch (e) {}
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
};

// Per-day "in use today / skipped today" toggle pill. Auto-resets at
// midnight via the date stamp on the override (todayKey() check). The
// pill telegraphs current state with text + icon; click flips it via
// setTodayActive. kind is 'room' or 'screen' so one window handler
// can route both.
function _renderTodayToggle(kind, id, activeToday) {
  const cls = `light-env-today-toggle${activeToday ? ' light-env-today-on' : ' light-env-today-off'}`;
  const label = activeToday ? '✓ In use today' : '⊘ Skipped today';
  const flipTo = activeToday ? 'false' : 'true';
  const tip = activeToday
    ? "Click to skip today — won't count toward today's exposure. Resets to 'in use' tomorrow."
    : "Click to use today — counts toward today's exposure.";
  return `<button type="button" class="${cls}" onclick="window.setLightEnvTodayActive('${kind}', '${escapeAttr(id)}', ${flipTo})" title="${escapeAttr(tip)}" aria-pressed="${activeToday}">${label}</button>`;
}

// Single screen card markup — used both at top level (portable) and
// nested inside a room card (compact mode). When compact, density
// ratchets down; the "Used in" dropdown lets the user reassign
// without leaving the page.
function renderScreenCard(s, opts = {}) {
  const compact = !!opts.compact;
  const status = computeScreenStatus(s);
  const activeToday = isActiveToday(s);
  const env = getEnvironment();
  const rooms = env?.rooms || [];
  const roomOptions = rooms.length > 0
    ? `<select class="ctx-select light-env-screen-room" onchange="window.updateLightEnvScreenAndRender('${escapeAttr(s.id)}', { roomId: this.value || null })" aria-label="Used in room">
        <option value=""${!s.roomId ? ' selected' : ''}>Portable / multiple rooms</option>
        ${rooms.map(r => `<option value="${escapeAttr(r.id)}"${s.roomId === r.id ? ' selected' : ''}>${escapeHTML(r.name || 'Room')}</option>`).join('')}
      </select>`
    : '';
  return `<div class="light-env-screen-card light-env-card-sev-${status.color}${compact ? ' light-env-screen-card-compact' : ''}${activeToday ? '' : ' light-env-card-skipped'}" data-id="${escapeAttr(s.id)}">
    <div class="light-env-screen-card-head">
      <select class="ctx-select light-env-screen-device" onchange="window.updateLightEnvScreenAndRender('${escapeAttr(s.id)}', { device: this.value })" aria-label="Device type">
        ${SCREEN_DEVICES.map(d => `<option value="${escapeAttr(d.key)}"${s.device === d.key ? ' selected' : ''}>${escapeHTML(d.label)}</option>`).join('')}
      </select>
      <span class="light-env-sev-chip light-env-sev-chip-${status.color}" title="${escapeAttr(status.reason)}">${escapeHTML(status.label)}</span>
      ${_renderTodayToggle('screen', s.id, activeToday)}
      <button class="light-env-delete" onclick="window.deleteLightEnvScreen('${escapeAttr(s.id)}')" aria-label="Delete screen">×</button>
    </div>
    <div class="light-env-screen-fields">
      <label class="ctx-label">Hours per day
        <input type="number" min="0" max="24" step="0.5" class="ctx-input" placeholder="0" value="${s.hoursPerDay ?? ''}" oninput="window.updateLightEnvScreen('${escapeAttr(s.id)}', { hoursPerDay: parseFloat(this.value) || 0 })" aria-label="Hours per day" />
      </label>
      <label class="ctx-label">Evening hours (after sunset)
        <input type="number" min="0" max="12" step="0.5" class="ctx-input" placeholder="0" value="${s.eveningUseAfterSunset ?? ''}" oninput="window.updateLightEnvScreen('${escapeAttr(s.id)}', { eveningUseAfterSunset: parseFloat(this.value) || 0 })" aria-label="Evening hours" />
      </label>
      <label class="light-env-evening light-env-screen-blocker">
        <input type="checkbox"${s.blueBlockerEnabled ? ' checked' : ''} onchange="window.updateLightEnvScreenAndRender('${escapeAttr(s.id)}', { blueBlockerEnabled: this.checked })" />
        Blue blocker (glasses, f.lux, Night Shift, amber tint)
      </label>
      ${!compact && roomOptions ? `<label class="ctx-label light-env-screen-room-label">Used in
        ${roomOptions}
      </label>` : ''}
    </div>
  </div>`;
}

function renderRoomDetailCard(r) {
  const measurements = getMeasurementsFor(r.id).sort((a, b) => b.capturedAt - a.capturedAt);
  const sev = computeRoomSeverity(r, measurements);
  const activeToday = isActiveToday(r);

  // Latest reading per tool
  const latestByTool = new Map();
  for (const m of measurements) {
    if (!latestByTool.has(m.tool)) latestByTool.set(m.tool, m);
  }

  let html = `<div class="light-env-room-card light-env-card-sev-${sev.color}${activeToday ? '' : ' light-env-card-skipped'}" data-id="${escapeAttr(r.id)}">
    <div class="light-env-room-card-head">
      <input type="text" class="light-env-room-name" value="${escapeAttr(r.name)}" oninput="window.updateLightEnvRoom('${escapeAttr(r.id)}', { name: this.value })" aria-label="Room name" />
      <span class="light-env-sev-chip light-env-sev-chip-${sev.color}" title="${escapeAttr(sev.reason)}">${escapeHTML(sev.label)}</span>
      ${_renderTodayToggle('room', r.id, activeToday)}
      <button class="light-env-delete" onclick="window.deleteLightEnvRoom('${escapeAttr(r.id)}')" aria-label="Delete room">×</button>
    </div>

    <div class="light-env-room-card-body">
      <div class="light-env-room-meta">
        <label class="ctx-label">Primary light source
          <select class="ctx-select" onchange="window.updateLightEnvRoomAndRender('${escapeAttr(r.id)}', { primarySource: this.value })" aria-label="Primary light source">
            ${PRIMARY_SOURCES.map(s => `<option value="${escapeAttr(s.key)}"${r.primarySource === s.key ? ' selected' : ''}>${escapeHTML(s.label)}</option>`).join('')}
          </select>
        </label>
        <label class="ctx-label">Hours occupied per day
          <input type="number" min="0" max="24" step="0.5" class="ctx-input" placeholder="hr/day" value="${r.hoursOccupiedPerDay ?? ''}" oninput="window.updateLightEnvRoom('${escapeAttr(r.id)}', { hoursOccupiedPerDay: parseFloat(this.value) || 0 })" aria-label="Hours per day" />
        </label>
        <label class="light-env-evening">
          <input type="checkbox"${r.eveningUseAfterSunset ? ' checked' : ''} onchange="window.updateLightEnvRoomAndRender('${escapeAttr(r.id)}', { eveningUseAfterSunset: this.checked })" />
          Used after sunset
        </label>
      </div>

      <div class="light-env-room-tools">
        <span class="light-env-tools-label">Measure in this room:</span>
        <button class="light-env-tool-pill" onclick="window.openLuxMeter && window.openLuxMeter({ roomId: '${escapeAttr(r.id)}' })" title="Measure lux">📏 Lux</button>
        <button class="light-env-tool-pill" onclick="window.openFlickerDetector && window.openFlickerDetector({ roomId: '${escapeAttr(r.id)}' })" title="Test for flicker">⚡ Flicker</button>
        <button class="light-env-tool-pill" onclick="window.openCCTMeter && window.openCCTMeter({ roomId: '${escapeAttr(r.id)}' })" title="Color temperature">🎨 Color temp</button>
        <button class="light-env-tool-pill" onclick="window.openSpectrumClassifier && window.openSpectrumClassifier({ roomId: '${escapeAttr(r.id)}' })" title="Identify the spectrum">🔬 Spectrum</button>
        ${/bedroom|sleep/i.test(r.name || '') ? `<button class="light-env-tool-pill" onclick="window.openDarknessMeter && window.openDarknessMeter({ roomId: '${escapeAttr(r.id)}' })" title="Sleep darkness">🌙 Sleep dark</button>` : ''}
      </div>`;

  if (latestByTool.size === 0) {
    html += `<p class="light-env-room-empty">No measurements yet for this room. Run any tool above and the result will live here.</p>`;
  } else {
    html += `<div class="light-env-room-readings">`;
    for (const [tool, m] of latestByTool) {
      const icon = TOOL_ICONS[tool] || '·';
      html += `<div class="light-env-reading">
        <span class="light-env-reading-icon">${icon}</span>
        <span class="light-env-reading-value">${escapeHTML(fmtMeasureValue(m))}</span>
        <span class="light-env-reading-time">${escapeHTML(fmtMeasureTime(m.capturedAt))}</span>
      </div>`;
    }
    html += `</div>`;
  }

  // Screens used in this room — set-and-forget block. Each screen
  // shows a compact summary line (status chip + device + hours +
  // evening + blocker), all inline-editable. "+ Add a screen here"
  // creates a screen pre-assigned to this room so the user never has
  // to wire it up after the fact.
  const screensHere = getScreensForRoom(r.id);
  html += `<div class="light-env-room-screens">
    <div class="light-env-room-screens-head">
      <strong>Screens used here</strong>
      <button class="light-env-add-screen-here" onclick="window.addLightEnvScreen('${escapeAttr(r.id)}')">+ Add a screen here</button>
    </div>`;
  if (screensHere.length === 0) {
    html += `<p class="light-env-room-empty">No screens mapped to this room yet. Add your laptop, monitor, or phone — fields prefill from your room defaults.</p>`;
  } else {
    html += `<div class="light-env-room-screens-list">`;
    for (const s of screensHere) html += renderScreenCard(s, { compact: true });
    html += `</div>`;
  }
  html += `</div>`;

  html += `</div></div>`;
  return html;
}

export function renderEnvironmentSection() {
  const env = getEnvironment();
  const rooms = env?.rooms || [];
  const screens = env?.screens || [];

  let html = `<div class="light-env-section">
    <div class="light-env-head">
      <h3 class="light-section-title">Light environment</h3>
      <p class="light-section-hint">Indoor light is the dominant exposure most days. Map your spaces and screens — the rest of the app uses this to weight your channel pills + interpret your sleep data.</p>
    </div>`;

  // Rooms
  html += `<div class="light-env-block">
    <div class="light-env-block-head">
      <strong>Rooms you spend time in</strong>
      <button class="import-btn import-btn-secondary" onclick="window.addLightEnvRoom()">+ Room</button>
    </div>`;
  if (rooms.length === 0) {
    html += `<div class="light-env-empty light-env-empty-cta">
      <p><strong>Map your bedroom first.</strong> We grade it for melatonin-friendly darkness, flicker, cool-LED contamination, and evening-blue exposure — and feed that grade into your circadian channel.</p>
      <button class="import-btn import-btn-primary" onclick="window.addLightEnvRoom()">+ Add your first room</button>
    </div>`;
  } else if (rooms.length <= 2) {
    // Stacked detail cards — fine for 1-2 rooms, no tab overhead
    html += `<div class="light-env-room-cards">`;
    for (const r of rooms) html += renderRoomDetailCard(r);
    html += `</div>`;
  } else {
    // Tabbed view: severity chip in each tab, detail panel below for the active room
    let activeId = readActiveRoomId();
    if (!rooms.find(r => r.id === activeId)) activeId = rooms[0].id;
    html += `<div class="light-env-room-tabs" role="tablist">`;
    for (const r of rooms) {
      const sev = computeRoomSeverity(r, getMeasurementsFor(r.id));
      const dot = `<span class="light-env-sev-dot light-env-sev-${sev.color}" title="${escapeAttr(sev.label + ' — ' + sev.reason)}"></span>`;
      html += `<button class="light-env-room-tab light-env-tab-sev-${sev.color}${r.id === activeId ? ' active' : ''}" role="tab" aria-selected="${r.id === activeId ? 'true' : 'false'}" onclick="window.setActiveLightEnvRoom('${escapeAttr(r.id)}')">${dot}<span class="light-env-room-tab-name">${escapeHTML(r.name || 'Room')}</span></button>`;
    }
    html += `</div>`;
    const active = rooms.find(r => r.id === activeId);
    if (active) html += renderRoomDetailCard(active);
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
      <button class="import-btn import-btn-secondary" onclick="window.addLightEnvScreen()">+ Portable screen</button>
    </div>`;
  if (portableScreens.length === 0 && screens.length === 0 && rooms.length === 0) {
    // First-time: show the value-prop CTA only when the whole section is empty
    html += `<div class="light-env-empty light-env-empty-cta">
      <p><strong>Track your phone, TV, or any screen that moves between rooms.</strong> Screens you use in a specific room (laptop in the Office, TV in the Living Room) live inside that room's card — add them from there.</p>
      <button class="import-btn import-btn-primary" onclick="window.addLightEnvScreen()">+ Add a portable screen</button>
    </div>`;
  } else if (portableScreens.length === 0) {
    html += `<p class="light-env-empty">No portable screens yet. Devices that stay in one place are listed inside their room card above.</p>`;
  } else {
    html += `<div class="light-env-screen-cards">`;
    for (const s of portableScreens) html += renderScreenCard(s);
    html += `</div>`;
  }
  html += `</div>`;

  // Deficit summary — interpretive plain-English copy with tier
  // indicator, instead of the raw "8.2 hr/day · 4.2 hr/day" numbers
  // which read as abstract without context.
  const burden = computeIndoorBurden();
  html += `<div class="light-env-summary light-env-summary-${burden.color}">
    <div class="light-env-summary-head">
      <span class="light-env-summary-tier">${escapeHTML(burden.label)}</span>
      ${burden.parts.length ? `<span class="light-env-summary-parts">${escapeHTML(burden.parts.join(' · '))}</span>` : ''}
    </div>
    <p class="light-env-summary-interp">${escapeHTML(burden.interp)}</p>
  </div>`;

  html += `</div>`;
  return html;
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    getLightEnvironment: getEnvironment,
    addLightEnvRoom: async () => {
      const env = getEnvironment();
      const before = env?.rooms?.length || 0;
      await addRoom(nextDefaultRoomName());
      // Make the new room the active tab so the detail panel jumps to it
      const after = env?.rooms || [];
      if (after.length > before) writeActiveRoomId(after[after.length - 1].id);
      if (window.navigate && state.currentView === 'light') window.navigate('light');
    },
    updateLightEnvRoom: async (id, patch) => { await updateRoom(id, patch); },
    // Discrete-toggle variant — same persistence as updateLightEnvRoom
    // but follows up with a navigate('light') so the severity chip
    // and accent strip refresh. Use for select/checkbox handlers
    // where focus-loss isn't a concern; keep plain updateLightEnvRoom
    // for text + number inputs to preserve cursor mid-typing.
    updateLightEnvRoomAndRender: async (id, patch) => {
      await updateRoom(id, patch);
      if (window.navigate && state.currentView === 'light') window.navigate('light');
    },
    deleteLightEnvRoom: async (id) => {
      await deleteRoom(id);
      if (readActiveRoomId() === id) writeActiveRoomId(null);
      if (window.navigate && state.currentView === 'light') window.navigate('light');
    },
    setActiveLightEnvRoom: (id) => {
      writeActiveRoomId(id);
      if (window.navigate && state.currentView === 'light') window.navigate('light');
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
      if (window.navigate && state.currentView === 'light') window.navigate('light');
    },
    updateLightEnvScreen: async (id, patch) => { await updateScreen(id, patch); },
    updateLightEnvScreenAndRender: async (id, patch) => {
      await updateScreen(id, patch);
      if (window.navigate && state.currentView === 'light') window.navigate('light');
    },
    deleteLightEnvScreen: async (id) => {
      await deleteScreen(id);
      if (window.navigate && state.currentView === 'light') window.navigate('light');
    },
    computeLightDeficitAxes: computeDeficitAxes,
    computeRoomSeverity,
    computeScreenStatus,
    computeIndoorBurden,
    getScreensForRoom,
    isLightEnvActiveToday: isActiveToday,
    setLightEnvTodayActive: async (kind, id, active) => {
      await setTodayActive(kind, id, active);
      if (window.navigate && state.currentView === 'light') window.navigate('light');
    },
    renderEnvironmentSection,
  });
}
