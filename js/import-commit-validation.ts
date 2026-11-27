import type { ImportReviewMarker, PendingImport } from './pdf-import-review-runtime.js';
import type { CustomMarkerDefinition } from '../types/app-state.js';
type CommitInputRow = Pick<ImportReviewMarker, 'matched' | 'mappedKey' | 'suggestedKey' | 'unit' | 'refMin' | 'refMax'> & {
  value?: unknown; [key: string]: unknown;
};
type CommitInput = Pick<PendingImport, 'date'> & { markers?: CommitInputRow[] | null };

import { MARKER_SCHEMA, normalizeClinicalUnit } from './schema.js';
import { LEGACY_INSULIN_MARKER_KEYS } from './lab-entry.js';
import { convertGenericImportValueUnit, isRecognizedUnitForMarker } from './pdf-import-unit-conversions.js';

export function prepareImportCommit(result: CommitInput, excluded: ReadonlySet<number>, customMarkers: Record<string, Pick<CustomMarkerDefinition, 'unit'>> = {}) {
  const date = result.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(Date.parse(date as string))
      || new Date(date as string).toISOString().slice(0, 10) !== date) {
    return { error: 'Choose a valid collection date before importing.', errorRows: [], markers: [] };
  }
  const seen = new Map<string, number>();
  const markers: ImportReviewMarker[] = [];
  for (const [index, row] of (result.markers || []).entries()) {
    if (excluded.has(index) || !(row.matched || row.suggestedKey)) continue;
    const key = row.matched ? row.mappedKey : row.suggestedKey;
    if (typeof key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]*\.[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
      return { error: `Row ${index + 1}: choose a valid marker mapping.`, errorRows: [index], markers: [] };
    }
    if (!Number.isFinite(row.value)) {
      return { error: `Row ${index + 1}: enter a numeric value or exclude the row using its action button.`, errorRows: [index], markers: [] };
    }
    const canonicalKey = LEGACY_INSULIN_MARKER_KEYS.includes(key) ? 'diabetes.insulin' : key;
    if (seen.has(canonicalKey)) {
      return { error: `Rows ${seen.get(canonicalKey)} and ${index + 1} map to the same marker. Change the mapping or exclude one row before importing.`, errorRows: [seen.get(canonicalKey)! - 1, index], markers: [] };
    }
    seen.set(canonicalKey, index + 1);
    const marker = { ...row } as ImportReviewMarker;
    const [category, name] = key.split('.') as [string, string];
    const schema = MARKER_SCHEMA[category]?.markers?.[name];
    if (schema && !isRecognizedUnitForMarker(canonicalKey, row.unit)) {
      return { error: `Row ${index + 1}: verify the reported unit for ${schema.name} or keep it as a separate marker. The reported unit cannot be converted to ${schema.unit || 'the canonical ratio'}.`, errorRows: [index], markers: [] };
    }
    if (canonicalKey === 'biochemistry.urea' && normalizeClinicalUnit(row.unit) === 'mg/dl'
        && !/\bbun\b|urea|urée|močovina|močovinový dusík|harnstoff/i.test(String(row.rawName || ''))) {
      return { error: `Row ${index + 1}: choose mg/dl BUN or mg/dl urea to identify the reported measurand.`, errorRows: [index], markers: [] };
    }
    marker.unitConversionVersion = 2;
    const unit = customMarkers[key]?.unit;
    if (!MARKER_SCHEMA[category]?.markers?.[name] && unit != null && normalizeClinicalUnit(unit) !== ''
        && normalizeClinicalUnit(unit) !== normalizeClinicalUnit(row.unit || '')) {
      for (const field of ['value', 'refMin', 'refMax'] as const) {
        if (row[field] == null) continue;
        const converted = convertGenericImportValueUnit(row[field] as number | null | undefined, row.unit, unit);
        if (!Number.isFinite(converted)) {
          return { error: `Row ${index + 1}: the unit cannot be converted to the saved unit (${unit || 'unspecified'}). Correct the unit or use a separate marker.`, errorRows: [index], markers: [] };
        }
        marker[field] = converted;
      }
      marker.unit = unit;
    }
    markers.push(marker);
  }
  return { error: null, errorRows: [], markers };
}
