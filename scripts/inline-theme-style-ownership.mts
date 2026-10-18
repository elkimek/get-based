import {compileNativeStyleBodies,type NativeStyleOwnership} from './native-recipe-styles.mjs';

/** Eager inline CSS is compiled from semantic recipes and retains its exact first-paint position. */
export const inlineThemeStyleOwnership = {
  "startup-layout": {
    receivers: [
      ["inline-startup-layout-main-content","#main-content",null,{"preserveFormatting":true}],
    ],
    declarationCount:1,compactMetadataPrefix:true,isolateRecipes:true,
  },
  "shared-theme-modes": {
    receivers: [
      ["inline-shared-theme-modes-data-theme-header","[data-theme] .header",null,{"preserveFormatting":true}],
      ["inline-shared-theme-modes-data-theme-layout-data-theme-main","[data-theme] .layout,\n    [data-theme] .main",null,{"preserveFormatting":true}],
      ["inline-shared-theme-modes-data-theme-sidebar","[data-theme] .sidebar","(min-width: 1025px)",{"preserveFormatting":true}],
      ["inline-shared-theme-modes-data-theme-sidebar-2","[data-theme] .sidebar","(max-width: 1024px)",{"preserveFormatting":true}],
      ["inline-shared-theme-modes-root-data-sunset-mode-on",":root[data-sunset-mode=\"on\"]",null,{"preserveFormatting":true}],
      ["inline-shared-theme-modes-root-data-sunset-mode-on-body",":root[data-sunset-mode=\"on\"] body",null,{"preserveFormatting":true}],
      ["inline-shared-theme-modes-root-data-sunset-mode-on-body-before-root-data-sunset-mode-on-m-bg",":root[data-sunset-mode=\"on\"] body::before,\n    :root[data-sunset-mode=\"on\"] .m-bg",null,{"preserveFormatting":true}],
      ["inline-shared-theme-modes-root-data-sunset-mode-on-chart-card-root-data-sunset-mode-on-dashboard-widget-root-da",":root[data-sunset-mode=\"on\"] .chart-card,\n    :root[data-sunset-mode=\"on\"] .dashboard-widget,\n    :root[data-sunset-mode=\"on\"] .context-card,\n    :root[data-sunset-mode=\"on\"] .focus-card,\n    :root[data-sunset-mode=\"on\"] .lens-section,\n    :root[data-sunset-mode=\"on\"] .trend-alert-card,\n    :root[data-sunset-mode=\"on\"] .supp-timeline,\n    :root[data-sunset-mode=\"on\"] .alert-card,\n    :root[data-sunset-mode=\"on\"] .modal,\n    :root[data-sunset-mode=\"on\"] .header,\n    :root[data-sunset-mode=\"on\"] .sidebar,\n    :root[data-sunset-mode=\"on\"] .m-tabbar,\n    :root[data-sunset-mode=\"on\"] .m-stat-card,\n    :root[data-sunset-mode=\"on\"] .m-section,\n    :root[data-sunset-mode=\"on\"] .light-today-strip,\n    :root[data-sunset-mode=\"on\"] .light-channels-section,\n    :root[data-sunset-mode=\"on\"] .light-channel-detail,\n    :root[data-sunset-mode=\"on\"] .sun-session",null,{"preserveFormatting":true}],
      ["inline-shared-theme-modes-root-data-sunset-mode-on-header-root-data-sunset-mode-on-sidebar-root-data-sunset-mod",":root[data-sunset-mode=\"on\"] .header,\n    :root[data-sunset-mode=\"on\"] .sidebar,\n    :root[data-sunset-mode=\"on\"] .tweaks-panel,\n    :root[data-sunset-mode=\"on\"] .chat-panel",null,{"preserveFormatting":true}],
      ["inline-shared-theme-modes-root-data-sunset-mode-on-status-normal-root-data-sunset-mode-on-status-high-root-data",":root[data-sunset-mode=\"on\"] .status-normal,\n    :root[data-sunset-mode=\"on\"] .status-high,\n    :root[data-sunset-mode=\"on\"] .status-low,\n    :root[data-sunset-mode=\"on\"] .chart-card-status,\n    :root[data-sunset-mode=\"on\"] .sun-chip,\n    :root[data-sunset-mode=\"on\"] .light-pill,\n    :root[data-sunset-mode=\"on\"] .ctx-tag",null,{"preserveFormatting":true}],
    ],
    declarationCount:62,compactMetadataPrefix:true,isolateRecipes:true,
  },
} as const satisfies Record<'startup-layout'|'shared-theme-modes',NativeStyleOwnership>;

export function compileInlineThemeStyles(lane:keyof typeof inlineThemeStyleOwnership,input:string,inputPath:string,root:string){
  return compileNativeStyleBodies(input,inputPath,root,inlineThemeStyleOwnership[lane]);
}
