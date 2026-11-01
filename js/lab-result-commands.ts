// A bounded, source-private review of one saved marker on one exact sample.
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import { agentDataObject, validAgentDate, validateFieldNames } from '../shared/agent-data-contract.js';
import { validLabPanelId } from './lab-panel-identity.js';
import { validLabToolMarkerKey } from './lab-tool-markers.js';
import { applyLabMarkerCommand } from './lab-marker-mutations.js';
import type { LabMarkerCommand } from './lab-marker-mutations.js';
import { convertUnitInputToCanonical } from './unit-profiles.js';

export interface LabResultValue { markerKey: string; markerName: string; unit: string; value: number | null; reported?: boolean; suppressed?: boolean; }
export interface LabResultRecord extends LabResultValue {
  id: string; panelId: string; date: string; category: string; inputUnits: string[];
  specimen: string | null; sampleTime: string | null; fasting: boolean | null;
  source: 'Imported report' | 'Manual entry' | 'Unspecified'; linkedReport: boolean; manuallyEdited: boolean; originalValue: number | null;
  originalSource: LabResultRecord['source'] | null;
}
export interface LabResultSnapshot {
  version: 1; record: LabResultRecord; revision: string; related: LabResultValue[]; sharedNote: string | null; soleResultOnDate: boolean;
}
export const labResultFields = { value: 'Finite numeric correction', unit: 'Explicit unit from this record inputUnits; required with value. No date, sample, source or collection changes in this operation.' };
export function parseLabResultSnapshot(value: unknown): LabResultSnapshot {
  const source = agentDataObject(value), row = agentDataObject(source.record);
  if (source.version !== 1 || typeof source.revision !== 'string' || !/^[a-f0-9]{64}$/.test(source.revision)
    || typeof row.panelId !== 'string' || !validLabPanelId(row.panelId) || typeof row.markerKey !== 'string' || !validLabToolMarkerKey(row.markerKey)
    || row.id !== `${row.panelId}.${row.markerKey}` || !validAgentDate(row.date)
    || typeof row.value !== 'number' || !Number.isFinite(row.value) || typeof row.unit !== 'string'
    || !Array.isArray(row.inputUnits) || row.inputUnits.some(unit => typeof unit !== 'string')
    || !(row.originalValue === null || typeof row.originalValue === 'number' && Number.isFinite(row.originalValue))
    || !Array.isArray(source.related) || source.related.length > 5 || typeof source.soleResultOnDate !== 'boolean'
    || !(source.sharedNote === null || typeof source.sharedNote === 'string')) throw new Error('Read this exact lab result again before proposing a change.');
  for (const raw of source.related) {
    const item = agentDataObject(raw);
    if (typeof item.markerKey !== 'string' || !validLabToolMarkerKey(item.markerKey) || item.markerKey === row.markerKey || typeof item.unit !== 'string'
      || item.reported !== undefined && typeof item.reported !== 'boolean' || item.suppressed !== undefined && typeof item.suppressed !== 'boolean'
      || !(item.value === null || typeof item.value === 'number' && Number.isFinite(item.value))) throw new Error('Read this lab result again.');
  }
  return source as unknown as LabResultSnapshot;
}
export function displayLabResult(value: unknown): LabResultRecord {
  const source = agentDataObject(value);
  return source.version === 1 ? parseLabResultSnapshot(source).record : source as unknown as LabResultRecord;
}
export function reviewedLabResultCommand(proposal: AgentDataProposal, patch: Record<string, unknown>): LabMarkerCommand {
  const { record: row } = parseLabResultSnapshot(JSON.parse(proposal.baseline));
  if (proposal.resource !== 'labResults' || proposal.recordId !== row.id || !['update', 'remove', 'revert'].includes(proposal.operation)) throw new Error('Read an existing sample result before correcting, removing or reverting it.');
  validateFieldNames(patch, proposal.operation === 'update' ? ['value', 'unit'] : []);
  let storedValue: number | undefined;
  if (proposal.operation === 'update') {
    const comparableUnit = (value: unknown) => String(value).trim().replace(/μ/g, 'µ').replace(/\s+/g, '').toLowerCase();
    const unit = typeof patch.unit === 'string' ? row.inputUnits.find(unit => comparableUnit(unit) === comparableUnit(patch.unit)) : undefined;
    if (typeof patch.value !== 'number' || !Number.isFinite(patch.value) || unit === undefined) throw new Error('Supply a finite value and an explicit unit from inputUnits.');
    storedValue = convertUnitInputToCanonical(row.markerKey, patch.value, unit, 'EU', row.unit);
    if (!Number.isFinite(storedValue)) throw new Error('This value cannot be converted to the saved unit.');
    if (storedValue === row.value) throw new Error('That value is already recorded for this sample.');
  }
  if (proposal.operation === 'revert' && row.originalValue === null) throw new Error('There is no known original imported value to restore for this sample.');
  return { kind: proposal.operation === 'update' ? 'edit' : proposal.operation === 'remove' ? 'remove' : 'revert', date: row.date, panelId: row.panelId, dotKey: row.markerKey, storedValue, now: proposal.recordedAt };
}
export function freezeLabResultPatch(proposal: AgentDataProposal) {
  const patch = JSON.parse(proposal.patch) as Record<string, unknown>, command = reviewedLabResultCommand(proposal, patch);
  return proposal.operation === 'update' ? { value: command.storedValue, unit: parseLabResultSnapshot(JSON.parse(proposal.baseline)).record.unit } : patch;
}
export function projectLabResult(proposal: AgentDataProposal, patch: Record<string, unknown>) {
  const snapshot = parseLabResultSnapshot(JSON.parse(proposal.baseline)), before = snapshot.record, command = reviewedLabResultCommand(proposal, patch);
  const entry = { date: before.date, panelId: before.panelId, markers: Object.fromEntries([before, ...snapshot.related].filter(row => row.value !== null).map(row => [row.markerKey, row.value])),
    markerSources: Object.fromEntries(snapshot.related.filter(row => row.reported).map(row => [row.markerKey, { file: null, reported: true }])),
    deletedMarkers: Object.fromEntries(snapshot.related.filter(row => row.suppressed).map(row => [row.markerKey, 1])),
    manualOriginals: before.originalValue === null ? {} : { [before.markerKey]: { value: before.originalValue, source: null } } };
  const data = { entries: [entry] };
  applyLabMarkerCommand(data, command);
  const after = proposal.operation === 'remove' ? null : { ...before, value: entry.markers[before.markerKey] as number,
    ...(before.markerKey === 'diabetes.homaIR' ? { reported: true } : {}),
    manuallyEdited: proposal.operation === 'update' && before.linkedReport, originalValue: proposal.operation === 'revert' ? null : before.originalValue ?? (!before.manuallyEdited && before.source === 'Imported report' ? before.value : null),
    source: proposal.operation === 'revert' ? before.originalSource || 'Unspecified' : before.linkedReport ? 'Imported report' as const : 'Manual entry' as const };
  const effects = snapshot.related.flatMap(row => {
    const value = entry.markers[row.markerKey] ?? null;
    return row.value === value ? [] : [{ ...row, before: row.value, value }];
  });
  return { before, after, effects, clearsSharedNote: proposal.operation === 'remove' && snapshot.soleResultOnDate && !!snapshot.sharedNote };
}
export function describeLabResult(value: unknown) {
  if (value === null) return 'Remove this result from this sample.';
  const row = displayLabResult(value);
  return [`${row.markerName} · ${row.markerKey}`, `${row.value} ${row.unit}`, `${row.date} · sample ${row.panelId}`,
    `Collection: ${row.specimen || 'specimen unknown'} · ${row.sampleTime || 'time unknown'} · ${row.fasting === null ? 'fasting unknown' : row.fasting ? 'fasting' : 'not fasting'}`,
    `${row.source}${row.manuallyEdited ? ' · manually edited' : ''}`, ...(row.originalValue === null ? [] : [`Original imported value: ${row.originalValue} ${row.unit}`])].join('\n');
}
