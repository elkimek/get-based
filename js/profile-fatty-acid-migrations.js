// @ts-check
// profile-fatty-acid-migrations.js - Snapshot-backed product fatty-acid metadata repairs.

import { SPECIALTY_MARKER_DEFS } from './schema.js';

/**
 * @typedef {Record<string, any>} ProfileData
 */

/**
 * @param {string | null | undefined} key
 * @returns {{ categoryKey: string, markerPart: string } | null}
 */
function productFattyAcidKeyParts(key) {
  if (!key || typeof key !== 'string') return null;
  const parts = key.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [categoryKey, markerPart] = parts;
  if (!(categoryKey.endsWith('FA') || categoryKey === 'fattyAcidsTest')) return null;
  return { categoryKey, markerPart };
}

/**
 * @param {string} categoryKey
 * @returns {string}
 */
function productFattyAcidCategoryLabel(categoryKey) {
  const knownLabels = {
    spadiaFA: 'Spadia',
    zinzinoFA: 'ZinZino',
    omegaquantFA: 'OmegaQuant',
    metabolomixFA: 'Metabolomix+: Fatty Acids',
    fattyAcidsTest: 'Fatty Acids Test',
  };
  if (knownLabels[categoryKey]) return knownLabels[categoryKey];
  const raw = categoryKey.endsWith('FA') ? categoryKey.slice(0, -2) : categoryKey;
  const spaced = raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : 'Fatty Acids';
}

/**
 * @param {ProfileData} data
 * @param {string} sourceKey
 * @param {string} nextKey
 * @param {any} [marker]
 * @returns {void}
 */
export function ensureProductFattyAcidCustomMarker(data, sourceKey, nextKey, marker = null) {
  const parts = productFattyAcidKeyParts(nextKey);
  if (!parts) return;
  if (!data.customMarkers) data.customMarkers = {};
  const { categoryKey, markerPart } = parts;
  const genericKey = `fattyAcids.${markerPart}`;
  const exactDef = SPECIALTY_MARKER_DEFS[nextKey] || null;
  const sourceDef = data.customMarkers[sourceKey]
    || data.customMarkers[genericKey]
    || SPECIALTY_MARKER_DEFS[sourceKey]
    || exactDef
    || SPECIALTY_MARKER_DEFS[genericKey]
    || {};
  const targetDef = data.customMarkers[nextKey] || {};
  const cmDef = { ...sourceDef, ...targetDef };
  cmDef.name = targetDef.name || marker?.suggestedName || sourceDef.name || marker?.rawName || markerPart;
  cmDef.unit = targetDef.unit || marker?.unit || sourceDef.unit || '%';
  cmDef.refMin = targetDef.refMin != null ? targetDef.refMin
    : (marker?.refMin != null ? marker.refMin : (sourceDef.refMin != null ? sourceDef.refMin : null));
  cmDef.refMax = targetDef.refMax != null ? targetDef.refMax
    : (marker?.refMax != null ? marker.refMax : (sourceDef.refMax != null ? sourceDef.refMax : null));
  cmDef.icon = targetDef.icon || exactDef?.icon || sourceDef.icon || '🐟';
  cmDef.categoryLabel = exactDef?.categoryLabel
    || marker?.suggestedCategoryLabel
    || productFattyAcidCategoryLabel(categoryKey)
    || targetDef.categoryLabel
    || sourceDef.categoryLabel;
  cmDef.group = exactDef?.group || marker?.suggestedGroup || targetDef.group || sourceDef.group || 'Fatty Acids';
  data.customMarkers[nextKey] = cmDef;
}

/**
 * Rebuild missing definitions only when both a saved import snapshot and a
 * stored entry contain the same product-specific fatty-acid key. Snapshot
 * evidence keeps the legacy corrupted-blood cleanup effective for unproven keys.
 * @param {ProfileData} data
 * @returns {void}
 */
export function repairSnapshotBackedProductFattyAcidMetadata(data) {
  const storedKeys = new Set();
  for (const entry of data.entries || []) {
    for (const key of Object.keys(entry.markers || {})) {
      if (productFattyAcidKeyParts(key)) storedKeys.add(key);
    }
  }
  if (storedKeys.size === 0) return;
  for (const snap of data.importSnapshots || []) {
    if (!Array.isArray(snap?.markers)) continue;
    const excluded = new Set(Array.isArray(snap.excludedIndices) ? snap.excludedIndices : []);
    for (let i = 0; i < snap.markers.length; i++) {
      if (excluded.has(i)) continue;
      const marker = snap.markers[i];
      const key = marker?.mappedKey || marker?.suggestedKey || null;
      const parts = productFattyAcidKeyParts(key);
      if (!parts || !storedKeys.has(key) || data.customMarkers?.[key]) continue;
      ensureProductFattyAcidCustomMarker(data, `fattyAcids.${parts.markerPart}`, key, marker);
    }
  }
}
