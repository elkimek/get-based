import {compileNativeStyleBodies,type NativeStyleOwnership} from './native-recipe-styles.mjs';
import {dashboardBiometricOwnership} from './dashboard-biometric-style-ownership.mjs';

const insightsReceivers = [
  [
    "dashboard-insights-db-insights-list",
    ".db-insights-list",
    null
  ],
  [
    "dashboard-insights-db-insight",
    ".db-insight",
    null
  ],
  [
    "dashboard-insights-db-insight-danger",
    ".db-insight-danger",
    null
  ],
  [
    "dashboard-insights-db-insight-warn",
    ".db-insight-warn",
    null
  ],
  [
    "dashboard-insights-db-insight-good",
    ".db-insight-good",
    null
  ],
  [
    "dashboard-insights-db-insight-info",
    ".db-insight-info",
    null
  ],
  [
    "dashboard-insights-db-insight-tag",
    ".db-insight-tag",
    null
  ],
  [
    "dashboard-insights-db-insight-strong",
    ".db-insight strong",
    null
  ],
  [
    "dashboard-insights-db-insight-span-last-child",
    ".db-insight span:last-child",
    null
  ]
] as const;
export const dashboardInsightsOwnership = {
  ...dashboardBiometricOwnership,
  receivers: [...dashboardBiometricOwnership.receivers, ...insightsReceivers],
  declarationCount: dashboardBiometricOwnership.declarationCount + 28,
} as const satisfies NativeStyleOwnership;
export function compileDashboardInsightsStyles(input:string,inputPath:string,root:string){
  return compileNativeStyleBodies(input,inputPath,root,dashboardInsightsOwnership);
}
