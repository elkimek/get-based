// data-merge-lab-entries.js — Lab-entry freshness and reconciliation.

import {
  LAB_ENTRY_MARKER_TOMBSTONES,
  normalizeTimestamp,
  getLabEntryMarkerTombstoneAt,
  getLabEntryMarkerTombstones,
  getLabEntryMarkerValueTimestamp,
  labEntryMarkerAffectsHOMAIR,
  recalculateLabEntryHOMAIR,
} from './lab-entry.js';
import type { LabEntryDraft, LabMarkerSource } from './lab-entry.js';
import { expandLabPanelRows, identifyLabPanels, labPanelEvidence, labPanelId, labPanelJSON, labPanelsHaveDistinctCollections, packLabPanelRows, validLabPanelId } from './lab-panel-identity.js';
import { filterRemovedLabPanels, mergeLabPanelTombstones } from './lab-panel-deletions.js';
export { normalizeTimestamp } from './lab-entry.js';

export interface LabMergeData {
  entries?: LabEntryDraft[] | null;
  _deleted?: Record<string, readonly unknown[] | null | undefined> | null;
  [key: string]: unknown;
}

type OptionalLabEntry = LabEntryDraft | null | undefined;


export const FRESH_LOCAL_LAB_ENTRY_TTL_MS = 2 * 60 * 1000;

const TIMESTAMP_FIELDS = [
  'updatedAt',
  'endedAt',
  'startedAt',
  'capturedAt',
  'takenAt',
  'savedAt',
  'loggedAt',
  'createdAt',
  'importedAt',
  'addedAt',
  'at',
];


