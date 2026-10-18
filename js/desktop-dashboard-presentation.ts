import {renderHTML} from './components/DesktopDashboardPage.svelte.html.js';
import type {DashboardGreetingView, DashboardWelcomeView, DashboardOnboardingView} from './dashboard-welcome-presentation.js';
import type {LabDateRangeView} from './lab-date-range-presentation.js';
import type {DashboardActionBarView} from './dashboard-action-bar-presentation.js';
import type {DashboardWidgetFrameView} from './dashboard-widget-presentation.js';

/** A Dashboard render captures feature data once; Svelte composes its children. */
export interface DesktopDashboardPageView {
  readonly greeting: DashboardGreetingView;
  readonly dateRange: LabDateRangeView | null;
  readonly onboarding: DashboardOnboardingView | null;
  readonly reminder: DashboardOnboardingView | null;
  readonly stickyControls: DashboardActionBarView;
  readonly organizing: boolean;
  readonly widgets: readonly (DashboardWidgetFrameView | null)[];
  readonly empty: DashboardWelcomeView | null;
  readonly footerControls: DashboardActionBarView | null;
}
export function renderDesktopDashboardPage(view: DesktopDashboardPageView): string {
  return renderHTML({view});
}
