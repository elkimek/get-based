// @ts-check
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

import { formatDeviceElapsedMs, relativeDeviceTimeShort } from './light-device-view-utils.js';
import { bindDetachedModalSyncRefresh, escapeHTML, escapeAttr, formatDate, showNotification, showConfirmDialog } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { CHANNEL_DISPLAY } from './sun.js';
import { BODY_REGIONS, bindBodySilhouette, renderBodySilhouette } from './sun-body-silhouette.js';
import { validateModeCoupling } from './sun-spectrum.js';
import {
  addCustomDevice,
  addDeviceFromPresetRecord,
  deleteDevice,
  deleteDeviceSession,
  getActiveDeviceSession,
  getDeviceSessions,
  getDevices,
  hydrateDevicesFromPresetRecords,
  logDeviceSession,
  rollingDeviceTotals,
  startDeviceSession,
  stopDeviceSession,
  updateDeviceSession,
} from './light-devices-store.js';
import { openDeviceSessionDialog as openDeviceSessionDialogModal } from './light-device-session-modal.js';
import { configureLightDeviceSetup, openAddDeviceDialog, openCustomDeviceDialog } from './light-device-setup-modal.js';
import { installLightDevicesActionDelegates } from './light-devices-actions.js';
import {
  deleteLightDeviceSessionFromRuntime,
  editLightDeviceSessionDurationFromRuntime,
  editLightDeviceSessionModeFromRuntime,
  getLightDeviceChannelDisplay,
  getLightDeviceChannelHelpers,
  loadLightDevicesCatalog,
  navigateLightDevicesRoute,
  openLightDeviceChannel,
  promptLightDeviceSessionDuration,
  publishLightDevicesWindowBindings,
  refreshLightDevicesView,
  renderLightDeviceAffiliateRowRuntime,
} from './light-devices-runtime.js';

/** @type {{ renderDeviceSessionAIDetail: (sess: any) => string }} */
const lightDevicesDeps = {
  renderDeviceSessionAIDetail: () => '',
};

export function configureLightDevices(deps = {}) {
  Object.assign(lightDevicesDeps, deps);
}

if (typeof document !== 'undefined') installLightDevicesActionDelegates();

export { installLightDevicesActionDelegates };
export { openAddDeviceDialog, openCustomDeviceDialog };
export {
  addCustomDevice,
  deleteDevice,
  deleteDeviceSession,
  getActiveDeviceSession,
  getDeviceSessions,
  getDevices,
  logDeviceSession,
  rollingDeviceTotals,
  startDeviceSession,
  stopDeviceSession,
  updateDeviceSession,
};

// Preset library is loaded lazily — keeps the JSON out of the boot path.
let _PRESETS = null;
let _PRESET_TYPES = null;

// Standard modal-mount pattern shared by every modal opener in this file:
// wire backdrop-click close, append, then trap focus.
function _wireModal(overlay, closeFn) {
  if (typeof window === 'undefined') { document.body.appendChild(overlay); return; }
  openAppendedModalOverlay(overlay, closeFn);
}

