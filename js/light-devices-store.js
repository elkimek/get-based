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
  DEVICE_ENGINE_VERSION,
  computeDeviceSessionDoses,
  deviceEmitsUV,
  resolveDeviceMode,
} from './light-device-session-engine.js';
import { createUniqueId } from './unique-id.js';
import { BODY_REGIONS } from './sun-body-silhouette.js';

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

const MAX_DEVICE_SESSION_MIN = 600;
const VALID_BODY_REGIONS = new Set(BODY_REGIONS.map(region => region.key));
const VALID_BROAD_AREAS = new Set(['targeted', 'face', 'torso', 'arms', 'legs', 'whole-body']);

function safeText(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizedPeaks(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map(Number)
    .filter(nm => Number.isFinite(nm) && nm >= 180 && nm <= 2500))]
    .sort((a, b) => a - b);
}

function channelsForDevice(type, peaks) {
  const channels = new Set();
  const has = (min, max) => peaks.some(nm => nm >= min && nm < max);
  if (has(280, 320)) channels.add('vitamin_d');
  if (has(280, 400)) channels.add('pomc');
  if (has(315, 410)) channels.add('no_cv');
  if (has(600, 700)) channels.add('pbm_red');
  if (has(700, 1100)) channels.add('pbm_nir');
  if (['sad', 'dawn-sim', 'full-spectrum'].includes(type)) {
    channels.add('circadian');
    if (has(400, 500)) channels.add('violet_eye');
  }
  // Type is a conservative fallback when a UV page declares the class but
  // omits wavelengths. Numeric UV estimates remain unavailable in the engine.
  if (type === 'uvb' && peaks.length === 0) {
    channels.add('vitamin_d');
    channels.add('pomc');
  }
  if (type === 'uva' && peaks.length === 0) {
    channels.add('pomc');
    channels.add('no_cv');
  }
  return [...channels];
}

function normalizedBodyAreas(bodyAreas) {
  if (!Array.isArray(bodyAreas)) return null;
  return [...new Set(bodyAreas.filter(key => VALID_BODY_REGIONS.has(key)))];
}

function validDuration(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= MAX_DEVICE_SESSION_MIN ? number : null;
}

function validDistance(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 && number <= 1000 ? number : null;
}

