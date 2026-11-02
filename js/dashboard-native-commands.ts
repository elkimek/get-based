// Native click/drag/pin actions retain their existing synchronous semantic bodies.
import { state } from './state.js';
import { routeRevision } from './route-lifecycle.js';
import { runDashboardPreferenceCommand } from './dashboard-preference-store.js';
import { showNotification } from './utils.js';
export async function runNativeDashboardPreferenceAction(action: () => unknown, isCurrent: () => boolean = () => true) {
  const profile = state.currentProfile, root = state.importedData, route = routeRevision();
  const main = document.getElementById('main-content')?.firstElementChild, detail = document.getElementById('detail-modal')?.firstElementChild;
  const overlay = document.getElementById('modal-overlay'), shown = overlay?.classList.contains('show'), picker = document.getElementById('dashboard-widget-picker-overlay');
  const current = () => state.currentProfile === profile && state.importedData === root && routeRevision() === route;
  const presentationOwner = () => state.currentProfile === profile && state.importedData === root;
  const ready = () => current() && isCurrent() && document.getElementById('main-content')?.firstElementChild === main && document.getElementById('detail-modal')?.firstElementChild === detail && document.getElementById('modal-overlay') === overlay && overlay?.classList.contains('show') === shown && document.getElementById('dashboard-widget-picker-overlay') === picker;
  try {
    const result = await runDashboardPreferenceCommand(action, { canCommit: ready, canPublish: presentationOwner });
    if (result.presentationFailed && current()) showNotification('Dashboard preferences were saved. Reopen the view to refresh its display.', 'info');
    return result;
  } catch (error) {
    if (current()) showNotification(error instanceof Error ? error.message : 'Dashboard preferences could not be confirmed. Check Customize before trying again.', 'error');
    return null;
  }
}
