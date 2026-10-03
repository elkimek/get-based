import type { LabEntryDraft } from './lab-entry.js';
import type { ClinicalImportContext } from './schema.js';

/** Saved extensions remain opaque; repair logic narrows only the fields it consumes. */
export type ProfileMarkerMetadata = Record<string, unknown>;
export interface ProfileImportMarker extends ClinicalImportContext {
  rawName?: string | null; suggestedName?: string | null | undefined;
  mappedKey?: string | null; suggestedKey?: string | null;
  suggestedCategoryLabel?: string | null; suggestedGroup?: string | null;
  matched?: boolean;
}
export interface ProfileImportSnapshot {
  markers?: ProfileImportMarker[] | null;
  excludedIndices?: readonly unknown[];
  [key: string]: unknown;
}
export interface ProfileMarkerData {
  entries?: LabEntryDraft[];
  importSnapshots?: ProfileImportSnapshot[];
  customMarkers?: Record<string, ProfileMarkerMetadata>;
  manualValues?: ProfileMarkerMetadata;
  markerValueNotes?: ProfileMarkerMetadata;
  markerLabels?: ProfileMarkerMetadata;
  markerNotes?: ProfileMarkerMetadata;
  refOverrides?: Record<string, ProfileMarkerMetadata>;
}

// profile-marker-alias-migrations.js — canonical and named built-in alias repairs

import { BUILTIN_MARKER_DOT_KEY_ALIASES, MARKER_SCHEMA, normalizeClinicalUnit } from './schema.js';
import { SPECIALTY_MARKER_DEFS } from './specialty-marker-catalog.js';
import { renameLabEntryMarker } from './lab-entry.js';

