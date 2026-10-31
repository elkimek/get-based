import { agentDataObject, validAgentDate, validateFieldNames } from '../shared/agent-data-contract.js';
import type { AgentDataProposal } from '../shared/agent-data-contract.js';

export type MarkerNoteResource = 'markerNotes' | 'markerValueNotes';
export interface MarkerNoteRecord {
  id: string; markerKey: string; markerName: string; category: string;
  text: string; date?: string; values?: number[]; unit?: string; scope: string;
}
export interface MarkerNoteSnapshot { version: 1; record: MarkerNoteRecord; revision: string; }
export const markerNoteFields = { text: 'Explicit replacement text; remove clears the note. Marker notes: up to 4000 characters; dated value notes: up to 500 characters.', appendText: 'Only the new text to append. Native code preserves the existing note exactly; the same final length limits apply.' };
export function reviewedNoteText(before: unknown, patch: Record<string, unknown>, maximum: number): string {
  validateFieldNames(patch, ['text', 'appendText']);
  if (Object.keys(patch).length !== 1) throw new Error('Choose replacement text or appendText, never both.');
  const append = Object.hasOwn(patch, 'appendText'), value = append ? patch.appendText : patch.text;
  if (typeof before !== 'string' || typeof value !== 'string' || !value.trim()) throw new Error('Supply bounded note text, or use remove to clear it.');
  const after = append && before.length ? `${before}\n\n${value.trim()}` : value.trim();
  if (after.length > maximum) throw new Error('The resulting note exceeds its length limit. Use the native editor.');
  return after;
}
export function markerNoteAddress(resource: MarkerNoteResource, id: string) {
  const date = resource === 'markerValueNotes' ? id.slice(0, 10) : undefined;
  const markerKey = resource === 'markerValueNotes' ? id.slice(11) : id;
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(markerKey) || markerKey.split('.').some(key => ['constructor', 'prototype', '__proto__'].includes(key))
    || resource === 'markerValueNotes' && (id[10] !== '.' || !validAgentDate(date))) throw new Error('Read the exact marker note identity first.');
  return { markerKey, date, mapKey: date ? `${markerKey}:${date}` : markerKey };
}
export function parseMarkerNoteSnapshot(value: unknown): MarkerNoteSnapshot {
  const source = agentDataObject(value), record = agentDataObject(source.record);
  if (source.version !== 1 || typeof source.revision !== 'string' || !/^[a-f0-9]{64}$/.test(source.revision)
    || typeof record.id !== 'string' || typeof record.markerKey !== 'string' || typeof record.markerName !== 'string' || typeof record.text !== 'string') throw new Error('Read this marker note again before proposing a change.');
  return source as unknown as MarkerNoteSnapshot;
}
export function projectMarkerNote(proposal: AgentDataProposal, patch: Record<string, unknown>) {
  const snapshot = parseMarkerNoteSnapshot(JSON.parse(proposal.baseline)), before = snapshot.record;
  const resource = proposal.resource as MarkerNoteResource, address = markerNoteAddress(resource, proposal.recordId);
  if (before.id !== proposal.recordId || before.markerKey !== address.markerKey || before.date !== address.date) throw new Error('The marker note identity changed.');
  if (!['update', 'remove'].includes(proposal.operation)) throw new Error('A marker note supports update or remove.');
  validateFieldNames(patch, proposal.operation === 'remove' ? [] : ['text', 'appendText']);
  if (proposal.operation === 'remove') return { before, after: { ...before, text: '' } };
  return { before, after: { ...before, text: reviewedNoteText(before.text, patch, resource === 'markerValueNotes' ? 500 : 4000) } };
}
export function displayMarkerNote(value: unknown): MarkerNoteRecord {
  const source = agentDataObject(value);
  return source.version === 1 ? parseMarkerNoteSnapshot(source).record : source as unknown as MarkerNoteRecord;
}
/** Keep ordinary sync intent: global notes use map deletion; value notes use null. */
export function writeMarkerNoteText(map: Record<string, string | null>, key: string, text: string, dated = false) {
  if (text) map[key] = text;
  else if (dated) map[key] = null;
  else delete map[key];
}
export function describeMarkerNote(value: unknown) {
  const row = displayMarkerNote(value);
  return [`${row.markerName} · ${row.markerKey}${row.date ? ` · ${row.date}` : ''}`, ...(row.values?.length ? [`Recorded values: ${row.values.join(', ')} ${row.unit || ''}`] : []), row.scope, row.text || 'Empty note'].join('\n');
}
