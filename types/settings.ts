import type { exportAllDataJSON, exportClientJSON, clearAllData } from '../js/export.js';
import type { openProfileShareModal } from '../js/profile-share.js';
import type { createNavigate } from '../js/views-router.js';

// Private readers at the original unvalidated Object.assign callback boundary.
export interface SettingsOperations {
  clearAllData: typeof clearAllData;
  exportAllDataJSON: typeof exportAllDataJSON;
  exportClientJSON: (profileId: unknown) => ReturnType<typeof exportClientJSON>;
  getActiveProfileId: () => unknown;
  navigate: ReturnType<typeof createNavigate>;
  openFeedbackModal(): unknown;
  openProfileShareModal: () => ReturnType<typeof openProfileShareModal>;
  clearDashboardWidgets(): unknown;
  resetDashboardWidgets(): unknown;
  toggleDashboardOrganizeMode(force?: boolean): unknown;
  refreshMobileDashboardActiveTab(): unknown;
}
export type SettingsSnapshot = { [Key in keyof SettingsOperations]: unknown } & Record<string, unknown>;