function cloneValue(value) {
  if (value == null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

const DEVICE_MODEL_FIELDS = [
  'type', 'peakWavelengths', 'peakShares', 'peakShareBasis',
  'mwPerCm2At15cm', 'lux', 'recommendedDistanceCm',
  'irradianceByDistanceCm', 'distanceModel', 'melanopicDER',
  'melanopicEdiLux', 'melanopicBasis',
  'irradianceBasis', 'specSourceUrl', 'channels',
  'channelGroups', 'modes', 'coupling', 'catalogSlug',
];

function deviceSnapshot(device) {
  if (!device) return null;
  const snapshot = {
    id: device.id,
    brand: device.brand || '',
    model: device.model || '',
    notes: device.notes || '',
  };
  for (const field of DEVICE_MODEL_FIELDS) snapshot[field] = cloneValue(device[field] ?? null);
  return snapshot;
}

function sessionDevice(sess) {
  return getDevices().find(device => device.id === sess?.deviceId)
    || sess?.deviceSnapshot
    || null;
}

function applyComputedSessionFields(sess, computed) {
  sess.mode = computed.mode;
  sess.doses = computed.doses;
  sess.safety = computed.safety;
  sess.metrics = computed.metrics;
  sess.calculation = computed.model;
  sess.calculationStatus = computed.model?.status || 'computed';
  sess.distanceModel = computed.distanceModel;
  sess.engineVersion = DEVICE_ENGINE_VERSION;
  delete sess.aiAnalysis;
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
    brand: safeText(overrides.brand || preset.brand),
    model: safeText(overrides.model || preset.model),
    type: overrides.type || preset.type,
    peakWavelengths: normalizedPeaks(overrides.peakWavelengths || preset.peakWavelengths || []),
    peakShares: overrides.peakShares || preset.peakShares || null,
    peakShareBasis: overrides.peakShareBasis || preset.peakShareBasis || null,
    mwPerCm2At15cm: overrides.mwPerCm2At15cm ?? preset.mwPerCm2At15cm ?? null,
    lux: overrides.lux ?? preset.lux ?? null,
    recommendedDistanceCm: overrides.recommendedDistanceCm ?? preset.recommendedDistanceCm ?? 15,
    irradianceByDistanceCm: overrides.irradianceByDistanceCm || preset.irradianceByDistanceCm || null,
    distanceModel: overrides.distanceModel || preset.distanceModel || 'reference-only',
    melanopicDER: overrides.melanopicDER ?? preset.melanopicDER ?? null,
    melanopicEdiLux: overrides.melanopicEdiLux ?? preset.melanopicEdiLux ?? null,
    melanopicBasis: overrides.melanopicBasis || preset.melanopicBasis || null,
    irradianceBasis: overrides.irradianceBasis || preset.irradianceBasis || 'unknown',
    specSourceUrl: overrides.specSourceUrl || preset.specSourceUrl || null,
    channels: overrides.channels || preset.channels || [],
    // Round 7: copy the LED-group schema through so the session-log
    // dialog can render the mode picker. Devices added pre-Round-7 are
    // healed by hydrateDevicesFromPresetRecords at boot.
    channelGroups: cloneValue(overrides.channelGroups ?? preset.channelGroups ?? null),
    modes: cloneValue(overrides.modes ?? preset.modes ?? null),
    coupling: cloneValue(overrides.coupling ?? preset.coupling ?? null),
    catalogSlug: overrides.catalogSlug ?? preset.catalogSlug ?? null,
    notes: safeText(overrides.notes || preset.notes || '', 2000),
    addedAt: now,
  };
  const modeledOverrideFields = DEVICE_MODEL_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(overrides, field));
  if (modeledOverrideFields.length > 0) device.specEditedAt = now;
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
    // Preset records are curated model inputs. Keep existing devices current
    // when those inputs are corrected, unless a future/device editor marks
    // the user's copy as explicitly customized.
    if (!dev.specEditedAt) {
      for (const field of DEVICE_MODEL_FIELDS) {
        const next = field === 'distanceModel'
          ? (preset[field] || 'reference-only')
          : cloneValue(preset[field] ?? null);
        const hasField = Object.prototype.hasOwnProperty.call(dev, field);
        if (hasField && JSON.stringify(dev[field] ?? null) === JSON.stringify(next)) continue;
        dev[field] = next;
        dirty = true;
      }
    }
  }
  if (dirty) await saveImportedData();
  return dirty;
}

