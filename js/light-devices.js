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
import { escapeHTML, escapeAttr, formatDate, showNotification, isDebugMode } from './utils.js';
import { saveImportedData } from './data.js';
import { recordTombstone } from './data-merge.js';
import { CHANNEL_DISPLAY, channelTier, tierLabel } from './sun.js';
import { callClaudeAPI, hasAIProvider, supportsVision } from './api.js';
import { resizeImage, isValidImageType, formatImageBlock, buildVisionContent } from './image-utils.js';

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
    recommendedDistanceCm: overrides.recommendedDistanceCm ?? preset.recommendedDistanceCm ?? 15,
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
  recordTombstone(state.importedData, 'lightDevices', id);
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

  // Distance-square correction. Base range is the device's vendor
  // reference distance (15 cm typical; 50 cm for COB devices like the
  // Firewave Compact whose manufacturer rates output at 20 inches).
  // The schema field `mwPerCm2At15cm` is legacy-named but its value
  // is interpreted as "irradiance at recommendedDistanceCm" — keeping
  // distFactor = 1 when the user logs at the default. Inverse-square
  // is a coarse approximation for LED panels (near-field cosine for
  // large sources, focused beams for COBs); accurate enough for
  // relative-trend correlation but not radiometric reference.
  const baseRangeCm = device.recommendedDistanceCm || 15;
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
  // Remember the user's chosen params on the device record so the
  // next session log dialog opens with their actual ritual prefilled
  // (most users do the same duration / distance / body area each
  // session — re-typing every time is friction). Notes intentionally
  // excluded — they're session-specific, shouldn't leak forward.
  device.lastSession = { durationMin, distanceCm, bodyArea, eyesProtected };
  device.updatedAt = Date.now();
  await saveImportedData();
  return session;
}

