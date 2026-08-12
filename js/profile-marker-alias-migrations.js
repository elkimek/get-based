// @ts-check
// profile-marker-alias-migrations.js — canonical and named built-in alias repairs

import { BUILTIN_MARKER_DOT_KEY_ALIASES, MARKER_SCHEMA } from './schema.js';
import { SPECIALTY_MARKER_DEFS } from './adapters.js';
import { renameLabEntryMarker } from './lab-entry.js';

/** @typedef {Record<string, any>} ProfileData */

function normalizeProfileMarkerLabel(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u00b5\u03bc]/g, 'u')
    .replace(/\s*[\(\[]\s*[^)\]]*(?:u?kat|mmol|umol|nmol|pmol|mol|mg|ug|ng|pg|g\s*\/\s*l|m\s*u|iu\s*\/\s*l|u\s*\/\s*l|10\s*\^?\s*\d+|arb\.?\s*j\.?|fl|%)[^)\]]*[\)\]]\s*/gi, ' ')
    .replace(/\s+(?:u?kat|mmol|umol|nmol|pmol|mol|mg|ug|ng|pg|g|m\s*u|iu|u|10\s*\^?\s*\d+|arb\.?\s*j\.?|fl|%)\s*(?:\/\s*[a-z0-9^]+)?\s*$/i, ' ')
    .replace(/[^a-zA-Z0-9#]+/g, '')
    .toLowerCase();
}

export function repairCanonicalMarkerAliases(data) {
  const remapByPrefix = (obj, oldKey, nextKey) => {
    if (!obj) return;
    const prefix = oldKey + ':';
    for (const key of Object.keys(obj)) {
      if (!key.startsWith(prefix)) continue;
      const remapped = nextKey + key.slice(oldKey.length);
      if (obj[remapped] === undefined) obj[remapped] = obj[key];
      delete obj[key];
    }
  };
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
    remapByPrefix(data.manualValues, oldKey, nextKey);
    remapByPrefix(data.markerValueNotes, oldKey, nextKey);
    if (data.refOverrides?.[oldKey]) {
      if (!data.refOverrides[nextKey]) data.refOverrides[nextKey] = data.refOverrides[oldKey];
      delete data.refOverrides[oldKey];
    }
    if (data.markerNotes?.[oldKey] && !data.markerNotes[nextKey]) data.markerNotes[nextKey] = data.markerNotes[oldKey];
    if (data.markerNotes) delete data.markerNotes[oldKey];
    if (data.markerLabels?.[oldKey] && !data.markerLabels[nextKey]) data.markerLabels[nextKey] = data.markerLabels[oldKey];
    if (data.markerLabels) delete data.markerLabels[oldKey];
    if (data.customMarkers) delete data.customMarkers[oldKey];
  }
}

export function repairNamedStandardMarkerAliases(data) {
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
  const remapByPrefix = (obj, oldKey, nextKey) => {
    if (!obj) return;
    const prefix = oldKey + ':';
    for (const key of Object.keys(obj)) {
      if (!key.startsWith(prefix)) continue;
      const remapped = nextKey + key.slice(oldKey.length);
      if (obj[remapped] === undefined) obj[remapped] = obj[key];
      delete obj[key];
    }
  };
  const candidates = new Set(Object.keys(data.customMarkers || {}));
  for (const entry of data.entries) for (const key of Object.keys(entry.markers || {})) candidates.add(key);
  for (const fullKey of candidates) {
    const [catKey, markerKey] = fullKey.split('.');
    if (!markerKey || SPECIALTY_MARKER_DEFS[fullKey]) continue;
    if (MARKER_SCHEMA[catKey]?.markers?.[markerKey]) continue;
    const def = data.customMarkers?.[fullKey] || {};
    const target = labelAliases.get(normalizeProfileMarkerLabel(def?.name))
      || labelAliases.get(normalizeProfileMarkerLabel(markerKey));
    if (!target || target === fullKey) continue;
    for (const entry of data.entries) renameLabEntryMarker(entry, fullKey, target, { stamp: false });
    remapByPrefix(data.manualValues, fullKey, target);
    remapByPrefix(data.markerValueNotes, fullKey, target);
    if (data.refOverrides?.[fullKey]) {
      if (!data.refOverrides[target]) data.refOverrides[target] = data.refOverrides[fullKey];
      delete data.refOverrides[fullKey];
    }
    if (data.markerNotes?.[fullKey] && !data.markerNotes[target]) data.markerNotes[target] = data.markerNotes[fullKey];
    if (data.markerNotes) delete data.markerNotes[fullKey];
    if (data.markerLabels?.[fullKey] && !data.markerLabels[target]) data.markerLabels[target] = data.markerLabels[fullKey];
    if (data.markerLabels) delete data.markerLabels[fullKey];
    if (data.customMarkers) delete data.customMarkers[fullKey];
  }
}
