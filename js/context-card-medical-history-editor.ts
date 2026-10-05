import type { MedicalHistoryEditorDependencies } from './context-card-medical-history-editor-impl.js';
type MedicalHistoryEditorModule = typeof import('./context-card-medical-history-editor-impl.js');
// context-card-medical-history-editor.js - cold-safe Medical History editor facade

import { createRetryingModuleLoader, invokeCachedModule } from './retrying-module-loader.js';
import { selectCtxOption } from './context-card-editor-ui.js';
import { showConfirmDialog, showNotification } from './utils.js';



const medicalHistoryEditorModuleLoader = createRetryingModuleLoader(
  retry => retry ? loadMedicalHistoryEditorRetryModule() : import('./context-card-medical-history-editor-impl.js'),
  module => {
    module.configureMedicalHistoryEditor(medicalHistoryEditorDeps);
    return module;
  },
);


const medicalHistoryEditorDeps: MedicalHistoryEditorDependencies = {};

export function isMedicalHistoryEditorLoaded() {
  return medicalHistoryEditorModuleLoader.module !== null;
}


function loadMedicalHistoryEditorRetryModule(): Promise<typeof import('./context-card-medical-history-editor-impl.js')> {
  // @ts-expect-error TypeScript resolves only the query-free source path.
  return import('./context-card-medical-history-editor-impl.js?lazy-retry=1');
}


export function loadMedicalHistoryEditor() {
  return medicalHistoryEditorModuleLoader.load();
}


export function configureMedicalHistoryEditor({ close, recordChange, saveAndRefresh }: MedicalHistoryEditorDependencies = {}) {

  const update: typeof medicalHistoryEditorDeps = {};
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
  medicalHistoryEditorModuleLoader.module?.configureMedicalHistoryEditor(update);
}


function runMedicalHistoryEditorAction(name: keyof MedicalHistoryEditorModule, args: unknown[], shouldLoad: boolean = true) {
  const run = (module: MedicalHistoryEditorModule): unknown => {
    const action = module[name];
    if (typeof action !== 'function') {
      throw new Error(`Medical history editor action ${String(name)} is unavailable`);
    }
    return Reflect.apply(action, module, args);
  };
  if (!medicalHistoryEditorModuleLoader.module && !shouldLoad) return undefined;
  return invokeCachedModule(medicalHistoryEditorModuleLoader, loadMedicalHistoryEditor, run, (err, phase) => {
    console.error(`[context-cards] Could not run ${String(name)}:`, err);
    if (shouldLoad || phase === 'async') showNotification('Medical history editor could not be loaded. Try again.', 'error');
    return shouldLoad || phase === 'async' ? false : undefined;
  });
}

const MEDICAL_HISTORY_ROOT = '#detail-modal';


function closestMedicalHistoryElement(target: EventTarget | null, selector: string) {
  if (!(target instanceof Element)) return null;
  const el = target.closest(selector);
  if (!(el instanceof HTMLElement)) return null;
  return el.closest(MEDICAL_HISTORY_ROOT) ? el : null;
}


