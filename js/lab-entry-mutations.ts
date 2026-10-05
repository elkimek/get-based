import type { LabEntryDraft, LabMarkerDeletion, CreatedLabEntry } from './lab-entry.js';
import type { LabMergeData } from './data-merge-lab-entries.js';

interface LabMutationData extends LabMergeData {
  manualValues?: Record<string, unknown> | null;
  markerValueNotes?: Record<string, unknown> | null;
}
interface LabMutationOptions {
  now?: number | undefined;
  stamp?: boolean | undefined;
  recordTombstone?: boolean | undefined;
  clearTombstone?: boolean;
  deleteMetadata?: boolean;
  deleteEntryIfEmpty?: boolean;
  deleteEmptyEntries?: boolean;
}
type OptionalMutationData = LabMutationData | null | undefined;
type LabRow<Data extends LabMutationData> = NonNullable<Data['entries']>[number];

// lab-entry-mutations.js - importedData-level lab entry mutation helpers.

import {
  appendImportedArrayItem,
  clearTombstone,
  deleteImportedArrayItems,
  ensureImportedArray,
} from './data-merge.js';
import {
  createLabEntry,
  deleteLabEntryMarker,
  isLabEntryRemovable,
} from './lab-entry.js';

export function findOrCreateLabEntry<Data extends LabMutationData>(
  importedData: Data | null | undefined, date: string, opts: LabMutationOptions = {},
): LabRow<Data> | CreatedLabEntry | null {
  if (!importedData || typeof importedData !== 'object' || !date) return null;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const entries = ensureImportedArray(importedData, 'entries') as LabEntryDraft[];
  if (opts.clearTombstone !== false) clearTombstone(importedData, 'entries', date);
  let entry = entries.find(e => e?.date === date);
  if (!entry) {
    entry = createLabEntry(date, { now });
    appendImportedArrayItem(importedData, 'entries', entry);
  }
  return entry as LabRow<Data> | CreatedLabEntry;
}

export function deleteEmptyLabEntries<Data extends OptionalMutationData>(importedData: Data) {
  return deleteImportedArrayItems(importedData, 'entries', entry => isLabEntryRemovable(entry as LabEntryDraft));
}

export function deleteLabEntryMarkerFromImportedData(
  importedData: OptionalMutationData, entry: LabEntryDraft | null | undefined,
  dotKey: string, opts: LabMutationOptions = {},
) {
  const result = deleteLabEntryMarker(entry, dotKey, opts);
  if (!result.changed) return result;
  if (opts.deleteMetadata !== false) {
    for (const key of result.deletedKeys) deleteLabEntryMarkerMetadata(importedData, key, entry!.date);
  }
  if (opts.deleteEntryIfEmpty === false) return result;
  if (isLabEntryRemovable(entry)) {
    const removed = deleteImportedArrayItems(importedData, 'entries', item => item === entry);
    result.removedEntry = removed.length > 0;
  }
  return result;
}

export function deleteLabEntryMarkerMetadata(importedData: OptionalMutationData, dotKey: string, date: unknown) {
  if (!importedData || !dotKey || !date) return;
  const key = `${dotKey}:${date}`;
  if (importedData.manualValues && Object.prototype.hasOwnProperty.call(importedData.manualValues, key)) {
    importedData.manualValues[key] = null;
  }
  if (importedData.markerValueNotes && Object.prototype.hasOwnProperty.call(importedData.markerValueNotes, key)) {
    importedData.markerValueNotes[key] = null;
  }
}

export function deleteLabEntryMarkerMetadataForAllDates(importedData: OptionalMutationData, dotKey: string) {
  if (!importedData || !dotKey) return;
  const prefix = `${dotKey}:`;
  for (const mapName of ['manualValues', 'markerValueNotes'] as const) {
    const map = importedData[mapName];
    if (!map || typeof map !== 'object') continue;
    for (const key of Object.keys(map)) {
      if (key.startsWith(prefix)) map[key] = null;
    }
  }
}

export function deleteLabEntryMarkerValues(importedData: OptionalMutationData, dotKey: string, opts: LabMutationOptions = {}) {
  if (!importedData || typeof importedData !== 'object' || !Array.isArray(importedData.entries)) return [];
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const changed: { entry: LabEntryDraft; result: LabMarkerDeletion }[] = [];
  for (const entry of importedData.entries) {
    const result = deleteLabEntryMarker(entry, dotKey, {
      now,
      recordTombstone: opts.recordTombstone,
      stamp: opts.stamp,
    });
    if (!result.changed) continue;
    changed.push({ entry, result });
    if (opts.deleteMetadata !== false) {
      for (const key of result.deletedKeys) deleteLabEntryMarkerMetadata(importedData, key, entry!.date);
    }
  }
  if (opts.deleteMetadata !== false) deleteLabEntryMarkerMetadataForAllDates(importedData, dotKey);
  if (opts.deleteEmptyEntries !== false) deleteEmptyLabEntries(importedData);
  return changed;
}
