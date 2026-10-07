import { openLifestyleForm, saveLifestyleForm, configureLifestyleFormView } from './context-lifestyle-form-view.js';
import type { LifestyleEditorDependencies } from './context-card-editor-ui.js';
// context-card-lifestyle-editors-impl.js - lazy lifestyle context card editor implementation

import { state } from './state.js';
import { scanDietForContaminants } from './food-contaminants.js';
import { doesNutritionContextOverrideTypicalMeals } from './context-card-summaries.js';
import { lifestyleActionAttrs } from './context-card-editor-ui.js';
import {
  closeLifestyleContextModalRuntime,
  discussDietContaminantsRuntime,
  markLifestyleContextDelegatesBoundRuntime,
} from './context-card-lifestyle-runtime.js';
import {
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
} from './context-card-lifestyle-special-editors.js';

export function configureLifestyleContextEditors({ afterCommit }: LifestyleEditorDependencies = {}) {
  configureLifestyleFormView(afterCommit);
}


function closestLifestyleElement(target: EventTarget | null, selector: string) {
  const el = target instanceof Element ? target.closest(selector) : null;
  if (!(el instanceof HTMLElement)) return null;
  if (el.closest('#detail-modal')) return el;
  return el.dataset.lifestyleAction === 'show-diet-contaminants' ? el : null;
}

function discussDietContaminants() {
  discussDietContaminantsRuntime();
}

function handleLifestyleContextClick(event: MouseEvent) {
  const actionEl = closestLifestyleElement(event.target, '[data-lifestyle-action]');
  if (!actionEl) return;
  switch (actionEl.dataset.lifestyleAction || '') {
    case 'show-diet-contaminants': event.preventDefault(); event.stopPropagation(); showDietContaminantsModal(); break;
    case 'discuss-diet-contaminants': discussDietContaminants(); break;
    case 'close-modal': closeLifestyleContextModalRuntime(); break;
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

export function openEnvironmentEditor() { return openLifestyleForm('environment'); }
export function saveEnvironment() { return saveLifestyleForm('environment'); }
export function clearEnvironment() { return saveLifestyleForm('environment', true); }

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
