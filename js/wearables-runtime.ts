import { createRetryingStylesheetLoader, findStylesheet } from './retrying-module-loader.js';
// wearables-runtime.js - Browser runtime adapters for wearable dashboard hooks.

import { configureModuleBridge, getModuleBridgeFunction } from './runtime-callbacks.js';

import { openEMFAssessmentEditor } from './emf-runtime.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';
import { showNotification } from './utils.js';

const WEARABLES_STYLESHEET_URL = new URL('../css/wearables.css', import.meta.url).href;

let wearablesModulePromise: Promise<unknown> | null = null;
let wearablesModule: unknown = null;
let useWearablesModuleRetryUrl = false;
const wearablesStylesheetPromiseCache = createRetryingStylesheetLoader({
  existing: existingWearablesStylesheet,
  createLink: (_retry, existing) => {
    const link = existing || document.createElement('link');
    link.rel = 'stylesheet';
    link.href = wearablesStylesheetUrl();
    link.dataset.wearablesStylesheet = '';
    return link;
  },
  insertLink: link => {
    if (!link.isConnected) {
      const anchor = document.querySelector('[data-wearables-stylesheet-anchor]');
      const parent = anchor?.parentNode || document.head;
      parent.insertBefore(link, anchor || null);
    }
  },
  requireDocument: "Wearables stylesheet requires a document",
  failedLoad: "Wearables stylesheet could not be loaded",
});

type WearablesCalls = {
  closeModal: (() => unknown) | null;
  loadModule: (useRetryUrl: boolean) => unknown;
  navigate: ((route: string) => unknown) | null;
  openEMFAssessmentEditor: (options: Parameters<typeof openEMFAssessmentEditor>[0]) => unknown;
};
export type WearablesRuntimeSnapshot = { [Key in keyof WearablesCalls]: unknown };
// Configuration and resolved module values remain opaque. These private views
// describe the original unchecked operations without validating provider values.
type WearablesUpdates = Partial<WearablesRuntimeSnapshot>;
interface WearablesWindowReader { innerWidth?: unknown; innerHeight?: unknown;
  setTimeout?: ((callback: () => void, delay: unknown) => unknown) | null }
const wearablesRuntimeDeps: WearablesCalls = {
  closeModal: null,
  loadModule: () => Promise.reject(new Error('Wearables module loader is not configured')),
  navigate: null,
  openEMFAssessmentEditor,
};

const wearableModuleBridge: Record<string, unknown> = Object.create(null);

export function configureWearablesModuleBridge(api: Record<string, unknown> = {}) {
  return configureModuleBridge(wearableModuleBridge, api);
}

export function getWearablesModuleFunction(name: string) {
  return getModuleBridgeFunction(wearableModuleBridge, name);
}

export function isWearablesModuleLoaded() {
  return wearablesModule !== null;
}

function completeWearablesModuleLoad(module: unknown) {
  wearablesModule = module;
  return module;
}

function resetWearablesModuleLoad(err: unknown): never {
  wearablesModulePromise = null;
  wearablesModule = null;
  useWearablesModuleRetryUrl = true;
  throw err;
}

export function loadWearablesModule(): Promise<unknown> {
  if (!wearablesModulePromise) {
    // Browsers cache failed module-map fetches by URL. A fixed second literal
    // is selected by the app shell loader after the first request fails.
    wearablesModulePromise = Promise.resolve()
      .then(() => wearablesRuntimeDeps.loadModule(useWearablesModuleRetryUrl))
      .then(completeWearablesModuleLoad)
      .catch(resetWearablesModuleLoad);
  }
  return wearablesModulePromise;
}

