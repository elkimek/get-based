// @ts-check
// marker-detail-modal.js — lightweight public entry point for marker detail UI

import { state } from './state.js';
import { closeSuggestionsOnClickOutside } from './health-data-loader.js';
import { installMarkerDetailActionDelegates } from './marker-detail-actions.js';
import { closeModalOverlay } from './modal-lifecycle.js';
import {
  closeEMFInterpretationRuntime,
  loadMarkerDetailStylesheet,
  uninstallWearableModalFocusTrapRuntime,
} from './marker-detail-runtime.js';
import { rememberModalTrigger, restoreModalTrigger } from './modal-trigger-memory.js';
import { safeMarkerId, showNotification } from './utils.js';

/** @typedef {typeof import('./marker-detail-modal-impl.js')} MarkerDetailModule */

/** @type {Promise<MarkerDetailModule> | null} */
let markerDetailModulePromise = null;
/** @type {MarkerDetailModule | null} */
let markerDetailModule = null;
let useMarkerDetailRetryUrl = false;
/** @type {Record<string, any>} */
const markerDetailDeps = {};

export { loadMarkerDetailStylesheet, rememberModalTrigger };

export function isMarkerDetailModuleLoaded() {
  return markerDetailModule !== null;
}

/** @returns {Promise<MarkerDetailModule>} */
function loadMarkerDetailRetryModule() {
  // @ts-expect-error The browser accepts a fixed query-string module URL;
  // TypeScript resolves declarations only for the query-free source path.
  return import('./marker-detail-modal-impl.js?lazy-retry=1');
}

/** @returns {Promise<MarkerDetailModule>} */
export function loadMarkerDetailModule() {
  if (!markerDetailModulePromise) {
    // Browsers cache failed module-map fetches by URL. A fixed second literal
    // gives the user one genuine retry without introducing a computed import.
    const moduleLoad = useMarkerDetailRetryUrl
      ? loadMarkerDetailRetryModule()
      : import('./marker-detail-modal-impl.js');
    markerDetailModulePromise = moduleLoad
      .then(module => {
        markerDetailModule = module;
        module.configureMarkerDetailModal(markerDetailDeps);
        return module;
      })
      .catch(err => {
        markerDetailModulePromise = null;
        markerDetailModule = null;
        useMarkerDetailRetryUrl = true;
        throw err;
      });
  }
  return markerDetailModulePromise;
}

/**
 * Preserve startup dependency injection without pulling the implementation
 * into the eager graph. The latest callbacks are applied when loading wins a
 * race with one or more configure calls.
 *
 * @param {Record<string, any>} [deps]
 */
export function configureMarkerDetailModal(deps = {}) {
  Object.assign(markerDetailDeps, deps);
  markerDetailModule?.configureMarkerDetailModal(deps);
}

/** @param {keyof MarkerDetailModule} name @param {unknown} err */
function reportMarkerDetailActionError(name, err) {
  console.error(`[marker-detail] Could not run ${String(name)}:`, err);
  showNotification(
    'Could not open marker details. Reload the app to finish updating, then try again.',
    'error',
  );
  return false;
}

/**
 * Preserve synchronous behavior after the implementation is resident. This
 * matters for callbacks such as emoji selection that mutate their target
 * before the calling event handler returns.
 *
 * @param {keyof MarkerDetailModule} name
 * @param {any[]} args
 */
function runMarkerDetailAction(name, args) {
  if (markerDetailModule) {
    try {
      const action = markerDetailModule[name];
      if (typeof action !== 'function') {
        throw new Error(`Marker detail action ${String(name)} is unavailable`);
      }
      return Reflect.apply(action, markerDetailModule, args);
    } catch (err) {
      return reportMarkerDetailActionError(name, err);
    }
  }
  return loadMarkerDetailModule()
    .then(module => {
      const action = module[name];
      if (typeof action !== 'function') {
        throw new Error(`Marker detail action ${String(name)} is unavailable`);
      }
      return Reflect.apply(action, module, args);
    })
    .catch(err => reportMarkerDetailActionError(name, err));
}

