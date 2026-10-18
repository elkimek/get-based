import type { NativeStyleOwnership } from "./native-recipe-styles.mjs";

/** Import progress keeps its native cascade and shared reduced-motion rule. */
export const supplementImportProgressOwnership = {
  receivers: [
  [
    "supplement-import-progress-surface",
    ".supp-import-progress",
    null
  ],
  [
    "supplement-import-progress-hidden",
    ".supp-import-progress[hidden]",
    null
  ],
  [
    "supplement-import-progress-heading",
    ".supp-import-progress-head",
    null
  ],
  [
    "supplement-import-progress-detail",
    ".supp-import-progress-head span",
    null
  ],
  [
    "supplement-import-progress-track",
    ".supp-import-progress-track",
    null
  ],
  [
    "supplement-import-progress-fill",
    ".supp-import-progress-track span",
    null
  ],
  [
    "supplement-import-progress-running-shimmer",
    ".supp-import-progress-running .supp-import-progress-track span::after",
    null
  ],
  [
    "supplement-import-progress-success-surface",
    ".supp-import-progress-success",
    null
  ],
  [
    "supplement-import-progress-success-fill",
    ".supp-import-progress-success .supp-import-progress-track span",
    null
  ],
  [
    "supplement-import-progress-error-surface",
    ".supp-import-progress-error",
    null
  ],
  [
    "supplement-import-progress-error-fill",
    ".supp-import-progress-error .supp-import-progress-track span",
    null
  ],
  [
    "supplement-import-progress-heading-phone",
    ".supp-import-progress-head",
    "(max-width: 600px)"
  ],
  [
    "supplement-import-progress-detail-phone",
    ".supp-import-progress-head span",
    "(max-width: 600px)"
  ],
  [
    "supplement-import-progress-reduced-motion",
    ".supp-url-fetch.is-loading::before,\n  .supp-import-progress-running .supp-import-progress-track span::after",
    "(prefers-reduced-motion: reduce)"
  ]
],
  declarationCount: 39, compactMetadataPrefix: true, isolateRecipes: true,
} as const satisfies NativeStyleOwnership;
