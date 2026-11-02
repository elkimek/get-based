// Disclosure-safe exact device/session reads and approval through shared owners.
import type { ProfileData } from '../types/app-state.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { parseAgentDataPatch } from '../shared/agent-data-contract.js';
import { state } from './state.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { commitLightEnvironmentWrite, queueLightEnvironmentWrite } from './light-env-record-store.js';
import { LIGHT_DEVICE_FIELDS, LIGHT_DEVICE_PAYLOAD_FIELDS, LIGHT_DEVICE_SPEC_FIELDS, isLightDeviceResource } from './light-device-fields.js';
import type { LightDeviceResource } from './light-device-fields.js';
import { parseLightDeviceSnapshot, validateLightDevicePatch } from './light-device-proposals.js';
import type { LightDeviceSnapshot, LightDevicePlan } from './light-device-proposals.js';
import * as mutations from './light-device-mutations.js';
import type { LightDeviceRecord, DeviceSessionRecord, CustomDeviceInput, DeviceSessionInput } from './light-device-mutations.js';
import { validateModeCoupling } from './sun-spectrum.js';
import { BODY_REGIONS } from './sun-body-regions.js';

const conflict = (): never => { throw Object.assign(new Error('This device, session, specification or history changed since review. Read it again. No change was applied.'), { noChangeApplied: true }); };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
function rows(data: ProfileData, resource: LightDeviceResource): Array<LightDeviceRecord | DeviceSessionRecord> {
  const value: unknown = resource === 'lightDevices' ? data.lightDevices : data.deviceSessions;
  if (value == null) return [];
  if (!Array.isArray(value) || value.some(row => !object(row) || typeof row.id !== 'string' || !row.id) || new Set(value.map(row => row.id)).size !== value.length) throw new Error('Review these older device/session identities in the normal editor.');
  return value;
}
function devicePublic(device: LightDeviceRecord | null | undefined): Record<string, unknown> | null {
  if (!device) return null;
  const result: Record<string, unknown> = { id: device.id };
  for (const key of ['brand', 'model', 'notes', ...LIGHT_DEVICE_SPEC_FIELDS]) {
    const value = device[key];
    if (['channelGroups', 'modes', 'coupling', 'irradianceByDistanceCm'].includes(key)) {
      if (value != null && !Array.isArray(value)) throw new Error('Review this older device model in its editor.');
      const fields = key === 'channelGroups' ? ['id', 'label', 'peaks'] : key === 'modes' ? ['id', 'label', 'groups', 'default'] : key === 'coupling' ? ['if', 'requires', 'reason'] : ['distanceCm', 'mwPerCm2'];
      result[key] = value == null ? null : value.map(entry => {
        if (!object(entry)) throw new Error('Review this older device model in its editor.');
        return Object.fromEntries(Object.entries(entry).filter(([field]) => fields.includes(field)).map(([field, member]) => {
          if (['peaks', 'groups', 'requires'].includes(field)) {
            if (!Array.isArray(member) || member.some(value => field === 'peaks' ? typeof value !== 'number' || !Number.isFinite(value) : typeof value !== 'string')) throw new Error('Review this older device group in its editor.');
            return [field, [...member]];
          }
          if (member != null && !['string', 'number', 'boolean'].includes(typeof member)) throw new Error('Review this older device field in its editor.');
          return [field, member];
        }));
      });
    } else if (value == null || typeof value === 'string' || typeof value === 'number' || Array.isArray(value) && value.every(item => typeof item === 'number')) result[key] = value ?? null;
    else throw new Error('Review this older device model in its editor.');
  }
  result.sourceRecorded = !!device.specSourceUrl;
  if (device.specHistory != null && !Array.isArray(device.specHistory)) throw new Error('Review the device specification history before editing.');
  result.previousSpecificationCount = Array.isArray(device.specHistory) ? device.specHistory.length : 0;
  return result;
}
function dosePublic(value: unknown): Record<string, number> | null {
  if (value == null) return null;
  if (!object(value)) throw new Error('Review the session calculation before editing.');
  return Object.fromEntries(Object.entries(value).filter(([key, value]) => ['vitamin_d', 'pomc', 'no_cv', 'violet_eye', 'circadian', 'nir_solar', 'pbm_red', 'pbm_nir'].includes(key) && typeof value === 'number' && Number.isFinite(value))) as Record<string, number>;
}
function publicRecord(data: ProfileData, resource: LightDeviceResource, id: string): Record<string, unknown> | null {
  const raw = rows(data, resource).find(row => row.id === id);
  if (!raw) return null;
  if (resource === 'lightDevices') return devicePublic(raw as LightDeviceRecord);
  const session = raw as DeviceSessionRecord;
  if (!Number.isFinite(session.startedAt) || session.endedAt != null && !Number.isFinite(session.endedAt) || session.editHistory != null && !Array.isArray(session.editHistory)) throw new Error('Review this older session and its source history in the normal editor.');
  if (session.bodyAreas != null && (!Array.isArray(session.bodyAreas) || session.bodyAreas.some(region => typeof region !== 'string')) || session.notes != null && typeof session.notes !== 'string') throw new Error('Review this older session in its editor.');
  return { id: session.id, deviceId: session.deviceId ?? null, startedAt: new Date(session.startedAt).toISOString(), endedAt: session.endedAt == null ? null : new Date(session.endedAt).toISOString(), active: !session.endedAt,
    durationMin: session.durationMin ?? null, distanceCm: session.distanceCm ?? null, bodyArea: session.bodyArea ?? null, bodyAreas: session.bodyAreas ?? null, eyesProtected: session.eyesProtected ?? null, mode: session.mode ?? null, notes: session.notes ?? '',
    doses: dosePublic(session.doses), safety: session.safety ? Object.fromEntries(Object.entries(session.safety).filter(([field, value]) => ['hasUV', 'erythemalSED', 'conservativeBaseMedFraction', 'ocularActinicUV', 'ocularUvaJPerM2', 'unsafeEyeExposure'].includes(field) && (value == null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)))) : null, calculationStatus: typeof session.calculationStatus === 'string' && ['computed', 'partial', 'unavailable', 'pending', 'device-unavailable', 'mode-unavailable', 'estimated', 'reference-only'].includes(session.calculationStatus) ? session.calculationStatus : 'unknown',
    device: devicePublic(data.lightDevices?.find(device => device.id === session.deviceId) || session.deviceSnapshot), previousEditCount: Array.isArray(session.editHistory) ? session.editHistory.length : 0 };
}
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : object(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
async function snapshot(data: ProfileData, resource: LightDeviceResource, id: string): Promise<LightDeviceSnapshot> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(Object.fromEntries(LIGHT_DEVICE_FIELDS.map(key => [key, data[key] ?? null]))))));
  return { version: 1, resource, id, record: publicRecord(data, resource, id), revision: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
}
function validateSpecification(input: Record<string, unknown>) {
  const peaks = Array.isArray(input.peakWavelengths) ? input.peakWavelengths : [];
  if (input.peakShares != null && (!Array.isArray(input.peakShares) || input.peakShares.length !== peaks.length || !input.peakShares.some(value => typeof value === 'number' && value > 0))) throw new Error('Pair each reported wavelength with a nonnegative radiant share and report at least one positive share.');
  const groups = Array.isArray(input.channelGroups) ? input.channelGroups as Array<{ id: string; peaks: number[] }> : [];
  if (new Set(groups.map(group => group.id)).size !== groups.length || groups.some(group => group.peaks.some(peak => !peaks.includes(peak)))) throw new Error('Device groups must have distinct IDs and use the reported wavelengths.');
  const modes = Array.isArray(input.modes) ? input.modes as Array<{ id: string; groups: string[]; default?: boolean }> : [];
  const ids = groups.map(group => group.id);
  if (new Set(modes.map(mode => mode.id)).size !== modes.length || modes.filter(mode => mode.default).length > 1 || modes.some(mode => mode.groups.some(group => !ids.includes(group)))) throw new Error('Device modes must name current groups and have at most one default.');
  if (Array.isArray(input.coupling) && input.coupling.some(rule => !object(rule) || !ids.includes(String(rule.if)) || !Array.isArray(rule.requires) || rule.requires.some(group => !ids.includes(group)))) throw new Error('Coupling rules must name current device groups.');
}
function compute(data: ProfileData, proposal: AgentDataProposal) {
  if (!isLightDeviceResource(proposal.resource)) throw new Error('Invalid light device resource.');
  const resource = proposal.resource, patch = parseAgentDataPatch(proposal.patch); validateLightDevicePatch(resource, proposal.operation, patch);
  const next = structuredClone(data), before = publicRecord(data, resource, proposal.recordId), operation = proposal.operation;
  if (operation === 'add' ? before !== null : before === null) conflict();
  const path = resource === 'lightDevices' ? 'lightDevices' : 'deviceSessions';
  if (operation !== 'remove' && data._deleted?.[path]?.includes(proposal.recordId)) throw new Error('That record identity was removed. Create a new record rather than reviving removed data.');
  let result: unknown;
  if (resource === 'lightDevices') {
    if (operation === 'remove') result = mutations.deleteDevice(next, proposal.recordId, proposal.recordedAt);
    else {
      const existing = (rows(next, 'lightDevices') as LightDeviceRecord[]).find(device => device.id === proposal.recordId); validateSpecification({ ...existing, ...patch });
      result = operation === 'add' ? mutations.addCustomDevice(next, patch as CustomDeviceInput, { now: proposal.recordedAt, id: proposal.recordId }) : mutations.updateDeviceRecord(next, proposal.recordId, patch as CustomDeviceInput, proposal.recordedAt);
      if (operation === 'add' && result) {
        const device = result as LightDeviceRecord;
        for (const [key, value] of Object.entries(patch)) if (value === null) device[key] = null;
        if (!Object.hasOwn(patch, 'type')) device.type = null;
        if (!Object.hasOwn(patch, 'recommendedDistanceCm')) device.recommendedDistanceCm = null;
        if (!Object.hasOwn(patch, 'irradianceBasis')) device.irradianceBasis = patch.mwPerCm2At15cm == null ? 'unknown' : 'user-entered';
      }
    }
  } else {
    const existing = (rows(next, 'lightDeviceSessions') as DeviceSessionRecord[]).find(session => session.id === proposal.recordId);
    if (existing && !existing.endedAt) throw new Error('This timer is active. Use its existing live-session controls before changing a completed-session record.');
    if (operation === 'remove') result = mutations.deleteDeviceSession(next, proposal.recordId);
    else {
      const device = (rows(next, 'lightDevices') as LightDeviceRecord[]).find(device => device.id === (existing?.deviceId || patch.deviceId)) || existing?.deviceSnapshot;
      if (!device) throw new Error('Read an available device before recording this session.');
      const mode = patch.mode === undefined ? existing?.mode : patch.mode;
      if (Array.isArray(device.modes) && device.modes.length && (typeof mode !== 'string' || !device.modes.some(value => value.id === mode) || !validateModeCoupling(device, mode).ok)) throw new Error('Choose the exact reported valid device mode; no default will be inferred.');
      if ((!device.modes || !device.modes.length) && mode != null) throw new Error('This device has no declared mode identities.');
      if (Array.isArray(patch.bodyAreas) && patch.bodyAreas.some(region => !BODY_REGIONS.some(candidate => candidate.key === region))) throw new Error('Choose exact supported body-region keys.');
      const normalized: Record<string, unknown> = { ...patch, ...(typeof patch.startedAt === 'string' ? { startedAt: Date.parse(patch.startedAt) } : {}) };
      if (operation === 'add' || 'startedAt' in normalized || 'durationMin' in normalized) {
        const start = normalized.startedAt ?? existing?.startedAt, duration = normalized.durationMin ?? existing?.durationMin;
        if (typeof start !== 'number' || !Number.isFinite(start) || start < 0 || typeof duration !== 'number' || !Number.isFinite(duration) || start + duration * 60000 > proposal.recordedAt) throw new Error('A completed session cannot end in the future. Report the actual start time and duration.');
      }
      if (operation === 'add') {
        const start = normalized.startedAt as number, duration = normalized.durationMin as number, end = start + duration * 60000;
        result = mutations.logDeviceSession(next, normalized as DeviceSessionInput, { now: end, id: proposal.recordId });
      } else result = mutations.updateDeviceSession(next, proposal.recordId, normalized, { now: proposal.recordedAt });
    }
  }
  if (result === false || result === null) throw new Error('This device/session cannot be changed while a related timer or unsupported source state remains active.');
  const sessions = rows(next, 'lightDeviceSessions') as DeviceSessionRecord[];
  const recalculatedSessions = sessions.flatMap(session => {
    const prior = data.deviceSessions?.find(row => row.id === session.id);
    if (!prior || profileDataValuesEqual(prior.doses, session.doses) && prior.endedAt === session.endedAt && prior.calculationStatus === session.calculationStatus) return [];
    return [{ id: session.id, beforeDoses: dosePublic(prior.doses), afterDoses: dosePublic(session.doses), beforeEndedAt: prior.endedAt == null ? null : new Date(prior.endedAt).toISOString(), afterEndedAt: session.endedAt == null ? null : new Date(session.endedAt).toISOString() }];
  });
  const plan: LightDevicePlan = { after: publicRecord(next, resource, proposal.recordId), effects: { recalculatedSessions,
    retainedSessionCount: resource === 'lightDevices' && operation === 'remove' ? sessions.filter(session => session.deviceId === proposal.recordId).length : 0,
    removedSpecificationCount: resource === 'lightDevices' && operation === 'remove' ? Number(before?.previousSpecificationCount || 0) : 0,
    sourceHistoryRetained: operation === 'update', analysisCleared: sessions.some(session => !!data.deviceSessions?.find(row => row.id === session.id)?.aiAnalysis && !session.aiAnalysis) } };
  return { next, plan };
}
export async function readCurrentLightDeviceRecord(profileId: string, resource: LightDeviceResource, id: string, create = false) {
  const result = await snapshot(await readAgentProfileRecords(profileId), resource, id); return result.record || create ? result : null;
}
export async function listCurrentLightDeviceRecords(profileId: string, resource: LightDeviceResource) {
  const data = await readAgentProfileRecords(profileId); return rows(data, resource).map(row => publicRecord(data, resource, row.id)!);
}
export function lightDeviceRecordChoices() { return { bodyRegions: BODY_REGIONS.map(region => ({ key: region.key, label: region.label })) }; }
export async function prepareReviewedLightDeviceRecord(profileId: string, proposal: AgentDataProposal) {
  const expected = parseLightDeviceSnapshot(proposal), data = await readAgentProfileRecords(profileId);
  if (!profileDataValuesEqual(expected, await snapshot(data, expected.resource, expected.id))) conflict();
  proposal.baseline = JSON.stringify({ ...expected, plan: compute(data, proposal).plan });
}
export function commitReviewedLightDeviceRecord(profileId: string, proposal: AgentDataProposal, authorized: () => boolean) {
  return queueLightEnvironmentWrite(profileId, async () => {
    const denied = (): never => { throw Object.assign(new Error('Light context or profile authorization changed. No change was applied.'), { noChangeApplied: true }); };
    if (!authorized()) denied();
    const expected = parseLightDeviceSnapshot(proposal), data = await readAgentProfileRecords(profileId), { plan: _plan, ...read } = expected;
    if (!profileDataValuesEqual(read, await snapshot(data, expected.resource, expected.id))) conflict();
    const { next, plan } = compute(data, proposal); if (!profileDataValuesEqual(plan, expected.plan)) conflict();
    const observed = state.importedData; if (!authorized()) denied();
    if (!LIGHT_DEVICE_FIELDS.every(key => profileDataValuesEqual(observed[key] ?? null, data[key] ?? null))) conflict();
    const result = await commitLightEnvironmentWrite(profileId, observed, data, structuredClone(observed), next, authorized, LIGHT_DEVICE_FIELDS, LIGHT_DEVICE_PAYLOAD_FIELDS);
    if (!result.saved) { if (!authorized()) denied(); if (result.conflict) conflict(); throw new Error('Could not save the light device/session. Try Apply again.'); }
    return `${expected.resource === 'lightDevices' ? 'Light device' : 'Light device session'} updated (${proposal.operation}).`;
  });
}
