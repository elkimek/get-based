import { openLifestyleForm, saveLifestyleForm, configureLifestyleFormView } from './context-lifestyle-form-view.js';
import type { LifestyleEditorDependencies } from './context-card-editor-ui.js';
// context-card-lifestyle-editors-impl.js - lazy lifestyle context card editor implementation

import { state } from './state.js';
import {
  ENV_SETTING,
  ENV_CLIMATE,
  ENV_ALTITUDE,
  ENV_INHALED_EXPOSURES,
  ENV_OCCUPATIONAL_EXPOSURES,
  ENV_WATER,
  ENV_WATER_CONCERNS,
  ENV_EMF,
  ENV_EMF_MITIGATION,
  ENV_HOME_LIGHT,
  ENV_AIR,
  ENV_TOXINS,
  ENV_BUILDING,
} from './constants.js';
import { showConfirmDialog, showNotification } from './utils.js';
import { saveImportedData } from './data.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { scanDietForContaminants } from './food-contaminants.js';
import { reopenSunSetup } from './sun-defaults.js';
import {
  doesNutritionContextOverrideTypicalMeals,
  getEMFAssessments,
  renderEMFAssessmentLauncher,
} from './context-card-summaries.js';
import {
  contextEditorActions,
  getTextInput,
  getInputValue,
  summarizeSection,
  lifestyleActionAttrs,
  getSelectedOption,
  getSelectedTags,
  isContextEditorStylesheetLoaded, runWithContextEditorStylesheet,
  renderContextEditorModal,
  renderContextEditorSection,
  renderNoteField,
  renderSelectField,
  renderTagsField,
  selectCtxOption,
} from './context-card-editor-ui.js';
import {
  closeLifestyleContextModalRuntime,
  discussDietContaminantsRuntime,
  markLifestyleContextDelegatesBoundRuntime,
  openLightSetupFromLifestyleRuntime,
  returnToLifestyleContextModalRuntime,
} from './context-card-lifestyle-runtime.js';
import {
  addHealthGoal,
  clearHealthGoals,
  clearInterpretiveLens,
  clearLightCircadian,
  closeHealthGoals,
  configureLifestyleSpecialEditors,
  deleteHealthGoal,
  openHealthGoalsEditor,
  openInterpretiveLensEditor,
  openLightCircadianEditor,
  renderHealthGoalsModal,
  saveInterpretiveLens,
  saveLightCircadian,
  showDietContaminantsModal,
} from './context-card-lifestyle-special-editors.js';

let recordContextChange: (field: string) => void = () => {};

let saveContextAndRefresh: (msg: string, field?: string) => void = (msg, field) => {
  if (field) recordContextChange(field);
  saveImportedData();
  showNotification(msg, 'success');
};


export function configureLifestyleContextEditors({ recordChange, saveAndRefresh, afterCommit }: LifestyleEditorDependencies = {}) {
  configureLifestyleFormView(afterCommit);
  if (typeof recordChange === 'function') recordContextChange = recordChange;
  if (typeof saveAndRefresh === 'function') saveContextAndRefresh = saveAndRefresh;
  configureLifestyleSpecialEditors({ recordChange, saveAndRefresh });
}


async function confirmClearProfileContext(label: string, clearAction: () => unknown) {
  const confirmed = await showConfirmDialog(
    `Clear all saved ${label.toLowerCase()} information? This cannot be undone.`,
    {
      confirmLabel: 'Clear',
      ariaLabel: `Clear ${label}`,
    },
  );
  if (confirmed) clearAction();
  return confirmed;
}

function closestLifestyleElement(target: EventTarget | null, selector: string) {
  const el = target instanceof Element ? target.closest(selector) : null;
  if (!(el instanceof HTMLElement)) return null;
  if (el.closest('#detail-modal')) return el;
  return el.dataset.lifestyleAction === 'show-diet-contaminants' ? el : null;
}

