// @ts-check
import { MARKER_SCHEMA, normalizeClinicalUnit } from './schema.js';
import { LEGACY_INSULIN_MARKER_KEYS } from './lab-entry.js';
import { convertGenericImportValueUnit } from './pdf-import-unit-conversions.js';

export function prepareImportCommit(result, excluded, customMarkers = {}) {
  const date = result.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(Date.parse(date))
      || new Date(date).toISOString().slice(0, 10) !== date) {
    return { error: 'Choose a valid collection date before importing.', markers: [] };
  }
  const seen = new Map();
  const markers = [];
  for (const [index, row] of (result.markers || []).entries()) {
    if (excluded.has(index) || !(row.matched || row.suggestedKey)) continue;
    const key = row.matched ? row.mappedKey : row.suggestedKey;
    if (typeof key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
      return { error: `Row ${index + 1}: choose a valid marker mapping.`, markers: [] };
    }
    if (!Number.isFinite(row.value)) {
      return { error: `Row ${index + 1}: enter a numeric value or exclude the row using its action button.`, markers: [] };
    }
    const canonicalKey = LEGACY_INSULIN_MARKER_KEYS.includes(key) ? 'diabetes.insulin' : key;
    if (seen.has(canonicalKey)) {
      return { error: `Rows ${seen.get(canonicalKey)} and ${index + 1} map to the same marker. Change the mapping or exclude one row before importing.`, markers: [] };
    }
    seen.set(canonicalKey, index + 1);
    const marker = { ...row };
    const [category, name] = key.split('.');
    const unit = customMarkers[key]?.unit;
    if (!MARKER_SCHEMA[category]?.markers?.[name] && unit != null
        && normalizeClinicalUnit(unit) !== normalizeClinicalUnit(row.unit || '')) {
      for (const field of ['value', 'refMin', 'refMax']) {
        if (row[field] == null) continue;
        const converted = convertGenericImportValueUnit(row[field], row.unit, unit);
        if (!Number.isFinite(converted)) {
          return { error: `Row ${index + 1}: the unit cannot be converted to the saved unit (${unit || 'unspecified'}). Correct the unit or use a separate marker.`, markers: [] };
        }
        marker[field] = converted;
      }
      marker.unit = unit;
    }
    markers.push(marker);
  }
  return { error: null, markers };
}