export async function deleteDevice(id) {
  const devs = getDevices();
  const idx = devs.findIndex(d => d.id === id);
  if (idx < 0) return false;
  if (getDeviceSessions().some(session => session.deviceId === id && !session.endedAt)) return false;
  const device = devs[idx];
  for (const session of getDeviceSessions()) {
    if (session.deviceId === id && !session.deviceSnapshot) session.deviceSnapshot = deviceSnapshot(device);
  }
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
  const safeDuration = validDuration(durationMin);
  const safeDistance = validDistance(distanceCm);
  const safeBodyAreas = normalizedBodyAreas(bodyAreas);
  if (safeDuration == null || safeDistance == null) return null;
  if (Array.isArray(bodyAreas) && (!safeBodyAreas || safeBodyAreas.length === 0)) return null;
  const safeBodyArea = VALID_BROAD_AREAS.has(bodyArea) ? bodyArea : 'targeted';
  const now = Date.now();
  const seconds = safeDuration * 60;
  const computed = computeDeviceSessionDoses({
    device,
    durationMin: safeDuration,
    distanceCm: safeDistance,
    bodyArea: safeBodyArea,
    bodyAreas: safeBodyAreas,
    eyesProtected: !!eyesProtected,
    mode,
  });

  const session = {
    id: createUniqueId('devsess_'),
    deviceId,
    startedAt: now - seconds * 1000,
    endedAt: now,
    durationMin: safeDuration,
    distanceCm: safeDistance,
    bodyArea: safeBodyArea,
    // bodyAreas[] is the precise-region field; bodyArea remains as a
    // denormalized broad-zone hint for legacy readers + listing rows.
    bodyAreas: safeBodyAreas,
    eyesProtected: !!eyesProtected,
    fitzpatrick: state.importedData?.sunDefaults?.fitzpatrick || null,
    mode: computed.mode,
    deviceSnapshot: deviceSnapshot(device),
    notes: String(notes || '').slice(0, 2000),
  };
  applyComputedSessionFields(session, computed);
  getDeviceSessions().push(session);
  // Remember user params for the next log dialog. Notes intentionally stay
  // per-session and are not carried forward.
  device.lastSession = { durationMin: safeDuration, distanceCm: safeDistance, bodyArea: safeBodyArea, bodyAreas: session.bodyAreas, eyesProtected: !!eyesProtected, mode: computed.mode };
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
  const safeDistance = validDistance(distanceCm);
  const safeBodyAreas = normalizedBodyAreas(bodyAreas);
  if (safeDistance == null) return null;
  if (Array.isArray(bodyAreas) && (!safeBodyAreas || safeBodyAreas.length === 0)) return null;
  const safeBodyArea = VALID_BROAD_AREAS.has(bodyArea) ? bodyArea : 'targeted';
  const now = Date.now();
  const resolvedMode = resolveDeviceMode(device, mode);
  // Enforce this below the modal too so programmatic callers cannot start a
  // UV-emitting timer while recording unprotected eyes.
  if (deviceEmitsUV(device, resolvedMode) && !eyesProtected) return null;
  const id = createUniqueId('devsess_');
  const sess = {
    id,
    deviceId,
    startedAt: now,
    endedAt: null,
    durationMin: 0,
    distanceCm: safeDistance,
    bodyArea: safeBodyArea,
    bodyAreas: safeBodyAreas,
    eyesProtected: !!eyesProtected,
    fitzpatrick: state.importedData?.sunDefaults?.fitzpatrick || null,
    mode: resolvedMode,
    deviceSnapshot: deviceSnapshot(device),
    doses: {},
    calculationStatus: 'pending',
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
  const liveDevice = getDevices().find(device => device.id === sess.deviceId) || null;
  const device = liveDevice || sess.deviceSnapshot || null;
  if (device) {
    const computed = computeDeviceSessionDoses({
      device,
      durationMin,
      distanceCm: sess.distanceCm,
      bodyArea: sess.bodyArea,
      bodyAreas: sess.bodyAreas,
      eyesProtected: sess.eyesProtected,
      mode: sess.mode,
    });
    applyComputedSessionFields(sess, computed);
  } else {
    sess.doses = null;
    sess.safety = null;
    sess.metrics = null;
    sess.calculation = { status: 'device-unavailable', warnings: ['The device record is unavailable, so this session cannot be recalculated.'] };
    sess.calculationStatus = 'device-unavailable';
    delete sess.aiAnalysis;
  }
  sess.endedAt = endedAt;
  sess.durationMin = durationMin;
  if (liveDevice) {
    liveDevice.lastSession = {
      durationMin,
      distanceCm: sess.distanceCm,
      bodyArea: sess.bodyArea,
      bodyAreas: sess.bodyAreas,
      eyesProtected: sess.eyesProtected,
      mode: sess.mode,
    };
    liveDevice.updatedAt = Date.now();
  }
  await saveImportedData();
  runDeviceSessionAnalysis(sess);
  return sess;
}

/**
 * @param {string} id
 * @param {Record<string, any>} [patch]
 */
export async function updateDeviceSession(id, patch = {}) {
  const sessions = getDeviceSessions();
  const sess = sessions.find(s => s.id === id);
  if (!sess) return null;
  const editable = ['durationMin', 'distanceCm', 'bodyArea', 'bodyAreas', 'eyesProtected', 'notes', 'mode'];
  /** @type {Record<string, any>} */
  const normalizedPatch = { ...patch };
  if ('durationMin' in normalizedPatch) {
    const duration = validDuration(normalizedPatch.durationMin);
    if (duration == null) return null;
    normalizedPatch.durationMin = duration;
  }
  if ('distanceCm' in normalizedPatch) {
    const distance = validDistance(normalizedPatch.distanceCm);
    if (distance == null) return null;
    normalizedPatch.distanceCm = distance;
  }
  if ('bodyAreas' in normalizedPatch) {
    const areas = normalizedBodyAreas(normalizedPatch.bodyAreas);
    if (!areas || areas.length === 0) return null;
    normalizedPatch.bodyAreas = areas;
  }
  if ('bodyArea' in normalizedPatch && !VALID_BROAD_AREAS.has(normalizedPatch.bodyArea)) normalizedPatch.bodyArea = 'targeted';
  if ('eyesProtected' in normalizedPatch) normalizedPatch.eyesProtected = !!normalizedPatch.eyesProtected;
  if ('notes' in normalizedPatch) normalizedPatch.notes = String(normalizedPatch.notes || '').slice(0, 2000);
  let needsRecompute = false;
  for (const k of editable) {
    if (k in normalizedPatch && normalizedPatch[k] !== sess[k]) {
      // Array deep-compare for bodyAreas - patch comes in as a fresh array;
      // detect content change, not just identity.
      if (k === 'bodyAreas') {
        const before = JSON.stringify((sess.bodyAreas || []).slice().sort());
        const after = JSON.stringify((normalizedPatch.bodyAreas || []).slice().sort());
        if (before === after) continue;
      }
      // mode patches go through coupling validation; bad input falls back to
      // the device default instead of persisting.
      if (k === 'mode') {
        const device = sessionDevice(sess);
        if (device && Array.isArray(device.modes) && device.modes.length > 0) {
          const next = resolveDeviceMode(device, normalizedPatch.mode);
          if (next === sess.mode) continue;
          sess.mode = next;
          needsRecompute = true;
          continue;
        }
      }
      sess[k] = normalizedPatch[k];
      if (['durationMin', 'distanceCm', 'bodyArea', 'bodyAreas', 'eyesProtected', 'mode'].includes(k)) needsRecompute = true;
    }
  }
  // Re-derive endedAt + dose if duration changed so stored duration and
  // channel doses cannot drift.
  if (needsRecompute && sess.endedAt && Number.isFinite(sess.durationMin)) {
    sess.endedAt = sess.startedAt + sess.durationMin * 60 * 1000;
    const liveDevice = getDevices().find(device => device.id === sess.deviceId) || null;
    if (liveDevice) sess.deviceSnapshot = deviceSnapshot(liveDevice);
    const device = liveDevice || sess.deviceSnapshot || null;
    if (device) {
      const computed = computeDeviceSessionDoses({
        device,
        durationMin: sess.durationMin,
        distanceCm: sess.distanceCm,
        bodyArea: sess.bodyArea,
        bodyAreas: sess.bodyAreas,
        eyesProtected: sess.eyesProtected,
        mode: sess.mode,
      });
      applyComputedSessionFields(sess, computed);
    } else {
      sess.doses = null;
      sess.safety = null;
      sess.metrics = null;
      sess.calculation = { status: 'device-unavailable', warnings: ['The device record is unavailable, so edited estimates were cleared.'] };
      sess.calculationStatus = 'device-unavailable';
      delete sess.aiAnalysis;
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

export async function rehydrateStaleDeviceSessions() {
  let rehydrated = 0;
  for (const sess of getDeviceSessions()) {
    if (!sess?.endedAt || (sess.engineVersion ?? 0) >= DEVICE_ENGINE_VERSION) continue;
    const liveDevice = getDevices().find(candidate => candidate.id === sess.deviceId);
    // A stale session is being recomputed against the current corrected model;
    // keep its saved inputs in sync so later device removal cannot resurrect
    // the older, invalid spectrum.
    if (liveDevice) sess.deviceSnapshot = deviceSnapshot(liveDevice);
    const device = liveDevice || sess.deviceSnapshot;
    if (!device) continue;
    if (!sess.fitzpatrick) sess.fitzpatrick = state.importedData?.sunDefaults?.fitzpatrick || null;
    const computed = computeDeviceSessionDoses({
      device,
      durationMin: sess.durationMin || 0,
      distanceCm: sess.distanceCm,
      bodyArea: sess.bodyArea,
      bodyAreas: sess.bodyAreas,
      eyesProtected: sess.eyesProtected,
      mode: sess.mode,
    });
    applyComputedSessionFields(sess, computed);
    rehydrated++;
  }
  if (rehydrated > 0) await saveImportedData();
  return { rehydrated, engineVersion: DEVICE_ENGINE_VERSION };
}

export async function addCustomDevice(spec) {
  if (!spec || !safeText(spec.brand) || !safeText(spec.model)) return null;
  const now = Date.now();
  const peaks = normalizedPeaks(spec.peakWavelengths);
  const channelGroups = Array.isArray(spec.channelGroups)
    ? spec.channelGroups
        .filter(g => g && typeof g.id === 'string' && Array.isArray(g.peaks) && g.peaks.length > 0)
        .map(g => ({
          id: safeText(g.id, 80),
          label: safeText(g.label || g.id, 120),
          peaks: normalizedPeaks(g.peaks).filter(nm => peaks.includes(nm)),
        }))
        .filter(g => g.id && g.peaks.length > 0)
    : null;
  const validGroupIds = channelGroups ? new Set(channelGroups.map(g => g.id)) : null;
  const modes = Array.isArray(spec.modes) && validGroupIds && validGroupIds.size > 0
    ? spec.modes
        .filter(m => m && typeof m.id === 'string' && Array.isArray(m.groups) && m.groups.length > 0)
        .map(m => ({
          id: safeText(m.id, 80),
          label: safeText(m.label || m.id, 120),
          groups: [...new Set(m.groups.filter(gid => validGroupIds.has(gid)))],
          ...(m.default === true ? { default: true } : {}),
        }))
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
    brand: safeText(spec.brand),
    model: safeText(spec.model),
    type: spec.type || 'combined',
    peakWavelengths: peaks,
    peakShares: Array.isArray(spec.peakShares) && spec.peakShares.length === peaks.length
      ? spec.peakShares.map(share => Math.max(0, Number(share) || 0))
      : null,
    peakShareBasis: spec.peakShareBasis || null,
    mwPerCm2At15cm: Number.isFinite(spec.mwPerCm2At15cm) ? spec.mwPerCm2At15cm : null,
    lux: Number.isFinite(spec.lux) ? spec.lux : null,
    recommendedDistanceCm: Number.isFinite(spec.recommendedDistanceCm) && spec.recommendedDistanceCm > 0 ? spec.recommendedDistanceCm : 15,
    irradianceByDistanceCm: Array.isArray(spec.irradianceByDistanceCm) ? spec.irradianceByDistanceCm : null,
    distanceModel: spec.distanceModel === 'point-source' ? 'point-source' : 'reference-only',
    melanopicDER: Number.isFinite(spec.melanopicDER) && spec.melanopicDER > 0 ? spec.melanopicDER : null,
    melanopicEdiLux: Number.isFinite(spec.melanopicEdiLux) && spec.melanopicEdiLux > 0 ? spec.melanopicEdiLux : null,
    melanopicBasis: spec.melanopicBasis || (Number.isFinite(spec.melanopicEdiLux) && spec.melanopicEdiLux > 0 ? 'user-entered' : null),
    irradianceBasis: spec.irradianceBasis || 'user-entered',
    specSourceUrl: spec.specSourceUrl || null,
    channels: channelsForDevice(spec.type || 'combined', peaks),
    channelGroups: channelGroups && channelGroups.length > 0 ? channelGroups : null,
    modes: modes && modes.length > 0 ? modes : null,
    coupling: coupling && coupling.length > 0 ? coupling : null,
    catalogSlug: null,
    notes: safeText(spec.notes || '', 2000),
    addedAt: now,
  };
  getDevices().push(device);
  await saveImportedData();
  return device;
}
