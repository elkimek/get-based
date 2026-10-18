import {renderHTML} from './components/DashboardActionBar.svelte.html.js';
import type {DashboardActionBarView} from './dashboard-action-bar-presentation.js';

/** Synchronous HTML; the existing caller retains its native innerHTML parsing and replacement. */
export function renderDashboardActionBar(view: DashboardActionBarView, sticky = false): string {
  return renderHTML({view, sticky});
}