function getMedicalHistoryIndex(el: HTMLElement) {
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


function handleMedicalHistoryClick(event: MouseEvent) {
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


function handleMedicalHistoryFieldActivity(event: Event) {
  const input = closestMedicalHistoryElement(event.target, '#condition-input, #fh-condition');
  if (!input) return;
  if (input.id === 'condition-input') filterConditionSuggestions();
  else filterFamilyConditionSuggestions();
}


function handleMedicalHistoryInput(event: InputEvent) { handleMedicalHistoryFieldActivity(event); }

function handleMedicalHistoryFocusIn(event: FocusEvent) { handleMedicalHistoryFieldActivity(event); }


function handleMedicalHistoryKeydown(event: KeyboardEvent) {
  const input = closestMedicalHistoryElement(event.target, '#condition-input, #fh-condition');
  if (!input || event.key !== 'Enter') return;
  event.preventDefault();
  if (input.id === 'condition-input') addCondition();
  else addFamilyHistoryEntry();
}


function handleMedicalHistoryMouseDown(event: MouseEvent) {
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


export function closeSuggestionsOnClickOutside(event: MouseEvent) {
  const container = document.getElementById('condition-suggestions');
  const input = document.getElementById('condition-input');
  const target = (event.target as Node | null);
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

export function openDiagnosesEditor(...args: Parameters<MedicalHistoryEditorModule['openDiagnosesEditor']>) { return runMedicalHistoryEditorAction('openDiagnosesEditor', args); }
export function renderDiagnosesModal(...args: Parameters<MedicalHistoryEditorModule['renderDiagnosesModal']>) { return runMedicalHistoryEditorAction('renderDiagnosesModal', args); }
export function filterConditionSuggestions(...args: Parameters<MedicalHistoryEditorModule['filterConditionSuggestions']>) { return runMedicalHistoryEditorAction('filterConditionSuggestions', args); }
export function selectConditionSuggestion(...args: Parameters<MedicalHistoryEditorModule['selectConditionSuggestion']>) { return runMedicalHistoryEditorAction('selectConditionSuggestion', args); }
export function syncDiagnosesNote(...args: Parameters<MedicalHistoryEditorModule['syncDiagnosesNote']>) { return runMedicalHistoryEditorAction('syncDiagnosesNote', args); }
export function addCondition(...args: Parameters<MedicalHistoryEditorModule['addCondition']>) { return runMedicalHistoryEditorAction('addCondition', args); }
export function editCondition(...args: Parameters<MedicalHistoryEditorModule['editCondition']>) { return runMedicalHistoryEditorAction('editCondition', args); }
export function cancelConditionEdit(...args: Parameters<MedicalHistoryEditorModule['cancelConditionEdit']>) { return runMedicalHistoryEditorAction('cancelConditionEdit', args); }
export function deleteCondition(...args: Parameters<MedicalHistoryEditorModule['deleteCondition']>) { return runMedicalHistoryEditorAction('deleteCondition', args); }
export function addFamilyHistoryEntry(...args: Parameters<MedicalHistoryEditorModule['addFamilyHistoryEntry']>) { return runMedicalHistoryEditorAction('addFamilyHistoryEntry', args); }
export function editFamilyHistoryEntry(...args: Parameters<MedicalHistoryEditorModule['editFamilyHistoryEntry']>) { return runMedicalHistoryEditorAction('editFamilyHistoryEntry', args); }
export function cancelFamilyHistoryEdit(...args: Parameters<MedicalHistoryEditorModule['cancelFamilyHistoryEdit']>) { return runMedicalHistoryEditorAction('cancelFamilyHistoryEdit', args); }
export function deleteFamilyHistoryEntry(...args: Parameters<MedicalHistoryEditorModule['deleteFamilyHistoryEntry']>) { return runMedicalHistoryEditorAction('deleteFamilyHistoryEntry', args); }
export function filterFamilyConditionSuggestions(...args: Parameters<MedicalHistoryEditorModule['filterFamilyConditionSuggestions']>) { return runMedicalHistoryEditorAction('filterFamilyConditionSuggestions', args); }
export function selectFamilyConditionSuggestion(...args: Parameters<MedicalHistoryEditorModule['selectFamilyConditionSuggestion']>) { return runMedicalHistoryEditorAction('selectFamilyConditionSuggestion', args); }
export function saveDiagnoses(...args: Parameters<MedicalHistoryEditorModule['saveDiagnoses']>) { return runMedicalHistoryEditorAction('saveDiagnoses', args); }
export function closeDiagnoses(...args: Parameters<MedicalHistoryEditorModule['closeDiagnoses']>) { return runMedicalHistoryEditorAction('closeDiagnoses', args, false); }
export function clearDiagnoses(...args: Parameters<MedicalHistoryEditorModule['clearDiagnoses']>) { return runMedicalHistoryEditorAction('clearDiagnoses', args); }
