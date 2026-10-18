import type { NativeStyleOwnership } from "./native-recipe-styles.mjs";

/** Impact summaries and status dots keep their exact native cascade. */
export const supplementImpactOwnership = {
  receivers: [
  [
    "supplement-impact-section",
    ".supp-impact-section",
    null
  ],
  [
    "supplement-impact-header",
    ".supp-impact-header",
    null
  ],
  [
    "supplement-impact-refresh",
    ".supp-impact-refresh",
    null
  ],
  [
    "supplement-impact-refresh-hover",
    ".supp-impact-refresh:hover",
    null
  ],
  [
    "supplement-impact-hint",
    ".supp-impact-hint",
    null
  ],
  [
    "supplement-impact-summary",
    ".supp-impact-summary",
    null
  ],
  [
    "supplement-impact-summary-visible",
    ".supp-impact-summary-visible",
    null
  ],
  [
    "supplement-impact-summary-green",
    ".supp-impact-summary-green",
    null
  ],
  [
    "supplement-impact-summary-yellow",
    ".supp-impact-summary-yellow",
    null
  ],
  [
    "supplement-impact-summary-red",
    ".supp-impact-summary-red",
    null
  ],
  [
    "supplement-impact-dot",
    ".supp-impact-section .ctx-health-dot",
    null
  ],
  [
    "supplement-impact-dot-gray",
    ".supp-impact-section .ctx-health-dot-gray",
    null
  ],
  [
    "supplement-impact-dot-green",
    ".supp-impact-section .ctx-health-dot-green",
    null
  ],
  [
    "supplement-impact-dot-yellow",
    ".supp-impact-section .ctx-health-dot-yellow",
    null
  ],
  [
    "supplement-impact-dot-red",
    ".supp-impact-section .ctx-health-dot-red",
    null
  ]
],
  declarationCount: 48, compactMetadataPrefix: true, isolateRecipes: true,
} as const satisfies NativeStyleOwnership;
