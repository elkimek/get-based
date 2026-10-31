// Pure schemas/review projection; device physics and storage load on demand.
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { agentDataObject, parseAgentDataPatch, validAgentDate, validateFieldNames } from '../shared/agent-data-contract.js';
import { isLightDeviceResource, lightDeviceFields, lightDeviceSessionFields, LIGHT_DEVICE_TYPES } from './light-device-fields.js';
import type { LightDeviceResource } from './light-device-fields.js';

export function lightDeviceCapabilities(resource: LightDeviceResource) {
  return { operations: ['add', 'update', 'remove'], fields: resource === 'lightDevices' ? lightDeviceFields : lightDeviceSessionFields, rules: { identity: 'List exact saved IDs. Adds need reported custom device brand/model or complete session facts. Read the device before selecting a session mode. Device specification changes recalculate linked completed sessions and retain previous inputs. Device removal retains recorded sessions/snapshots and is blocked by active timers. Live timers use their existing controls. Do not infer session time, distance, body area, eye protection or device specifications.' } };
}

export interface LightDeviceEffects {
  recalculatedSessions: Array<{ id: string; beforeDoses: unknown; afterDoses: unknown; beforeEndedAt: unknown; afterEndedAt: unknown }>;
  retainedSessionCount: number; removedSpecificationCount: number; sourceHistoryRetained: boolean; analysisCleared: boolean;
}
export interface LightDevicePlan { after: Record<string, unknown> | null; effects: LightDeviceEffects; }
export interface LightDeviceSnapshot { version: 1; resource: LightDeviceResource; id: string; record: Record<string, unknown> | null; revision: string; plan?: LightDevicePlan; }
export function parseLightDeviceSnapshot(proposal: AgentDataProposal): LightDeviceSnapshot {
  const value = agentDataObject(JSON.parse(proposal.baseline));
  if (!isLightDeviceResource(proposal.resource) || value.version !== 1 || value.resource !== proposal.resource || value.id !== proposal.recordId || typeof value.revision !== 'string' || !/^[a-f0-9]{64}$/.test(value.revision)
    || value.record !== null && (!value.record || typeof value.record !== 'object' || Array.isArray(value.record))) throw new Error('Read this device or session again before proposing a change.');
  return value as unknown as LightDeviceSnapshot;
}
const array = (value: unknown, label: string): unknown[] => { if (!Array.isArray(value) || value.length > 50) throw new Error(`Supply at most 50 ${label}.`); return value; };
const number = (value: unknown, label: string, min: number, max = Number.MAX_VALUE) => { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`Supply ${label} as a finite number from ${min} to ${max}.`); };
export function validateLightDevicePatch(resource: LightDeviceResource, operation: string, patch: Record<string, unknown>) {
  if (!['add', 'update', 'remove'].includes(operation)) throw new Error('Unsupported light device operation.');
  validateFieldNames(patch, operation === 'remove' ? [] : Object.keys(resource === 'lightDevices' ? lightDeviceFields : lightDeviceSessionFields));
  if (operation === 'remove') return;
  if (!Object.keys(patch).length) throw new Error('Supply at least one reported field.');
  if (resource === 'lightDevices') {
    if (operation === 'add' && (!patch.brand || !patch.model)) throw new Error('A custom device needs its reported brand and model.');
    for (const key of ['brand', 'model', 'notes', 'peakShareBasis', 'melanopicBasis', 'irradianceBasis']) if (key in patch && !(patch[key] === null && key.endsWith('Basis'))) {
      const value = patch[key], max = key === 'notes' ? 2000 : 120;
      if (typeof value !== 'string' || value.length > max || key !== 'notes' && !value.trim()) throw new Error(`Supply valid ${key}.`);
    }
    if ('type' in patch && patch.type !== null && !LIGHT_DEVICE_TYPES.includes(patch.type as typeof LIGHT_DEVICE_TYPES[number])) throw new Error('Choose a supported light device type.');
    if ('distanceModel' in patch && !['reference-only', 'point-source'].includes(String(patch.distanceModel))) throw new Error('Choose an explicit distance model.');
    for (const key of ['mwPerCm2At15cm', 'lux', 'recommendedDistanceCm', 'melanopicDER', 'melanopicEdiLux']) if (key in patch && patch[key] !== null) number(patch[key], key, key === 'recommendedDistanceCm' ? 1 : key.startsWith('melanopic') ? Number.MIN_VALUE : 0, key === 'recommendedDistanceCm' ? 1000 : Number.MAX_VALUE);
    if ('specSourceUrl' in patch && patch.specSourceUrl !== null) { if (typeof patch.specSourceUrl !== 'string' || patch.specSourceUrl.length > 2000) throw new Error('Supply a source URL or null.'); const url = new URL(patch.specSourceUrl); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP(S) source link without credentials.'); }
    if ('peakWavelengths' in patch) { const values = array(patch.peakWavelengths, 'wavelengths'); values.forEach(value => number(value, 'wavelength nm', 180, 2500)); if (new Set(values).size !== values.length) throw new Error('Report each wavelength once.'); }
    if ('peakShares' in patch && patch.peakShares !== null) array(patch.peakShares, 'wavelength shares').forEach(value => number(value, 'radiant share', 0));
    if ('irradianceByDistanceCm' in patch && patch.irradianceByDistanceCm !== null) for (const entry of array(patch.irradianceByDistanceCm, 'distance measurements')) {
      const row = agentDataObject(entry); validateFieldNames(row, ['distanceCm', 'mwPerCm2']); number(row.distanceCm, 'distance cm', 1, 1000); number(row.mwPerCm2, 'irradiance mW/cm²', 0);
    }
    for (const key of ['channelGroups', 'modes', 'coupling']) if (key in patch && patch[key] !== null) for (const entry of array(patch[key], key)) {
      const row = agentDataObject(entry), allowed = key === 'channelGroups' ? ['id', 'label', 'peaks'] : key === 'modes' ? ['id', 'label', 'groups', 'default'] : ['if', 'requires', 'reason'];
      validateFieldNames(row, allowed);
      for (const name of key === 'coupling' ? ['if'] : ['id']) if (typeof row[name] !== 'string' || !/^[A-Za-z0-9_.-]{1,80}$/.test(row[name] as string)) throw new Error('Supply stable group/mode identities.');
      if ('label' in row && (typeof row.label !== 'string' || row.label.length > 120)) throw new Error('Supply a bounded group/mode label.');
      if ('reason' in row && (typeof row.reason !== 'string' || row.reason.length > 400)) throw new Error('Supply a bounded coupling reason.');
      if ('default' in row && typeof row.default !== 'boolean') throw new Error('Mode default must be a boolean.');
      const values = array(row[key === 'channelGroups' ? 'peaks' : key === 'modes' ? 'groups' : 'requires'], 'group members');
      if (!values.length && key !== 'coupling') throw new Error('Groups and modes cannot be empty.');
      if (key === 'channelGroups') values.forEach(value => number(value, 'wavelength nm', 180, 2500));
      else if (values.some(value => typeof value !== 'string' || !/^[A-Za-z0-9_.-]{1,80}$/.test(value))) throw new Error('Use exact group identities.');
    }
  } else {
    if (operation === 'add' && ['deviceId', 'startedAt', 'durationMin', 'distanceCm', 'bodyArea', 'eyesProtected'].some(key => !Object.hasOwn(patch, key))) throw new Error('A completed session needs its device, actual start time, duration, distance, body area and eye-protection fact. Ask for missing facts rather than assuming defaults.');
    if (operation !== 'add' && 'deviceId' in patch) throw new Error('A recorded session keeps its device identity.');
    if ('deviceId' in patch && (typeof patch.deviceId !== 'string' || !patch.deviceId)) throw new Error('Choose an exact saved device ID.');
    if ('startedAt' in patch && (typeof patch.startedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(patch.startedAt) || !validAgentDate(patch.startedAt.slice(0, 10)) || !Number.isFinite(Date.parse(patch.startedAt)))) throw new Error('Supply the actual start time with an explicit UTC offset. A date alone is not a clock time.');
    if ('durationMin' in patch) number(patch.durationMin, 'duration minutes', 0, 600);
    if ('distanceCm' in patch) number(patch.distanceCm, 'distance cm', 1, 1000);
    if ('bodyArea' in patch && !lightDeviceSessionFields.bodyArea.includes(String(patch.bodyArea))) throw new Error('Choose a supported body area.');
    if ('bodyAreas' in patch && patch.bodyAreas !== null) { const values = array(patch.bodyAreas, 'body regions'); if (!values.length || values.some(value => typeof value !== 'string') || new Set(values).size !== values.length) throw new Error('Choose distinct precise body regions or null for a broad area.'); }
    if ('eyesProtected' in patch && typeof patch.eyesProtected !== 'boolean') throw new Error('Report eye protection as a boolean.');
    if ('mode' in patch && patch.mode !== null && typeof patch.mode !== 'string') throw new Error('Choose a supported mode ID or null.');
    if ('notes' in patch && (typeof patch.notes !== 'string' || patch.notes.length > 2000)) throw new Error('Supply notes up to 2000 characters.');
  }
}
export function displayLightDeviceRecord(value: unknown): Record<string, unknown> | null {
  if (value === null) return null;
  const row = agentDataObject(value);
  return row.version === 1 && isLightDeviceResource(String(row.resource)) && Object.hasOwn(row, 'record') ? row.record as Record<string, unknown> | null : row;
}
export function projectLightDeviceRecord(proposal: AgentDataProposal) {
  const snapshot = parseLightDeviceSnapshot(proposal); validateLightDevicePatch(snapshot.resource, proposal.operation, parseAgentDataPatch(proposal.patch));
  if (!snapshot.plan || !Array.isArray(snapshot.plan.effects?.recalculatedSessions)) throw new Error('Prepare a fresh device/session effect review.');
  return { before: snapshot.record, after: snapshot.plan.after, effects: snapshot.plan.effects };
}