export async function loadLightDevicePresets() {
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

export async function addDeviceFromPreset(presetId, overrides = {}) {
  const { presets } = await loadLightDevicePresets();
  const preset = presets.find(p => p.id === presetId);
  return addDeviceFromPresetRecord(preset, overrides);
}

// Backfill channelGroups / modes / coupling from the preset library onto
// user devices that pre-date Round 7. Idempotent — devices already
// carrying the field skip. Custom (non-preset) devices skip too. Run
// once at boot so existing localStorage devices light up the mode picker
// without requiring re-add.
export async function hydrateDevicesFromPresets() {
  const { presets } = await loadLightDevicePresets();
  return hydrateDevicesFromPresetRecords(presets);
}

// ─── Live device-session timer ─────────────────────────────────────────
//
// Mirrors the sun.js start/stop pattern: startDeviceSession() stages an
// active record with a start timestamp + selected regions; the dashboard
// + /light surfaces show a live elapsed counter; stopDeviceSession()
// finalizes it through logDeviceSession's dose math so the saved record
// is identical in shape to an after-the-fact log.

// User-facing edit-mode entry point. Mirrors editDeviceSessionDuration
// but for the mode field — opens a small picker dialog filtered to
// coupling-valid modes, persists the choice via updateDeviceSession
// (which recomputes doses through effectiveDeviceForMode), re-renders.
// Devices without `modes` (or with only one valid mode after coupling
// filtering) skip the dialog and surface a notice instead.
export async function editDeviceSessionMode(id) {
  const sess = getDeviceSessions().find(s => s.id === id);
  if (!sess) {
    showNotification('Session not found', 'error');
    return;
  }
  const device = getDevices().find(d => d.id === sess.deviceId);
  if (!device || !Array.isArray(device.modes) || device.modes.length === 0) {
    showNotification('This device has no selectable modes.', 'info');
    return;
  }
  const validModes = device.modes.filter(m => validateModeCoupling(device, m.id).ok);
  if (validModes.length < 2) {
    showNotification('Only one mode is available for this device.', 'info');
    return;
  }
  const currentMode = sess.mode || (device.modes.find(m => m.default) || device.modes[0])?.id;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const closeDialog = () => removeModalOverlay(overlay);
  overlay.innerHTML = `<div class="modal" role="dialog" aria-label="Edit session mode">
    <div class="modal-header">
      <h3>Edit mode — ${escapeHTML(device.brand)} ${escapeHTML(device.model)}</h3>
      <button class="modal-close" data-device-mode-close aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">Pick the LED-group mode that actually fired during this session. Doses will be recomputed on save.</p>
      <label class="ctx-label">Mode
        <select id="dev-edit-mode" class="ctx-select">
          ${validModes.map(m => `<option value="${escapeAttr(m.id)}"${m.id === currentMode ? ' selected' : ''}>${escapeHTML(m.label || m.id)}</option>`).join('')}
        </select>
      </label>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" data-device-mode-close>Cancel</button>
        <button class="import-btn import-btn-primary" id="dev-edit-mode-save">Save</button>
      </div>
    </div>
  </div>`;
  _wireModal(overlay, closeDialog);
  overlay.querySelectorAll('[data-device-mode-close]').forEach(btn => {
    btn.addEventListener('click', closeDialog);
  });
  overlay.querySelector('#dev-edit-mode-save').addEventListener('click', async () => {
    const next = _select(overlay, '#dev-edit-mode')?.value || '';
    closeDialog();
    if (next === sess.mode) return;
    await updateDeviceSession(id, { mode: next });
    showNotification('Mode updated. Doses recomputed.', 'success');
    refreshLightDevicesView();
  });
}

// User-facing edit-duration entry point — same shape as
// editSunSessionDuration. Prompts for new minutes, validates, calls
// updateDeviceSession (which recomputes doses + endedAt), re-renders.
export async function editDeviceSessionDuration(id) {
  const sess = getDeviceSessions().find(s => s.id === id);
  if (!sess) {
    showNotification('Session not found', 'error');
    return;
  }
  const current = Math.max(0, Math.round(sess.durationMin || 0));
  const raw = await promptLightDeviceSessionDuration(current);
  if (raw === null || raw === undefined) return;
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 600) {
    showNotification('Enter a duration between 0 and 600 minutes.', 'error');
    return;
  }
  const next = Math.round(parsed);
  if (next === current) return;
  await updateDeviceSession(id, { durationMin: next });
  showNotification(`Session duration set to ${next} min. Doses recomputed.`, 'success');
  refreshLightDevicesView();
}

// ─── UI: per-device-session detail modal ──────────────────────────────
//
// Mirrors openSunSessionDetail in shape so the unified sessions list
// behaves consistently — clicking any row opens its details. Device
// sessions don't carry atmosphere or location, so we surface device
// info instead (peak wavelengths, irradiance, recommended distance).
const _DEVICE_AREA_LABELS = {
  'targeted': 'Targeted (single area)',
  'face': 'Face',
  'torso': 'Torso',
  'arms': 'Arms',
  'legs': 'Legs',
  'whole-body': 'Whole body',
};

/**
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {HTMLSelectElement|null}
 */
