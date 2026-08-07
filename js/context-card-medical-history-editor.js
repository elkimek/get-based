// @ts-check
// context-card-medical-history-editor.js - cold-safe Medical History editor facade

import { selectCtxOption } from './context-card-editor-ui.js';
import { showConfirmDialog, showNotification } from './utils.js';

/** @typedef {typeof import('./context-card-medical-history-editor-impl.js')} MedicalHistoryEditorModule */
/** @type {Promise<MedicalHistoryEditorModule> | null} */
let medicalHistoryEditorPromise = null;
/** @type {MedicalHistoryEditorModule | null} */
let medicalHistoryEditorModule = null;
let useMedicalHistoryEditorRetryUrl = false;

/** @type {{
 *   close?: () => void,
 *   recordChange?: (field: string) => void,
 *   saveAndRefresh?: (msg: string, field?: string) => void,
 * }} */
const medicalHistoryEditorDeps = {};

export function isMedicalHistoryEditorLoaded() {
  return medicalHistoryEditorModule !== null;
}

/** @returns {Promise<MedicalHistoryEditorModule>} */
function loadMedicalHistoryEditorRetryModule() {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./context-card-medical-history-editor-impl.js?lazy-retry=1');
}

/** @returns {Promise<MedicalHistoryEditorModule>} */
export function loadMedicalHistoryEditor() {
  if (!medicalHistoryEditorPromise) {
    const load = useMedicalHistoryEditorRetryUrl
      ? loadMedicalHistoryEditorRetryModule()
      : import('./context-card-medical-history-editor-impl.js');
    medicalHistoryEditorPromise = load
      .then(module => {
        medicalHistoryEditorModule = module;
        module.configureMedicalHistoryEditor(medicalHistoryEditorDeps);
        return module;
      })
      .catch(err => {
        medicalHistoryEditorPromise = null;
        medicalHistoryEditorModule = null;
        useMedicalHistoryEditorRetryUrl = true;
        throw err;
      });
  }
  return medicalHistoryEditorPromise;
}

/**
 * @param {{ close?: () => void, recordChange?: (field: string) => void, saveAndRefresh?: (msg: string, field?: string) => void }} [deps]
 */
export function configureMedicalHistoryEditor({ close, recordChange, saveAndRefresh } = {}) {
  /** @type {typeof medicalHistoryEditorDeps} */
  const update = {};
  if (typeof close === 'function') {
    medicalHistoryEditorDeps.close = close;
    update.close = close;
  }
  if (typeof recordChange === 'function') {
    medicalHistoryEditorDeps.recordChange = recordChange;
    update.recordChange = recordChange;
  }
  if (typeof saveAndRefresh === 'function') {
    medicalHistoryEditorDeps.saveAndRefresh = saveAndRefresh;
    update.saveAndRefresh = saveAndRefresh;
  }
  medicalHistoryEditorModule?.configureMedicalHistoryEditor(update);
}