function getLifestyleIndex(el: HTMLElement) {
  const idx = Number.parseInt(el.dataset.lifestyleIndex || '', 10);
  return Number.isInteger(idx) ? idx : -1;
}

function openLightSetupFromContext() {
  openLightSetupFromLifestyleRuntime(reopenSunSetup);
}

function discussDietContaminants() {
  discussDietContaminantsRuntime();
}

function returnToContextModal() {
  returnToLifestyleContextModalRuntime();
}

function useHealthGoalStarter(text: string) {
  const input = getTextInput('goal-text-input');
  if (!input) return;
  input.value = text;
  input.focus();
}

 const lifestyleEditorActions: Record<string, () => void> = {
  'save-diet': saveDiet,
  'clear-diet': () => { void confirmClearProfileContext('Diet & Digestion', clearDiet); },
  'save-sleep-rest': saveSleepRest,
  'clear-sleep-rest': () => { void confirmClearProfileContext('Sleep & Rest', clearSleepRest); },
  'save-light-circadian': saveLightCircadian,
  'clear-light-circadian': () => { void confirmClearProfileContext('Light & Circadian', clearLightCircadian); },
  'save-exercise': saveExercise,
  'clear-exercise': () => { void confirmClearProfileContext('Exercise', clearExercise); },
  'save-stress': saveStress,
  'clear-stress': () => { void confirmClearProfileContext('Stress', clearStress); },
  'save-love-life': saveLoveLife,
  'clear-love-life': () => { void confirmClearProfileContext('Love Life & Relationships', clearLoveLife); },
  'save-environment': saveEnvironment,
  'clear-environment': () => { void confirmClearProfileContext('Environment', clearEnvironment); },
};

function handleLifestyleContextClick(event: MouseEvent) {
  const actionEl = closestLifestyleElement(event.target, '[data-lifestyle-action]');
  if (!actionEl) return;
  switch (actionEl.dataset.lifestyleAction || '') {
    case 'show-diet-contaminants': event.preventDefault(); event.stopPropagation(); showDietContaminantsModal(); break;
    case 'open-light-setup': openLightSetupFromContext(); break;
    case 'delete-health-goal': { const idx = getLifestyleIndex(actionEl); if (idx >= 0) deleteHealthGoal(idx); break; }
    case 'suggest-health-goal': useHealthGoalStarter(actionEl.dataset.lifestyleValue || ''); break;
    case 'add-health-goal': addHealthGoal(); break;
    case 'select-goal-severity': selectCtxOption(actionEl, 'goal-severity-select'); break;
    case 'close-health-goals': closeHealthGoals(); break;
    case 'clear-health-goals': void confirmClearProfileContext('Health Goals', clearHealthGoals); break;
    case 'save-interpretive-lens': saveInterpretiveLens(); break;
    case 'clear-interpretive-lens': clearInterpretiveLens(); break;
    case 'back-to-context': returnToContextModal(); break;
    case 'discuss-diet-contaminants': discussDietContaminants(); break;
    case 'close-modal': closeLifestyleContextModalRuntime(); break;
    default: lifestyleEditorActions[actionEl.dataset.lifestyleAction || '']?.(); break;
  }
}


function handleLifestyleContextKeydown(event: KeyboardEvent) {
  const badge = closestLifestyleElement(event.target, '[data-lifestyle-action="show-diet-contaminants"]');
  if (badge && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    event.stopPropagation();
    showDietContaminantsModal();
    return;
  }
  const goalInput = closestLifestyleElement(event.target, '#goal-text-input');
  if (goalInput && event.key === 'Enter') { event.preventDefault(); addHealthGoal(); }
}

function initLifestyleContextDelegates() {
  if (typeof document === 'undefined') return;
  if (!markLifestyleContextDelegatesBoundRuntime()) return;
  document.addEventListener('click', handleLifestyleContextClick, true);
  document.addEventListener('keydown', handleLifestyleContextKeydown);
}

initLifestyleContextDelegates();