// Pick a comparable timestamp for conflict resolution. Higher wins. Tries
// the most recently-edited signal first, then creation/capture fields that
// several synced array surfaces use. Returns 0 if nothing recognizable is
// present so older/foreign records can still merge without throwing.
export function pickTimestamp(rec: unknown): number {
  if (!rec || typeof rec !== 'object') return 0;
  if (Object.hasOwn(rec, 'labPanelBundle')) return Math.max(0, ...expandLabPanelRows([rec as LabEntryDraft]).map(pickTimestamp));
  for (const field of TIMESTAMP_FIELDS) {
    const ts = normalizeTimestamp((rec as Record<string, unknown>)[field]);
    if (ts !== null) return ts;
  }
  if (typeof (rec as Record<string, unknown>).date === 'string') {
    const parsed = Date.parse((rec as { date: string }).date);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

// Shared freshness ordering for id-keyed array records. Positive means `a`
// is newer than `b`, negative means older, zero means no winner. Callers
// intentionally treat zero as "keep the local/current record" so a stale
// pull cannot undo a just-saved local edit when timestamps tie or are absent.
export function compareRecordFreshness(a: unknown, b: unknown) {
  const aTs = pickTimestamp(a);
  const bTs = pickTimestamp(b);
  if (aTs > bTs) return 1;
  if (aTs < bTs) return -1;
  return 0;
}

export function pickFresherRecord<T, U>(current: T, candidate: U): T | U {
  return compareRecordFreshness(candidate, current) > 0 ? candidate : current;
}

export function hasExplicitTimestamp(rec: unknown) {
  if (!rec || typeof rec !== 'object') return false;
  return TIMESTAMP_FIELDS.some(field => normalizeTimestamp((rec as Record<string, unknown>)[field]) !== null);
}

function mergeSourceFiles(a: LabEntryDraft, b: LabEntryDraft) {
  const files: unknown[] = [];
  for (const item of [a?.sourceFiles, a?.sourceFile, b?.sourceFiles, b?.sourceFile]) {
    if (Array.isArray(item)) {
      for (const file of item) if (file && !files.includes(file)) files.push(file);
    } else if (item && !files.includes(item)) {
      files.push(item);
    }
  }
  return files;
}

export function mergeLabEntry(existing: OptionalLabEntry, incoming: LabEntryDraft): LabEntryDraft;
export function mergeLabEntry(existing: LabEntryDraft, incoming: OptionalLabEntry): LabEntryDraft;
export function mergeLabEntry(existing: OptionalLabEntry, incoming: OptionalLabEntry): OptionalLabEntry;
export function mergeLabEntry(existing: OptionalLabEntry, incoming: OptionalLabEntry) {
  if (!existing || typeof existing !== 'object') return incoming;
  if (!incoming || typeof incoming !== 'object') return existing;
  const plain = (entry: LabEntryDraft) => { const { panelId: _id, ...rest } = entry; return rest; };
  if (labPanelJSON(plain(existing)) === labPanelJSON(plain(incoming))) {
    const result = structuredClone(existing), panelId = existing.panelId || incoming.panelId;
    if (validLabPanelId(panelId)) result.panelId = panelId;
    return result;
  }
  const existingTs = pickTimestamp(existing);
  const incomingTs = pickTimestamp(incoming);
  const incomingWins = incomingTs >= existingTs;
  const base = incomingWins ? { ...existing, ...incoming } : { ...incoming, ...existing };
  const markers: Record<string, unknown> = {};
  const markerSources: Record<string, LabMarkerSource | null | undefined> = {};
  const manualOriginals: Record<string, unknown> = {};
  const markerTombstones: Record<string, number> = {};
  const existingMarkers = existing.markers && typeof existing.markers === 'object' ? existing.markers : {};
  const incomingMarkers = incoming.markers && typeof incoming.markers === 'object' ? incoming.markers : {};
  const existingSources = existing.markerSources && typeof existing.markerSources === 'object' ? existing.markerSources : {};
  const incomingSources = incoming.markerSources && typeof incoming.markerSources === 'object' ? incoming.markerSources : {};
  const existingTombstones = getLabEntryMarkerTombstones(existing);
  const incomingTombstones = getLabEntryMarkerTombstones(incoming);
  const markerKeys = new Set([
    ...Object.keys(existingMarkers),
    ...Object.keys(incomingMarkers),
    ...Object.keys(existingTombstones),
    ...Object.keys(incomingTombstones),
  ]);
  let homaIRInputChanged = false;
  let homaIRInputDeleted = false;
  for (const key of markerKeys) {
    const hasExisting = Object.prototype.hasOwnProperty.call(existingMarkers, key);
    const hasIncoming = Object.prototype.hasOwnProperty.call(incomingMarkers, key);
    const existingValueTs = hasExisting ? getLabEntryMarkerValueTimestamp(existing, key) : 0;
    const incomingValueTs = hasIncoming ? getLabEntryMarkerValueTimestamp(incoming, key) : 0;
    const deleteTs = Math.max(
      getLabEntryMarkerTombstoneAt(existing, key),
      getLabEntryMarkerTombstoneAt(incoming, key)
    );
    const valueTs = Math.max(existingValueTs, incomingValueTs);
    if (deleteTs && deleteTs >= valueTs) {
      markerTombstones[key] = deleteTs;
      if (labEntryMarkerAffectsHOMAIR(key)) {
        homaIRInputChanged = true;
        homaIRInputDeleted = true;
      }
      continue;
    }
    if (hasExisting && hasIncoming) {
      const markerIncomingWins = incomingValueTs > existingValueTs
        || (incomingValueTs === existingValueTs && incomingWins);
      markers[key] = markerIncomingWins ? incomingMarkers[key] : existingMarkers[key];
      const sources = markerIncomingWins ? incomingSources : existingSources;
      const original = (markerIncomingWins ? incoming.manualOriginals : existing.manualOriginals)?.[key];
      if (Object.hasOwn((markerIncomingWins ? incoming.manualOriginals : existing.manualOriginals) || {}, key)) manualOriginals[key] = structuredClone(original);
      if (Object.prototype.hasOwnProperty.call(sources, key)) markerSources[key] = sources[key];
      else if (Object.is(existingMarkers[key], incomingMarkers[key])) {
        const other = (markerIncomingWins ? existingSources : incomingSources)[key];
        if (other?.snapshotId || other?.file) markerSources[key] = { ...other, at: valueTs };
      }
      if (labEntryMarkerAffectsHOMAIR(key) && !Object.is(existingMarkers[key], incomingMarkers[key])) {
        homaIRInputChanged = true;
      }
    } else if (hasIncoming) {
      if (Object.hasOwn(incoming.manualOriginals || {}, key)) manualOriginals[key] = structuredClone(incoming.manualOriginals![key]);
      markers[key] = incomingMarkers[key];
      if (incomingSources[key]) markerSources[key] = incomingSources[key];
      if (labEntryMarkerAffectsHOMAIR(key)) homaIRInputChanged = true;
    } else if (hasExisting) {
      if (Object.hasOwn(existing.manualOriginals || {}, key)) manualOriginals[key] = structuredClone(existing.manualOriginals![key]);
      markers[key] = existingMarkers[key];
      if (existingSources[key]) markerSources[key] = existingSources[key];
      if (labEntryMarkerAffectsHOMAIR(key)) homaIRInputChanged = true;
    }
  }
  base.markers = markers;
  if (Object.keys(manualOriginals).length) base.manualOriginals = manualOriginals;
  else delete base.manualOriginals;
  if (Object.keys(markerSources).length) base.markerSources = markerSources;
  else delete base.markerSources;
  if (Object.keys(markerTombstones).length) base[LAB_ENTRY_MARKER_TOMBSTONES] = markerTombstones;
  else delete base[LAB_ENTRY_MARKER_TOMBSTONES];
  const hasMergedHOMAIR = Object.prototype.hasOwnProperty.call(markers, 'diabetes.homaIR');
  const hasMergedGlucose = Object.prototype.hasOwnProperty.call(markers, 'biochemistry.glucose');
  const hasMergedInsulin = Object.prototype.hasOwnProperty.call(markers, 'diabetes.insulin')
    || Object.prototype.hasOwnProperty.call(markers, 'hormones.insulin')
    || Object.prototype.hasOwnProperty.call(markers, 'diabetes.insulin_d');
  const wouldDeleteExistingHOMAIR = hasMergedHOMAIR && (!hasMergedGlucose || !hasMergedInsulin);
  if (homaIRInputChanged && (!wouldDeleteExistingHOMAIR || homaIRInputDeleted)) recalculateLabEntryHOMAIR(base);
  const sourceFiles = mergeSourceFiles(existing, incoming);
  if (sourceFiles.length) {
    base.sourceFiles = sourceFiles;
    base.sourceFile = incomingWins
      ? (incoming.sourceFile || existing.sourceFile || sourceFiles[sourceFiles.length - 1])
      : (existing.sourceFile || incoming.sourceFile || sourceFiles[sourceFiles.length - 1]);
  }
  return base;
}

/** Match legacy replicas only when they identify one panel unambiguously. */
export function labPanelPeerIndex(rows: readonly LabEntryDraft[], panel: LabEntryDraft): number {
  const candidates = rows.flatMap((row, index) => row.date === panel.date ? [{ row, index }] : []);
  if (validLabPanelId(panel.panelId)) {
    const exact = candidates.filter(({ row }) => row.panelId === panel.panelId);
    if (exact.length) return exact.length === 1 ? exact[0]!.index : -1;
  }
  // A reviewed edit can assign the unchanged replica's legacy identity before
  // correcting its value or collection details. Match that exact identity only.
  const legacy = candidates.filter(({ row }) => !(validLabPanelId(row.panelId) && validLabPanelId(panel.panelId)) && labPanelId(row) === labPanelId(panel));
  if (legacy.length === 1) return legacy[0]!.index;
  const compatible = candidates.filter(({ row }) => !(validLabPanelId(row.panelId) && validLabPanelId(panel.panelId)) && !labPanelsHaveDistinctCollections(row, panel));
  const plain = (entry: LabEntryDraft) => { const { panelId: _id, ...rest } = entry; return rest; };
  const equal = compatible.filter(({ row }) => labPanelJSON(plain(row)) === labPanelJSON(plain(panel)));
  if (equal.length === 1) return equal[0]!.index;
  const evidence = labPanelEvidence(panel), sourced = evidence ? compatible.filter(({ row }) => labPanelEvidence(row) === evidence) : [];
  if (sourced.length === 1) return sourced[0]!.index;
  // Old date-unique rows keep their additive merge. A named or split panel
  // cannot be matched merely because it shares that date.
  return candidates.length === 1 && compatible.length === 1 && !validLabPanelId(panel.panelId) && !validLabPanelId(compatible[0]!.row.panelId) ? compatible[0]!.index : -1;
}
export function mergeLabEntriesByDate(localEntries: unknown, remoteEntries: unknown) {
  const hasLocal = Array.isArray(localEntries);
  const hasRemote = Array.isArray(remoteEntries);
  if (!hasLocal && !hasRemote) return undefined;
  const byDate = new Map<string, LabEntryDraft[]>();
  const noDate: LabEntryDraft[] = [];
  function consume(entries: unknown) {
    if (!Array.isArray(entries)) return;
    for (const entry of identifyLabPanels(entries as LabEntryDraft[])) {
      if (!entry || typeof entry !== 'object') continue;
      if (typeof entry.date !== 'string' || !entry.date) {
        noDate.push(entry);
        continue;
      }
      const panels = byDate.get(entry.date) || [], index = labPanelPeerIndex(panels, entry);
      if (index < 0) panels.push(entry);
      else {
        const existing = panels[index]!, panelId = existing.panelId || entry.panelId;
        panels[index] = mergeLabEntry(existing, entry);
        if (validLabPanelId(panelId)) panels[index]!.panelId = panelId;
      }
      byDate.set(entry.date, panels);
    }
  }
  // Remote first, local second. Local wins timestamp ties so a just-imported
  // unsynced lab entry cannot be wiped by a stale pull.
  consume(remoteEntries);
  consume(localEntries);
  return identifyLabPanels([...byDate.values()].flat().concat(noDate)).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
}

/** Merge one legacy date carrier or a versioned multi-panel carrier. */
export function mergeLabDayRow(existing: LabEntryDraft, incoming: LabEntryDraft): LabEntryDraft {
  if (existing.date !== incoming.date) throw new Error('Lab date carriers do not match.');
  return packLabPanelRows(mergeLabEntriesByDate([existing], [incoming])!)[0]!;
}

function isFreshLocalLabEntry(entry: OptionalLabEntry, now: number): entry is LabEntryDraft & { date: string; updatedAt: number } {
  if (!entry || typeof entry !== 'object') return false;
  if (typeof entry.date !== 'string' || !entry.date) return false;
  if (!Number.isFinite(entry.updatedAt)) return false;
  return (entry.updatedAt as number) <= now + 1000 && now - (entry.updatedAt as number) <= FRESH_LOCAL_LAB_ENTRY_TTL_MS;
}

export function preserveFreshLocalLabEntries(merged: LabMergeData | null | undefined, local: LabMergeData | null | undefined, now = Date.now()) {
  if (!merged || typeof merged !== 'object') return false;
  if (!local || typeof local !== 'object' || !Array.isArray(local.entries)) return false;
  const freshLocalEntries = local.entries.filter(entry => isFreshLocalLabEntry(entry, now));
  if (!freshLocalEntries.length) return false;

  if (!Array.isArray(merged.entries)) merged.entries = [];
  const deletedEntryDates = new Set(Array.isArray(merged._deleted?.entries) ? merged._deleted.entries : []);
  const tombs = mergeLabPanelTombstones(merged.labPanelTombstones, local.labPanelTombstones);
  if (Object.keys(tombs).length) merged.labPanelTombstones = tombs;
  const next = filterRemovedLabPanels(mergeLabEntriesByDate(filterRemovedLabPanels(freshLocalEntries.filter(entry => !deletedEntryDates.has(entry.date)), tombs), merged.entries)!, tombs);
  const changed = labPanelJSON(next) !== labPanelJSON(merged.entries);
  if (changed) merged.entries = next;
  return changed;
}
