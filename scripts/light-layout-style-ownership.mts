import {compileNativeStyleBodies,type NativeStyleOwnership} from './native-recipe-styles.mjs';

/** Structural layout only; declarations live in CSS recipes and theme tokens retain their public names. */
export const lightLayoutOwnership={
  "conditions": {
    receivers:[
      ["light-layout-conditions-page-dashboard-widget-data-widget-id-light-conditions-n",".light-page .dashboard-widget[data-widget-id=\"light-conditions-now\"] .dashboard-widget-body",null,{"preserveFormatting":true}],
      ["light-layout-conditions-conditions-now-data-conditions-tooltip-light-conditions",".conditions-now [data-conditions-tooltip],\n.light-conditions-now-actions [data-conditions-tooltip]",null,{"preserveFormatting":true}],
      ["light-layout-conditions-conditions-now-button-data-conditions-tooltip-light-con",".conditions-now button[data-conditions-tooltip],\n.light-conditions-now-actions button[data-conditions-tooltip]",null,{"preserveFormatting":true}],
      ["light-layout-conditions-conditions-now-data-conditions-tooltip-focus-visible-li",".conditions-now [data-conditions-tooltip]:focus-visible,\n.light-conditions-now-actions [data-conditions-tooltip]:focus-visible",null,{"preserveFormatting":true}],
    ],
    declarationCount:6, compactMetadataPrefix:true,isolateRecipes:true,
  },
  "devices": {
    receivers:[
      ["light-layout-devices-page-dashboard-widget-data-widget-id-light-devices-dash",".light-page .dashboard-widget[data-widget-id=\"light-devices\"] .dashboard-widget-body",null,{"preserveFormatting":true}],
    ],
    declarationCount:1, compactMetadataPrefix:true,isolateRecipes:true,
  },
  "environment": {
    receivers:[
      ["light-layout-environment-page-dashboard-widget-data-widget-id-light-environment",".light-page .dashboard-widget[data-widget-id=\"light-environment\"] .dashboard-widget-body",null,{"preserveFormatting":true}],
    ],
    declarationCount:1, compactMetadataPrefix:true,isolateRecipes:true,
  },
  "setup": {
    receivers:[
      ["light-layout-setup-page-dashboard-widget-data-widget-id-light-setup-dashbo",".light-page .dashboard-widget[data-widget-id=\"light-setup\"] .dashboard-widget-body",null,{"preserveFormatting":true}],
      ["light-layout-setup-page-dashboard-widget-data-widget-id-light-setup-light",".light-page .dashboard-widget[data-widget-id=\"light-setup\"] .light-setup-card,\n.light-page .dashboard-widget[data-widget-id=\"light-setup\"] .light-setup-summary",null,{"preserveFormatting":true}],
    ],
    declarationCount:7, compactMetadataPrefix:true,isolateRecipes:true,
  },
  "page": {
    receivers:[
      ["light-layout-page-page-lens-page-header-h2",".light-page .lens-page-header h2",null,{"preserveFormatting":true}],
      ["light-layout-page-page-lens-page-widgets",".light-page .lens-page-widgets",null,{"preserveFormatting":true}],
      ["light-layout-page-page-dashboard-widget-data-widget-id-light-dashboard-wi",".light-page .dashboard-widget[data-widget-id^=\"light-\"] .dashboard-widget-body",null,{"preserveFormatting":true}],
      ["light-layout-page-device-safety",".light-device-safety:not([data-light-detail-presentation] *)",null,{"preserveFormatting":true}],
      ["light-layout-page-device-safety-strong",".light-device-safety strong:not([data-light-detail-presentation] *)",null,{"preserveFormatting":true}],
      ["light-layout-page-device-safety-is-over",".light-device-safety.is-over:not([data-light-detail-presentation] *)",null,{"preserveFormatting":true}],
      ["light-layout-page-page-small-light-page-dashboard-widget-description-ligh",".light-page small,\n  .light-page .dashboard-widget-description,\n  .light-page .light-section-hint,\n  .light-page .dev-session-hint","(max-width: 720px)",{"preserveFormatting":true}],
      ["light-layout-page-dashboard-widget-data-widget-id-light-today-dashboard-w",".dashboard-widget[data-widget-id=\"light-today\"] .dashboard-widget-body",null,{"preserveFormatting":true}],
      ["light-layout-page-dashboard-widget-data-widget-id-light-today-light-today",".dashboard-widget[data-widget-id=\"light-today\"] .light-today-hero",null,{"preserveFormatting":true}],
      ["light-layout-page-dashboard-widget-data-widget-id-light-today-light-today-2",".dashboard-widget[data-widget-id=\"light-today\"] .light-today-strip",null,{"preserveFormatting":true}],
      ["light-layout-page-dashboard-widget-data-widget-id-light-live-session-ligh",".dashboard-widget[data-widget-id=\"light-live-session\"] .light-active-session-pinned,\n.light-page .dashboard-widget[data-widget-id=\"light-today\"] .light-med-banner",null,{"preserveFormatting":true}],
      ["light-layout-page-page-dashboard-widget-data-widget-id-light-methods-dash",".light-page .dashboard-widget[data-widget-id=\"light-methods\"] .dashboard-widget-body",null,{"preserveFormatting":true}],
      ["light-layout-page-page-dashboard-widget-data-widget-id-light-session-log",".light-page .dashboard-widget[data-widget-id=\"light-session-log\"] .dashboard-widget-body",null,{"preserveFormatting":true}],
      ["light-layout-page-dashboard-widget-data-widget-id-light-session-log-light",".dashboard-widget[data-widget-id=\"light-session-log\"] .light-quicklog-row",null,{"preserveFormatting":true}],
      ["light-layout-page-widget-prompt",".light-widget-prompt:not(:where([data-light-widget-prompt], [data-light-widget-prompt] *))",null,{"preserveFormatting":true}],
      ["light-layout-page-widget-prompt-copy",".light-widget-prompt-copy:not(:where([data-light-widget-prompt], [data-light-widget-prompt] *))",null,{"preserveFormatting":true}],
      ["light-layout-page-widget-prompt-copy-strong",".light-widget-prompt-copy strong:not(:where([data-light-widget-prompt], [data-light-widget-prompt] *))",null,{"preserveFormatting":true}],
      ["light-layout-page-widget-prompt-copy-p",".light-widget-prompt-copy p:not(:where([data-light-widget-prompt], [data-light-widget-prompt] *))",null,{"preserveFormatting":true}],
      ["light-layout-page-widget-prompt-cta",".light-widget-prompt-cta:not(:where([data-light-widget-prompt], [data-light-widget-prompt] *))",null,{"preserveFormatting":true}],
      ["light-layout-page-active-session-pinned",".light-active-session-pinned",null,{"preserveFormatting":true}],
      ["light-layout-page-summary-tally",".light-summary-tally",null,{"preserveFormatting":true}],
      ["light-layout-page-recent-sessions-header",".light-recent-sessions-header",null,{"preserveFormatting":true}],
      ["light-layout-page-section-title",".light-section-title",null,{"preserveFormatting":true}],
      ["light-layout-page-section-hint",".light-section-hint",null,{"preserveFormatting":true}],
      ["light-layout-page-today-cta-sun-silhouette-region",".light-today-cta,\n  .sun-silhouette-region","(prefers-reduced-motion: reduce)",{"preserveFormatting":true}],
      ["light-layout-page-context-label",".ctx-label",null,{"preserveFormatting":true}],
      ["light-layout-page-context-input-ctx-select",".ctx-input,\n.ctx-select",null,{"preserveFormatting":true}],
      ["light-layout-page-context-input-focus-ctx-select-focus",".ctx-input:focus,\n.ctx-select:focus",null,{"preserveFormatting":true}],
      ["light-layout-page-context-select",".ctx-select",null,{"preserveFormatting":true}],
      ["light-layout-page-context-select-option",".ctx-select option",null,{"preserveFormatting":true}],
      ["light-layout-page-data-theme-light-ctx-select","[data-theme=\"light\"] .ctx-select",null,{"preserveFormatting":true}],
      ["light-layout-page-context-label-input-type-checkbox",".ctx-label > input[type=\"checkbox\"]",null,{"preserveFormatting":true}],
      ["light-layout-page-textarea-ctx-input","textarea.ctx-input",null,{"preserveFormatting":true}],
      ["light-layout-page-sun-detail-section",".sun-detail-section:not([data-light-detail-presentation] *):not(:where([data-light-conditions-presentation], [data-light-conditions-presentation] *))",null,{"preserveFormatting":true}],
      ["light-layout-page-sun-detail-section-label",".sun-detail-section-label:not([data-light-detail-presentation] *):not(:where([data-light-conditions-presentation], [data-light-conditions-presentation] *))",null,{"preserveFormatting":true}],
      ["light-layout-page-sun-detail-section-value",".sun-detail-section-value:not([data-light-detail-presentation] *):not(:where([data-light-conditions-presentation], [data-light-conditions-presentation] *))",null,{"preserveFormatting":true}],
      ["light-layout-page-sun-detail-disclosure",".sun-detail-disclosure:not([data-light-detail-presentation] *)",null,{"preserveFormatting":true}],
      ["light-layout-page-sun-detail-disclosure-summary",".sun-detail-disclosure > summary:not([data-light-detail-presentation] *)",null,{"preserveFormatting":true}],
      ["light-layout-page-sun-detail-disclosure-open-summary",".sun-detail-disclosure[open] > summary:not([data-light-detail-presentation] *)",null,{"preserveFormatting":true}],
      ["light-layout-page-sun-detail-disclosure-p",".sun-detail-disclosure > p:not([data-light-detail-presentation] *),\n.sun-detail-disclosure > .sun-detail-channels:not([data-light-detail-presentation] *),\n.sun-detail-disclosure > .sun-detail-atm:not([data-light-detail-presentation] *),\n.sun-detail-disclosure > .sun-detail-input-location:not([data-light-detail-presentation] *),\n.sun-detail-disclosure > .light-device-safety:not([data-light-detail-presentation] *)",null,{"preserveFormatting":true}],
      ["light-layout-page-sun-detail-disclosure-p-2",".sun-detail-disclosure > p:not([data-light-detail-presentation] *)",null,{"preserveFormatting":true}],
      ["light-layout-page-sun-silhouette-hint",".sun-silhouette-hint",null,{"preserveFormatting":true}],
      ["light-layout-page-sun-silhouette-hint-error",".sun-silhouette-hint-error",null,{"preserveFormatting":true}],
      ["light-layout-page-touch-tooltip",".touch-tooltip",null,{"preserveFormatting":true}],
      ["light-layout-page-touch-tooltip-show",".touch-tooltip-show",null,{"preserveFormatting":true}],
      ["light-layout-page-sun-empty",".sun-empty",null,{"preserveFormatting":true}],
      ["light-layout-page-sun-empty-p",".sun-empty p",null,{"preserveFormatting":true}],
      ["light-layout-page-widget-prompt-2",".light-widget-prompt:not(:where([data-light-widget-prompt], [data-light-widget-prompt] *))","(max-width: 600px)",{"preserveFormatting":true}],
      ["light-layout-page-widget-prompt-cta-2",".light-widget-prompt-cta:not(:where([data-light-widget-prompt], [data-light-widget-prompt] *))","(max-width: 600px)",{"preserveFormatting":true}],
    ],
    declarationCount:170, compactMetadataPrefix:true,isolateRecipes:true,
  },
  "tools": {
    receivers:[
      ["light-layout-tools-page-dashboard-widget-data-widget-id-light-tools-dashbo",".light-page .dashboard-widget[data-widget-id=\"light-tools\"] .dashboard-widget-body",null,{"preserveFormatting":true}],
      ["light-layout-tools-tool-overlay-modal-overlay-show",".light-tool-overlay.modal-overlay.show",null,{"preserveFormatting":true}],
    ],
    declarationCount:3, compactMetadataPrefix:true,isolateRecipes:true,
  }
} as const satisfies Record<string,NativeStyleOwnership>;
export type LightLayoutLane=keyof typeof lightLayoutOwnership;
export function compileLightLayoutStyles(lane:LightLayoutLane,input:string,inputPath:string,root:string){
  return compileNativeStyleBodies(input,inputPath,root,lightLayoutOwnership[lane]);
}
