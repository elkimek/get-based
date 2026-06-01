// marker-detail-actions.js - delegated action contract for marker detail modals.

import { escapeAttr } from './utils.js';

const markerDetailActionDelegateRoots = new WeakSet();

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
    actions.openManualEntryForm?.(id);
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

export function installMarkerDetailActionDelegates(actions = {}, root = (typeof document !== 'undefined' ? document : null)) {
  if (!root || markerDetailActionDelegateRoots.has(root)) return;
  markerDetailActionDelegateRoots.add(root);
  root.addEventListener('click', event => handleMarkerDetailClick(event, actions));
  root.addEventListener('keydown', event => handleMarkerDetailKeydown(event, actions));
}
