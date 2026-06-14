// @ts-check
// supplement-action-delegates.js - Delegated Supplement editor actions.

const SUPPLEMENT_DELEGATE_ROOTS = '.supp-timeline-section, #detail-modal, .supp-impact-section';

/**
 * @param {string} action
 * @param {string} [extra]
 * @returns {string}
 */
export function suppActionAttrs(action, extra = '') {
  return `data-supp-action="${action}"${extra ? ` ${extra}` : ''}`;
}

/**
 * @param {EventTarget | null} target
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
function closestSuppElement(target, selector) {
  if (!(target instanceof Element)) return null;
  const el = target.closest(selector);
  if (!(el instanceof HTMLElement)) return null;
  return el.closest(SUPPLEMENT_DELEGATE_ROOTS) ? el : null;
}

/**
 * @param {HTMLElement} el
 * @returns {number}
 */
function getSuppActionIndex(el) {
  const idx = Number.parseInt(el.dataset.suppIndex || '', 10);
  return Number.isInteger(idx) ? idx : -1;
}

/**
 * @param {HTMLElement} actionEl
 * @param {EventTarget | null} target
 * @returns {boolean}
 */
function hasNestedInteractiveTarget(actionEl, target) {
  if (!(target instanceof Element)) return false;
  const interactive = target.closest('a, button, input, select, textarea, label');
  return interactive instanceof Element && interactive !== actionEl && actionEl.contains(interactive);
}

/**
 * @typedef {{
 *   openEditor: (idx?: number) => void,
 *   toggleAccordion: (idx: number) => void,
 *   toggleAddForm: () => void,
 *   closeModal: () => void,
 *   askMito: () => void,
 *   addIngredient: () => void,
 *   removeIngredient: (btn: Element) => void,
 *   addPeriod: () => void,
 *   removePeriod: (btn: Element) => void,
 *   fetchUrl: () => Promise<void> | void,
 *   triggerLabelPicker: () => void,
 *   scanLabel: (input: HTMLInputElement) => Promise<void> | void,
 *   save: (idx: number) => void,
 *   delete: (idx: number) => void,
 *   refreshImpact: (idx: number) => Promise<void> | void,
 *   updateIngredientTotal: (input: Element) => void,
 *   updateAllIngredientTotals: () => void,
 * }} SupplementActions
 */

/**
 * @param {SupplementActions} actions
 * @returns {(event: MouseEvent) => void}
 */
function makeClickHandler(actions) {
  return event => {
    const actionEl = closestSuppElement(event.target, '[data-supp-action]');
    if (!actionEl || hasNestedInteractiveTarget(actionEl, event.target)) return;
    const action = actionEl.dataset.suppAction || '';
    const idx = getSuppActionIndex(actionEl);
    switch (action) {
      case 'open-editor':
        actions.openEditor(idx >= 0 ? idx : undefined);
        break;
      case 'toggle-accordion':
        if (idx >= 0) actions.toggleAccordion(idx);
        break;
      case 'toggle-add-form':
        actions.toggleAddForm();
        break;
      case 'close-modal':
        actions.closeModal();
        break;
      case 'ask-mito':
        actions.askMito();
        break;
      case 'add-ingredient':
        actions.addIngredient();
        break;
      case 'remove-ingredient':
        actions.removeIngredient(actionEl);
        break;
      case 'add-period':
        actions.addPeriod();
        break;
      case 'remove-period':
        actions.removePeriod(actionEl);
        break;
      case 'fetch-url':
        void actions.fetchUrl();
        break;
      case 'scan-label':
        actions.triggerLabelPicker();
        break;
      case 'save':
        actions.save(idx);
        break;
      case 'delete':
        if (idx >= 0) actions.delete(idx);
        break;
      case 'refresh-impact':
        if (idx >= 0) void actions.refreshImpact(idx);
        break;
      default:
        break;
    }
  };
}

/**
 * @param {KeyboardEvent} event
 */
function handleSupplementKeydown(event) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionEl = closestSuppElement(event.target, '[data-supp-action]');
  if (!actionEl || hasNestedInteractiveTarget(actionEl, event.target)) return;
  if (actionEl.matches('button, a, input, select, textarea')) return;
  event.preventDefault();
  actionEl.click();
}

/**
 * @param {SupplementActions} actions
 * @returns {(event: InputEvent) => void}
 */
function makeInputHandler(actions) {
  return event => {
    const input = closestSuppElement(event.target, '.supp-ing-amount, .supp-ing-times, #supp-times');
    if (!input) return;
    if (input.id === 'supp-times') {
      actions.updateAllIngredientTotals();
    } else {
      actions.updateIngredientTotal(input);
    }
  };
}

/**
 * @param {SupplementActions} actions
 * @returns {(event: Event) => void}
 */
function makeChangeHandler(actions) {
  return event => {
    const input = closestSuppElement(event.target, '#supp-label-input');
    if (input instanceof HTMLInputElement) void actions.scanLabel(input);
  };
}

let supplementDelegatesBound = false;

/**
 * @param {SupplementActions} actions
 */
export function initSupplementActionDelegates(actions) {
  if (supplementDelegatesBound || typeof document === 'undefined') return;
  supplementDelegatesBound = true;
  document.addEventListener('click', makeClickHandler(actions));
  document.addEventListener('keydown', handleSupplementKeydown);
  document.addEventListener('input', makeInputHandler(actions));
  document.addEventListener('change', makeChangeHandler(actions));
}
