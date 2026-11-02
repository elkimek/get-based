// Exact report reads and effect plans share the ordinary source-removal owner.
import type { ProfileData } from '../types/app-state.js';
import type { LabEntry } from '../types/lab-data.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { CommitSnapshot } from './lab-report-mutations.js';
import type { LabReportPlan, LabReportRecord, LabReportRange, LabReportSnapshot, LabReportSample } from './lab-report-proposals.js';
import { validLabReportId, reviewedLabReportRemoval, projectLabReport, canDiscloseLabReportReview } from './lab-report-proposals.js';
import { validAgentDate } from '../shared/agent-data-contract.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { state } from './state.js';
import { labToolMarker, labToolRegistry } from './lab-tool-markers.js';
import { labPanelId, labPanelJSON } from './lab-panel-identity.js';
import { selectLabReportSample } from './lab-report-samples.js';
import { activeLabReportSnapshots, applyLabReportRemoval } from './lab-report-mutations.js';
import { activeLabSampleData } from './lab-sample-mutations.js';
import { labSampleCycleFacts } from './lab-sample-cycle.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { labReportWriteDependencies, commitLabReportWrite } from './lab-report-store.js';
import { CONTEXT_SOURCE_IDS, isContextSourceEnabled } from './context-source-registry.js';

