import { markerRangeKind, validateMarkerRange, writeMarkerRangeOverride, restoreMarkerRangeOverride } from './marker-range-core.js';
import type { LabEntryDraft, LabMarkerDeletion } from './lab-entry.js';
import { labManualOriginal, selectLabPanel } from './lab-panel-mutations.js';
import { commitLabMarkerCommand } from './lab-marker-record-store.js';
import type { LabMarkerCommand } from './lab-marker-mutations.js';
import { showNotification } from './utils.js';

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
  dotKey?: string; date?: string; panelId?: string; storedValue?: unknown; now?: number;
}
interface MarkerValueSave extends MarkerValueEdit {
  newPanel?: boolean;
  noteText?: unknown;
  collectionContext?: { sampleTime?: unknown; fasting?: unknown };
}

// marker-detail-store.js - synced marker-detail mutation boundary.

import { state } from './state.js';
import { adoptProfileData } from './profile-data-writes.js';
import { saveImportedData, invalidateActiveDataCache, getActiveData } from './data.js';
import { writeMarkerNoteText } from './marker-note-commands.js';

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

function clearSyncedMapValue(map: Record<string, unknown> | null | undefined, key: string | null) {
  if (!map || typeof map !== 'object' || !key) return false;
  if (!Object.prototype.hasOwnProperty.call(map, key)) return false;
  map[key] = null;
  return true;
}

export function getManualOriginalForMarker(dotKey: string, date: string, panelId?: string) {
  try { const entry = selectLabPanel(state.importedData, date, panelId); return entry ? labManualOriginal(state.importedData, entry, dotKey)?.value : undefined; }
  catch { return undefined; }
}

export function hasMarkerValueForDate(dotKey: string, date: string) {
  if (!dotKey || !date) return false;
  return (state.importedData?.entries || []).some(entry => entry.date === date && entryMarkerValue(entry, dotKey) !== undefined);
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

function commitMarkerValue(command: LabMarkerCommand & { kind: 'remove' }): Promise<LabMarkerDeletion | null>;
function commitMarkerValue(command: LabMarkerCommand & { kind: 'save' | 'edit' | 'revert' }): Promise<LabEntryDraft | null>;
async function commitMarkerValue(command: LabMarkerCommand) {
  ensureImportedData();
  try { return await commitLabMarkerCommand(state.currentProfile, state.importedData, command); }
  catch (error) { if (error instanceof Error && error.message === 'Choose which sample to edit.') showNotification(error.message, 'error'); return null; }
}
export async function saveManualMarkerValue({ dotKey, date, ...options }: MarkerValueSave = {}) {
  if (!dotKey || !date) return null;
  return commitMarkerValue({ ...options, ...(!Object.hasOwn(options, 'noteText') && !options.newPanel ? { noteText: '' } : {}), dotKey, date, kind: 'save' });
}
export async function editManualMarkerValue({ dotKey, date, ...options }: MarkerValueEdit = {}) {
  if (!dotKey || !date) return null;
  return commitMarkerValue({ ...options, dotKey, date, kind: 'edit' });
}
export async function deleteManualMarkerValue(dotKey: string, date: string, options: { now?: number; panelId?: string } = {}) {
  if (!dotKey || !date) return null;
  return commitMarkerValue({ ...options, dotKey, date, kind: 'remove' });
}
export async function revertManualMarkerValue(dotKey: string, date: string, options: { now?: number; panelId?: string } = {}) {
  if (!dotKey || !date) return null;
  return commitMarkerValue({ ...options, dotKey, date, kind: 'revert' });
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

export async function saveRefRangeOverride(dotKey: string, type: string, { min, max }: { min?: number | null; max?: number | null } = {}) {
  const rollback = captureMarkerEdit();
  const kind = markerRangeKind(type);
  if (!dotKey || !kind) return null;
  validateMarkerRange(min ?? null, max ?? null);
  const refOverrides = ensureMap('refOverrides');
  if (!refOverrides[dotKey] || typeof refOverrides[dotKey] !== 'object') refOverrides[dotKey] = {};
  const ovr = refOverrides[dotKey]!;
  const [category, key] = dotKey.split('.') as [string, string], marker = getActiveData().categories[category]?.markers[key];
  const prefix = kind === 'reference' ? 'ref' : 'optimal';
  writeMarkerRangeOverride(ovr, kind, { min: min ?? null, max: max ?? null }, { min: marker?.[`${prefix}Min`] ?? null, max: marker?.[`${prefix}Max`] ?? null });
  if (!await persistMarkerEdit(rollback)) return null;
  return ovr;
}

export async function revertRefRangeOverride(dotKey: string, type: string) {
  const rollback = captureMarkerEdit();
  const ovr = state.importedData?.refOverrides?.[dotKey] as RangeOverride | null | undefined;
  const kind = markerRangeKind(type);
  if (!ovr || !kind) return null;
  const message = restoreMarkerRangeOverride(ovr, kind);
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
    if (!markerNotes[dotKey]) return { action: 'noop' as const };
    writeMarkerNoteText(markerNotes, dotKey, '');
    if (!await persistMarkerEdit(rollback)) return null;
    return { action: 'deleted' as const };
  }
  writeMarkerNoteText(markerNotes, dotKey, clean);
  if (!await persistMarkerEdit(rollback)) return null;
  return { action: 'saved' as const };
}

export async function deleteMarkerNoteText(dotKey: string) {
  const rollback = captureMarkerEdit();
  const markerNotes = state.importedData?.markerNotes;
  if (!markerNotes?.[dotKey]) return false;
  writeMarkerNoteText(markerNotes, dotKey, '');
  if (!await persistMarkerEdit(rollback)) return null;
  return true;
}
