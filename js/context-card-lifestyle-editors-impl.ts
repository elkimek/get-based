import { openLifestyleForm, saveLifestyleForm, configureLifestyleFormView } from './context-lifestyle-form-view.js';
import type { LifestyleEditorDependencies } from './context-card-editor-ui.js';
// context-card-lifestyle-editors-impl.js - lazy lifestyle context card editor implementation

import {
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
  if (!(el instanceof HTMLElement) || !el.isConnected) return null;
  if (el.closest('#detail-modal')) return el;
  return el.dataset.lifestyleAction === 'show-diet-contaminants' ? el : null;
}

function handleLifestyleContextClick(event: MouseEvent) {
  const actionEl = closestLifestyleElement(event.target, '[data-lifestyle-action]');
  if (!actionEl) return;
  switch (actionEl.dataset.lifestyleAction || '') {
    case 'show-diet-contaminants': event.preventDefault(); event.stopPropagation(); showDietContaminantsModal(); break;
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

export { renderDietContaminantsBadge } from './context-food-contaminants-badge.js';

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
