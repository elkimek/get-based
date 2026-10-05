import type { LabEntryDraft } from './lab-entry.js';

type RangeOverride = Record<string, unknown>;
interface MarkerMaps {
  manualValues: Record<string, unknown>;
  markerValueNotes: Record<string, string | null>;
  refOverrides: Record<string, RangeOverride | null | undefined>;
  markerNotes: Record<string, string>;
}
// This mutation boundary also accepts a partial profile before normalization.
type MarkerMutationData = Partial<MarkerMaps> & { entries?: LabEntryDraft[] | null };
interface MarkerValueEdit {
  dotKey?: string; date?: string; storedValue?: unknown; now?: number;
}
interface MarkerValueSave extends MarkerValueEdit {
  noteText?: unknown;
  collectionContext?: { sampleTime?: unknown; fasting?: unknown };
}

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
  return { profileId: state.currentProfile, data: JSON.parse(JSON.stringify({ ...state.importedData, toJSON: undefined })) as unknown };
}

async function persistMarkerEdit(rollback: ReturnType<typeof captureMarkerEdit>) {
  const edited = state.importedData;
  if (await saveImportedData()) return true;
  if (state.currentProfile === rollback.profileId && state.importedData === edited) {
    adoptProfileData(state.importedData, rollback.data);
    invalidateActiveDataCache();
  }
  return false;
}

const VALUE_NOTE_MAX_CHARS = 500;

function ensureImportedData() {
  if (!state.importedData || typeof state.importedData !== 'object') (state as { importedData: MarkerMutationData }).importedData = ({});
  return state.importedData as MarkerMutationData;
}

function ensureMap<Name extends keyof MarkerMaps>(name: Name): MarkerMaps[Name] {
  const data = ensureImportedData();
  if (!data[name] || typeof data[name] !== 'object' || Array.isArray(data[name])) data[name] = {} as MarkerMaps[Name];
  return data[name] as MarkerMaps[Name];
}

function mapKey(dotKey: string | undefined, date: string | undefined) {
  return dotKey && date ? `${dotKey}:${date}` : null;
}

function entryMarkerValue(entry: LabEntryDraft | null | undefined, dotKey: string | undefined) {
  const markers = entry?.markers && typeof entry.markers === 'object' ? entry.markers : null;
  if (!markers || !dotKey) return undefined;
  if (Object.prototype.hasOwnProperty.call(markers, dotKey)) return markers[dotKey];
  return undefined;
}

function entryHasImportedSource(entry: LabEntryDraft | null | undefined, dotKey: string) {
  if (!entry) return false;
  const markerSource = entry.markerSources?.[dotKey];
  if (markerSource) return !!(markerSource.snapshotId || markerSource.file);
  if (entry.sourceFile) return true;
  return Array.isArray(entry.sourceFiles) && entry.sourceFiles.some(Boolean);
}

function editedMarkerSource(entry: LabEntryDraft, dotKey: string, now: number) {
  const source = entry.markerSources?.[dotKey];
  return source?.snapshotId || source?.file
    ? { ...source, at: now, manuallyEdited: true }
    : { file: null, at: now };
}

