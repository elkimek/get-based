// @ts-check
// nutrition-modal-controller.js — guarded modal dismissal and Settings handoff.

import { exitComparisonPresentation, isNutritionComparisonRunning, hasNutritionComparisonRuns } from './nutrition-comparison-ui.js';
import { suspendedNutritionEditorHasDraft } from './nutrition-editor-navigation.js';
import { isAnalysisProgressRunning } from './nutrition-review-ui.js';
import { closeModalOverlay } from './modal-lifecycle.js';
import { showConfirmDialog, showNotification } from './utils.js';

let modalDeps = {
  resetEditorState: () => {},
  hasUnsavedState: () => false,
  onBackgroundClose: () => {},
};

export function configureNutritionModalController(deps = {}) {
  modalDeps = { ...modalDeps, ...deps };
}

function finishClosingNutritionEditor() {
  document.getElementById('detail-modal')?.classList.remove('nutrition-modal', 'nutrition-targets-modal', 'nutrition-fluid-modal', 'nutrition-history-modal', 'nutrition-benchmark-modal', 'nutrition-manual-mode', 'nutrition-comparison-presentation');
  document.getElementById('modal-overlay')?.removeAttribute('data-modal-dismiss-protected');
  closeModalOverlay('modal-overlay');
}

export function closeNutritionEditor() {
  modalDeps.resetEditorState();
  finishClosingNutritionEditor();
}

function backgroundNutritionEditor() {
  const comparison = isNutritionComparisonRunning();
  exitComparisonPresentation();
  modalDeps.onBackgroundClose();
  closeModalOverlay('modal-overlay');
  showNotification(comparison
    ? 'Meal benchmark continues in the background. Open Log meal to return and cancel individual models if needed.'
    : 'Meal analysis continues in the background. Open Log meal to return or cancel the analysis.', 'info');
}

function nudgeNutritionEditor() {
  const modal = document.getElementById('detail-modal');
  if (!modal) return;
  modal.classList.remove('modal-nudge');
  void modal.offsetWidth;
  modal.classList.add('modal-nudge');
  modal.addEventListener('animationend', () => modal.classList.remove('modal-nudge'), { once: true });
}

function editorHasUnsavedWork() {
  if (suspendedNutritionEditorHasDraft()) return true;
  if (modalDeps.hasUnsavedState() || hasNutritionComparisonRuns()) return true;
  const selectors = [
    '#nutrition-meal-name', '#nutrition-meal-type', '#nutrition-note', '#nutrition-known-details',
    '#nutrition-consumed-amount', '[data-nutrition-nutrient]',
    '[data-nutrition-reference]', '[data-nutrition-component-name]', '[data-nutrition-component-grams]',
  ];
  return Array.from(document.querySelectorAll(selectors.join(','))).some(field => {
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return false;
    if (field.id === 'nutrition-consumed-amount') return field.value !== '' && field.value !== '1';
    return field.value.trim() !== '';
  });
}

/**
 * @param {(()=>unknown|Promise<unknown>)|null} navigate
 * @param {{message?: string, confirmLabel?: string, ariaLabel?: string}} [options]
 */
export async function requestNutritionEditorNavigation(navigate, {
  message = 'Discard this unsaved meal draft? The selected photos and any completed AI analysis will be removed from this review.',
  confirmLabel = 'Discard draft',
  ariaLabel = 'Discard meal draft',
} = {}) {
  if (isAnalysisProgressRunning() || isNutritionComparisonRunning()) {
    nudgeNutritionEditor();
    showNotification('Meal analysis is still running. Keep this window open so the result is not lost.', 'info');
    return false;
  }
  if (editorHasUnsavedWork() && !await showConfirmDialog(
    message,
    { confirmLabel, cancelLabel: 'Keep editing', ariaLabel },
  )) return false;
  modalDeps.resetEditorState();
  await navigate?.();
  return true;
}

export async function requestCloseNutritionEditor() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay?.hasAttribute('data-modal-dismiss-protected')) {
    closeNutritionEditor();
    return;
  }
  if (isAnalysisProgressRunning() || isNutritionComparisonRunning()) {
    backgroundNutritionEditor();
    return;
  }
  await requestNutritionEditorNavigation(finishClosingNutritionEditor);
}

function modalOverlayIsTopmost(overlay) {
  const open = Array.from(document.querySelectorAll('.modal-overlay.show, .confirm-overlay.show'));
  return !open.length || open[open.length - 1] === overlay;
}

export function handleNutritionEditorKeydown(event) {
  if (event.key !== 'Escape') return;
  if (exitComparisonPresentation()) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  const overlay = document.getElementById('modal-overlay');
  if (!overlay?.classList.contains('show')
      || !overlay.hasAttribute('data-modal-dismiss-protected')
      || !modalOverlayIsTopmost(overlay)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  void requestCloseNutritionEditor();
}

export function openNutritionAISettings() {
  if (typeof globalThis.CustomEvent !== 'function') {
    showNotification('AI Settings could not be opened.', 'error');
    return;
  }
  document.dispatchEvent(new globalThis.CustomEvent('nutrition:open-ai-settings'));
}
