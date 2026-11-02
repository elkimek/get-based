// Pure report source mutations shared by ordinary import review and chat approval.
import type { ProfileData } from '../types/app-state.js';
import type { LabEntry } from '../types/lab-data.js';
import type { ImportReviewMarker, PendingImport, ImportMarkerReference } from './pdf-import-review-runtime.js';
import { MARKER_SCHEMA } from './schema.js';
import { prepareImportCommit } from './import-commit-validation.js';
import { normalizeToSI } from './pdf-import-marker-mapping.js';
import { deleteLabEntryMarker, getLabEntryMarkerValueTimestamp, normalizeLabFastingStatus, normalizeLabSampleTime, setLabEntryCollectionContext, setLabEntryMarker } from './lab-entry.js';
import { recordTombstone, deleteImportedArrayItems } from './data-merge.js';
import { removeLabPanel } from './lab-panel-mutations.js';
import { identifyLabPanels, labPanelId } from './lab-panel-identity.js';
import { reportBelongsToLabSample, selectLabReportSample } from './lab-report-samples.js';
import { pickTimestamp } from './data-merge-lab-entries.js';

export type CollectionContextField = 'sampleTime' | 'fasting';
export interface CommitSnapshot extends Pick<PendingImport, 'date' | 'fileName' | 'sampleTime' | 'fasting' | 'testType' | 'costInfo' | 'timings' | 'diagnostics' | 'importHash'> {
  id?: string; panelId?: string; importedAt?: number; markers?: ImportReviewMarker[] | null;
  collectionContextApplied?: readonly CollectionContextField[]; excludedIndices?: number[];
  adoptReferenceRanges?: boolean; importMode?: string;
}
interface ActiveLabRange extends Pick<ImportMarkerReference, 'refMin' | 'refMax'> {
  refSource?: string; labRefMin?: number | null; labRefMax?: number | null;
  labRefDate?: string | null; labRefSnapshotId?: string | null;
}

export function activeLabReportSnapshots(data: ProfileData): CommitSnapshot[] {
  if (data.importSnapshots != null && !Array.isArray(data.importSnapshots)) throw new Error('Review the saved report list in its normal editor.');
  const removed: unknown = data._deleted?.importSnapshots;
  if (removed != null && !Array.isArray(removed)) throw new Error('Review the saved report removal history before changing sources.');
  const deleted = new Set(Array.isArray(removed) ? removed : []);
  return ((data.importSnapshots || []) as CommitSnapshot[]).filter(snapshot => !snapshot.id || !deleted.has(snapshot.id)
    || Number(data._deletedClearedAt?.importSnapshots?.[snapshot.id]) > Number(data._deletedAt?.importSnapshots?.[snapshot.id] || 0));
}

export function labReportMutationTime(entry: LabEntry, now: number) {
  const observed = Math.max(0, pickTimestamp(entry), ...Object.keys(entry.markers || {}).map(key => getLabEntryMarkerValueTimestamp(entry, key)));
  const next = Math.max(now, observed + 1);
  if (!Number.isFinite(now) || now < 0 || !Number.isSafeInteger(next) || next <= observed) throw new Error('Review this sample’s change timestamps before changing its report.');
  return next;
}

export function snapshotOwnsCollectionContextField(snapshot: CommitSnapshot | null | undefined, field: CollectionContextField) {
  if (Array.isArray(snapshot?.collectionContextApplied)) {
    return snapshot.collectionContextApplied.includes(field);
  }
  if (!Object.prototype.hasOwnProperty.call(snapshot || {}, field)) return false;
  return field === 'sampleTime'
    ? normalizeLabSampleTime(snapshot![field]) != null
    : normalizeLabFastingStatus(snapshot![field]) != null;
}

function latestSnapshotForCollectionContext(data: ProfileData, entry: LabEntry, excludedSnapshotId: string | null | undefined, field: CollectionContextField) {
  const snapshots = activeLabReportSnapshots(data);
  return snapshots
    .filter(snapshot => snapshot?.id !== excludedSnapshotId
      && reportBelongsToLabSample(data, snapshot, entry)
      && snapshotOwnsCollectionContextField(snapshot, field))
    .sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0))[0] || null;
}

function normalizedCollectionContextValue(field: CollectionContextField, value: unknown) {
  return field === 'sampleTime' ? normalizeLabSampleTime(value) : normalizeLabFastingStatus(value);
}