function rememberManualOriginal(dotKey: string, date: string | undefined, entry: LabEntryDraft) {
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

function clearSyncedMapValue(map: Record<string, unknown> | null | undefined, key: string | null) {
  if (!map || typeof map !== 'object' || !key) return false;
  if (!Object.prototype.hasOwnProperty.call(map, key)) return false;
  map[key] = null;
  return true;
}

export function getManualOriginalForMarker(dotKey: string, date: string) {
  const map = state.importedData?.manualValues as MarkerMaps['manualValues'] | null | undefined;
  const key = mapKey(dotKey, date);
  if (!map || typeof map !== 'object' || !key) return undefined;
  if (Object.prototype.hasOwnProperty.call(map, key) && map[key] != null && map[key] !== true) {
    return map[key];
  }
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  return undefined;
}

export function hasMarkerValueForDate(dotKey: string, date: string) {
  if (!dotKey || !date) return false;
  const entry = state.importedData?.entries?.find(e => e.date === date);
  return entryMarkerValue(entry, dotKey) !== undefined;
}

export function getMarkerValueNote(dotKey: string, date: string) {
  const key = mapKey(dotKey, date);
  if (!key) return '';
  return state.importedData?.markerValueNotes?.[key] || '';
}

function writeMarkerValueNote(dotKey: string, date: string, noteText: unknown) {
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

export async function saveManualMarkerValue({ dotKey, date, storedValue, noteText = '', collectionContext, now = Date.now() }: MarkerValueSave = {}) {
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

export async function editManualMarkerValue({ dotKey, date, storedValue, now = Date.now() }: MarkerValueEdit = {}) {
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

export async function deleteManualMarkerValue(dotKey: string, date: string, { now = Date.now() } = {}) {
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

export async function revertManualMarkerValue(dotKey: string, date: string, { now = Date.now() } = {}) {
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

export async function saveMarkerValueNote(dotKey: string, date: string, noteText: unknown) {
  const rollback = captureMarkerEdit();
  const changed = writeMarkerValueNote(dotKey, date, noteText);
  if (changed && !await persistMarkerEdit(rollback)) return false;
  return changed;
}

export async function deleteMarkerValueNote(dotKey: string, date: string) {
  const rollback = captureMarkerEdit();
  const notes = ensureMap('markerValueNotes');
  const changedPrimary = clearSyncedMapValue(notes, mapKey(dotKey, date));
  if (changedPrimary && !await persistMarkerEdit(rollback)) return false;
  return changedPrimary;
}

function applyRangeOverride(ovr: RangeOverride, kind: 'optimal' | 'ref', min: number | null | undefined, max: number | null | undefined) {
  const lab = kind === 'optimal' ? 'labOptimal' : 'labRef';
  if (ovr[`${kind}Source`] !== 'manual' && (`${kind}Min` in ovr) && !(`${lab}Min` in ovr)) {
    ovr[`${lab}Min`] = ovr[`${kind}Min`];
    ovr[`${lab}Max`] = ovr[`${kind}Max`];
  }
  ovr[`${kind}Min`] = min;
  ovr[`${kind}Max`] = max;
  ovr[`${kind}Source`] = 'manual';
}

function restoreRangeOverride(ovr: RangeOverride, kind: 'optimal' | 'ref') {
  const lab = kind === 'optimal' ? 'labOptimal' : 'labRef';
  let message = 'Range reverted to default';
  if (`${lab}Min` in ovr) {
    ovr[`${kind}Min`] = ovr[`${lab}Min`];
    ovr[`${kind}Max`] = ovr[`${lab}Max`];
    ovr[`${kind}Source`] = 'import';
    delete ovr[`${lab}Min`];
    delete ovr[`${lab}Max`];
    message = 'Range reverted to lab range';
  } else {
    delete ovr[`${kind}Min`];
    delete ovr[`${kind}Max`];
    delete ovr[`${kind}Source`];
  }
  return message;
}

export async function saveRefRangeOverride(dotKey: string, type: string, { min, max }: { min?: number | null; max?: number | null } = {}) {
  const rollback = captureMarkerEdit();
  const isOptimal = type === 'optimal';
  const isReference = type === 'ref' || type === 'reference';
  if (!dotKey || (!isOptimal && !isReference)) return null;
  const refOverrides = ensureMap('refOverrides');
  if (!refOverrides[dotKey] || typeof refOverrides[dotKey] !== 'object') refOverrides[dotKey] = {};
  const ovr = refOverrides[dotKey]!;
  if (isOptimal) applyRangeOverride(ovr, 'optimal', min, max);
  else applyRangeOverride(ovr, 'ref', min, max);
  if (!await persistMarkerEdit(rollback)) return null;
  return ovr;
}

export async function revertRefRangeOverride(dotKey: string, type: string) {
  const rollback = captureMarkerEdit();
  const ovr = state.importedData?.refOverrides?.[dotKey] as RangeOverride | null | undefined;
  const isOptimal = type === 'optimal';
  const isReference = type === 'ref' || type === 'reference';
  if (!ovr || (!isOptimal && !isReference)) return null;
  let message = 'Range reverted to default';
  if (isOptimal) message = restoreRangeOverride(ovr, 'optimal');
  else message = restoreRangeOverride(ovr, 'ref');
  if (Object.keys(ovr).length === 0) delete state.importedData.refOverrides[dotKey];
  if (!await persistMarkerEdit(rollback)) return null;
  return { message };
}

export async function saveMarkerNoteText(dotKey: string, text: unknown) {
  const rollback = captureMarkerEdit();
  if (!dotKey) return { action: 'noop' as const };
  const markerNotes = ensureMap('markerNotes');
  const clean = String(text || '').trim();
  if (!clean) {
    if (!Object.prototype.hasOwnProperty.call(markerNotes, dotKey)) return { action: 'noop' as const };
    delete markerNotes[dotKey];
    if (!await persistMarkerEdit(rollback)) return null;
    return { action: 'deleted' as const };
  }
  markerNotes[dotKey] = clean;
  if (!await persistMarkerEdit(rollback)) return null;
  return { action: 'saved' as const };
}

export async function deleteMarkerNoteText(dotKey: string) {
  const rollback = captureMarkerEdit();
  const markerNotes = state.importedData?.markerNotes;
  if (!markerNotes || !Object.prototype.hasOwnProperty.call(markerNotes, dotKey)) return false;
  delete markerNotes[dotKey];
  if (!await persistMarkerEdit(rollback)) return null;
  return true;
}
