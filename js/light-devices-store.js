// @ts-check
// light-devices-store.js - persisted light-device and device-session mutations.
//
// UI modules own preset loading, dialogs, rendering, and notifications. This
// module owns importedData.lightDevices[] / deviceSessions[] writes, dose
// recompute, sync freshness stamps, and saveImportedData().

import { state } from './state.js';
import { saveImportedData } from './data.js';
import { deleteImportedArrayItem } from './data-merge.js';
import { requestDeviceSessionAnalysis } from './light-sun-analysis-runtime.js';
import {
  DEVICE_TYPE_CHANNELS,
  computeDeviceSessionDoses,
  resolveDeviceMode,
} from './light-device-session-engine.js';
import { createUniqueId } from './unique-id.js';

/**
 * @typedef {object} LightDevicesStoreDeps
 * @property {(session: any) => void} maybeAnalyzeDeviceSessionAfterFinish
 */

/** @type {LightDevicesStoreDeps} */
const storeDeps = {
  maybeAnalyzeDeviceSessionAfterFinish: requestDeviceSessionAnalysis,
};

/** @param {Partial<LightDevicesStoreDeps>} [deps] */
export function configureLightDevicesStore(deps = {}) {
  Object.assign(storeDeps, deps);
}

function runDeviceSessionAnalysis(session) {
  try { storeDeps.maybeAnalyzeDeviceSessionAfterFinish(session); } catch (_) {}
}

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

export async function addDeviceFromPresetRecord(preset, overrides = {}, { now = Date.now() } = {}) {
  if (!preset) return null;
  const device = {
    id: createUniqueId('dev_'),
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
    // healed by hydrateDevicesFromPresetRecords at boot.
    channelGroups: Array.isArray(preset.channelGroups) ? preset.channelGroups : null,
    modes: Array.isArray(preset.modes) ? preset.modes : null,
    coupling: Array.isArray(preset.coupling) ? preset.coupling : null,
    catalogSlug: preset.catalogSlug || null,
    notes: overrides.notes || '',
    addedAt: now,
  };
  getDevices().push(device);
  await saveImportedData();
  return device;
}

export async function hydrateDevicesFromPresetRecords(presets) {
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

/**
 * @param {{deviceId?: string, durationMin?: number, distanceCm?: number, bodyArea?: string, bodyAreas?: string[]|null, eyesProtected?: boolean, notes?: string, mode?: string|null}} [input]
 */
export async function logDeviceSession({ deviceId, durationMin = 0, distanceCm = 15, bodyArea = 'torso', bodyAreas = null, eyesProtected = true, notes = '', mode = null } = {}) {
  const device = getDevices().find(d => d.id === deviceId);
  if (!device) return null;
  const now = Date.now();
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
    id: createUniqueId('devsess_'),
    deviceId,
    startedAt: now - seconds * 1000,
    endedAt: now,
    durationMin,
    distanceCm,
    bodyArea,
    // bodyAreas[] is the precise-region field; bodyArea remains as a
    // denormalized broad-zone hint for legacy readers + listing rows.
    bodyAreas: Array.isArray(bodyAreas) ? bodyAreas.slice() : null,
    eyesProtected,
    mode: resolvedMode,
    doses,
    notes,
  };
  getDeviceSessions().push(session);
  // Remember user params for the next log dialog. Notes intentionally stay
  // per-session and are not carried forward.
  device.lastSession = { durationMin, distanceCm, bodyArea, bodyAreas: session.bodyAreas, eyesProtected, mode: resolvedMode };
  device.updatedAt = now;
  await saveImportedData();
  runDeviceSessionAnalysis(session);
  return session;
}

export function getActiveDeviceSession() {
  return getDeviceSessions().find(s => !s.endedAt) || null;
}

/**
 * @param {{deviceId?: string, distanceCm?: number, bodyAreas?: string[]|null, bodyArea?: string, eyesProtected?: boolean, mode?: string|null}} [input]
 */
export async function startDeviceSession({ deviceId, distanceCm = 15, bodyAreas = null, bodyArea = 'torso', eyesProtected = true, mode = null } = {}) {
  // Reject a second active timer - one session at a time keeps the
  // active-card UI unambiguous and matches sun-session semantics.
  if (getActiveDeviceSession()) return null;
  const device = getDevices().find(d => d.id === deviceId);
  if (!device) return null;
  const now = Date.now();
  const resolvedMode = resolveDeviceMode(device, mode);
  const id = createUniqueId('devsess_');
  const sess = {
    id,
    deviceId,
    startedAt: now,
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

export async function stopDeviceSession(id) {
  const sessions = getDeviceSessions();
  const sess = id ? sessions.find(s => s.id === id) : getActiveDeviceSession();
  if (!sess || sess.endedAt) return null;
  const endedAt = Date.now();
  const durationMin = Math.max(0, (endedAt - sess.startedAt) / 60000);
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
      durationMin,
      distanceCm: sess.distanceCm,
      bodyArea: sess.bodyArea,
      bodyAreas: sess.bodyAreas,
      eyesProtected: sess.eyesProtected,
      mode: sess.mode,
    };
    device.updatedAt = Date.now();
  }
  await saveImportedData();
  runDeviceSessionAnalysis(sess);
  return sess;
}

export async function updateDeviceSession(id, patch = {}) {
  const sessions = getDeviceSessions();
  const sess = sessions.find(s => s.id === id);
  if (!sess) return null;
  const editable = ['durationMin', 'distanceCm', 'bodyArea', 'bodyAreas', 'eyesProtected', 'notes', 'mode'];
  let needsRecompute = false;
  for (const k of editable) {
    if (k in patch && patch[k] !== sess[k]) {
      // Array deep-compare for bodyAreas - patch comes in as a fresh array;
      // detect content change, not just identity.
      if (k === 'bodyAreas') {
        const before = JSON.stringify((sess.bodyAreas || []).slice().sort());
        const after = JSON.stringify((patch.bodyAreas || []).slice().sort());
        if (before === after) continue;
      }
      // mode patches go through coupling validation; bad input falls back to
      // the device default instead of persisting.
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
  // Re-derive endedAt + dose if duration changed so stored duration and
  // channel doses cannot drift.
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
  runDeviceSessionAnalysis(sess);
  return sess;
}

export async function deleteDeviceSession(id) {
  const sessions = getDeviceSessions();
  const idx = sessions.findIndex(s => s.id === id);
  if (idx < 0) return false;
  deleteImportedArrayItem(state.importedData, 'deviceSessions', idx);
  await saveImportedData();
  return true;
}

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

export async function addCustomDevice(spec) {
  if (!spec || !spec.brand || !spec.model) return null;
  const now = Date.now();
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
    id: createUniqueId('dev_'),
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
    addedAt: now,
  };
  getDevices().push(device);
  await saveImportedData();
  return device;
}