export function fetchCustomMarkerDescription(...args) {
  return runMarkerDetailAction('fetchCustomMarkerDescription', args);
}

export function showDetailModal(id, opts = {}) {
  if (!safeMarkerId(id)) return Promise.resolve(false);
  return runMarkerDetailAction('showDetailModal', [id, opts]);
}

// Category cards already render the shared delegated action contract while the
// heavy modal implementation is still cold. Bridge their first click through
// this facade; the implementation upgrades the same delegate with its complete
// action set once the lazy import resolves.
if (typeof document !== 'undefined') {
  installMarkerDetailActionDelegates({ showDetailModal });
}

export function editRefRange(...args) {
  return runMarkerDetailAction('editRefRange', args);
}

export function saveRefRange(...args) {
  return runMarkerDetailAction('saveRefRange', args);
}

export function revertRefRange(...args) {
  return runMarkerDetailAction('revertRefRange', args);
}

export function openManualEntryForm(...args) {
  return runMarkerDetailAction('openManualEntryForm', args);
}

export function saveManualEntry(...args) {
  return runMarkerDetailAction('saveManualEntry', args);
}

export function saveAndAddAnotherManualEntry(...args) {
  return runMarkerDetailAction('saveAndAddAnotherManualEntry', args);
}

export function openCreateMarkerModal(...args) {
  return runMarkerDetailAction('openCreateMarkerModal', args);
}

export function pickNewCatIcon(...args) {
  return runMarkerDetailAction('pickNewCatIcon', args);
}

export function saveCustomMarker(...args) {
  return runMarkerDetailAction('saveCustomMarker', args);
}

export function deleteMarkerValue(...args) {
  return runMarkerDetailAction('deleteMarkerValue', args);
}

export function deleteCustomMarker(...args) {
  return runMarkerDetailAction('deleteCustomMarker', args);
}

export function editMarkerValue(...args) {
  return runMarkerDetailAction('editMarkerValue', args);
}

export function revertMarkerValue(...args) {
  return runMarkerDetailAction('revertMarkerValue', args);
}

export function editValueNote(...args) {
  return runMarkerDetailAction('editValueNote', args);
}

export function deleteValueNote(...args) {
  return runMarkerDetailAction('deleteValueNote', args);
}

export function toggleMarkerNoteEditor(...args) {
  return runMarkerDetailAction('toggleMarkerNoteEditor', args);
}

export function saveMarkerNote(...args) {
  return runMarkerDetailAction('saveMarkerNote', args);
}

export function deleteMarkerNote(...args) {
  return runMarkerDetailAction('deleteMarkerNote', args);
}

// The shared detail-modal shell also hosts Notes, Recommendations, EMF, and
// Wearables surfaces. Closing it must stay synchronous and must not load the
// marker-detail implementation just to dismiss another feature's modal.
export function closeModal() {
  closeModalOverlay('modal-overlay');
  const detailModal = document.getElementById('detail-modal');
  if (detailModal) {
    detailModal.className = 'modal';
    delete detailModal.dataset.syncRefreshKind;
    delete detailModal.dataset.syncRefreshMode;
    delete detailModal.dataset.syncRefreshIndex;
    delete detailModal.dataset.syncRefreshDate;
    delete detailModal.dataset.syncRefreshEditIdx;
    delete detailModal.dataset.syncRefreshItemId;
  }
  if (state.chartInstances.modal) {
    state.chartInstances.modal.destroy();
    delete state.chartInstances.modal;
  }
  document.removeEventListener('click', closeSuggestionsOnClickOutside);
  closeEMFInterpretationRuntime();
  uninstallWearableModalFocusTrapRuntime();
  state._activeDetailMarkerId = null;
  restoreModalTrigger();
}
