import { createRetryingStylesheetLoader } from './retrying-module-loader.js';
// emf-runtime.js - module-only lazy access to the EMF assessment feature.

import { showNotification } from './utils.js';
import { closeEMFInterpretation as closeLoadedEMFInterpretation } from './emf-interpretation-runtime.js';

export interface EMFEditorOptions {
  returnLabel?: string;
  /** A caller can retire a pending lazy open without changing shared loader caching. */
  isCurrent?: () => boolean;
  onReturn?: (() => void) | null;
}
export interface EMFModule {
  configureEMFRuntimeDeps: (deps?: Partial<EMFRuntimeDeps>) => unknown;
  openEMFAssessmentEditor: (options?: EMFEditorOptions) => unknown;
  closeEMFInterpretation: () => unknown;
}
export interface EMFRuntimeDeps {
  closeModal: (() => void) | null;
  loadModule: () => Promise<EMFModule>;
  loadStylesheet: () => Promise<HTMLLinkElement>;
}

const EMF_STYLESHEET_URL = new URL('../css/emf.css', import.meta.url).href;

let emfModulePromise: Promise<EMFModule> | null = null;
let emfModule: EMFModule | null = null;
const emfStylesheetPromiseCache = createRetryingStylesheetLoader({
  createLink: () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = emfStylesheetUrl();
    link.dataset.emfStylesheet = '';
    return link;
  },
  insertLink: link => {
    const anchor = document.querySelector('[data-emf-stylesheet-anchor]');
    const parent = anchor?.parentNode || document.head;
    parent.insertBefore(link, anchor || null);
  },
  requireDocument: "EMF stylesheet requires a document",
  failedLoad: "EMF stylesheet could not be loaded",
});

function rejectUnconfiguredEMFModuleLoad(): never {
  throw new Error('EMF module loader is not configured.');
}

function emfStylesheetUrl() {
  if (!emfStylesheetPromiseCache.retry) return EMF_STYLESHEET_URL;
  const retryUrl = new URL(EMF_STYLESHEET_URL);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

export function loadEMFStylesheet(): Promise<HTMLLinkElement> {
  return emfStylesheetPromiseCache.load();
}

const emfRuntimeDeps: EMFRuntimeDeps = {
  closeModal: (null),
  loadModule: (rejectUnconfiguredEMFModuleLoad),
  loadStylesheet: loadEMFStylesheet,
};

export function configureEMFRuntimeDeps(deps: Partial<EMFRuntimeDeps> = {}) {
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

export async function openEMFAssessmentEditor(options: EMFEditorOptions = {}) {
  if (options.isCurrent && !options.isCurrent()) return false;
  try {
    const [mod] = await Promise.all([
      loadEMFModule(),
      emfRuntimeDeps.loadStylesheet(),
    ]);
    if (options.isCurrent && !options.isCurrent()) return false;
    return mod.openEMFAssessmentEditor(options);
  } catch (err) {
    if (options.isCurrent && !options.isCurrent()) return false;
    console.error('[emf] Could not load assessment UI:', err);
    showNotification('Could not open the EMF assessment. Reload the app to finish updating, then try again.', 'error');
    return false;
  }
}

export async function closeEMFInterpretation() {
  // Keep the Promise API while aborting an existing owner in this same turn.
  if (emfModule) return emfModule.closeEMFInterpretation();
  return closeLoadedEMFInterpretation();
}