function _select(root, selector) {
  return /** @type {HTMLSelectElement|null} */ (root.querySelector(selector));
}

export function openDeviceSessionDetail(id) {
  const sessions = getDeviceSessions();
  const sess = sessions.find(s => s.id === id);
  if (!sess) return;
  const device = getDevices().find(d => d.id === sess.deviceId) || null;
  const { channelTier, tierLabel, formatChannelUnit } = getLightDeviceChannelHelpers();
  const channelDisplay = getLightDeviceChannelDisplay(CHANNEL_DISPLAY);
  const channelOrder = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye', 'pbm_red', 'pbm_nir'];

  const start = formatDate(new Date(sess.startedAt).toISOString().slice(0, 10));
  const dur = sess.durationMin ? `${Math.round(sess.durationMin)} min` : '—';
  const devName = device ? `${device.brand} ${device.model}` : 'Removed device';
  const typeLabel = device?.type || '—';
  const peakStr = device?.peakWavelengths?.length
    ? device.peakWavelengths.map(w => `${w} nm`).join(', ') : '—';
  const irradianceStr = device?.mwPerCm2At15cm
    ? `${device.mwPerCm2At15cm} mW/cm² @ ${device?.recommendedDistanceCm || 15} cm`
    : (device?.lux ? `${device.lux.toLocaleString()} lux` : '—');
  const calculation = sess.calculation || null;
  const calculationSource = calculation?.provenance?.source || sess.physicalDoses?.source || 'not recorded';
  const inputQuality = calculation?.confidence?.level || 'unknown';
  const safety = sess.safety || null;
  const modeledBurnPct = Number.isFinite(safety?.medFraction)
    ? Math.round(safety.medFraction * 10) * 10
    : null;
  const ocularDose = Number.isFinite(safety?.ocularEffectiveDose)
    ? Math.round(safety.ocularEffectiveDose * 10) / 10
    : null;
  const distanceStr = sess.distanceCm ? `${sess.distanceCm} cm` : '—';
  // Prefer the precise bodyAreas[] list when present (sessions from
  // 2026-05-08+); fall back to the legacy broad-zone string for older
  // sessions that pre-date the per-region picker.
  let areaLabel;
  if (Array.isArray(sess.bodyAreas) && sess.bodyAreas.length > 0) {
    const labelByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.label]));
    const fracByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.fraction]));
    const totalFrac = sess.bodyAreas.reduce((s, k) => s + (fracByKey[k] || 0), 0);
    const labels = sess.bodyAreas.map(k => labelByKey[k] || k).join(', ');
    areaLabel = `${labels} (~${Math.round(totalFrac * 100)}% of skin)`;
  } else {
    areaLabel = _DEVICE_AREA_LABELS[sess.bodyArea] || sess.bodyArea || '—';
  }
  const eyesLabel = sess.eyesProtected ? 'Protected (closed / blocked)' : 'Uncovered';
  // Mode label resolution — surface the human-readable label whenever
  // the device declares modes. Legacy sessions (no `mode` field) and
  // devices without a `modes` array both fall through to null.
  let modeLabel = null;
  let canEditMode = false;
  if (device && Array.isArray(device.modes) && device.modes.length > 0) {
    const resolved = device.modes.find(m => m.id === sess.mode)
      || device.modes.find(m => m.default)
      || device.modes[0];
    modeLabel = resolved ? (resolved.label || resolved.id) : null;
    canEditMode = device.modes.filter(m => validateModeCoupling(device, m.id).ok).length > 1;
  }

  // Body-fraction for the per-session vit-D cap (Audit P1 #8). Computed
  // once outside the channel loop — bodyAreas is the schema, BODY_REGIONS
  // carries the per-region area weights. Falls back to null (legacy
  // daily-cap behavior) when bodyAreas is unset.
  let _sessBodyFrac = null;
  if (Array.isArray(sess.bodyAreas) && sess.bodyAreas.length > 0) {
    const _fracByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.fraction]));
    _sessBodyFrac = sess.bodyAreas.reduce((s, k) => s + (_fracByKey[k] || 0), 0) || null;
  }
  const channelRows = sess.doses ? channelOrder
    .filter(k => sess.doses[k] != null)
    .map(k => {
      const meta = channelDisplay[k] || {};
      const v = sess.doses[k] || 0;
      const t = channelTier(v, k);
      const tlabel = tierLabel(t);
      const unitText = formatChannelUnit(k, v, sess.durationMin || 0, 'III', null, null, false, _sessBodyFrac);
      const ariaLabel = `${meta.label || k} — ${tlabel}${unitText ? ', ' + unitText : ''}. Open channel details.`;
      return `<div class="sun-detail-channel-row sun-detail-channel-row-clickable sun-chip-tier-${t}" data-channel="${escapeAttr(k)}" role="button" tabindex="0" aria-label="${escapeAttr(ariaLabel)}">
        <span class="sun-detail-channel-icon" aria-hidden="true">${meta.icon || '·'}</span>
        <span class="sun-detail-channel-label">${escapeHTML(meta.label || k)}</span>
        <span class="sun-detail-channel-value">${escapeHTML(unitText || '')}</span>
        <span class="sun-detail-channel-tier">${escapeHTML(tlabel)}</span>
        <span class="sun-detail-channel-chevron" aria-hidden="true">›</span>
      </div>`;
    }).join('') : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const closeDialog = () => removeModalOverlay(overlay);
  overlay.innerHTML = `<div class="modal sun-detail-modal" data-session-kind="device" role="dialog" aria-label="Device session details">
    <div class="modal-header">
      <h3>Device session — ${escapeHTML(start)}</h3>
      <button class="modal-close" data-device-session-detail-close aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${typeof lightDevicesDeps.renderDeviceSessionAIDetail === 'function' ? lightDevicesDeps.renderDeviceSessionAIDetail(sess) : ''}
      <div class="sun-detail-grid">
        <div title="Total session duration. Edit via the action row below if the timer ran past the actual session."><span>Duration</span><strong>${escapeHTML(dur)}</strong></div>
        <div title="Distance from the panel's emitting surface to your skin. Inverse-square law applies — the model corrects irradiance by (recommendedDistanceCm / actualDistance)²."><span>Distance</span><strong>${escapeHTML(distanceStr)}</strong></div>
        <div title="Exposed skin regions and aggregate fraction of total body surface area (Wallace rule of nines). Drives per-session vit-D synthesis cap (body_fraction × 30,000 IU per Holick 2008 MED-saturation)."><span>Body area</span><strong>${escapeHTML(areaLabel)}</strong></div>
      </div>

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Device</div>
        <div class="sun-detail-section-value">${escapeHTML(devName)}${typeLabel !== '—' ? ` · ${escapeHTML(typeLabel)}` : ''}</div>
      </div>

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Eyes</div>
        <div class="sun-detail-section-value">${escapeHTML(eyesLabel)}</div>
      </div>

      ${modeLabel ? `
        <div class="sun-detail-section">
          <div class="sun-detail-section-label">Mode</div>
          <div class="sun-detail-section-value" title="The vendor-defined LED-group preset that fired during this session. Affects channel-dose math.">${escapeHTML(modeLabel)}</div>
        </div>
      ` : ''}

      ${device ? `
        <div class="sun-detail-section">
          <div class="sun-detail-section-label">Device spec</div>
          <div class="sun-detail-atm">
            <div title="Peak emission wavelengths declared by the device — drives which channels the spectrum convolution lights up."><span>Peaks</span><strong>${escapeHTML(peakStr)}</strong></div>
            <div title="Irradiance at the manufacturer's reference distance. Distance-square correction (recommendedDistanceCm / actual distance)² is applied to your session."><span>Irradiance</span><strong>${escapeHTML(irradianceStr)}</strong></div>
          </div>
        </div>
      ` : ''}

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Calculation inputs</div>
        <div class="sun-detail-section-value">
          ${escapeHTML(inputQuality)} input quality · ${escapeHTML(calculationSource)}<br>
          <small>Rounded because listed output, beam shape, distance, and actual device performance can differ. Follow the device instructions instead of using this estimate as a timer.</small>
        </div>
      </div>

      ${modeledBurnPct != null || ocularDose != null ? `
        <div class="sun-detail-section">
          <div class="sun-detail-section-label">Safety estimates</div>
          <div class="sun-detail-section-value">${modeledBurnPct != null ? `~${modeledBurnPct}% modeled burn dose` : ''}${modeledBurnPct != null && ocularDose != null ? ' · ' : ''}${ocularDose != null ? `${ocularDose} J/m² occupational effective-exposure reference` : ''}</div>
        </div>
      ` : ''}

      ${channelRows ? `
        <div class="sun-detail-section">
          <div class="sun-detail-section-label">Channels</div>
          <div class="sun-detail-channels">${channelRows}</div>
        </div>
      ` : '<p class="sun-detail-empty">No channel doses computed for this session.</p>'}

      ${sess.notes ? `
        <div class="sun-detail-section">
          <div class="sun-detail-section-label">Notes</div>
          <div class="sun-detail-section-value">${escapeHTML(sess.notes)}</div>
        </div>
      ` : ''}

      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" id="device-detail-edit-duration" title="Override the session duration. Use when you forgot to stop the timer or stopped late.">Edit duration</button>
        ${canEditMode ? `<button class="import-btn import-btn-secondary" id="device-detail-edit-mode" title="Change which LED-group mode the session ran in. Doses recompute on save.">Edit mode</button>` : ''}
        <button class="import-btn import-btn-secondary" id="device-detail-delete" style="color:var(--red);border-color:var(--red)">Delete session</button>
      </div>
    </div>
  </div>`;
  _wireModal(overlay, closeDialog);
  overlay.addEventListener('click', (event) => {
    const target = /** @type {Element|null} */ (event.target instanceof Element ? event.target : null);
    if (!target) return;
    if (target.closest('[data-device-session-detail-close]')) {
      closeDialog();
      return;
    }
    const channelRow = target.closest('.sun-detail-channel-row-clickable[data-channel]');
    if (channelRow && overlay.contains(channelRow)) {
      const channel = channelRow.getAttribute('data-channel') || '';
      closeDialog();
      openLightDeviceChannel(channel);
      return;
    }
    if (target.closest('#device-detail-edit-duration')) {
      closeDialog();
      editLightDeviceSessionDurationFromRuntime(sess.id);
      return;
    }
    if (target.closest('#device-detail-edit-mode')) {
      closeDialog();
      editLightDeviceSessionModeFromRuntime(sess.id);
      return;
    }
    if (target.closest('#device-detail-delete')) {
      closeDialog();
      deleteLightDeviceSessionFromRuntime(sess.id);
    }
  });
  overlay.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = /** @type {Element|null} */ (event.target instanceof Element ? event.target : null);
    const channelRow = target?.closest?.('.sun-detail-channel-row-clickable[data-channel]');
    if (!channelRow || !overlay.contains(channelRow)) return;
    event.preventDefault();
    const channel = channelRow.getAttribute('data-channel') || '';
    closeDialog();
    openLightDeviceChannel(channel);
  });
  bindDetachedModalSyncRefresh({
    overlay,
    id,
    opener: openDeviceSessionDetail,
    exists: sessionId => getDeviceSessions().some(s => s.id === sessionId),
  });
}

