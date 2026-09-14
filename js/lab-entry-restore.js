// @ts-check
import { mergeLabEntry } from './data-merge-lab-entries.js';
import { getLabEntryMarkerTombstoneAt, getLabEntryMarkerValueTimestamp, setLabEntryMarker } from './lab-entry.js';

// An explicit restore replaces supplied values, while retaining other markers
// on the same date and round-tripping entry-level context and deletion history.
export function mergeRestoredLabEntry(existing, incoming, now = Date.now()) {
  const restored = mergeLabEntry(existing, incoming);
  for (const [key, value] of Object.entries(incoming.markers || {})) {
    const deletedAt = getLabEntryMarkerTombstoneAt(incoming, key);
    if (deletedAt && deletedAt >= getLabEntryMarkerValueTimestamp(incoming, key)) continue;
    const source = Object.prototype.hasOwnProperty.call(incoming.markerSources || {}, key)
      ? incoming.markerSources[key]
      : Object.is(existing.markers?.[key], value) ? existing.markerSources?.[key] : null;
    setLabEntryMarker(restored, key, value, { now, source: source ? { ...source } : null });
  }
  if (existing.context || incoming.context) restored.context = { ...existing.context, ...incoming.context };
  if (existing.collectionContextSources || incoming.collectionContextSources) {
    restored.collectionContextSources = { ...existing.collectionContextSources, ...incoming.collectionContextSources };
  }
  return restored;
}
