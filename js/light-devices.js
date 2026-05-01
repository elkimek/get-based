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
        <label class="ctx-label">Irradiance @ 15 cm (mW/cm²)
          <input type="number" id="custom-dev-irradiance" class="ctx-input" min="0" step="any" placeholder="e.g. 100 (leave blank for SAD lamps)" />
        </label>
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
  const luxRaw = overlay.querySelector('#custom-dev-lux').value.trim();
  return {
    brand: overlay.querySelector('#custom-dev-brand').value.trim(),
    model: overlay.querySelector('#custom-dev-model').value.trim(),
    type: overlay.querySelector('#custom-dev-type').value,
    peakWavelengths: peaks,
    mwPerCm2At15cm: irrRaw ? parseFloat(irrRaw) : null,
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
  set('#custom-dev-lux', parsed.lux);
  showNotification('Specs extracted — review and save.', 'success');
}

const _CUSTOM_DEVICE_PROMPT = `Extract light therapy device specs from this product page. Reply with ONLY JSON:
{
  "brand": "manufacturer name",
  "model": "model name",
  "type": "uvb|uva|combined|pbm-targeted|sad|dawn-sim|full-spectrum",
  "peakWavelengths": [numbers in nm e.g. 660, 850],
  "mwPerCm2At15cm": number or null,
  "lux": number or null,
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
    const kwPattern = /(.{0,300}(?:wavelength|spectrum|nm|red light|near.?infrared|UV[AB]?|irradiance|mW\/cm|lux|specifications?|specs).{0,500})/gi;
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
    openCustomDeviceDialog,
    addCustomDevice,
    openDeviceSessionDialog,
    quickLogDeviceSession,
  });
}
