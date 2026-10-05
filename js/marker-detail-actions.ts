// marker-detail-actions.js - delegated action contract for marker detail modals.

import { escapeAttr } from './utils.js';

type MarkerIdAction = (id: string) => unknown;
type MarkerDatedAction = (id: string, date: string) => unknown;
export interface MarkerDetailOptions { showAllHistory?: boolean; scrollToHistory?: boolean; historyLimit?: number }
export interface MarkerDetailActions {
  closeModal?: () => unknown;
  saveRefRange?: (id: string, type: string) => unknown;
  toggleDashboardQuickMarkerPin?: MarkerIdAction;
  editRefRange?: (id: string, type: string, event: Event) => unknown;
  revertRefRange?: (id: string, type: string) => unknown;
  renameMarker?: MarkerIdAction;
  revertMarkerName?: MarkerIdAction;
  openMarkerPlacementModal?: MarkerIdAction;
  saveMarkerPlacement?: MarkerIdAction;
  restoreMarkerPlacement?: MarkerIdAction;
  editMarkerValue?: (id: string, date: string, value: number, event: Event) => unknown;
  deleteMarkerValue?: MarkerDatedAction;
  revertMarkerValue?: MarkerDatedAction;
  editValueNote?: MarkerDatedAction;
  deleteValueNote?: MarkerDatedAction;
  showDetailModal?: (id: string, options: MarkerDetailOptions) => unknown;
  openManualEntryForm?: (id: string, date?: string | undefined) => unknown;
  askAIAboutMarker?: MarkerIdAction;
  toggleMarkerNoteEditor?: (dotKey: string) => unknown;
  saveMarkerNote?: (dotKey: string, id: string) => unknown;
  deleteMarkerNote?: (dotKey: string, id: string) => unknown;
  deleteCustomMarker?: MarkerIdAction;
  saveManualEntry?: MarkerIdAction;
  saveAndAddAnotherManualEntry?: MarkerIdAction;
  pickNewCatIcon?: (element: HTMLElement) => unknown;
  saveCustomMarker?: () => unknown;
}
interface MarkerDetailEvent extends Event {
  readonly target: (EventTarget & { closest?: (selector: string) => HTMLElement | null }) | null;
  readonly currentTarget: (EventTarget & { contains?: (node: Node) => boolean }) | null;
  readonly key?: string;
}
const markerDetailActionDelegates = new WeakMap<EventTarget, MarkerDetailActions>();

function dataAttrName(name: unknown) {
  return String(name).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);
}

export function markerDetailActionAttrs(action: unknown, attrs: Record<string, unknown> = {}) {
  return [
    `data-marker-detail-action="${escapeAttr(action)}"`,
    ...Object.entries(attrs)
      .filter(([, value]) => value !== undefined && value !== null && value !== '' && value !== false)
      .map(([name, value]) => `data-marker-detail-${escapeAttr(dataAttrName(name))}="${escapeAttr(String(value))}"`),
  ].join(' ');
}

function closestMarkerDetailAction(event: MarkerDetailEvent) {
  const target = event.target;
  if (!target || typeof target.closest !== 'function') return null;
  const actionEl = target.closest('[data-marker-detail-action]');
  if (!actionEl) return null;
  return typeof event.currentTarget?.contains === 'function' && event.currentTarget.contains(actionEl) ? actionEl : null;
}

function numberAttr(actionEl: HTMLElement, name: string) {
  const value = Number(actionEl.dataset[name]);
  return Number.isFinite(value) ? value : null;
}

function showDetailOptions(actionEl: HTMLElement) {
  const opts: MarkerDetailOptions = {};
  if (actionEl.dataset.markerDetailShowAllHistory === 'true') opts.showAllHistory = true;
  if (actionEl.dataset.markerDetailScrollToHistory === 'true') opts.scrollToHistory = true;
  const historyLimit = numberAttr(actionEl, 'markerDetailHistoryLimit');
  if (historyLimit != null) opts.historyLimit = historyLimit;
  return opts;
}

function handleMarkerDetailAction(actionEl: HTMLElement, event: MarkerDetailEvent, actions: MarkerDetailActions) {
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
  } else if (action === 'open-marker-placement') {
    void actions.openMarkerPlacementModal?.(id);
  } else if (action === 'save-marker-placement') {
    void actions.saveMarkerPlacement?.(id);
  } else if (action === 'restore-marker-placement') {
    void actions.restoreMarkerPlacement?.(id);
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

function handleMarkerDetailClick(event: MarkerDetailEvent, actions: MarkerDetailActions) {
  const actionEl = closestMarkerDetailAction(event);
  if (!actionEl) return;
  event.preventDefault();
  event.stopPropagation();
  handleMarkerDetailAction(actionEl, event, actions);
}

function handleMarkerDetailKeydown(event: MarkerDetailEvent, actions: MarkerDetailActions) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const actionEl = closestMarkerDetailAction(event);
  if (!actionEl) return;
  if (event.target?.closest?.('button, a, input, textarea, select')) return;
  if (actionEl.getAttribute('role') !== 'button') return;
  event.preventDefault();
  event.stopPropagation();
  handleMarkerDetailAction(actionEl, event, actions);
}

function handleMarkerDetailChange(event: MarkerDetailEvent, actions: MarkerDetailActions) {
  const actionEl = closestMarkerDetailAction(event);
  if (!actionEl || actionEl.dataset.markerDetailAction !== 'toggle-custom-marker-category') return;
  event.stopPropagation();
  handleMarkerDetailAction(actionEl, event, actions);
}

export function installMarkerDetailActionDelegates(actions: MarkerDetailActions = {}, root: EventTarget | null = (typeof document !== 'undefined' ? document : null)) {
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
