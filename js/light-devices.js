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
import { escapeHTML, escapeAttr, showNotification, showConfirmDialog, isDebugMode, formatDate } from './utils.js';
import { saveImportedData } from './data.js';
import { recordTombstone } from './data-merge.js';
import { CHANNEL_DISPLAY, BODY_REGIONS } from './sun.js';
import { callClaudeAPI, hasAIProvider, supportsVision } from './api.js';
import { resizeImage, isValidImageType, formatImageBlock, buildVisionContent } from './image-utils.js';

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
  // Resolve mode for devices with named modes (Maxi UVB, Trinity, etc.).
  // Devices without `modes` skip this — `mode` stays null and behaves
  // as today (synthesize on full peakWavelengths). Coupling rules
  // (e.g. Maxi UVB UV-requires-redNIR) are validated here; an invalid
  // mode falls back to the default to avoid persisting bad state.
  let resolvedMode = mode;
  if (Array.isArray(device.modes) && device.modes.length > 0) {
    const found = device.modes.find(m => m.id === mode);
    const defaultMode = device.modes.find(m => m.default) || device.modes[0];
    resolvedMode = found ? found.id : defaultMode.id;
    if (window.validateModeCoupling) {
      const validation = window.validateModeCoupling(device, resolvedMode);
      if (!validation.ok) resolvedMode = defaultMode.id;
    }
  }

  // Two paths:
  //   bodyAreas[] — precise per-region picker (BODY_REGIONS keys, e.g.
  //                 ['torso-front','arms-front']). Fraction is summed
  //                 from BODY_REGIONS[].fraction so it matches sun
  //                 sessions' accounting exactly.
  //   bodyArea    — legacy broad-zone string (face/torso/arms/legs/
  //                 whole-body/targeted). Pre-2026-05-08 sessions only
  //                 carry this field; we keep the lookup table for
  //                 backwards-compat reads.
  const AREA_FRACTIONS = {
    'face': 0.04, 'arms': 0.10, 'torso': 0.13,
    'legs': 0.30, 'whole-body': 0.92, 'targeted': 0.05,
  };
  let area;
  if (Array.isArray(bodyAreas) && bodyAreas.length > 0) {
    const fracByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.fraction]));
    area = bodyAreas.reduce((s, k) => s + (fracByKey[k] || 0), 0);
    if (area <= 0) area = 0.05;  // belt-and-suspenders for unknown keys
  } else {
    area = AREA_FRACTIONS[bodyArea] ?? 0.10;
  }

  // Distance-square correction. Base range is the device's vendor
  // reference distance (15 cm typical; 50 cm for COB devices like the
  // Firewave Compact whose manufacturer rates output at 20 inches).
  // The schema field `mwPerCm2At15cm` is legacy-named but its value
  // is interpreted as "irradiance at recommendedDistanceCm" — keeping
  // raw distFactor = 1 when the user logs at the default. Inverse-square
  // is a coarse approximation for LED panels (near-field cosine for
  // large sources, focused beams for COBs); accurate enough for
  // relative-trend correlation but not radiometric reference.
  //
  // Cap the EFFECTIVE multiplier at 3× to bound the near-field error.
  // Real LED panels plateau in near-field because the source is
  // extended (cosine falloff dominates over inverse-square inside
  // ~1× panel-width). Without the cap, a 5 cm Joovv session would
  // multiply dose 9× over the 15 cm spec and the user would see
  // "20× recommended dose" warnings that are model artifacts.
  const baseRangeCm = device.recommendedDistanceCm || 15;
  const rawDistFactor = (baseRangeCm / Math.max(distanceCm, 5)) ** 2;
  const distFactor = Math.min(rawDistFactor, 3.0);

  let doses = {};
  const synthesizeDeviceSpectrum = window.synthesizeDeviceSpectrum;
  const computeChannelDoses = window.computeChannelDoses;
  const hasPeaks = Array.isArray(device.peakWavelengths) && device.peakWavelengths.length > 0;
  const hasIrradiance = (device.mwPerCm2At15cm || 0) > 0;
  const eyeMode = eyesProtected ? 'closed-eyes' : 'direct';

  if (synthesizeDeviceSpectrum && computeChannelDoses && hasPeaks && hasIrradiance) {
    // Wavelength-correct path: synthesize spectrum scaled by distance
    // factor → action-spectrum convolve → per-channel dose. Distance is
    // applied to the SPECTRUM amplitude (not just bodyExposureFraction)
    // so eye channels — which `computeChannelDoses` gates by
    // `eyeMultiplier` rather than skin fraction — also pick up the
    // distance scaling. Otherwise a SAD lamp at 25 cm vs 100 cm
    // produces the same circadian dose, which is wrong.
    const effectiveDevice = window.effectiveDeviceForMode
      ? window.effectiveDeviceForMode(device, resolvedMode)
      : device;
    const baseSpec = synthesizeDeviceSpectrum(effectiveDevice);
    const spectrum = {
      wavelengths: baseSpec.wavelengths,
      irradiance: baseSpec.irradiance.map(v => v * distFactor),
    };
    doses = computeChannelDoses({
      spectrum,
      durationMin,
      bodyExposureFraction: area,
      eyeExposure: { mode: eyeMode, durationSec: seconds },
    });
  } else {
    // Lux-only fallback (SAD lamps without per-band irradiance / peaks).
    // distFactor still applies — closer SAD lamp = brighter circadian dose.
    const lux = device.lux || 0;
    if (!eyesProtected && lux > 0) doses.circadian = lux * distFactor * seconds / 100;
  }

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
  let resolvedMode = mode;
  if (Array.isArray(device.modes) && device.modes.length > 0) {
    const found = device.modes.find(m => m.id === mode);
    const defaultMode = device.modes.find(m => m.default) || device.modes[0];
    resolvedMode = found ? found.id : defaultMode.id;
    if (window.validateModeCoupling) {
      const validation = window.validateModeCoupling(device, resolvedMode);
      if (!validation.ok) resolvedMode = defaultMode.id;
    }
  }
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
  // Inline-compute doses using the same path as logDeviceSession but
  // without inserting a new record — we mutate the existing active
  // session in-place. Cheaper than synthesizing a new one and rewriting
  // the array.
  const device = getDevices().find(d => d.id === sess.deviceId);
  if (device && durationMin > 0) {
    const seconds = durationMin * 60;
    const fracByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.fraction]));
    const AREA_FRACTIONS = { face: 0.04, arms: 0.10, torso: 0.13, legs: 0.30, 'whole-body': 0.92, targeted: 0.05 };
    let area;
    if (Array.isArray(sess.bodyAreas) && sess.bodyAreas.length > 0) {
      area = sess.bodyAreas.reduce((s, k) => s + (fracByKey[k] || 0), 0) || 0.05;
    } else {
      area = AREA_FRACTIONS[sess.bodyArea] ?? 0.10;
    }
    const baseRangeCm = device.recommendedDistanceCm || 15;
    const distFactor = Math.min((baseRangeCm / Math.max(sess.distanceCm || 15, 5)) ** 2, 3.0);
    const eyeMode = sess.eyesProtected ? 'closed-eyes' : 'direct';
    const synthesizeDeviceSpectrum = window.synthesizeDeviceSpectrum;
    const computeChannelDoses = window.computeChannelDoses;
    const hasPeaks = Array.isArray(device.peakWavelengths) && device.peakWavelengths.length > 0;
    const hasIrradiance = (device.mwPerCm2At15cm || 0) > 0;
    let doses = {};
    if (synthesizeDeviceSpectrum && computeChannelDoses && hasPeaks && hasIrradiance) {
      const effectiveDevice = window.effectiveDeviceForMode
        ? window.effectiveDeviceForMode(device, sess.mode)
        : device;
      const baseSpec = synthesizeDeviceSpectrum(effectiveDevice);
      const spectrum = {
        wavelengths: baseSpec.wavelengths,
        irradiance: baseSpec.irradiance.map(v => v * distFactor),
      };
      doses = computeChannelDoses({
        spectrum, durationMin, bodyExposureFraction: area,
        eyeExposure: { mode: eyeMode, durationSec: seconds },
      });
    } else {
      const lux = device.lux || 0;
      if (!sess.eyesProtected && lux > 0) doses.circadian = lux * distFactor * seconds / 100;
    }
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
          const found = device.modes.find(m => m.id === patch.mode);
          const defaultMode = device.modes.find(m => m.default) || device.modes[0];
          let next = found ? found.id : defaultMode.id;
          if (window.validateModeCoupling) {
            const validation = window.validateModeCoupling(device, next);
            if (!validation.ok) next = defaultMode.id;
          }
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
      // Legacy-session normalization: pre-Round-7 sessions have no
      // `mode` field. effectiveDeviceForMode falls back to the device
      // default, so the dose math is identical — but the saved record
      // should also reflect the resolved mode so future reads + edits
      // are deterministic. Devices without `modes` keep mode=null.
      if ((sess.mode === undefined || sess.mode === null) && Array.isArray(device.modes) && device.modes.length > 0) {
        const defaultMode = device.modes.find(m => m.default) || device.modes[0];
        sess.mode = defaultMode.id;
      }
      const seconds = sess.durationMin * 60;
      const fracByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.fraction]));
      const AREA_FRACTIONS = { face: 0.04, arms: 0.10, torso: 0.13, legs: 0.30, 'whole-body': 0.92, targeted: 0.05 };
      let area;
      if (Array.isArray(sess.bodyAreas) && sess.bodyAreas.length > 0) {
        area = sess.bodyAreas.reduce((s, k) => s + (fracByKey[k] || 0), 0) || 0.05;
      } else {
        area = AREA_FRACTIONS[sess.bodyArea] ?? 0.10;
      }
      const baseRangeCm = device.recommendedDistanceCm || 15;
      const distFactor = Math.min((baseRangeCm / Math.max(sess.distanceCm || 15, 5)) ** 2, 3.0);
      const eyeMode = sess.eyesProtected ? 'closed-eyes' : 'direct';
      const synthesizeDeviceSpectrum = window.synthesizeDeviceSpectrum;
      const computeChannelDoses = window.computeChannelDoses;
      const hasPeaks = Array.isArray(device.peakWavelengths) && device.peakWavelengths.length > 0;
      const hasIrradiance = (device.mwPerCm2At15cm || 0) > 0;
      let doses = {};
      if (synthesizeDeviceSpectrum && computeChannelDoses && hasPeaks && hasIrradiance) {
        const effectiveDevice = window.effectiveDeviceForMode
          ? window.effectiveDeviceForMode(device, sess.mode)
          : device;
        const baseSpec = synthesizeDeviceSpectrum(effectiveDevice);
        const spectrum = {
          wavelengths: baseSpec.wavelengths,
          irradiance: baseSpec.irradiance.map(v => v * distFactor),
        };
        doses = computeChannelDoses({
          spectrum, durationMin: sess.durationMin, bodyExposureFraction: area,
          eyeExposure: { mode: eyeMode, durationSec: seconds },
        });
      } else {
        const lux = device.lux || 0;
        if (!sess.eyesProtected && lux > 0) doses.circadian = lux * distFactor * seconds / 100;
      }
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
  recordTombstone(state.importedData, 'deviceSessions', id);
  sessions.splice(idx, 1);
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
      return `<div class="sun-detail-channel-row sun-detail-channel-row-clickable sun-chip-tier-${t}" role="button" tabindex="0" aria-label="${escapeAttr(ariaLabel)}" onclick="this.closest('.modal-overlay')?.remove();window._openChannelOnLightPage && window._openChannelOnLightPage('${escapeAttr(k)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.closest('.modal-overlay')?.remove();window._openChannelOnLightPage && window._openChannelOnLightPage('${escapeAttr(k)}')}">
        <span class="sun-detail-channel-icon" aria-hidden="true">${meta.icon || '·'}</span>
        <span class="sun-detail-channel-label">${escapeHTML(meta.label || k)}</span>
        <span class="sun-detail-channel-value">${escapeHTML(unitText || '')}</span>
        <span class="sun-detail-channel-tier">${escapeHTML(tlabel)}</span>
        <span class="sun-detail-channel-chevron" aria-hidden="true">›</span>
      </div>`;
    }).join('') : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal sun-detail-modal" role="dialog" aria-label="Device session details">
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
      <label for="add-device-preset" class="sr-only">Pick a preset device</label>
      <select id="add-device-preset" class="ctx-select" style="width:100%;margin-top:12px" aria-label="Pick a preset device">
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
  _wireModal(overlay);

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
  _wireModal(overlay);

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
  "channelGroups": null OR [{"id": "kebab-case-id", "label": "human label", "peaks": [subset of peakWavelengths]}, ...],
  "modes": null OR [{"id": "kebab-case-id", "label": "human label", "groups": [groupIds], "default": true on the most common preset}, ...],
  "coupling": null OR [{"if": "groupId", "requires": ["otherGroupId"], "reason": "vendor-stated reason — quote if possible"}],
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

