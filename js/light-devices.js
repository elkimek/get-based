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
import { bindDetachedModalSyncRefresh, escapeHTML, escapeAttr, formatDate, showNotification, showConfirmDialog } from './utils.js';
import { saveImportedData } from './data.js';
import { deleteImportedArrayItem } from './data-merge.js';
import { CHANNEL_DISPLAY } from './sun.js';
import { BODY_REGIONS } from './sun-body-silhouette.js';
import {
  DEVICE_TYPE_CHANNELS,
  computeDeviceSessionDoses,
  resolveDeviceMode,
} from './light-device-session-engine.js';
import { openDeviceSessionDialog as openDeviceSessionDialogModal } from './light-device-session-modal.js';
import {
  configureLightDeviceSetup,
  openAddDeviceDialog,
  openCustomDeviceDialog,
} from './light-device-setup-modal.js';

export { openAddDeviceDialog, openCustomDeviceDialog };

// Preset library is loaded lazily — keeps the JSON out of the boot path.
let _PRESETS = null;
let _PRESET_TYPES = null;

// Standard modal-mount pattern shared by every modal opener in this file:
// wire backdrop-click close, append, then trap focus. The window.* refs
// come from sun.js so we can't import them at top-level (back-edge);
// guarding each call with typeof keeps this safe to invoke if the user
// hits a device modal before sun.js finished its first load tick.
function _wireModal(overlay) {
  if (typeof window === 'undefined') { document.body.appendChild(overlay); return; }
  if (window._wireBackdropClose) try { window._wireBackdropClose(overlay); } catch (_) {}
  document.body.appendChild(overlay);
  if (window.trapModalFocus) try { window.trapModalFocus(overlay); } catch (_) {}
}

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
    // Round 7: copy the LED-group schema through so the session-log
    // dialog can render the mode picker. Devices added pre-Round-7 are
    // healed by hydrateDevicesFromPresets at boot.
    channelGroups: Array.isArray(preset.channelGroups) ? preset.channelGroups : null,
    modes: Array.isArray(preset.modes) ? preset.modes : null,
    coupling: Array.isArray(preset.coupling) ? preset.coupling : null,
    catalogSlug: preset.catalogSlug || null,
    notes: overrides.notes || '',
    addedAt: Date.now(),
  };
  getDevices().push(device);
  await saveImportedData();
  return device;
}

// Backfill channelGroups / modes / coupling from the preset library onto
// user devices that pre-date Round 7. Idempotent — devices already
// carrying the field skip. Custom (non-preset) devices skip too. Run
// once at boot so existing localStorage devices light up the mode picker
// without requiring re-add.
export async function hydrateDevicesFromPresets() {
  const { presets } = await loadPresets();
  if (!Array.isArray(presets) || presets.length === 0) return false;
  if (!state.importedData) return false;
  const devices = Array.isArray(state.importedData.lightDevices) ? state.importedData.lightDevices : [];
  let dirty = false;
  for (const dev of devices) {
    if (!dev || !dev.presetId) continue;
    const preset = presets.find(p => p.id === dev.presetId);
    if (!preset) continue;
    if (!Array.isArray(dev.channelGroups) && Array.isArray(preset.channelGroups)) {
      dev.channelGroups = preset.channelGroups;
      dirty = true;
    }
    if (!Array.isArray(dev.modes) && Array.isArray(preset.modes)) {
      dev.modes = preset.modes;
      dirty = true;
    }
    if (!Array.isArray(dev.coupling) && Array.isArray(preset.coupling)) {
      dev.coupling = preset.coupling;
      dirty = true;
    }
  }
  if (dirty) await saveImportedData();
  return dirty;
}

