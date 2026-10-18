import {compileNativeStyleBodies, type NativeStyleOwnership} from './native-recipe-styles.mjs';
import {markerDetailFormOwnership} from './manual-marker-entry-style-ownership.mjs';

// Entirely result-history/range receivers only. Shared shell and generic .ref-* rules stay native.
export const markerDetailResultsOwnership = {
  receivers: [
  [
    "marker-detail-history-show-more",
    ".marker-detail-modal .marker-history-show-more",
    null
  ],
  [
    "marker-detail-history-show-more-hover",
    ".marker-detail-modal .marker-history-show-more:hover",
    null
  ],
  [
    "marker-detail-range-band",
    ".gb-range-band",
    null
  ],
  [
    "marker-detail-range-band-track",
    ".gb-range-band-track",
    null
  ],
  [
    "marker-detail-range-band-track-gb-range-band-zone-group",
    ".gb-range-band-track .gb-range-band-zone,\n.gb-range-band-track .gb-range-band-opt",
    null
  ],
  [
    "marker-detail-range-band-dot",
    ".gb-range-band-dot",
    null
  ],
  [
    "marker-detail-range-band-dot-normal",
    ".gb-range-band-dot-normal",
    null
  ],
  [
    "marker-detail-range-band-dot-high",
    ".gb-range-band-dot-high",
    null
  ],
  [
    "marker-detail-range-band-dot-low",
    ".gb-range-band-dot-low",
    null
  ],
  [
    "marker-detail-range-band-scale",
    ".gb-range-band-scale",
    null
  ],
  [
    "marker-detail-history-grid-narrow-768",
    ".marker-detail-modal .modal-values-grid",
    "(max-width: 768px)"
  ],
  [
    "marker-detail-history-show-more-narrow-640",
    ".marker-detail-modal .marker-history-show-more",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-history-grid-narrow-640",
    ".marker-detail-modal .modal-values-grid",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-history-card-narrow-640",
    ".marker-detail-modal .modal-value-card",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-mv-delete-narrow-640",
    ".marker-detail-modal .mv-delete",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-history-card-mv-value-narrow-640",
    ".marker-detail-modal .modal-value-card .mv-value",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-history-card-mv-value-note-narrow-640",
    ".marker-detail-modal .modal-value-card .mv-value-note",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-history-card-mv-value-note-text-narrow-640",
    ".marker-detail-modal .modal-value-card .mv-value-note-text",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-history-trend-narrow-640",
    ".marker-detail-modal .modal-ref-info",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-history-show-more-narrow-380",
    ".marker-detail-modal .marker-history-show-more",
    "(max-width: 380px)"
  ],
  [
    "marker-detail-history-grid",
    ".marker-detail-modal .modal-values-grid",
    null
  ],
  [
    "marker-detail-history-card",
    ".marker-detail-modal .modal-value-card",
    null
  ],
  [
    "marker-detail-history-card-status-normal",
    ".marker-detail-modal .modal-value-card.status-normal",
    null
  ],
  [
    "marker-detail-history-card-status-high",
    ".marker-detail-modal .modal-value-card.status-high",
    null
  ],
  [
    "marker-detail-history-card-status-low",
    ".marker-detail-modal .modal-value-card.status-low",
    null
  ],
  [
    "marker-detail-mv-delete",
    ".marker-detail-modal .mv-delete",
    null
  ],
  [
    "marker-detail-history-card-hover-mv-delete",
    ".marker-detail-modal .modal-value-card:hover .mv-delete",
    null
  ],
  [
    "marker-detail-mv-delete-hover",
    ".marker-detail-modal .mv-delete:hover",
    null
  ],
  [
    "marker-detail-history-card-mv-date",
    ".marker-detail-modal .modal-value-card .mv-date",
    null
  ],
  [
    "marker-detail-history-card-mv-source",
    ".marker-detail-modal .modal-value-card .mv-source",
    null
  ],
  [
    "marker-detail-history-card-hover-mv-source",
    ".marker-detail-modal .modal-value-card:hover .mv-source",
    null
  ],
  [
    "marker-detail-history-card-mv-source-manual",
    ".marker-detail-modal .modal-value-card .mv-source-manual",
    null
  ],
  [
    "marker-detail-history-card-mv-value",
    ".marker-detail-modal .modal-value-card .mv-value",
    null
  ],
  [
    "marker-detail-history-card-mv-alt",
    ".marker-detail-modal .modal-value-card .mv-alt",
    null
  ],
  [
    "marker-detail-history-card-mv-status",
    ".marker-detail-modal .modal-value-card .mv-status",
    null
  ],
  [
    "marker-detail-history-card-mv-phase",
    ".marker-detail-modal .modal-value-card .mv-phase",
    null
  ],
  [
    "marker-detail-history-card-mv-collection-context",
    ".marker-detail-modal .modal-value-card .mv-collection-context",
    null
  ],
  [
    "marker-detail-history-card-mv-value-note",
    ".marker-detail-modal .modal-value-card .mv-value-note",
    null
  ],
  [
    "marker-detail-history-card-mv-value-note-has-note",
    ".marker-detail-modal .modal-value-card .mv-value-note.has-note",
    null
  ],
  [
    "marker-detail-history-card-mv-value-note-add-note",
    ".marker-detail-modal .modal-value-card .mv-value-note.add-note",
    null
  ],
  [
    "marker-detail-history-card-hover-mv-value-note-add-note",
    ".marker-detail-modal .modal-value-card:hover .mv-value-note.add-note",
    null
  ],
  [
    "marker-detail-history-card-mv-value-note-add-note-hover",
    ".marker-detail-modal .modal-value-card .mv-value-note.add-note:hover",
    null
  ],
  [
    "marker-detail-history-card-mv-value-note-text",
    ".marker-detail-modal .modal-value-card .mv-value-note-text",
    null
  ],
  [
    "marker-detail-history-card-mv-value-note-text-hover",
    ".marker-detail-modal .modal-value-card .mv-value-note-text:hover",
    null
  ],
  [
    "marker-detail-history-card-mv-value-note-delete",
    ".marker-detail-modal .modal-value-card .mv-value-note-delete",
    null
  ],
  [
    "marker-detail-history-card-hover-mv-value-note-delete",
    ".marker-detail-modal .modal-value-card:hover .mv-value-note-delete",
    null
  ],
  [
    "marker-detail-history-card-mv-value-note-delete-hover",
    ".marker-detail-modal .modal-value-card .mv-value-note-delete:hover",
    null
  ],
  [
    "marker-detail-history-trend",
    ".marker-detail-modal .modal-ref-info",
    null
  ],
  [
    "marker-detail-history-trend-strong",
    ".marker-detail-modal .modal-ref-info strong",
    null
  ],
  [
    "marker-detail-range-controls",
    ".marker-detail-modal .stat-card-range-controls",
    null
  ],
  [
    "marker-detail-range-controls-ref-editable",
    ".marker-detail-modal .stat-card-range-controls .ref-editable",
    null
  ],
  [
    "marker-detail-range-controls-ref-editable-hover",
    ".marker-detail-modal .stat-card-range-controls .ref-editable:hover",
    null
  ],
  [
    "marker-detail-range-controls-ref-editable-optimal",
    ".marker-detail-modal .stat-card-range-controls .ref-editable-optimal",
    null
  ],
  [
    "marker-detail-range-suggestion",
    ".marker-detail-modal .marker-range-suggest",
    null
  ],
  [
    "marker-detail-range-suggestion-hover-group",
    ".marker-detail-modal .marker-range-suggest:hover,\n.marker-detail-modal .marker-range-suggest:focus-visible",
    null
  ],
  [
    "marker-detail-history-list",
    ".marker-detail-modal .marker-history-list",
    null
  ],
  [
    "marker-detail-history-row",
    ".marker-detail-modal .marker-history-row",
    null
  ],
  [
    "marker-detail-history-date-row",
    ".marker-detail-modal .marker-history-date-row",
    null
  ],
  [
    "marker-detail-history-value-row",
    ".marker-detail-modal .marker-history-value-row",
    null
  ],
  [
    "marker-detail-history-row-mv-date",
    ".marker-detail-modal .marker-history-row .mv-date",
    null
  ],
  [
    "marker-detail-history-row-mv-source",
    ".marker-detail-modal .marker-history-row .mv-source",
    null
  ],
  [
    "marker-detail-history-row-mv-value",
    ".marker-detail-modal .marker-history-row .mv-value",
    null
  ],
  [
    "marker-detail-history-row-mv-status",
    ".marker-detail-modal .marker-history-row .mv-status",
    null
  ],
  [
    "marker-detail-history-row-mv-alt-group",
    ".marker-detail-modal .marker-history-row .mv-alt,\n.marker-detail-modal .marker-history-row .mv-phase,\n.marker-detail-modal .marker-history-row .mv-collection-context,\n.marker-detail-modal .marker-history-row .mv-value-note",
    null
  ],
  [
    "marker-detail-history-row-mv-value-note",
    ".marker-detail-modal .marker-history-row .mv-value-note",
    null
  ],
  [
    "marker-detail-range-controls-narrow-640",
    ".marker-detail-modal .stat-card-range-controls",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-history-row-narrow-640",
    ".marker-detail-modal .marker-history-row",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-history-value-row-narrow-640",
    ".marker-detail-modal .marker-history-value-row",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-history-row-mv-value-narrow-640",
    ".marker-detail-modal .marker-history-row .mv-value",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-history-row-mv-status-narrow-640",
    ".marker-detail-modal .marker-history-row .mv-status",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-mv-delete-hover-none",
    ".marker-detail-modal .mv-delete",
    "(hover: none)"
  ],
  [
    "marker-detail-history-card-mv-source-hover-none",
    ".marker-detail-modal .modal-value-card .mv-source",
    "(hover: none)"
  ]
],
  declarationCount: 251,
  compactMetadataPrefix: true,
  isolateRecipes: true,
} as const satisfies NativeStyleOwnership;

export const markerDetailPresentationOwnership = {
  receivers: [...markerDetailFormOwnership.receivers, ...markerDetailResultsOwnership.receivers],
  declarationCount: markerDetailFormOwnership.declarationCount + markerDetailResultsOwnership.declarationCount,
  compactMetadataPrefix: true,
  isolateRecipes: true,
} as const satisfies NativeStyleOwnership;
export function compileMarkerDetailResultsStyles(input: string, inputPath: string, root: string) {
  return compileNativeStyleBodies(input, inputPath, root, markerDetailPresentationOwnership);
}
