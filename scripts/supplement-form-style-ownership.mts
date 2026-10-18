import {contextProfileOwnership} from './context-modal-style-ownership.mjs';
import {supplementEditorOwnership} from './supplement-editor-style-ownership.mjs';
import {supplementImpactOwnership} from './supplement-impact-style-ownership.mjs';
import {supplementImportProgressOwnership} from './supplement-import-progress-style-ownership.mjs';
import {compileNativeStyleBodies,type NativeStyleOwnership} from './native-recipe-styles.mjs';
import {supplementDashboardOwnership} from './supplement-dashboard-style-ownership.mjs';
import {dashboardLabNotesOwnership} from './dashboard-lab-notes-style-ownership.mjs';
// One aggregate pass expands timeline, form and Dashboard Notes recipes while preserving foreign bodies and cascade positions.
export const supplementFormOwnership={
 receivers:[
  [
    "supplement-form-surface",
    ".supp-form",
    null
  ],
  [
    "supplement-form-action-row",
    ".supp-form .note-editor-actions",
    null
  ],
  [
    "supplement-form-action-button",
    ".supp-form .note-editor-actions button",
    null
  ],
  [
    "supplement-form-section-heading",
    ".supp-form-section-title",
    null
  ],
  [
    "supplement-form-label-hint",
    ".supp-label-hint",
    null
  ],
  [
    "supplement-form-help-text",
    ".supp-form-help",
    null
  ],
  [
    "supplement-form-field-row",
    ".supp-form-row",
    null
  ],
  [
    "supplement-form-field",
    ".supp-form-field",
    null
  ],
  [
    "supplement-form-modal-field-row",
    ".modal .supp-form-row",
    null
  ],
  [
    "supplement-form-modal-field",
    ".modal .supp-form-field",
    null
  ],
  [
    "supplement-form-compact-field",
    ".supp-form-field-compact",
    null
  ],
  [
    "supplement-form-wide-field",
    ".supp-form-field-wide",
    null
  ],
  [
    "supplement-form-field-label",
    ".supp-form-field label",
    null
  ],
  [
    "supplement-form-field-control",
    ".supp-form-field input,\n.supp-form-field select,\n.supp-form-field textarea",
    null
  ],
  [
    "supplement-form-field-focus",
    ".supp-form-field input:focus,\n.supp-form-field select:focus,\n.supp-form-field textarea:focus",
    null
  ],
  [
    "supplement-form-textarea",
    ".supp-form-field textarea",
    null
  ],
  [
    "supplement-form-select",
    ".supp-form-field select",
    null
  ],
  [
    "supplement-form-select-option",
    ".supp-form-field select option",
    null
  ],
  [
    "supplement-form-ingredient-row",
    ".supp-ingredient-row",
    null
  ],
  [
    "supplement-form-ingredient-name",
    ".supp-ingredient-row .supp-ing-name",
    null
  ],
  [
    "supplement-form-ingredient-amount",
    ".supp-ingredient-row .supp-ing-amount",
    null
  ],
  [
    "supplement-form-ingredient-unit",
    ".supp-ingredient-row .supp-ing-unit",
    null
  ],
  [
    "supplement-form-ingredient-custom-unit",
    ".supp-ingredient-row .supp-ing-unit-custom",
    null
  ],
  [
    "supplement-form-ingredient-frequency",
    ".supp-ingredient-row .supp-ing-times",
    null
  ],
  [
    "supplement-form-ingredient-total",
    ".supp-ing-total",
    null
  ],
  [
    "supplement-form-ingredient-control",
    ".supp-ingredient-row input, .supp-ingredient-row select",
    null
  ],
  [
    "supplement-form-ingredient-focus",
    ".supp-ingredient-row input:focus, .supp-ingredient-row select:focus",
    null
  ],
  [
    "supplement-form-ingredient-hidden",
    ".supp-ingredient-row [hidden]",
    null
  ],
  [
    "supplement-form-ingredient-remove",
    ".supp-ing-remove",
    null
  ],
  [
    "supplement-form-ingredient-remove-hover",
    ".supp-ing-remove:hover",
    null
  ],
  [
    "supplement-form-url-row",
    ".supp-url-input-row",
    null
  ],
  [
    "supplement-form-url-input",
    ".supp-url-input-row input",
    null
  ],
  [
    "supplement-form-url-input-focus",
    ".supp-url-input-row input:focus",
    null
  ],
  [
    "supplement-form-review-link",
    ".supp-url-fetch",
    null
  ],
  [
    "supplement-form-review-link-hover",
    ".supp-url-fetch:hover",
    null
  ],
  [
    "supplement-form-review-link-disabled",
    ".supp-url-fetch:disabled",
    null
  ],
  [
    "supplement-form-review-link-loading",
    ".supp-url-fetch.is-loading::before",
    null
  ],
  [
    "supplement-form-ingredient-actions",
    ".supp-ingredient-actions",
    null
  ],
  [
    "supplement-form-add-ingredient",
    ".supp-ingredient-add",
    null
  ],
  [
    "supplement-form-add-ingredient-hover",
    ".supp-ingredient-add:hover",
    null
  ],
  [
    "supplement-form-add-ingredient-disabled",
    ".supp-ingredient-add:disabled",
    null
  ],
  [
    "supplement-form-period-row",
    ".supp-period-row",
    null
  ],
  [
    "supplement-form-period-date",
    ".supp-period-row input[type=\"date\"]",
    null
  ],
  [
    "supplement-form-period-dose",
    ".supp-period-row .supp-period-dose",
    null
  ],
  [
    "supplement-form-period-date-focus",
    ".supp-period-row input[type=\"date\"]:focus",
    null
  ],
  [
    "supplement-form-period-column-headings",
    ".supp-period-column-labels",
    null
  ],
  [
    "supplement-form-period-arrow",
    ".supp-period-arrow",
    null
  ],
  [
    "supplement-form-period-remove",
    ".supp-period-remove",
    null
  ],
  [
    "supplement-form-period-remove-hover",
    ".supp-period-remove:hover",
    null
  ],
  [
    "supplement-form-period-actions",
    ".supp-period-actions",
    null
  ],
  [
    "supplement-form-add-period",
    ".supp-period-add",
    null
  ],
  [
    "supplement-form-add-period-hover",
    ".supp-period-add:hover",
    null
  ],
  [
    "supplement-form-quality-grid",
    ".supp-quality-column-labels,\n.supp-quality-row",
    null
  ],
  [
    "supplement-form-quality-column-headings",
    ".supp-quality-column-labels",
    null
  ],
  [
    "supplement-form-quality-row",
    ".supp-quality-row",
    null
  ],
  [
    "supplement-form-quality-control",
    ".supp-quality-row input,\n.supp-quality-row select",
    null
  ],
  [
    "supplement-form-quality-ai-toggle",
    ".supp-quality-ai-toggle",
    null
  ],
  [
    "supplement-form-quality-ai-checkbox",
    ".supp-quality-ai-toggle input",
    null
  ],
  [
    "supplement-form-quality-scope-row",
    ".supp-quality-scope-row",
    null
  ],
  [
    "supplement-form-field-row-tablet",
    ".supp-form-row",
    "(max-width: 768px)"
  ],
  [
    "supplement-form-field-tablet",
    ".supp-form-field,\n  .supp-form-field-compact,\n  .supp-form-field-wide",
    "(max-width: 768px)"
  ],
  [
    "supplement-form-ingredient-row-phone",
    ".supp-ingredient-row",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-ingredient-name-phone",
    ".supp-ingredient-row .supp-ing-name",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-ingredient-amount-phone",
    ".supp-ingredient-row .supp-ing-amount",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-ingredient-unit-phone",
    ".supp-ingredient-row .supp-ing-unit",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-ingredient-custom-unit-phone",
    ".supp-ingredient-row .supp-ing-unit-custom",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-ingredient-frequency-phone",
    ".supp-ingredient-row .supp-ing-times",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-ingredient-total-phone",
    ".supp-ing-total",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-ingredient-remove-phone",
    ".supp-ing-remove",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-period-column-headings-phone",
    ".supp-period-column-labels",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-period-row-phone",
    ".supp-period-row",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-period-dose-phone",
    ".supp-period-row .supp-period-dose",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-period-remove-phone",
    ".supp-period-remove",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-quality-column-headings-phone",
    ".supp-quality-column-labels",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-quality-row-phone",
    ".supp-quality-row",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-quality-name-phone",
    ".supp-quality-row .supp-quality-category,\n  .supp-quality-row .supp-quality-analyte",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-quality-result-phone",
    ".supp-quality-row .supp-quality-result",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-quality-unit-phone",
    ".supp-quality-row .supp-quality-unit",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-quality-basis-phone",
    ".supp-quality-row .supp-quality-basis",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-quality-ai-toggle-phone",
    ".supp-quality-row .supp-quality-ai-toggle",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-quality-remove-phone",
    ".supp-quality-row .supp-ing-remove",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-period-ingredient-choice",
    ".supp-period-ingredient-choice",
    null
  ],
  [
    "supplement-form-period-ingredient-action",
    ".supp-period-row > .supp-ingredient-add",
    null
  ],
  [
    "supplement-form-period-dose-summary",
    ".supp-period-dose-summary",
    null
  ],
  [
    "supplement-form-detail-modal-phone",
    "#detail-modal:has(.supp-form)",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-detail-modal-title-phone",
    "#detail-modal:has(.supp-form) > h3:first-of-type",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-native-control-phone",
    ".supp-form input, .supp-form select, .supp-form textarea,\n  .supp-form .supp-period-row input, .supp-form .supp-ingredient-row input,\n  .supp-form .supp-ingredient-row select",
    "(max-width: 600px)"
  ],
  [
    "supplement-form-touch-action-phone",
    ".supp-form button",
    "(max-width: 600px)"
  ]
],
 declarationCount:300,compactMetadataPrefix:true,isolateRecipes:true,
} as const satisfies NativeStyleOwnership;
export const supplementProfileOwnership={
 receivers:[...supplementDashboardOwnership.receivers,...supplementFormOwnership.receivers,...dashboardLabNotesOwnership.receivers,...supplementImportProgressOwnership.receivers,...supplementImpactOwnership.receivers,...supplementEditorOwnership.receivers, ...contextProfileOwnership.receivers],
 declarationCount:891,compactMetadataPrefix:true,isolateRecipes:true,
} as const satisfies NativeStyleOwnership;
export function compileSupplementProfileStyles(input:string,inputPath:string,root:string){
 return compileNativeStyleBodies(input,inputPath,root,supplementProfileOwnership);
}
