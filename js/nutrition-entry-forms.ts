// Native nutrition entry forms, meal records and local media handoffs.

import { getErrorMessage } from './caught-error.js';
import { openModalOverlay } from './modal-lifecycle.js';
import { prepareMealPhotos, mealImagesFromPreparedPhotos } from './nutrition-analysis.js';
import type { ImageOperations } from '../types/nutrition-controller.js';
import { ensureNutritionStylesheet, renderStoredPhotoPreview } from './nutrition-render.js';
import { hasSuspendedNutritionEditor } from './nutrition-editor-navigation.js';
import { getActiveProfileMeal } from './nutrition-store.js';
import { showNotification } from './utils.js';
import { commitNativeNutritionMeal } from './nutrition-record-store.js';
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

type NativeMealOwner = ReturnType<typeof import('./nutrition-entry-view.js')['captureNutritionMealSaveOwner']>;
const pendingMealOwners = new WeakSet<NativeMealOwner>(), savedMealOwners = new WeakSet<NativeMealOwner>();
async function withNativeMealForm<T>(owner: NativeMealOwner | null, label: string, operation: (current: NativeMealOwner) => Promise<T>): Promise<T | null> {
  if (!owner?.current()) throw Object.assign(new Error('Meal editing authorization changed. Reopen the native meal form. No change was applied.'), { noChangeApplied: true });
  if (pendingMealOwners.has(owner) || savedMealOwners.has(owner)) return null;
  const modal = document.getElementById('detail-modal');
  const controls = [...(modal?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>('input,select,textarea,button') || [])].map(element => ({ element, disabled: element.disabled }));
  const button = modal?.querySelector<HTMLButtonElement>('#nutrition-save-btn'), previousLabel = button?.textContent || '';
  pendingMealOwners.add(owner); for (const { element } of controls) element.disabled = true;
  if (button) button.textContent = label;
  try { return await operation(owner); }
  finally {
    pendingMealOwners.delete(owner);
    if (owner.visible()) {
      for (const { element, disabled } of controls) if (element.isConnected) element.disabled = disabled;
      if (button) { button.textContent = savedMealOwners.has(owner) ? 'Saved; reload Nutrition' : previousLabel; if (savedMealOwners.has(owner)) button.disabled = true; }
    }
  }
}
export function saveNativeNutritionEditorMeal(owner: NativeMealOwner | null, original: unknown, meal: unknown) {
  return withNativeMealForm(owner, 'Saving…', async current => {
    const result = await commitNativeNutritionMeal(current.profile, original, meal, current.current);
    if (!result.refreshPending) return result.meal;
    savedMealOwners.add(current);
    if (current.visible()) showNotification('Meal saved. Reload Nutrition to refresh its local view. Do not save it again.', 'info');
    return null;
  });
}

export function chooseNativeMealReferencePhotos(owner: NativeMealOwner | null) {
  if (owner?.current() && !pendingMealOwners.has(owner) && !savedMealOwners.has(owner)) document.getElementById('nutrition-reference-photo-input')?.click();
}

/** User-chosen reference photos add local evidence without running inference. */
export async function appendNativeMealReferencePhotos(owner: NativeMealOwner | null, images: readonly ImageOperations[], input: HTMLInputElement, apply: (images: ImageOperations[]) => void) {
  const files = Array.from(input.files || []); input.value = '';
  if (!files.length) return;
  try {
    const next = await withNativeMealForm(owner, 'Preparing photos…', async current => {
      if (images.length + files.length > 4) throw new Error('A meal supports up to four photos. Existing photos were kept.');
      const prepared = await prepareMealPhotos(files);
      if (!current.current()) return null;
      const added = mealImagesFromPreparedPhotos(prepared).map((image, index) => ({ ...image, purpose: 'attachment' as const,
        dataUrl: `data:${prepared[index]!.analysisImage.mediaType};base64,${prepared[index]!.analysisImage.base64}` }));
      return [...images, ...added];
    });
    if (!next || !owner?.current()) { if (owner?.visible()) showNotification('The meal editor changed. Reopen it before adding photos. Existing photos were kept.', 'info'); return; }
    apply(next); renderStoredPhotoPreview(next);
    showNotification('Reference photos ready. Review and Save. No analysis was run.', 'success');
  } catch (error) { if (owner?.visible()) showNotification(getErrorMessage(error, 'The photos could not be prepared. Existing photos were kept.'), 'error'); }
}
