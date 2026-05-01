// light-devices.js — Light therapy device library + device session logging.
//
// Devices users own (Joovv, Sperti, Verilux SAD, dawn simulators, etc.) feed
// the same biological channel accumulators as outdoor sun sessions. Each
// device has a typed spectrum/irradiance profile; logging a session creates
// a deviceSessions[] record with computed per-channel doses.
//
// Channels covered by device type:
//   uvb           → vitamin_d, pomc
//   uva           → pomc, no_cv
//   combined / pbm-targeted → pbm_red, pbm_nir
//   sad           → circadian
//   dawn-sim      → circadian (lower intensity, gradual ramp)
//   full-spectrum → circadian
//
// Schema (already migrated in profile.js):
//   importedData.lightDevices[]   — user's owned devices
//   importedData.deviceSessions[] — session log

import { state } from './state.js';
import { escapeHTML, escapeAttr, formatDate, showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import { CHANNEL_DISPLAY, channelTier, tierLabel } from './sun.js';

// Preset library is loaded lazily — keeps the JSON out of the boot path.
let _PRESETS = null;
let _PRESET_TYPES = null;

async function loadPresets() {
  if (_PRESETS) return { presets: _PRESETS, types: _PRESET_TYPES };
  try {
    const res = await fetch('data/light-device-presets.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    _PRESETS = json.presets || [];
    _PRESET_TYPES = json._types || {};
    return { presets: _PRESETS, types: _PRESET_TYPES };
  } catch (e) {
    return { presets: [], types: {} };
  }
}

// ─── Public API ────────────────────────────────────────────────────────

export function getDevices() {
  if (!state.importedData) return [];
  if (!Array.isArray(state.importedData.lightDevices)) state.importedData.lightDevices = [];
  return state.importedData.lightDevices;
}

export function getDeviceSessions() {
  if (!state.importedData) return [];
  if (!Array.isArray(state.importedData.deviceSessions)) state.importedData.deviceSessions = [];
  return state.importedData.deviceSessions;
}

export async function addDeviceFromPreset(presetId, overrides = {}) {
  const { presets } = await loadPresets();
  const preset = presets.find(p => p.id === presetId);
  if (!preset) return null;
  const id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const device = {
    id,
    presetId: preset.id,
    brand: overrides.brand || preset.brand,
    model: overrides.model || preset.model,
    type: overrides.type || preset.type,
    peakWavelengths: overrides.peakWavelengths || preset.peakWavelengths || [],
    mwPerCm2At15cm: overrides.mwPerCm2At15cm ?? preset.mwPerCm2At15cm ?? null,
    lux: overrides.lux ?? preset.lux ?? null,
    channels: overrides.channels || preset.channels || [],
    catalogSlug: preset.catalogSlug || null,
    notes: overrides.notes || '',
    addedAt: Date.now(),
  };
  getDevices().push(device);
  await saveImportedData();
  return device;
}

export async function deleteDevice(id) {
  const devs = getDevices();
  const idx = devs.findIndex(d => d.id === id);
  if (idx < 0) return false;
  devs.splice(idx, 1);
  await saveImportedData();
  return true;
}

// Log a completed device session (e.g. "10 min on the Joovv Mini at 15cm").
//
// Per-channel doses are computed by synthesizing a sparse spectrum from
// the device's declared `peakWavelengths` + `mwPerCm2At15cm`, then routing
// it through the SAME `computeChannelDoses` used by sun sessions. That
// produces wavelength-correct doses (UVB → vitamin_d only, NIR → pbm_nir
// only, etc.) without double-counting photons across multiple channels —
// which the previous heuristic did, giving every declared channel the
// full device irradiance.
//
// Falls back to a legacy lux-only path for SAD lamps that declare `lux`
// instead of `mwPerCm2At15cm` (Verilux, Carex, Lumie, etc.) — those don't
// have a meaningful peak-wavelengths spectrum and only feed the circadian
// channel via lux-seconds.
export async function logDeviceSession({ deviceId, durationMin, distanceCm = 15, bodyArea = 'torso', eyesProtected = true, notes = '' }) {
  const device = getDevices().find(d => d.id === deviceId);
  if (!device) return null;
  const sessionId = `devsess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const seconds = durationMin * 60;

  // Body-area fractions match sun.js BODY_REGIONS proportions.
  const AREA_FRACTIONS = {
    'face': 0.04, 'arms': 0.10, 'torso-front': 0.13, 'torso': 0.13,
    'legs': 0.30, 'whole-body': 0.85, 'targeted': 0.05,
  };
  const area = AREA_FRACTIONS[bodyArea] ?? 0.10;

  // Distance-square correction (panels approach inverse-square at far
  // field; closer in this is roughly accurate for desktop-scale form
  // factors, generous for full-body panels).
  const baseRangeCm = 15;
  const distFactor = (baseRangeCm / Math.max(distanceCm, 5)) ** 2;

  let doses = {};
  const synthesizeDeviceSpectrum = window.synthesizeDeviceSpectrum;
  const computeChannelDoses = window.computeChannelDoses;
  const hasPeaks = Array.isArray(device.peakWavelengths) && device.peakWavelengths.length > 0;
  const hasIrradiance = (device.mwPerCm2At15cm || 0) > 0;
  const eyeMode = eyesProtected ? 'closed-eyes' : 'direct';

  if (synthesizeDeviceSpectrum && computeChannelDoses && hasPeaks && hasIrradiance) {
    // Wavelength-correct path: synthesize spectrum → action-spectrum
    // convolve → per-channel dose. Distance + area fold in via standard
    // bodyExposureFraction × distFactor multipliers.
    const spectrum = synthesizeDeviceSpectrum(device);
    doses = computeChannelDoses({
      spectrum,
      durationMin,
      bodyExposureFraction: area * distFactor,
      eyeExposure: { mode: eyeMode, durationSec: seconds },
    });
  } else {
    // Lux-only fallback (SAD lamps without per-band irradiance / peaks).
    const lux = device.lux || 0;
    if (!eyesProtected && lux > 0) doses.circadian = lux * seconds / 100;
  }

  const session = {
    id: sessionId,
    deviceId,
    startedAt: Date.now() - seconds * 1000,
    endedAt: Date.now(),
    durationMin,
    distanceCm,
    bodyArea,
    eyesProtected,
    doses,
    notes,
  };
  getDeviceSessions().push(session);
  await saveImportedData();
  return session;
}

export async function deleteDeviceSession(id) {
  const sessions = getDeviceSessions();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx < 0) return false;
  sessions.splice(idx, 1);
  await saveImportedData();
  return true;
}

// Rolling totals — same shape as sun.rollingChannelTotals so the AI context
// and dashboard pills can sum across both sources transparently.
export function rollingDeviceTotals(days = 7) {
  const cutoff = Date.now() - days * 86400 * 1000;
  const totals = {};
  for (const sess of getDeviceSessions()) {
    if (!sess.doses || (sess.endedAt && sess.endedAt < cutoff)) continue;
    for (const [k, v] of Object.entries(sess.doses)) {
      totals[k] = (totals[k] || 0) + (Number.isFinite(v) ? v : 0);
    }
  }
  return totals;
}

// ─── UI: device list rendered into the Light & Sun page ───────────────

export async function renderDevicesSection() {
  const devices = getDevices();
  const sessions = getDeviceSessions().slice().sort((a, b) => b.startedAt - a.startedAt).slice(0, 6);

  // Load the recommendations catalog up-front so each device card can
  // surface a "Source on {vendor}" affiliate link inline. Falls back to
  // null silently — the renderer no-ops on missing catalog or when the
  // product-recs toggle is off.
  let catalog = null;
  try {
    if (window.loadCatalog) catalog = await window.loadCatalog();
  } catch { /* offline / 404 — no affiliate row, page still renders */ }

  let html = `<div class="light-devices-section">
    <div class="light-devices-head">
      <h3 class="light-section-title">Light devices</h3>
      <button class="import-btn import-btn-secondary" onclick="window.openAddDeviceDialog()">+ Add device</button>
    </div>`;

  if (devices.length === 0) {
    html += `<p class="light-section-hint">Therapy panels, SAD lamps, dawn simulators — log them here and your sessions feed the same channels as outdoor sun.</p>
    </div>`;
    return html;
  }

  html += `<div class="light-devices-grid">`;
  for (const dev of devices) {
    // Resolve catalog slug — prefer device.catalogSlug (set at add time)
    // and fall back to device.presetId so older devices added before the
    // wiring still work without a migration. Both default to null.
    const slug = dev.catalogSlug || dev.presetId || null;
    const affRow = (slug && window.renderLightDeviceAffiliateRow)
      ? window.renderLightDeviceAffiliateRow(catalog, slug)
      : '';
    html += `<div class="light-device-card" data-id="${escapeAttr(dev.id)}">
      <div class="light-device-head">
        <span class="light-device-name">${escapeHTML(dev.brand)} ${escapeHTML(dev.model)}</span>
        <button class="light-device-delete" onclick="window.deleteLightDevice('${escapeAttr(dev.id)}')" title="Remove device" aria-label="Remove device">×</button>
      </div>
      <div class="light-device-meta">
        ${escapeHTML(dev.type)} · ${(dev.peakWavelengths || []).join('/')}nm
        ${dev.mwPerCm2At15cm ? ` · ${dev.mwPerCm2At15cm} mW/cm² @15cm` : ''}
        ${dev.lux ? ` · ${dev.lux} lux` : ''}
      </div>
      <div class="light-device-actions">
        <button class="import-btn import-btn-primary light-device-log" onclick="window.openDeviceSessionDialog('${escapeAttr(dev.id)}')">Log session</button>
        ${affRow}
      </div>
    </div>`;
  }
  html += `</div>`;

  // Device sessions live in the unified sessions list higher on the page
  // (renderUnifiedSessionsList) — no duplicate list here. This subsection
  // is the device library: panels owned, log-session entry points, add.

  html += `</div>`;
  return html;
}

// ─── UI: Add-device modal ──────────────────────────────────────────────

export async function openAddDeviceDialog() {
  const { presets, types } = await loadPresets();
  // Pull "custom" / "other" presets aside so they always render at the end
  // of the dropdown rather than mid-list (P4 from the 2026-04-30 review).
  const customPresets = presets.filter(p => p.id === 'custom' || p.type === 'custom');
  const branded = presets.filter(p => !customPresets.includes(p));
  const groups = {};
  for (const p of branded) {
    if (!groups[p.type]) groups[p.type] = [];
    groups[p.type].push(p);
  }
  // Order: UV (most distinctive — vitamin D capable) first, then UVA-only,
  // then red+NIR panels, then targeted PBM, then eye-channel devices
  // (SAD → dawn → full-spectrum bulbs). Mirrors the natural mental
  // model "what kind of light am I trying to add?"
  const orderedTypes = ['uvb', 'uva', 'combined', 'pbm-targeted', 'sad', 'dawn-sim', 'full-spectrum'];

  let opts = '<option value="" disabled selected>Choose your device…</option>';
  for (const t of orderedTypes) {
    if (!groups[t]) continue;
    const meta = types[t] || {};
    opts += `<optgroup label="${escapeAttr((meta.icon || '') + ' ' + (meta.label || t))}">`;
    for (const p of groups[t]) {
      opts += `<option value="${escapeAttr(p.id)}">${escapeHTML(p.brand)} ${escapeHTML(p.model)}</option>`;
    }
    opts += `</optgroup>`;
  }
  if (customPresets.length) {
    opts += `<optgroup label="Other">`;
    for (const p of customPresets) {
      opts += `<option value="${escapeAttr(p.id)}">${escapeHTML(p.brand || 'Custom')} — ${escapeHTML(p.model || 'enter your own specs')}</option>`;
    }
    opts += `</optgroup>`;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-label="Add light device">
    <div class="modal-header">
      <h3>Add a light device</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">Pick from common therapy devices. Custom entries are also supported — pick "Other / not listed" to enter your own specs.</p>
      <select id="add-device-preset" class="ctx-select" style="width:100%;margin-top:12px">
        ${opts}
      </select>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="import-btn import-btn-primary" id="add-device-confirm">Add device</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  // Backdrop-click closes — this is a browse/pick modal (single select, no
  // typed input), so accidental dismissal doesn't lose any data the user
  // hasn't already chosen via dropdown. Escape is handled globally in
  // main.js's anonymous-overlay fallback.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  overlay.querySelector('#add-device-confirm').addEventListener('click', async () => {
    const sel = overlay.querySelector('#add-device-preset');
    const presetId = sel.value;
    if (!presetId) return;
    await addDeviceFromPreset(presetId);
    overlay.remove();
    showNotification('Device added.');
    if (window.navigate && state.currentView === 'light') window.navigate('light');
  });
}

// ─── UI: log device session modal ──────────────────────────────────────

export async function openDeviceSessionDialog(deviceId) {
  const device = getDevices().find(d => d.id === deviceId);
  if (!device) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-label="Log device session">
    <div class="modal-header">
      <h3>Log session — ${escapeHTML(device.brand)} ${escapeHTML(device.model)}</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <label class="ctx-label">Duration (minutes)
        <input type="number" id="dev-session-duration" class="ctx-input" min="1" max="120" value="10" />
      </label>
      <label class="ctx-label">Distance from device (cm)
        <input type="number" id="dev-session-distance" class="ctx-input" min="5" max="200" value="15" />
      </label>
      <label class="ctx-label">Body area
        <select id="dev-session-area" class="ctx-select">
          <option value="targeted">Targeted (single area)</option>
          <option value="face">Face</option>
          <option value="torso">Torso</option>
          <option value="arms">Arms</option>
          <option value="legs">Legs</option>
          <option value="whole-body">Whole body</option>
        </select>
      </label>
      <label class="ctx-label">
        <input type="checkbox" id="dev-session-eyes" checked />
        Eyes protected (goggles or closed)
      </label>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="import-btn import-btn-primary" id="dev-session-save">Save session</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#dev-session-save').addEventListener('click', async () => {
    const durationMin = parseInt(overlay.querySelector('#dev-session-duration').value, 10) || 10;
    const distanceCm = parseInt(overlay.querySelector('#dev-session-distance').value, 10) || 15;
    const bodyArea = overlay.querySelector('#dev-session-area').value || 'targeted';
    const eyesProtected = overlay.querySelector('#dev-session-eyes').checked;
    await logDeviceSession({ deviceId, durationMin, distanceCm, bodyArea, eyesProtected });
    overlay.remove();
    showNotification(`${durationMin} min ${escapeHTML(device.brand)} session saved.`);
    if (window.navigate && state.currentView === 'light') window.navigate('light');
  });
}

// ─── Quick-log entry point ────────────────────────────────────────────
// Single entry used by the Light page CTA row, dashboard strip, and
// drill-down panel suggestions. Behaviour by device count:
//   0 devices → opens the Add-device dialog
//   1 device  → opens that device's session dialog directly
//   2+        → opens a small picker, then the chosen device's dialog
export function quickLogDeviceSession() {
  const devices = getDevices();
  if (devices.length === 0) { openAddDeviceDialog(); return; }
  if (devices.length === 1) { openDeviceSessionDialog(devices[0].id); return; }
  _openDevicePicker(devices);
}

function _openDevicePicker(devices) {
  // Most-recently-added first so the user's primary panel is at the top.
  // (Devices array order isn't guaranteed chronological — sort by id which
  // embeds Date.now() base36, monotonically increasing.)
  const ordered = devices.slice().sort((a, b) => (b.id || '').localeCompare(a.id || ''));
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  let rows = '';
  for (const dev of ordered) {
    const meta = `${escapeHTML(dev.type || '')}${dev.peakWavelengths?.length ? ' · ' + dev.peakWavelengths.join('/') + 'nm' : ''}${dev.mwPerCm2At15cm ? ' · ' + dev.mwPerCm2At15cm + ' mW/cm²' : ''}`;
    rows += `<button type="button" class="light-device-picker-row" data-device-id="${escapeAttr(dev.id)}">
      <span class="light-device-picker-name">${escapeHTML(dev.brand)} ${escapeHTML(dev.model)}</span>
      <span class="light-device-picker-meta">${meta}</span>
    </button>`;
  }
  overlay.innerHTML = `<div class="modal" role="dialog" aria-label="Pick a device to log a session">
    <div class="modal-header">
      <h3>Which device?</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <div class="light-device-picker-list">${rows}</div>
      <div class="modal-actions" style="margin-top:14px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  // Backdrop-click closes — browse-style modal, no user-entered data.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  for (const btn of overlay.querySelectorAll('.light-device-picker-row')) {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-device-id');
      overlay.remove();
      openDeviceSessionDialog(id);
    });
  }
}

// ─── Window export ─────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  Object.assign(window, {
    getDevices,
    getDeviceSessions,
    addDeviceFromPreset,
    deleteLightDevice: async (id) => {
      await deleteDevice(id);
      if (window.navigate && state.currentView === 'light') window.navigate('light');
    },
    logDeviceSession,
    deleteDeviceSession: async (id) => {
      await deleteDeviceSession(id);
      if (window.navigate && state.currentView === 'light') window.navigate('light');
    },
    rollingDeviceTotals,
    renderDevicesSection,
    openAddDeviceDialog,
    openDeviceSessionDialog,
    quickLogDeviceSession,
  });
}
