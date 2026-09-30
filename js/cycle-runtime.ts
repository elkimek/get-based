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
interface CycleDrawPhase {
  cycleDay: number | null;
  phaseName: string;
  phaseDetailName?: string;
  basedOnStartDate?: unknown;
  source?: unknown;
  confidence?: unknown;
}
interface DrawRecommendation { startDate: string; endDate: string; description: string }
interface CyclePattern { indicators: string[]; age: number; message: string }
interface CycleIronAlert extends Record<string, unknown> { message: string }
interface CycleAnalysisBridge {
  detectCycleIronAlerts: ((...args: unknown[]) => CycleIronAlert[] | null) | null;
  detectPerimenopausePattern: ((...args: unknown[]) => CyclePattern | null) | null;
  getBloodDrawPhases: ((...args: [profile?: unknown, dates?: readonly string[] | null, entryContextByDate?: Record<string, unknown>, ...extra: unknown[]]) => Record<string, CycleDrawPhase> | null) | null;
  getNextBestDrawDate: ((...args: unknown[]) => DrawRecommendation | null) | null;
}

const CYCLE_STYLESHEET_URL = new URL('../css/cycle.css', import.meta.url).href;

let cycleStylesheetPromise: Promise<HTMLLinkElement> | null = null;
let cycleStylesheetLoaded = false;
let useCycleStylesheetRetryUrl = false;

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

export function getCycleBloodDrawPhasesRuntime(...args: Parameters<NonNullable<CycleAnalysisBridge['getBloodDrawPhases']>>): Record<string, CycleDrawPhase> {
  return cycleAnalysisBridge.getBloodDrawPhases?.(...args) || {};
}

export function getCycleNextBestDrawDateRuntime(...args: unknown[]) {
  return cycleAnalysisBridge.getNextBestDrawDate?.(...args) || null;
}

export function detectCyclePerimenopausePatternRuntime(...args: unknown[]) {
  return cycleAnalysisBridge.detectPerimenopausePattern?.(...args) || null;
}

export function detectCycleIronAlertsRuntime(...args: unknown[]) {
  return cycleAnalysisBridge.detectCycleIronAlerts?.(...args) || [];
}

function existingCycleStylesheet(): HTMLLinkElement | null {
  if (typeof document === 'undefined') return null;
  return (
    document.querySelector('link[data-cycle-stylesheet]')
    || Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
      .find(link => {
        try {
          return new URL((link as HTMLLinkElement).href).pathname === '/css/cycle.css';
        } catch {
          return false;
        }
      })
    || null
  ) as HTMLLinkElement | null;
}

function cycleStylesheetUrl() {
  if (!useCycleStylesheetRetryUrl) return CYCLE_STYLESHEET_URL;
  const retryUrl = new URL(CYCLE_STYLESHEET_URL);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

export function isCycleStylesheetLoaded() {
  return cycleStylesheetLoaded || !!existingCycleStylesheet()?.sheet;
}

export function loadCycleStylesheet() {
  const existing = existingCycleStylesheet();
  if (existing?.sheet) {
    cycleStylesheetLoaded = true;
    return Promise.resolve(existing);
  }
  if (!cycleStylesheetPromise) {
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('Cycle stylesheet requires a document'));
    }
    const link = existing || document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cycleStylesheetUrl();
    link.dataset.cycleStylesheet = '';
    cycleStylesheetPromise = new Promise<HTMLLinkElement>(function beginCycleStylesheetLoad(resolve, reject) {
      link.addEventListener('load', function markCycleStylesheetLoaded() {
        cycleStylesheetLoaded = true;
        resolve(link);
      }, { once: true });
      link.addEventListener('error', function rejectCycleStylesheetLoad() {
        reject(new Error('Cycle stylesheet could not be loaded'));
      }, { once: true });
      if (!link.isConnected) {
        const anchor = document.querySelector('[data-cycle-stylesheet-anchor]');
        const parent = anchor?.parentNode || document.head;
        parent.insertBefore(link, anchor || null);
      }
    }).catch(function resetCycleStylesheetLoad(err) {
      link.remove();
      cycleStylesheetPromise = null;
      cycleStylesheetLoaded = false;
      useCycleStylesheetRetryUrl = true;
      throw err;
    });
  }
  return cycleStylesheetPromise;
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
