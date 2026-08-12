// @ts-check
// marker-detail-store.js - synced marker-detail mutation boundary.

import { state } from './state.js';
import { saveImportedData } from './data.js';
import {
  deleteLabEntryMarkerFromImportedData,
  findOrCreateLabEntry,
} from './lab-entry-mutations.js';
import {
  setLabEntryCollectionContext,
  setLabEntryMarker,
} from './lab-entry.js';

const VALUE_NOTE_MAX_CHARS = 500;

/** @returns {any} */
function ensureImportedData() {
  if (!state.importedData || typeof state.importedData !== 'object') state.importedData = /** @type {any} */ ({});
  return state.importedData;
}

/**
 * @param {string} name
 * @returns {Record<string, any>}
 */
function ensureMap(name) {
  const data = ensureImportedData();
  if (!data[name] || typeof data[name] !== 'object' || Array.isArray(data[name])) data[name] = {};
  return data[name];
}

function mapKey(dotKey, date) {
  return dotKey && date ? `${dotKey}:${date}` : null;
}

function entryMarkerValue(entry, dotKey) {
  const markers = entry?.markers && typeof entry.markers === 'object' ? entry.markers : null;
  if (!markers || !dotKey) return undefined;
  if (Object.prototype.hasOwnProperty.call(markers, dotKey)) return markers[dotKey];
  return undefined;
}

function entryHasImportedSource(entry, dotKey) {
  if (!entry) return false;
  const markerSource = entry.markerSources?.[dotKey];
  if (markerSource?.file) return true;
  if (entry.sourceFile) return true;
  return Array.isArray(entry.sourceFiles) && entry.sourceFiles.some(Boolean);
}

function rememberManualOriginal(dotKey, date, entry) {
  const key = mapKey(dotKey, date);
  if (!entry || !key) return;
  const manualValues = ensureMap('manualValues');
  const current = entryMarkerValue(entry, dotKey);
  const hasImportedOriginal = current != null && entryHasImportedSource(entry, dotKey);
  if (!(key in manualValues) || manualValues[key] == null) {
    manualValues[key] = hasImportedOriginal ? current : true;
  } else if (manualValues[key] === true && hasImportedOriginal) {
    manualValues[key] = current;
  }
}

function clearSyncedMapValue(map, key) {
  if (!map || typeof map !== 'object' || !key) return false;
  if (!Object.prototype.hasOwnProperty.call(map, key)) return false;
  map[key] = null;
  return true;
}

export function getManualOriginalForMarker(dotKey, date) {
  const map = state.importedData?.manualValues;
  const key = mapKey(dotKey, date);
  if (!map || typeof map !== 'object' || !key) return undefined;
  if (Object.prototype.hasOwnProperty.call(map, key) && map[key] != null && map[key] !== true) {
    return map[key];
  }
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  return undefined;
}

export function hasMarkerValueForDate(dotKey, date) {
  if (!dotKey || !date) return false;
  const entry = state.importedData?.entries?.find(e => e.date === date);
  return entryMarkerValue(entry, dotKey) !== undefined;
}

export function getMarkerValueNote(dotKey, date) {
  const key = mapKey(dotKey, date);
  if (!key) return '';
  return state.importedData?.markerValueNotes?.[key] || '';
}

function writeMarkerValueNote(dotKey, date, noteText) {
  const key = mapKey(dotKey, date);
  if (!key) return false;
  const notes = ensureMap('markerValueNotes');
  const capped = String(noteText || '').slice(0, VALUE_NOTE_MAX_CHARS);
  let changed = false;
  if (capped) {
    changed = notes[key] !== capped;
    notes[key] = capped;
  } else {
    changed = clearSyncedMapValue(notes, key);
  }
  return changed;
}

/**
 * @param {{ dotKey?: string, date?: string, storedValue?: any, noteText?: string, collectionContext?: { sampleTime?: unknown, fasting?: unknown }, now?: number }} [opts]
 */
export async function saveManualMarkerValue({ dotKey, date, storedValue, noteText = '', collectionContext, now = Date.now() } = {}) {
  if (!dotKey || !date) return null;
  const data = ensureImportedData();
  const entry = findOrCreateLabEntry(data, date, { now });
  if (!entry) return null;
  rememberManualOriginal(dotKey, date, entry);
  setLabEntryMarker(entry, dotKey, storedValue, {
    now,
    source: { file: null, at: now },
  });
  if (collectionContext) setLabEntryCollectionContext(entry, collectionContext, { now });
  writeMarkerValueNote(dotKey, date, noteText);
  await saveImportedData();
  return entry;
}

/**
 * @param {{ dotKey?: string, date?: string, storedValue?: any, now?: number }} [opts]
 */
export async function editManualMarkerValue({ dotKey, date, storedValue, now = Date.now() } = {}) {
  const entry = state.importedData?.entries?.find(e => e.date === date);
  if (!entry || !dotKey) return null;
  rememberManualOriginal(dotKey, date, entry);
  setLabEntryMarker(entry, dotKey, storedValue, {
    now,
    source: { file: null, at: now },
  });
  await saveImportedData();
  return entry;
}

