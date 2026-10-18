import {compileNativeStyleBodies, type NativeStyleOwnership} from './native-recipe-styles.mjs';
import {dashboardGenomePresentationOwnership} from './dashboard-mtdna-panel-style-ownership.mjs';

export const dashboardAILensReceivers = [
  [
    "dashboard-ai-lens-row",
    ".lens-section",
    null
  ],
  [
    "dashboard-ai-lens-hover",
    ".lens-section:hover",
    null
  ],
  [
    "dashboard-ai-lens-icon",
    ".lens-section-icon",
    null
  ],
  [
    "dashboard-ai-lens-body",
    ".lens-section-body",
    null
  ],
  [
    "dashboard-ai-lens-label",
    ".lens-section-label",
    null
  ],
  [
    "dashboard-ai-lens-text",
    ".lens-section-text",
    null
  ],
  [
    "dashboard-ai-lens-edit",
    ".lens-section-edit",
    null
  ],
  [
    "dashboard-ai-lens-edit-hover",
    ".lens-section:hover .lens-section-edit",
    null
  ],
  [
    "dashboard-ai-lens-touch-edit",
    ".lens-section-edit",
    "(hover: none)"
  ]
] as const;
export const dashboardAIPillReceivers = [
  [
    "dashboard-ai-pill",
    ".dashboard-cta",
    null
  ],
  [
    "dashboard-ai-pill-hover",
    ".dashboard-cta:hover",
    null
  ],
  [
    "dashboard-ai-pill-active",
    ".dashboard-cta:active",
    null
  ],
  [
    "dashboard-ai-pill-focus",
    ".dashboard-cta:focus-visible",
    null
  ],
  [
    "dashboard-ai-pill-icon",
    ".dashboard-cta-icon",
    null
  ],
  [
    "dashboard-ai-pill-plus",
    ".dashboard-cta-plus",
    null
  ]
] as const;
export const dashboardAIDataOwnership = {
  receivers: [...dashboardGenomePresentationOwnership.receivers, ...dashboardAILensReceivers],
  declarationCount: dashboardGenomePresentationOwnership.declarationCount + 39,
  compactMetadataPrefix: true,
  isolateRecipes: true,
} as const satisfies NativeStyleOwnership;
export const dashboardAIWidgetOwnership = {
  receivers: dashboardAIPillReceivers,
  declarationCount: 23,
  compactMetadataPrefix: true,
  isolateRecipes: true,
} as const satisfies NativeStyleOwnership;
export function compileDashboardAIDataStyles(input: string, inputPath: string, root: string) {
  return compileNativeStyleBodies(input, inputPath, root, dashboardAIDataOwnership);
}
export function compileDashboardAIWidgetStyles(input: string, inputPath: string, root: string) {
  return compileNativeStyleBodies(input, inputPath, root, dashboardAIWidgetOwnership);
}
