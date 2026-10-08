import type { ImportReviewMarker, PendingImport } from './pdf-import-review-runtime.js';
import type { CustomMarkerDefinition } from '../types/app-state.js';
type CommitInputRow = Pick<ImportReviewMarker, 'matched' | 'mappedKey' | 'suggestedKey' | 'unit' | 'refMin' | 'refMax'> & {
  value?: unknown; [key: string]: unknown;
};
type CommitInput = Pick<PendingImport, 'date'> & { markers?: CommitInputRow[] | null };

import { MARKER_SCHEMA, normalizeClinicalUnit } from './schema.js';
import { LEGACY_INSULIN_MARKER_KEYS } from './lab-entry.js';
import { convertGenericImportValueUnit } from './pdf-import-unit-conversions.js';

export function prepareImportCommit(result: CommitInput, excluded: ReadonlySet<number>, customMarkers: Record<string, Pick<CustomMarkerDefinition, 'unit'>> = {}) {
  const date = result.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(Date.parse(date as string))
      || new Date(date as string).toISOString().slice(0, 10) !== date) {
    return { error: 'Choose a valid collection date before importing.', markers: [], errorRows: [] as number[] };
  }
  const seen = new Map<string, number>();
  const markers: ImportReviewMarker[] = [];
  for (const [index, row] of (result.markers || []).entries()) {
    if (excluded.has(index) || !(row.matched || row.suggestedKey)) continue;
    const key = row.matched ? row.mappedKey : row.suggestedKey;
    if (typeof key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
      return { error: `Row ${index + 1}: choose a valid marker mapping.`, markers: [], errorRows: [index] };
    }
    if (!Number.isFinite(row.value)) {
      return { error: `Row ${index + 1}: enter a numeric value or exclude the row using its action button.`, markers: [], errorRows: [index] };
    }
    const canonicalKey = LEGACY_INSULIN_MARKER_KEYS.includes(key) ? 'diabetes.insulin' : key;
    if (seen.has(canonicalKey)) {
      return { error: `Rows ${seen.get(canonicalKey)} and ${index + 1} map to the same marker. Change the mapping or exclude one row before importing.`, markers: [], errorRows: [seen.get(canonicalKey)! - 1, index] };
    }
    seen.set(canonicalKey, index + 1);
    const marker = { ...row } as ImportReviewMarker;
    const [category, name] = key.split('.') as [string, string];
    const unit = customMarkers[key]?.unit;
    // A saved custom marker without a unit has nothing to convert to: adopt the
    // incoming unit (the commit step then records it on the definition) instead
    // of blocking the whole import.
    if (!MARKER_SCHEMA[category]?.markers?.[name] && unit != null && String(unit).trim() !== ''
        && normalizeClinicalUnit(unit) !== normalizeClinicalUnit(row.unit || '')) {
      for (const field of ['value', 'refMin', 'refMax'] as const) {
        if (row[field] == null) continue;
        const converted = convertGenericImportValueUnit(row[field] as number | null | undefined, row.unit, unit);
        if (!Number.isFinite(converted)) {
          return { error: `Row ${index + 1}: the unit cannot be converted to the saved unit (${unit}). Correct the unit or use a separate marker.`, markers: [], errorRows: [index] };
        }
        marker[field] = converted;
      }
      marker.unit = unit;
    }
    markers.push(marker);
  }
  return { error: null, markers, errorRows: [] as number[] };
}