export async function deleteDevice(id) {
  const devs = getDevices();
  const idx = devs.findIndex(d => d.id === id);
  if (idx < 0) return false;
  deleteImportedArrayItem(state.importedData, 'lightDevices', idx);
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
export async function logDeviceSession({ deviceId, durationMin, distanceCm = 15, bodyArea = 'torso', bodyAreas = null, eyesProtected = true, notes = '', mode = null }) {
  const device = getDevices().find(d => d.id === deviceId);
  if (!device) return null;
  // Cryptographic randomness for session ids — Math.random() is enough
  // for collision avoidance but CodeQL flags it as a security smell on
  // any id-shaped string, and crypto.getRandomValues is available
  // everywhere this code runs.
  const _rb = new Uint8Array(3); crypto.getRandomValues(_rb);
  const _suffix = Array.from(_rb, b => b.toString(16).padStart(2, '0')).join('').slice(0, 4);
  const sessionId = `devsess_${Date.now().toString(36)}_${_suffix}`;
  const seconds = durationMin * 60;
  const { doses, mode: resolvedMode } = computeDeviceSessionDoses({
    device,
    durationMin,
    distanceCm,
    bodyArea,
    bodyAreas,
    eyesProtected,
    mode,
  });

  const session = {
    id: sessionId,
    deviceId,
    startedAt: Date.now() - seconds * 1000,
    endedAt: Date.now(),
    durationMin,
    distanceCm,
    bodyArea,
    // bodyAreas[] is the new precise-region field; bodyArea remains as
    // a denormalized "broad zone" hint for legacy readers + listing rows.
    bodyAreas: Array.isArray(bodyAreas) ? bodyAreas.slice() : null,
    eyesProtected,
    // mode is the named touchscreen-preset id for devices with `modes`
    // (Maxi UVB, Trinity, etc.); null for single-mode devices. Persisted
    // so dose recomputation on edit reuses the same mode. Legacy
    // sessions logged before Round 7 read back as null and route through
    // the device's default mode in effectiveDeviceForMode.
    mode: resolvedMode,
    doses,
    notes,
  };
  getDeviceSessions().push(session);
  // Remember the user's chosen params on the device record so the
  // next session log dialog opens with their actual ritual prefilled
  // (most users do the same duration / distance / body area each
  // session — re-typing every time is friction). Notes intentionally
  // excluded — they're session-specific, shouldn't leak forward.
  device.lastSession = { durationMin, distanceCm, bodyArea, bodyAreas: session.bodyAreas, eyesProtected, mode: resolvedMode };
  device.updatedAt = Date.now();
  await saveImportedData();
  if (window.maybeAnalyzeDeviceSessionAfterFinish) {
    try { window.maybeAnalyzeDeviceSessionAfterFinish(session); } catch (_) {}
  }
  return session;
}

// ─── Live device-session timer ─────────────────────────────────────────
//
// Mirrors the sun.js start/stop pattern: startDeviceSession() stages an
// active record with a start timestamp + selected regions; the dashboard
// + /light surfaces show a live elapsed counter; stopDeviceSession()
// finalizes it through logDeviceSession's dose math so the saved record
// is identical in shape to an after-the-fact log.

export function getActiveDeviceSession() {
  return getDeviceSessions().find(s => !s.endedAt) || null;
}

export async function startDeviceSession({ deviceId, distanceCm = 15, bodyAreas = null, bodyArea = 'torso', eyesProtected = true, mode = null } = {}) {
  // Reject a second active timer — one session at a time keeps the
  // active-card UI unambiguous and matches sun-session semantics.
  if (getActiveDeviceSession()) return null;
  const device = getDevices().find(d => d.id === deviceId);
  if (!device) return null;
  const resolvedMode = resolveDeviceMode(device, mode);
  const id = `devsess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const sess = {
    id,
    deviceId,
    startedAt: Date.now(),
    endedAt: null,
    durationMin: 0,
    distanceCm,
    bodyArea,
    bodyAreas: Array.isArray(bodyAreas) ? bodyAreas.slice() : null,
    eyesProtected,
    mode: resolvedMode,
    doses: {},
    notes: '',
  };
  getDeviceSessions().push(sess);
  await saveImportedData();
  return id;
}

// Stop the active device session. Computes doses through the same
// `logDeviceSession` math by replaying the recorded params, then
// finalizes endedAt + durationMin on the existing record.
export async function stopDeviceSession(id) {
  const sessions = getDeviceSessions();
  const sess = id ? sessions.find(s => s.id === id) : getActiveDeviceSession();
  if (!sess || sess.endedAt) return null;
  const endedAt = Date.now();
  const durationMin = Math.max(0, (endedAt - sess.startedAt) / 60000);
  // Recompute doses through the shared engine without inserting a new
  // record — we mutate the existing active session in-place.
  const device = getDevices().find(d => d.id === sess.deviceId);
  if (device && durationMin > 0) {
    const { doses } = computeDeviceSessionDoses({
      device,
      durationMin,
      distanceCm: sess.distanceCm,
      bodyArea: sess.bodyArea,
      bodyAreas: sess.bodyAreas,
      eyesProtected: sess.eyesProtected,
      mode: sess.mode,
    });
    sess.doses = doses;
  }
  sess.endedAt = endedAt;
  sess.durationMin = durationMin;
  if (device) {
    device.lastSession = {
      durationMin, distanceCm: sess.distanceCm,
      bodyArea: sess.bodyArea, bodyAreas: sess.bodyAreas,
      eyesProtected: sess.eyesProtected,
      mode: sess.mode,
    };
    device.updatedAt = Date.now();
  }
  await saveImportedData();
  if (window.maybeAnalyzeDeviceSessionAfterFinish) {
    try { window.maybeAnalyzeDeviceSessionAfterFinish(sess); } catch (_) {}
  }
  return sess;
}

// Patch a finished session in place — accepts any subset of editable
// fields. Recomputes doses if duration / distance / regions / eyes
// changed, since those all feed the dose math. Mirrors sun.js
// updateSession but without the active-session branch (device sessions
// don't have the sun-style mid-session controls — once stopped, they
// stay stopped). Bumps updatedAt so sync sees the change.
export async function updateDeviceSession(id, patch = {}) {
  const sessions = getDeviceSessions();
  const sess = sessions.find(s => s.id === id);
  if (!sess) return null;
  const editable = ['durationMin', 'distanceCm', 'bodyArea', 'bodyAreas', 'eyesProtected', 'notes', 'mode'];
  let needsRecompute = false;
  for (const k of editable) {
    if (k in patch && patch[k] !== sess[k]) {
      // Array deep-compare for bodyAreas — patch comes in as a fresh
      // array; we want to detect content change, not just identity.
      if (k === 'bodyAreas') {
        const before = JSON.stringify((sess.bodyAreas || []).slice().sort());
        const after = JSON.stringify((patch.bodyAreas || []).slice().sort());
        if (before === after) continue;
      }
      // mode patches go through coupling validation; bad input falls
      // back to the device's default mode rather than persisting.
      if (k === 'mode') {
        const device = getDevices().find(d => d.id === sess.deviceId);
        if (device && Array.isArray(device.modes) && device.modes.length > 0) {
          const next = resolveDeviceMode(device, patch.mode);
          if (next === sess.mode) continue;
          sess.mode = next;
          needsRecompute = true;
          continue;
        }
      }
      sess[k] = patch[k];
      if (['durationMin', 'distanceCm', 'bodyArea', 'bodyAreas', 'eyesProtected'].includes(k)) needsRecompute = true;
    }
  }
  // Re-derive endedAt + dose if duration changed (otherwise the saved
  // record keeps its original end-stamp + doses, which would drift from
  // the new duration).
  if (needsRecompute && sess.endedAt && Number.isFinite(sess.durationMin)) {
    sess.endedAt = sess.startedAt + sess.durationMin * 60 * 1000;
    const device = getDevices().find(d => d.id === sess.deviceId);
    if (device) {
      const { doses, mode: resolvedMode } = computeDeviceSessionDoses({
        device,
        durationMin: sess.durationMin,
        distanceCm: sess.distanceCm,
        bodyArea: sess.bodyArea,
        bodyAreas: sess.bodyAreas,
        eyesProtected: sess.eyesProtected,
        mode: sess.mode,
      });
      sess.mode = resolvedMode;
      sess.doses = doses;
    }
  }
  sess.updatedAt = Date.now();
  await saveImportedData();
  if (window.maybeAnalyzeDeviceSessionAfterFinish) {
    try { window.maybeAnalyzeDeviceSessionAfterFinish(sess); } catch (_) {}
  }
  return sess;
}

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
  const validateMode = window.validateModeCoupling || (() => ({ ok: true }));
  const validModes = device.modes.filter(m => validateMode(device, m.id).ok);
  if (validModes.length < 2) {
    showNotification('Only one mode is available for this device.', 'info');
    return;
  }
  const currentMode = sess.mode || (device.modes.find(m => m.default) || device.modes[0])?.id;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-label="Edit session mode">
    <div class="modal-header">
      <h3>Edit mode — ${escapeHTML(device.brand)} ${escapeHTML(device.model)}</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <p class="modal-body-hint">Pick the LED-group mode that actually fired during this session. Doses will be recomputed on save.</p>
      <label class="ctx-label">Mode
        <select id="dev-edit-mode" class="ctx-select">
          ${validModes.map(m => `<option value="${escapeAttr(m.id)}"${m.id === currentMode ? ' selected' : ''}>${escapeHTML(m.label || m.id)}</option>`).join('')}
        </select>
      </label>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="import-btn import-btn-primary" id="dev-edit-mode-save">Save</button>
      </div>
    </div>
  </div>`;
  _wireModal(overlay);
  overlay.querySelector('#dev-edit-mode-save').addEventListener('click', async () => {
    const next = overlay.querySelector('#dev-edit-mode').value;
    overlay.remove();
    if (next === sess.mode) return;
    await updateDeviceSession(id, { mode: next });
    showNotification('Mode updated. Doses recomputed.', 'success');
    if (window.navigate && state.currentView === 'light') window.navigate('light');
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
  const raw = await window.showPromptDialog?.('New duration (in minutes)', {
    defaultValue: String(current),
    okLabel: 'Save',
    placeholder: 'e.g. 12',
  });
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
  if (window.navigate && state.currentView === 'light') window.navigate('light');
}

export async function deleteDeviceSession(id) {
  const sessions = getDeviceSessions();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx < 0) return false;
  deleteImportedArrayItem(state.importedData, 'deviceSessions', idx);
  await saveImportedData();
  return true;
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

export function openDeviceSessionDetail(id) {
  const sessions = getDeviceSessions();
  const sess = sessions.find(s => s.id === id);
  if (!sess) return;
  const device = getDevices().find(d => d.id === sess.deviceId) || null;
  const channelTier = window.channelTier || (() => 0);
  const tierLabel = window.tierLabel || (() => 'none');
  const formatChannelUnit = window.formatChannelUnit || (() => '');
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
    const validateMode = window.validateModeCoupling || (() => ({ ok: true }));
    canEditMode = device.modes.filter(m => validateMode(device, m.id).ok).length > 1;
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
      const meta = (window.CHANNEL_DISPLAY || {})[k] || {};
      const v = sess.doses[k] || 0;
      const t = channelTier(v, k);
      const tlabel = tierLabel(t);
      const unitText = formatChannelUnit(k, v, sess.durationMin || 0, 'III', null, null, false, _sessBodyFrac);
      const ariaLabel = `${meta.label || k} — ${tlabel}${unitText ? ', ' + unitText : ''}. Open channel details.`;
      return `<div class="sun-detail-channel-row sun-detail-channel-row-clickable sun-chip-tier-${t}" data-channel="${escapeAttr(k)}" role="button" tabindex="0" aria-label="${escapeAttr(ariaLabel)}" onclick="this.closest('.modal-overlay')?.remove();window._openChannelOnLightPage && window._openChannelOnLightPage('${escapeAttr(k)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.closest('.modal-overlay')?.remove();window._openChannelOnLightPage && window._openChannelOnLightPage('${escapeAttr(k)}')}">
        <span class="sun-detail-channel-icon" aria-hidden="true">${meta.icon || '·'}</span>
        <span class="sun-detail-channel-label">${escapeHTML(meta.label || k)}</span>
        <span class="sun-detail-channel-value">${escapeHTML(unitText || '')}</span>
        <span class="sun-detail-channel-tier">${escapeHTML(tlabel)}</span>
        <span class="sun-detail-channel-chevron" aria-hidden="true">›</span>
      </div>`;
    }).join('') : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal sun-detail-modal" data-session-kind="device" role="dialog" aria-label="Device session details">
    <div class="modal-header">
      <h3>Device session — ${escapeHTML(start)}</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${window.renderDeviceSessionAIDetail ? window.renderDeviceSessionAIDetail(sess) : ''}
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
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove();window.editDeviceSessionDuration('${escapeAttr(sess.id)}')" title="Override the session duration. Use when you forgot to stop the timer or stopped late.">Edit duration</button>
        ${canEditMode ? `<button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove();window.editDeviceSessionMode && window.editDeviceSessionMode('${escapeAttr(sess.id)}')" title="Change which LED-group mode the session ran in. Doses recompute on save.">Edit mode</button>` : ''}
        <button class="import-btn import-btn-secondary" style="color:var(--red);border-color:var(--red)" onclick="this.closest('.modal-overlay').remove();window.deleteDeviceSession && window.deleteDeviceSession('${escapeAttr(sess.id)}')">Delete session</button>
      </div>
    </div>
  </div>`;
  _wireModal(overlay);
  bindDetachedModalSyncRefresh({
    overlay,
    id,
    opener: openDeviceSessionDetail,
    exists: sessionId => getDeviceSessions().some(s => s.id === sessionId),
  });
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
  const elapsedText = _formatElapsedMs(Date.now() - sess.startedAt);
  return `<section class="sun-session sun-session-active light-session-device" data-id="${escapeAttr(sess.id)}">
    <div class="sun-session-head">
      <span class="light-session-icon" aria-hidden="true">🔴</span>
      <span class="sun-session-date">Active · ${escapeHTML(devName)}</span>
      <span class="sun-session-duration" data-live-elapsed-for="${escapeAttr(sess.id)}" aria-live="off">${escapeHTML(elapsedText)}</span>
      <span class="sun-session-paused" title="Live device-therapy session">LIVE</span>
    </div>
    <div class="sun-session-meta">${escapeHTML(distLine)}${distLine && areaLine ? ' · ' : ''}${escapeHTML(areaLine)}${areaLine ? ' · ' : ''}${escapeHTML(eyesLine)}</div>
    <div class="sun-session-active-controls" onclick="event.stopPropagation()">
      <div class="sun-session-ctl-primary">
        <button class="sun-session-ctl sun-session-ctl-stop" onclick="event.stopPropagation();window.stopDeviceSessionAndNotify('${escapeAttr(sess.id)}')" title="Stop and save the session"><span aria-hidden="true">⏹</span> <span class="sun-session-ctl-label">Stop &amp; save</span></button>
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
        <button class="import-btn import-btn-secondary light-device-log" onclick="window.openDeviceSessionDialog('${escapeAttr(dev.id)}')">▶ Log session</button>
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
  // channelGroups / modes / coupling — only persisted when AI extraction
  // (or manual entry) supplied a structurally complete set. Anything
  // shaped wrong is dropped to null so the consumer (effectiveDeviceForMode)
  // sees a clean schema and falls back to the all-peaks-fire identity path.
  const channelGroups = Array.isArray(spec.channelGroups)
    ? spec.channelGroups.filter(g => g && typeof g.id === 'string' && Array.isArray(g.peaks) && g.peaks.length > 0)
    : null;
  const validGroupIds = channelGroups ? new Set(channelGroups.map(g => g.id)) : null;
  const modes = Array.isArray(spec.modes) && validGroupIds && validGroupIds.size > 0
    ? spec.modes
        .filter(m => m && typeof m.id === 'string' && Array.isArray(m.groups) && m.groups.length > 0)
        .map(m => ({ ...m, groups: m.groups.filter(gid => validGroupIds.has(gid)) }))
        .filter(m => m.groups.length > 0)
    : null;
  const coupling = Array.isArray(spec.coupling) && validGroupIds && validGroupIds.size > 0
    ? spec.coupling.filter(r =>
        r && typeof r.if === 'string' && validGroupIds.has(r.if)
        && Array.isArray(r.requires) && r.requires.every(req => validGroupIds.has(req))
      )
    : null;
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
    channels: DEVICE_TYPE_CHANNELS[spec.type] || ['pbm_red', 'pbm_nir'],
    channelGroups: channelGroups && channelGroups.length > 0 ? channelGroups : null,
    modes: modes && modes.length > 0 ? modes : null,
    coupling: coupling && coupling.length > 0 ? coupling : null,
    catalogSlug: null,
    notes: spec.notes || '',
    addedAt: Date.now(),
  };
  getDevices().push(device);
  await saveImportedData();
  return device;
}