// ─── Active device-session card + 1Hz ticker ─────────────────────────
//
// When a live PBM session is running, render a stopwatch-style card
// near the top of the /light page. The elapsed-time element carries a
// `data-live-elapsed-for="<sessionId>"` attribute that the ticker
// below patches every second — same pattern sun.js uses, so the two
// surfaces feel consistent.

export function renderActiveDeviceSessionCard() {
  const sess = getActiveDeviceSession();
  if (!sess) return '';
  const device = getDevices().find(d => d.id === sess.deviceId);
  const devName = device ? `${device.brand} ${device.model}` : 'Removed device';
  const labelByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.label]));
  const fracByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.fraction]));
  let areaLine;
  if (Array.isArray(sess.bodyAreas) && sess.bodyAreas.length > 0) {
    const totalFrac = sess.bodyAreas.reduce((s, k) => s + (fracByKey[k] || 0), 0);
    const labels = sess.bodyAreas.map(k => labelByKey[k] || k).slice(0, 3).join(', ');
    const more = sess.bodyAreas.length > 3 ? ` +${sess.bodyAreas.length - 3} more` : '';
    areaLine = `${labels}${more} · ~${Math.round(totalFrac * 100)}% skin`;
  } else {
    areaLine = _DEVICE_AREA_LABELS[sess.bodyArea] || sess.bodyArea || '';
  }
  const distLine = sess.distanceCm ? `${sess.distanceCm} cm` : '';
  const eyesLine = sess.eyesProtected ? 'eyes protected' : 'eyes uncovered';
  const elapsedText = formatDeviceElapsedMs(Date.now() - sess.startedAt);
  return `<section class="sun-session sun-session-active light-session-device" data-id="${escapeAttr(sess.id)}">
    <div class="sun-session-head">
      <span class="light-session-icon" aria-hidden="true">🔴</span>
      <span class="sun-session-date">Active · ${escapeHTML(devName)}</span>
      <span class="sun-session-duration" data-live-elapsed-for="${escapeAttr(sess.id)}" aria-live="off">${escapeHTML(elapsedText)}</span>
      <span class="sun-session-paused" title="Live device-therapy session">LIVE</span>
    </div>
    <div class="sun-session-meta">${escapeHTML(distLine)}${distLine && areaLine ? ' · ' : ''}${escapeHTML(areaLine)}${areaLine ? ' · ' : ''}${escapeHTML(eyesLine)}</div>
    <div class="sun-session-active-controls" data-light-devices-action="suppress">
      <div class="sun-session-ctl-primary">
        <button type="button" class="sun-session-ctl sun-session-ctl-stop" data-light-devices-action="stop-device-session" data-light-device-session-id="${escapeAttr(sess.id)}" title="Stop and save the session"><span aria-hidden="true">⏹</span> <span class="sun-session-ctl-label">Stop &amp; save</span></button>
      </div>
    </div>
  </section>`;
}

