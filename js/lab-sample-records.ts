// Source-private sample snapshots, frozen plans and guarded domain persistence.
import type { ProfileData } from '../types/app-state.js';
import type { LabEntry } from '../types/lab-data.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { LabSampleRecord, LabSampleSnapshot, LabSamplePlan, LabSampleValue } from './lab-sample-proposals.js';
import { parseAgentDataPatch, validAgentDate } from '../shared/agent-data-contract.js';
import { labToolMarker, labToolRegistry } from './lab-tool-markers.js';
import { labPanelId, labPanelJSON } from './lab-panel-identity.js';
import { labDateDeletionState } from './lab-panel-deletions.js';
import { activeLabSampleData, applyLabSampleCommand, labSampleIdentityRows, selectLabSample } from './lab-sample-mutations.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { parseLabSampleSnapshot, reviewedLabSampleCommand, projectLabSample } from './lab-sample-proposals.js';
import { getMarkerInputUnits, convertUnitInputToCanonical } from './unit-profiles.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { commitLabSampleCommand } from './lab-sample-record-store.js';
import { labSampleCycleFacts, LAB_SAMPLE_CYCLE_FIELDS } from './lab-sample-cycle.js';
import { CONTEXT_SOURCE_IDS, isContextSourceEnabled } from './context-source-registry.js';

const conflict = (): never => { throw Object.assign(new Error('This sample, destination date or shared context changed since review. Read it again. No change was applied.'), { noChangeApplied: true }); };
function publicSample(data: ProfileData, entry: LabEntry, enforceDisclosure = true): LabSampleRecord {
  const categories = labToolRegistry(data);
  const results: LabSampleValue[] = Object.entries(entry.markers || {}).map(([key, value]) => {
    const [category, name] = key.split('.') as [string, string];
    const definition = categories[category]?.markers[name];
    if (!definition || !(value === null || typeof value === 'number' && Number.isFinite(value))) throw new Error('Review this sample’s marker definitions and values in its normal editor.');
    if (enforceDisclosure) labToolMarker(data, key, categories);
    const source = entry.markerSources?.[key], origin = source?.derivedFrom?.length ? 'Calculated from this sample' : source?.file || source?.snapshotId ? `Imported report${source.manuallyEdited ? ' · manually edited' : ''}` : source ? 'Manual entry' : entry.sourceFile || entry.sourceFiles?.length ? 'Imported report' : 'Unspecified';
    return [key, value, String(definition.unit || ''), String(data.markerLabels?.[key] || definition.name || name), origin];
  });
  if (!validAgentDate(entry.date)) throw new Error('Review this sample’s collection date.');
  const originals = entry.collectionOriginals;
  const includeCycle = !enforceDisclosure || isContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS);
  const fields = ['date', 'specimen', 'sampleTime', 'fasting', ...(includeCycle ? [...LAB_SAMPLE_CYCLE_FIELDS, 'cyclePhaseSource'] : [])];
  return { id: labPanelId(entry), date: entry.date, specimen: typeof entry.specimen === 'string' ? entry.specimen : null,
    sampleTime: typeof entry.context?.sampleTime === 'string' ? entry.context.sampleTime : null, fasting: typeof entry.context?.fasting === 'boolean' ? entry.context.fasting : null,
    ...(includeCycle ? { cycle: labSampleCycleFacts(entry.context) } : {}),
    collectionEdited: originals && typeof originals === 'object' ? fields.filter(key => Object.hasOwn(originals, key)) : [], results: results.sort((a, b) => a[0].localeCompare(b[0])) };
}
async function snapshot(data: ProfileData, id: string, requestedDates: string[] = []): Promise<LabSampleSnapshot> {
  const entry = selectLabSample(activeLabSampleData(data), id), record = entry ? publicSample(data, entry) : null;
  const dates = [...new Set([...(record ? [record.date] : []), ...requestedDates])].sort();
  if (dates.length > 2 || dates.some(date => !validAgentDate(date))) throw new Error('Invalid sample review dates.');
  const keys = record?.results.map(row => row[0]) || [];
  const selected = { identity: labSampleIdentityRows(data, id), rows: (data.entries || []).filter(row => dates.includes(row.date)),
    definitions: data.customMarkers ?? null, labels: data.markerLabels ?? null, categoryLabels: data.categoryLabels ?? null,
    manualValues: data.manualValues ?? null, notes: data.markerValueNotes ?? null, panelStates: data.labPanelTombstones ?? null,
    deletions: dates.map(date => labDateDeletionState(data, date)) };
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(labPanelJSON(selected)));
  keys.forEach(key => labToolMarker(data, key));
  return { version: 2, id, record, dates, revision: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
}
export async function readCurrentLabSample(profileId: string, id: string) {
  const value = await snapshot(await readAgentProfileRecords(profileId), id); return value.record ? value : null;
}
export async function createCurrentLabSampleSnapshot(profileId: string, id: string) {
  const value = await snapshot(await readAgentProfileRecords(profileId), id);
  if (value.record) throw new Error('This sample already exists. Read it before editing.'); return value;
}
export async function listCurrentLabSamples(profileId: string) {
  const data = activeLabSampleData(await readAgentProfileRecords(profileId)), rows: LabSampleRecord[] = [], counts = new Map<string, number>();
  for (const entry of data.entries) { const id = labPanelId(entry); counts.set(id, (counts.get(id) || 0) + 1); }
  for (const entry of data.entries) if (counts.get(labPanelId(entry)) === 1) { try { rows.push(publicSample(data, entry)); } catch { /* Disabled or ambiguous sample results are not disclosed. */ } }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}