export async function deleteManualMarkerValue(dotKey, date, { now = Date.now() } = {}) {
  const entry = state.importedData?.entries?.find(e => e.date === date);
  if (!entry || entryMarkerValue(entry, dotKey) === undefined) return null;
  const result = deleteLabEntryMarkerFromImportedData(state.importedData, entry, dotKey, {
    now,
  });
  if (!result.changed) return null;
  await saveImportedData();
  return result;
}

export async function revertManualMarkerValue(dotKey, date, { now = Date.now() } = {}) {
  const original = getManualOriginalForMarker(dotKey, date);
  if (original == null || original === true) return null;
  const entry = state.importedData?.entries?.find(e => e.date === date);
  if (!entry) return null;
  setLabEntryMarker(entry, dotKey, original, {
    now,
    clearSource: true,
  });
  const manualValues = ensureMap('manualValues');
  clearSyncedMapValue(manualValues, mapKey(dotKey, date));
  await saveImportedData();
  return entry;
}

export async function saveMarkerValueNote(dotKey, date, noteText) {
  const changed = writeMarkerValueNote(dotKey, date, noteText);
  if (changed) await saveImportedData();
  return changed;
}

export async function deleteMarkerValueNote(dotKey, date) {
  const notes = ensureMap('markerValueNotes');
  const changedPrimary = clearSyncedMapValue(notes, mapKey(dotKey, date));
  if (changedPrimary) await saveImportedData();
  return changedPrimary;
}

/**
 * @param {string} dotKey
 * @param {string} type
 * @param {{ min?: number | null, max?: number | null }} [range]
 */
export async function saveRefRangeOverride(dotKey, type, { min, max } = {}) {
  const isOptimal = type === 'optimal';
  const isReference = type === 'ref' || type === 'reference';
  if (!dotKey || (!isOptimal && !isReference)) return null;
  const refOverrides = ensureMap('refOverrides');
  if (!refOverrides[dotKey] || typeof refOverrides[dotKey] !== 'object') refOverrides[dotKey] = {};
  const ovr = refOverrides[dotKey];
  if (isOptimal) {
    if (ovr.optimalSource !== 'manual' && ('optimalMin' in ovr) && !('labOptimalMin' in ovr)) {
      ovr.labOptimalMin = ovr.optimalMin;
      ovr.labOptimalMax = ovr.optimalMax;
    }
    ovr.optimalMin = min;
    ovr.optimalMax = max;
    ovr.optimalSource = 'manual';
  } else {
    if (ovr.refSource !== 'manual' && ('refMin' in ovr) && !('labRefMin' in ovr)) {
      ovr.labRefMin = ovr.refMin;
      ovr.labRefMax = ovr.refMax;
    }
    ovr.refMin = min;
    ovr.refMax = max;
    ovr.refSource = 'manual';
  }
  await saveImportedData();
  return ovr;
}

export async function revertRefRangeOverride(dotKey, type) {
  const ovr = state.importedData?.refOverrides?.[dotKey];
  const isOptimal = type === 'optimal';
  const isReference = type === 'ref' || type === 'reference';
  if (!ovr || (!isOptimal && !isReference)) return null;
  let message = 'Range reverted to default';
  if (isOptimal) {
    if ('labOptimalMin' in ovr) {
      ovr.optimalMin = ovr.labOptimalMin;
      ovr.optimalMax = ovr.labOptimalMax;
      ovr.optimalSource = 'import';
      delete ovr.labOptimalMin;
      delete ovr.labOptimalMax;
      message = 'Range reverted to lab range';
    } else {
      delete ovr.optimalMin;
      delete ovr.optimalMax;
      delete ovr.optimalSource;
    }
  } else {
    if ('labRefMin' in ovr) {
      ovr.refMin = ovr.labRefMin;
      ovr.refMax = ovr.labRefMax;
      ovr.refSource = 'import';
      delete ovr.labRefMin;
      delete ovr.labRefMax;
      message = 'Range reverted to lab range';
    } else {
      delete ovr.refMin;
      delete ovr.refMax;
      delete ovr.refSource;
    }
  }
  if (Object.keys(ovr).length === 0) delete state.importedData.refOverrides[dotKey];
  await saveImportedData();
  return { message };
}

export async function saveMarkerNoteText(dotKey, text) {
  if (!dotKey) return { action: 'noop' };
  const markerNotes = ensureMap('markerNotes');
  const clean = String(text || '').trim();
  if (!clean) {
    if (!Object.prototype.hasOwnProperty.call(markerNotes, dotKey)) return { action: 'noop' };
    delete markerNotes[dotKey];
    await saveImportedData();
    return { action: 'deleted' };
  }
  markerNotes[dotKey] = clean;
  await saveImportedData();
  return { action: 'saved' };
}

export async function deleteMarkerNoteText(dotKey) {
  const markerNotes = state.importedData?.markerNotes;
  if (!markerNotes || !Object.prototype.hasOwnProperty.call(markerNotes, dotKey)) return false;
  delete markerNotes[dotKey];
  await saveImportedData();
  return true;
}
