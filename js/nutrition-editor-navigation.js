// @ts-check
// nutrition-editor-navigation.js — entry-method tabs and logger-to-history handoff.

const ACTION_ATTR = 'data-nutrition-action';
/** @type {{content: DocumentFragment, className: string, scrollTop: number, dismissProtected: boolean, hasDraft: boolean}|null} */
let suspendedEditor = null;

export function hasSuspendedNutritionEditor() {
  return !!suspendedEditor;
}

export function suspendedNutritionEditorHasDraft() {
  return suspendedEditor?.hasDraft === true;
}

function editorHasDraft(modal) {
  const photo = /** @type {HTMLInputElement | null} */ (modal.querySelector('#nutrition-photo-input'));
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
    const mealName = /** @type {HTMLInputElement | null} */ (document.getElementById('nutrition-meal-name'));
    mealName?.scrollIntoView({ block: 'center' });
    mealName?.focus({ preventScroll: true });
  }
}

export function enhanceNutritionEditorNavigation(modal, { manualDefault = false } = {}) {
  const tabs = modal.querySelector('.nutrition-capture-tabs');
  if (tabs) {
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Meal entry method');
    const existing = [...tabs.querySelectorAll('button')];
    if (existing[0]) existing[0].textContent = 'Photo';
    existing.forEach(button => {
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', button.getAttribute('aria-pressed') || 'false');
      button.removeAttribute('aria-pressed');
    });
    const manual = document.createElement('button');
    manual.type = 'button';
    manual.textContent = 'Manual';
    manual.setAttribute('role', 'tab');
    manual.setAttribute('aria-selected', 'false');
    manual.setAttribute(ACTION_ATTR, 'set-kind');
    manual.setAttribute('data-nutrition-kind', 'manual');
    tabs.appendChild(manual);
  }
  const privacy = document.getElementById('nutrition-privacy-line');
  if (privacy) privacy.textContent = 'Sent only when you choose Analyze photo. Full-size originals are not saved; resized copies stay with the meal. First cloud use asks for approval.';
  const recent = modal.querySelector('.nutrition-recent');
  if (recent) {
    const title = document.createElement('div');
    title.className = 'nutrition-section-title';
    title.textContent = 'Your meal records';
    const copy = document.createElement('p');
    copy.className = 'nutrition-meal-records-copy';
    copy.textContent = 'Browse every saved meal in the chronological Meals view.';
    const browse = document.createElement('button');
    browse.type = 'button';
    browse.className = 'import-btn import-btn-secondary';
    browse.textContent = 'Browse meals';
    browse.setAttribute(ACTION_ATTR, 'open-history');
    recent.replaceChildren(title, copy, browse);
  }
  if (manualDefault) setManualEntryMode({ focus: false });
}