export function restoreCollectionContextAfterSnapshotRemoval(data: ProfileData, entry: LabEntry | null | undefined, snapshot: CommitSnapshot | null | undefined, now = Date.now()) {
  if (!entry || !snapshot) return;
  for (const field of ['sampleTime', 'fasting'] as const) {
    const recordedSource = entry.collectionContextSources?.[field];
    let ownsCurrentField = recordedSource === snapshot.id;
    if (!recordedSource && snapshotOwnsCollectionContextField(snapshot, field)) {
      const latest = latestSnapshotForCollectionContext(data, entry, null, field);
      const currentValue = normalizedCollectionContextValue(field, entry.context?.[field]);
      const snapshotValue = normalizedCollectionContextValue(field, snapshot[field]);
      ownsCurrentField = latest?.id === snapshot.id && currentValue === snapshotValue;
    }
    if (!ownsCurrentField) continue;
    const replacement = latestSnapshotForCollectionContext(data, entry, snapshot.id, field);
    setLabEntryCollectionContext(entry, { [field]: replacement?.[field] ?? null }, {
      now,
      sourceSnapshotId: replacement?.id || null,
    });
    // A winning empty context must remain explicit when an older row is merged.
    // Deleting the entire object would let its previous report facts reappear.
    if (!replacement) { entry.context ||= {}; entry.context[field] = null; entry.collectionContextSources ||= {}; }
  }
}

function rangeBoundEquals(a: number | null | undefined, b: number | null | undefined) {
  if (a == null || b == null) return a == null && b == null;
  return Math.abs(a - b) < Math.max(Math.abs(b) * 0.001, 0.001);
}

function schemaReferenceRange(dotKey: string, profileSex: string | null) {
  const [categoryKey, markerKey] = dotKey.split('.') as [string, string];
  const marker = MARKER_SCHEMA[categoryKey]?.markers?.[markerKey];
  const female = profileSex === 'female';
  return {
    min: female && marker?.refMin_f != null ? marker.refMin_f : marker?.refMin,
    max: female && marker?.refMax_f != null ? marker.refMax_f : marker?.refMax,
  };
}

function snapshotRangeMatchesOverride(marker: ImportReviewMarker, dotKey: string, override: ActiveLabRange | null | undefined) {
  if (!override || (marker?.refMin == null && marker?.refMax == null)) return false;
  const min = marker.refMin != null ? normalizeToSI(dotKey, marker.refMin, marker.unit, marker) : null;
  const max = marker.refMax != null ? normalizeToSI(dotKey, marker.refMax, marker.unit, marker) : null;
  const existingMin = override.refSource === 'manual' ? override.labRefMin : override.refMin;
  const existingMax = override.refSource === 'manual' ? override.labRefMax : override.refMax;
  return rangeBoundEquals(min, existingMin) && rangeBoundEquals(max, existingMax);
}

function findNewestAdoptedLabRange(data: ProfileData, dotKey: string) {
  const snapshots = activeLabReportSnapshots(data);
  const override = data?.refOverrides?.[dotKey];
  const candidates: { snapshot: CommitSnapshot; marker: ImportReviewMarker }[] = [];

  for (const snapshot of snapshots) {
    if (!Array.isArray(snapshot?.markers)) continue;
    const excluded = new Set(Array.isArray(snapshot.excludedIndices) ? snapshot.excludedIndices : []);
    for (let i = 0; i < snapshot.markers.length; i++) {
      if (excluded.has(i)) continue;
      let marker = snapshot.markers[i]!;
      if (marker?.mappedKey !== dotKey) continue;
      if (marker.refMin == null && marker.refMax == null) continue;
      const [category, name] = dotKey.split('.') as [string, string];
      if (!MARKER_SCHEMA[category]?.markers?.[name] && data.customMarkers?.[dotKey]) {
        // Snapshots retain report units; active ranges must use the same saved
        // unit as the converted marker values, including after report deletion.
        const prepared = prepareImportCommit({ date: snapshot.date, markers: [{ ...marker, matched: true }] }, new Set(), data.customMarkers);
        if (prepared.error || !prepared.markers.length) continue;
        marker = prepared.markers[0]!;
      }
      // Older snapshots predate the explicit adoption flag. Treat only the
      // legacy snapshot matching the currently retained lab interval as
      // adopted, rather than assuming every historical report opted in.
      const inferredLegacyAdoption = snapshot.adoptReferenceRanges == null
        && snapshotRangeMatchesOverride(marker, dotKey, override);
      if (inferredLegacyAdoption) snapshot.adoptReferenceRanges = true;
      const adopted = snapshot.adoptReferenceRanges === true;
      if (adopted) candidates.push({ snapshot, marker });
    }
  }

  candidates.sort((a, b) => {
    const byCollectionDate = String(b.snapshot.date || '').localeCompare(String(a.snapshot.date || ''));
    return byCollectionDate || ((b.snapshot.importedAt || 0) - (a.snapshot.importedAt || 0));
  });
  return candidates[0] || null;
}

