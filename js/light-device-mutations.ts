import type { ProfileData } from '../types/app-state.js';
// Pure portable device/session commands shared by ordinary storage and chat.
//
// UI modules own preset loading, dialogs, rendering, and notifications. This
// module owns importedData.lightDevices[] / deviceSessions[] writes, dose
// recompute, sync freshness stamps before staged persistence.

import type { DeviceModel } from './light-device-session-engine.js';
import { deleteImportedArrayItem } from './data-merge.js';
import {
  DEVICE_ENGINE_VERSION,
  computeDeviceSessionDoses,
  deviceEmitsUV,
  resolveDeviceMode,
} from './light-device-session-engine.js';
import { createUniqueId } from './unique-id.js';
import { LIGHT_DEVICE_SPEC_FIELDS } from './light-device-fields.js';
import { validateModeCoupling } from './sun-spectrum.js';
import { BODY_REGIONS } from './sun-body-silhouette.js';

type ComputedDeviceSession = ReturnType<typeof computeDeviceSessionDoses>;
export interface LightDeviceRecord extends DeviceModel {
  type?: string | null | undefined;
  id: string; presetId?: string | null; brand?: string; model?: string; notes?: string;
  channels?: string[] | null; catalogSlug?: string | null; specSourceUrl?: string | null;
  channelGroups?: Array<NonNullable<DeviceModel['channelGroups']>[number] & { label?: string }> | null | undefined;
  modes?: Array<NonNullable<DeviceModel['modes']>[number] & { label?: string }> | null | undefined;
  addedAt?: number; updatedAt?: number; specEditedAt?: number;
  lastSession?: Pick<DeviceSessionRecord, 'durationMin' | 'distanceCm' | 'bodyArea' | 'bodyAreas' | 'eyesProtected' | 'mode'>;
  [key: string]: unknown;
}
export interface DeviceSessionRecord {
  id: string; deviceId?: string | undefined; startedAt: number; endedAt?: number | null;
  durationMin?: number | undefined; distanceCm?: number | undefined; bodyArea?: string | undefined; bodyAreas?: string[] | null | undefined;
  eyesProtected?: boolean | undefined; fitzpatrick?: string | null; mode?: string | null | undefined;
  deviceSnapshot?: LightDeviceRecord | null; notes?: string; updatedAt?: number;
  doses?: ComputedDeviceSession['doses'] | null; safety?: ComputedDeviceSession['safety'] | null;
  metrics?: ComputedDeviceSession['metrics'] | null;
  calculation?: Partial<ComputedDeviceSession['model']>; calculationStatus?: string;
  distanceModel?: string; engineVersion?: number; aiAnalysis?: unknown;
  [key: string]: unknown;
}
export interface DeviceSessionInput {
  deviceId?: string; durationMin?: number; distanceCm?: number; bodyArea?: string;
  bodyAreas?: string[] | null; eyesProtected?: boolean; notes?: string; mode?: string | null;
}
export type CustomDeviceInput = Partial<Pick<LightDeviceRecord,
  'brand' | 'model' | 'type' | 'peakWavelengths' | 'peakShares' | 'peakShareBasis'
  | 'irradianceByDistanceCm' | 'distanceModel' | 'melanopicBasis' | 'irradianceBasis'
  | 'specSourceUrl' | 'notes' | 'channelGroups' | 'modes' | 'coupling'>> & {
  mwPerCm2At15cm?: unknown; lux?: unknown; recommendedDistanceCm?: unknown;
  melanopicDER?: unknown; melanopicEdiLux?: unknown;
};

const MAX_DEVICE_SESSION_MIN = 600;
const VALID_BODY_REGIONS = new Set(BODY_REGIONS.map(region => region.key));
const VALID_BROAD_AREAS = new Set(['targeted', 'face', 'torso', 'arms', 'legs', 'whole-body']);

function safeText(value: unknown, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizedPeaks(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .map(Number)
    .filter(nm => Number.isFinite(nm) && nm >= 180 && nm <= 2500))]
    .sort((a, b) => a - b);
}