channelGroups / modes / coupling guide (set ALL THREE to null if the product page describes a single-channel device with no mode-selector):
- channelGroups: only fill in when the panel has independently-controllable LED groups (e.g. a touchscreen toggle for "UV" vs "red/NIR", or named modes like "Ironforge / Lux Vital / D-Light"). Each group lists which peakWavelengths are wired to its dimmer/switch.
- modes: only fill in if the device has named touchscreen presets / mode buttons. Each mode lists which channelGroup ids fire when selected. Always include an "all-on" mode that fires every group, marked default:true unless the vendor states otherwise. If the vendor only describes one operating mode, set modes to null.
- coupling: only fill in when the vendor explicitly states an LED group cannot run without another (e.g. "UV must run with red/NIR" — common safety design on hybrid UVB+red panels). Quote the rationale in "reason". Don't infer coupling from omission.

Use null for fields not found. Do NOT invent modes the vendor doesn't describe. No other text.`;

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
    // Use DOMParser (not regex) to strip non-content nodes — regex strips
    // can be evaded by `</script >`, `< script`, nested CDATA, etc., and
    // CodeQL flags every variant. The browser's HTML parser handles all
    // edge cases consistently. The extracted text is fed into a Claude
    // prompt (NOT into the DOM), so even surviving fragments are inert,
    // but parser-based extraction still beats regex on accuracy.
    const _doc = new DOMParser().parseFromString(html, 'text/html');
    const ldText = Array.from(_doc.querySelectorAll('script[type="application/ld+json"]'))
      .map(s => (s.textContent || '').trim()).filter(Boolean).join('\n');
    _doc.querySelectorAll('script, style, nav, footer, header, svg, noscript, template, iframe')
      .forEach(n => n.remove());
    // Strip HTML comments — DOMParser preserves them as Comment nodes.
    const _walker = _doc.createTreeWalker(_doc, NodeFilter.SHOW_COMMENT);
    const _comments = [];
    let _c; while ((_c = _walker.nextNode())) _comments.push(_c);
    for (const c of _comments) c.remove();
    const plainText = (_doc.body?.textContent || '').replace(/\s{2,}/g, ' ');
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
    channels: TYPE_CHANNELS[spec.type] || ['pbm_red', 'pbm_nir'],
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