configureLightDeviceSetup({
  loadPresets,
  addDeviceFromPreset,
  addCustomDevice,
  wireModal: _wireModal,
  refreshLightView: () => {
    if (window.navigate && state.currentView === 'light') window.navigate('light');
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
  _wireModal(overlay);
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
    loadLightDevicePresets: loadPresets,
    getDevices,
    getDeviceSessions,
    addDeviceFromPreset,
    hydrateDevicesFromPresets,
    deleteLightDevice: async (id) => {
      await deleteDevice(id);
      if (window.navigate && state.currentView === 'light') window.navigate('light');
    },
    logDeviceSession,
    startDeviceSession,
    stopDeviceSession,
    updateDeviceSession,
    editDeviceSessionDuration,
    editDeviceSessionMode,
    getActiveDeviceSession,
    renderActiveDeviceSessionCard,
    ensureActiveDeviceTicker,
    stopDeviceSessionAndNotify: async (id) => {
      const sess = await stopDeviceSession(id);
      if (sess) {
        const device = getDevices().find(d => d.id === sess.deviceId);
        const dur = Math.round(sess.durationMin || 0);
        showNotification(`Saved · ${dur} min ${device ? device.brand + ' ' + device.model : 'device'} session.`);
      }
      if (window.navigate && state.currentView === 'light') window.navigate('light');
    },
    deleteDeviceSession: async (id) => {
      if (await showConfirmDialog("Delete this device session? This can't be undone.")) {
        await deleteDeviceSession(id);
        if (window.navigate && state.currentView === 'light') window.navigate('light');
      }
    },
    rollingDeviceTotals,
    renderDevicesSection,
    openDeviceSessionDetail,
    openAddDeviceDialog,
    openCustomDeviceDialog,
    addCustomDevice,
    openDeviceSessionDialog,
    quickLogDeviceSession,
  });
}
