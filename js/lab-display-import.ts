// Native database restore metadata; keep existing native definitions and display overrides.
import type { ImportedDataOperations } from '../types/export-import.js';
export function mergeRestoredDisplayMetadata(current: ImportedDataOperations, importData: ImportedDataOperations) {
  for (const field of ['customMarkers', 'refOverrides', 'categoryLabels', 'categoryIcons', 'markerLabels', 'markerPlacements', 'manualValues', 'manualBodyReadings']) {
    if (importData[field] && typeof importData[field] === 'object') {
      if (!current[field]) current[field] = {};
      for (const [k, v] of Object.entries(importData[field] as Record<string, unknown>)) {
        if (!Object.hasOwn(current[field] as object, k) || (current[field] as Record<string, unknown>)[k] == null) Object.defineProperty(current[field], k, { value: v, enumerable: true, configurable: true, writable: true });
      }
    }
  }
  if (importData.labOrdering != null) current.labOrdering = importData.labOrdering;
}
