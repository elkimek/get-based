// dashboard-widget-runtime.js - Browser runtime adapters for dashboard widget controls and renderers.

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
import { triggerContextCardDNAFilePickerRuntime } from './context-cards-runtime.js';
import { getDnaModuleFunction } from './dna-runtime-bridge.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';
import { state } from './state.js';
import {
  getWearablesModuleFunction,
  isWearablesStylesheetLoaded,
  loadWearablesStylesheetForAction,
} from './wearables-runtime.js';

type DashboardWidgetCalls = {
  navigate: ((route: string) => unknown) | null;
  openChatPanel: ((prompt?: unknown) => unknown) | null;
  showDetailModal: ((id: string) => unknown) | null;
};
export type DashboardWidgetRuntimeSnapshot = { [Key in keyof DashboardWidgetCalls]: unknown };
interface DashboardWindowReader { innerHeight?: unknown; _snpTableCache?: unknown; _haplogroupTableCache?: unknown }
const dashboardWidgetRuntimeDeps: DashboardWidgetCalls = {
  navigate: (null),
  openChatPanel: (null),
  showDetailModal: (null),
};

export function configureDashboardWidgetRuntimeDeps(deps: unknown = {}): DashboardWidgetRuntimeSnapshot {
  return configureRuntimeCallbacks(dashboardWidgetRuntimeDeps, deps as Partial<DashboardWidgetCalls>, 'inherited');
}

const dashboardNoteActions: Record<string, unknown> = {
  openNoteEditor: null,
  deleteNote: null,
};

export function configureDashboardNoteActions(actions: unknown = {}) {
  const previous = { ...dashboardNoteActions };
  for (const name of Object.keys(dashboardNoteActions)) {
    if (name in (actions as object)) {
      dashboardNoteActions[name] = typeof (actions as Record<string, unknown>)[name] === 'function' ? (actions as Record<string, unknown>)[name] : null;
    }
  }
  return previous;
}

function callDashboardNoteAction(name: string, ...args: unknown[]) {
  const action = dashboardNoteActions[name];
  if (typeof action !== 'function') return false;
  (action as (...args: unknown[]) => unknown)(...args);
  return true;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? (window as unknown as DashboardWindowReader)
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

export function getDashboardLightSessions(): unknown[] {
  const sessions = state.importedData?.sunSessions;
  return Array.isArray(sessions) ? sessions : [];
}

export function getDashboardDeviceSessions(): unknown[] {
  const sessions = state.importedData?.deviceSessions;
  return Array.isArray(sessions) ? sessions : [];
}

export function getDashboardSnpTableCache(): unknown {
  const runtime = getRuntimeWindow();
  if (!runtime) return null;
  return runtime._snpTableCache || null;
}

export function getDashboardHaplogroupTableCache(): unknown {
  const runtime = getRuntimeWindow();
  if (!runtime) return null;
  return runtime._haplogroupTableCache || null;
}

export function syncDashboardWearableNow(actionEl: unknown) {
  getWearablesModuleFunction('syncWearableNow')?.(actionEl);
}

export function openDashboardWearableDetail(id: string) {
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

export function openDashboardManualLogForm(id: string, event: unknown) {
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

export function openDashboardMarkerDetail(id: string) {
  dashboardWidgetRuntimeDeps.showDetailModal?.(id);
}

export function askDashboardAIAboutSnp(rsid: unknown) {
  const normalizedRsid = String(rsid || '').trim().toLowerCase();
  if (!/^rs\d+$/.test(normalizedRsid)) return false;
  const stored = state.importedData?.genetics?.snps?.[normalizedRsid];
  const entry = (getDashboardSnpTableCache() as Record<string, unknown> | null)?.[normalizedRsid];
  const prompt = (getDnaModuleFunction('buildSnpAIInterpretationPrompt') as ((rsid: unknown, stored: unknown, entry: unknown) => unknown) | null)?.(normalizedRsid, stored, entry) || '';
  const openChatPanel = dashboardWidgetRuntimeDeps.openChatPanel;
  if (!prompt || !openChatPanel) return false;
  void Promise.resolve(openChatPanel(prompt)).catch(() => {});
  return true;
}

export function navigateDashboardRoute(route: string) {
  dashboardWidgetRuntimeDeps.navigate?.(route);
}

export function openDashboardChatPrompt(prompt: unknown) {
  const openChatPanel = dashboardWidgetRuntimeDeps.openChatPanel;
  if (!openChatPanel) return Promise.reject(new Error('Chat is not available.'));
  return Promise.resolve(openChatPanel(prompt));
}

export function triggerDashboardDnaPicker() {
  triggerContextCardDNAFilePickerRuntime();
}

export function openDashboardNoteEditor(index: unknown = null) {
  if (index != null && Number.isInteger(index) && (index as number) >= 0) callDashboardNoteAction('openNoteEditor', null, index);
  else callDashboardNoteAction('openNoteEditor');
}

export function deleteDashboardNote(index: unknown) {
  callDashboardNoteAction('deleteNote', index);
}
