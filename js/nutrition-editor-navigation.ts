// nutrition-editor-navigation.js — entry-method tabs and logger-to-history handoff.

import { renderHTML as renderEditorNavigation } from './components/NutritionEditorNavigation.svelte.html.js';
import { NUTRITION_PHOTO_PRIVACY } from './nutrition-editor-model.js';
let suspendedEditor: { content: DocumentFragment; className: string; scrollTop: number; dismissProtected: boolean; hasDraft: boolean } | null = null;

export function hasSuspendedNutritionEditor() {
  return !!suspendedEditor;
}

export function suspendedNutritionEditorHasDraft() {
  return suspendedEditor?.hasDraft === true;
}

function editorHasDraft(modal: HTMLElement) {
  const photo = (modal.querySelector('#nutrition-photo-input') as HTMLInputElement | null);
  if (photo?.files?.length) return true;
  const selectors = [
    '#nutrition-meal-name', '#nutrition-meal-type', '#nutrition-note', '#nutrition-known-details',
    '#nutrition-consumed-amount', '[data-nutrition-nutrient]',
    '[data-nutrition-reference]', '[data-nutrition-component-name]', '[data-nutrition-component-grams]',
  ];
  return Array.from(modal.querySelectorAll(selectors.join(','))).some(field => {
    if (!(field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) return false;
    if (field.id === 'nutrition-consumed-amount') return field.value !== '' && field.value !== '1';
    return field.value.trim() !== '';
  });
}

export function suspendNutritionEditor() {
  if (suspendedEditor) return true;
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay || !modal.classList.contains('nutrition-modal')) return false;
  const hasDraft = editorHasDraft(modal);
  const content = document.createDocumentFragment();
  while (modal.firstChild) content.appendChild(modal.firstChild);
  suspendedEditor = {
    content,
    className: modal.className,
    scrollTop: modal.scrollTop,
    dismissProtected: overlay.hasAttribute('data-modal-dismiss-protected'),
    hasDraft,
  };
  return true;
}

export function restoreSuspendedNutritionEditor() {
  if (!suspendedEditor) return false;
  const modal = document.getElementById('detail-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return false;
  const suspended = suspendedEditor;
  suspendedEditor = null;
  modal.replaceChildren(suspended.content);
  modal.className = suspended.className;
  modal.scrollTop = suspended.scrollTop;
  if (suspended.dismissProtected) overlay.setAttribute('data-modal-dismiss-protected', '');
  else overlay.removeAttribute('data-modal-dismiss-protected');
  return true;
}

export function discardSuspendedNutritionEditor() {
  suspendedEditor = null;
}

export function setManualEntryMode({ focus = true } = {}) {
  const modal = document.getElementById('detail-modal');
  modal?.classList.add('nutrition-manual-mode');
  document.querySelectorAll('.nutrition-capture-tabs button').forEach(button => {
    const selected = button.getAttribute('data-nutrition-kind') === 'manual';
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  if (focus) {
    const mealName = (document.getElementById('nutrition-meal-name') as HTMLInputElement | null);
    mealName?.scrollIntoView({ block: 'center' });
    mealName?.focus({ preventScroll: true });
  }
}

export function enhanceNutritionEditorNavigation(modal: HTMLElement, { manualDefault = false } = {}) {
  const tabs = modal.querySelector('.nutrition-capture-tabs');
  if (tabs && !tabs.hasAttribute('data-nutrition-tabs')) {
    const selectedKind = tabs.querySelector('[aria-selected="true"], [aria-pressed="true"]')?.getAttribute('data-nutrition-kind');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Meal entry method');
    tabs.setAttribute('data-nutrition-tabs', '');
    tabs.innerHTML = renderEditorNavigation({ part: 'tabs' });
    if (selectedKind) tabs.querySelectorAll('button').forEach(button => {
      const selected = button.getAttribute('data-nutrition-kind') === selectedKind;
      button.setAttribute('aria-selected', String(selected));
      button.classList.toggle('is-active', selected);
    });
  }
  const privacy = document.getElementById('nutrition-privacy-line');
  if (privacy) privacy.textContent = NUTRITION_PHOTO_PRIVACY;
  const recent = modal.querySelector('.nutrition-recent');
  if (recent && !recent.querySelector('[data-nutrition-records]')) {
    recent.innerHTML = renderEditorNavigation({ part: 'records' });
  }
  if (manualDefault) setManualEntryMode({ focus: false });
}
