// Semantic EMF identities and disclosure-safe views; raw photos/source stay local.
import { sha256 } from '../vendor/sha256.js';
import type { ProfileData } from '../types/app-state.js';
import { agentDataObject, validAgentDate, validateFieldNames } from '../shared/agent-data-contract.js';
import { EMF_SOURCES, EMF_MITIGATIONS } from './constants.js';
import { SBM_2015_THRESHOLDS } from './schema-environment.js';
export type EMFResource = 'emfAssessments' | 'emfRooms' | 'emfMeasurements';
export const isEMFResource = (value: string): value is EMFResource => ['emfAssessments', 'emfRooms', 'emfMeasurements'].includes(value);
export type EMFRow = Record<string, unknown>;
export interface EMFRecord { id: string; assessment: EMFRow; room?: EMFRow; roomId?: string; roomIndex?: number; type?: string; measurement?: EMFRow; }
const identity = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,160}$/.test(value);
export const emfDerivedId = (prefix: string, parts: unknown[]) => prefix + [...sha256(new TextEncoder().encode(JSON.stringify(parts)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
export const emfRoomId = (assessmentId: string, room: EMFRow, index: number): string => {
  if (room.id != null && !identity(room.id)) throw new Error('Review this EMF room identity in its editor.');
  return typeof room.id === 'string' ? room.id : emfDerivedId('emfr_', [assessmentId, index]);
};
export function emfAssessments(data: Partial<ProfileData>): EMFRow[] {
  if (data.emfAssessment == null) return [];
  const rows: unknown = agentDataObject(data.emfAssessment).assessments;
  if (!Array.isArray(rows)) throw new Error('Review this older EMF assessment in its editor.');
  const records = rows.map(agentDataObject);
  if (records.some(row => !identity(row.id)) || new Set(records.map(row => row.id)).size !== records.length) throw new Error('Review missing or duplicate EMF assessment identities in the editor.');
  return rows as EMFRow[];
}
export function emfRecords(data: Partial<ProfileData>, resource: EMFResource): EMFRecord[] {
  const records: EMFRecord[] = [];
  for (const assessment of emfAssessments(data)) {
    const id = assessment.id as string;
    if (resource === 'emfAssessments') { records.push({ id, assessment }); continue; }
    if (!Array.isArray(assessment.rooms)) throw new Error('Review this older EMF room collection in its editor.');
    for (const [roomIndex, raw] of assessment.rooms.entries()) {
      const room = agentDataObject(raw), roomId = emfRoomId(id, room, roomIndex);
      if (resource === 'emfRooms') { records.push({ id: roomId, assessment, room, roomId, roomIndex }); continue; }
      const measurements = room.measurements == null ? {} : agentDataObject(room.measurements);
      for (const [type, rawMeasurement] of Object.entries(measurements)) {
        if (!Object.hasOwn(SBM_2015_THRESHOLDS, type) || rawMeasurement == null) continue;
        const measurement = agentDataObject(rawMeasurement);
        if (measurement.id != null && !identity(measurement.id)) throw new Error('Review this EMF reading identity in its editor.');
        records.push({ id: typeof measurement.id === 'string' ? measurement.id : emfDerivedId('emfm_', [roomId, type]), assessment, room, roomId, roomIndex, type, measurement });
      }
    }
  }
  if (new Set(records.map(row => row.id)).size !== records.length) throw new Error('Review duplicate EMF record identities in the editor.');
  return records;
}
const text = (value: unknown) => {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > 4000) throw new Error('Review this older EMF text field in its editor.');
  return value;
};
const count = (value: unknown) => value == null ? 0 : Array.isArray(value) ? value.length : (() => { throw new Error('Review this older EMF collection in its editor.'); })();
const strings = (value: unknown) => value == null ? [] : Array.isArray(value) ? value.map(text) : (() => { throw new Error('Review these older EMF tags in the editor.'); })();
export function displayEMFRecord(resource: EMFResource, value: unknown): EMFRow | null {
  if (value == null) return null;
  const row = agentDataObject(value);
  if (row.version === 1 && row.resource === resource && typeof row.revision === 'string') return displayEMFRecord(resource, row.record);
  // List/read projections are already whitelisted. Never pass raw storage here.
  const fields = resource === 'emfAssessments' ? ['id', 'date', 'label', 'consultant', 'note', 'roomCount', 'historyCount'] : resource === 'emfRooms'
    ? ['id', 'assessmentId', 'assessmentDate', 'assessmentLabel', 'name', 'location', 'sleeping', 'thresholdContext', 'note', 'sources', 'mitigations', 'photoCount', 'measurementCount']
    : ['id', 'assessmentId', 'assessmentDate', 'assessmentLabel', 'roomId', 'roomName', 'type', 'value', 'unit', 'meter'];
  return Object.fromEntries(fields.filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]));
}
export function projectEMFRow(resource: EMFResource, record: EMFRecord | null): EMFRow | null {
  if (!record) return null;
  const { id, assessment, room, roomId, type, measurement } = record;
  if (resource === 'emfAssessments') return { id, date: text(assessment.date), label: text(assessment.label), consultant: text(assessment.consultant), note: text(assessment.note), roomCount: count(assessment.rooms), historyCount: count(assessment.editHistory) };
  if (resource === 'emfRooms') return { id, assessmentId: assessment.id, assessmentDate: text(assessment.date), assessmentLabel: text(assessment.label), name: text(room!.name), location: text(room!.location), sleeping: typeof room!.sleeping === 'boolean' ? room!.sleeping : null,
    thresholdContext: room!.sleeping === false ? 'daytime' : typeof room!.sleeping === 'boolean' ? 'sleeping' : 'sleeping (legacy default)', note: text(room!.note), sources: strings(room!.sources), mitigations: strings(room!.mitigations), photoCount: count(room!.photos), measurementCount: Object.keys(room!.measurements == null ? {} : agentDataObject(room!.measurements)).length };
  if (measurement!.value != null && (typeof measurement!.value !== 'number' || !Number.isFinite(measurement!.value))) throw new Error('Review this older EMF reading in its editor.');
  return { id, assessmentId: assessment.id, assessmentDate: text(assessment.date), assessmentLabel: text(assessment.label), roomId, roomName: text(room!.name), type, value: measurement!.value ?? null, unit: text(measurement!.unit), meter: text(measurement!.meter) };
}
export const emfChoices = { sources: EMF_SOURCES, mitigations: EMF_MITIGATIONS };
export const emfFields = {
  emfAssessments: { date: 'Actual YYYY-MM-DD assessment date', label: 'Text, max 160 characters', consultant: 'Reported name, max 160 characters', note: 'Text, max 4000 characters', roomName: 'Add only: first room name, max 160 characters', sleeping: 'Add only: explicitly reported boolean; ask if sleeping/daytime use is unknown' },
  emfRooms: { assessmentId: 'Add only: exact listed assessment ID', name: 'Reported room name, max 160 characters', location: 'Reported location, max 160 characters', sleeping: 'Explicitly reported boolean; never infer from the room name', note: 'Text, max 4000 characters', sources: 'Reported source tags; array of at most 40 strings', mitigations: 'Reported applied mitigations; array of at most 40 strings', keepPhotoIndices: 'Update only: ascending distinct zero-based photo indices to retain; originals remain in private history' },
  emfMeasurements: { roomId: 'Add only: exact listed room ID', type: Object.keys(SBM_2015_THRESHOLDS), value: 'Reported finite nonnegative number, or null for an unknown reading/instrument-only record; include canonical unit', unit: Object.fromEntries(Object.entries(SBM_2015_THRESHOLDS).map(([key, def]) => [key, def.unit])), meter: 'Reported instrument, max 160 characters; empty clears' },
};
export function validateEMFPatch(resource: EMFResource, operation: string, patch: EMFRow) {
  if (!['add', 'update', 'remove'].includes(operation)) throw new Error('Use add, update or remove for EMF records.');
  const addOnly = resource === 'emfAssessments' ? ['roomName', 'sleeping'] : resource === 'emfRooms' ? ['assessmentId'] : ['roomId', 'type'];
  validateFieldNames(patch, operation === 'remove' ? [] : Object.keys(emfFields[resource]).filter(key => operation === 'add' ? key !== 'keepPhotoIndices' : !addOnly.includes(key)));
  if (operation === 'remove') return;
  if (!Object.keys(patch).length) throw new Error('Supply a reported EMF fact.');
  const required = resource === 'emfAssessments' ? ['date', 'roomName', 'sleeping'] : resource === 'emfRooms' ? ['assessmentId', 'name', 'sleeping'] : ['roomId', 'type', 'value', 'unit'];
  if (operation === 'add' && required.some(key => !Object.hasOwn(patch, key))) throw new Error(`A new EMF record requires ${required.join(', ')}. Ask for missing facts.`);
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'date' && !validAgentDate(value)) throw new Error('Report the actual assessment date.');
    if (['label', 'consultant', 'note', 'roomName', 'name', 'location', 'meter'].includes(key) && (typeof value !== 'string' || value.length > (key === 'note' ? 4000 : 160) || ['roomName', 'name'].includes(key) && !value.trim())) throw new Error(`Supply valid ${key}.`);
    if (key === 'sleeping' && typeof value !== 'boolean') throw new Error('Report whether this is a sleeping or daytime area.');
    if (['assessmentId', 'roomId'].includes(key) && !identity(value)) throw new Error('Choose an exact listed EMF parent ID.');
    if (key === 'type' && (typeof value !== 'string' || !Object.hasOwn(SBM_2015_THRESHOLDS, value))) throw new Error('Choose a declared measurement type.');
    if (key === 'value' && value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw new Error('Report a nonnegative measurement and its unit.');
    if (key === 'unit' && typeof value !== 'string') throw new Error('Report the measurement unit.');
    if (['sources', 'mitigations'].includes(key) && (!Array.isArray(value) || value.length > 40 || value.some(item => typeof item !== 'string' || !item.trim() || item.length > 160) || new Set(value).size !== value.length)) throw new Error('Supply distinct reported EMF tags.');
    if (key === 'keepPhotoIndices' && (!Array.isArray(value) || value.some((item, index) => !Number.isInteger(item) || item < 0 || index > 0 && item <= value[index - 1]))) throw new Error('Choose ascending distinct existing photo indices.');
  }
  if (resource === 'emfMeasurements' && ('value' in patch) !== ('unit' in patch)) throw new Error('A reading correction requires both value and unit.');
}

