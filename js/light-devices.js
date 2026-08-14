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

import { bindDetachedModalSyncRefresh, escapeHTML, escapeAttr, showNotification, showConfirmDialog } from './utils.js';
import { state } from './state.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import { CHANNEL_DISPLAY } from './sun.js';
import { BODY_REGIONS, bindBodySilhouette, renderBodySilhouette } from './sun-body-silhouette.js';
import { validateModeCoupling } from './sun-spectrum.js';
import { deviceEmitsUV } from './light-device-session-engine.js';
import { reopenSunSetup } from './sun-defaults.js';
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
  rehydrateStaleDeviceSessions,
  rollingDeviceTotals,
  startDeviceSession,
  stopDeviceSession,
  updateDeviceSession,
} from './light-devices-store.js';
import { configureLightDevicesActions, installLightDevicesActionDelegates } from './light-devices-actions.js';
import {
  configureLightDeviceModalLoader,
  openAddDeviceDialog,
  openCustomDeviceDialog,
  openDeviceSessionDialog,
} from './light-device-modal-loader.js';
import {
  getLightDeviceChannelDisplay,
  getLightDeviceChannelHelpers,
  loadLightDevicesCatalog,
  navigateLightDevicesRoute,
  openLightDeviceChannel,
  promptLightDeviceSessionDuration,
  refreshLightDevicesView,
  renderLightDeviceAffiliateRowRuntime,
} from './light-devices-runtime.js';
import {
  deviceBasisLabel as _deviceBasisLabel,
  formatWavelengthSummary as _formatWavelengthSummary,
  localDeviceSessionStamp as _localDeviceSessionStamp,
  relativeTimeShort as _relativeTimeShort,
  renderDeviceChannelChips,
  safeHttpUrl as _safeHttpUrl,
} from './light-device-view-formatters.js';

/** @type {{ renderDeviceSessionAIDetail: (sess: any) => string }} */
const lightDevicesDeps = {
  renderDeviceSessionAIDetail: () => '',
};
const _renderDeviceChannelChips = channelKeys => renderDeviceChannelChips(channelKeys, CHANNEL_DISPLAY);

export function configureLightDevices(deps = {}) {
  Object.assign(lightDevicesDeps, deps);
}

if (typeof document !== 'undefined') installLightDevicesActionDelegates();

