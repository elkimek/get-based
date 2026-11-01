import type { ProfileData } from '../types/app-state.js';
import { CONTEXT_SOURCE_IDS, isContextSourceEnabled } from './context-source-registry.js';
// Public report reviews contain explicit effects; private extraction data stays local.
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { agentDataObject, parseAgentDataPatch, validAgentDate, validateFieldNames } from '../shared/agent-data-contract.js';
import { labToolMarker, validLabToolMarkerKey } from './lab-tool-markers.js';
import { describeLabSampleCycle } from './lab-sample-cycle.js';
import type { LabSampleCycleFacts } from './lab-sample-cycle.js';

export interface LabReportSample {
  id: string; date: string; specimen: string | null; sampleTime: string | null; fasting: boolean | null;
  cycle?: LabSampleCycleFacts;
}
export interface LabReportRecord {
  id: string; date: string; importedAt: number | null; format: string;
  sample: LabReportSample | null; sourceKeys: string[]; scopeKeys: string[];
  markerCount: number; excludedCount: number;
}
export interface LabReportResultChange {
  key: string; name: string; unit: string; before: number | null; after: number | null;
  beforeSource: string; afterSource: string;
}
export interface LabReportRange {
  referenceMin: number | null; referenceMax: number | null; source: string;
  retainedLabMin: number | null; retainedLabMax: number | null; reportDate: string | null;
}
export interface LabReportPlan {
  sampleRemoved: boolean;
  results: LabReportResultChange[];
  collection: Array<{ field: 'sampleTime' | 'fasting'; before: string | boolean | null; after: string | boolean | null }>;
  ranges: Array<{ key: string; name: string; unit: string; before: LabReportRange; after: LabReportRange }>;
  notes: Array<{ key: string; name: string; date: string; before: string | null; after: string | null }>;
  clearedOriginals: Array<{ key: string; name: string }>;
}
export interface LabReportSnapshot { version: 1; id: string; record: LabReportRecord; revision: string; plan?: LabReportPlan }
export const labReportRules = {
  identity: 'List report IDs by collection date/sample and upload time, then read the exact ID. Filenames and raw extraction metadata are private. Never guess between reports.',
  currentSample: 'The sample field describes the CURRENT saved collection. It is not the original collection time or fasting reported by this source. The draft result returns the actual effect review; use that review when explaining what would be restored.',
  removal: 'Remove uses an empty patch and requires user Apply. It removes the saved review snapshot and its currently linked results, restoring older same-collection values when available. Other samples remain unchanged. Review result, collection, stored range, original and note effects.',
  diagnostics: 'Diagnostic benchmark history is retained. This operation is not complete source erasure or deletion of an original file.',
  editing: 'Numeric corrections use labResults; collection corrections use labSamples. Report re-review, chosen files and original extraction changes use the import editor.',
};
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 4000;
const finiteOrNull = (value: unknown) => value === null || typeof value === 'number' && Number.isFinite(value);
const markerKey = (value: unknown): value is string => typeof value === 'string' && validLabToolMarkerKey(value);
export function validLabReportId(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value) && !['constructor', 'prototype', '__proto__'].includes(value); }
export function parseLabReportSnapshot(value: unknown): LabReportSnapshot {
  const source = agentDataObject(value), record = agentDataObject(source.record);
  if (source.version !== 1 || !validLabReportId(source.id) || record.id !== source.id || !validAgentDate(record.date)
    || typeof source.revision !== 'string' || !/^[a-f0-9]{64}$/.test(source.revision) || !finiteOrNull(record.importedAt) || !text(record.format)
    || !Number.isInteger(record.markerCount) || (record.markerCount as number) < 0 || !Number.isInteger(record.excludedCount) || (record.excludedCount as number) < 0
    || !Array.isArray(record.sourceKeys) || record.sourceKeys.some(key => !markerKey(key)) || !Array.isArray(record.scopeKeys) || record.scopeKeys.some(key => !markerKey(key))) throw new Error('Read this exact report again.');
  if (record.sample !== null) {
    const sample = agentDataObject(record.sample);
    if (!text(sample.id) || !validAgentDate(sample.date) || !(sample.specimen === null || text(sample.specimen)) || !(sample.sampleTime === null || text(sample.sampleTime))
      || !(sample.fasting === null || typeof sample.fasting === 'boolean')) throw new Error('Read this report’s current sample again.');
  }
  return source as unknown as LabReportSnapshot;
}
export function displayLabReport(value: unknown): LabReportRecord {
  const row = agentDataObject(value); return row.version === 1 ? parseLabReportSnapshot(row).record : row as unknown as LabReportRecord;
}
export function reviewedLabReportRemoval(proposal: AgentDataProposal) {
  const snapshot = parseLabReportSnapshot(JSON.parse(proposal.baseline));
  if (proposal.resource !== 'labReports' || proposal.operation !== 'remove' || proposal.recordId !== snapshot.id) throw new Error('Read the exact report before proposing its removal.');
  validateFieldNames(parseAgentDataPatch(proposal.patch), []); return snapshot;
}
export function projectLabReport(proposal: AgentDataProposal) {
  const snapshot = reviewedLabReportRemoval(proposal), plan = snapshot.plan;
  if (!plan || typeof plan.sampleRemoved !== 'boolean' || !Array.isArray(plan.results) || !Array.isArray(plan.collection) || !Array.isArray(plan.ranges) || !Array.isArray(plan.notes) || !Array.isArray(plan.clearedOriginals)) throw new Error('Refresh this report’s effect review before applying.');
  for (const row of plan.results) if (!markerKey(row.key) || !text(row.name) || !text(row.unit) || !finiteOrNull(row.before) || !finiteOrNull(row.after) || !text(row.beforeSource) || !text(row.afterSource)) throw new Error('Invalid reviewed report result.');
  for (const row of plan.collection) if (!['sampleTime', 'fasting'].includes(row.field) || ![row.before, row.after].every(value => value === null || typeof value === 'boolean' || text(value))) throw new Error('Invalid reviewed collection effect.');
  for (const row of plan.ranges) {
    if (!markerKey(row.key) || !text(row.name) || !text(row.unit)) throw new Error('Invalid reviewed range.');
    for (const bounds of [row.before, row.after]) if (!bounds || ![bounds.referenceMin, bounds.referenceMax, bounds.retainedLabMin, bounds.retainedLabMax].every(finiteOrNull)
      || !text(bounds.source) || !(bounds.reportDate === null || validAgentDate(bounds.reportDate))) throw new Error('Invalid reviewed range bounds.');
  }
  for (const row of plan.notes) if (!markerKey(row.key) || !text(row.name) || !validAgentDate(row.date) || ![row.before, row.after].every(value => value === null || text(value))) throw new Error('Invalid reviewed note effect.');
  for (const row of plan.clearedOriginals) if (!markerKey(row.key) || !text(row.name)) throw new Error('Invalid reviewed original-value effect.');
  return { before: snapshot.record, after: null, plan };
}
export function describeLabReport(value: unknown) {
  if (value === null) return 'Remove this saved report review and apply the listed result and context changes. Diagnostic history is retained.';
  const record = displayLabReport(value), sample = record.sample;
  return [`Report collected ${record.date} · ${record.format || 'Unknown format'}`,
    `Uploaded: ${record.importedAt === null ? 'Unknown' : new Date(record.importedAt).toISOString()}`,
    `${record.markerCount} included rows · ${record.excludedCount} excluded rows`,
    sample ? `Sample ${sample.date} · ${sample.specimen || 'Specimen unknown'} · ${sample.sampleTime || 'Time unknown'} · ${sample.fasting === null ? 'Fasting unknown' : sample.fasting ? 'Fasting' : 'Not fasting'}` : 'No active linked sample',
    ...(sample?.cycle ? [describeLabSampleCycle(sample.cycle)] : [])].join('\n');
}

export function canDiscloseLabReportReview(data: ProfileData, proposal: AgentDataProposal) {
  try {
    const snapshot = parseLabReportSnapshot(JSON.parse(proposal.baseline));
    if (snapshot.record.sample?.cycle && !isContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS)) return false;
    const keys = new Set([...snapshot.record.scopeKeys, ...(snapshot.plan?.results.map(row => row.key) || []), ...(snapshot.plan?.ranges.map(row => row.key) || []), ...(snapshot.plan?.notes.map(row => row.key) || []), ...(snapshot.plan?.clearedOriginals.map(row => row.key) || [])]);
    keys.forEach(key => labToolMarker(data, key)); return true;
  } catch { return false; }
}