export function normalizeProfileMarkerLabel(value: unknown) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u00b5\u03bc]/g, 'u')
    .replace(/\s*[\(\[]\s*[^)\]]*(?:u?kat|mmol|umol|nmol|pmol|mol|mg|ug|ng|pg|g\s*\/\s*l|m\s*u|iu\s*\/\s*l|u\s*\/\s*l|10\s*\^?\s*\d+|arb\.?\s*j\.?|fl|%)[^)\]]*[\)\]]\s*/gi, ' ')
    .replace(/\s+(?:u?kat|mmol|umol|nmol|pmol|mol|mg|ug|ng|pg|g|m\s*u|iu|u|10\s*\^?\s*\d+|arb\.?\s*j\.?|fl|%)\s*(?:\/\s*[a-z0-9^]+)?\s*$/i, ' ')
    .replace(/[^a-zA-Z0-9#]+/g, '')
    .toLowerCase();
}

function remapDateScopedMarkerMetadata(data: ProfileMarkerData, oldKey: string, nextKey: string) {
  const prefix = oldKey + ':';
  for (const obj of [data.manualValues, data.markerValueNotes, data.markerLabels, data.refOverrides]) {
    if (!obj) continue;
    for (const key of Object.keys(obj)) {
      if (!key.startsWith(prefix)) continue;
      const remapped = nextKey + key.slice(oldKey.length);
      if (obj[remapped] === undefined) obj[remapped] = obj[key];
      delete obj[key];
    }
  }
}

/** Move unscoped metadata without replacing an existing canonical value. */
export function remapGlobalProfileMarkerMetadata(data: ProfileMarkerData, oldKey: string, nextKey: string) {
  if (data.refOverrides?.[oldKey]) {
    if (!data.refOverrides[nextKey]) data.refOverrides[nextKey] = data.refOverrides[oldKey];
    delete data.refOverrides[oldKey];
  }
  if (data.markerNotes?.[oldKey] && !data.markerNotes[nextKey]) data.markerNotes[nextKey] = data.markerNotes[oldKey];
  if (data.markerNotes) delete data.markerNotes[oldKey];
  if (data.markerLabels?.[oldKey] && !data.markerLabels[nextKey]) data.markerLabels[nextKey] = data.markerLabels[oldKey];
  if (data.markerLabels) delete data.markerLabels[oldKey];
}

export function repairCanonicalMarkerAliases(data: ProfileMarkerData) {
  for (const [oldKey, nextKey] of Object.entries(BUILTIN_MARKER_DOT_KEY_ALIASES)) {
    for (const entry of data.entries || []) {
      const oldTombstone = entry.deletedMarkers?.[oldKey];
      renameLabEntryMarker(entry, oldKey, nextKey, { stamp: false });
      if (oldTombstone !== undefined) {
        if (!entry.deletedMarkers || typeof entry.deletedMarkers !== 'object') entry.deletedMarkers = {};
        const currentTombstone = entry.deletedMarkers[nextKey];
        entry.deletedMarkers[nextKey] = Math.max(Number(currentTombstone) || 0, Number(oldTombstone) || 0);
        delete entry.deletedMarkers[oldKey];
      }
    }
    for (const snapshot of data.importSnapshots || []) {
      for (const marker of snapshot?.markers || []) {
        if (marker?.mappedKey === oldKey) marker.mappedKey = nextKey;
        if (marker?.suggestedKey === oldKey) {
          marker.mappedKey = nextKey;
          marker.suggestedKey = null;
          marker.matched = true;
        }
      }
    }
    remapDateScopedMarkerMetadata(data, oldKey, nextKey);
    remapGlobalProfileMarkerMetadata(data, oldKey, nextKey);
    if (data.customMarkers) delete data.customMarkers[oldKey];
  }
}

export function repairNamedStandardMarkerAliases(data: ProfileMarkerData) {
  if (!data.entries?.length) return;
  const labelAliases = new Map([
    ['lpa', 'lipids.lpA'],
    ['lipoproteina', 'lipids.lpA'],
    ['lipoproteinapolipoproteina', 'lipids.lpA'],
    ['totalcholesterol', 'lipids.cholesterol'],
    ['cholesteroltotal', 'lipids.cholesterol'],
    ['hdlcholesterol', 'lipids.hdl'],
    ['cholhdlratio', 'calculatedRatios.cholHdlRatio'],
    ['totalcholesterolhdlratio', 'calculatedRatios.cholHdlRatio'],
  ]);
  const candidates = new Set(Object.keys(data.customMarkers || {}));
  for (const entry of data.entries) for (const key of Object.keys(entry.markers || {})) candidates.add(key);
  for (const fullKey of candidates) {
    const [catKey, markerKey] = fullKey.split('.');
    if (!markerKey || SPECIALTY_MARKER_DEFS[fullKey]) continue;
    if (MARKER_SCHEMA[catKey!]?.markers?.[markerKey!]) continue;
    const def = data.customMarkers?.[fullKey] || {};
    const target = labelAliases.get(normalizeProfileMarkerLabel(def?.name))
      || labelAliases.get(normalizeProfileMarkerLabel(markerKey));
    if (!target || target === fullKey) continue;
    for (const entry of data.entries) renameLabEntryMarker(entry, fullKey, target, { stamp: false });
    remapDateScopedMarkerMetadata(data, fullKey, target);
    remapGlobalProfileMarkerMetadata(data, fullKey, target);
    if (data.customMarkers) delete data.customMarkers[fullKey];
  }
}

/**
 * Preserve canonical-unit custom ranges before snapshot repair or adoption can
 * remove their definitions. Merge missing bounds independently: an optimal-only
 * override must not suppress the reference range, and explicit null bounds win.
 *
 */
export function preserveExactStandardCustomRanges(data: ProfileMarkerData) {
  for (const [key, definition] of Object.entries(data.customMarkers || {})) {
    const [catKey, markerKey] = key.split('.');
    const standard = MARKER_SCHEMA[catKey!]?.markers?.[markerKey!];
    if (!standard || normalizeClinicalUnit(definition?.unit) !== normalizeClinicalUnit(standard.unit)) continue;
    const range: Record<string, number | null> = {};
    for (const field of ['refMin', 'refMax']) {
      if (!Object.prototype.hasOwnProperty.call(definition, field)) continue;
      const raw = definition[field];
      if (raw === null) range[field] = null;
      else if ((typeof raw === 'number' || (typeof raw === 'string' && raw.trim())) && Number.isFinite(Number(raw))) range[field] = Number(raw);
    }
    if (!Object.entries(range).some(([field, value]) => value !== (standard as unknown as ProfileMarkerMetadata)[field])) continue;
    const override = data.refOverrides?.[key] || {};
    const missing = Object.fromEntries(Object.entries(range).filter(([field]) => !Object.prototype.hasOwnProperty.call(override, field)));
    if (Object.keys(missing).length === 0) continue;
    data.refOverrides = { ...(data.refOverrides || {}), [key]: { ...override, ...missing } };
  }
}
