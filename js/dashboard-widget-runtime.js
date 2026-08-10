// @ts-check
// dashboard-widget-runtime.js - Browser runtime adapters for dashboard widget controls and renderers.

import { triggerContextCardDNAFilePickerRuntime } from './context-cards-runtime.js';
import { buildSnpAIInterpretationPrompt } from './dna-evidence.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';
import { state } from './state.js';
import {
  getWearablesModuleFunction,
  isWearablesStylesheetLoaded,
  loadWearablesStylesheetForAction,
} from './wearables-runtime.js';

const dashboardWidgetRuntimeDeps = {
  navigate: /** @type {null | ((route: string) => unknown)} */ (null),
  openChatPanel: /** @type {null | ((prompt?: string) => unknown)} */ (null),
  showDetailModal: /** @type {null | ((id: string) => unknown)} */ (null),
};

export function configureDashboardWidgetRuntimeDeps(deps = {}) {
  const previous = { ...dashboardWidgetRuntimeDeps };
  if ('navigate' in deps) {
    dashboardWidgetRuntimeDeps.navigate = typeof deps.navigate === 'function'
      ? /** @type {(route: string) => unknown} */ (deps.navigate)
      : null;
  }
  if ('openChatPanel' in deps) {
    dashboardWidgetRuntimeDeps.openChatPanel = typeof deps.openChatPanel === 'function'
      ? /** @type {(prompt?: string) => unknown} */ (deps.openChatPanel)
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
  const sessions = state.importedData?.sunSessions;
  return Array.isArray(sessions) ? sessions : [];
}

export function getDashboardDeviceSessions() {
  const sessions = state.importedData?.deviceSessions;
  return Array.isArray(sessions) ? sessions : [];
}

export function getDashboardSnpTableCache() {
  const runtime = getRuntimeWindow();
  if (!runtime) return null;
  return runtime._snpTableCache || null;
}

export function getDashboardHaplogroupTableCache() {
  const runtime = getRuntimeWindow();
  if (!runtime) return null;
  return runtime._haplogroupTableCache || null;
}

/** @param {Element} actionEl */
export function syncDashboardWearableNow(actionEl) {
  getWearablesModuleFunction('syncWearableNow')?.(actionEl);
}

/** @param {string} id */
export function openDashboardWearableDetail(id) {
  const openDetail = getWearablesModuleFunction('openWearableDetail');
  if (!openDetail) return false;
  const ownsLazyStylesheet = typeof document !== 'undefined'
    && !!document.querySelector('[data-wearables-stylesheet-anchor]');
  if (!ownsLazyStylesheet || isWearablesStylesheetLoaded()) {
    openDetail(id);
  } else {
    void loadWearablesStylesheetForAction().then(loaded => {
      if (loaded) openDetail(id);
    });
  }
  return true;
}

/**
 * @param {string} id
 * @param {Event} event
 */
export function openDashboardManualLogForm(id, event) {
  const openManualLogForm = getWearablesModuleFunction('openManualLogForm');
  if (!openManualLogForm) return;
  const ownsLazyStylesheet = typeof document !== 'undefined'
    && !!document.querySelector('[data-wearables-stylesheet-anchor]');
  if (!ownsLazyStylesheet || isWearablesStylesheetLoaded()) {
    openManualLogForm(id, event);
  } else {
    void loadWearablesStylesheetForAction().then(loaded => {
      if (loaded) openManualLogForm(id, event);
    });
  }
}

/** @param {string} id */
export function openDashboardMarkerDetail(id) {
  dashboardWidgetRuntimeDeps.showDetailModal?.(id);
}

/** @param {string} rsid */
export function askDashboardAIAboutSnp(rsid) {
  const normalizedRsid = String(rsid || '').trim().toLowerCase();
  if (!/^rs\d+$/.test(normalizedRsid)) return false;
  const stored = state.importedData?.genetics?.snps?.[normalizedRsid];
  const entry = getDashboardSnpTableCache()?.[normalizedRsid];
  const prompt = buildSnpAIInterpretationPrompt(normalizedRsid, stored, entry);
  const openChatPanel = dashboardWidgetRuntimeDeps.openChatPanel;
  if (!prompt || !openChatPanel) return false;
  void Promise.resolve(openChatPanel(prompt)).catch(() => {});
  return true;
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
  if (index != null && Number.isInteger(index) && index >= 0) callDashboardNoteAction('openNoteEditor', null, index);
  else callDashboardNoteAction('openNoteEditor');
}

/** @param {number} index */
export function deleteDashboardNote(index) {
  callDashboardNoteAction('deleteNote', index);
}