export function renderDietContaminantsBadge() {
  if (doesNutritionContextOverrideTypicalMeals()) return '';
  const warnings = scanDietForContaminants(state.importedData.diet);
  if (warnings.length === 0) return '';
  const flagged = warnings.filter(w => w.type !== 'clean').length;
  if (flagged === 0) return '';
  return `<div class="diet-contaminants" role="button" tabindex="0" ${lifestyleActionAttrs('show-diet-contaminants')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 10 18H2L12 3Z"></path><path d="M12 9v5M12 17h.01"></path></svg><span>${flagged} food contaminant signal${flagged > 1 ? 's' : ''} detected</span></div>`;
}

export function openDietEditor() { return openLifestyleForm('diet'); }
export function saveDiet() { return saveLifestyleForm('diet'); }
export function clearDiet() { return saveLifestyleForm('diet', true); }

// ═══════════════════════════════════════════════
// SLEEP & REST
// ═══════════════════════════════════════════════

export function openSleepRestEditor() { return openLifestyleForm('sleepRest'); }
export function saveSleepRest() { return saveLifestyleForm('sleepRest'); }
export function clearSleepRest() { return saveLifestyleForm('sleepRest', true); }

// ═══════════════════════════════════════════════
// EXERCISE
// ═══════════════════════════════════════════════

export function openExerciseEditor() { return openLifestyleForm('exercise'); }
export function saveExercise() { return saveLifestyleForm('exercise'); }
export function clearExercise() { return saveLifestyleForm('exercise', true); }

// ═══════════════════════════════════════════════
// STRESS
// ═══════════════════════════════════════════════

export function openStressEditor() { return openLifestyleForm('stress'); }
export function saveStress() { return saveLifestyleForm('stress'); }
export function clearStress() { return saveLifestyleForm('stress', true); }

// ═══════════════════════════════════════════════
// LOVE LIFE
// ═══════════════════════════════════════════════

export function openLoveLifeEditor() { return openLifestyleForm('loveLife'); }
export function saveLoveLife() { return saveLifestyleForm('loveLife'); }
export function clearLoveLife() { return saveLifestyleForm('loveLife', true); }

// ═══════════════════════════════════════════════
// ENVIRONMENT
// ═══════════════════════════════════════════════