function recomputeActiveLabRange(data: ProfileData, dotKey: string | null | undefined, profileSex: string | null) {
  if (!dotKey) return;
  if (!data.refOverrides) data.refOverrides = {};
  const current: ActiveLabRange = data.refOverrides[dotKey] || {};
  const hasManualOverride = current.refSource === 'manual';
  const candidate = findNewestAdoptedLabRange(data, dotKey);

  if (!candidate) {
    delete current.labRefMin;
    delete current.labRefMax;
    delete current.labRefDate;
    delete current.labRefSnapshotId;
    if (current.refSource === 'import') {
      delete current.refMin;
      delete current.refMax;
      delete current.refSource;
    }
  } else {
    const { snapshot, marker } = candidate;
    const min = marker.refMin != null ? normalizeToSI(dotKey, marker.refMin, marker.unit, marker) : null;
    const max = marker.refMax != null ? normalizeToSI(dotKey, marker.refMax, marker.unit, marker) : null;
    const defaultRange = schemaReferenceRange(dotKey, profileSex);
    const matchesDefault = rangeBoundEquals(min, defaultRange.min) && rangeBoundEquals(max, defaultRange.max);

    if (hasManualOverride) {
      current.labRefMin = min;
      current.labRefMax = max;
      current.labRefDate = snapshot.date || null;
      current.labRefSnapshotId = snapshot.id || null;
    } else if (matchesDefault) {
      delete current.refMin;
      delete current.refMax;
      delete current.refSource;
      delete current.labRefMin;
      delete current.labRefMax;
      delete current.labRefDate;
      delete current.labRefSnapshotId;
    } else {
      current.refMin = min;
      current.refMax = max;
      current.refSource = 'import';
      delete current.labRefMin;
      delete current.labRefMax;
      current.labRefDate = snapshot.date || null;
      current.labRefSnapshotId = snapshot.id || null;
    }
  }

  if (Object.keys(current).length === 0) delete data.refOverrides[dotKey];
  else data.refOverrides[dotKey] = current;
}

export function recomputeActiveLabRanges(data: ProfileData, dotKeys: Iterable<string>, profileSex: string | null) {
  for (const dotKey of dotKeys) recomputeActiveLabRange(data, dotKey, profileSex);
}

function snapshotMarkerDotKey(marker: ImportReviewMarker | null | undefined) {
  return marker?.mappedKey || marker?.suggestedKey || null;
}

function findLatestRestorableSnapshotMarker(data: ProfileData, entry: LabEntry, excludedSnapshotId: string | null | undefined, dotKey: string) {
  const snaps = activeLabReportSnapshots(data);
  const candidates = snaps
    .filter(s => s?.id && s.id !== excludedSnapshotId && reportBelongsToLabSample(data, s, entry) && Array.isArray(s.markers))
    .sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0));
  for (const snap of candidates) {
    const excluded = new Set(Array.isArray(snap.excludedIndices) ? snap.excludedIndices : []);
    for (let i = 0; i < snap.markers!.length; i++) {
      if (excluded.has(i)) continue;
      const marker = snap.markers![i]!;
      if (snapshotMarkerDotKey(marker) !== dotKey) continue;
      return { snap, marker };
    }
  }
  return null;
}