const conflict = (): never => { throw Object.assign(new Error('This report, its results or source history changed since review. Read it again. No change was applied.'), { noChangeApplied: true }); };
function reports(data: ProfileData) {
  return activeLabReportSnapshots(data).filter(row => row.id);
}
function report(data: ProfileData, id: string) {
  if (!validLabReportId(id)) throw new Error('Read a valid report identity.');
  const found = reports(data).filter(row => row.id === id);
  if (found.length > 1) throw new Error('This report identity is ambiguous. Review its sources in the normal editor.');
  return found[0] || null;
}
function sampleFacts(entry: LabEntry): LabReportSample {
  const insight = isContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS);
  return { id: labPanelId(entry), date: entry.date, specimen: typeof entry.specimen === 'string' ? entry.specimen : null,
    sampleTime: typeof entry.context?.sampleTime === 'string' ? entry.context.sampleTime : null, fasting: typeof entry.context?.fasting === 'boolean' ? entry.context.fasting : null,
    ...(insight ? { cycle: labSampleCycleFacts(entry.context) } : {}) };
}
function publicReport(data: ProfileData, source: CommitSnapshot): LabReportRecord {
  if (!validLabReportId(source.id) || !validAgentDate(source.date) || !Array.isArray(source.markers)) throw new Error('Review this report’s identity, collection date or marker rows in its normal editor.');
  const sourceKeys = [...new Set(source.markers.map(marker => marker.mappedKey || marker.suggestedKey))];
  if (sourceKeys.some(key => typeof key !== 'string')) throw new Error('This report has unmapped rows. Review it in the import editor before managing it through chat.');
  const entry = selectLabReportSample({ ...data, entries: data.entries || [] }, source), keys = sourceKeys as string[];
  const scopeKeys = [...new Set([...keys, ...Object.keys(entry?.markers || {})])].sort();
  const categories = labToolRegistry(data); scopeKeys.forEach(key => labToolMarker(data, key, categories));
  const excluded = new Set(source.excludedIndices || []);
  if ([...excluded].some(index => !Number.isInteger(index) || index < 0 || index >= source.markers!.length)) throw new Error('Review this report’s excluded rows in the import editor.');
  const importedAt = typeof source.importedAt === 'number' && Number.isFinite(source.importedAt) && Math.abs(source.importedAt) <= 8.64e15 ? source.importedAt : null;
  const type = (source as CommitSnapshot & { type?: unknown }).type;
  return { id: source.id, date: source.date, importedAt, format: typeof type === 'string' && ['pdf', 'csv', 'xlsx', 'text', 'image', 'json', 'import'].includes(type) ? type : 'import',
    sample: entry ? sampleFacts(entry) : null, sourceKeys: keys.sort(), scopeKeys, markerCount: source.markers.length - excluded.size, excludedCount: excluded.size };
}
async function snapshot(data: ProfileData, id: string, profileSex: string | null): Promise<LabReportSnapshot | null> {
  const source = report(data, id); if (!source) return null;
  const record = publicReport(data, source), bytes = new TextEncoder().encode(labPanelJSON({ data: labReportWriteDependencies(data), profileSex }));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  record.scopeKeys.forEach(key => labToolMarker(data, key));
  if (record.sample?.cycle && !isContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS)) throw new Error('This report’s disclosure scope changed. Read it again.');
  return { version: 1, id, record, revision: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
}
export async function readCurrentLabReport(profileId: string, id: string) {
  const sex = state.profileSex, value = await snapshot(await readAgentProfileRecords(profileId), id, sex);
  if (state.currentProfile !== profileId || state.profileSex !== sex) throw new Error('The active report profile changed. Read it again.'); return value;
}
export async function listCurrentLabReports(profileId: string) {
  const data = await readAgentProfileRecords(profileId), counts = new Map<string, number>(), rows: LabReportRecord[] = [];
  for (const source of reports(data)) if (source.id) counts.set(source.id, (counts.get(source.id) || 0) + 1);
  for (const source of reports(data)) if (source.id && counts.get(source.id) === 1) { try { rows.push(publicReport(data, source)); } catch { /* Unavailable sources never disclose partial records. */ } }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || (b.importedAt || 0) - (a.importedAt || 0) || a.id.localeCompare(b.id));
}
function origin(entry: LabEntry | null, key: string) {
  if (!entry || !Object.hasOwn(entry.markers || {}, key)) return 'Not recorded';
  const source = entry.markerSources?.[key];
  return source?.derivedFrom?.length ? 'Calculated from this sample' : source?.snapshotId || source?.file ? source.manuallyEdited ? 'Imported report · manually edited' : 'Imported report' : source ? 'Manual entry' : 'Unspecified';
}
function number(value: unknown): number | null { if (value == null) return null; if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Review this report’s numeric values in their normal editor.'); return value; }
function range(value: Record<string, unknown> | null | undefined): LabReportRange {
  return { referenceMin: number(value?.refMin), referenceMax: number(value?.refMax), source: value?.refSource === 'import' ? 'Report' : value?.refSource === 'manual' ? 'Manual' : value?.refMin != null || value?.refMax != null ? 'Unspecified stored override' : 'Default',
    retainedLabMin: number(value?.labRefMin), retainedLabMax: number(value?.labRefMax), reportDate: validAgentDate(value?.labRefDate) ? value.labRefDate : null };
}
function computed(data: ProfileData, proposal: AgentDataProposal, profileSex: string | null) {
  const source = report(data, proposal.recordId); if (!source) return conflict();
  const before = selectLabReportSample({ ...data, entries: data.entries || [] }, source), next = structuredClone(data); next.entries ||= [];
  const removed = applyLabReportRemoval(next, proposal.recordId, profileSex, proposal.recordedAt);
  const after = activeLabSampleData(next).entries.find(entry => labPanelId(entry) === removed.sampleId) || null;
  const keys = [...new Set([...Object.keys(before?.markers || {}), ...Object.keys(after?.markers || {})])].sort();
  const results: LabReportPlan['results'] = keys.flatMap(key => {
    const old = number(before?.markers?.[key]), value = number(after?.markers?.[key]), beforeSource = origin(before, key), afterSource = origin(after, key);
    if (old === value && beforeSource === afterSource) return [];
    const marker = labToolMarker(data, key);
    return [{ key, name: marker.name, unit: String(marker.value.unit || ''), before: old, after: value, beforeSource, afterSource }];
  });
  const collection: LabReportPlan['collection'] = before ? (['sampleTime', 'fasting'] as const).flatMap(field => {
    const old = before.context?.[field] ?? null, value = after?.context?.[field] ?? null;
    if (old === value) return [];
    if (![old, value].every(value => value === null || typeof value === 'string' || typeof value === 'boolean')) throw new Error('Review this report’s collection fields.');
    return [{ field, before: old as string | boolean | null, after: value as string | boolean | null }];
  }) : [];
  const ranges: LabReportPlan['ranges'] = [...new Set([...Object.keys(data.refOverrides || {}), ...Object.keys(next.refOverrides || {})])].sort().flatMap(key => {
    const before = range(data.refOverrides?.[key]), after = range(next.refOverrides?.[key]);
    if (profileDataValuesEqual(before, after)) return [];
    const marker = labToolMarker(data, key); return [{ key, name: marker.name, unit: String(marker.value.unit || ''), before, after }];
  });
  const notes: LabReportPlan['notes'] = [];
  if (before) for (const key of keys) {
    const id = `${key}:${before.date}`, old: unknown = data.markerValueNotes?.[id] ?? null, value: unknown = next.markerValueNotes?.[id] ?? null;
    if (old === value) continue;
    if (![old, value].every(text => text === null || typeof text === 'string')) throw new Error('Review this report’s shared notes.');
    notes.push({ key, name: labToolMarker(data, key).name, date: before.date, before: old as string | null, after: value as string | null });
  }
  const clearedOriginals: LabReportPlan['clearedOriginals'] = before ? keys.flatMap(key => {
    const id = `${key}:${before.date}`, had = before.manualOriginals?.[key] != null || data.manualValues?.[id] != null;
    const cleared = had && (after?.manualOriginals?.[key] == null && next.manualValues?.[id] == null);
    return cleared ? [{ key, name: labToolMarker(data, key).name }] : [];
  }) : [];
  const plan: LabReportPlan = { sampleRemoved: !!before && !after, results, collection, ranges, notes, clearedOriginals };
  if (plan.sampleRemoved && before && !isContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS)
    && ['cycleDay', 'cyclePhase', 'cyclePhaseDetail', 'cyclePhaseSource'].some(key => before.context?.[key] != null)) throw new Error('This sample’s complete context is unavailable to this connection. Review its removal in the normal editor.');
  return { next, plan };
}
export async function prepareReviewedLabReport(profileId: string, proposal: AgentDataProposal) {
  const expected = reviewedLabReportRemoval(proposal), data = await readAgentProfileRecords(profileId), sex = state.profileSex;
  const current = await snapshot(data, proposal.recordId, sex);
  if (!profileDataValuesEqual(expected, current)) conflict();
  const plan = computed(data, proposal, sex).plan;
  proposal.baseline = JSON.stringify({ ...current, plan });
  if (proposal.baseline.length > 64000) throw new Error('This report needs a larger effect review. Use its import editor for now.');
  projectLabReport(proposal);
  if (state.currentProfile !== profileId || state.profileSex !== sex || !canDiscloseLabReportReview(data, proposal)) throw new Error('This report’s disclosure scope changed while preparing its review. Read it again.');
}
export async function commitReviewedLabReport(profileId: string, proposal: AgentDataProposal, authorized: () => boolean) {
  const expected = reviewedLabReportRemoval(proposal), data = await readAgentProfileRecords(profileId), sex = state.profileSex, { plan: reviewed, ...before } = expected;
  if (!authorized() || !canDiscloseLabReportReview(data, proposal)) throw Object.assign(new Error('This report or its result groups are no longer authorized. No change was applied.'), { noChangeApplied: true });
  const current = await snapshot(data, proposal.recordId, sex);
  if (!profileDataValuesEqual(before, current)) conflict();
  const { next, plan } = computed(data, proposal, sex);
  if (!profileDataValuesEqual(reviewed, plan)) conflict(); projectLabReport(proposal);
  let changed = false, revoked = false;
  const scope = () => { if (!authorized() || state.profileSex !== sex || !canDiscloseLabReportReview(data, proposal)) revoked = true; return !revoked; };
  if (!await commitLabReportWrite(profileId, data, data, next, scope, () => { changed = true; })) {
    if (revoked) throw Object.assign(new Error('This report or its result groups are no longer authorized. No change was applied.'), { noChangeApplied: true });
    if (changed) conflict(); throw new Error('Could not save this report removal.');
  }
  return 'Report removed. Reviewed result and context effects saved; diagnostic history retained.';
}
