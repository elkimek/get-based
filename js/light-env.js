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

export async function addRoom(name) {
  const env = getEnvironment();
  if (!Array.isArray(env.rooms)) env.rooms = [];
  env.rooms.push({
    id: `room_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: name || 'Room',
    primarySource: 'unknown',
    cct: null,
    flickerScore: null,
    hoursOccupiedPerDay: null,
    eveningUseAfterSunset: false,
    notes: '',
  });
  await saveImportedData();
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

export async function addScreen(device) {
  const env = getEnvironment();
  if (!Array.isArray(env.screens)) env.screens = [];
  env.screens.push({
    id: `scr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    device: device || 'phone',
    hoursPerDay: null,
    eveningUseAfterSunset: null,
    blueBlockerEnabled: false,
    flickerScore: null,
    brightness: 'medium',
  });
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

// ─── Derived deficit signals ──────────────────────────────────────────

// Returns { d2: hours, d3: hours, junkLightHours }
// d2: estimated daytime indoor-light deficit (low-lux hours during the solar day)
// d3: junk-light contamination (LED-only / blue-after-sunset hours)
export function computeDeficitAxes() {
  const env = getEnvironment();
  if (!env) return { d2: 0, d3: 0 };
  let d2 = 0, d3 = 0;
  for (const r of env.rooms || []) {
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
    const eveningHours = s.eveningUseAfterSunset || 0;
    if (eveningHours > 0 && !s.blueBlockerEnabled) d3 += eveningHours * 0.5;
  }
  return { d2, d3 };
}

// ─── UI: Light Environment page (lives at /light-environment route) ───

export function renderEnvironmentSection() {
  const env = getEnvironment();
  const rooms = env?.rooms || [];
  const screens = env?.screens || [];

  let html = `<div class="light-env-section">
    <div class="light-env-head">
      <h3 class="light-section-title">Light environment</h3>
      <p class="light-section-hint">Indoor light is the dominant exposure most days. Map your spaces and the AI sees the full picture.</p>
    </div>`;

  // Rooms
  html += `<div class="light-env-block">
    <div class="light-env-block-head">
      <strong>Rooms you spend time in</strong>
      <button class="import-btn import-btn-secondary" onclick="window.addLightEnvRoom()">+ Room</button>
    </div>`;
  if (rooms.length === 0) {
    html += `<p class="light-env-empty">No rooms added yet.</p>`;
  } else {
    html += `<div class="light-env-rows">`;
    for (const r of rooms) {
      html += `<div class="light-env-row" data-id="${escapeAttr(r.id)}">
        <input type="text" class="light-env-input" value="${escapeAttr(r.name)}" oninput="window.updateLightEnvRoom('${escapeAttr(r.id)}', { name: this.value })" aria-label="Room name" />
        <select class="ctx-select light-env-input" onchange="window.updateLightEnvRoom('${escapeAttr(r.id)}', { primarySource: this.value })" aria-label="Primary light source">
          ${PRIMARY_SOURCES.map(s => `<option value="${escapeAttr(s.key)}"${r.primarySource === s.key ? ' selected' : ''}>${escapeHTML(s.label)}</option>`).join('')}
        </select>
        <input type="number" min="0" max="24" step="0.5" class="ctx-input light-env-input light-env-hours" placeholder="hr/day" value="${r.hoursOccupiedPerDay ?? ''}" oninput="window.updateLightEnvRoom('${escapeAttr(r.id)}', { hoursOccupiedPerDay: parseFloat(this.value) || 0 })" aria-label="Hours per day" />
        <label class="light-env-evening">
          <input type="checkbox"${r.eveningUseAfterSunset ? ' checked' : ''} onchange="window.updateLightEnvRoom('${escapeAttr(r.id)}', { eveningUseAfterSunset: this.checked })" />
          after sunset
        </label>
        <button class="light-env-tool" onclick="window.openLuxMeter && window.openLuxMeter()" title="Measure lux in this room">📏</button>
        <button class="light-env-tool" onclick="window.openFlickerDetector && window.openFlickerDetector()" title="Test for flicker">⚡</button>
        <button class="light-env-delete" onclick="window.deleteLightEnvRoom('${escapeAttr(r.id)}')" aria-label="Delete room">×</button>
      </div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;

  // Screens
  html += `<div class="light-env-block">
    <div class="light-env-block-head">
      <strong>Screens you use</strong>
      <button class="import-btn import-btn-secondary" onclick="window.addLightEnvScreen()">+ Screen</button>
    </div>`;
  if (screens.length === 0) {
    html += `<p class="light-env-empty">No screens added yet.</p>`;
  } else {
    html += `<div class="light-env-rows">`;
    for (const s of screens) {
      html += `<div class="light-env-row" data-id="${escapeAttr(s.id)}">
        <select class="ctx-select light-env-input" onchange="window.updateLightEnvScreen('${escapeAttr(s.id)}', { device: this.value })" aria-label="Device type">
          ${SCREEN_DEVICES.map(d => `<option value="${escapeAttr(d.key)}"${s.device === d.key ? ' selected' : ''}>${escapeHTML(d.label)}</option>`).join('')}
        </select>
        <input type="number" min="0" max="24" step="0.5" class="ctx-input light-env-input light-env-hours" placeholder="hr/day" value="${s.hoursPerDay ?? ''}" oninput="window.updateLightEnvScreen('${escapeAttr(s.id)}', { hoursPerDay: parseFloat(this.value) || 0 })" aria-label="Hours per day" />
        <input type="number" min="0" max="12" step="0.5" class="ctx-input light-env-input light-env-hours" placeholder="evening hr" value="${s.eveningUseAfterSunset ?? ''}" oninput="window.updateLightEnvScreen('${escapeAttr(s.id)}', { eveningUseAfterSunset: parseFloat(this.value) || 0 })" aria-label="Evening hours" />
        <label class="light-env-evening">
          <input type="checkbox"${s.blueBlockerEnabled ? ' checked' : ''} onchange="window.updateLightEnvScreen('${escapeAttr(s.id)}', { blueBlockerEnabled: this.checked })" />
          blue blocker
        </label>
        <button class="light-env-delete" onclick="window.deleteLightEnvScreen('${escapeAttr(s.id)}')" aria-label="Delete screen">×</button>
      </div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;

  // Deficit summary
  const def = computeDeficitAxes();
  html += `<div class="light-env-summary">
    <span class="light-env-summary-label">Daytime indoor hours:</span>
    <strong>${def.d2.toFixed(1)} hr/day</strong>
    <span class="light-env-summary-sep">·</span>
    <span class="light-env-summary-label">LED + blue-evening exposure:</span>
    <strong>${def.d3.toFixed(1)} hr/day</strong>
  </div>`;

  html += `</div>`;
  return html;
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    getLightEnvironment: getEnvironment,
    addLightEnvRoom: async () => {
      await addRoom(`Room ${(getEnvironment()?.rooms?.length || 0) + 1}`);
      if (window.navigate && state.currentView === 'light') window.navigate('light');
    },
    updateLightEnvRoom: async (id, patch) => { await updateRoom(id, patch); },
    deleteLightEnvRoom: async (id) => {
      await deleteRoom(id);
      if (window.navigate && state.currentView === 'light') window.navigate('light');
    },
    addLightEnvScreen: async () => {
      await addScreen('phone');
      if (window.navigate && state.currentView === 'light') window.navigate('light');
    },
    updateLightEnvScreen: async (id, patch) => { await updateScreen(id, patch); },
    deleteLightEnvScreen: async (id) => {
      await deleteScreen(id);
      if (window.navigate && state.currentView === 'light') window.navigate('light');
    },
    computeLightDeficitAxes: computeDeficitAxes,
    renderEnvironmentSection,
  });
}
