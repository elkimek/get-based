import {compileNativeStyleBodies,type NativeStyleOwnership} from './native-recipe-styles.mjs';
import {dashboardAIDataOwnership} from './dashboard-ai-cta-style-ownership.mjs';

const biometricReceivers = [
  [
    "dashboard-biometric-db-biometric-overview-bar",
    ".db-biometric-overview-bar",
    null
  ],
  [
    "dashboard-biometric-db-biometric-overview-actions",
    ".db-biometric-overview-actions",
    null
  ],
  [
    "dashboard-biometric-db-biometric-sync-status",
    ".db-biometric-sync-status",
    null
  ],
  [
    "dashboard-biometric-db-biometric-sync-status-is-stale",
    ".db-biometric-sync-status.is-stale",
    null
  ],
  [
    "dashboard-biometric-db-biometric-sync-btn",
    ".db-biometric-sync-btn",
    null
  ],
  [
    "dashboard-biometric-db-biometric-tile-wrap",
    ".db-biometric-tile-wrap",
    null
  ],
  [
    "dashboard-biometric-db-biometric-tile-wrap-db-wearable-tile-group",
    ".db-biometric-tile-wrap > .db-wearable-tile,\n.db-biometric-tile-wrap > .wearable-card",
    null
  ],
  [
    "dashboard-biometric-wearable-card-db-biometric-manual-empty",
    ".wearable-card.db-biometric-manual-empty",
    null
  ],
  [
    "dashboard-biometric-wearable-card-db-biometric-manual-empty-hover",
    ".wearable-card.db-biometric-manual-empty:hover",
    null
  ],
  [
    "dashboard-biometric-wearable-card-db-biometric-manual-empty-focus-visible",
    ".wearable-card.db-biometric-manual-empty:focus-visible",
    null
  ],
  [
    "dashboard-biometric-db-biometric-manual-empty-wearable-card-top-group",
    ".db-biometric-manual-empty .wearable-card-top,\n.db-biometric-manual-empty .wearable-card-bottom",
    null
  ],
  [
    "dashboard-biometric-db-biometric-manual-empty-wearable-card-bottom",
    ".db-biometric-manual-empty .wearable-card-bottom",
    null
  ],
  [
    "dashboard-biometric-db-biometric-manual-empty-wearable-metric-name",
    ".db-biometric-manual-empty .wearable-metric-name",
    null
  ],
  [
    "dashboard-biometric-db-biometric-manual-empty-wearable-value-row",
    ".db-biometric-manual-empty .wearable-value-row",
    null
  ],
  [
    "dashboard-biometric-db-biometric-manual-empty-wearable-value",
    ".db-biometric-manual-empty .wearable-value",
    null
  ],
  [
    "dashboard-biometric-db-biometric-manual-empty-wearable-empty-cta",
    ".db-biometric-manual-empty .wearable-empty-cta",
    null
  ],
  [
    "dashboard-biometric-db-biometric-remove",
    ".db-biometric-remove",
    null
  ],
  [
    "dashboard-biometric-db-biometric-tile-wrap-hover-db-biometric-remove-group",
    ".db-biometric-tile-wrap:hover .db-biometric-remove,\n.db-biometric-remove:focus-visible",
    null
  ],
  [
    "dashboard-biometric-db-biometric-remove-hover",
    ".db-biometric-remove:hover",
    null
  ],
  [
    "dashboard-biometric-db-biometric-remove-pointer-coarse",
    ".db-biometric-remove",
    "(pointer: coarse)"
  ]
] as const;
export const dashboardBiometricOwnership = {
  ...dashboardAIDataOwnership,
  receivers: [...dashboardAIDataOwnership.receivers, ...biometricReceivers],
  declarationCount: dashboardAIDataOwnership.declarationCount + 88,
} as const satisfies NativeStyleOwnership;
export function compileDashboardBiometricStyles(input:string,inputPath:string,root:string){
  return compileNativeStyleBodies(input,inputPath,root,dashboardBiometricOwnership);
}
