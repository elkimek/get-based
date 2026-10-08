// nutrition-entry-forms.js — targets and first-class drink entry controller.

import { getErrorMessage } from './caught-error.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { ensureNutritionStylesheet } from './nutrition-render.js';
import { hasSuspendedNutritionEditor } from './nutrition-editor-navigation.js';
import { getActiveProfileMeal } from './nutrition-store.js';
import { showNotification } from './utils.js';
import { configureNutritionEntryView } from './nutrition-entry-view.js';
export { saveNutritionTargets, saveFluidLog, updateFluidLogControls, updateNutritionTargetControls, updateNutritionWidgetMetricControls } from './nutrition-entry-view.js';

import { captureMealDetailOpen, mountNutritionMealDetail } from './nutrition-meal-detail-view.js';
import { projectNutritionMealDetail } from './nutrition-meal-detail-model.js';
export { saveMealResponse, clearMealResponse } from './nutrition-meal-detail-view.js';

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
  const pending = captureMealDetailOpen();
  if (!pending || !id) return false;
  const stylesheet = await ensureNutritionStylesheet();
  if (!pending.current()) return false;
  if (stylesheet?.type === 'error') { showNotification('Nutrition styles could not be loaded. Try again.', 'error'); return false; }
  const { modal, overlay } = pending;
  try {
    const meal = await getActiveProfileMeal(id);
    if (!pending.current()) return false;
    if (!meal) throw new Error('That meal is no longer available on this device.');
    if (!hasSuspendedNutritionEditor()) entryDeps.resetEditorState();
    mealDetailReturnTo = returnTo === 'editor' ? 'editor' : 'history';
    const origin = mealDetailReturnTo;
    const current = mountNutritionMealDetail(modal, overlay, projectNutritionMealDetail(meal, { returnTo: origin }), meal, { refreshWidget: () => entryDeps.refreshWidget(), reopen: savedId => openMealDetail(savedId, { returnTo: origin }) });
    modal.scrollTop = 0;
    modal.classList.remove('nutrition-targets-modal', 'nutrition-fluid-modal', 'nutrition-history-modal', 'nutrition-manual-mode');
    modal.classList.add('nutrition-modal');
    if (hasSuspendedNutritionEditor()) overlay.setAttribute('data-modal-dismiss-protected', '');
    else overlay.removeAttribute('data-modal-dismiss-protected');
    openModalOverlay(overlay, { autoFocus: false });
    setTimeout(() => { if (current() && !modal.contains(document.activeElement)) modal.querySelector<HTMLElement>('[data-nutrition-action="back"]')?.focus({ preventScroll: true }); }, 30);
    return true;
  } catch (error) {
    if (pending.current()) showNotification(getErrorMessage(error, 'This stored meal could not be read.'), 'error');
    return false;
  }
}
