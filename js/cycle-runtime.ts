import { createRetryingStylesheetLoader, findStylesheet } from './retrying-module-loader.js';
// cycle-runtime.js - Explicit application callbacks for Cycle views.

import { configureRuntimeCallbacks } from './runtime-callbacks.js';
import { showNotification } from './utils.js';

interface CycleRuntimeDeps {
  closeModal: (() => void) | null;
  loadImportStylesheet: (() => Promise<unknown>) | null;
  navigate: ((category: string) => void) | null;
  openEditor: (() => void) | null;
  renderProfileButton: (() => void) | null;
}
type CycleAnalysisBridge = {
  [K in 'detectCycleIronAlerts' | 'detectPerimenopausePattern' | 'getBloodDrawPhases' | 'getNextBestDrawDate']:
    typeof import('./cycle.js')[K] | null;
};

const CYCLE_STYLESHEET_URL = new URL('../css/cycle.css', import.meta.url).href;
const cycleStylesheetPromiseCache = createRetryingStylesheetLoader({
  existing: existingCycleStylesheet,
  createLink: (_retry, existing) => {
    const link = existing || document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cycleStylesheetUrl();
    link.dataset.cycleStylesheet = '';
    return link;
  },
  insertLink: link => {
    if (!link.isConnected) {
      const anchor = document.querySelector('[data-cycle-stylesheet-anchor]');
      const parent = anchor?.parentNode || document.head;
      parent.insertBefore(link, anchor || null);
    }
  },
  requireDocument: "Cycle stylesheet requires a document",
  failedLoad: "Cycle stylesheet could not be loaded",
});

const cycleRuntimeDeps: CycleRuntimeDeps = {
  closeModal: null,
  loadImportStylesheet: null,
  navigate: null,
  openEditor: null,
  renderProfileButton: null,
};

const cycleAnalysisBridge: CycleAnalysisBridge = {
  detectCycleIronAlerts: null,
  detectPerimenopausePattern: null,
  getBloodDrawPhases: null,
  getNextBestDrawDate: null,
};

export function configureCycleAnalysisBridge(api: Partial<CycleAnalysisBridge> = {}) {
  return configureRuntimeCallbacks(cycleAnalysisBridge, api);
}

export function getCycleBloodDrawPhasesRuntime(...args: Parameters<NonNullable<CycleAnalysisBridge['getBloodDrawPhases']>>): ReturnType<NonNullable<CycleAnalysisBridge['getBloodDrawPhases']>> {
  return cycleAnalysisBridge.getBloodDrawPhases?.(...args) || {};
}

export function getCycleNextBestDrawDateRuntime(...args: Parameters<NonNullable<CycleAnalysisBridge['getNextBestDrawDate']>>) {
  return cycleAnalysisBridge.getNextBestDrawDate?.(...args) || null;
}

export function detectCyclePerimenopausePatternRuntime(...args: Parameters<NonNullable<CycleAnalysisBridge['detectPerimenopausePattern']>>) {
  return cycleAnalysisBridge.detectPerimenopausePattern?.(...args) || null;
}

export function detectCycleIronAlertsRuntime(...args: Parameters<NonNullable<CycleAnalysisBridge['detectCycleIronAlerts']>>) {
  return cycleAnalysisBridge.detectCycleIronAlerts?.(...args) || [];
}

function existingCycleStylesheet(): HTMLLinkElement | null {
  return findStylesheet("link[data-cycle-stylesheet]", "/css/cycle.css");
}

function cycleStylesheetUrl() {
  if (!cycleStylesheetPromiseCache.retry) return CYCLE_STYLESHEET_URL;
  const retryUrl = new URL(CYCLE_STYLESHEET_URL);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

export function isCycleStylesheetLoaded() {
  return cycleStylesheetPromiseCache.loaded || !!existingCycleStylesheet()?.sheet;
}

export function loadCycleStylesheet() {
  return cycleStylesheetPromiseCache.load();
}

export async function loadCycleStylesheetForAction() {
  try {
    await loadCycleStylesheet();
    return true;
  } catch (err) {
    console.error('Failed to load Cycle presentation', err);
    showNotification('Cycle tools could not be loaded. Try again.', 'error');
    return false;
  }
}

export function configureCycleRuntimeDeps(deps: Partial<CycleRuntimeDeps> = {}) {
  return configureRuntimeCallbacks(cycleRuntimeDeps, deps);
}

export function closeCycleModalRuntime() {
  cycleRuntimeDeps.closeModal?.();
}

export async function loadCycleImportStylesheetRuntime() {
  await Promise.all([
    loadCycleStylesheet(),
    cycleRuntimeDeps.loadImportStylesheet?.(),
  ]);
}

export function navigateCycleViewRuntime(category: string) {
  if (!cycleRuntimeDeps.navigate) return false;
  cycleRuntimeDeps.navigate(category);
  return true;
}

export function openCycleEditorRuntime() {
  if (!cycleRuntimeDeps.openEditor) return false;
  cycleRuntimeDeps.openEditor();
  return true;
}

export function renderCycleProfileButtonRuntime() {
  cycleRuntimeDeps.renderProfileButton?.();
}