let _devActiveTicker = null;
function _tickActiveDeviceSession() {
  const sess = getActiveDeviceSession();
  if (!sess) {
    if (_devActiveTicker) { clearInterval(_devActiveTicker); _devActiveTicker = null; }
    return;
  }
  if (typeof document === 'undefined') return;
  const elapsedText = formatDeviceElapsedMs(Date.now() - sess.startedAt);
  document.querySelectorAll(`[data-live-elapsed-for="${CSS.escape(sess.id)}"]`).forEach(el => {
    if (el.textContent !== elapsedText) el.textContent = elapsedText;
  });
}

export function ensureActiveDeviceTicker() {
  if (_devActiveTicker) return;
  if (!getActiveDeviceSession()) return;
  _tickActiveDeviceSession();
  _devActiveTicker = setInterval(_tickActiveDeviceSession, 1000);
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
    catalog = await loadLightDevicesCatalog();
  } catch { /* offline / 404 — page still renders without affiliate row */ }
  let typesMeta = {};
  try {
    const presetData = await loadLightDevicePresets();
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
      <button type="button" class="import-btn import-btn-secondary" data-light-devices-action="add-device">+ Add device</button>
    </div>`;

  if (devices.length === 0) {
    html += `<p class="light-section-hint">Therapy panels, SAD lamps, dawn simulators — log them here and your sessions feed the same channels as outdoor sun.</p>
    </div>`;
    return html;
  }

  html += `<div class="light-devices-grid">`;
  for (const dev of devices) {
    const slug = dev.catalogSlug || dev.presetId || null;
    const affRow = slug ? renderLightDeviceAffiliateRowRuntime(catalog, slug) : '';
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
      : `${stats.count} session${stats.count !== 1 ? 's' : ''} · last ${relativeDeviceTimeShort(stats.lastAt)}`;
    html += `<div class="light-device-card light-device-card-type-${escapeAttr(dev.type)}" data-id="${escapeAttr(dev.id)}">
      <div class="light-device-head">
        <span class="light-device-icon" aria-hidden="true">${typeIcon}</span>
        <div class="light-device-titleblock">
          <span class="light-device-name">${escapeHTML(dev.brand)} ${escapeHTML(dev.model)}</span>
          <span class="light-device-typeline">${escapeHTML(typeLabel)}${wavelengthStr ? ` · ${escapeHTML(wavelengthStr)}` : ''}${intensityStr ? ` · ${escapeHTML(intensityStr)}` : ''}</span>
        </div>
        <button type="button" class="light-device-delete" data-light-devices-action="delete-device" data-light-device-id="${escapeAttr(dev.id)}" title="Remove device" aria-label="Remove device">×</button>
      </div>
      ${channelChips ? `<div class="light-device-feeds">
        <span class="light-device-feeds-label">Feeds</span>
        ${channelChips}
      </div>` : ''}
      <div class="light-device-stats">${escapeHTML(statsLine)}</div>
      <div class="light-device-actions">
        <button type="button" class="import-btn import-btn-secondary light-device-log" data-light-devices-action="log-device-session" data-light-device-id="${escapeAttr(dev.id)}">▶ Log session</button>
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
configureLightDeviceSetup({
  loadPresets: loadLightDevicePresets,
  addDeviceFromPreset,
  addCustomDevice,
  wireModal: _wireModal,
  refreshLightView: () => {
    refreshLightDevicesView();
  },
});

// ─── UI: log device session modal ──────────────────────────────────────

export async function openDeviceSessionDialog(deviceId) {
  return openDeviceSessionDialogModal(deviceId, {
    hydrateDevicesFromPresets,
    getDevices,
    logDeviceSession,
    getActiveDeviceSession,
    startDeviceSession,
    ensureActiveDeviceTicker,
    validateModeCoupling,
    renderBodySilhouette,
    bindBodySilhouette,
    navigate: navigateLightDevicesRoute,
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
  overlay.className = 'modal-overlay';
  const closeDialog = () => removeModalOverlay(overlay);
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
      <button class="modal-close" data-device-picker-close aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <div class="light-device-picker-list">${rows}</div>
      <div class="modal-actions" style="margin-top:14px">
        <button class="import-btn import-btn-secondary" data-device-picker-close>Cancel</button>
      </div>
    </div>
  </div>`;
  _wireModal(overlay, closeDialog);
  overlay.querySelectorAll('[data-device-picker-close]').forEach(btn => {
    btn.addEventListener('click', closeDialog);
  });
  for (const btn of overlay.querySelectorAll('.light-device-picker-row')) {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-device-id');
      closeDialog();
      openDeviceSessionDialog(id);
    });
  }
}

export async function deleteDeviceSessionWithConfirm(id) {
  if (!await showConfirmDialog("Delete this device session? This can't be undone.")) return;
  await deleteDeviceSession(id);
  refreshLightDevicesView();
}

// ─── Window export ─────────────────────────────────────────────────────

export async function deleteLightDeviceAndRefresh(id) {
  await deleteDevice(id);
  refreshLightDevicesView();
}

export async function stopDeviceSessionAndNotify(id) {
  const sess = await stopDeviceSession(id);
  if (sess) {
    const device = getDevices().find(d => d.id === sess.deviceId);
    const dur = Math.round(sess.durationMin || 0);
    showNotification(`Saved · ${dur} min ${device ? device.brand + ' ' + device.model : 'device'} session.`);
  }
  refreshLightDevicesView();
}

publishLightDevicesWindowBindings({
  loadLightDevicePresets,
  getDevices,
  getDeviceSessions,
  addDeviceFromPreset,
  hydrateDevicesFromPresets,
  deleteLightDevice: deleteLightDeviceAndRefresh,
  logDeviceSession,
  startDeviceSession,
  stopDeviceSession,
  updateDeviceSession,
  editDeviceSessionDuration,
  editDeviceSessionMode,
  getActiveDeviceSession,
  renderActiveDeviceSessionCard,
  ensureActiveDeviceTicker,
  stopDeviceSessionAndNotify,
  deleteDeviceSession: deleteDeviceSessionWithConfirm,
  rollingDeviceTotals,
  renderDevicesSection,
  openDeviceSessionDetail,
  openAddDeviceDialog,
  openCustomDeviceDialog,
  addCustomDevice,
  openDeviceSessionDialog,
  quickLogDeviceSession,
});