/** @param {keyof MedicalHistoryEditorModule} name @param {any[]} args @param {boolean} [shouldLoad] */
function runMedicalHistoryEditorAction(name, args, shouldLoad = true) {
  const run = (/** @type {MedicalHistoryEditorModule} */ module) => {
    const action = module[name];
    if (typeof action !== 'function') {
      throw new Error(`Medical history editor action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, args);
  };
  if (!medicalHistoryEditorModule && !shouldLoad) return undefined;
  try {
    if (medicalHistoryEditorModule) return run(medicalHistoryEditorModule);
    return loadMedicalHistoryEditor()
      .then(run)
      .catch(err => {
        console.error(`[context-cards] Could not run ${String(name)}:`, err);
        showNotification('Medical history editor could not be loaded. Try again.', 'error');
        return false;
      });
  } catch (err) {
    console.error(`[context-cards] Could not run ${String(name)}:`, err);
    if (shouldLoad) showNotification('Medical history editor could not be loaded. Try again.', 'error');
    return shouldLoad ? false : undefined;
  }
}

const MEDICAL_HISTORY_ROOT = '#detail-modal';

/**
 * @param {EventTarget | null} target
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
function closestMedicalHistoryElement(target, selector) {
  if (!(target instanceof Element)) return null;
  const el = target.closest(selector);
  if (!(el instanceof HTMLElement)) return null;
  return el.closest(MEDICAL_HISTORY_ROOT) ? el : null;
}

/** @param {HTMLElement} el */
function getMedicalHistoryIndex(el) {
  const idx = Number.parseInt(el.dataset.medicalHistoryIndex || '', 10);
  return Number.isInteger(idx) ? idx : -1;
}

async function confirmClearMedicalHistory() {
  const confirmed = await showConfirmDialog(
    'Clear all saved medical history information? This cannot be undone.',
    {
      confirmLabel: 'Clear',
      ariaLabel: 'Clear Medical History',
    },
  );
  if (confirmed) clearDiagnoses();
  return confirmed;
}

/** @param {MouseEvent} event */
function handleMedicalHistoryClick(event) {
  const actionEl = closestMedicalHistoryElement(event.target, '[data-medical-history-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.medicalHistoryAction || '';
  const idx = getMedicalHistoryIndex(actionEl);
  switch (action) {
    case 'edit-condition': if (idx >= 0) editCondition(idx); break;
    case 'delete-condition': if (idx >= 0) deleteCondition(idx); break;
    case 'add-condition': addCondition(); break;
    case 'cancel-condition-edit': cancelConditionEdit(); break;
    case 'select-condition-severity': selectCtxOption(actionEl, 'condition-severity'); break;
    case 'edit-family-history': if (idx >= 0) editFamilyHistoryEntry(idx); break;
    case 'delete-family-history': if (idx >= 0) deleteFamilyHistoryEntry(idx); break;
    case 'add-family-history': addFamilyHistoryEntry(); break;
    case 'cancel-family-history-edit': cancelFamilyHistoryEdit(); break;
    case 'save': saveDiagnoses(); break;
    case 'close': closeDiagnoses(); break;
    case 'clear': void confirmClearMedicalHistory(); break;
    default: break;
  }
}

/** @param {Event} event */
function handleMedicalHistoryFieldActivity(event) {
  const input = closestMedicalHistoryElement(event.target, '#condition-input, #fh-condition');
  if (!input) return;
  if (input.id === 'condition-input') filterConditionSuggestions();
  else filterFamilyConditionSuggestions();
}

/** @param {InputEvent} event */
function handleMedicalHistoryInput(event) { handleMedicalHistoryFieldActivity(event); }
/** @param {FocusEvent} event */
function handleMedicalHistoryFocusIn(event) { handleMedicalHistoryFieldActivity(event); }

/** @param {KeyboardEvent} event */
function handleMedicalHistoryKeydown(event) {
  const input = closestMedicalHistoryElement(event.target, '#condition-input, #fh-condition');
  if (!input || event.key !== 'Enter') return;
  event.preventDefault();
  if (input.id === 'condition-input') addCondition();
  else addFamilyHistoryEntry();
}

/** @param {MouseEvent} event */
function handleMedicalHistoryMouseDown(event) {
  const item = closestMedicalHistoryElement(event.target, '[data-medical-history-suggestion]');
  if (!item) return;
  event.preventDefault();
  const value = item.dataset.medicalHistoryValue || '';
  if (item.dataset.medicalHistorySuggestion === 'family-condition') {
    selectFamilyConditionSuggestion(value);
  } else {
    selectConditionSuggestion(value);
  }
}

/**
 * This exact binding is re-exported through context-cards.js and removed by
 * marker-detail modal cleanup. Keeping it in the eager facade preserves that
 * listener identity across the lazy boundary.
 *
 * @param {MouseEvent} event
 */
export function closeSuggestionsOnClickOutside(event) {
  const container = document.getElementById('condition-suggestions');
  const input = document.getElementById('condition-input');
  const target = /** @type {Node | null} */ (event.target);
  if (target && container && input && !input.contains(target) && !container.contains(target)) {
    container.innerHTML = '';
  }
  const fhContainer = document.getElementById('fh-condition-suggestions');
  const fhInput = document.getElementById('fh-condition');
  if (
    target
    && fhContainer
    && fhInput
    && !fhInput.contains(target)
    && !fhContainer.contains(target)
  ) {
    fhContainer.innerHTML = '';
  }
}

let medicalHistoryDelegatesBound = false;

function initMedicalHistoryActionDelegates() {
  if (medicalHistoryDelegatesBound || typeof document === 'undefined') return;
  medicalHistoryDelegatesBound = true;
  // Preserve the original registration order, including the exact suggestion
  // closer binding consumed by marker-detail-modal.js.
  document.addEventListener('click', handleMedicalHistoryClick);
  document.addEventListener('click', closeSuggestionsOnClickOutside);
  document.addEventListener('input', handleMedicalHistoryInput);
  document.addEventListener('focusin', handleMedicalHistoryFocusIn);
  document.addEventListener('keydown', handleMedicalHistoryKeydown);
  document.addEventListener('mousedown', handleMedicalHistoryMouseDown);
}

initMedicalHistoryActionDelegates();

export function openDiagnosesEditor(...args) { return runMedicalHistoryEditorAction('openDiagnosesEditor', args); }
export function renderDiagnosesModal(...args) { return runMedicalHistoryEditorAction('renderDiagnosesModal', args); }
export function filterConditionSuggestions(...args) { return runMedicalHistoryEditorAction('filterConditionSuggestions', args); }
export function selectConditionSuggestion(...args) { return runMedicalHistoryEditorAction('selectConditionSuggestion', args); }
export function syncDiagnosesNote(...args) { return runMedicalHistoryEditorAction('syncDiagnosesNote', args); }
export function addCondition(...args) { return runMedicalHistoryEditorAction('addCondition', args); }
export function editCondition(...args) { return runMedicalHistoryEditorAction('editCondition', args); }
export function cancelConditionEdit(...args) { return runMedicalHistoryEditorAction('cancelConditionEdit', args); }
export function deleteCondition(...args) { return runMedicalHistoryEditorAction('deleteCondition', args); }
export function addFamilyHistoryEntry(...args) { return runMedicalHistoryEditorAction('addFamilyHistoryEntry', args); }
export function editFamilyHistoryEntry(...args) { return runMedicalHistoryEditorAction('editFamilyHistoryEntry', args); }
export function cancelFamilyHistoryEdit(...args) { return runMedicalHistoryEditorAction('cancelFamilyHistoryEdit', args); }
export function deleteFamilyHistoryEntry(...args) { return runMedicalHistoryEditorAction('deleteFamilyHistoryEntry', args); }
export function filterFamilyConditionSuggestions(...args) { return runMedicalHistoryEditorAction('filterFamilyConditionSuggestions', args); }
export function selectFamilyConditionSuggestion(...args) { return runMedicalHistoryEditorAction('selectFamilyConditionSuggestion', args); }
export function saveDiagnoses(...args) { return runMedicalHistoryEditorAction('saveDiagnoses', args); }
export function closeDiagnoses(...args) { return runMedicalHistoryEditorAction('closeDiagnoses', args, false); }
export function clearDiagnoses(...args) { return runMedicalHistoryEditorAction('clearDiagnoses', args); }
