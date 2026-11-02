// Compact public reviews store changed facts; source evidence stays in the local digest.
import { agentDataObject, parseAgentDataPatch, validAgentDate, validateFieldNames } from '../shared/agent-data-contract.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { LabSampleCommand } from './lab-sample-mutations.js';
import { validLabPanelId } from './lab-panel-identity.js';
import { validLabToolMarkerKey } from './lab-tool-markers.js';
import { LAB_SAMPLE_CYCLE_FIELDS, validateLabSampleCyclePatch, describeLabSampleCycle } from './lab-sample-cycle.js';
import type { LabSampleCycleFacts } from './lab-sample-cycle.js';

export type LabSampleValue = [markerKey: string, value: number | null, unit: string, name: string, source: string];
export interface LabSampleFacts { date: string; specimen: string | null; sampleTime: string | null; fasting: boolean | null; cycle?: LabSampleCycleFacts; collectionEdited: string[]; }
export interface LabSampleRecord extends LabSampleFacts { id: string; results: LabSampleValue[]; }
export interface LabSamplePlan {
  after: LabSampleFacts | null;
  results: Array<{ markerKey: string; before: LabSampleValue | null; after: LabSampleValue | null }>;
  notes: Array<{ markerKey: string; date: string; before: string | null; after: string | null }>;
  contextNotes: Array<{ markerKey: string; before: string | null; after: string | null }>;
}
export interface LabSampleSnapshot { version: 1 | 2; id: string; record: LabSampleRecord | null; revision: string; dates: string[]; plan?: LabSamplePlan; }
export const labSampleFields = {
  date: 'YYYY-MM-DD collection date; a correction moves every result on this sample.',
  specimen: 'Reported specimen text (up to 100 characters), or null to clear.', sampleTime: 'Reported collection time (HH:MM), or null to clear.',
  fasting: 'true, false, or null (unknown).', newSample: 'Required true only for add: create a deliberately separate sample.',
  cycleDay: 'Explicitly reported positive whole cycle day for this sample only, or null to clear. Requires enabled Insight context.',
  cyclePhase: 'Explicitly reported menstrual, follicular, ovulatory or luteal phase, or null to clear the phase and detail. Saved as recorded; never infer from a cycle day or a prediction. Requires enabled Insight context.',
  cyclePhaseDetail: 'Explicitly reported early_follicular, late_follicular, periovulatory, early_luteal, mid_luteal or late_luteal detail with its matching phase, or null to clear. Changing phase clears an incompatible old detail. Requires enabled Insight context.',
  results: 'New or missing results only: array of {markerKey, value, unit}. Explicit numeric value/unit required. Existing numeric corrections use labResults. Resolve definitions/units with getbased_search_markers includeUnrecorded: true; recorded-only search does not list a marker that has never been saved.',
};
function sampleFacts(value: unknown): LabSampleFacts {
  const row = agentDataObject(value);
  if (!validAgentDate(row.date) || !(row.specimen === null || typeof row.specimen === 'string') || !(row.sampleTime === null || typeof row.sampleTime === 'string')
    || !(row.fasting === null || typeof row.fasting === 'boolean') || !Array.isArray(row.collectionEdited) || row.collectionEdited.some(key => typeof key !== 'string')) throw new Error('Read this sample again.');
  if (row.cycle !== undefined) {
    const cycle = agentDataObject(row.cycle);
    if (!(cycle.cycleDay === null || typeof cycle.cycleDay === 'string' || typeof cycle.cycleDay === 'number' && Number.isFinite(cycle.cycleDay))
      || ['cyclePhase', 'cyclePhaseDetail', 'cyclePhaseSource'].some(key => cycle[key] !== null && typeof cycle[key] !== 'string')) throw new Error('Read this sample’s cycle context again.');
  }
  return row as unknown as LabSampleFacts;
}
function sampleValue(value: unknown): LabSampleValue {
  if (!Array.isArray(value) || value.length !== 5 || typeof value[0] !== 'string' || !validLabToolMarkerKey(value[0])
    || !(value[1] === null || typeof value[1] === 'number' && Number.isFinite(value[1])) || value.slice(2).some(value => typeof value !== 'string')) throw new Error('Read this sample result again.');
  return value as LabSampleValue;
}
export function parseLabSampleSnapshot(value: unknown): LabSampleSnapshot {
  const source = agentDataObject(value);
  if (![1, 2].includes(source.version as number) || !validLabPanelId(source.id) || typeof source.revision !== 'string' || !/^[a-f0-9]{64}$/.test(source.revision)
    || !Array.isArray(source.dates) || source.dates.length > 2 || source.dates.some(date => !validAgentDate(date))) throw new Error('Read the exact sample or a new sample snapshot first.');
  if (source.record !== null) {
    const record = agentDataObject(source.record); sampleFacts(record);
    if (record.id !== source.id || !Array.isArray(record.results)) throw new Error('The sample identity is invalid.');
    record.results.forEach(sampleValue);
    if (new Set(record.results.map(row => (row as LabSampleValue)[0])).size !== record.results.length) throw new Error('The sample results are ambiguous.');
  }
  return source as unknown as LabSampleSnapshot;
}
export function displayLabSample(value: unknown): LabSampleRecord | null {
  const source = agentDataObject(value);
  return source.version === 1 || source.version === 2 ? parseLabSampleSnapshot(source).record : source as unknown as LabSampleRecord;
}
export function reviewedLabSampleCommand(proposal: AgentDataProposal): LabSampleCommand {
  const snapshot = parseLabSampleSnapshot(JSON.parse(proposal.baseline)), patch = parseAgentDataPatch(proposal.patch);
  if (proposal.resource !== 'labSamples' || proposal.recordId !== snapshot.id || !['add', 'update', 'remove'].includes(proposal.operation)
    || (proposal.operation === 'add') !== (snapshot.record === null)) throw new Error('Read the intended existing sample or create snapshot first.');
  validateFieldNames(patch, proposal.operation === 'remove' ? [] : Object.keys(labSampleFields));
  if (proposal.operation !== 'add' && Object.hasOwn(patch, 'newSample')) throw new Error('Only a new sample uses newSample.');
  const command: LabSampleCommand = { kind: proposal.operation === 'add' ? 'add' : proposal.operation === 'remove' ? 'remove' : 'update', panelId: proposal.recordId, now: proposal.recordedAt };
  if (patch.date !== undefined) { if (!validAgentDate(patch.date)) throw new Error('Supply a real collection date.'); command.date = patch.date; }
  if (Object.hasOwn(patch, 'specimen')) { if (!(patch.specimen === null || typeof patch.specimen === 'string' && !!patch.specimen.trim() && patch.specimen.length <= 100)) throw new Error('Supply bounded specimen text or null.'); command.specimen = patch.specimen; }
  if (Object.hasOwn(patch, 'sampleTime')) { if (!(patch.sampleTime === null || typeof patch.sampleTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(patch.sampleTime))) throw new Error('Supply collection time as HH:MM or null.'); command.sampleTime = patch.sampleTime; }
  if (Object.hasOwn(patch, 'fasting')) { if (!(patch.fasting === null || typeof patch.fasting === 'boolean')) throw new Error('Fasting must be true, false or null.'); command.fasting = patch.fasting; }
  for (const field of LAB_SAMPLE_CYCLE_FIELDS) if (Object.hasOwn(patch, field)) Object.assign(command, { [field]: patch[field] });
  validateLabSampleCyclePatch(command);
  if (patch.results !== undefined) {
    if (!Array.isArray(patch.results) || !patch.results.length || patch.results.length > 100) throw new Error('Supply a bounded list of new results.');
    command.results = patch.results.map(raw => {
      const row = agentDataObject(raw); validateFieldNames(row, ['markerKey', 'value', 'unit']);
      if (typeof row.markerKey !== 'string' || !validLabToolMarkerKey(row.markerKey) || typeof row.value !== 'number' || !Number.isFinite(row.value) || typeof row.unit !== 'string') throw new Error('Each result needs its marker key, finite value and explicit unit.');
      return { markerKey: row.markerKey, storedValue: row.value };
    });
  }
  if (proposal.operation === 'add') { if (patch.newSample !== true || !command.date || !command.results?.length) throw new Error('Confirm a separate new sample with newSample: true, its date and reported results.'); command.newSample = true; }
  return command;
}
export function projectLabSample(proposal: AgentDataProposal) {
  const snapshot = parseLabSampleSnapshot(JSON.parse(proposal.baseline)), command = reviewedLabSampleCommand(proposal), plan = snapshot.plan;
  if (!plan || !Array.isArray(plan.results) || !Array.isArray(plan.notes) || !Array.isArray(plan.contextNotes) || (plan.after === null) !== (command.kind === 'remove')) throw new Error('Refresh this sample review before applying.');
  if (plan.after) sampleFacts(plan.after);
  const results = new Map((snapshot.record?.results || []).map(row => [row[0], row]));
  for (const change of plan.results) {
    if (JSON.stringify(results.get(change.markerKey) || null) !== JSON.stringify(change.before)) throw new Error('The sample review is inconsistent.');
    if (change.after) { const row = sampleValue(change.after); if (row[0] !== change.markerKey) throw new Error('The reviewed marker identity changed.'); results.set(change.markerKey, row); }
    else results.delete(change.markerKey);
  }
  for (const note of plan.notes) if (!validLabToolMarkerKey(note.markerKey) || !validAgentDate(note.date) || ![note.before, note.after].every(text => text === null || typeof text === 'string')) throw new Error('The reviewed dated note is invalid.');
  for (const note of plan.contextNotes) if (!validLabToolMarkerKey(note.markerKey) || ![note.before, note.after].every(text => text === null || typeof text === 'string')) throw new Error('The reviewed sample note context is invalid.');
  return { before: snapshot.record, after: plan.after === null ? null : { id: snapshot.id, ...plan.after, results: [...results.values()].sort((a, b) => a[0].localeCompare(b[0])) } };
}
export function describeLabSample(value: unknown): string {
  if (value === null) return 'No sample / remove this complete sample.';
  const row = displayLabSample(value)!;
  return [`${row.date} · sample ${row.id}`, `${row.specimen || 'Specimen unknown'} · ${row.sampleTime || 'Time unknown'} · ${row.fasting === null ? 'Fasting unknown' : row.fasting ? 'Fasting' : 'Not fasting'}`,
    ...(row.cycle ? [describeLabSampleCycle(row.cycle)] : []),
    `${row.results.length} results:`, ...row.results.map(result => `${result[3]}: ${result[1] ?? 'Not recorded'} ${result[2]} · ${result[4]}`)].join('\n');
}
