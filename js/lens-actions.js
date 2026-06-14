// @ts-check
// lens-actions.js - delegated actions for the Knowledge Base settings surface

import { escapeAttr } from './utils.js';

let lensActionDelegatesInstalled = false;
let lensActionHandlers = {};

export function lensActionAttrs(action, attrs = {}) {
  return [
    `data-lens-action="${escapeAttr(action)}"`,
    ...Object.entries(attrs)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([name, value]) => `data-lens-${escapeAttr(name)}="${escapeAttr(String(value))}"`),
  ].join(' ');
}

function isLensActionScope(actionEl) {
  return !!actionEl.closest('#custom-lens-section, #kb-modal');
}

function handleLensActionClick(event) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const actionEl = /** @type {HTMLElement | null} */ (target.closest('[data-lens-action]'));
  if (!actionEl || !isLensActionScope(actionEl)) return;

  const action = actionEl.dataset.lensAction || '';
  if (action === 'set-backend') {
    event.preventDefault();
    lensActionHandlers.handleLensBackendChange?.(actionEl.dataset.lensBackend || 'in-browser');
  } else if (action === 'new-library') {
    event.preventDefault();
    lensActionHandlers.handleLibraryNew?.();
  } else if (action === 'rename-library') {
    event.preventDefault();
    lensActionHandlers.handleLibraryRename?.();
  } else if (action === 'delete-library') {
    event.preventDefault();
    lensActionHandlers.handleLibraryDelete?.();
  } else if (action === 'open-local-filepick') {
    event.preventDefault();
    lensActionHandlers.openLocalFilePicker?.();
  } else if (action === 'save-config') {
    event.preventDefault();
    lensActionHandlers.handleSaveLensConfig?.();
  } else if (action === 'clear-cache') {
    event.preventDefault();
    lensActionHandlers.handleClearLensCache?.();
  } else if (action === 'remove-lens') {
    event.preventDefault();
    lensActionHandlers.handleRemoveLens?.();
  } else if (action === 'close-kb') {
    event.preventDefault();
    lensActionHandlers.closeKnowledgeBaseModal?.();
  } else if (action === 'delete-doc') {
    event.preventDefault();
    lensActionHandlers.handleLocalLensDeleteDoc?.(actionEl.dataset.lensSource || '');
  } else if (action === 'clear-local') {
    event.preventDefault();
    lensActionHandlers.handleLocalLensClear?.();
  }
}

function handleLensActionChange(event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) return;
  const actionEl = /** @type {HTMLElement | null} */ (target.closest('[data-lens-action]'));
  if (!actionEl || !isLensActionScope(actionEl)) return;

  const action = actionEl.dataset.lensAction || '';
  if (action === 'toggle-enabled') {
    lensActionHandlers.handleToggleLens?.(!!(actionEl instanceof HTMLInputElement && actionEl.checked));
  } else if (action === 'activate-library') {
    lensActionHandlers.handleLibraryActivate?.(actionEl instanceof HTMLSelectElement ? actionEl.value : '');
  }
}

export function initLensActionDelegates(handlers = {}) {
  lensActionHandlers = { ...lensActionHandlers, ...handlers };
  if (lensActionDelegatesInstalled || typeof document === 'undefined') return;
  lensActionDelegatesInstalled = true;
  document.addEventListener('click', handleLensActionClick);
  document.addEventListener('change', handleLensActionChange);
}