export function openEnvironmentEditor(): void | Promise<unknown> { if (!isContextEditorStylesheetLoaded()) return runWithContextEditorStylesheet(openEnvironmentEditor);
  const modal = document.getElementById("detail-modal");
  const overlay = document.getElementById("modal-overlay");
  const current = state.importedData.environment || { setting: null, climate: null, altitude: null, inhaledExposures: [], occupationalExposures: [], water: null, waterConcerns: [], emf: [], emfMitigation: [], homeLight: null, air: [], toxins: [], building: null, note: '' };
  const hasEMFAssessment = getEMFAssessments().length > 0;
  renderContextEditorModal(modal, 'Environment & Exposures', 'Your location, air, water, work, and home environment can add context to health and lab patterns.', `
    ${renderSelectField('Living setting', 'env-setting', ENV_SETTING, current.setting)}
    ${renderSelectField('Climate', 'env-climate', ENV_CLIMATE, current.climate)}
    ${renderSelectField('Altitude exposure', 'env-altitude', ENV_ALTITUDE, current.altitude)}
    ${renderTagsField('Smoking and inhaled exposure', 'env-inhaled', ENV_INHALED_EXPOSURES, current.inhaledExposures)}
    ${renderContextEditorSection('Work and hobby exposures', summarizeSection([
      current.occupationalExposures,
    ], 'Optional dusts, fumes, chemicals, metals, and radiation'), `
      ${renderTagsField('Known exposures', 'env-occupational', ENV_OCCUPATIONAL_EXPOSURES, current.occupationalExposures)}
    `)}
    ${renderContextEditorSection('Water', summarizeSection([
      current.water,
      current.waterConcerns,
    ], 'Optional source and concerns'), `
      ${renderSelectField('Primary water source', 'env-water', ENV_WATER, current.water)}
      ${renderTagsField('Water concerns', 'env-water-concerns', ENV_WATER_CONCERNS, current.waterConcerns)}
    `)}
    ${renderContextEditorSection('EMF', summarizeSection([
      hasEMFAssessment ? `${getEMFAssessments().length} saved assessment${getEMFAssessments().length === 1 ? '' : 's'}` : '',
      current.emf,
      current.emfMitigation,
    ], 'Optional exposure assessment'), `
      <div class="ctx-field-group">${renderEMFAssessmentLauncher({ inModal: true, surface: 'environment-editor' })}</div>
      ${hasEMFAssessment ? '' : `${renderTagsField('EMF exposure', 'env-emf', ENV_EMF, current.emf)}
      ${renderTagsField('EMF mitigation', 'env-emf-mit', ENV_EMF_MITIGATION, current.emfMitigation)}`}
    `)}
    ${renderContextEditorSection('Home and exposures', summarizeSection([
      current.homeLight,
      current.air,
      current.toxins,
      current.building,
    ], 'Optional lighting, air, toxins, and building'), `
      ${renderSelectField('Home/work lighting', 'env-light', ENV_HOME_LIGHT, current.homeLight)}
      ${renderTagsField('Air quality', 'env-air', ENV_AIR, current.air)}
      ${renderTagsField('Toxin exposure', 'env-toxins', ENV_TOXINS, current.toxins)}
      ${renderSelectField('Building', 'env-building', ENV_BUILDING, current.building)}
    `)}
    ${renderNoteField(current.note)}
    ${contextEditorActions(state.importedData.environment != null, lifestyleActionAttrs('save-environment'), lifestyleActionAttrs('clear-environment'))}`);
  openModalOverlay(overlay);
}

export function saveEnvironment() {
  const setting = getSelectedOption('env-setting');
  const climate = getSelectedOption('env-climate');
  const altitude = getSelectedOption('env-altitude');
  const inhaledExposures = getSelectedTags('env-inhaled');
  const occupationalExposures = getSelectedTags('env-occupational');
  const water = getSelectedOption('env-water');
  const waterConcerns = getSelectedTags('env-water-concerns');
  const hasEMFAssessment = state.importedData.emfAssessment?.assessments?.length > 0;
  const emf = hasEMFAssessment ? (state.importedData.environment?.emf || []) : getSelectedTags('env-emf');
  const emfMitigation = hasEMFAssessment ? (state.importedData.environment?.emfMitigation || []) : getSelectedTags('env-emf-mit');
  const homeLight = getSelectedOption('env-light');
  const air = getSelectedTags('env-air');
  const toxins = getSelectedTags('env-toxins');
  const building = getSelectedOption('env-building');
  const note = getInputValue('ctx-note-input');
  if (!setting && !climate && !altitude && inhaledExposures.length === 0 && occupationalExposures.length === 0 && !water && waterConcerns.length === 0 && emf.length === 0 && emfMitigation.length === 0 && !homeLight && air.length === 0 && toxins.length === 0 && !building && !note.trim()) {
    state.importedData.environment = null;
  } else {
    state.importedData.environment = { setting, climate, altitude, inhaledExposures, occupationalExposures, water, waterConcerns, emf, emfMitigation, homeLight, air, toxins, building, note: note.trim() };
  }
  saveContextAndRefresh('Environment saved', 'environment');
}

export function clearEnvironment() {
  state.importedData.environment = null;
  saveContextAndRefresh('Environment cleared', 'environment');
}

export {
  addHealthGoal,
  clearHealthGoals,
  clearInterpretiveLens,
  clearLightCircadian,
  closeHealthGoals,
  deleteHealthGoal,
  openHealthGoalsEditor,
  openInterpretiveLensEditor,
  openLightCircadianEditor,
  renderHealthGoalsModal,
  saveInterpretiveLens,
  saveLightCircadian,
  showDietContaminantsModal,
};
