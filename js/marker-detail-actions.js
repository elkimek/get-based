// @ts-check
// marker-detail-actions.js - delegated action contract for marker detail modals.

import { escapeAttr } from './utils.js';

const markerDetailActionDelegates = new WeakMap();

function dataAttrName(name) {
  return String(name).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);
}

export function markerDetailActionAttrs(action, attrs = {}) {
  return [
    `data-marker-detail-action="${escapeAttr(action)}"`,
    ...Object.entries(attrs)
      .filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== false)
      .map(([name, value]) => `data-marker-detail-${escapeAttr(dataAttrName(name))}="${escapeAttr(String(value))}"`),
  ].join(' ');
}

function closestMarkerDetailAction(event) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return null;
  const actionEl = target.closest('[data-marker-detail-action]');
  if (!actionEl) return null;
  return typeof event.currentTarget?.contains === 'function' && event.currentTarget.contains(actionEl) ? actionEl : null;
}

function numberAttr(actionEl, name) {
  const value = Number(actionEl.dataset[name]);
  return Number.isFinite(value) ? value : null;
}

function showDetailOptions(actionEl) {
  const opts = {};
  if (actionEl.dataset.markerDetailShowAllHistory === 'true') opts.showAllHistory = true;
  if (actionEl.dataset.markerDetailScrollToHistory === 'true') opts.scrollToHistory = true;
  const historyLimit = numberAttr(actionEl, 'markerDetailHistoryLimit');
  if (historyLimit != null) opts.historyLimit = historyLimit;
  return opts;
}

function handleMarkerDetailAction(actionEl, event, actions) {
  const action = actionEl.dataset.markerDetailAction || '';
  const id = actionEl.dataset.markerDetailId || '';
  const date = actionEl.dataset.markerDetailDate || '';
  const dotKey = actionEl.dataset.markerDetailDotKey || '';
  const type = actionEl.dataset.markerDetailType || '';

  if (action === 'close-modal') {
    actions.closeModal?.();
  } else if (action === 'clear-ref-edit-field') {
    const field = actionEl.dataset.markerDetailField === 'max' ? 'max' : 'min';
    const input = document.getElementById(`ref-edit-${field}`);
    if (input instanceof HTMLInputElement) {
      input.value = '';
      input.focus();
    }
  } else if (action === 'save-ref-range') {
    void actions.saveRefRange?.(id, type);
  } else if (action === 'quick-pin') {
    actions.toggleDashboardQuickMarkerPin?.(id);
  } else if (action === 'edit-ref-range') {
    actions.editRefRange?.(id, type, event);
  } else if (action === 'revert-ref-range') {
    void actions.revertRefRange?.(id, type);
  } else if (action === 'rename-marker') {
    void actions.renameMarker?.(id);
  } else if (action === 'revert-marker-name') {
    void actions.revertMarkerName?.(id);
  } else if (action === 'toggle-history-note') {
    actionEl.closest('.marker-history-row')?.querySelector('.mv-note-text')?.classList.toggle('show');
  } else if (action === 'edit-marker-value') {
    const value = numberAttr(actionEl, 'markerDetailValue');
    if (value != null) void actions.editMarkerValue?.(id, date, value, event);
  } else if (action === 'delete-marker-value') {
    void actions.deleteMarkerValue?.(id, date);
  } else if (action === 'revert-marker-value') {
    void actions.revertMarkerValue?.(id, date);
  } else if (action === 'edit-value-note') {
    void actions.editValueNote?.(id, date);
  } else if (action === 'delete-value-note') {
    void actions.deleteValueNote?.(id, date);
  } else if (action === 'show-detail-modal') {
    actions.showDetailModal?.(id, showDetailOptions(actionEl));
  } else if (action === 'open-manual-entry') {
    actions.openManualEntryForm?.(id, date || undefined);
  } else if (action === 'ask-ai') {
    actions.askAIAboutMarker?.(id);
  } else if (action === 'toggle-marker-note-editor') {
    actions.toggleMarkerNoteEditor?.(dotKey);
  } else if (action === 'save-marker-note') {
    void actions.saveMarkerNote?.(dotKey, id);
  } else if (action === 'delete-marker-note') {
    void actions.deleteMarkerNote?.(dotKey, id);
  } else if (action === 'delete-custom-marker') {
    void actions.deleteCustomMarker?.(id);
  } else if (action === 'save-manual-entry') {
    void actions.saveManualEntry?.(id);
  } else if (action === 'save-and-add-manual-entry') {
    void actions.saveAndAddAnotherManualEntry?.(id);
  } else if (action === 'toggle-custom-marker-category') {
    const row = document.getElementById('cm-new-cat-row');
    if (row instanceof HTMLElement && actionEl instanceof HTMLSelectElement) {
      row.style.display = actionEl.value === '__new__' ? 'flex' : 'none';
    }
  } else if (action === 'pick-new-cat-icon') {
    actions.pickNewCatIcon?.(actionEl);
  } else if (action === 'save-custom-marker') {
    actions.saveCustomMarker?.();
  }
}

function handleMarkerDetailClick(event, actions) {
  const actionEl = closestMarkerDetailAction(event);
  if (!actionEl) return;
  event.preventDefault();
  event.stopPropagation();
  handleMarkerDetailAction(actionEl, event, actions);
}

function handleMarkerDetailKeydown(event, actions) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionEl = closestMarkerDetailAction(event);
  if (!actionEl) return;
  if (event.target?.closest?.('button, a, input, textarea, select')) return;
  if (actionEl.getAttribute('role') !== 'button') return;
  event.preventDefault();
  event.stopPropagation();
  handleMarkerDetailAction(actionEl, event, actions);
}

function handleMarkerDetailChange(event, actions) {
  const actionEl = closestMarkerDetailAction(event);
  if (!actionEl || actionEl.dataset.markerDetailAction !== 'toggle-custom-marker-category') return;
  event.stopPropagation();
  handleMarkerDetailAction(actionEl, event, actions);
}

export function installMarkerDetailActionDelegates(actions = {}, root = (typeof document !== 'undefined' ? document : null)) {
  if (!root) return;
  const installedActions = markerDetailActionDelegates.get(root);
  if (installedActions) {
    Object.assign(installedActions, actions);
    return;
  }
  const delegatedActions = { ...actions };
  markerDetailActionDelegates.set(root, delegatedActions);
  root.addEventListener('click', event => handleMarkerDetailClick(event, delegatedActions));
  root.addEventListener('keydown', event => handleMarkerDetailKeydown(event, delegatedActions));
  root.addEventListener('change', event => handleMarkerDetailChange(event, delegatedActions));
}
