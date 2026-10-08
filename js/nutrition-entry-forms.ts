// nutrition-entry-forms.js — targets and first-class drink entry controller.

import { getErrorMessage } from './caught-error.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { ensureNutritionStylesheet, renderMealDetail } from './nutrition-render.js';
import { hasSuspendedNutritionEditor } from './nutrition-editor-navigation.js';
import { getActiveProfileMeal, saveActiveProfileMeal } from './nutrition-store.js';
import { showNotification } from './utils.js';
import { configureNutritionEntryView } from './nutrition-entry-view.js';
export { saveNutritionTargets, saveFluidLog, updateFluidLogControls, updateNutritionTargetControls, updateNutritionWidgetMetricControls } from './nutrition-entry-view.js';

interface NutritionEntryCallbacks {
  refreshWidget: () => unknown;
  closeEditor: () => unknown;
  resetEditorState: () => unknown;
}

let entryDeps: NutritionEntryCallbacks = { refreshWidget: () => {}, closeEditor: () => {}, resetEditorState: () => {} };
let mealDetailReturnTo = 'meals';

export function configureNutritionEntryForms(deps: Partial<NutritionEntryCallbacks> = {}) {
  entryDeps = { ...entryDeps, ...deps };
  configureNutritionEntryView(deps);
}

export async function openMealDetail(id: Parameters<typeof getActiveProfileMeal>[0], { returnTo = mealDetailReturnTo }: { returnTo?: unknown } = {}) {
  await ensureNutritionStylesheet();
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay || !id) return false;
  try {
    const meal = await getActiveProfileMeal(id);
    if (!meal) throw new Error('That meal is no longer available on this device.');
    if (!hasSuspendedNutritionEditor()) entryDeps.resetEditorState();
    mealDetailReturnTo = returnTo === 'editor' ? 'editor' : 'history';
    modal.innerHTML = renderMealDetail(meal, { returnTo: mealDetailReturnTo });
    modal.scrollTop = 0;
    modal.classList.remove('nutrition-targets-modal', 'nutrition-fluid-modal', 'nutrition-history-modal', 'nutrition-manual-mode');
    modal.classList.add('nutrition-modal');
    if (hasSuspendedNutritionEditor()) overlay.setAttribute('data-modal-dismiss-protected', '');
    else overlay.removeAttribute('data-modal-dismiss-protected');
    openModalOverlay(overlay, { initialFocus: '[data-nutrition-action="back"]', focusDelay: 30 });
    return true;
  } catch (error) {
    showNotification(getErrorMessage(error, 'This stored meal could not be read.'), 'error');
    return false;
  }
}

function selectedResponseLevel(name: string) {
  const value = Number((document.querySelector(`input[name="${name}"]:checked`) as HTMLInputElement | null)?.value);
  return Number.isInteger(value) && value >= 1 && value <= 3 ? value : null;
}

export async function saveMealResponse(id: Parameters<typeof getActiveProfileMeal>[0]) {
  const satiety2h = selectedResponseLevel('nutrition-response-satiety');
  const energy2h = selectedResponseLevel('nutrition-response-energy');
  if (satiety2h === null && energy2h === null) {
    showNotification('Choose hunger, energy, or both before saving the check-in.', 'info');
    (document.querySelector('input[name="nutrition-response-satiety"]') as HTMLElement | null)?.focus();
    return;
  }
  try {
    const meal = await getActiveProfileMeal(id);
    if (!meal) throw new Error('That meal is no longer available.');
    const saved = await saveActiveProfileMeal({
      ...meal,
      responseCheckIn: {
        ...(satiety2h === null ? {} : { satiety2h }),
        ...(energy2h === null ? {} : { energy2h }),
        recordedAt: new Date().toISOString(),
      },
    });
    entryDeps.refreshWidget();
    await openMealDetail(saved.id, { returnTo: mealDetailReturnTo });
    showNotification('After-meal check-in saved and queued for sync.', 'success');
  } catch (error) {
    showNotification(getErrorMessage(error, 'The after-meal check-in could not be saved.'), 'error');
  }
}

export async function clearMealResponse(id: Parameters<typeof getActiveProfileMeal>[0]) {
  try {
    const meal = await getActiveProfileMeal(id);
    if (!meal) throw new Error('That meal is no longer available.');
    const { responseCheckIn: _removed, ...withoutResponse } = meal;
    const saved = await saveActiveProfileMeal(withoutResponse);
    entryDeps.refreshWidget();
    await openMealDetail(saved.id, { returnTo: mealDetailReturnTo });
    showNotification('After-meal check-in cleared and queued for sync.', 'info');
  } catch (error) {
    showNotification(getErrorMessage(error, 'The after-meal check-in could not be cleared.'), 'error');
  }
}