function note(data: ProfileData, markerKey: string, date: string) {
  const value = data.markerValueNotes?.[`${markerKey}:${date}`];
  if (value != null && typeof value !== 'string') throw new Error('Review this dated marker note before changing its sample.');
  return value || null;
}
function plan(data: ProfileData, next: ProfileData, before: LabSampleRecord | null, after: LabSampleRecord | null): LabSamplePlan {
  const oldRows = new Map((before?.results || []).map(row => [row[0], row])), newRows = new Map((after?.results || []).map(row => [row[0], row]));
  const keys = [...new Set([...oldRows.keys(), ...newRows.keys()])], dates = [...new Set([before?.date, after?.date].filter((date): date is string => !!date))];
  const results = keys.flatMap(markerKey => {
    const before = oldRows.get(markerKey) || null, after = newRows.get(markerKey) || null;
    return profileDataValuesEqual(before, after) ? [] : [{ markerKey, before, after }];
  });
  const notes = dates.flatMap(date => keys.flatMap(markerKey => {
    const before = note(data, markerKey, date), after = note(next, markerKey, date);
    return before === after ? [] : [{ markerKey, date, before, after }];
  }));
  const facts = after ? { date: after.date, specimen: after.specimen, sampleTime: after.sampleTime, fasting: after.fasting, ...(after.cycle ? { cycle: after.cycle } : {}), collectionEdited: after.collectionEdited } : null;
  const contextNotes = before && after && before.date !== after.date ? keys.flatMap(markerKey => {
    const from = note(data, markerKey, before.date), to = note(next, markerKey, after.date);
    return from === to ? [] : [{ markerKey, before: from, after: to }];
  }) : [];
  return { after: facts, results, notes, contextNotes };
}
function freezePatch(data: ProfileData, proposal: AgentDataProposal) {
  const patch = parseAgentDataPatch(proposal.patch); reviewedLabSampleCommand(proposal);
  if (LAB_SAMPLE_CYCLE_FIELDS.some(field => Object.hasOwn(patch, field)) && !isContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS)) throw new Error('Cycle context is disabled. No cycle change can be proposed through this connection.');
  if (Array.isArray(patch.results)) patch.results = patch.results.map(raw => {
    const row = raw as { markerKey: string; value: number; unit: string }, marker = labToolMarker(data, row.markerKey), canonical = String(marker.value.unit || '');
    const units = marker.usesStandardUnit ? getMarkerInputUnits(row.markerKey, 'EU', canonical) : [canonical];
    if (!units.length) units.push(canonical);
    const comparable = (unit: string) => unit.trim().replace(/μ/g, 'µ').replace(/\s+/g, '').toLowerCase(), unit = units.find(unit => comparable(unit) === comparable(row.unit));
    if (unit === undefined) throw new Error(`Use a registered unit for ${marker.name}: ${units.join(', ') || '(dimensionless)'}.`);
    const value = convertUnitInputToCanonical(row.markerKey, row.value, unit, 'EU', canonical);
    if (!Number.isFinite(value)) throw new Error('This result cannot be converted to the saved unit.');
    return { markerKey: row.markerKey, value, unit: canonical };
  });
  if (typeof patch.specimen === 'string') patch.specimen = patch.specimen.trim();
  return JSON.stringify(patch);
}
function computedReview(data: ProfileData, proposal: AgentDataProposal) {
  const before = selectLabSample(activeLabSampleData(data), proposal.recordId), next = structuredClone(data), command = reviewedLabSampleCommand(proposal);
  const entry = applyLabSampleCommand(next, command), current = before ? publicSample(activeLabSampleData(data), before) : null;
  const after = command.kind === 'remove' ? null : publicSample(next, entry);
  return { command, after, plan: plan(data, next, current, after) };
}
export async function prepareReviewedLabSample(profileId: string, proposal: AgentDataProposal) {
  const expected = parseLabSampleSnapshot(JSON.parse(proposal.baseline)), data = await readAgentProfileRecords(profileId);
  if (!profileDataValuesEqual(expected, await snapshot(data, proposal.recordId))) conflict();
  proposal.patch = freezePatch(data, proposal);
  const computed = computedReview(data, proposal), dates = computed.after ? [computed.after.date] : [];
  const frozen = await snapshot(data, proposal.recordId, dates); frozen.plan = computed.plan;
  proposal.baseline = JSON.stringify(frozen);
  if (proposal.baseline.length > 64000) throw new Error('This sample review needs more than one bounded tool response. Use its editor for now.');
  projectLabSample(proposal);
}
export function canDiscloseLabSampleReview(data: ProfileData, proposal: AgentDataProposal) {
  try {
    const snapshot = parseLabSampleSnapshot(JSON.parse(proposal.baseline));
    if (!isContextSourceEnabled(CONTEXT_SOURCE_IDS.INSIGHT_CARDS) && (snapshot.record?.cycle || snapshot.plan?.after?.cycle
      || LAB_SAMPLE_CYCLE_FIELDS.some(field => Object.hasOwn(parseAgentDataPatch(proposal.patch), field)))) return false;
    const keys = new Set([...(snapshot.record?.results.map(row => row[0]) || []), ...(snapshot.plan?.results.map(row => row.markerKey) || [])]);
    keys.forEach(key => labToolMarker(data, key)); return true;
  } catch { return false; }
}
export async function commitReviewedLabSample(profileId: string, proposal: AgentDataProposal, authorized: () => boolean) {
  const expected = parseLabSampleSnapshot(JSON.parse(proposal.baseline)), data = await readAgentProfileRecords(profileId), { plan: reviewed, ...before } = expected;
  if (!authorized() || !canDiscloseLabSampleReview(data, proposal)) throw Object.assign(new Error('This sample or one of its result groups is no longer authorized. No change was applied.'), { noChangeApplied: true });
  if (!profileDataValuesEqual(before, await snapshot(data, proposal.recordId, expected.dates))) conflict();
  const command = reviewedLabSampleCommand(proposal), patch = parseAgentDataPatch(proposal.patch);
  for (const raw of Array.isArray(patch.results) ? patch.results : []) {
    const row = raw as { markerKey: string; unit: string };
    if (row.unit !== String(labToolMarker(data, row.markerKey).value.unit || '')) conflict();
  }
  if (!profileDataValuesEqual(reviewed, computedReview(data, proposal).plan)) conflict();
  const labels: NonNullable<Parameters<typeof commitLabSampleCommand>[4]>['expectedProfileMapEntries'] = [];
  const keys = new Set([...(expected.record?.results.map(row => row[0]) || []), ...(reviewed?.results.map(row => row.markerKey) || [])]);
  for (const markerKey of keys) {
    labels.push({ key: 'markerLabels', id: markerKey, value: data.markerLabels?.[markerKey] ?? null });
    const category = markerKey.split('.')[0]!; labels.push({ key: 'categoryLabels', id: category, value: data.categoryLabels?.[category] ?? null });
  }
  await commitLabSampleCommand(profileId, data, command, () => authorized() && canDiscloseLabSampleReview(data, proposal), {
    expectedContextField: { key: 'customMarkers', value: data.customMarkers ?? null }, expectedProfileMapEntries: labels });
  return `Lab sample ${proposal.operation === 'add' ? 'created with its reported results' : proposal.operation === 'remove' ? 'removed' : 'updated'}.`;
}

export async function readLabSampleForEditor(profileId: string, id: string) {
  const data = await readAgentProfileRecords(profileId), entry = selectLabSample(activeLabSampleData(data), id);
  if (!entry) throw new Error('This sample is no longer available.');
  return { data, record: publicSample(data, entry, false) };
}