export { installLightDevicesActionDelegates };
export { openAddDeviceDialog, openCustomDeviceDialog, openDeviceSessionDialog };
export {
  addCustomDevice,
  deleteDevice,
  deleteDeviceSession,
  getActiveDeviceSession,
  getDeviceSessions,
  getDevices,
  logDeviceSession,
  rehydrateStaleDeviceSessions,
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

configureLightDeviceModalLoader({
  setup: {
    loadPresets: loadLightDevicePresets,
    addDeviceFromPreset,
    addCustomDevice,
    wireModal: _wireModal,
    refreshLightView: () => refreshLightDevicesView(),
  },
  session: {
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
    openLightSetup: reopenSunSetup,
  },
});

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
  const device = getDevices().find(d => d.id === sess.deviceId) || sess.deviceSnapshot || null;
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
  overlay.querySelector('#dev-edit-mode-save')?.addEventListener('click', async () => {
    const next = _select(overlay, '#dev-edit-mode')?.value || '';
    closeDialog();
    if (next === sess.mode) return;
    const updated = await updateDeviceSession(id, { mode: next });
    if (!updated) {
      showNotification('The mode could not be updated.', 'error');
      return;
    }
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
  const current = Math.max(0, Math.round((sess.durationMin || 0) * 10) / 10);
  const raw = await promptLightDeviceSessionDuration(current);
  if (raw === null || raw === undefined) return;
  const parsed = parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 600) {
    showNotification('Enter a duration between 0 and 600 minutes.', 'error');
    return;
  }
  const next = Math.round(parsed * 10) / 10;
  if (next === current) return;
  const updated = await updateDeviceSession(id, { durationMin: next });
  if (!updated) {
    showNotification('The duration could not be updated.', 'error');
    return;
  }
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
  const liveDevice = getDevices().find(d => d.id === sess.deviceId) || null;
  const device = liveDevice || sess.deviceSnapshot || null;
  const { formatChannelUnit } = getLightDeviceChannelHelpers();
  const channelDisplay = getLightDeviceChannelDisplay(CHANNEL_DISPLAY);
  const channelOrder = ['vitamin_d', 'circadian', 'nir_solar', 'no_cv', 'pomc', 'violet_eye', 'pbm_red', 'pbm_nir'];

  const stamp = _localDeviceSessionStamp(sess.startedAt);
  const dur = sess.durationMin ? `${Math.round(sess.durationMin * 10) / 10} min` : '—';
  const devName = device ? `${device.brand} ${device.model}` : 'Device details unavailable';
  const typeLabel = device?.type || '—';
  const peakStr = device?.peakWavelengths?.length
    ? device.peakWavelengths.map(w => `${w} nm`).join(', ') : '—';
  const irradianceStr = device?.mwPerCm2At15cm
    ? `${device.mwPerCm2At15cm} mW/cm² @ ${device?.recommendedDistanceCm || 15} cm`
    : (device?.lux ? `${device.lux.toLocaleString()} photopic lux`
      : (device?.melanopicEdiLux ? `${device.melanopicEdiLux.toLocaleString()} lx melanopic EDI` : '—'));
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
  const emitsUV = sess.safety?.hasUV ?? deviceEmitsUV(device, sess.mode);
  const isAmbientEyeDevice = ['sad', 'dawn-sim', 'full-spectrum'].includes(device?.type) && !emitsUV;
  const eyesLabel = emitsUV
    ? (sess.eyesProtected ? 'UV-rated eye protection logged' : '⚠ UV emitted without rated eye protection')
    : isAmbientEyeDevice
      ? (sess.eyesProtected ? 'Eyes shielded' : 'Eyes open to ambient light')
      : (sess.eyesProtected ? 'Eye shielding logged' : 'No eye shielding logged; no eye benefit credited');
  let deviceSafetyHtml = '';
  if (sess.safety?.hasUV) {
    const uvModeled = (sess.safety.uvDoseStatus === 'modeled' || sess.safety.uvDoseStatus == null)
      && Number.isFinite(sess.safety.erythemalSED);
    const uvSummary = uvModeled
      ? `Local erythemal dose: ${Number(sess.safety.erythemalSED).toFixed(2)} SED${Number.isFinite(sess.safety.conservativeBaseMedFraction) ? ` · ${Math.round(sess.safety.conservativeBaseMedFraction * 100)}% of a conservative Type I base MED` : ''}${Number(sess.safety.ocularActinicUV) > 0 ? ` · ocular actinic UV: ${Number(sess.safety.ocularActinicUV).toFixed(1)} J/m²` : ''}${Number(sess.safety.ocularUvaJPerM2) > 0 ? ` · ocular UVA: ${Number(sess.safety.ocularUvaJPerM2).toFixed(1)} J/m²` : ''}. This is a model, not a personal threshold.`
      : 'UV was emitted, but the spectral output, band split, or distance basis is insufficient for a defensible number. Burn dose, ocular dose, and vitamin-D output are not calculated.';
    deviceSafetyHtml = `<div class="light-device-safety ${sess.safety.unsafeEyeExposure ? 'is-over' : ''}">
      <strong>${sess.safety.unsafeEyeExposure ? '⚠ UV eye protection was not recorded' : (uvModeled ? 'UV dose model' : 'UV dose unavailable')}</strong>
      <span>${escapeHTML(uvSummary)} Closed eyelids are not UV protection.</span>
    </div>`;
  }
  const modelWarnings = Array.isArray(sess.calculation?.warnings) ? sess.calculation.warnings : [];
  const modelWarningsHtml = modelWarnings.length
    ? `<div class="light-device-safety"><strong>Estimate limits</strong><span>${modelWarnings.map(warning => escapeHTML(warning)).join(' ')}</span></div>`
    : '';
  const hasPhotopic = Number.isFinite(sess.metrics?.photopicLux);
  const hasMelanopic = Number.isFinite(sess.metrics?.melanopicEdiLux);
  const lightMetricHtml = hasPhotopic || hasMelanopic ? `<div class="light-device-safety">
    <strong>Eye-level light metric</strong>
    <span>${hasPhotopic ? `${Math.round(sess.metrics.photopicLux).toLocaleString()} photopic lux` : ''}${hasPhotopic && hasMelanopic ? ' · ' : ''}${hasMelanopic ? `${Math.round(sess.metrics.melanopicEdiLux).toLocaleString()} lx melanopic EDI${sess.metrics.melanopicStatus === 'device-der' ? ' estimated from the device DER' : ''}` : 'Melanopic EDI unavailable without a measured spectrum or declared melanopic DER'}.</span>
  </div>` : '';
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
      const hasSignal = Number.isFinite(v) && v > 0;
      const sessionFitz = sess.fitzpatrick || state.importedData?.sunDefaults?.fitzpatrick || 'III';
      const unitText = formatChannelUnit(k, v, sess.durationMin || 0, sessionFitz, null, null, false, _sessBodyFrac);
      const valueText = unitText || (hasSignal ? 'Device signal logged' : 'Not modeled');
      const sourceText = hasSignal ? 'Device' : 'No signal';
      const ariaLabel = `${meta.label || k} — ${valueText}, ${sourceText}. Open channel details.`;
      return `<div class="sun-detail-channel-row sun-detail-channel-row-clickable sun-chip-tier-${hasSignal ? 2 : 0}" data-channel="${escapeAttr(k)}" role="button" tabindex="0" aria-label="${escapeAttr(ariaLabel)}">
        <span class="sun-detail-channel-icon" aria-hidden="true">${meta.icon || '·'}</span>
        <span class="sun-detail-channel-label">${escapeHTML(meta.label || k)}</span>
        <span class="sun-detail-channel-value">${escapeHTML(valueText)}</span>
        <span class="sun-detail-channel-tier">${escapeHTML(sourceText)}</span>
        <span class="sun-detail-channel-chevron" aria-hidden="true">›</span>
      </div>`;
    }).join('') : '';
  const aiDetailHtml = typeof lightDevicesDeps.renderDeviceSessionAIDetail === 'function'
    ? lightDevicesDeps.renderDeviceSessionAIDetail(sess)
    : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const closeDialog = () => removeModalOverlay(overlay);
  overlay.innerHTML = `<div class="modal sun-detail-modal" data-session-kind="device" role="dialog" aria-label="Device session details">
    <div class="modal-header">
      <h3>Device session — ${escapeHTML(stamp.date)}</h3>
      <button class="modal-close" data-device-session-detail-close aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <div class="sun-detail-grid">
        <div title="Local session start time"><span>When</span><strong>${escapeHTML(stamp.time || '—')}</strong></div>
        <div title="Total session duration. Edit via the action row below if the timer ran past the actual session."><span>Duration</span><strong>${escapeHTML(dur)}</strong></div>
        <div title="Recorded source"><span>Source</span><strong>${escapeHTML(devName)}</strong></div>
      </div>

      ${deviceSafetyHtml}
      ${modelWarningsHtml}

      <div class="sun-detail-section">
        <div class="sun-detail-section-label">Exposure setup</div>
        <div class="sun-detail-setup-grid">
          <div><span>Device</span><strong>${escapeHTML(devName)}${typeLabel !== '—' ? ` · ${escapeHTML(typeLabel)}` : ''}</strong></div>
          ${modeLabel ? `<div><span>Mode</span><strong>${escapeHTML(modeLabel)}</strong></div>` : ''}
          <div><span>Distance</span><strong>${escapeHTML(distanceStr)}</strong></div>
          <div><span>Body area</span><strong>${escapeHTML(areaLabel)}</strong></div>
          <div><span>Eyes</span><strong>${escapeHTML(eyesLabel)}</strong></div>
        </div>
      </div>

      ${aiDetailHtml ? `<div class="sun-detail-section">
        <div class="sun-detail-section-label">Session interpretation</div>
        ${aiDetailHtml}
      </div>` : ''}

      <details class="sun-detail-disclosure">
        <summary>Modeled light signals</summary>
        <p>Estimated stimulation from the recorded device setup. These are not universal dose targets.</p>
        ${lightMetricHtml}
        ${channelRows ? `<div class="sun-detail-channels">${channelRows}</div>` : '<p class="sun-detail-empty">No modeled light signals are available for this session.</p>'}
      </details>

      <details class="sun-detail-disclosure">
        <summary>Device and model inputs</summary>
        <p>${liveDevice ? 'Technical source values used to calculate the session.' : 'Saved device details retained with this historical session.'}</p>
        ${device ? `<div class="sun-detail-atm">
          <div title="Peak emission wavelengths declared by the device"><span>Peaks</span><strong>${escapeHTML(peakStr)}</strong></div>
          <div title="Stored output at the device reference distance"><span>Reference output</span><strong>${escapeHTML(irradianceStr)}</strong></div>
          <div><span>Output basis</span><strong>${escapeHTML(_deviceBasisLabel(device.irradianceBasis))}</strong></div>
          <div><span>Recorded distance</span><strong>${escapeHTML(distanceStr)}</strong></div>
          ${modeLabel ? `<div><span>Mode</span><strong>${escapeHTML(modeLabel)}</strong></div>` : ''}
        </div>${_safeHttpUrl(device.specSourceUrl) ? `<p><a href="${escapeAttr(_safeHttpUrl(device.specSourceUrl))}" target="_blank" rel="noopener noreferrer">Open saved specification source ↗</a></p>` : ''}` : '<p class="sun-detail-empty">The device specification is unavailable.</p>'}
      </details>

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
      editDeviceSessionDuration(sess.id);
      return;
    }
    if (target.closest('#device-detail-edit-mode')) {
      closeDialog();
      editDeviceSessionMode(sess.id);
      return;
    }
    if (target.closest('#device-detail-delete')) {
      closeDialog();
      deleteDeviceSessionWithConfirm(sess.id);
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

function _formatElapsedMs(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function renderActiveDeviceSessionCard() {
  const sess = getActiveDeviceSession();
  if (!sess) return '';
  const device = getDevices().find(d => d.id === sess.deviceId) || sess.deviceSnapshot || null;
  const devName = device ? `${device.brand} ${device.model}` : 'Device details unavailable';
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
  const emitsUV = deviceEmitsUV(device, sess.mode);
  const isAmbientEyeDevice = ['sad', 'dawn-sim', 'full-spectrum'].includes(device?.type) && !emitsUV;
  const eyesLine = emitsUV
    ? (sess.eyesProtected ? 'UV goggles confirmed · follow the device timer' : 'UV eye protection missing')
    : isAmbientEyeDevice
      ? (sess.eyesProtected ? 'eyes shielded' : 'eyes open to ambient light')
      : (sess.eyesProtected ? 'eye shielding logged' : 'eyes outside the beam');
  const elapsedText = _formatElapsedMs(Date.now() - sess.startedAt);
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
  const elapsedText = _formatElapsedMs(Date.now() - sess.startedAt);
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
    html += `<p class="light-section-hint">Add therapy panels, SAD lamps, or dawn simulators to see the light signals their measured or stated output can support. Device light stays distinct from full-spectrum sunlight.</p>
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
    const estimatedOutput = ['curated-estimate', 'unknown'].includes(dev.irradianceBasis || 'unknown');
    const intensityStr = dev.mwPerCm2At15cm
      ? `${estimatedOutput ? '~' : ''}${dev.mwPerCm2At15cm} mW/cm² @ ${dev.recommendedDistanceCm || 15} cm`
      : (dev.lux ? `${dev.lux} photopic lux`
        : (dev.melanopicEdiLux ? `${dev.melanopicEdiLux} lx M-EDI` : ''));
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
        <button type="button" class="light-device-delete" data-light-devices-action="delete-device" data-light-device-id="${escapeAttr(dev.id)}" title="Remove device" aria-label="Remove device">×</button>
      </div>
      ${channelChips ? `<div class="light-device-feeds">
        <span class="light-device-feeds-label">Signals</span>
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
  const ordered = devices.slice().sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
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

// ─── UI wrappers ───────────────────────────────────────────────────────

export async function deleteLightDeviceAndRefresh(id) {
  const device = getDevices().find(candidate => candidate.id === id);
  if (!device) return;
  const active = getActiveDeviceSession();
  if (active?.deviceId === id) {
    showNotification('Stop and save the active session before removing this device.', 'error');
    return;
  }
  const sessionCount = getDeviceSessions().filter(session => session.deviceId === id).length;
  const historyNote = sessionCount
    ? ` ${sessionCount} saved session${sessionCount === 1 ? '' : 's'} will keep a copy of these device details.`
    : '';
  if (!await showConfirmDialog(`Remove ${device.brand} ${device.model}?${historyNote}`)) return;
  const deleted = await deleteDevice(id);
  if (!deleted) {
    showNotification('The device could not be removed.', 'error');
    return;
  }
  showNotification(sessionCount ? 'Device removed. Saved session history was retained.' : 'Device removed.');
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

configureLightDevicesActions({
  stopDeviceSessionAndNotify,
  openAddDeviceDialog,
  deleteLightDevice: deleteLightDeviceAndRefresh,
  openDeviceSessionDialog,
});
