// @ts-check
// light-devices-store.js - persisted light-device and device-session mutations.
//
// UI modules own preset loading, dialogs, rendering, and notifications. This
// module owns importedData.lightDevices[] / deviceSessions[] writes, dose
// recompute, sync freshness stamps, and saveImportedData().

import { state } from './state.js';
import { saveImportedData } from './data.js';
import { deleteImportedArrayItem } from './data-merge.js';
import {
  DEVICE_TYPE_CHANNELS,
  computeDeviceSessionDoses,
  resolveDeviceMode,
} from './light-device-session-engine.js';
import { fractionOfMED } from './sun-spectrum.js';
import { _normalizePSMTier, photosensitiveMedScale } from './sun-session-model.js';
import { BODY_REGIONS } from './sun-body-silhouette.js';

export const DEVICE_SESSION_SCHEMA_VERSION = 1;

/**
 * @typedef {object} LightDevicesStoreDeps
 * @property {(session: any) => void} maybeAnalyzeDeviceSessionAfterFinish
 */

/** @type {LightDevicesStoreDeps} */
const storeDeps = {
  maybeAnalyzeDeviceSessionAfterFinish: () => {},
};

/** @param {Partial<LightDevicesStoreDeps>} [deps] */
export function configureLightDevicesStore(deps = {}) {
  Object.assign(storeDeps, deps);
}

function randomSuffix(chars = 4) {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(Math.ceil(chars * 0.75) + 1);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').slice(0, chars);
  }
  return Math.random().toString(36).slice(2, 2 + chars).padEnd(chars, '0');
}

function makeId(prefix, now = Date.now()) {
  return `${prefix}_${now.toString(36)}_${randomSuffix()}`;
}

function runDeviceSessionAnalysis(session) {
  try { storeDeps.maybeAnalyzeDeviceSessionAfterFinish(session); } catch (_) {}
}

function personalizeDeviceSafety(safety) {
  if (!safety || !Number.isFinite(safety.sed)) return safety;
  const fitzpatrick = state.importedData?.sunDefaults?.fitzpatrick || 'III';
  const tier = _normalizePSMTier(state.importedData?.sunDefaults?.photosensitiveMeds);
  const medScale = photosensitiveMedScale(tier);
  return {
    ...safety,
    fitzpatrick,
    photosensitiveMedTier: tier,
    medFraction: fractionOfMED({ sed: safety.sed, fitzpatrick, medScale }),
  };
}

function normalizeDurationMin(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(24 * 60, n) : null;
}

function normalizeDistanceCm(value, fallback = 15) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.max(5, Math.min(500, n)) : fallback;
}

function normalizeBodyAreas(value) {
  if (!Array.isArray(value)) return null;
  const allowed = new Set(BODY_REGIONS.map(region => region.key));
  return [...new Set(value.filter(key => allowed.has(key)))];
}

