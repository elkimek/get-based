// @ts-check
// dashboard-widget-runtime.js - Browser runtime adapters for dashboard widget controls and renderers.

import { triggerContextCardDNAFilePickerRuntime } from './context-cards-runtime.js';
import { getDeviceSessions } from './light-devices-store.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';
import { getSessions } from './sun-sessions-store.js';
import { getWearablesModuleFunction } from './wearables-runtime.js';

const dashboardWidgetRuntimeDeps = {
  navigate: /** @type {null | ((route: string) => unknown)} */ (null),
  showDetailModal: /** @type {null | ((id: string) => unknown)} */ (null),
};

export function configureDashboardWidgetRuntimeDeps(deps = {}) {
  const previous = { ...dashboardWidgetRuntimeDeps };
  if ('navigate' in deps) {
    dashboardWidgetRuntimeDeps.navigate = typeof deps.navigate === 'function'
      ? /** @type {(route: string) => unknown} */ (deps.navigate)
      : null;
  }
  if ('showDetailModal' in deps) {
    dashboardWidgetRuntimeDeps.showDetailModal = typeof deps.showDetailModal === 'function'
      ? /** @type {(id: string) => unknown} */ (deps.showDetailModal)
      : null;
  }
  return previous;
}

/** @type {Record<string, Function | null>} */
const dashboardNoteActions = {
  openNoteEditor: null,
  deleteNote: null,
};

/** @param {Record<string, any>} [actions] */
export function configureDashboardNoteActions(actions = {}) {
  const previous = { ...dashboardNoteActions };
  for (const name of Object.keys(dashboardNoteActions)) {
    if (name in actions) {
      dashboardNoteActions[name] = typeof actions[name] === 'function' ? actions[name] : null;
    }
  }
  return previous;
}

/** @param {string} name */
function callDashboardNoteAction(name, ...args) {
  const action = dashboardNoteActions[name];
  if (typeof action !== 'function') return false;
  action(...args);
  return true;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? /** @type {any} */ (window)
    : null;
}

export function getDashboardViewportHeight() {
  const runtime = getRuntimeWindow();
  if (!runtime) return null;
  const height = Number(runtime?.innerHeight);
  return Number.isFinite(height) && height > 0 ? height : 0;
}

export function openDashboardWearablesSettings() {
  getSettingsModuleFunction('openSettingsModal')?.('wearables');
}

export function getDashboardLightSessions() {
  try {
    const sessions = getSessions();
    return Array.isArray(sessions) ? sessions : [];
  } catch {
    return [];
  }
}

export function getDashboardDeviceSessions() {
  try {
    const sessions = getDeviceSessions();
    return Array.isArray(sessions) ? sessions : [];
  } catch {
    return [];
  }
}

export function getDashboardSnpTableCache() {
  const runtime = getRuntimeWindow();
  if (!runtime) return null;
  return runtime._snpTableCache || null;
}

/** @param {Element} actionEl */
export function syncDashboardWearableNow(actionEl) {
  getWearablesModuleFunction('syncWearableNow')?.(actionEl);
}

/** @param {string} id */
export function openDashboardWearableDetail(id) {
  const openDetail = getWearablesModuleFunction('openWearableDetail');
  if (!openDetail) return false;
  openDetail(id);
  return true;
}

/**
 * @param {string} id
 * @param {Event} event
 */
export function openDashboardManualLogForm(id, event) {
  getWearablesModuleFunction('openManualLogForm')?.(id, event);
}

/** @param {string} id */
export function openDashboardMarkerDetail(id) {
  dashboardWidgetRuntimeDeps.showDetailModal?.(id);
}

/** @param {string} route */
export function navigateDashboardRoute(route) {
  dashboardWidgetRuntimeDeps.navigate?.(route);
}

export function triggerDashboardDnaPicker() {
  triggerContextCardDNAFilePickerRuntime();
}

/** @param {number | null} [index] */
export function openDashboardNoteEditor(index = null) {
  if (Number.isInteger(index) && index >= 0) callDashboardNoteAction('openNoteEditor', null, index);
  else callDashboardNoteAction('openNoteEditor');
}

/** @param {number} index */
export function deleteDashboardNote(index) {
  callDashboardNoteAction('deleteNote', index);
}
