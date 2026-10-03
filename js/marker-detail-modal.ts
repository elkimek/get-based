// marker-detail-modal.js — lightweight public entry point for marker detail UI

import { createRetryingModuleLoader, invokeCachedModule } from './retrying-module-loader.js';
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

type MarkerDetailModule = typeof import('./marker-detail-modal-impl.js');

const markerDetailModuleLoader = createRetryingModuleLoader<MarkerDetailModule>(
  retry => retry ? loadMarkerDetailRetryModule() : import('./marker-detail-modal-impl.js'),
  module => {
    module.configureMarkerDetailModal(markerDetailDeps);
    return module;
  },
);


const markerDetailDeps: Record<string,unknown> = {};

export { loadMarkerDetailStylesheet, rememberModalTrigger };

export function isMarkerDetailModuleLoaded() {
  return markerDetailModuleLoader.module !== null;
}

/** @returns {Promise<MarkerDetailModule>} */
function loadMarkerDetailRetryModule() {
  return import('./marker-detail-modal-impl.js?lazy-retry=1' as './marker-detail-modal-impl.js');
}

/** @returns {Promise<MarkerDetailModule>} */
export function loadMarkerDetailModule() {
  return markerDetailModuleLoader.load();
}

/**
 * Preserve startup dependency injection without pulling the implementation
 * into the eager graph. The latest callbacks are applied when loading wins a
 * race with one or more configure calls.
 *
 * @param {unknown} [deps]
 */
export function configureMarkerDetailModal(deps: unknown = {}) {
  Object.assign(markerDetailDeps, deps);
  markerDetailModuleLoader.module?.configureMarkerDetailModal(deps);
}

/** @param {keyof MarkerDetailModule} name @param {unknown} err */
function reportMarkerDetailActionError(name: keyof MarkerDetailModule, err: unknown) {
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
 * @param {unknown[]} args
 */
function runMarkerDetailAction(name: keyof MarkerDetailModule, args: unknown[]): unknown {
  const run = (module: MarkerDetailModule) => {
    const action = module[name];
    if (typeof action !== 'function') {
      throw new Error(`Marker detail action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, args);
  };
  return invokeCachedModule(markerDetailModuleLoader, loadMarkerDetailModule, run, err => reportMarkerDetailActionError(name, err), 'propagate');
}

export function fetchCustomMarkerDescription(...args: unknown[]) {
  return runMarkerDetailAction('fetchCustomMarkerDescription', args);
}

export function showDetailModal(id: unknown, opts: unknown = {}) {
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

export function editRefRange(...args: unknown[]) {
  return runMarkerDetailAction('editRefRange', args);
}

export function saveRefRange(...args: unknown[]) {
  return runMarkerDetailAction('saveRefRange', args);
}

export function revertRefRange(...args: unknown[]) {
  return runMarkerDetailAction('revertRefRange', args);
}

export function openManualEntryForm(...args: unknown[]) {
  return runMarkerDetailAction('openManualEntryForm', args);
}

export function saveManualEntry(...args: unknown[]) {
  return runMarkerDetailAction('saveManualEntry', args);
}

export function saveAndAddAnotherManualEntry(...args: unknown[]) {
  return runMarkerDetailAction('saveAndAddAnotherManualEntry', args);
}

export function openCreateMarkerModal(...args: unknown[]) {
  return runMarkerDetailAction('openCreateMarkerModal', args);
}

export function pickNewCatIcon(...args: unknown[]) {
  return runMarkerDetailAction('pickNewCatIcon', args);
}

export function saveCustomMarker(...args: unknown[]) {
  return runMarkerDetailAction('saveCustomMarker', args);
}

export function deleteMarkerValue(...args: unknown[]) {
  return runMarkerDetailAction('deleteMarkerValue', args);
}

export function deleteCustomMarker(...args: unknown[]) {
  return runMarkerDetailAction('deleteCustomMarker', args);
}

export function editMarkerValue(...args: unknown[]) {
  return runMarkerDetailAction('editMarkerValue', args);
}

export function revertMarkerValue(...args: unknown[]) {
  return runMarkerDetailAction('revertMarkerValue', args);
}

export function editValueNote(...args: unknown[]) {
  return runMarkerDetailAction('editValueNote', args);
}

export function deleteValueNote(...args: unknown[]) {
  return runMarkerDetailAction('deleteValueNote', args);
}

export function toggleMarkerNoteEditor(...args: unknown[]) {
  return runMarkerDetailAction('toggleMarkerNoteEditor', args);
}

export function saveMarkerNote(...args: unknown[]) {
  return runMarkerDetailAction('saveMarkerNote', args);
}

export function deleteMarkerNote(...args: unknown[]) {
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