function channelsForDevice(type: unknown, peaks: number[]) {
  const channels = new Set<string>();
  const has = (min: number, max: number) => peaks.some(nm => nm >= min && nm < max);
  if (has(280, 320)) channels.add('vitamin_d');
  if (has(280, 400)) channels.add('pomc');
  if (has(315, 410)) channels.add('no_cv');
  if (has(600, 700)) channels.add('pbm_red');
  if (has(700, 1100)) channels.add('pbm_nir');
  if (['sad', 'dawn-sim', 'full-spectrum'].includes(type as string)) {
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

function normalizedBodyAreas(bodyAreas: unknown): string[] | null {
  if (!Array.isArray(bodyAreas)) return null;
  return [...new Set(bodyAreas.filter(key => VALID_BODY_REGIONS.has(key)))];
}

function validDuration(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= MAX_DEVICE_SESSION_MIN ? number : null;
}

function validDistance(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 && number <= 1000 ? number : null;
}

function cloneValue<T>(value: T): T {
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

export function deviceSnapshot(device: LightDeviceRecord | null | undefined) {
  if (!device) return null;
  const snapshot: LightDeviceRecord = {
    id: device.id,
    brand: device.brand || '',
    model: device.model || '',
    notes: device.notes || '',
  };
  for (const field of DEVICE_MODEL_FIELDS) snapshot[field] = cloneValue(device[field] ?? null);
  return snapshot;
}

function sessionDevice(data: ProfileData, sess: DeviceSessionRecord) {
  return getDevices(data).find(device => device.id === sess?.deviceId)
    || sess?.deviceSnapshot
    || null;
}

function computeRecordedSessionDoses(device: LightDeviceRecord, sess: DeviceSessionRecord, durationMin: number | undefined) {
  return computeDeviceSessionDoses({
    device,
    durationMin,
    distanceCm: sess.distanceCm,
    bodyArea: sess.bodyArea,
    bodyAreas: sess.bodyAreas,
    eyesProtected: sess.eyesProtected,
    mode: sess.mode,
  });
}

function applyComputedSessionFields(sess: DeviceSessionRecord, computed: ComputedDeviceSession) {
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

export function getDevices(data: ProfileData): LightDeviceRecord[] {
  if (!data) return [];
  if (!Array.isArray(data.lightDevices)) data.lightDevices = [];
  return data.lightDevices;
}

export function getDeviceSessions(data: Pick<ProfileData, 'deviceSessions'>): DeviceSessionRecord[] {
  if (!data) return [];
  if (!Array.isArray(data.deviceSessions)) data.deviceSessions = [];
  return data.deviceSessions;
}

export function addDeviceFromPresetRecord(data: ProfileData, preset: LightDeviceRecord | null | undefined, overrides: Partial<LightDeviceRecord> = {}, { now = Date.now(), id = createUniqueId('dev_') } = {}) {
  if (!preset) return null;
  const device: LightDeviceRecord = {
    id,
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
  getDevices(data).push(device);
  return device;
}

export function hydrateDevicesFromPresetRecords(data: ProfileData, presets: readonly LightDeviceRecord[] | null | undefined, now = Date.now()) {
  if (!Array.isArray(presets) || presets.length === 0) return false;
  if (!data) return false;
  const devices: LightDeviceRecord[] = Array.isArray(data.lightDevices) ? data.lightDevices : [];
  let dirty = false;
  for (const dev of devices) {
    if (!dev || !dev.presetId) continue;
    const preset = presets.find(p => p.id === dev.presetId);
    if (!preset) continue;
    // Preset records are curated model inputs. Keep existing devices current
    // when those inputs are corrected, unless a future/device editor marks
    // the user's copy as explicitly customized.
    if (!dev.specEditedAt) {
      let changed = false;
      for (const field of DEVICE_MODEL_FIELDS) {
        const next = field === 'distanceModel'
          ? (preset[field] || 'reference-only')
          : cloneValue(preset[field] ?? null);
        const hasField = Object.prototype.hasOwnProperty.call(dev, field);
        if (hasField && JSON.stringify(dev[field] ?? null) === JSON.stringify(next)) continue;
        dev[field] = next;
        dirty = true; changed = true;
      }
      if (changed) dev.updatedAt = Math.max(now, (dev.updatedAt || 0) + 1);
    }
  }
  return dirty;
}

export function deleteDevice(data: ProfileData, id: string, now = Date.now()) {
  const devs = getDevices(data);
  const idx = devs.findIndex(d => d.id === id);
  if (idx < 0) return false;
  if (getDeviceSessions(data).some(session => session.deviceId === id && !session.endedAt)) return false;
  const device = devs[idx];
  for (const session of getDeviceSessions(data)) {
    if (session.deviceId === id && !session.deviceSnapshot) { session.deviceSnapshot = deviceSnapshot(device); session.updatedAt = Math.max(now, (session.updatedAt || 0) + 1); }
  }
  deleteImportedArrayItem(data, 'lightDevices', idx);
  return true;
}

export function logDeviceSession(data: ProfileData, { deviceId, durationMin = 0, distanceCm = 15, bodyArea = 'torso', bodyAreas = null, eyesProtected = true, notes = '', mode = null }: DeviceSessionInput = {}, { now = Date.now(), id = createUniqueId('devsess_') } = {}) {
  const device = getDevices(data).find(d => d.id === deviceId);
  if (!device) return null;
  const safeDuration = validDuration(durationMin);
  const safeDistance = validDistance(distanceCm);
  const safeBodyAreas = normalizedBodyAreas(bodyAreas);
  if (safeDuration == null || safeDistance == null) return null;
  if (Array.isArray(bodyAreas) && (!safeBodyAreas || safeBodyAreas.length === 0)) return null;
  const safeBodyArea = VALID_BROAD_AREAS.has(bodyArea) ? bodyArea : 'targeted';
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

  const session: DeviceSessionRecord = {
    id,
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
    fitzpatrick: data?.sunDefaults?.fitzpatrick || null,
    mode: computed.mode,
    deviceSnapshot: deviceSnapshot(device),
    notes: String(notes || '').slice(0, 2000),
  };
  applyComputedSessionFields(session, computed);
  getDeviceSessions(data).push(session);
  // Remember user params for the next log dialog. Notes intentionally stay
  // per-session and are not carried forward.
  device.lastSession = { durationMin: safeDuration, distanceCm: safeDistance, bodyArea: safeBodyArea, bodyAreas: session.bodyAreas, eyesProtected: !!eyesProtected, mode: computed.mode };
  device.updatedAt = now;
  return session;
}

export function getActiveDeviceSession(data: ProfileData) {
  return getDeviceSessions(data).find(s => !s.endedAt) || null;
}

export function startDeviceSession(data: ProfileData, { deviceId, distanceCm = 15, bodyAreas = null, bodyArea = 'torso', eyesProtected = true, mode = null }: Omit<DeviceSessionInput, 'durationMin' | 'notes'> = {}, { now = Date.now(), id = createUniqueId('devsess_') } = {}) {
  // Reject a second active timer - one session at a time keeps the
  // active-card UI unambiguous and matches sun-session semantics.
  if (getActiveDeviceSession(data)) return null;
  const device = getDevices(data).find(d => d.id === deviceId);
  if (!device) return null;
  const safeDistance = validDistance(distanceCm);
  const safeBodyAreas = normalizedBodyAreas(bodyAreas);
  if (safeDistance == null) return null;
  if (Array.isArray(bodyAreas) && (!safeBodyAreas || safeBodyAreas.length === 0)) return null;
  const safeBodyArea = VALID_BROAD_AREAS.has(bodyArea) ? bodyArea : 'targeted';
  const resolvedMode = resolveDeviceMode(device, mode);
  // Enforce this below the modal too so programmatic callers cannot start a
  // UV-emitting timer while recording unprotected eyes.
  if (deviceEmitsUV(device, resolvedMode) && !eyesProtected) return null;
  const sess: DeviceSessionRecord = {
    id,
    deviceId,
    startedAt: now,
    endedAt: null,
    durationMin: 0,
    distanceCm: safeDistance,
    bodyArea: safeBodyArea,
    bodyAreas: safeBodyAreas,
    eyesProtected: !!eyesProtected,
    fitzpatrick: data?.sunDefaults?.fitzpatrick || null,
    mode: resolvedMode,
    deviceSnapshot: deviceSnapshot(device),
    doses: {},
    calculationStatus: 'pending',
    notes: '',
  };
  getDeviceSessions(data).push(sess);
  return id;
}

export function stopDeviceSession(data: ProfileData, id?: string | null, { now = Date.now() } = {}) {
  const sessions = getDeviceSessions(data);
  const sess = id ? sessions.find(s => s.id === id) : getActiveDeviceSession(data);
  if (!sess || sess.endedAt) return null;
  const endedAt = now;
  const durationMin = Math.max(0, (endedAt - sess.startedAt) / 60000);
  const liveDevice = getDevices(data).find(device => device.id === sess.deviceId) || null;
  const device = liveDevice || sess.deviceSnapshot || null;
  if (device) {
    const computed = computeRecordedSessionDoses(device, sess, durationMin);
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
    liveDevice.updatedAt = now;
  }
  return sess;
}

export function updateDeviceSession(data: ProfileData, id: string, patch: Record<string, unknown> = {}, { now = Date.now() } = {}) {
  const sessions = getDeviceSessions(data);
  const sess = sessions.find(s => s.id === id);
  if (!sess) return null;
  if (sess.editHistory != null && !Array.isArray(sess.editHistory)) return null;
  const original = structuredClone(sess);
  const editable = ['startedAt', 'durationMin', 'distanceCm', 'bodyArea', 'bodyAreas', 'eyesProtected', 'notes', 'mode'];
  const normalizedPatch: Record<string, unknown> = { ...patch };
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
    if (normalizedPatch.bodyAreas !== null && (!areas || areas.length === 0)) return null;
    normalizedPatch.bodyAreas = areas;
  }
  if ('bodyArea' in normalizedPatch && !VALID_BROAD_AREAS.has(normalizedPatch.bodyArea as string)) normalizedPatch.bodyArea = 'targeted';
  if ('eyesProtected' in normalizedPatch) normalizedPatch.eyesProtected = !!normalizedPatch.eyesProtected;
  if ('notes' in normalizedPatch) normalizedPatch.notes = String(normalizedPatch.notes || '').slice(0, 2000);
  if ('startedAt' in normalizedPatch && (typeof normalizedPatch.startedAt !== 'number' || !Number.isSafeInteger(normalizedPatch.startedAt) || normalizedPatch.startedAt < 0)) return null;
  let needsRecompute = false;
  for (const k of editable) {
    if (k in normalizedPatch && normalizedPatch[k] !== sess[k]) {
      // Array deep-compare for bodyAreas - patch comes in as a fresh array;
      // detect content change, not just identity.
      if (k === 'bodyAreas') {
        const before = JSON.stringify((sess.bodyAreas || []).slice().sort());
        const after = JSON.stringify(((normalizedPatch.bodyAreas || []) as string[]).slice().sort());
        if (before === after) continue;
      }
      // mode patches go through coupling validation; bad input falls back to
      // the device default instead of persisting.
      if (k === 'mode') {
        const device = sessionDevice(data, sess);
        if (device && Array.isArray(device.modes) && device.modes.length > 0) {
          const next = resolveDeviceMode(device, normalizedPatch.mode as string | null | undefined);
          if (next === sess.mode) continue;
          sess.mode = next;
          needsRecompute = true;
          continue;
        }
      }
      sess[k] = normalizedPatch[k];
      if (['startedAt', 'durationMin', 'distanceCm', 'bodyArea', 'bodyAreas', 'eyesProtected', 'mode'].includes(k)) needsRecompute = true;
    }
  }
  // Re-derive endedAt + dose if duration changed so stored duration and
  // channel doses cannot drift.
  if (needsRecompute && sess.endedAt && Number.isFinite(sess.durationMin)) {
    sess.endedAt = sess.startedAt + sess.durationMin! * 60 * 1000;
    const liveDevice = getDevices(data).find(device => device.id === sess.deviceId) || null;
    if (liveDevice) sess.deviceSnapshot = deviceSnapshot(liveDevice);
    const device = liveDevice || sess.deviceSnapshot || null;
    if (device) {
      const computed = computeRecordedSessionDoses(device, sess, sess.durationMin);
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
  if (JSON.stringify(original) !== JSON.stringify(sess)) { retainSessionChange(sess, original, now); delete sess.aiAnalysis; }
  sess.updatedAt = Math.max(now, (original.updatedAt || 0) + 1);
  return sess;
}

export function deleteDeviceSession(data: ProfileData, id: string) {
  const sessions = getDeviceSessions(data);
  const idx = sessions.findIndex(s => s.id === id);
  if (idx < 0) return false;
  deleteImportedArrayItem(data, 'deviceSessions', idx);
  return true;
}

export function rollingDeviceTotals(data: ProfileData, days = 7, now = Date.now()) {
  const cutoff = now - days * 86400 * 1000;
  const totals: Record<string, number> = {};
  for (const sess of getDeviceSessions(data)) {
    if (!sess.doses || (sess.endedAt && sess.endedAt < cutoff)) continue;
    for (const [k, v] of Object.entries(sess.doses)) {
      totals[k] = (totals[k] || 0) + (Number.isFinite(v) ? v : 0);
    }
  }
  return totals;
}

export function rehydrateStaleDeviceSessions(data: ProfileData) {
  let rehydrated = 0;
  for (const sess of getDeviceSessions(data)) {
    if (!sess?.endedAt || (sess.engineVersion ?? 0) >= DEVICE_ENGINE_VERSION) continue;
    if (sess.editHistory != null && !Array.isArray(sess.editHistory)) continue;
    const original = structuredClone(sess);
    const liveDevice = getDevices(data).find(candidate => candidate.id === sess.deviceId);
    // A stale session is being recomputed against the current corrected model;
    // keep its saved inputs in sync so later device removal cannot resurrect
    // the older, invalid spectrum.
    if (liveDevice) sess.deviceSnapshot = deviceSnapshot(liveDevice);
    const device = liveDevice || sess.deviceSnapshot;
    if (!device) continue;
    if (!sess.fitzpatrick) sess.fitzpatrick = data?.sunDefaults?.fitzpatrick || null;
    const computed = computeRecordedSessionDoses(device, sess, sess.durationMin || 0);
    applyComputedSessionFields(sess, computed);
    retainSessionChange(sess, original, Date.now());
    sess.updatedAt = Math.max(Date.now(), (sess.updatedAt || 0) + 1);
    rehydrated++;
  }
  return { rehydrated, engineVersion: DEVICE_ENGINE_VERSION };
}

export function addCustomDevice(data: ProfileData, spec: CustomDeviceInput | null | undefined, { now = Date.now(), id = createUniqueId('dev_') } = {}) {
  if (!spec || !safeText(spec.brand) || !safeText(spec.model)) return null;
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
          groups: [...new Set(m.groups!.filter(gid => validGroupIds.has(gid)))],
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
  const device: LightDeviceRecord = {
    id,
    presetId: null,
    brand: safeText(spec.brand),
    model: safeText(spec.model),
    type: spec.type || 'combined',
    peakWavelengths: peaks,
    peakShares: Array.isArray(spec.peakShares) && Array.isArray(spec.peakWavelengths) && spec.peakShares.length === spec.peakWavelengths.length && peaks.length === spec.peakWavelengths.length
      ? peaks.map(peak => Math.max(0, Number(spec.peakShares![spec.peakWavelengths!.indexOf(peak)]) || 0))
      : null,
    peakShareBasis: spec.peakShareBasis || null,
    mwPerCm2At15cm: Number.isFinite(spec.mwPerCm2At15cm) ? spec.mwPerCm2At15cm as number : null,
    lux: Number.isFinite(spec.lux) ? spec.lux as number : null,
    recommendedDistanceCm: Number.isFinite(spec.recommendedDistanceCm) && (spec.recommendedDistanceCm as number) > 0 ? spec.recommendedDistanceCm as number : 15,
    irradianceByDistanceCm: Array.isArray(spec.irradianceByDistanceCm) ? spec.irradianceByDistanceCm : null,
    distanceModel: spec.distanceModel === 'point-source' ? 'point-source' : 'reference-only',
    melanopicDER: Number.isFinite(spec.melanopicDER) && (spec.melanopicDER as number) > 0 ? spec.melanopicDER as number : null,
    melanopicEdiLux: Number.isFinite(spec.melanopicEdiLux) && (spec.melanopicEdiLux as number) > 0 ? spec.melanopicEdiLux as number : null,
    melanopicBasis: spec.melanopicBasis || (Number.isFinite(spec.melanopicEdiLux) && (spec.melanopicEdiLux as number) > 0 ? 'user-entered' : null),
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
  getDevices(data).push(device);
  return device;
}

function retainSessionChange(session: DeviceSessionRecord, before: DeviceSessionRecord, at: number) {
  const { editHistory: _history, ...record } = before;
  session.editHistory = [...(Array.isArray(session.editHistory) ? session.editHistory : []), { at, record }];
}
export function updateDeviceRecord(data: ProfileData, id: string, patch: CustomDeviceInput, now = Date.now()) {
  const device = getDevices(data).find(row => row.id === id);
  if (!device || device.specHistory != null && !Array.isArray(device.specHistory)) return null;
  const modeled = LIGHT_DEVICE_SPEC_FIELDS.some(field => Object.hasOwn(patch, field));
  const sessions = getDeviceSessions(data).filter(session => session.deviceId === id);
  if (modeled && sessions.some(session => !session.endedAt || session.editHistory != null && !Array.isArray(session.editHistory))) return null;
  const before = structuredClone(device), input = { ...device, ...patch };
  if (Object.hasOwn(patch, 'peakWavelengths') && !Object.hasOwn(patch, 'peakShares')) {
    const known = Array.isArray(before.peakWavelengths) && Array.isArray(before.peakShares) && before.peakWavelengths.length === before.peakShares.length;
    input.peakShares = known && Array.isArray(patch.peakWavelengths) && patch.peakWavelengths.every(peak => before.peakWavelengths!.includes(peak))
      ? patch.peakWavelengths.map(peak => before.peakShares![before.peakWavelengths!.indexOf(peak)]!) : null;
    if (input.peakShares === null && !Object.hasOwn(patch, 'peakShareBasis')) input.peakShareBasis = null;
  }
  const temporary = addCustomDevice(data, input, { now, id: '__device-command-preview__' });
  if (!temporary) return null;
  getDevices(data).pop();
  const allowed = ['brand', 'model', 'notes', 'specSourceUrl', ...LIGHT_DEVICE_SPEC_FIELDS];
  for (const key of allowed) if (Object.hasOwn(patch, key)) device[key] = patch[key as keyof CustomDeviceInput] === null ? null : temporary[key];
  if (Object.hasOwn(patch, 'peakWavelengths') || Object.hasOwn(patch, 'type')) device.channels = temporary.channels ?? null;
  if (Object.hasOwn(patch, 'peakWavelengths') || Object.hasOwn(patch, 'peakShares')) { device.peakShares = temporary.peakShares ?? null; if (input.peakShares === null && !Object.hasOwn(patch, 'peakShareBasis')) device.peakShareBasis = null; }
  if (allowed.every(key => JSON.stringify(before[key] ?? null) === JSON.stringify(device[key] ?? null))) return device;
  if (modeled) device.specEditedAt = now;
  device.updatedAt = Math.max(now, (device.updatedAt || 0) + 1);
  const { specHistory: _history, ...record } = before;
  device.specHistory = [...(Array.isArray(before.specHistory) ? before.specHistory : []), { at: now, record }];
  if (modeled) for (const session of sessions) {
    const original = structuredClone(session);
    session.deviceSnapshot = deviceSnapshot(device);
    if (Array.isArray(device.modes) && device.modes.length && (!device.modes.some(mode => mode.id === session.mode) || !validateModeCoupling(device, session.mode || '').ok)) {
      session.doses = null; session.safety = null; session.metrics = null;
      session.calculation = { status: 'mode-unavailable', warnings: ['The recorded mode is unavailable under the corrected device specification.'] };
      session.calculationStatus = 'mode-unavailable'; delete session.aiAnalysis;
    } else applyComputedSessionFields(session, computeRecordedSessionDoses(device, session, session.durationMin));
    retainSessionChange(session, original, now); session.updatedAt = Math.max(now, (session.updatedAt || 0) + 1);
  }
  return device;
}
