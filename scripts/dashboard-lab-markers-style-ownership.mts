import {dashboardNativeDataOwnership, dashboardNativeWidgetsOwnership} from './dashboard-native-style-ownership.mjs';
import {compileNativeStyleBodies, type NativeStyleOwnership} from './native-recipe-styles.mjs';
import {dashboardInsightsOwnership} from './dashboard-insights-style-ownership.mjs';
import {dashboardAIWidgetOwnership} from './dashboard-ai-cta-style-ownership.mjs';
import {dashboardQuickMarkerDataOwnership, dashboardQuickMarkerWidgetOwnership} from './dashboard-quick-markers-style-ownership.mjs';

const dataReceivers = [
  [
    "dashboard-lab-markers-db-spotlight",
    ".db-spotlight",
    null
  ],
  [
    "dashboard-lab-markers-db-spotlight-head",
    ".db-spotlight-head",
    null
  ],
  [
    "dashboard-lab-markers-db-spotlight-name",
    ".db-spotlight-name",
    null
  ],
  [
    "dashboard-lab-markers-db-spotlight-meta",
    ".db-spotlight-meta",
    null
  ],
  [
    "dashboard-lab-markers-db-spotlight-priority",
    ".db-spotlight-priority",
    null
  ],
  [
    "dashboard-lab-markers-db-spotlight-value",
    ".db-spotlight-value",
    null
  ],
  [
    "dashboard-lab-markers-db-spotlight-value-small",
    ".db-spotlight-value small",
    null
  ],
  [
    "dashboard-lab-markers-db-spotlight-db-spark",
    ".db-spotlight .db-spark",
    null
  ],
  [
    "dashboard-lab-markers-labs-priority-banner",
    ".labs-priority-banner",
    null
  ],
  [
    "dashboard-lab-markers-labs-priority-banner-hover",
    ".labs-priority-banner:hover",
    null
  ],
  [
    "dashboard-lab-markers-labs-priority-banner-focus-visible",
    ".labs-priority-banner:focus-visible",
    null
  ],
  [
    "dashboard-lab-markers-labs-priority-copy",
    ".labs-priority-copy",
    null
  ],
  [
    "dashboard-lab-markers-labs-priority-kicker",
    ".labs-priority-kicker",
    null
  ],
  [
    "dashboard-lab-markers-labs-priority-copy-strong",
    ".labs-priority-copy strong",
    null
  ],
  [
    "dashboard-lab-markers-labs-priority-copy-small",
    ".labs-priority-copy small",
    null
  ],
  [
    "dashboard-lab-markers-labs-priority-spark",
    ".labs-priority-spark",
    null
  ],
  [
    "dashboard-lab-markers-labs-priority-value",
    ".labs-priority-value",
    null
  ],
  [
    "dashboard-lab-markers-labs-priority-value-small",
    ".labs-priority-value small",
    null
  ],
  [
    "dashboard-lab-markers-data-theme-cyberterm-labs-priority-banner",
    "[data-theme=\"cyberterm\"] .labs-priority-banner",
    null
  ],
  [
    "dashboard-lab-markers-labs-priority-banner-max-width-900px",
    ".labs-priority-banner",
    "(max-width: 900px)"
  ],
  [
    "dashboard-lab-markers-labs-priority-spark-max-width-900px",
    ".labs-priority-spark",
    "(max-width: 900px)"
  ]
] as const;
const widgetReceivers = [
  [
    "dashboard-lab-markers-dashboard-widgets-is-adaptive-db-spotlight-db-spark",
    ".dashboard-widgets.is-adaptive .db-spotlight .db-spark",
    null
  ]
] as const;
export const dashboardLabMarkerDataOwnership = {
  ...dashboardInsightsOwnership,
  receivers: [...dashboardInsightsOwnership.receivers, ...dataReceivers, ...dashboardQuickMarkerDataOwnership.receivers, ...dashboardNativeDataOwnership.receivers, ["dashboard-biometric-manual-empty-remove-placement", ".db-biometric-manual-empty + .db-biometric-remove", null], ["dashboard-biometric-inline-edit-remove", ".db-biometric-manual-empty:has(.wearable-log-form) + .db-biometric-remove", null]],
  declarationCount: dashboardInsightsOwnership.declarationCount + 102 + dashboardQuickMarkerDataOwnership.declarationCount + dashboardNativeDataOwnership.declarationCount + 3,
} as const satisfies NativeStyleOwnership;
export const dashboardLabMarkerWidgetOwnership = {
  ...dashboardAIWidgetOwnership,
  receivers: [...dashboardAIWidgetOwnership.receivers, ...widgetReceivers, ...dashboardQuickMarkerWidgetOwnership.receivers, ...dashboardNativeWidgetsOwnership.receivers],
  declarationCount: dashboardAIWidgetOwnership.declarationCount + 1 + dashboardQuickMarkerWidgetOwnership.declarationCount + dashboardNativeWidgetsOwnership.declarationCount,
} as const satisfies NativeStyleOwnership;
export function compileDashboardLabMarkerDataStyles(input:string,inputPath:string,root:string){
  return compileNativeStyleBodies(input,inputPath,root,dashboardLabMarkerDataOwnership);
}
export function compileDashboardLabMarkerWidgetStyles(input:string,inputPath:string,root:string){
  return compileNativeStyleBodies(input,inputPath,root,dashboardLabMarkerWidgetOwnership);
}