function buildDeviceCalculation(physicalDoses, safety) {
  const source = physicalDoses?.source || safety?.source || 'lux-proxy';
  const score = source === 'declared-spectrum' ? 0.7 : source === 'heuristic-spectrum' ? 0.4 : 0.35;
  return {
    schemaVersion: DEVICE_SESSION_SCHEMA_VERSION,
    generatedAt: Date.now(),
    provenance: {
      source,
      model: source === 'lux-proxy' ? 'photopic-lux fallback' : 'device spectrum reconstruction',
      distanceModel: 'inverse-square estimate capped at 3×',
    },
    confidence: {
      score,
      level: score >= 0.65 ? 'medium' : 'low',
      reasons: source === 'declared-spectrum'
        ? ['Device spectral shares were declared, but actual output, distance, and beam uniformity were not measured.']
        : source === 'heuristic-spectrum'
          ? ['Spectral power shares were estimated from the device type and listed wavelengths.']
          : ['Photopic lux was converted with a generic daylight-like melanopic ratio.'],
    },
    precision: { allowsExactSafety: false },
  };
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

let deviceMaintenanceSaveQueued = false;
function queueDeviceMaintenanceSave() {
  if (deviceMaintenanceSaveQueued) return;
  deviceMaintenanceSaveQueued = true;
  Promise.resolve().then(async () => {
    deviceMaintenanceSaveQueued = false;
    try { await saveImportedData(); } catch (_) {}
  });
}

export async function addDeviceFromPresetRecord(preset, overrides = {}, { now = Date.now() } = {}) {
  if (!preset) return null;
  const device = {
    id: makeId('dev', now),
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
export async function logDeviceSession({ deviceId, durationMin, distanceCm = 15, bodyArea = 'torso', bodyAreas = null, eyesProtected = true, notes = '', mode = null } = {}) {
  const device = getDevices().find(d => d.id === deviceId);
  if (!device) return null;
  durationMin = normalizeDurationMin(durationMin);
  if (durationMin == null) return null;
  distanceCm = normalizeDistanceCm(distanceCm, device.recommendedDistanceCm || 15);
  bodyAreas = normalizeBodyAreas(bodyAreas);
  const now = Date.now();
  const seconds = durationMin * 60;
  const { doses, physicalDoses, safety, mode: resolvedMode } = computeDeviceSessionDoses({
    device,
    durationMin,
    distanceCm,
    bodyArea,
    bodyAreas,
    eyesProtected,
    mode,
  });

  const session = {
    schemaVersion: DEVICE_SESSION_SCHEMA_VERSION,
    id: makeId('devsess', now),
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
    physicalDoses,
    safety: personalizeDeviceSafety(safety),
    calculation: buildDeviceCalculation(physicalDoses, safety),
    updatedAt: now,
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
  const active = getDeviceSessions()
    .filter(session => !session.endedAt)
    .sort((a, b) => (b.updatedAt || b.startedAt || 0) - (a.updatedAt || a.startedAt || 0)
      || String(b.id || '').localeCompare(String(a.id || '')));
  const canonical = active[0] || null;
  if (canonical && active.length > 1) {
    const resolvedAt = Date.now();
    for (const duplicate of active.slice(1)) {
      const endedAt = Math.max(Number(duplicate.startedAt) || resolvedAt, Math.min(
        resolvedAt,
        Number(duplicate.updatedAt) || Number(canonical.startedAt) || resolvedAt
      ));
      duplicate.endedAt = endedAt;
      duplicate.durationMin = Math.max(0, (endedAt - (Number(duplicate.startedAt) || endedAt)) / 60000);
      duplicate.updatedAt = resolvedAt;
      duplicate.syncResolution = {
        status: 'superseded',
        reason: 'duplicate-active-device-session',
        canonicalSessionId: canonical.id,
        resolvedAt,
      };
    }
    queueDeviceMaintenanceSave();
  }
  return canonical;
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
  distanceCm = normalizeDistanceCm(distanceCm, device.recommendedDistanceCm || 15);
  bodyAreas = normalizeBodyAreas(bodyAreas);
  const now = Date.now();
  const resolvedMode = resolveDeviceMode(device, mode);
  const id = makeId('devsess', now);
  const sess = {
    schemaVersion: DEVICE_SESSION_SCHEMA_VERSION,
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
    updatedAt: now,
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
    const { doses, physicalDoses, safety } = computeDeviceSessionDoses({
      device,
      durationMin,
      distanceCm: sess.distanceCm,
      bodyArea: sess.bodyArea,
      bodyAreas: sess.bodyAreas,
      eyesProtected: sess.eyesProtected,
      mode: sess.mode,
    });
    sess.doses = doses;
    sess.physicalDoses = physicalDoses;
    sess.safety = personalizeDeviceSafety(safety);
    sess.calculation = buildDeviceCalculation(physicalDoses, safety);
  }
  sess.endedAt = endedAt;
  sess.durationMin = durationMin;
  sess.updatedAt = endedAt;
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
      let nextValue = patch[k];
      if (k === 'durationMin') nextValue = normalizeDurationMin(nextValue);
      if (k === 'distanceCm') nextValue = normalizeDistanceCm(nextValue, sess.distanceCm || 15);
      if (k === 'bodyAreas') nextValue = normalizeBodyAreas(nextValue);
      if (k === 'durationMin' && nextValue == null) continue;
      sess[k] = nextValue;
      if (['durationMin', 'distanceCm', 'bodyArea', 'bodyAreas', 'eyesProtected'].includes(k)) needsRecompute = true;
    }
  }
  // Re-derive endedAt + dose if duration changed so stored duration and
  // channel doses cannot drift.
  if (needsRecompute && sess.endedAt && Number.isFinite(sess.durationMin)) {
    sess.endedAt = sess.startedAt + sess.durationMin * 60 * 1000;
    const device = getDevices().find(d => d.id === sess.deviceId);
    if (device) {
      const { doses, physicalDoses, safety, mode: resolvedMode } = computeDeviceSessionDoses({
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
      sess.physicalDoses = physicalDoses;
      sess.safety = personalizeDeviceSafety(safety);
      sess.calculation = buildDeviceCalculation(physicalDoses, safety);
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
    id: makeId('dev', now),
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