export function restoreLatestSnapshotMarkerForKey(data: ProfileData, entry: LabEntry | null | undefined, removedSnapshot: CommitSnapshot | null | undefined, dotKey: string, now = Date.now()) {
  if (!entry || !removedSnapshot || !dotKey) return false;
  const replacement = findLatestRestorableSnapshotMarker(data, entry, removedSnapshot.id, dotKey);
  if (!replacement) return false;
  const { snap, marker: rawMarker } = replacement;
  const prepared = prepareImportCommit({ date: snap.date, markers: [{ ...rawMarker, matched: !!rawMarker.mappedKey }] }, new Set(), data.customMarkers);
  if (prepared.error || !prepared.markers.length) return false;
  const marker = prepared.markers[0]!;
  setLabEntryMarker(entry, dotKey, normalizeToSI(dotKey, marker.value as number, marker.unit, marker), {
    now,
    source: { file: snap.fileName || null, at: now, snapshotId: snap.id },
  });
  return true;
}

export function bindKnownReportSamples(data: ProfileData, entry: LabEntry) {
  // Preserve collection ownership before removing the last current source link.
  const associated = activeLabReportSnapshots(data).filter(snapshot => reportBelongsToLabSample(data, snapshot, entry));
  entry.panelId = labPanelId(identifyLabPanels(data.entries)[data.entries.indexOf(entry)]!);
  for (const snapshot of associated) snapshot.panelId = entry.panelId;
}

function clearRemovedReportEvidence(data: ProfileData, entry: LabEntry, snapshot: CommitSnapshot) {
  for (const [key, original] of Object.entries(entry.manualOriginals || {})) if (original?.source?.snapshotId === snapshot.id) entry.manualOriginals![key] = null;
  const originals = entry.collectionOriginals;
  for (const field of ['sampleTime', 'fasting'] as const) if (originals && originals[field]?.sourceSnapshotId === snapshot.id) {
    originals[field] = { value: null, sourceSnapshotId: null };
  }
  const surviving = activeLabReportSnapshots(data).filter(report => report.id !== snapshot.id && reportBelongsToLabSample(data, report, entry));
  if (snapshot.fileName && !surviving.some(report => report.fileName === snapshot.fileName)) {
    if (entry.sourceFiles) entry.sourceFiles = entry.sourceFiles.filter(file => file !== snapshot.fileName);
    if (entry.sourceFile === snapshot.fileName) {
      const replacement = entry.sourceFiles?.at(-1);
      if (replacement) entry.sourceFile = replacement; else delete entry.sourceFile;
    }
  }
}

export function applyLabReportRemoval(data: ProfileData, id: string, profileSex: string | null, now = Date.now()) {
  const matches = activeLabReportSnapshots(data).filter(report => report.id === id);
  if (matches.length !== 1) throw new Error('This report is missing or ambiguous. Read its current source records.');
  const snapshot = matches[0]!, entry = selectLabReportSample(data, snapshot), rangeKeys = new Set<string>();
  const changedAt = entry ? labReportMutationTime(entry, now) : now;
  for (const marker of snapshot.markers || []) { const key = snapshotMarkerDotKey(marker); if (key) rangeKeys.add(key); }
  if (entry) bindKnownReportSamples(data, entry);
  const sampleId = entry ? labPanelId(entry) : null;
  if (entry?.markers) {
    const removed: string[] = [];
    for (const key of Object.keys(entry.markers)) if (entry.markerSources?.[key]?.snapshotId === id) {
      deleteLabEntryMarker(entry, key, { now: changedAt }); removed.push(key);
    }
    for (const key of removed) {
      if (!data.entries.some(row => row !== entry && row.date === entry.date && Object.hasOwn(row.markers || {}, key))) {
        if (data.manualValues && Object.hasOwn(data.manualValues, `${key}:${entry.date}`)) data.manualValues[`${key}:${entry.date}`] = null;
      }
      restoreLatestSnapshotMarkerForKey(data, entry, snapshot, key, changedAt);
    }
    restoreCollectionContextAfterSnapshotRemoval(data, entry, snapshot, changedAt);
    clearRemovedReportEvidence(data, entry, snapshot);
    entry.updatedAt = changedAt;
    if (!Object.keys(entry.markers).length) removeLabPanel(data, entry, changedAt);
  }
  recordTombstone(data, 'importSnapshots', id);
  deleteImportedArrayItems(data, 'importSnapshots', report => report.id === id);
  recomputeActiveLabRanges(data, rangeKeys, profileSex);
  return { snapshot, sampleId };
}
