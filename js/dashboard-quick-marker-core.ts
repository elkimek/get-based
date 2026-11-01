// Storage-backed pin operations shared by the boot shell and resident Dashboard.
import {state} from './state.js';
import {safeMarkerId, showNotification as notify} from './utils.js';
import {profileStorageKey} from './profile.js';
import {getActiveData} from './data.js';
import {resolveMarkerStorageViewId} from './marker-placement.js';
import {openDashboardMarkerDetail as openDetail} from './dashboard-widget-runtime.js';
import {dashboardPreferenceKey, readDashboardPreferenceRaw, writeDashboardPreferenceRaw, afterDashboardPreferenceCommit} from './dashboard-preference-store.js';
import {runNativeDashboardPreferenceAction} from './dashboard-native-commands.js';

export const DASHBOARD_QUICK_MARKERS_MAX = 4;

export function createDashboardQuickMarkerCore(renderDashboardAfterChange: () => unknown) {
  // Keep the independent native pin algorithm; storage and presentation use the shared owner.
  const localStorage = {
    getItem(key: string) { if (key !== dashboardPreferenceKey('pins')) throw new Error('The native pin profile changed.'); return readDashboardPreferenceRaw('pins'); },
    setItem(key: string, raw: string) { if (key !== dashboardPreferenceKey('pins')) throw new Error('The native pin profile changed.'); writeDashboardPreferenceRaw('pins', raw); },
  };
  const showNotification = (...args: Parameters<typeof notify>) => afterDashboardPreferenceCommit(() => notify(...args));
  const rerenderDashboardFromWidgetChange = () => afterDashboardPreferenceCommit(renderDashboardAfterChange);
  const openDashboardMarkerDetail = (id: string) => afterDashboardPreferenceCommit(() => openDetail(id));
  function dashboardQuickMarkerPinsKey() {
    return profileStorageKey(state.currentProfile || 'default', 'dashboardQuickMarkerPinsV1');
  }

  function normalizeDashboardQuickMarkerPins(ids: unknown) {
    const seen = new Set();
    const normalized: string[] = [];
    for (const id of Array.isArray(ids) ? ids : []) {
      if (!safeMarkerId(id) || seen.has(id)) continue;
      seen.add(id);
      normalized.push(id as string);
      if (normalized.length >= DASHBOARD_QUICK_MARKERS_MAX) break;
    }
    return normalized;
  }

  function getDashboardQuickMarkerPins() {
    try {
      return normalizeDashboardQuickMarkerPins(JSON.parse(localStorage.getItem(dashboardQuickMarkerPinsKey()) || '[]'));
    } catch (e) {
      return [];
    }
  }

  function saveDashboardQuickMarkerPins(ids: unknown) {
    localStorage.setItem(dashboardQuickMarkerPinsKey(), JSON.stringify(normalizeDashboardQuickMarkerPins(ids)));
  }

  function isDashboardQuickMarkerPinned(id: unknown) {
    return (getDashboardQuickMarkerPins() as readonly unknown[]).includes(resolveMarkerStorageViewId(getActiveData().categories, id) || id);
  }

  function toggleDashboardQuickMarkerPin(id: unknown) {
    if (!safeMarkerId(id)) return;
    id = resolveMarkerStorageViewId(getActiveData().categories, id) || id;
    const pins = getDashboardQuickMarkerPins();
    const existing = pins.indexOf(id as string);
    let pinned = false;
    if (existing >= 0) {
      pins.splice(existing, 1);
    } else {
      pins.unshift(id as string);
      pinned = true;
    }
    saveDashboardQuickMarkerPins(pins);
    showNotification(pinned ? 'Pinned to Quick Markers' : 'Removed from Quick Markers', pinned ? 'success' : 'info');
    if (state.currentView === 'dashboard') rerenderDashboardFromWidgetChange();
    if (state._activeDetailMarkerId === id) openDashboardMarkerDetail(id as string);
  }

  const toggleDashboardQuickMarkerPinGuarded = (id: unknown) => {
    const editing = () => [...document.querySelectorAll<HTMLElement>('#detail-modal input:not([type="hidden"]),#detail-modal textarea')].some(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
    if (editing()) { showNotification('Finish the current marker edit before changing Quick Marker pins.', 'info'); return Promise.resolve(null); }
    return runNativeDashboardPreferenceAction(() => toggleDashboardQuickMarkerPin(id), () => !editing());
  };
  return {getDashboardQuickMarkerPins, isDashboardQuickMarkerPinned, toggleDashboardQuickMarkerPin, toggleDashboardQuickMarkerPinGuarded};
}
