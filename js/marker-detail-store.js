// @ts-check
// marker-detail-store.js - synced marker-detail mutation boundary.

import { state } from './state.js';
import { adoptProfileData } from './profile-data-writes.js';
import { saveImportedData, invalidateActiveDataCache } from './data.js';
import {
  deleteLabEntryMarkerFromImportedData,
  findOrCreateLabEntry,
} from './lab-entry-mutations.js';
import {
  setLabEntryCollectionContext,
  setLabEntryMarker,
} from './lab-entry.js';

function captureMarkerEdit() {
  return { profileId: state.currentProfile, data: JSON.parse(JSON.stringify({ ...state.importedData, toJSON: undefined })) };
}

async function persistMarkerEdit(rollback) {
  const edited = state.importedData;
  if (await saveImportedData()) return true;
  if (state.currentProfile === rollback.profileId && state.importedData === edited) {
    adoptProfileData(state.importedData, rollback.data);
    invalidateActiveDataCache();
  }
  return false;
}

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
  if (markerSource) return !!(markerSource.snapshotId || markerSource.file);
  if (entry.sourceFile) return true;
  return Array.isArray(entry.sourceFiles) && entry.sourceFiles.some(Boolean);
}

function editedMarkerSource(entry, dotKey, now) {
  const source = entry.markerSources?.[dotKey];
  return source?.snapshotId || source?.file
    ? { ...source, at: now, manuallyEdited: true }
    : { file: null, at: now };
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
  const rollback = captureMarkerEdit();
  if (!dotKey || !date) return null;
  const data = ensureImportedData();
  const entry = findOrCreateLabEntry(data, date, { now });
  if (!entry) return null;
  rememberManualOriginal(dotKey, date, entry);
  setLabEntryMarker(entry, dotKey, storedValue, {
    now,
    source: editedMarkerSource(entry, dotKey, now),
  });
  if (collectionContext) setLabEntryCollectionContext(entry, collectionContext, { now });
  writeMarkerValueNote(dotKey, date, noteText);
  if (!await persistMarkerEdit(rollback)) return null;
  return entry;
}

/**
 * @param {{ dotKey?: string, date?: string, storedValue?: any, now?: number }} [opts]
 */
export async function editManualMarkerValue({ dotKey, date, storedValue, now = Date.now() } = {}) {
  const rollback = captureMarkerEdit();
  const entry = state.importedData?.entries?.find(e => e.date === date);
  if (!entry || !dotKey) return null;
  rememberManualOriginal(dotKey, date, entry);
  setLabEntryMarker(entry, dotKey, storedValue, {
    now,
    source: editedMarkerSource(entry, dotKey, now),
  });
  if (!await persistMarkerEdit(rollback)) return null;
  return entry;
}

export async function deleteManualMarkerValue(dotKey, date, { now = Date.now() } = {}) {
  const rollback = captureMarkerEdit();
  const entry = state.importedData?.entries?.find(e => e.date === date);
  if (!entry || entryMarkerValue(entry, dotKey) === undefined) return null;
  const result = deleteLabEntryMarkerFromImportedData(state.importedData, entry, dotKey, {
    now,
  });
  if (!result.changed) return null;
  if (!await persistMarkerEdit(rollback)) return null;
  return result;
}

export async function revertManualMarkerValue(dotKey, date, { now = Date.now() } = {}) {
  const rollback = captureMarkerEdit();
  const original = getManualOriginalForMarker(dotKey, date);
  if (original == null || original === true) return null;
  const entry = state.importedData?.entries?.find(e => e.date === date);
  if (!entry) return null;
  const source = { ...entry.markerSources?.[dotKey], at: now };
  delete source.manuallyEdited;
  setLabEntryMarker(entry, dotKey, original, {
    now,
    source,
  });
  const manualValues = ensureMap('manualValues');
  clearSyncedMapValue(manualValues, mapKey(dotKey, date));
  if (!await persistMarkerEdit(rollback)) return null;
  return entry;
}

export async function saveMarkerValueNote(dotKey, date, noteText) {
  const rollback = captureMarkerEdit();
  const changed = writeMarkerValueNote(dotKey, date, noteText);
  if (changed && !await persistMarkerEdit(rollback)) return false;
  return changed;
}

export async function deleteMarkerValueNote(dotKey, date) {
  const rollback = captureMarkerEdit();
  const notes = ensureMap('markerValueNotes');
  const changedPrimary = clearSyncedMapValue(notes, mapKey(dotKey, date));
  if (changedPrimary && !await persistMarkerEdit(rollback)) return false;
  return changedPrimary;
}

/**
 * @param {string} dotKey
 * @param {string} type
 * @param {{ min?: number | null, max?: number | null }} [range]
 */
export async function saveRefRangeOverride(dotKey, type, { min, max } = {}) {
  const rollback = captureMarkerEdit();
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
  if (!await persistMarkerEdit(rollback)) return null;
  return ovr;
}

export async function revertRefRangeOverride(dotKey, type) {
  const rollback = captureMarkerEdit();
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
  if (!await persistMarkerEdit(rollback)) return null;
  return { message };
}

export async function saveMarkerNoteText(dotKey, text) {
  const rollback = captureMarkerEdit();
  if (!dotKey) return { action: 'noop' };
  const markerNotes = ensureMap('markerNotes');
  const clean = String(text || '').trim();
  if (!clean) {
    if (!Object.prototype.hasOwnProperty.call(markerNotes, dotKey)) return { action: 'noop' };
    delete markerNotes[dotKey];
    if (!await persistMarkerEdit(rollback)) return null;
    return { action: 'deleted' };
  }
  markerNotes[dotKey] = clean;
  if (!await persistMarkerEdit(rollback)) return null;
  return { action: 'saved' };
}

export async function deleteMarkerNoteText(dotKey) {
  const rollback = captureMarkerEdit();
  const markerNotes = state.importedData?.markerNotes;
  if (!markerNotes || !Object.prototype.hasOwnProperty.call(markerNotes, dotKey)) return false;
  delete markerNotes[dotKey];
  if (!await persistMarkerEdit(rollback)) return null;
  return true;
}