export async function deleteDeviceSession(id) {
  const sessions = getDeviceSessions();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx < 0) return false;
  recordTombstone(state.importedData, 'deviceSessions', id);
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
  const allSessions = getDeviceSessions();

  // Load the recommendations catalog + preset type metadata up-front
  // so each card can render with the human-friendly type label, the
  // type icon, and the "Source on {Vendor}" affiliate link inline.
  // Both fall back gracefully on missing data.
  let catalog = null;
  try {
    if (window.loadCatalog) catalog = await window.loadCatalog();
  } catch { /* offline / 404 — page still renders without affiliate row */ }
  let typesMeta = {};
  try {
    const presetData = await loadPresets();
    typesMeta = presetData.types || {};
  } catch { /* presets file unreachable; fallback uses raw type strings */ }

  // Build per-device usage stats from the session log: count + most
  // recent startedAt. Lets the card show "12 sessions · last 2 days
  // ago" instead of just "added this device, no idea if you ever used
  // it."
  const statsByDevice = {};
  for (const s of allSessions) {
    if (!s.deviceId) continue;
    const acc = statsByDevice[s.deviceId] = statsByDevice[s.deviceId] || { count: 0, lastAt: 0 };
    acc.count++;
    if ((s.startedAt || 0) > acc.lastAt) acc.lastAt = s.startedAt;
  }

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
    const slug = dev.catalogSlug || dev.presetId || null;
    const affRow = (slug && window.renderLightDeviceAffiliateRow)
      ? window.renderLightDeviceAffiliateRow(catalog, slug)
      : '';
    const typeMeta = typesMeta[dev.type] || {};
    const typeIcon = typeMeta.icon || '🔴';
    const typeLabel = typeMeta.label || dev.type || 'Device';
    const peaks = Array.isArray(dev.peakWavelengths) ? dev.peakWavelengths : [];
    const wavelengthStr = _formatWavelengthSummary(peaks);
    const intensityStr = dev.mwPerCm2At15cm
      ? `${dev.mwPerCm2At15cm} mW/cm²`
      : (dev.lux ? `${dev.lux} lux` : '');
    const channelChips = _renderDeviceChannelChips(dev.channels || []);
    const stats = statsByDevice[dev.id] || { count: 0, lastAt: 0 };
    const statsLine = stats.count === 0
      ? 'No sessions yet'
      : `${stats.count} session${stats.count !== 1 ? 's' : ''} · last ${_relativeTimeShort(stats.lastAt)}`;
    html += `<div class="light-device-card light-device-card-type-${escapeAttr(dev.type)}" data-id="${escapeAttr(dev.id)}">
      <div class="light-device-head">
        <span class="light-device-icon" aria-hidden="true">${typeIcon}</span>
        <div class="light-device-titleblock">
          <span class="light-device-name">${escapeHTML(dev.brand)} ${escapeHTML(dev.model)}</span>
          <span class="light-device-typeline">${escapeHTML(typeLabel)}${wavelengthStr ? ` · ${escapeHTML(wavelengthStr)}` : ''}${intensityStr ? ` · ${escapeHTML(intensityStr)}` : ''}</span>
        </div>
        <button class="light-device-delete" onclick="window.deleteLightDevice('${escapeAttr(dev.id)}')" title="Remove device" aria-label="Remove device">×</button>
      </div>
      ${channelChips ? `<div class="light-device-feeds">
        <span class="light-device-feeds-label">Feeds</span>
        ${channelChips}
      </div>` : ''}
      <div class="light-device-stats">${escapeHTML(statsLine)}</div>
      <div class="light-device-actions">
        <button class="import-btn import-btn-primary light-device-log" onclick="window.openDeviceSessionDialog('${escapeAttr(dev.id)}')">▶ Log session</button>
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

// Compress a peak-wavelength array into a human-friendly summary.
// 0 peaks → empty. 1-3 peaks → list as comma-separated. 4+ peaks →
// "min-max nm (N bands)" so a 9-wavelength panel doesn't render as
// "295/380/480/630/670/760/810/830/850 nm" eyeball-soup.
function _formatWavelengthSummary(peaks) {
  if (!Array.isArray(peaks) || peaks.length === 0) return '';
  const sorted = peaks.slice().sort((a, b) => a - b);
  if (sorted.length <= 3) return sorted.join(' / ') + ' nm';
  return `${sorted[0]}–${sorted[sorted.length - 1]} nm (${sorted.length} bands)`;
}

// Per-device channel-icon strip — same icon set the dashboard pills
// use, so users see at-a-glance which channels this device feeds. Hover
// title shows the full channel name for screen readers / tooltips.
function _renderDeviceChannelChips(channelKeys) {
  if (!Array.isArray(channelKeys) || channelKeys.length === 0) return '';
  // Order matches the dashboard pill row so the visual scan is consistent
  const order = ['vitamin_d', 'pomc', 'no_cv', 'violet_eye', 'circadian', 'nir_solar', 'pbm_red', 'pbm_nir'];
  const present = new Set(channelKeys);
  const chips = [];
  for (const k of order) {
    if (!present.has(k)) continue;
    const meta = CHANNEL_DISPLAY[k] || {};
    chips.push(`<span class="light-device-feed-chip" title="${escapeAttr((meta.label || k) + ' — ' + (meta.what || ''))}">
      <span class="light-device-feed-icon" aria-hidden="true">${meta.icon || '·'}</span>
      <span class="light-device-feed-label">${escapeHTML(meta.label || k)}</span>
    </span>`);
  }
  return chips.join('');
}

// Coarse relative-time formatter — "today" / "yesterday" / "N days ago"
// / "N weeks ago" / "N months ago". Specifically NOT "X minutes ago"
// because device sessions are typically minutes-long therapy bouts —
// the user cares about the day-grain cadence, not freshness.
function _relativeTimeShort(ts) {
  if (!ts) return 'never';
  const days = Math.floor((Date.now() - ts) / (24 * 3600 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) {
    const w = Math.floor(days / 7);
    return `${w} week${w !== 1 ? 's' : ''} ago`;
  }
  if (days < 365) {
    const m = Math.floor(days / 30);
    return `${m} month${m !== 1 ? 's' : ''} ago`;
  }
  const y = Math.floor(days / 365);
  return `${y} year${y !== 1 ? 's' : ''} ago`;
}

// ─── UI: Add-device modal ──────────────────────────────────────────────

export async function openAddDeviceDialog() {
  const { presets, types } = await loadPresets();
  const groups = {};
  for (const p of presets) {
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

  // Anything not in the curated preset list goes through the AI-powered
  // custom-add flow (paste URL or scan label) — same UX shape as the
  // supplement-add modal in supplements.js.
  const hasAI = window.hasAIProvider && window.hasAIProvider();
  const aiHint = hasAI
    ? 'Don\'t see your device? Paste its product page or snap a photo of the back panel — AI extracts the specs.'
    : 'Don\'t see your device? Set up an AI provider in Settings to auto-extract specs from a URL or photo, or click below to enter manually.';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-label="Add light device">
    <div class="modal-header">
      <h3>Add a light device</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">Pick from the curated brand presets — Mitochondriak, Chroma, EMR-Tek. Anything else uses the custom-add flow below.</p>
      <select id="add-device-preset" class="ctx-select" style="width:100%;margin-top:12px">
        ${opts}
      </select>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="import-btn import-btn-primary" id="add-device-confirm">Add device</button>
      </div>

      <hr style="margin:20px 0;border:none;border-top:1px solid var(--border)">

      <p class="modal-body-hint">${escapeHTML(aiHint)}</p>
      <button type="button" class="import-btn import-btn-secondary" id="add-device-custom" style="width:100%;margin-top:8px">+ Custom device (paste link or scan photo)</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#add-device-custom').addEventListener('click', () => {
    overlay.remove();
    openCustomDeviceDialog();
  });

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

// ─── UI: AI-powered custom-device add modal ───────────────────────────
//
// Mirrors the supplement custom-add flow (see supplements.js
// fetchSupplementFromURL + scanSupplementLabel) — paste a product URL or
// snap a photo of the device, AI extracts brand/model/peakWavelengths/
// irradiance/type, user verifies and saves. No preset lookup; fields are
// editable before save.
export async function openCustomDeviceDialog() {
  const hasAI = hasAIProvider();
  const hasVision = hasAI && supportsVision();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-label="Add custom light device">
    <div class="modal-header">
      <h3>Add a custom device</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${hasAI ? `
      <p class="modal-body-hint">Paste a product page URL or scan the label — AI will extract the device specs. You can edit any field before saving.</p>
      <div class="custom-device-ai-row">
        <input type="url" id="custom-dev-url" class="ctx-input" placeholder="https://..." style="flex:1" />
        <button type="button" class="import-btn import-btn-secondary custom-dev-fetch" id="custom-dev-fetch">Fetch &amp; analyse</button>
      </div>
      ${hasVision ? `<div class="custom-device-ai-row" style="margin-top:8px">
        <button type="button" class="import-btn import-btn-secondary custom-dev-scan" id="custom-dev-scan">📷 Scan device label</button>
        <input type="file" id="custom-dev-image" accept="image/*" style="display:none">
      </div>` : `<p class="modal-body-hint" style="margin-top:8px">Image scan needs a vision-capable AI model (Claude or OpenAI).</p>`}
      <hr style="margin:16px 0;border:none;border-top:1px solid var(--border)">
      ` : `<p class="modal-body-hint">Set up an AI provider in Settings to auto-extract specs from a URL or photo. For now, fill in fields manually:</p>`}
      <div class="custom-device-form">
        <label class="ctx-label">Brand
          <input type="text" id="custom-dev-brand" class="ctx-input" placeholder="e.g. Mitochondriak" />
        </label>
        <label class="ctx-label">Model
          <input type="text" id="custom-dev-model" class="ctx-input" placeholder="e.g. Maxi UVB" />
        </label>
        <label class="ctx-label">Type
          <select id="custom-dev-type" class="ctx-select">
            <option value="combined">Red + near-IR panel</option>
            <option value="uvb">UV phototherapy (UVB-capable)</option>
            <option value="uva">UVA panel (no UVB)</option>
            <option value="pbm-targeted">Targeted PBM device</option>
            <option value="sad">SAD light box (10k lux)</option>
            <option value="dawn-sim">Dawn simulator</option>
            <option value="full-spectrum">Full-spectrum bulb</option>
          </select>
        </label>
        <label class="ctx-label">Peak wavelengths (nm, comma-separated)
          <input type="text" id="custom-dev-peaks" class="ctx-input" placeholder="e.g. 660, 850" />
        </label>
        <label class="ctx-label">Irradiance (mW/cm² at vendor's reference distance)
          <input type="number" id="custom-dev-irradiance" class="ctx-input" min="0" step="any" placeholder="e.g. 100 (leave blank for SAD lamps)" />
        </label>
        ${(() => {
          const useUS = state.unitSystem === 'US';
          const startUnit = useUS ? 'in' : 'cm';
          const ph = startUnit === 'in' ? 'e.g. 6' : 'e.g. 15';
          return `<label class="ctx-label">Vendor reference distance — distance the irradiance was measured at
            <div class="dev-distance-row">
              <input type="number" id="custom-dev-distance" class="ctx-input" min="1" max="200" step="any" placeholder="${ph}" data-unit="${startUnit}" />
              <div class="dev-unit-toggle" role="tablist" aria-label="Distance unit">
                <button type="button" class="dev-unit-btn${startUnit === 'cm' ? ' active' : ''}" data-target="custom-dev-distance" data-unit="cm" role="tab" aria-selected="${startUnit === 'cm'}">cm</button>
                <button type="button" class="dev-unit-btn${startUnit === 'in' ? ' active' : ''}" data-target="custom-dev-distance" data-unit="in" role="tab" aria-selected="${startUnit === 'in'}">in</button>
              </div>
            </div>
          </label>`;
        })()}
        <label class="ctx-label">Lux at the eye (for SAD / dawn lamps)
          <input type="number" id="custom-dev-lux" class="ctx-input" min="0" step="any" placeholder="e.g. 10000" />
        </label>
      </div>
      <div class="modal-actions" style="margin-top:18px">
        <button type="button" class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button type="button" class="import-btn import-btn-primary" id="custom-dev-save">Add device</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  // Per-field unit toggle on the Vendor reference distance input —
  // same in-place conversion as the session dialog. data-target picks
  // out which input each toggle button governs (only one in this
  // modal, but the helper is reusable).
  for (const btn of overlay.querySelectorAll('.dev-unit-btn[data-target]')) {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-unit');
      const inputId = btn.getAttribute('data-target');
      const input = overlay.querySelector('#' + inputId);
      const cur = input.dataset.unit || 'cm';
      if (cur === target) return;
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) {
        const cm = cur === 'in' ? v * 2.54 : v;
        input.value = target === 'in' ? +(cm / 2.54).toFixed(1) : Math.round(cm * 10) / 10;
      }
      input.dataset.unit = target;
      for (const b of overlay.querySelectorAll(`.dev-unit-btn[data-target="${inputId}"]`)) {
        const active = b.getAttribute('data-unit') === target;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      }
    });
  }

  if (hasAI) {
    overlay.querySelector('#custom-dev-fetch').addEventListener('click', () => _fetchCustomDeviceFromURL(overlay));
    if (hasVision) {
      overlay.querySelector('#custom-dev-scan').addEventListener('click', () => overlay.querySelector('#custom-dev-image').click());
      overlay.querySelector('#custom-dev-image').addEventListener('change', (e) => _scanCustomDeviceLabel(e.target, overlay));
    }
  }
  overlay.querySelector('#custom-dev-save').addEventListener('click', async () => {
    const spec = _readCustomDeviceForm(overlay);
    if (!spec.brand || !spec.model) {
      showNotification('Brand and model are required.', 'error');
      return;
    }
    await addCustomDevice(spec);
    overlay.remove();
    showNotification('Device added.');
    if (window.navigate && state.currentView === 'light') window.navigate('light');
  });
}

function _readCustomDeviceForm(overlay) {
  const peaksRaw = overlay.querySelector('#custom-dev-peaks').value.trim();
  const peaks = peaksRaw
    ? peaksRaw.split(/[,\s]+/).map(s => parseFloat(s)).filter(n => Number.isFinite(n) && n > 100 && n < 3000)
    : [];
  const irrRaw = overlay.querySelector('#custom-dev-irradiance').value.trim();
  const distInput = overlay.querySelector('#custom-dev-distance');
  const distRaw = distInput.value.trim();
  const distUnit = distInput.dataset.unit || 'cm';
  const distCm = distRaw
    ? (distUnit === 'in' ? parseFloat(distRaw) * 2.54 : parseFloat(distRaw))
    : null;
  const luxRaw = overlay.querySelector('#custom-dev-lux').value.trim();
  return {
    brand: overlay.querySelector('#custom-dev-brand').value.trim(),
    model: overlay.querySelector('#custom-dev-model').value.trim(),
    type: overlay.querySelector('#custom-dev-type').value,
    peakWavelengths: peaks,
    mwPerCm2At15cm: irrRaw ? parseFloat(irrRaw) : null,
    recommendedDistanceCm: distCm,
    lux: luxRaw ? parseFloat(luxRaw) : null,
  };
}

function _applyParsedDevice(parsed, overlay) {
  if (!parsed || typeof parsed !== 'object') return;
  const _valid = v => v != null && v !== '' && !/not (specified|found|available|provided)/i.test(String(v)) && !/^n\/?a$/i.test(String(v));
  const set = (id, val) => {
    if (!_valid(val)) return;
    const el = overlay.querySelector(id);
    if (el && !el.value) el.value = val;
  };
  set('#custom-dev-brand', parsed.brand);
  set('#custom-dev-model', parsed.model);
  if (parsed.type) {
    const sel = overlay.querySelector('#custom-dev-type');
    const opt = Array.from(sel.options).find(o => o.value === parsed.type);
    if (opt) sel.value = parsed.type;
  }
  if (Array.isArray(parsed.peakWavelengths) && parsed.peakWavelengths.length > 0) {
    const peaks = parsed.peakWavelengths.filter(n => Number.isFinite(Number(n))).join(', ');
    if (peaks) set('#custom-dev-peaks', peaks);
  }
  set('#custom-dev-irradiance', parsed.mwPerCm2At15cm);
  // Distance comes back from AI in cm. If the input is rendered in
  // inches (US users), convert before populating so the visible value
  // matches the field's unit label.
  if (parsed.recommendedDistanceCm != null) {
    const distEl = overlay.querySelector('#custom-dev-distance');
    if (distEl && !distEl.value) {
      const distUnit = distEl.dataset.unit || 'cm';
      const v = distUnit === 'in'
        ? +(Number(parsed.recommendedDistanceCm) / 2.54).toFixed(1)
        : Number(parsed.recommendedDistanceCm);
      if (Number.isFinite(v) && v > 0) distEl.value = v;
    }
  }
  set('#custom-dev-lux', parsed.lux);
  showNotification('Specs extracted — review and save.', 'success');
}

const _CUSTOM_DEVICE_PROMPT = `Extract light therapy device specs from this product page. Reply with ONLY JSON:
{
  "brand": "manufacturer name",
  "model": "model name",
  "type": "uvb|uva|combined|pbm-targeted|sad|dawn-sim|full-spectrum",
  "peakWavelengths": [numbers in nm e.g. 660, 850],
  "mwPerCm2At15cm": number or null (the irradiance value; field is legacy-named — store the vendor's reading at whatever distance they publish),
  "recommendedDistanceCm": number or null (the distance at which the manufacturer measured the irradiance above — typically 15-30 cm; some COB devices recommend 50+ cm. Convert inches to cm: 6 in ≈ 15 cm, 12 in ≈ 30 cm, 20 in ≈ 50 cm),
  "lux": number or null (only for SAD / dawn lamps),
  "notes": "short description"
}

Type guide:
- uvb: emits UVB (270-320 nm) — vitamin D capable, may also have other bands
- uva: emits UVA (320-400 nm) but no UVB
- combined: red + near-IR panel (660 + 850 nm typical), no UV
- pbm-targeted: handheld / spot PBM device
- sad: SAD light box (10000 lux therapy lamp)
- dawn-sim: dawn simulator / wake-up light
- full-spectrum: full-spectrum bulb

Use null for fields not found. No other text.`;

async function _fetchCustomDeviceFromURL(overlay) {
  const urlInput = overlay.querySelector('#custom-dev-url');
  const url = urlInput?.value.trim();
  if (!url) { showNotification('Paste a product URL first', 'error'); return; }
  try { new URL(url); } catch { showNotification('Invalid URL', 'error'); return; }
  const btn = overlay.querySelector('#custom-dev-fetch');
  if (btn) { btn.textContent = 'Fetching...'; btn.disabled = true; }
  try {
    // Same fetch path supplements.js uses — /api/fetch-page on localhost,
    // POST /api/proxy on hosted. Reuses the existing trusted-host gates.
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    let html;
    if (isLocal) {
      const res = await fetch('/api/fetch-page?url=' + encodeURIComponent(url));
      const json = await res.json();
      html = json.html;
    } else {
      const res = await fetch('/api/proxy', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, method: 'GET', headers: {} })
      });
      html = await res.text();
    }
    if (!html || html.length < 100) { showNotification('Could not fetch page content', 'error'); return; }
    // Strip scripts / styles / nav / footer; keep paragraphs near
    // device-relevant keywords + first 5kB so the prompt stays compact.
    const ldMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
    const ldText = ldMatches.map(m => m.replace(/<script[^>]*>|<\/script>/gi, '').trim()).join('\n');
    const plainText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ');
    const kwPattern = /(.{0,300}(?:wavelength|spectrum|nm|red light|near.?infrared|UV[AB]?|irradiance|mW\/cm|lux|inches|distance|specifications?|specs).{0,500})/gi;
    const kwMatches = plainText.match(kwPattern) || [];
    const trimmed = (ldText + '\n' + kwMatches.join('\n') + '\n' + plainText.slice(0, 5000)).slice(0, 15000);
    const result = await callClaudeAPI({
      system: _CUSTOM_DEVICE_PROMPT,
      messages: [{ role: 'user', content: trimmed }],
      maxTokens: 800,
    });
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { showNotification('Could not parse device specs from page', 'error'); return; }
    _applyParsedDevice(JSON.parse(jsonMatch[0]), overlay);
  } catch (e) {
    if (isDebugMode()) console.warn('[fetchCustomDevice]', e);
    showNotification('Failed to fetch: ' + (e.message || 'Unknown error'), 'error');
  } finally {
    if (btn) { btn.textContent = 'Fetch & analyse'; btn.disabled = false; }
  }
}

async function _scanCustomDeviceLabel(input, overlay) {
  const file = input.files?.[0];
  input.value = '';
  if (!file || !isValidImageType(file.type)) {
    showNotification('Please select an image (JPG, PNG, WebP)', 'error');
    return;
  }
  const btn = overlay.querySelector('#custom-dev-scan');
  if (btn) { btn.textContent = 'Scanning...'; btn.disabled = true; }
  try {
    const { base64, mediaType } = await resizeImage(file, 1024, 0.85);
    const imageBlock = formatImageBlock(base64, mediaType);
    const content = buildVisionContent([imageBlock], _CUSTOM_DEVICE_PROMPT);
    const result = await callClaudeAPI({ messages: [{ role: 'user', content }], maxTokens: 800 });
    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) { showNotification('Could not parse device specs from image', 'error'); return; }
    _applyParsedDevice(JSON.parse(jsonMatch[0]), overlay);
  } catch (e) {
    if (isDebugMode()) console.warn('[scanCustomDevice]', e);
    showNotification('Failed to scan: ' + (e.message || 'Unknown error'), 'error');
  } finally {
    if (btn) { btn.textContent = '📷 Scan device label'; btn.disabled = false; }
  }
}

// Save a user-defined device (no preset lookup). Same shape as
// addDeviceFromPreset's output minus presetId/catalogSlug — custom devices
// don't get an affiliate link surface (no canonical product to link to).
export async function addCustomDevice(spec) {
  if (!spec || !spec.brand || !spec.model) return null;
  const id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  // Map type → channels for dose math. Mirrors the per-channel logic
  // used by the curated presets so a custom device on, say, type=uvb
  // still feeds vitamin_d + pomc + violet_eye + circadian by default
  // (the spectrum convolution refines the actual doses by wavelength).
  const TYPE_CHANNELS = {
    'uvb': ['vitamin_d', 'pomc', 'no_cv', 'violet_eye', 'circadian', 'pbm_red', 'pbm_nir'],
    'uva': ['no_cv', 'violet_eye', 'pbm_red', 'pbm_nir'],
    'combined': ['pbm_red', 'pbm_nir'],
    'pbm-targeted': ['pbm_red', 'pbm_nir'],
    'sad': ['circadian'],
    'dawn-sim': ['circadian'],
    'full-spectrum': ['circadian'],
  };
  const device = {
    id,
    presetId: null,
    brand: spec.brand,
    model: spec.model,
    type: spec.type || 'combined',
    peakWavelengths: Array.isArray(spec.peakWavelengths) ? spec.peakWavelengths : [],
    mwPerCm2At15cm: Number.isFinite(spec.mwPerCm2At15cm) ? spec.mwPerCm2At15cm : null,
    lux: Number.isFinite(spec.lux) ? spec.lux : null,
    recommendedDistanceCm: Number.isFinite(spec.recommendedDistanceCm) && spec.recommendedDistanceCm > 0 ? spec.recommendedDistanceCm : 15,
    channels: TYPE_CHANNELS[spec.type] || ['pbm_red', 'pbm_nir'],
    catalogSlug: null,
    notes: spec.notes || '',
    addedAt: Date.now(),
  };
  getDevices().push(device);
  await saveImportedData();
  return device;
}

// ─── UI: log device session modal ──────────────────────────────────────

export async function openDeviceSessionDialog(deviceId) {
  const device = getDevices().find(d => d.id === deviceId);
  if (!device) return;
  // Prefill from the user's last logged session on this device. First-
  // time logs fall through to vendor reference distance + sensible
  // defaults (10 min, torso, eyes protected). Each save updates
  // device.lastSession so the dialog opens with the user's actual
  // ritual next time.
  const last = device.lastSession || {};
  const defaultDuration = Number.isFinite(last.durationMin) && last.durationMin > 0 ? last.durationMin : 10;
  const defaultDistanceCm = Number.isFinite(last.distanceCm) && last.distanceCm > 0
    ? last.distanceCm
    : (device.recommendedDistanceCm || 15);
  const defaultBodyArea = last.bodyArea || 'torso';
  const defaultEyesProtected = last.eyesProtected !== false;
  const BODY_AREA_OPTIONS = [
    ['targeted', 'Targeted (single area)'], ['face', 'Face'],
    ['torso', 'Torso'], ['arms', 'Arms'], ['legs', 'Legs'],
    ['whole-body', 'Whole body'],
  ];
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-label="Log device session">
    <div class="modal-header">
      <h3>Log session — ${escapeHTML(device.brand)} ${escapeHTML(device.model)}</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <label class="ctx-label">Duration (minutes)
        <input type="number" id="dev-session-duration" class="ctx-input" min="1" max="120" value="${defaultDuration}" />
      </label>
      ${(() => {
        const useUS = state.unitSystem === 'US';
        const startUnit = useUS ? 'in' : 'cm';
        const refCm = device.recommendedDistanceCm || 15;
        const fmt = (cm, u) => u === 'in' ? +(cm / 2.54).toFixed(1) : cm;
        // Hint surfaces the vendor reference always; if the user has
        // overridden it before, surface that override too so they know
        // why the input shows a different default.
        const hasOverride = Number.isFinite(last.distanceCm) && Math.abs(last.distanceCm - refCm) > 0.5;
        const overrideHint = hasOverride
          ? ` You usually log at ${fmt(defaultDistanceCm, 'cm')} cm — prefilled below.`
          : '';
        return `<label class="ctx-label">Distance from device
          <div class="dev-distance-row">
            <input type="number" id="dev-session-distance" class="ctx-input" min="2" max="200" step="0.5" value="${fmt(defaultDistanceCm, startUnit)}" data-unit="${startUnit}" data-base-cm="${refCm}" />
            <div class="dev-unit-toggle" role="tablist" aria-label="Distance unit">
              <button type="button" class="dev-unit-btn${startUnit === 'cm' ? ' active' : ''}" data-unit="cm" role="tab" aria-selected="${startUnit === 'cm'}">cm</button>
              <button type="button" class="dev-unit-btn${startUnit === 'in' ? ' active' : ''}" data-unit="in" role="tab" aria-selected="${startUnit === 'in'}">in</button>
            </div>
          </div>
          <span class="dev-session-hint">Vendor reference: ${fmt(refCm, 'cm')} cm (${fmt(refCm, 'in')} in).${overrideHint} The dose math uses inverse-square scaling around this point — close ranges magnify errors fast.</span>
        </label>`;
      })()}
      <label class="ctx-label">Body area
        <select id="dev-session-area" class="ctx-select">
          ${BODY_AREA_OPTIONS.map(([v, l]) => `<option value="${v}"${v === defaultBodyArea ? ' selected' : ''}>${escapeHTML(l)}</option>`).join('')}
        </select>
      </label>
      <label class="ctx-label">
        <input type="checkbox" id="dev-session-eyes"${defaultEyesProtected ? ' checked' : ''} />
        Eyes protected (goggles or closed)
      </label>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="import-btn import-btn-primary" id="dev-session-save">Save session</button>
      </div>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  // Per-field unit toggle: cm ↔ in. Lets a US user briefly type a cm
  // value (or vice versa) without mental math when their global unit
  // preference doesn't match the spec sheet they're reading from.
  // Conversion happens in-place on the visible value; data-unit attr
  // tracks what the field is currently representing.
  for (const btn of overlay.querySelectorAll('.dev-unit-btn')) {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-unit');
      const input = overlay.querySelector('#dev-session-distance');
      const cur = input.dataset.unit || 'cm';
      if (cur === target) return;
      const v = parseFloat(input.value);
      if (Number.isFinite(v)) {
        const cm = cur === 'in' ? v * 2.54 : v;
        input.value = target === 'in' ? +(cm / 2.54).toFixed(1) : Math.round(cm);
      }
      input.dataset.unit = target;
      input.step = target === 'in' ? '0.5' : '1';
      for (const b of overlay.querySelectorAll('.dev-unit-btn')) {
        const active = b.getAttribute('data-unit') === target;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
      }
    });
  }

  overlay.querySelector('#dev-session-save').addEventListener('click', async () => {
    const durationMin = parseInt(overlay.querySelector('#dev-session-duration').value, 10) || 10;
    // Read distance in whatever unit the input was rendered with — the
    // data-unit attribute carries the unit, the dose math always works in cm.
    const distInput = overlay.querySelector('#dev-session-distance');
    const distVal = parseFloat(distInput.value);
    const distUnit = distInput.dataset.unit || 'cm';
    const distanceCm = Number.isFinite(distVal)
      ? (distUnit === 'in' ? distVal * 2.54 : distVal)
      : (device.recommendedDistanceCm || 15);
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
    openCustomDeviceDialog,
    addCustomDevice,
    openDeviceSessionDialog,
    quickLogDeviceSession,
  });
}
