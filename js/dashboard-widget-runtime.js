// @ts-check
// dashboard-widget-runtime.js - Browser runtime adapters for dashboard widget controls and renderers.

import { triggerContextCardDNAFilePickerRuntime } from './context-cards-runtime.js';

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
  return runtime && typeof runtime[name] === 'function' ? runtime[name].bind(runtime) : null;
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
  const getDeviceSessions = getRuntimeFunction('getDeviceSessions');
  if (!getDeviceSessions) return [];
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
  const openEditor = getRuntimeFunction('openNoteEditor');
  if (!openEditor) return;
  if (Number.isInteger(index) && index >= 0) openEditor(null, index);
  else openEditor();
}

/** @param {number} index */
export function deleteDashboardNote(index) {
  getRuntimeFunction('deleteNote')?.(index);
}
