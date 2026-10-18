import type {NativeStyleOwnership} from './native-recipe-styles.mjs';

// Placement summary/form only; shared Manual/custom-marker declarations remain owned separately.
export const markerPlacementOwnership={
  "receivers": [
    [
      "marker-placement-summary-row",
      ".gb-detail-category-row",
      null
    ],
    [
      "marker-placement-summary-actions",
      ".gb-detail-category-change,\n.gb-detail-category-restore",
      null
    ],
    [
      "marker-placement-summary-actions-hover",
      ".gb-detail-category-change:hover,\n.gb-detail-category-restore:hover",
      null
    ],
    [
      "marker-placement-summary-actions-focus",
      ".gb-detail-category-change:focus-visible,\n.gb-detail-category-restore:focus-visible",
      null
    ],
    [
      "marker-placement-summary-origin",
      ".gb-detail-category-origin",
      null
    ],
    [
      "marker-placement-form",
      ".marker-placement-form",
      null
    ],
    [
      "marker-placement-safety-note",
      ".marker-placement-safety",
      null
    ],
    [
      "marker-placement-safety-note-heading",
      ".marker-placement-safety strong",
      null
    ],
    [
      "marker-placement-category-select",
      ".marker-placement-form #marker-placement-category",
      null
    ],
    [
      "marker-placement-help-text",
      ".marker-placement-current,\n.marker-placement-help",
      null
    ],
    [
      "marker-placement-current-category-name",
      ".marker-placement-current strong",
      null
    ],
    [
      "marker-placement-restore-action",
      ".marker-placement-restore",
      null
    ],
    [
      "marker-placement-summary-origin-phone",
      ".gb-detail-category-origin",
      "(max-width: 640px)"
    ],
    [
      "marker-placement-restore-action-phone",
      ".marker-placement-restore",
      "(max-width: 640px)"
    ]
  ],
  "declarationCount": 43
} as const satisfies NativeStyleOwnership;