// ─── UI: log device session modal ──────────────────────────────────────

export async function openDeviceSessionDialog(deviceId) {
  // Lazy hydrate — covers the case where the boot-time migration was
  // skipped (page opened mid-init, presets cache cold, etc.) so the
  // dialog always renders with the latest preset schema. Idempotent;
  // no-op once devices carry channelGroups / modes / coupling.
  await hydrateDevicesFromPresets().catch(() => {});
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
  const defaultEyesProtected = last.eyesProtected !== false;
  // bodyAreas[] is the new precise per-region field. For legacy
  // sessions that only have a broad bodyArea string, expand it to the
  // matching region keys so the silhouette pre-selects sensibly.
  const BROAD_TO_REGIONS = {
    face:  ['face'],
    torso: ['breast-chest', 'torso-front', 'abdomen'],
    arms:  ['arms-front', 'arms-back'],
    legs:  ['legs-front', 'legs-back'],
    // Legacy keys preserved for backcompat reads (last.bodyArea may
    // still be 'whole-body' or 'targeted' from pre-toggle sessions).
    'whole-body': (BODY_REGIONS || []).map(r => r.key),
    targeted: ['breast-chest'],
  };
  let defaultRegions;
  if (Array.isArray(last.bodyAreas) && last.bodyAreas.length > 0) {
    defaultRegions = last.bodyAreas.slice();
  } else if (last.bodyArea && BROAD_TO_REGIONS[last.bodyArea]) {
    defaultRegions = BROAD_TO_REGIONS[last.bodyArea].slice();
  } else {
    defaultRegions = ['breast-chest'];  // sensible single-region default
  }
  // Mode picker — only renders for devices with multiple modes (Maxi UVB,
  // Trinity, etc.). Coupling-violating modes are filtered out so users
  // can't pick the device into an unsafe state from the dropdown
  // (e.g. Maxi UVB has no UV-only entry; D-Light on Trinity stays
  // available since Trinity has no coupling rules).
  const showModePicker = Array.isArray(device.modes) && device.modes.length > 1;
  const validateMode = window.validateModeCoupling || (() => ({ ok: true }));
  const validModes = showModePicker
    ? device.modes.filter(m => validateMode(device, m.id).ok)
    : [];
  let defaultMode = null;
  if (showModePicker) {
    const lastModeValid = last.mode && validModes.some(m => m.id === last.mode);
    defaultMode = lastModeValid ? last.mode : (validModes.find(m => m.default) || validModes[0])?.id || null;
  }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show';
  overlay.innerHTML = `<div class="modal" role="dialog" aria-label="Log device session">
    <div class="modal-header">
      <h3>Log session — ${escapeHTML(device.brand)} ${escapeHTML(device.model)}</h3>
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      ${showModePicker ? `
        <label class="ctx-label">Mode
          <select id="dev-session-mode" class="ctx-select" title="Which LED groups were firing for this session — picked from the device's vendor-defined modes. Affects channel-dose math (e.g. red/NIR-only mode contributes ~0 vit-D).">
            ${validModes.map(m => `<option value="${escapeAttr(m.id)}"${m.id === defaultMode ? ' selected' : ''}>${escapeHTML(m.label || m.id)}</option>`).join('')}
          </select>
        </label>
      ` : ''}
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
      <div class="ctx-label" style="display:block">
        <span>Body area treated</span>
        <div class="sun-silhouette-wrap" id="dev-session-silhouette-slot">${(typeof window !== 'undefined' && window.renderBodySilhouette) ? window.renderBodySilhouette(new Set(defaultRegions)) : ''}</div>
        <div class="sun-silhouette-hint-row" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div class="sun-silhouette-hint" id="dev-session-area-hint">Tap regions the panel reaches.</div>
          <button type="button" class="ctx-btn-option" id="dev-session-clear" style="padding:2px 10px;font-size:11px">Clear</button>
        </div>
      </div>
      <div class="ctx-label" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <span style="flex:1;min-width:0">Eyes protected (goggles or closed)</span>
        <label class="toggle-switch">
          <input type="checkbox" id="dev-session-eyes"${defaultEyesProtected ? ' checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      <p class="modal-body-hint" style="margin-top:8px">Save now to log a finished session, or Start to run a live timer (matches the sun-session pattern — handy when you want to walk away and come back).</p>
      <div class="modal-actions" style="margin-top:18px">
        <button class="import-btn import-btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="import-btn import-btn-secondary" id="dev-session-start">Start timer</button>
        <button class="import-btn import-btn-primary" id="dev-session-save">Save session</button>
      </div>
    </div>
  </div>`;
  _wireModal(overlay);

  // Silhouette wiring — pre-selected regions plus an updateHint
  // callback that recomputes the % skin coverage shown under the
  // figure. Pre-2026-05-08 this was a 6-option dropdown ('torso',
  // 'whole-body', etc.); now it's the same 16-region picker as sun
  // sessions for consistency with the user's mental model.
  const selectedRegions = new Set(defaultRegions);
  const _fracByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.fraction]));
  const _labelByKey = Object.fromEntries((BODY_REGIONS || []).map(r => [r.key, r.label]));
  const _silhouetteSlot = overlay.querySelector('#dev-session-silhouette-slot');
  const _hint = overlay.querySelector('#dev-session-area-hint');
  function _updateAreaHint(set) {
    if (!_hint) return;
    if (set.size === 0) {
      _hint.textContent = 'Pick at least one region — what does the panel reach?';
      return;
    }
    const frac = Array.from(set).reduce((s, k) => s + (_fracByKey[k] || 0), 0);
    const labels = Array.from(set).map(k => _labelByKey[k] || k).slice(0, 4).join(', ');
    const more = set.size > 4 ? ` +${set.size - 4} more` : '';
    _hint.textContent = `${set.size} region${set.size === 1 ? '' : 's'} (~${Math.round(frac * 100)}% of skin) — ${labels}${more}`;
  }
  if (_silhouetteSlot && typeof window !== 'undefined' && window.bindBodySilhouette) {
    window.bindBodySilhouette(_silhouetteSlot, selectedRegions, (set) => {
      _updateAreaHint(set);
    });
  }
  _updateAreaHint(selectedRegions);

  // Clear — single bulk-deselect affordance. The silhouette itself is
  // the picker; pre-2026-05-08 also had a 4-zone toggle row but it was
  // a redundant abstraction (every operation duplicated a silhouette
  // tap, and active-state drift on individual taps was confusing).
  // Real logs show 1-3 region picks, not whole-zone bulk operations,
  // so this single Clear button covers the only genuine shortcut.
  overlay.querySelector('#dev-session-clear')?.addEventListener('click', () => {
    selectedRegions.clear();
    if (_silhouetteSlot && typeof window !== 'undefined' && window.renderBodySilhouette) {
      _silhouetteSlot.innerHTML = window.renderBodySilhouette(selectedRegions);
    }
    _updateAreaHint(selectedRegions);
  });

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
    const bodyAreas = Array.from(selectedRegions);
    if (bodyAreas.length === 0) {
      _updateAreaHint(selectedRegions);
      _hint?.classList.add('sun-silhouette-hint-error');
      setTimeout(() => _hint?.classList.remove('sun-silhouette-hint-error'), 2500);
      return;
    }
    // Denormalized broad-zone hint kept for legacy listing rows that
    // haven't been migrated to bodyAreas yet. Pick the simplest match
    // for the chosen region set.
    let bodyArea = 'targeted';
    if (bodyAreas.length >= (BODY_REGIONS || []).length - 2) bodyArea = 'whole-body';
    else if (bodyAreas.every(r => r.startsWith('legs') || r.startsWith('feet'))) bodyArea = 'legs';
    else if (bodyAreas.every(r => r.startsWith('arms'))) bodyArea = 'arms';
    else if (bodyAreas.every(r => /face|thyroid/.test(r))) bodyArea = 'face';
    else if (bodyAreas.every(r => /chest|torso|abdomen|breast/.test(r))) bodyArea = 'torso';
    const eyesProtected = overlay.querySelector('#dev-session-eyes').checked;
    const mode = showModePicker ? overlay.querySelector('#dev-session-mode')?.value || null : null;
    await logDeviceSession({ deviceId, durationMin, distanceCm, bodyArea, bodyAreas, eyesProtected, mode });
    overlay.remove();
    showNotification(`${durationMin} min ${escapeHTML(device.brand)} session saved.`);
    // Always land on /light after a save so the user sees the freshly-
    // logged session (and its mode chip) in their history. Pre-Round-7
    // this only re-rendered when already on /light; saving from the
    // dashboard FAB used to leave the user on the dashboard with no
    // visual feedback that the session had been recorded.
    if (window.navigate) window.navigate('light');
  });

  // Start-timer path — same shared form, but begins a live session
  // instead of logging a finished one. Reuses every input EXCEPT
  // duration (irrelevant — duration accumulates from startedAt).
  overlay.querySelector('#dev-session-start').addEventListener('click', async () => {
    if (getActiveDeviceSession()) {
      showNotification('Another device session is already running. Stop it first.', 'error');
      return;
    }
    const distInput = overlay.querySelector('#dev-session-distance');
    const distVal = parseFloat(distInput.value);
    const distUnit = distInput.dataset.unit || 'cm';
    const distanceCm = Number.isFinite(distVal)
      ? (distUnit === 'in' ? distVal * 2.54 : distVal)
      : (device.recommendedDistanceCm || 15);
    const bodyAreas = Array.from(selectedRegions);
    if (bodyAreas.length === 0) {
      _updateAreaHint(selectedRegions);
      _hint?.classList.add('sun-silhouette-hint-error');
      setTimeout(() => _hint?.classList.remove('sun-silhouette-hint-error'), 2500);
      return;
    }
    let bodyArea = 'targeted';
    if (bodyAreas.length >= (BODY_REGIONS || []).length - 2) bodyArea = 'whole-body';
    else if (bodyAreas.every(r => r.startsWith('legs') || r.startsWith('feet'))) bodyArea = 'legs';
    else if (bodyAreas.every(r => r.startsWith('arms'))) bodyArea = 'arms';
    else if (bodyAreas.every(r => /face|thyroid/.test(r))) bodyArea = 'face';
    else if (bodyAreas.every(r => /chest|torso|abdomen|breast/.test(r))) bodyArea = 'torso';
    const eyesProtected = overlay.querySelector('#dev-session-eyes').checked;
    const mode = showModePicker ? overlay.querySelector('#dev-session-mode')?.value || null : null;
    await startDeviceSession({ deviceId, distanceCm, bodyAreas, bodyArea, eyesProtected, mode });
    overlay.remove();
    showNotification(`Live ${escapeHTML(device.brand)} session started — tap Stop & save when finished.`);
    ensureActiveDeviceTicker();
    if (window.navigate) window.navigate('light');
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
