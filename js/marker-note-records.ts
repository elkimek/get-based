// Marker annotations retain the ordinary marker/date address and never edit lab evidence.
import type { ProfileData } from '../types/app-state.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';
import type { MarkerNoteResource, MarkerNoteRecord, MarkerNoteSnapshot } from './marker-note-commands.js';
import type { ProfileSaveOptions } from './data-core-types.js';
import { parseAgentDataPatch } from '../shared/agent-data-contract.js';
import { labToolRegistry as registry, labToolMarker as marker, labToolMarkerGroup } from './lab-tool-markers.js';
import { isGroupInAIContext } from './lab-context-settings.js';
import { readAgentProfileRecords } from './agent-profile-record-store.js';
import { profileDataValuesEqual } from './profile-data-writes.js';
import { saveImportedDataForProfile, notifyProfileDataContextChanged } from './data.js';
import { markerNoteAddress, parseMarkerNoteSnapshot, projectMarkerNote, writeMarkerNoteText } from './marker-note-commands.js';

const object = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value);
const conflict = (): never => { throw Object.assign(new Error('This marker, reading or note changed since review. Read it again. No change was applied.'), { noChangeApplied: true }); };
function map(data: ProfileData, resource: MarkerNoteResource) {
  const value = data[resource];
  if (value != null && !object(value)) throw new Error('Review these marker notes in their normal editor.');
  return value || {};
}
export function canDiscloseMarkerNote(data: ProfileData, resource: MarkerNoteResource, id: string) {
  try { marker(data, markerNoteAddress(resource, id).markerKey); return true; } catch { return false; }
}
function labDateRecords(data: ProfileData, date: string) {
  if (!Array.isArray(data.entries)) throw new Error('Review the lab history before editing dated marker notes.');
  return data.entries.filter(entry => entry?.date === date);
}
function noteRecord(data: ProfileData, resource: MarkerNoteResource, id: string, categories = registry(data)): MarkerNoteRecord {
  const { markerKey, date, mapKey } = markerNoteAddress(resource, id), target = marker(data, markerKey, categories), raw = map(data, resource)[mapKey];
  if (raw != null && typeof raw !== 'string') throw new Error('Review this invalid marker note in its normal editor.');
  const values = date ? labDateRecords(data, date).flatMap(row => { const value = row.markers?.[markerKey]; return typeof value === 'number' && Number.isFinite(value) ? [value] : []; }) : [];
  if (date && !values.length) throw new Error('This marker has no saved result on that date. Read its history first.');
  return { id, markerKey, markerName: target.name, category: String(target.category.label || target.categoryKey), text: raw || '',
    ...(date ? { date, values, unit: String(target.value.unit || '') } : {}),
    scope: date ? 'This note applies to all results for this marker on this date, including separate same-day panels.' : 'This note applies to this marker across dates.' };
}
async function snapshot(data: ProfileData, resource: MarkerNoteResource, id: string): Promise<MarkerNoteSnapshot> {
  const categories = registry(data), record = noteRecord(data, resource, id, categories), { markerKey, date, mapKey } = markerNoteAddress(resource, id), { categoryKey } = marker(data, markerKey, categories);
  const selected = { record, saved: map(data, resource)[mapKey] ?? null, definition: data.customMarkers?.[markerKey] ?? null,
    markerLabel: data.markerLabels?.[markerKey] ?? null, categoryLabel: data.categoryLabels?.[categoryKey] ?? null,
    readings: date ? labDateRecords(data, date) : null };
  const serialized = JSON.stringify(selected, (_key, value: unknown) => object(value) ? Object.fromEntries(Object.entries(value as object).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  marker(data, markerKey, categories); // Recheck group disclosure after asynchronous hashing.
  return { version: 1, record, revision: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
}
export async function readCurrentMarkerNote(profileId: string, resource: MarkerNoteResource, id: string) {
  return snapshot(await readAgentProfileRecords(profileId), resource, id);
}
export async function listCurrentMarkerNotes(profileId: string, resource: MarkerNoteResource) {
  const data = await readAgentProfileRecords(profileId), rows: MarkerNoteRecord[] = [], categories = registry(data), existing = map(data, resource);
  for (const [categoryKey, category] of Object.entries(categories)) {
    if (!isGroupInAIContext(labToolMarkerGroup(categoryKey, category))) continue;
    for (const key of Object.keys(category.markers)) {
      const markerKey = `${categoryKey}.${key}`, dates = (data.entries || []).flatMap(entry => typeof entry.markers?.[markerKey] === 'number' ? [entry.date] : []);
      if (resource === 'markerNotes' && (dates.length || Object.hasOwn(existing, markerKey))) rows.push(noteRecord(data, resource, markerKey, categories));
      if (resource === 'markerValueNotes') for (const date of new Set(dates)) rows.push(noteRecord(data, resource, `${date}.${markerKey}`, categories));
    }
  }
  return rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || a.id.localeCompare(b.id));
}
export async function commitReviewedMarkerNote(profileId: string, proposal: AgentDataProposal, authorized: () => boolean) {
  const denied = (): never => { throw Object.assign(new Error('Marker note authorization changed. No change was applied.'), { noChangeApplied: true }); };
  if (!authorized()) denied();
  const resource = proposal.resource as MarkerNoteResource, before = parseMarkerNoteSnapshot(JSON.parse(proposal.baseline));
  const base = await readAgentProfileRecords(profileId);
  if (!authorized() || !canDiscloseMarkerNote(base, resource, proposal.recordId)) denied();
  if (!profileDataValuesEqual(before, await snapshot(base, resource, proposal.recordId))) conflict();
  const { markerKey, date, mapKey } = markerNoteAddress(resource, proposal.recordId), { categoryKey, category } = marker(base, markerKey);
  const { after } = projectMarkerNote(proposal, parseAgentDataPatch(proposal.patch)), next = structuredClone(base);
  next[resource] ||= {}; writeMarkerNoteText(next[resource], mapKey, after.text, resource === 'markerValueNotes');
  let changed = false, revoked = false;
  const options: ProfileSaveOptions = { baseData: base, forceProfileScope: true,
    expectedProfileMapEntries: [{ key: resource, id: mapKey, value: map(base, resource)[mapKey] ?? null },
      { key: 'markerLabels', id: markerKey, value: base.markerLabels?.[markerKey] ?? null }, { key: 'categoryLabels', id: categoryKey, value: base.categoryLabels?.[categoryKey] ?? null }],
    expectedContextField: { key: 'customMarkers', value: base.customMarkers ?? null },
    ...(date ? { expectedLabDateRecords: [{ date, value: labDateRecords(base, date) }] } : {}),
    onContextFieldConflict: () => { changed = true; }, canCommit: () => { if (!authorized() || !isGroupInAIContext(labToolMarkerGroup(categoryKey, category))) revoked = true; return !revoked; } };
  if (!await saveImportedDataForProfile(profileId, next, options)) { if (revoked) denied(); if (changed) conflict(); throw new Error('Could not save the marker note.'); }
  try { notifyProfileDataContextChanged(profileId); } catch { /* Already committed. */ }
  return `${date ? 'Dated marker note' : 'Marker note'} ${after.text ? 'updated' : 'cleared'}.`;
}