export function describeEMFRecord(resource: EMFResource, value: unknown): string {
  const row = displayEMFRecord(resource, value); if (!row) return 'Not recorded / removed';
  if (resource === 'emfAssessments') return [`${row.date || 'Undated'} · ${row.label || 'EMF assessment'}`, `Consultant: ${row.consultant || 'Not recorded'}`, `Rooms: ${row.roomCount}`, ...(row.note ? [`Note: ${row.note}`] : [])].join('\n');
  const context = `Assessment: ${row.assessmentDate || 'Undated'} · ${row.assessmentLabel || 'EMF assessment'}`;
  if (resource === 'emfMeasurements') return [context, `${row.roomName} · ${SBM_2015_THRESHOLDS[String(row.type)]?.name || row.type}`, `Reading: ${row.value ?? 'Not recorded'} ${row.unit || ''}`, `Meter: ${row.meter || 'Not recorded'}`].join('\n');
  return [context, String(row.name || 'Room'), `Location: ${row.location || 'Not recorded'}`, `Threshold context: ${row.thresholdContext}`, `Sources: ${(row.sources as string[] || []).join(', ') || 'None recorded'}`, `Applied mitigations: ${(row.mitigations as string[] || []).join(', ') || 'None recorded'}`, `Photos: ${row.photoCount} · Readings: ${row.measurementCount}`, ...(row.note ? [`Note: ${row.note}`] : [])].join('\n');
}