function runWearablesAction(name: string, args: unknown[]): unknown {
  const run = (module: unknown): unknown => {
    const action = (module as Record<string, unknown>)[name];
    if (typeof action !== 'function') {
      throw new Error(`Wearables action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, args);
  };
  try {
    if (wearablesModule) return run(wearablesModule);
    return loadWearablesModule()
      .then(run)
      .catch(err => {
        console.error(`Failed to run Wearables action ${String(name)}`, err);
        showNotification('Wearables could not be loaded. Try again.', 'error');
        return false;
      });
  } catch (err) {
    console.error(`Failed to run Wearables action ${String(name)}`, err);
    showNotification('Wearables could not be loaded. Try again.', 'error');
    return false;
  }
}

// Close cleanup must not pull the full Wearables graph into an otherwise cold
// marker-modal visit.
function uninstallWearableFocusTrapIfLoaded(args: unknown[]): unknown {
  if (!wearablesModule) return undefined;
  const action = (wearablesModule as Record<string, unknown>)._uninstallWearableModalFocusTrap;
  if (typeof action !== 'function') return undefined;
  try {
    return Reflect.apply(action, wearablesModule, args);
  } catch (err) {
    console.error('Failed to clean up Wearables modal focus', err);
    return undefined;
  }
}

configureWearablesModuleBridge({
  openWearableDetail: (...args: unknown[]) => runWearablesAction('openWearableDetail', args),
  syncWearableNow: (...args: unknown[]) => runWearablesAction('syncWearableNow', args),
  openManualLogForm: (...args: unknown[]) => runWearablesAction('openManualLogForm', args),
  _uninstallWearableModalFocusTrap: (...args: unknown[]) => uninstallWearableFocusTrapIfLoaded(args),
});

function existingWearablesStylesheet() {
  return findStylesheet("link[data-wearables-stylesheet]", "/css/wearables.css");
}

function wearablesStylesheetUrl() {
  if (!wearablesStylesheetPromiseCache.retry) return WEARABLES_STYLESHEET_URL;
  const retryUrl = new URL(WEARABLES_STYLESHEET_URL);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

export function isWearablesStylesheetLoaded() {
  return wearablesStylesheetPromiseCache.loaded || !!existingWearablesStylesheet()?.sheet;
}

export function loadWearablesStylesheet() {
  return wearablesStylesheetPromiseCache.load();
}

export async function loadWearablesStylesheetForAction() {
  try {
    await loadWearablesStylesheet();
    return true;
  } catch (err) {
    console.error('Failed to load Wearables presentation', err);
    showNotification('Wearables could not be loaded. Try again.', 'error');
    return false;
  }
}

export function configureWearablesRuntime(deps: unknown = {}): WearablesRuntimeSnapshot {
  const previous = { ...wearablesRuntimeDeps };
  if (Object.hasOwn(deps as object, 'closeModal')) {
    wearablesRuntimeDeps.closeModal = typeof (deps as WearablesUpdates).closeModal === 'function' ? (deps as unknown as WearablesCalls).closeModal : null;
  }
  if (Object.hasOwn(deps as object, 'loadModule') && typeof (deps as WearablesUpdates).loadModule === 'function') {
    wearablesRuntimeDeps.loadModule = (deps as unknown as WearablesCalls).loadModule;
  }
  if (Object.hasOwn(deps as object, 'navigate')) {
    wearablesRuntimeDeps.navigate = typeof (deps as WearablesUpdates).navigate === 'function' ? (deps as unknown as WearablesCalls).navigate : null;
  }
  if (Object.hasOwn(deps as object, 'openEMFAssessmentEditor') && typeof (deps as WearablesUpdates).openEMFAssessmentEditor === 'function') {
    wearablesRuntimeDeps.openEMFAssessmentEditor = (deps as unknown as WearablesCalls).openEMFAssessmentEditor;
  }
  return previous;
}

function getRuntimeWindow() {
  return typeof window !== 'undefined'
    ? (window as unknown as WearablesWindowReader)
    : null;
}

function normalizeViewportDimension(value: unknown, fallback: number) {
  const dimension = Number(value);
  return Number.isFinite(dimension) ? dimension : fallback;
}

export function navigateWearables(route: string = 'dashboard') {
  wearablesRuntimeDeps.navigate?.(route || 'dashboard');
}

export function closeWearablesModal() {
  wearablesRuntimeDeps.closeModal?.();
}

export function openWearablesSettings() {
  getSettingsModuleFunction('openSettingsModal')?.('wearables');
}

export function openEMFAssessmentAfterWearablesModalClose(delayMs: number = 100, returnMetricId: string = '') {
  closeWearablesModal();
  const runtime = getRuntimeWindow();
  if (!runtime) return;
  const schedule = runtime && typeof runtime.setTimeout === 'function'
    ? runtime.setTimeout.bind(runtime)
    : setTimeout;
  schedule(() => {
    const options = returnMetricId ? {
      returnLabel: 'Back to wearable details',
      onReturn: () => getWearablesModuleFunction('openWearableDetail')?.(returnMetricId),
    } : {};
    void wearablesRuntimeDeps.openEMFAssessmentEditor(options);
  }, delayMs);
}

export function getWearablesViewportSize() {
  const runtime = getRuntimeWindow();
  return {
    width: normalizeViewportDimension(runtime?.innerWidth, 1024),
    height: normalizeViewportDimension(runtime?.innerHeight, 768),
  };
}
