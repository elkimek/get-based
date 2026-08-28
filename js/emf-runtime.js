// @ts-check
// emf-runtime.js - module-only lazy access to the EMF assessment feature.

import { showNotification } from './utils.js';

const EMF_STYLESHEET_URL = new URL('../css/emf.css', import.meta.url).href;

/** @typedef {{
 * configureEMFRuntimeDeps: (deps?: object) => unknown,
 * openEMFAssessmentEditor: (options?: { returnLabel?: string, onReturn?: (() => void) | null }) => unknown,
 * closeEMFInterpretation: () => unknown,
 * }} EMFModule */

/** @type {Promise<EMFModule> | null} */
let emfModulePromise = null;
/** @type {EMFModule | null} */
let emfModule = null;
/** @type {Promise<HTMLLinkElement> | null} */
let emfStylesheetPromise = null;
let useEMFStylesheetRetryUrl = false;

function rejectUnconfiguredEMFModuleLoad() {
  throw new Error('EMF module loader is not configured.');
}

function emfStylesheetUrl() {
  if (!useEMFStylesheetRetryUrl) return EMF_STYLESHEET_URL;
  const retryUrl = new URL(EMF_STYLESHEET_URL);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

/** @returns {Promise<HTMLLinkElement>} */
export function loadEMFStylesheet() {
  if (!emfStylesheetPromise) {
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('EMF stylesheet requires a document'));
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = emfStylesheetUrl();
    link.dataset.emfStylesheet = '';
    emfStylesheetPromise = new Promise((resolve, reject) => {
      link.addEventListener('load', () => resolve(link), { once: true });
      link.addEventListener('error', () => {
        reject(new Error('EMF stylesheet could not be loaded'));
      }, { once: true });
      const anchor = document.querySelector('[data-emf-stylesheet-anchor]');
      const parent = anchor?.parentNode || document.head;
      parent.insertBefore(link, anchor || null);
    }).catch(err => {
      link.remove();
      emfStylesheetPromise = null;
      useEMFStylesheetRetryUrl = true;
      throw err;
    });
  }
  return emfStylesheetPromise;
}

const emfRuntimeDeps = {
  closeModal: /** @type {null | (() => void)} */ (null),
  loadModule: /** @type {() => Promise<EMFModule>} */ (rejectUnconfiguredEMFModuleLoad),
  loadStylesheet: loadEMFStylesheet,
};

export function configureEMFRuntimeDeps(deps = {}) {
  const previous = { ...emfRuntimeDeps };
  if (Object.hasOwn(deps, 'closeModal')) {
    emfRuntimeDeps.closeModal = typeof deps.closeModal === 'function' ? deps.closeModal : null;
  }
  if (Object.hasOwn(deps, 'loadModule')) {
    emfRuntimeDeps.loadModule = typeof deps.loadModule === 'function'
      ? deps.loadModule
      : rejectUnconfiguredEMFModuleLoad;
  }
  if (Object.hasOwn(deps, 'loadStylesheet')) {
    emfRuntimeDeps.loadStylesheet = typeof deps.loadStylesheet === 'function'
      ? deps.loadStylesheet
      : loadEMFStylesheet;
  }
  emfModule?.configureEMFRuntimeDeps(emfRuntimeDeps);
  return previous;
}

export async function loadEMFModule() {
  if (!emfModulePromise) {
    emfModulePromise = Promise.resolve()
      .then(() => emfRuntimeDeps.loadModule())
      .then(mod => {
        emfModule = mod;
        mod.configureEMFRuntimeDeps(emfRuntimeDeps);
        return mod;
      })
      .catch(err => {
        emfModulePromise = null;
        emfModule = null;
        throw err;
      });
  }
  return await emfModulePromise;
}

export async function openEMFAssessmentEditor(options = {}) {
  try {
    const [mod] = await Promise.all([
      loadEMFModule(),
      emfRuntimeDeps.loadStylesheet(),
    ]);
    return mod.openEMFAssessmentEditor(options);
  } catch (err) {
    console.error('[emf] Could not load assessment UI:', err);
    showNotification('Could not open the EMF assessment. Reload the app to finish updating, then try again.', 'error');
    return false;
  }
}

export async function closeEMFInterpretation() {
  const mod = await loadEMFModule();
  return mod.closeEMFInterpretation();
}
