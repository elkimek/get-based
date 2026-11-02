// Pure marker commands select one panel and retain its original evidence for Revert.
import type { LabEntryDraft } from './lab-entry.js';
import type { LabPanelMutationData } from './lab-panel-mutations.js';
import { labManualOriginal, rememberLabManualOriginal, selectLabPanel } from './lab-panel-mutations.js';
import { findOrCreateLabEntry, deleteLabEntryMarkerFromImportedData } from './lab-entry-mutations.js';
import { createLabEntry, getLabEntryMarkerValueTimestamp, getLabEntryMarkerTombstoneAt, setLabEntryCollectionContext, setLabEntryMarker } from './lab-entry.js';
import { pickTimestamp } from './data-merge-lab-entries.js';
import { validLabPanelId } from './lab-panel-identity.js';
import { labPanelTombstoneKey } from './lab-panel-deletions.js';
import { clearTombstone } from './data-merge.js';
export interface LabMarkerCommand {
  kind: 'save' | 'edit' | 'remove' | 'revert'; dotKey: string; date: string; panelId?: string;
  newPanel?: boolean; storedValue?: unknown; now?: number; noteText?: unknown;
  collectionContext?: { sampleTime?: unknown; fasting?: unknown };
}
export interface LabMarkerMutationData extends LabPanelMutationData { markerValueNotes?: Record<string, string | null> | null; }
export function applyLabMarkerCommand(data: LabMarkerMutationData, command: LabMarkerCommand) {
  const { dotKey, date, panelId, kind } = command;
  if (command.now !== undefined && (!Number.isFinite(command.now) || command.now < 0)) throw new Error('The lab change time is invalid.');
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(dotKey) || dotKey.split('.').some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('Choose a valid lab marker.');
  labPanelTombstoneKey('date-validation', date);
  if (command.newPanel && (kind !== 'save' || panelId)) throw new Error('Choose an existing sample or explicitly add a new one.');
  if (['save', 'edit'].includes(kind) && (typeof command.storedValue !== 'number' || !Number.isFinite(command.storedValue))) throw new Error('Enter a finite lab value.');
  let entry = command.newPanel ? null : selectLabPanel(data, date, panelId);
  const existed = !!entry;
  if (!entry && (kind !== 'save' || panelId)) return null;
  if (!entry) {
    if (command.newPanel) { entry = { ...createLabEntry(date, { now: command.now }), panelId: globalThis.crypto.randomUUID() }; clearTombstone(data, 'entries', date); (data.entries ||= []).push(entry); }
    else entry = findOrCreateLabEntry(data, date, { now: command.now });
  }
  if (!entry) return null;
  if (panelId && !validLabPanelId(entry.panelId)) entry.panelId = panelId;
  const now = Math.max(command.now ?? Date.now(), existed ? Math.max(pickTimestamp(entry), getLabEntryMarkerValueTimestamp(entry, dotKey), getLabEntryMarkerTombstoneAt(entry, dotKey)) + 1 : 0);
  if (!Number.isFinite(now) || now < 0) throw new Error('The lab change time is invalid.');
  if (kind === 'remove') return deleteLabEntryMarkerFromImportedData(data, entry, dotKey, { now });
  if (kind === 'revert') {
    const original = labManualOriginal(data, entry, dotKey);
    if (!original || original.value === true) return null;
    let source = original.source ? { ...original.source, at: now } : null;
    if (dotKey === 'diabetes.homaIR') { source = { ...(source || { file: null }), at: now, reported: true }; delete source.derivedFrom; }
    if (source) delete source.manuallyEdited;
    setLabEntryMarker(entry, dotKey, original.value, { now, source });
    if (entry.manualOriginals) entry.manualOriginals[dotKey] = null;
    if ((data.entries || []).filter(row => row.date === date && Object.hasOwn(row.markers || {}, dotKey)).length === 1 && data.manualValues) data.manualValues[`${dotKey}:${date}`] = null;
  } else {
    rememberLabManualOriginal(data, entry, dotKey);
    const source = entry.markerSources?.[dotKey];
    const provenance = source?.snapshotId || source?.file ? { ...source, at: now, manuallyEdited: true } : { file: null, at: now };
    if (dotKey === 'diabetes.homaIR') { Object.assign(provenance, { reported: true }); if ('derivedFrom' in provenance) delete provenance.derivedFrom; }
    setLabEntryMarker(entry, dotKey, command.storedValue, { now, source: provenance });
  }
  if (command.collectionContext) setLabEntryCollectionContext(entry, command.collectionContext, { now });
  if (Object.hasOwn(command, 'noteText')) {
    const text = String(command.noteText || '').slice(0, 500); data.markerValueNotes ||= {};
    const key = `${dotKey}:${date}`; if (text || Object.hasOwn(data.markerValueNotes, key)) data.markerValueNotes[key] = text || null;
  }
  return entry as LabEntryDraft;
}
