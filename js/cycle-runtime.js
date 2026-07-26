// @ts-check
// cycle-runtime.js - Explicit application callbacks for Cycle views.

import { showNotification } from './utils.js';

const CYCLE_STYLESHEET_URL = new URL('../css/cycle.css', import.meta.url).href;

/** @type {Promise<HTMLLinkElement> | null} */
let cycleStylesheetPromise = null;
let cycleStylesheetLoaded = false;
let useCycleStylesheetRetryUrl = false;

/** @type {{ closeModal: (() => void) | null, loadImportStylesheet: (() => Promise<unknown>) | null, navigate: ((category: string) => void) | null, openEditor: (() => void) | null, renderProfileButton: (() => void) | null }} */
const cycleRuntimeDeps = {
  closeModal: null,
  loadImportStylesheet: null,
  navigate: null,
  openEditor: null,
  renderProfileButton: null,
};

/** @type {Record<string, ((...args: any[]) => any) | null>} */
const cycleAnalysisBridge = {
  detectCycleIronAlerts: null,
  detectPerimenopausePattern: null,
  getBloodDrawPhases: null,
  getNextBestDrawDate: null,
};

export function configureCycleAnalysisBridge(api = {}) {
  const previous = { ...cycleAnalysisBridge };
  for (const name of Object.keys(cycleAnalysisBridge)) {
    if (Object.hasOwn(api, name)) {
      cycleAnalysisBridge[name] = typeof api[name] === 'function' ? api[name] : null;
    }
  }
  return previous;
}

export function getCycleBloodDrawPhasesRuntime(...args) {
  return cycleAnalysisBridge.getBloodDrawPhases?.(...args) || {};
}

export function getCycleNextBestDrawDateRuntime(...args) {
  return cycleAnalysisBridge.getNextBestDrawDate?.(...args) || null;
}

export function detectCyclePerimenopausePatternRuntime(...args) {
  return cycleAnalysisBridge.detectPerimenopausePattern?.(...args) || null;
}

export function detectCycleIronAlertsRuntime(...args) {
  return cycleAnalysisBridge.detectCycleIronAlerts?.(...args) || [];
}

function existingCycleStylesheet() {
  if (typeof document === 'undefined') return null;
  return /** @type {HTMLLinkElement | null} */ (
    document.querySelector('link[data-cycle-stylesheet]')
    || Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))
      .find(link => {
        try {
          return new URL(/** @type {HTMLLinkElement} */ (link).href).pathname === '/css/cycle.css';
        } catch {
          return false;
        }
      })
    || null
  );
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

/** @returns {Promise<HTMLLinkElement>} */
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
    cycleStylesheetPromise = new Promise(function beginCycleStylesheetLoad(resolve, reject) {
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

/**
 * @param {{ closeModal?: (() => void) | null, loadImportStylesheet?: (() => Promise<unknown>) | null, navigate?: ((category: string) => void) | null, openEditor?: (() => void) | null, renderProfileButton?: (() => void) | null }} deps
 */
export function configureCycleRuntimeDeps(deps = {}) {
  const previous = { ...cycleRuntimeDeps };
  if (Object.hasOwn(deps, 'closeModal')) {
    cycleRuntimeDeps.closeModal = typeof deps.closeModal === 'function' ? deps.closeModal : null;
  }
  if (Object.hasOwn(deps, 'loadImportStylesheet')) {
    cycleRuntimeDeps.loadImportStylesheet = typeof deps.loadImportStylesheet === 'function' ? deps.loadImportStylesheet : null;
  }
  if (Object.hasOwn(deps, 'navigate')) {
    cycleRuntimeDeps.navigate = typeof deps.navigate === 'function' ? deps.navigate : null;
  }
  if (Object.hasOwn(deps, 'openEditor')) {
    cycleRuntimeDeps.openEditor = typeof deps.openEditor === 'function' ? deps.openEditor : null;
  }
  if (Object.hasOwn(deps, 'renderProfileButton')) {
    cycleRuntimeDeps.renderProfileButton = typeof deps.renderProfileButton === 'function' ? deps.renderProfileButton : null;
  }
  return previous;
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

/** @param {string} category */
export function navigateCycleViewRuntime(category) {
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
