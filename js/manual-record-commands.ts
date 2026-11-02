// Exact manual readings; dates and body methods are part of their identity.
import { agentDataObject, validAgentDate, validateFieldNames } from '../shared/agent-data-contract.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { BODY_POSITIONS, WAIST_SITES, measurementPatch, bodyPositionLabel } from './body-measurement-model.js';
import type { BodyPosition, WaistSite } from './body-measurement-model.js';
import { MANUAL_TAGS } from './manual-reading-fields.js';
import { weightToKilograms } from './wearables-formatters.js';

export const MANUAL_RECORD_KINDS = ['weight', 'bloodPressure', 'pulse', 'waist', 'hip', 'abdominalDepth'] as const;
export type ManualRecordKind = typeof MANUAL_RECORD_KINDS[number];
export interface ManualRecord {
  id: string; kind: ManualRecordKind; date: string; unit: string;
  value?: number; systolic?: number; diastolic?: number; hip?: number; pulse?: number | null;
  position?: BodyPosition; site?: WaistSite;
  tags?: string[]; note?: string; legacyNotes?: string[];
}
export interface ManualRecordSnapshot {
  version: 1; recordId: string; record: ManualRecord | null; revision: string | null;
  context: { tags?: string[]; note?: string };
  occupiedFields: string[]; soleReading: boolean;
  relatedPulse?: number | null;
  destination?: ManualRecordSnapshot;
}
export const manualEditableFields = {
  kind: MANUAL_RECORD_KINDS, date: 'YYYY-MM-DD; defaults to the frozen proposal date for a new reading',
  value: 'Weight, pulse or body measurement. Supply unit whenever value or hip changes.',
  unit: 'weight: kg/lb/lbs; pulse: bpm; blood pressure: mmHg; body measurements: cm/in',
  systolic: 'Blood pressure, positive integer up to 300 mmHg; null clears this component',
  diastolic: 'Blood pressure, positive integer up to 200 mmHg; null clears this component',
  pulse: 'Optional manual pulse alongside blood pressure, in bpm. Explicitly supplied values update the separately addressed pulse in the same commit; null clears it. Omission preserves it.',
  hip: 'Optional paired hip circumference for waist, in the supplied unit; null removes the paired hip',
  position: BODY_POSITIONS.map(row => row.id), site: WAIST_SITES.map(row => row.id),
  tags: MANUAL_TAGS, note: 'Up to 500 characters; null or empty text clears it',
};
export const manualRecordRules = {
  contextScope: 'Notes/tags are shared by ALL manual readings on that date. Omitted context is preserved. A moved reading uses destination-date context; source context stays with other readings.',
  method: 'For new waist/hip readings ask for position and site; never guess them. Add/edit a paired hip by updating its waist record. A standalone hip remains separate. Abdominal depth uses supine/iliac calipers. Only a paired hip travels with its waist. Pulse is a separate manual reading, stored as rhr; do not label an exercise pulse as resting.',
};
const kindFields: Record<string, string> = { weight: 'weight', bloodPressure: 'bp', pulse: 'rhr', abdominalDepth: 'sad_supine_iliac' };
export function manualRecordId(kind: ManualRecordKind, date: string, position?: BodyPosition, site?: WaistSite) {
  const field = kindFields[kind] || `${kind}_${position}_${site}`;
  return `${field}.${date}`;
}
export function parseManualRecordId(id: string): { kind: ManualRecordKind; date: string; fields: string[]; position?: BodyPosition; site?: WaistSite } {
  const dot = id.indexOf('.'), field = id.slice(0, dot), date = id.slice(dot + 1);
  if (dot < 1 || !validAgentDate(date) || date < '1970-01-01') throw new Error('Choose a valid manual reading date.');
  const method = /^(waist|hip)_(standing|seated|supine)_(midpoint|iliac|navel)$/.exec(field);
  if (method) return { kind: method[1] as 'waist' | 'hip', date, position: method[2] as BodyPosition, site: method[3] as WaistSite,
    fields: method[1] === 'waist' ? [field, field.replace(/^waist_/, 'hip_')] : [field, field.replace(/^hip_/, 'waist_')] };
  const kind = Object.entries(kindFields).find(([, value]) => value === field)?.[0] as ManualRecordKind | undefined;
  if (!kind) throw new Error('Unknown manual reading.');
  return { kind, date, fields: kind === 'bloodPressure' ? ['bp_systolic', 'bp_diastolic', 'rhr'] : [field],
    ...(kind === 'abdominalDepth' ? { position: 'supine' as const, site: 'iliac' as const } : {}) };
}
export function emptyManualRecordSnapshot(): ManualRecordSnapshot {
  return { version: 1, recordId: '', record: null, revision: null, context: {}, occupiedFields: [], soleReading: false };
}
export function parseManualRecordSnapshot(value: unknown): ManualRecordSnapshot {
  const source = agentDataObject(value);
  if (source.version !== 1 || typeof source.recordId !== 'string'
    || !(source.revision === null || typeof source.revision === 'string' && /^[a-f0-9]{64}$/.test(source.revision))
    || !Array.isArray(source.occupiedFields) || typeof source.soleReading !== 'boolean') throw new Error('Read this manual reading again before proposing changes.');
  agentDataObject(source.context);
  if (source.recordId) parseManualRecordId(source.recordId);
  if (source.record !== null) {
    const row = agentDataObject(source.record);
    if (row.id !== source.recordId || !MANUAL_RECORD_KINDS.includes(row.kind as ManualRecordKind) || !validAgentDate(row.date)) throw new Error('Invalid manual reading snapshot.');
  }
  if (source.destination !== undefined) {
    const destination = agentDataObject(source.destination);
    if (destination.destination !== undefined) throw new Error('Invalid nested manual reading snapshot.');
    parseManualRecordSnapshot(destination);
  }
  return source as unknown as ManualRecordSnapshot;
}
function positive(value: unknown, max: number, label: string, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > max || integer && !Number.isInteger(value)) throw new Error(`Enter ${label} greater than 0 and no more than ${max}${integer ? ', as a whole number' : ''}.`);
  return value;
}
function contextPatch(before: ManualRecordSnapshot['context'], patch: Record<string, unknown>) {
  const result = structuredClone(before);
  if (Object.hasOwn(patch, 'tags')) {
    if (patch.tags === null) delete result.tags;
    else if (!Array.isArray(patch.tags) || patch.tags.some(tag => !MANUAL_TAGS.includes(tag)) || new Set(patch.tags).size !== patch.tags.length) throw new Error('Choose supported, distinct manual reading tags.');
    else if (patch.tags.length) result.tags = patch.tags as string[];
    else delete result.tags;
  }
  if (Object.hasOwn(patch, 'note')) {
    if (patch.note === null || typeof patch.note === 'string' && !patch.note.trim()) delete result.note;
    else if (typeof patch.note !== 'string' || patch.note.trim().length > 500) throw new Error('Keep the manual reading note within 500 characters.');
    else result.note = patch.note.trim();
  }
  return result;
}
export function projectManualRecord(proposal: AgentDataProposal, patch: Record<string, unknown>): { before: ManualRecord | null; after: ManualRecord | null } {
  const snapshot = parseManualRecordSnapshot(JSON.parse(proposal.baseline)); let before = snapshot.record;
  if (!['add', 'update', 'remove'].includes(proposal.operation)) throw new Error('Unsupported manual reading operation.');
  if (proposal.operation === 'add' ? before !== null || snapshot.recordId !== '' : before === null || before.id !== proposal.recordId) throw new Error('Read the intended manual reading first.');
  if (proposal.operation === 'remove') { validateFieldNames(patch, []); return { before, after: null }; }
  validateFieldNames(patch, ['kind', 'date', 'value', 'unit', 'systolic', 'diastolic', 'pulse', 'hip', 'position', 'site', 'tags', 'note']);
  if (!Object.keys(patch).length) throw new Error('Supply at least one field to change.');
  const kind = patch.kind ?? before?.kind;
  if (!MANUAL_RECORD_KINDS.includes(kind as ManualRecordKind) || before && kind !== before.kind) throw new Error('Choose a manual reading kind; existing readings retain their kind.');
  const date = patch.date ?? before?.date ?? proposal.effectiveDate;
  if (!validAgentDate(date) || date < '1970-01-01' || date > proposal.effectiveDate) throw new Error('Choose a real manual reading date from 1970 through the proposal date.');
  const position = patch.position ?? before?.position, site = patch.site ?? before?.site;
  const body = kind === 'waist' || kind === 'hip' || kind === 'abdominalDepth';
  if (body) {
    if (kind === 'abdominalDepth') {
      if (position !== undefined && position !== 'supine' || site !== undefined && site !== 'iliac') throw new Error('Abdominal depth uses the lying-down caliper method.');
    } else if (!BODY_POSITIONS.some(row => row.id === position) || !WAIST_SITES.some(row => row.id === site)) throw new Error('Ask for the measurement position and site; do not infer them.');
  } else if (patch.position !== undefined || patch.site !== undefined || patch.hip !== undefined) throw new Error('Body measurement fields do not apply to this reading.');
  const after: ManualRecord = { ...(before || {}), id: manualRecordId(kind as ManualRecordKind, date, position as BodyPosition, site as WaistSite), kind: kind as ManualRecordKind, date,
    unit: kind === 'weight' ? 'kg' : kind === 'bloodPressure' ? 'mmHg' : kind === 'pulse' ? 'bpm' : 'cm' };
  if (body) { after.position = kind === 'abdominalDepth' ? 'supine' : position as BodyPosition; after.site = kind === 'abdominalDepth' ? 'iliac' : site as WaistSite; }
  const unit = patch.unit;
  if (kind === 'bloodPressure') {
    if (patch.value !== undefined || unit !== undefined && unit !== 'mmHg') throw new Error('Blood pressure uses systolic/diastolic in mmHg.');
    for (const field of ['systolic', 'diastolic'] as const) if (Object.hasOwn(patch, field)) {
      if (patch[field] === null) delete after[field]; else after[field] = positive(patch[field], field === 'systolic' ? 300 : 200, field, true);
    }
    if (after.systolic === undefined && after.diastolic === undefined) throw new Error('Supply a blood pressure component or remove the reading.');
    if (after.systolic !== undefined && after.diastolic !== undefined && after.diastolic >= after.systolic) throw new Error('Diastolic should be lower than systolic.');
    if (Object.hasOwn(patch, 'pulse')) {
      if (before && before.date !== date) throw new Error('Move a pulse through its own exact record; the BP pulse field edits only the proposed date.');
      if (before) before = { ...before, pulse: snapshot.relatedPulse ?? null };
      after.pulse = patch.pulse === null ? null : positive(patch.pulse, 250, 'pulse in bpm', true);
    }
  } else {
    if (patch.systolic !== undefined || patch.diastolic !== undefined || patch.pulse !== undefined || kind !== 'waist' && patch.hip !== undefined) throw new Error('These fields do not apply to this reading.');
    if (patch.value !== undefined || patch.hip !== undefined && patch.hip !== null) {
      const allowed = kind === 'weight' ? ['kg', 'lb', 'lbs'] : kind === 'pulse' ? ['bpm'] : ['cm', 'in'];
      if (!allowed.includes(String(unit))) throw new Error('Supply an explicit supported unit for the reported amount.');
    } else if (unit !== undefined) throw new Error('Supply an amount when choosing its unit.');
    if (patch.value !== undefined) {
      const value = positive(patch.value, Number.MAX_VALUE, 'the reading');
      after.value = kind === 'weight' ? positive(weightToKilograms(value, String(unit)), 500, 'weight in kg')
        : kind === 'pulse' ? positive(value, 250, 'pulse in bpm', true) : positive(value * (unit === 'in' ? 2.54 : 1), 400, 'the measurement in cm');
    }
    if (after.value === undefined) throw new Error('Supply the measured value and its unit.');
    if (kind === 'waist') {
      if (patch.hip === null) delete after.hip;
      else if (patch.hip !== undefined) after.hip = positive(positive(patch.hip, Number.MAX_VALUE, 'hip circumference') * (unit === 'in' ? 2.54 : 1), 400, 'hip circumference in cm');
      measurementPatch({ kind: 'waist', date, value: after.value, hip: after.hip ?? null, position: after.position!, site: after.site!, unit: 'cm' });
    } else if (kind === 'abdominalDepth') measurementPatch({ kind: 'abdominal_depth', date, value: after.value, hip: null, position: 'supine', site: 'iliac', unit: 'cm' });
  }
  const context = snapshot.destination?.context ?? snapshot.context;
  delete after.tags; delete after.note;
  Object.assign(after, contextPatch(context, patch));
  return { before, after };
}
export function manualRecordFields(record: ManualRecord): Record<string, number> {
  const { fields } = parseManualRecordId(record.id);
  if (record.kind === 'bloodPressure') return { ...(record.systolic === undefined ? {} : { bp_systolic: record.systolic }), ...(record.diastolic === undefined ? {} : { bp_diastolic: record.diastolic }), ...(record.pulse == null ? {} : { rhr: record.pulse }) };
  return { [fields[0]!]: record.value!, ...(record.kind === 'waist' && record.hip !== undefined ? { [fields[1]!]: record.hip } : {}) };
}
export function displayManualRecord(value: unknown): ManualRecord | null {
  if (value === null) return null;
  const source = agentDataObject(value), record = source.version === 1 ? parseManualRecordSnapshot(source).record : source as unknown as ManualRecord;
  if (!record) return null;
  return Object.fromEntries(Object.entries(record).filter(([key]) => ['id', 'kind', 'date', 'unit', 'value', 'systolic', 'diastolic', 'pulse', 'hip', 'position', 'site', 'tags', 'note', 'legacyNotes'].includes(key))) as unknown as ManualRecord;
}
export function describeManualRecord(value: unknown): string {
  const row = displayManualRecord(value);
  if (!row) return 'Not recorded / removed';
  const labels: Record<ManualRecordKind, string> = { weight: 'Weight', bloodPressure: 'Blood pressure', pulse: 'Manual pulse', waist: 'Waist circumference', hip: 'Hip circumference', abdominalDepth: 'Abdominal depth' };
  const method = row.position ? ` · ${bodyPositionLabel(row.position)} · ${WAIST_SITES.find(site => site.id === row.site)?.label}` : '';
  return [`${labels[row.kind]} · ${row.date}${method}`, row.kind === 'bloodPressure' ? `${row.systolic ?? 'Unknown'}/${row.diastolic ?? 'Unknown'} mmHg` : `${row.value} ${row.unit}`,
    ...(row.pulse === undefined ? [] : [`Also manual pulse: ${row.pulse === null ? 'Not recorded / cleared' : `${row.pulse} bpm`}`]), ...(row.hip === undefined ? [] : [`Paired hip: ${row.hip} cm`]), `Shared date tags: ${row.tags?.join(', ') || 'None'}`, `Shared date note: ${row.note || 'None'}`,
    ...(row.legacyNotes?.length ? [`Original record notes: ${row.legacyNotes.join('; ')}`] : [])].join('\n');
}
