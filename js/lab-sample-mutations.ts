// A sample is an explicit collection, never the first record found on a date.
import type { ProfileData } from '../types/app-state.js';
import type { LabEntry } from '../types/lab-data.js';
import { identifyLabPanels, labPanelId, validLabPanelId, labSampleIdentityRows } from './lab-panel-identity.js';
export { labSampleIdentityRows } from './lab-panel-identity.js';
import { filterRemovedLabDates, filterRemovedLabPanels, labDateDeletionState, recordLabPanelState } from './lab-panel-deletions.js';
import { labManualOriginal, removeLabPanel } from './lab-panel-mutations.js';
import { applyLabMarkerCommand } from './lab-marker-mutations.js';
import { createLabEntry, normalizeLabSampleTime, setLabEntryCollectionContext } from './lab-entry.js';
import { pickTimestamp } from './data-merge-lab-entries.js';
import { validAgentDate } from '../shared/agent-data-contract.js';
import { labSampleCycleChanges } from './lab-sample-cycle.js';
import type { LabSampleCyclePatch } from './lab-sample-cycle.js';

export interface LabSampleCommand extends LabSampleCyclePatch {
  kind: 'add' | 'update' | 'remove'; panelId: string; now: number; newSample?: boolean;
  date?: string; specimen?: string | null; sampleTime?: string | null; fasting?: boolean | null;
  results?: Array<{ markerKey: string; storedValue: number }>;
}
export function activeLabSampleData(data: ProfileData): ProfileData {
  return { ...data, entries: filterRemovedLabDates(filterRemovedLabPanels(identifyLabPanels(data.entries || []), data.labPanelTombstones), data) as LabEntry[] };
}
export function selectLabSample(data: ProfileData, id: string): LabEntry | null {
  if (!validLabPanelId(id)) throw new Error('Choose a valid sample identity.');
  const rows = data.entries.filter(entry => labPanelId(entry) === id);
  if (rows.length > 1) throw new Error('This sample identity is ambiguous. Review the sample history.');
  return rows[0] || null;
}
function rememberCollectionField(entry: LabEntry, field: keyof NonNullable<LabEntry['collectionOriginals']>, value: unknown) {
  const current = entry.collectionOriginals;
  if (current != null && (typeof current !== 'object' || Array.isArray(current))) throw new Error('Review the original collection information for this sample.');
  const originals = entry.collectionOriginals ||= {};
  if (!Object.hasOwn(originals, field)) originals[field] = { value: value ?? null, sourceSnapshotId: entry.collectionContextSources?.[field] || null };
}
function moveSampleNotes(data: ProfileData, entry: LabEntry, destination: string) {
  const source = entry.date;
  for (const markerKey of Object.keys(entry.markers)) {
    const original = labManualOriginal(data, entry, markerKey);
    entry.manualOriginals ||= {};
    if (!Object.hasOwn(entry.manualOriginals, markerKey)) entry.manualOriginals[markerKey] = original as NonNullable<LabEntry['manualOriginals']>[string];
    if (data.entries.some(row => row !== entry && row.date === source && Object.hasOwn(row.markers || {}, markerKey))) continue;
    const from = `${markerKey}:${source}`, to = `${markerKey}:${destination}`, text = data.markerValueNotes?.[from];
    if (text != null && typeof text !== 'string' || data.markerValueNotes?.[to] != null && typeof data.markerValueNotes[to] !== 'string') throw new Error('Review this dated marker note before moving its sample.');
    if (text) {
      if (data.markerValueNotes[to] && data.markerValueNotes[to] !== text) throw new Error('The destination date already has a different note for this marker. Resolve its dated note before moving the sample.');
      data.markerValueNotes[to] = text;
      data.markerValueNotes[from] = null;
    }
    if (data.manualValues && Object.hasOwn(data.manualValues, from)) data.manualValues[from] = null;
  }
}
export function applyLabSampleCommand(data: ProfileData, command: LabSampleCommand): LabEntry {
  if (!validLabPanelId(command.panelId) || !Number.isFinite(command.now) || command.now < 0) throw new Error('The sample identity or change time is invalid.');
  if (command.date !== undefined && !validAgentDate(command.date)) throw new Error('Supply a real collection date.');
  if (command.specimen !== undefined && command.specimen !== null && (typeof command.specimen !== 'string' || !command.specimen.trim() || command.specimen.length > 100)) throw new Error('Supply a specimen description, or null to clear it.');
  if (command.sampleTime !== undefined && command.sampleTime !== null && !normalizeLabSampleTime(command.sampleTime)) throw new Error('Supply a collection time, or null to clear it.');
  if (command.fasting !== undefined && command.fasting !== null && typeof command.fasting !== 'boolean') throw new Error('Fasting must be true, false or unknown.');
  const rawIdentity = labSampleIdentityRows(data, command.panelId);
  data.entries = activeLabSampleData(data).entries;
  let entry = selectLabSample(data, command.panelId);
  if (command.kind === 'add') {
    if (entry || rawIdentity.length || Object.keys(data.labPanelTombstones || {}).some(key => key.startsWith(`${command.panelId}.`))) throw new Error('This sample identity already has history. Read the intended existing sample.');
    if (command.newSample !== true || !command.date || !command.results?.length) throw new Error('A separate new sample needs newSample: true, an explicit date and at least one reported result.');
    entry = { ...createLabEntry(command.date, { now: command.now }), panelId: command.panelId };
  } else if (!entry) throw new Error('This sample is no longer available. Read its history again.');
  const destination = command.date || entry.date, deletion = labDateDeletionState(data, destination);
  const clearedAt = typeof deletion.clearedAt === 'number' && Number.isFinite(deletion.clearedAt) ? deletion.clearedAt : 0;
  const deletedAt = typeof deletion.deletedAt === 'number' && Number.isFinite(deletion.deletedAt) ? deletion.deletedAt : 0;
  if (command.kind !== 'remove' && deletion.deleted && clearedAt <= deletedAt) throw new Error('This collection date has an active whole-date removal. Restore that date before adding or moving a sample there.');
  const observedClock = Object.values(data.labPanelTombstones || {}).reduce((clock, row) => Math.max(clock, row.updatedAt), 0);
  const now = Math.max(command.now, pickTimestamp(entry) + 1, observedClock + 1);
  if (!Number.isFinite(now)) throw new Error('The sample history has an invalid clock.');
  if (command.kind === 'remove') { removeLabPanel(data, entry, now); return entry; }
  if (command.kind === 'add') data.entries.push(entry);
  entry.panelId = command.panelId;
  let changed = command.kind === 'add';
  if (destination !== entry.date) {
    moveSampleNotes(data, entry, destination);
    rememberCollectionField(entry, 'date', entry.date);
    recordLabPanelState(data, entry, true, now);
    entry.date = destination;
    recordLabPanelState(data, entry, false, now);
    changed = true;
  }
  if (command.specimen !== undefined && (entry.specimen ?? null) !== command.specimen) {
    if (command.kind === 'update') rememberCollectionField(entry, 'specimen', entry.specimen);
    if (command.specimen === null) delete entry.specimen; else entry.specimen = command.specimen.trim();
    if (entry.collectionContextSources) delete entry.collectionContextSources.specimen;
    changed = true;
  }
  const context: { sampleTime?: string | null; fasting?: boolean | null } = {};
  for (const field of ['sampleTime', 'fasting'] as const) if (command[field] !== undefined && (entry.context?.[field] ?? null) !== command[field]) {
    if (command.kind === 'update') rememberCollectionField(entry, field, entry.context?.[field]);
    Object.assign(context, { [field]: command[field] });
  }
  if (Object.keys(context).length) { setLabEntryCollectionContext(entry, context, { now }); changed = true; }
  const cycle = labSampleCycleChanges(entry.context, command);
  for (const [field, value] of Object.entries(cycle)) {
    if (command.kind === 'update') rememberCollectionField(entry, field as keyof NonNullable<LabEntry['collectionOriginals']>, entry.context?.[field]);
    // Explicit nulls survive merging with an older replica's context object.
    entry.context ||= {}; entry.context[field] = value;
    if (entry.collectionContextSources && Object.hasOwn(entry.collectionContextSources, field)) { delete entry.collectionContextSources[field]; }
    changed = true;
  }
  const seen = new Set<string>();
  const existingKeys = new Set(Object.keys(entry.markers));
  for (const result of [...(command.results || [])].sort((a, b) => Number(a.markerKey === 'diabetes.homaIR') - Number(b.markerKey === 'diabetes.homaIR'))) {
    if (seen.has(result.markerKey) || existingKeys.has(result.markerKey) && typeof entry.markers[result.markerKey] === 'number') throw new Error('This sample already contains that result. Use its exact labResults correction tool.');
    seen.add(result.markerKey);
    // A later explicitly reported derived value replaces only the intermediate
    // calculation created by this same batch, never a pre-existing saved result.
    if (!existingKeys.has(result.markerKey) && Object.hasOwn(entry.markers, result.markerKey)) { delete entry.markers[result.markerKey]; if (entry.markerSources) delete entry.markerSources[result.markerKey]; }
    if (!applyLabMarkerCommand(data, { kind: 'save', panelId: command.panelId, dotKey: result.markerKey, date: entry.date, storedValue: result.storedValue, now })) throw new Error('Could not add the result to this sample.');
    changed = true;
  }
  if ([...seen].some(key => key === 'biochemistry.glucose' || key === 'diabetes.insulin') && !seen.has('diabetes.homaIR')
    && typeof entry.markers['diabetes.homaIR'] === 'number' && !entry.markerSources?.['diabetes.homaIR']) {
    entry.markerSources ||= {};
    entry.markerSources['diabetes.homaIR'] = { file: null, at: now, derivedFrom: ['biochemistry.glucose', 'diabetes.insulin'] };
  }
  if (!changed) throw new Error('Those collection facts are already recorded for this sample.');
  entry.updatedAt = now;
  return entry;
}
