// @ts-check
// nutrition-modal-controller.js — guarded modal dismissal and Settings handoff.

import { isNutritionComparisonRunning, hasNutritionComparisonRuns } from './nutrition-comparison-ui.js';
import { isAnalysisProgressRunning } from './nutrition-review-ui.js';
import { closeModalOverlay } from './modal-lifecycle.js';
import { showConfirmDialog, showNotification } from './utils.js';

let modalDeps = { resetEditorState: () => {}, hasUnsavedState: () => false };

export function configureNutritionModalController(deps = {}) {
  modalDeps = { ...modalDeps, ...deps };
}

export function closeNutritionEditor() {
  modalDeps.resetEditorState();
  document.getElementById('detail-modal')?.classList.remove('nutrition-modal', 'nutrition-targets-modal', 'nutrition-fluid-modal', 'nutrition-history-modal');
  document.getElementById('modal-overlay')?.removeAttribute('data-modal-dismiss-protected');
  closeModalOverlay('modal-overlay');
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
  if (modalDeps.hasUnsavedState() || hasNutritionComparisonRuns()) return true;
  const selectors = [
    '#nutrition-meal-name', '#nutrition-meal-type', '#nutrition-note', '#nutrition-known-details',
    '#nutrition-barcode', '#nutrition-consumed-amount', '[data-nutrition-nutrient]',
    '[data-nutrition-reference]', '[data-nutrition-component-name]', '[data-nutrition-component-grams]',
  ];
  return Array.from(document.querySelectorAll(selectors.join(','))).some(field => {
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return false;
    if (field.id === 'nutrition-consumed-amount') return field.value !== '' && field.value !== '1';
    return field.value.trim() !== '';
  });
}

export async function requestCloseNutritionEditor() {
  const overlay = document.getElementById('modal-overlay');
  if (!overlay?.hasAttribute('data-modal-dismiss-protected')) {
    closeNutritionEditor();
    return;
  }
  if (isAnalysisProgressRunning() || isNutritionComparisonRunning()) {
    nudgeNutritionEditor();
    showNotification('Meal analysis is still running. Keep this window open so the result is not lost.', 'info');
    return;
  }
  if (editorHasUnsavedWork() && !await showConfirmDialog(
    'Discard this unsaved meal draft? The selected photos and any completed AI analysis will be removed from this review.',
    { confirmLabel: 'Discard draft', cancelLabel: 'Keep editing', ariaLabel: 'Discard meal draft' },
  )) return;
  closeNutritionEditor();
}

function modalOverlayIsTopmost(overlay) {
  const open = Array.from(document.querySelectorAll('.modal-overlay.show, .confirm-overlay.show'));
  return !open.length || open[open.length - 1] === overlay;
}

export function handleNutritionEditorKeydown(event) {
  if (event.key !== 'Escape') return;
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
