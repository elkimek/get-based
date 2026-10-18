// Storage-backed pin operations shared by the boot shell and resident Dashboard.
import {state} from './state.js';
import {profileStorageKey} from './profile.js';
import {safeMarkerId, showNotification} from './utils.js';
import {getActiveData} from './data.js';
import {resolveMarkerStorageViewId} from './marker-placement.js';
import {openDashboardMarkerDetail} from './dashboard-widget-runtime.js';

export const DASHBOARD_QUICK_MARKERS_MAX = 4;

export function createDashboardQuickMarkerCore(rerenderDashboardFromWidgetChange: () => unknown) {
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

  return {getDashboardQuickMarkerPins, isDashboardQuickMarkerPinned, toggleDashboardQuickMarkerPin};
}
