// @ts-check
// Recover report links lost by older marker-detail edits without changing results.
import { normalizeToSI } from './schema.js';

/** @param {Record<string, any>} data */
export function repairEditedImportProvenance(data) {
  if (!Array.isArray(data.entries) || !Array.isArray(data.importSnapshots)) return;
  const deletedSnapshots = new Set(data._deleted?.importSnapshots || []);
  for (const entry of data.entries) {
    for (const [key, value] of Object.entries(entry.markers || {})) {
      const source = entry.markerSources?.[key];
      const original = data.manualValues?.[`${key}:${entry.date}`];
      // Numeric originals distinguish edits of imported values from new manual entries.
      // Require the old edit-source shape; do not guess for untracked legacy values.
      if (!Number.isFinite(original) || source?.snapshotId || source?.file !== null
          || !Number.isFinite(source?.at) || entry.deletedMarkers?.[key]) continue;
      const candidates = [];
      for (const snapshot of data.importSnapshots) {
        if (!snapshot?.id || snapshot.date !== entry.date || deletedSnapshots.has(snapshot.id)
            || !Array.isArray(snapshot.markers)) continue;
        const excluded = new Set(snapshot.excludedIndices || []);
        snapshot.markers.forEach((marker, index) => {
          if (!excluded.has(index) && (marker?.mappedKey || marker?.suggestedKey) === key) {
            candidates.push({ snapshot, marker });
          }
        });
      }
      // Multiple rows or reports for the same key cannot establish a unique origin.
      if (candidates.length !== 1) continue;
      const { snapshot, marker } = candidates[0];
      const normalized = normalizeToSI(key, marker.value, marker.unit, marker);
      const matches = [marker.value, normalized].some(v => Number.isFinite(v)
        && (Object.is(v, original) || Object.is(v, value)));
      if (!matches) continue;
      entry.markerSources[key] = {
        ...source, snapshotId: snapshot.id, file: snapshot.fileName || null, manuallyEdited: true,
      };
    }
  }
}
