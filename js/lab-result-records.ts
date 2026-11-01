// Exact reads hash private source evidence locally. Only bounded public facts leave the browser.
import type { ProfileData } from '../types/app-state.js';
import type { LabEntry } from '../types/lab-data.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { LabResultRecord, LabResultSnapshot, LabResultValue } from './lab-result-commands.js';
import { parseAgentDataPatch } from '../shared/agent-data-contract.js';
import { labToolMarker, labToolRegistry } from './lab-tool-markers.js';
import { identifyLabPanels, labPanelId, labPanelJSON } from './lab-panel-identity.js';
import { labManualOriginal } from './lab-panel-mutations.js';
import { filterRemovedLabPanels, filterRemovedLabDates, labDateDeletionState } from './lab-panel-deletions.js';
import { getMarkerInputUnits } from './unit-profiles.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { parseLabResultSnapshot, projectLabResult, reviewedLabResultCommand } from './lab-result-commands.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { commitLabMarkerCommand } from './lab-marker-record-store.js';
import type { LabMarkerSource } from './lab-entry.js';
import { applyLabMarkerCommand } from './lab-marker-mutations.js';

const dependencyKeys = ['biochemistry.glucose', 'diabetes.insulin', 'hormones.insulin', 'diabetes.insulin_d', 'diabetes.homaIR'];
const conflict = (): never => { throw Object.assign(new Error('This sample, marker or its shared context changed since review. Read it again. No change was applied.'), { noChangeApplied: true }); };
function visibleData(data: ProfileData): ProfileData {
  return { ...data, entries: filterRemovedLabDates(filterRemovedLabPanels(identifyLabPanels(data.entries || []), data.labPanelTombstones), data) as ProfileData['entries'] };
}
function select(data: ProfileData, id: string) {
  const dot = id.indexOf('.'), markerKey = id.slice(dot + 1), panelId = id.slice(0, dot);
  const matches = (data.entries || []).filter(entry => labPanelId(entry) === panelId);
  if (matches.length !== 1 || !Object.hasOwn(matches[0]!.markers || {}, markerKey)) throw new Error('This sample result is missing or ambiguous. Read the result list again.');
  return { entry: matches[0]!, markerKey };
}
function sourceKind(source: LabMarkerSource | null | undefined, entry?: LabEntry): LabResultRecord['source'] {
  return source?.file || source?.snapshotId || !source && (entry?.sourceFile || entry?.sourceFiles?.length) ? 'Imported report' : source ? 'Manual entry' : 'Unspecified';
}
function publicRecord(data: ProfileData, id: string, categories = labToolRegistry(data), selected = select(data, id)): LabResultRecord {
  const { entry, markerKey } = selected, marker = labToolMarker(data, markerKey, categories), value = entry.markers?.[markerKey];
  if (typeof value !== 'number' || !Number.isFinite(value) || id.length > 160) throw new Error('Review this result in its normal editor.');
  const original = labManualOriginal(data, entry, markerKey), source = entry.markerSources?.[markerKey], unit = String(marker.value.unit || '');
  return { id, panelId: labPanelId(entry), date: entry.date, markerKey, markerName: marker.name, category: String(marker.category.label || marker.categoryKey), value, unit,
    ...(source?.reported === true ? { reported: true } : {}),
    inputUnits: marker.usesStandardUnit && getMarkerInputUnits(markerKey, 'EU', unit).length ? getMarkerInputUnits(markerKey, 'EU', unit) : [unit],
    specimen: typeof entry.specimen === 'string' ? entry.specimen : null,
    sampleTime: typeof entry.context?.sampleTime === 'string' ? entry.context.sampleTime : null, fasting: typeof entry.context?.fasting === 'boolean' ? entry.context.fasting : null,
    source: sourceKind(source, entry), linkedReport: !!(source?.file || source?.snapshotId), manuallyEdited: source?.manuallyEdited === true,
    originalValue: typeof original?.value === 'number' ? original.value : null, originalSource: typeof original?.value === 'number' ? sourceKind(original.source, entry) : null };
}
function relatedValues(data: ProfileData, entry: LabEntry, markerKey: string, categories = labToolRegistry(data)): LabResultValue[] {
  if (!dependencyKeys.slice(0, 4).includes(markerKey)) return [];
  if (!labToolMarker(data, markerKey, categories).usesStandardUnit) throw new Error('Review the custom unit of this linked calculation in the marker editor.');
  return dependencyKeys.filter(key => key !== markerKey && (key === 'diabetes.homaIR' || typeof entry.markers?.[key] === 'number')).map(key => {
    // A linked calculation is editable only when all affected groups are enabled.
    const marker = labToolMarker(data, key, categories);
    if (!marker.usesStandardUnit) throw new Error('Review the custom units of this linked calculation in the marker editor.');
    return { markerKey: key, markerName: marker.name, unit: String(marker.value.unit || ''), value: entry.markers?.[key] ?? null,
      ...(entry.markerSources?.[key]?.reported === true ? { reported: true } : {}),
      ...(typeof entry.deletedMarkers?.[key] === 'number' && entry.deletedMarkers[key]! > 0 ? { suppressed: true } : {}) };
  });
}
export function canDiscloseLabResult(data: ProfileData, id: string) {
  try { const visible = visibleData(data), { entry, markerKey } = select(visible, id); publicRecord(visible, id); relatedValues(visible, entry, markerKey); return true; } catch { return false; }
}
export function canDiscloseLabResultReview(data: ProfileData, proposal: AgentDataProposal) {
  try {
    const snapshot = parseLabResultSnapshot(JSON.parse(proposal.baseline));
    for (const row of [snapshot.record, ...snapshot.related]) labToolMarker(data, row.markerKey);
    return true;
  } catch { return false; }
}
async function snapshot(data: ProfileData, id: string): Promise<LabResultSnapshot> {
  const visible = visibleData(data), { entry, markerKey } = select(visible, id), record = publicRecord(visible, id), related = relatedValues(visible, entry, markerKey), key = `${markerKey}:${entry.date}`;
  const selected = { rows: data.entries.filter(row => row.date === entry.date), customMarkers: data.customMarkers ?? null, markerLabels: data.markerLabels ?? null,
    categoryLabels: data.categoryLabels ?? null, manualValues: data.manualValues ?? null, note: data.markerValueNotes?.[key] ?? null,
    deletion: labDateDeletionState(data, entry.date), panelStates: data.labPanelTombstones ?? null };
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(labPanelJSON(selected)));
  if (!canDiscloseLabResult(data, id)) throw new Error('This result or an affected context group is unavailable.');
  return { version: 1, record, related, revision: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join(''),
    sharedNote: typeof data.markerValueNotes?.[key] === 'string' ? data.markerValueNotes[key]! : null,
    soleResultOnDate: visible.entries.filter(row => row.date === entry.date && Object.hasOwn(row.markers || {}, markerKey)).length === 1 };
}
export async function readCurrentLabResult(profileId: string, id: string) { return snapshot(await readAgentProfileRecords(profileId), id); }
export async function listCurrentLabResults(profileId: string) {
  const data = visibleData(await readAgentProfileRecords(profileId)), categories = labToolRegistry(data), rows: LabResultRecord[] = [];
  const counts = new Map<string, number>();
  for (const entry of data.entries) { const id = labPanelId(entry); counts.set(id, (counts.get(id) || 0) + 1); }
  for (const entry of data.entries) {
    const panelId = labPanelId(entry);
    if (counts.get(panelId) !== 1) continue;
    for (const markerKey of Object.keys(entry.markers || {})) {
      try { relatedValues(data, entry, markerKey, categories); rows.push(publicRecord(data, `${panelId}.${markerKey}`, categories, { entry, markerKey })); }
      catch { /* An unavailable group, invalid result or unsupported calculation is not disclosed. */ }
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
export async function commitReviewedLabResult(profileId: string, proposal: AgentDataProposal, authorized: () => boolean) {
  const expected = parseLabResultSnapshot(JSON.parse(proposal.baseline)), patch = parseAgentDataPatch(proposal.patch), base = await readAgentProfileRecords(profileId);
  if (!authorized() || !canDiscloseLabResult(base, proposal.recordId)) throw Object.assign(new Error('This lab result or an affected context group is no longer authorized. No change was applied.'), { noChangeApplied: true });
  if (!profileDataValuesEqual(expected, await snapshot(base, proposal.recordId))) conflict();
  const command = reviewedLabResultCommand(proposal, patch), projected = projectLabResult(proposal, patch), actual = structuredClone(visibleData(base));
  applyLabMarkerCommand(actual, command);
  const next = actual.entries.find(row => labPanelId(row) === expected.record.panelId);
  const effects = new Map(projected.effects.map(row => [row.markerKey, row.value]));
  if ((next?.markers?.[command.dotKey] ?? null) !== (projected.after?.value ?? null)
    || expected.related.some(row => (next?.markers?.[row.markerKey] ?? null) !== (effects.has(row.markerKey) ? effects.get(row.markerKey) : row.value))) conflict();
  const categories = labToolRegistry(base), markerKeys = [expected.record.markerKey, ...expected.related.map(row => row.markerKey)];
  const labels = markerKeys.flatMap(markerKey => [{ key: 'markerLabels' as const, id: markerKey, value: base.markerLabels?.[markerKey] ?? null },
    { key: 'categoryLabels' as const, id: markerKey.split('.')[0]!, value: base.categoryLabels?.[markerKey.split('.')[0]!] ?? null }]);
  const allowed = () => authorized() && markerKeys.every(key => { try { labToolMarker(base, key, categories); return true; } catch { return false; } });
  if (!await commitLabMarkerCommand(profileId, base, command, allowed, { expectedContextField: { key: 'customMarkers', value: base.customMarkers ?? null }, expectedProfileMapEntries: labels })) conflict();
  return `Lab result ${proposal.operation === 'revert' ? 'restored to its original imported value' : proposal.operation === 'remove' ? 'removed from the selected sample' : 'corrected in the selected sample'}.`;
}
