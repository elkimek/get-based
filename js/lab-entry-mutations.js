// @ts-check
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

export function findOrCreateLabEntry(importedData, date, opts = {}) {
  if (!importedData || typeof importedData !== 'object' || !date) return null;
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const entries = ensureImportedArray(importedData, 'entries');
  if (opts.clearTombstone !== false) clearTombstone(importedData, 'entries', date);
  let entry = entries.find(e => e?.date === date);
  if (!entry) {
    entry = createLabEntry(date, { now });
    appendImportedArrayItem(importedData, 'entries', entry);
  }
  return entry;
}

export function deleteEmptyLabEntries(importedData) {
  return deleteImportedArrayItems(importedData, 'entries', entry => isLabEntryRemovable(entry));
}

export function deleteLabEntryMarkerFromImportedData(importedData, entry, dotKey, opts = {}) {
  const result = deleteLabEntryMarker(entry, dotKey, opts);
  if (!result.changed) return result;
  if (opts.deleteMetadata !== false) {
    for (const key of result.deletedKeys) deleteLabEntryMarkerMetadata(importedData, key, entry.date);
  }
  if (opts.deleteEntryIfEmpty === false) return result;
  if (isLabEntryRemovable(entry)) {
    const removed = deleteImportedArrayItems(importedData, 'entries', item => item === entry);
    result.removedEntry = removed.length > 0;
  }
  return result;
}

export function deleteLabEntryMarkerMetadata(importedData, dotKey, date) {
  if (!importedData || !dotKey || !date) return;
  const key = `${dotKey}:${date}`;
  if (importedData.manualValues && Object.prototype.hasOwnProperty.call(importedData.manualValues, key)) {
    importedData.manualValues[key] = null;
  }
  if (importedData.markerValueNotes && Object.prototype.hasOwnProperty.call(importedData.markerValueNotes, key)) {
    importedData.markerValueNotes[key] = null;
  }
}

export function deleteLabEntryMarkerMetadataForAllDates(importedData, dotKey) {
  if (!importedData || !dotKey) return;
  const prefix = `${dotKey}:`;
  for (const mapName of ['manualValues', 'markerValueNotes']) {
    const map = importedData[mapName];
    if (!map || typeof map !== 'object') continue;
    for (const key of Object.keys(map)) {
      if (key.startsWith(prefix)) map[key] = null;
    }
  }
}

export function deleteLabEntryMarkerValues(importedData, dotKey, opts = {}) {
  if (!importedData || typeof importedData !== 'object' || !Array.isArray(importedData.entries)) return [];
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  const changed = [];
  for (const entry of importedData.entries) {
    const result = deleteLabEntryMarker(entry, dotKey, {
      now,
      recordTombstone: opts.recordTombstone,
      stamp: opts.stamp,
    });
    if (!result.changed) continue;
    changed.push({ entry, result });
    if (opts.deleteMetadata !== false) {
      for (const key of result.deletedKeys) deleteLabEntryMarkerMetadata(importedData, key, entry.date);
    }
  }
  if (opts.deleteMetadata !== false) deleteLabEntryMarkerMetadataForAllDates(importedData, dotKey);
  if (opts.deleteEmptyEntries !== false) deleteEmptyLabEntries(importedData);
  return changed;
}
