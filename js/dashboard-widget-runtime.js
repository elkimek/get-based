// @ts-check
// dashboard-widget-runtime.js - Browser runtime adapters for dashboard widget controls and renderers.

import { triggerContextCardDNAFilePickerRuntime } from './context-cards-runtime.js';
import { getDeviceSessions } from './light-devices-store.js';
import { getViewRuntimeFunction } from './views-runtime-bridge.js';

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

/**
 * @param {string} name
 * @returns {Function | null}
 */
function getRuntimeFunction(name) {
  const runtime = getRuntimeWindow();
  if (!runtime) return null;
  if (runtime && typeof runtime[name] === 'function') return runtime[name].bind(runtime);
  return getViewRuntimeFunction(name);
}

export function getDashboardViewportHeight() {
  const runtime = getRuntimeWindow();
  if (!runtime) return null;
  const height = Number(runtime?.innerHeight);
  return Number.isFinite(height) && height > 0 ? height : 0;
}

export function openDashboardWearablesSettings() {
  getRuntimeFunction('openSettingsModal')?.('wearables');
}

export function getDashboardLightSessions() {
  const getSessions = getRuntimeFunction('getSessions');
  if (!getSessions) return [];
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
  getRuntimeFunction('syncWearableNow')?.(actionEl);
}

/** @param {string} id */
export function openDashboardWearableDetail(id) {
  const openDetail = getRuntimeFunction('openWearableDetail');
  if (!openDetail) return false;
  openDetail(id);
  return true;
}

/**
 * @param {string} id
 * @param {Event} event
 */
export function openDashboardManualLogForm(id, event) {
  getRuntimeFunction('openManualLogForm')?.(id, event);
}

/** @param {string} id */
export function openDashboardMarkerDetail(id) {
  getRuntimeFunction('showDetailModal')?.(id);
}

/** @param {string} route */
export function navigateDashboardRoute(route) {
  getRuntimeFunction('navigate')?.(route);
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
