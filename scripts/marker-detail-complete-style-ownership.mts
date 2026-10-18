import {remainingFeatureOwnership} from './remaining-feature-style-ownership.mjs';
import {compileNativeStyleBodies, type NativeStyleOwnership} from './native-recipe-styles.mjs';
import {markerDetailPresentationOwnership} from './marker-detail-results-style-ownership.mjs';

// Remaining modal chrome, summary, biological-age and notes receivers only.
// Shared .modal/.ref-*/.manual-entry-btn/.ask-ai-btn consumers and the native LF-bearing gradients remain untouched.
export const markerDetailCompleteOwnership = {
  receivers: [
  [
    "marker-detail-dialog",
    ".marker-detail-modal",
    null
  ],
  [
    "marker-detail-children",
    ".marker-detail-modal *",
    null
  ],
  [
    "marker-detail-head-content-group",
    ".marker-detail-modal .gb-detail-head > div:first-child,\n.marker-detail-modal .modal-unit,\n.marker-detail-modal .gb-detail-summary,\n.marker-detail-modal .modal-values-grid,\n.marker-detail-modal .modal-ref-info,\n.marker-detail-modal .marker-note-section,\n.marker-detail-modal .calc-missing-inputs,\n.marker-detail-modal .bio-age-breakdown",
    null
  ],
  [
    "marker-detail-h3-group",
    ".marker-detail-modal h3,\n.marker-detail-modal .modal-unit,\n.marker-detail-modal .stat-card-value,\n.marker-detail-modal .stat-card-meta,\n.marker-detail-modal .mv-value,\n.marker-detail-modal .modal-ref-info,\n.marker-detail-modal .marker-note-text,\n.marker-detail-modal .calc-missing-inputs,\n.marker-detail-modal .bio-age-breakdown",
    null
  ],
  [
    "marker-detail-modal-close",
    ".marker-detail-modal .modal-close",
    null
  ],
  [
    "marker-detail-head",
    ".gb-detail-head",
    null
  ],
  [
    "marker-detail-head-fade",
    ".gb-detail-head::after",
    null
  ],
  [
    "marker-detail-kicker-group",
    ".gb-detail-kicker,\n.gb-detail-section-label",
    null
  ],
  [
    "marker-detail-h3",
    ".marker-detail-modal h3",
    null
  ],
  [
    "marker-detail-head-actions",
    ".gb-detail-head-actions",
    null
  ],
  [
    "marker-detail-pin-btn",
    ".gb-detail-pin-btn",
    null
  ],
  [
    "marker-detail-pin-btn-hover-group",
    ".gb-detail-pin-btn:hover,\n.gb-detail-pin-btn.is-pinned",
    null
  ],
  [
    "marker-detail-pin-btn-focus",
    ".gb-detail-pin-btn:focus-visible",
    null
  ],
  [
    "marker-detail-status",
    ".gb-detail-status",
    null
  ],
  [
    "marker-detail-status-normal",
    ".gb-detail-status-normal",
    null
  ],
  [
    "marker-detail-status-high",
    ".gb-detail-status-high",
    null
  ],
  [
    "marker-detail-status-low",
    ".gb-detail-status-low",
    null
  ],
  [
    "marker-detail-status-unrated",
    ".gb-detail-status-unrated",
    null
  ],
  [
    "marker-detail-marker-description-group",
    ".marker-detail-modal .marker-description,\n.marker-detail-modal .gb-detail-summary,\n.marker-detail-modal .gb-range-band,\n.marker-detail-modal .gb-detail-section-label,\n.marker-detail-modal .modal-chart,\n.marker-detail-modal .modal-values-grid,\n.marker-detail-modal .marker-history-show-more,\n.marker-detail-modal .modal-ref-info,\n.marker-detail-modal .calc-missing-inputs,\n.marker-detail-modal .bio-age-breakdown,\n.marker-detail-modal .manual-entry-btn,\n.marker-detail-modal .marker-note-section,\n.marker-detail-modal [id^=\"rec-modal-\"],\n.marker-detail-modal .ask-ai-btn",
    null
  ],
  [
    "marker-detail-bio-age-breakdown",
    ".marker-detail-modal .bio-age-breakdown",
    null
  ],
  [
    "marker-detail-bio-age-breakdown-head",
    ".marker-detail-modal .bio-age-breakdown-head",
    null
  ],
  [
    "marker-detail-bio-age-breakdown-sub-group",
    ".marker-detail-modal .bio-age-breakdown-sub,\n.marker-detail-modal .bio-age-breakdown-warning",
    null
  ],
  [
    "marker-detail-bio-age-breakdown-warning",
    ".marker-detail-modal .bio-age-breakdown-warning",
    null
  ],
  [
    "marker-detail-bio-age-component",
    ".marker-detail-modal .bio-age-component",
    null
  ],
  [
    "marker-detail-bio-age-component-bio-age-component",
    ".marker-detail-modal .bio-age-component + .bio-age-component",
    null
  ],
  [
    "marker-detail-bio-age-component-header",
    ".marker-detail-modal .bio-age-component-header",
    null
  ],
  [
    "marker-detail-bio-age-glyph",
    ".marker-detail-modal .bio-age-glyph",
    null
  ],
  [
    "marker-detail-bio-age-component-ok-bio-age-glyph-group",
    ".marker-detail-modal .bio-age-component-ok .bio-age-glyph,\n.marker-detail-modal .bio-age-component-ok .bio-age-component-header strong,\n.marker-detail-modal .bio-age-input.is-present",
    null
  ],
  [
    "marker-detail-bio-age-component-missing-bio-age-glyph-group",
    ".marker-detail-modal .bio-age-component-missing .bio-age-glyph,\n.marker-detail-modal .bio-age-input.is-missing",
    null
  ],
  [
    "marker-detail-bio-age-delta",
    ".marker-detail-modal .bio-age-delta",
    null
  ],
  [
    "marker-detail-bio-age-input-grid",
    ".marker-detail-modal .bio-age-input-grid",
    null
  ],
  [
    "marker-detail-bio-age-input",
    ".marker-detail-modal .bio-age-input",
    null
  ],
  [
    "marker-detail-bio-age-input-is-missing",
    ".marker-detail-modal .bio-age-input.is-missing",
    null
  ],
  [
    "marker-detail-manual-entry-btn-group",
    ".marker-detail-modal .manual-entry-btn,\n.marker-detail-modal .ask-ai-btn",
    null
  ],
  [
    "marker-detail-summary",
    ".gb-detail-summary",
    null
  ],
  [
    "marker-detail-summary-card",
    ".marker-detail-modal .stat-card",
    null
  ],
  [
    "marker-detail-summary-card-label",
    ".marker-detail-modal .stat-card-label",
    null
  ],
  [
    "marker-detail-summary-card-value",
    ".marker-detail-modal .stat-card-value",
    null
  ],
  [
    "marker-detail-summary-card-value-span",
    ".marker-detail-modal .stat-card-value span",
    null
  ],
  [
    "marker-detail-summary-card-value-range",
    ".marker-detail-modal .stat-card-value-range",
    null
  ],
  [
    "marker-detail-summary-card-value-val-normal",
    ".marker-detail-modal .stat-card-value.val-normal",
    null
  ],
  [
    "marker-detail-summary-card-value-val-high",
    ".marker-detail-modal .stat-card-value.val-high",
    null
  ],
  [
    "marker-detail-summary-card-value-val-low",
    ".marker-detail-modal .stat-card-value.val-low",
    null
  ],
  [
    "marker-detail-summary-card-value-val-unrated",
    ".marker-detail-modal .stat-card-value.val-unrated",
    null
  ],
  [
    "marker-detail-summary-card-meta",
    ".marker-detail-modal .stat-card-meta",
    null
  ],
  [
    "marker-detail-section-label",
    ".marker-detail-modal .gb-detail-section-label",
    null
  ],
  [
    "marker-detail-dialog-narrow-640",
    ".marker-detail-modal",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-modal-close-narrow-640",
    ".marker-detail-modal .modal-close",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-h3-narrow-640",
    ".marker-detail-modal h3",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-head-actions-narrow-640",
    ".marker-detail-modal .gb-detail-head-actions",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-pin-btn-group-narrow-640",
    ".marker-detail-modal .gb-detail-pin-btn,\n  .marker-detail-modal .gb-detail-status",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-marker-description-group-narrow-640",
    ".marker-detail-modal .marker-description,\n  .marker-detail-modal .gb-detail-summary,\n  .marker-detail-modal .gb-range-band,\n  .marker-detail-modal .gb-detail-section-label,\n  .marker-detail-modal .modal-chart,\n  .marker-detail-modal .modal-values-grid,\n  .marker-detail-modal .marker-history-show-more,\n  .marker-detail-modal .modal-ref-info,\n  .marker-detail-modal .calc-missing-inputs,\n  .marker-detail-modal .bio-age-breakdown,\n  .marker-detail-modal .manual-entry-btn,\n  .marker-detail-modal .marker-note-section,\n  .marker-detail-modal [id^=\"rec-modal-\"],\n  .marker-detail-modal .ask-ai-btn",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-manual-entry-btn-group-narrow-640",
    ".marker-detail-modal .manual-entry-btn,\n  .marker-detail-modal .ask-ai-btn",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-marker-description-narrow-640",
    ".marker-detail-modal .marker-description",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-summary-narrow-640",
    ".marker-detail-modal .gb-detail-summary",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-summary-card-narrow-640",
    ".marker-detail-modal .stat-card",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-summary-card-value-narrow-640",
    ".marker-detail-modal .stat-card-value",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-summary-card-value-span-narrow-640",
    ".marker-detail-modal .stat-card-value span",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-summary-card-value-range-narrow-640",
    ".marker-detail-modal .stat-card-value-range",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-gb-range-band-narrow-640",
    ".marker-detail-modal .gb-range-band",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-section-label-narrow-640",
    ".marker-detail-modal .gb-detail-section-label",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-dialog-modal-chart-narrow-640",
    ".modal.marker-detail-modal .modal-chart",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-note-header-narrow-640",
    ".marker-detail-modal .marker-note-header",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-note-actions-narrow-640",
    ".marker-detail-modal .marker-note-actions",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-note-actions-import-btn-narrow-640",
    ".marker-detail-modal .marker-note-actions .import-btn",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-manual-entry-form-me-field-select-me-unit-select-narrow-640",
    ".marker-detail-modal .manual-entry-form .me-field select.me-unit-select",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-head-narrow-380",
    ".marker-detail-modal .gb-detail-head",
    "(max-width: 380px)"
  ],
  [
    "marker-detail-marker-description-group-narrow-380",
    ".marker-detail-modal .marker-description,\n  .marker-detail-modal .gb-detail-summary,\n  .marker-detail-modal .gb-range-band,\n  .marker-detail-modal .gb-detail-section-label,\n  .marker-detail-modal .modal-chart,\n  .marker-detail-modal .modal-values-grid,\n  .marker-detail-modal .marker-history-show-more,\n  .marker-detail-modal .modal-ref-info,\n  .marker-detail-modal .calc-missing-inputs,\n  .marker-detail-modal .bio-age-breakdown,\n  .marker-detail-modal .manual-entry-btn,\n  .marker-detail-modal .marker-note-section,\n  .marker-detail-modal [id^=\"rec-modal-\"],\n  .marker-detail-modal .ask-ai-btn",
    "(max-width: 380px)"
  ],
  [
    "marker-detail-manual-entry-btn-group-narrow-380",
    ".marker-detail-modal .manual-entry-btn,\n  .marker-detail-modal .ask-ai-btn",
    "(max-width: 380px)"
  ],
  [
    "marker-detail-dialog-modal-chart-narrow-380",
    ".modal.marker-detail-modal .modal-chart",
    "(max-width: 380px)"
  ],
  [
    "marker-detail-marker-description-loaded",
    ".marker-detail-modal .marker-description.loaded",
    null
  ],
  [
    "marker-detail-marker-description-loading",
    ".marker-detail-modal .marker-description.loading",
    null
  ],
  [
    "marker-detail-section-label-span",
    ".marker-detail-modal .gb-detail-section-label > span",
    null
  ],
  [
    "marker-detail-actions",
    ".marker-detail-modal .gb-detail-actions",
    null
  ],
  [
    "marker-detail-action-row",
    ".marker-detail-modal .gb-detail-action-row",
    null
  ],
  [
    "marker-detail-actions-manual-entry-btn-group",
    ".marker-detail-modal .gb-detail-actions .manual-entry-btn,\n.marker-detail-modal .gb-detail-actions .ask-ai-btn",
    null
  ],
  [
    "marker-detail-actions-manual-entry-btn",
    ".marker-detail-modal .gb-detail-actions .manual-entry-btn",
    null
  ],
  [
    "marker-detail-actions-ask-ai-btn",
    ".marker-detail-modal .gb-detail-actions .ask-ai-btn",
    null
  ],
  [
    "marker-detail-actions-note-section-group",
    ".marker-detail-modal .gb-detail-actions .marker-note-section,\n.marker-detail-modal .gb-detail-actions [id^=\"rec-modal-\"]",
    null
  ],
  [
    "marker-detail-actions-id-rec-modal-empty",
    ".marker-detail-modal .gb-detail-actions [id^=\"rec-modal-\"]:empty",
    null
  ],
  [
    "marker-detail-head-fade-narrow-640",
    ".marker-detail-modal .gb-detail-head::after",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-actions-narrow-640",
    ".marker-detail-modal .gb-detail-actions",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-action-row-narrow-640",
    ".marker-detail-modal .gb-detail-action-row",
    "(max-width: 640px)"
  ],
  [
    "marker-detail-actions-narrow-380",
    ".marker-detail-modal .gb-detail-actions",
    "(max-width: 380px)"
  ],
  [
    "marker-detail-note-section",
    ".marker-detail-modal .marker-note-section",
    null
  ],
  [
    "marker-detail-note-header",
    ".marker-detail-modal .marker-note-header",
    null
  ],
  [
    "marker-detail-note-label",
    ".marker-detail-modal .marker-note-label",
    null
  ],
  [
    "marker-detail-note-edit-btn",
    ".marker-detail-modal .marker-note-edit-btn",
    null
  ],
  [
    "marker-detail-note-edit-btn-hover",
    ".marker-detail-modal .marker-note-edit-btn:hover",
    null
  ],
  [
    "marker-detail-note-text",
    ".marker-detail-modal .marker-note-text",
    null
  ],
  [
    "marker-detail-note-editor",
    ".marker-detail-modal .marker-note-editor",
    null
  ],
  [
    "marker-detail-note-editor-textarea",
    ".marker-detail-modal .marker-note-editor textarea",
    null
  ],
  [
    "marker-detail-note-editor-textarea-focus",
    ".marker-detail-modal .marker-note-editor textarea:focus",
    null
  ],
  [
    "marker-detail-note-actions",
    ".marker-detail-modal .marker-note-actions",
    null
  ],
  [
    "marker-detail-calc-missing-inputs",
    ".calc-missing-inputs",
    null
  ],
  [
    "marker-detail-dialog-narrow-480",
    ".modal.marker-detail-modal",
    "(max-width: 480px)"
  ],
  [
    "marker-detail-dialog-narrow-375",
    ".modal.marker-detail-modal",
    "(max-width: 375px)"
  ]
],
  declarationCount: 309,
  compactMetadataPrefix: true,
  isolateRecipes: true,
} as const satisfies NativeStyleOwnership;

export const markerDetailModalOwnership = {
  receivers: [...markerDetailPresentationOwnership.receivers, ...markerDetailCompleteOwnership.receivers, ...remainingFeatureOwnership.marker.receivers],
  declarationCount: markerDetailPresentationOwnership.declarationCount + markerDetailCompleteOwnership.declarationCount + remainingFeatureOwnership.marker.declarationCount,
  compactMetadataPrefix: true,
  isolateRecipes: true,
} as const satisfies NativeStyleOwnership;

export function compileMarkerDetailCompleteStyles(input: string, inputPath: string, root: string) {
  return compileNativeStyleBodies(input, inputPath, root, markerDetailModalOwnership);
}
