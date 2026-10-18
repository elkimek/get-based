/** Literal action-bar facts; organization, preferences and actions stay in the controller. */
export interface DashboardActionBarView {organizeLabel: 'Customize' | 'Done'; showReset: boolean}
export function projectDashboardActionBar(organizeMode: boolean, includeReset: unknown = false): DashboardActionBarView {
  return {organizeLabel: organizeMode ? 'Done' : 'Customize', showReset: !!(includeReset || organizeMode)};
}
