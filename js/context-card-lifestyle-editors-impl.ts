import { openLifestyleForm, saveLifestyleForm, configureLifestyleFormView } from './context-lifestyle-form-view.js';
import type { LifestyleEditorDependencies } from './context-card-editor-ui.js';
// context-card-lifestyle-editors-impl.js - lazy lifestyle context card editor implementation

import { state } from './state.js';
import { showConfirmDialog } from './utils.js';
import { scanDietForContaminants } from './food-contaminants.js';
import { doesNutritionContextOverrideTypicalMeals } from './context-card-summaries.js';
import { getTextInput, lifestyleActionAttrs, selectCtxOption } from './context-card-editor-ui.js';
import {
  closeLifestyleContextModalRuntime,
  discussDietContaminantsRuntime,
  markLifestyleContextDelegatesBoundRuntime,
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

export function configureLifestyleContextEditors({ recordChange, saveAndRefresh, afterCommit }: LifestyleEditorDependencies = {}) {
  configureLifestyleFormView(afterCommit);
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

function handleLifestyleContextClick(event: MouseEvent) {
  const actionEl = closestLifestyleElement(event.target, '[data-lifestyle-action]');
  if (!actionEl) return;
  switch (actionEl.dataset.lifestyleAction || '') {
    case 'show-diet-contaminants': event.preventDefault(); event.stopPropagation(); showDietContaminantsModal(); break;
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
