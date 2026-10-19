import type { ProfileRecord } from './profile.js';
type ClientListCalls = { exportAllDataJSON(): unknown; exportClientJSON(profileId: string, includeChat?: boolean): unknown; importDataJSON(file: File): unknown; loadDemoData(sex?: string): unknown; openProfileShareModal(profileId?: string): unknown };
export type ClientListRuntimeSnapshot = { [Key in keyof ClientListCalls]: unknown };

import { createRetryingStylesheetLoader } from './retrying-module-loader.js';
// client-list-impl.js — Client List modal implementation for managing profiles

import { state } from './state.js';
import {clientListText, projectClientListTag, projectClientListRow, renderClientListOverview, renderClientListMenuButton} from './client-list-presentation.js';
import type {ClientListIconName, ClientListRowView} from './client-list-presentation.js';
import { getProfiles, getActiveProfileId, switchProfile, deleteProfile, updateProfileMeta, getAllTags } from './profile.js';
import { getAvatarColor } from './nav.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import { refreshClientProfileButton } from './client-list-runtime.js';
import {
  configureClientListFormRuntime,
  handleClientFormChange,
  handleClientFormClick,
  handleClientFormInput,
  handleClientFormKeydown,
  handleClientFormSubmit,
  openClientForm,
  resetClientListFormState,
} from './client-list-form.js';

export { openClientForm };

const CLIENT_LIST_STYLESHEET_URL = new URL('../css/client-list.css', import.meta.url).href;

// Private unchecked calls preserve raw configured slot errors and receiver.
const clientListRuntime: ClientListCalls = {
  exportAllDataJSON: () => {},
  exportClientJSON: () => {},
  importDataJSON: () => {},
  loadDemoData: () => {},
  openProfileShareModal: () => {},
};

export function configureClientListRuntime(runtime: unknown = {}): ClientListRuntimeSnapshot {
  const previous = { ...clientListRuntime };
  Object.assign(clientListRuntime, runtime);
  return previous;
}

let _search = '';
let _searchRevision = 0;
let _sort = 'lastUpdated';
let _statusFilter = 'active';
let _tagFilter = '';
let clientListDelegatesInstalled = false;
const clientListStylesheetLoadCache = createRetryingStylesheetLoader({
  createLink: () => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = clientListStylesheetUrl();
    link.dataset.clientListStylesheet = '';
    return link;
  },
  insertLink: link => {
    const anchor = document.querySelector('[data-client-list-stylesheet-anchor]');
    const parent = anchor?.parentNode || document.head;
    parent.insertBefore(link, anchor || null);
  },
  requireDocument: "Client List stylesheet requires a document",
  failedLoad: "Client List stylesheet could not be loaded",
});
let _clientListOpen: Promise<boolean> | null = null;

function _clMenuButton({icon, label, action, profileId, danger = false}: {icon: ClientListIconName; label: unknown; action: unknown; profileId: unknown; danger?: unknown}) {
  return renderClientListMenuButton(icon, label, action, profileId, danger);
}

// ═══════════════════════════════════════════════
// OPEN / CLOSE
// ═══════════════════════════════════════════════
function clientListStylesheetUrl() {
  if (!clientListStylesheetLoadCache.retry) return CLIENT_LIST_STYLESHEET_URL;
  const retryUrl = new URL(CLIENT_LIST_STYLESHEET_URL);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

/** @returns {Promise<HTMLLinkElement>} */
function loadClientListStylesheet() {
  return clientListStylesheetLoadCache.load();
}

/** @returns {Promise<boolean>} */
export function openClientList(returnFocus?: HTMLElement) {
  if (!_clientListOpen) {
    _clientListOpen = loadClientListStylesheet()
      .then(() => {
        _search = '';
        _statusFilter = 'active';
        _tagFilter = '';
        resetClientListFormState();
        const overlay = document.getElementById('client-list-overlay');
        if (!overlay) return false;
        renderClientList();
        openModalOverlay(overlay, { initialFocus: '#cl-search', scrollLock: true, returnFocus });
        return true;
      })
      .catch(err => {
        console.error('Failed to load Client List stylesheet', err);
        return false;
      })
      .finally(() => {
        _clientListOpen = null;
      });
  }
  return _clientListOpen;
}

export function closeClientList() {
  closeModalOverlay('client-list-overlay');
  resetClientListFormState();
}

// ═══════════════════════════════════════════════
// RENDER LIST
// ═══════════════════════════════════════════════
/** Keep a focused search control attached while replacing the exact new siblings.
 * Detaching/reinserting that control would cancel native focus and composition.
 */
function replaceClientListMarkup(modal: HTMLElement, html: string, input?: HTMLInputElement): boolean {
  const toolbar = input?.closest('.cl-toolbar');
  if (!input || document.activeElement !== input || toolbar?.parentNode !== modal) {
    modal.innerHTML = html;
    return false;
  }
  const rendered = document.createElement('div');
  rendered.innerHTML = html;
  const nextToolbar = rendered.querySelector('.cl-toolbar');
  const nextInput = nextToolbar?.querySelector('#cl-search');
  if (!(nextToolbar instanceof HTMLElement) || nextToolbar.parentNode !== rendered || !(nextInput instanceof HTMLInputElement)) {
    throw new Error('Client List search render is missing its direct toolbar');
  }
  // Validate the static toolbar before touching the live DOM. Only the search
  // default/attribute value changes in a search-only projection.
  const projectedToolbar = toolbar.cloneNode(true) as HTMLElement;
  const projectedInput = projectedToolbar.querySelector('#cl-search');
  if (!(projectedInput instanceof HTMLInputElement)) throw new Error('Client List retained search is missing');
  projectedInput.defaultValue = nextInput.defaultValue;
  if (projectedToolbar.outerHTML !== nextToolbar.outerHTML) throw new Error('Client List search toolbar changed unexpectedly');
  const nodes = Array.from(rendered.childNodes);
  const index = nodes.indexOf(nextToolbar);
  input.defaultValue = nextInput.defaultValue;
  for (const child of Array.from(modal.childNodes)) if (child !== toolbar) modal.removeChild(child);
  for (const child of nodes.slice(0, index)) modal.insertBefore(child, toolbar);
  for (const child of nodes.slice(index + 1)) modal.appendChild(child);
  return true;
}

function renderClientList(focusedSearch?: HTMLInputElement) {
  const modal = document.getElementById('client-list-modal');
  if (!modal) return;
  const profiles = getProfiles();
  const activeId = getActiveProfileId();
  const allTags = getAllTags();

  // Filter
  let filtered = profiles.filter(p => {
    if (_statusFilter === 'active') return p.status !== 'archived';
    if (_statusFilter === 'flagged') return p.status === 'flagged';
    if (_statusFilter === 'archived') return p.status === 'archived';
    return true; // 'all'
  });
  if (_tagFilter) {
    filtered = filtered.filter(p => Array.isArray(p.tags) && p.tags.includes(_tagFilter));
  }
  if (_search) {
    const q = _search.toLowerCase();
    filtered = filtered.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.notes || '').toLowerCase().includes(q) ||
      (Array.isArray(p.tags) && p.tags.some(t => t.toLowerCase().includes(q)))
    );
  }

  // Sort — pinned always first
  const sortFn = _getSortFn();
  const pinned = filtered.filter(p => p.pinned).sort(sortFn);
  const unpinned = filtered.filter(p => !p.pinned).sort(sortFn);
  const sorted = [...pinned, ...unpinned];

  // Archived section (only when viewing active/flagged/all)
  const archived = (_statusFilter !== 'archived')
    ? profiles.filter(p => p.status === 'archived')
    : [];

  const activeCount = profiles.filter(p => p.status !== 'archived').length;
  const search = clientListText(_search);
  const sort = _sort;
  const status = _statusFilter;
  const showTags = allTags.length > 0;
  const tags = [];
  let clearTag = false;
  if (showTags) {
    for (const tag of allTags) {
      const active = _tagFilter === tag;
      tags.push(projectClientListTag(tag, active));
    }
    clearTag = Boolean(_tagFilter);
  }
  const empty = sorted.length === 0;
  const rows: ClientListRowView[] = [];
  for (const p of sorted) {
    rows.push(projectClientListRow(p, activeId, _timeAgo, getAvatarColor));
  }
  let archivedRows: ClientListRowView[] | null = null;
  let archivedCount = 0;
  if (archived.length > 0 && _statusFilter !== 'archived') {
    archivedCount = archived.length;
    archivedRows = [];
    for (const p of archived) {
      archivedRows.push(projectClientListRow(p, activeId, _timeAgo, getAvatarColor));
    }
  }
  const html = renderClientListOverview({
    activeCount, search, sort, status, showTags, tags, clearTag,
    empty, rows, archivedRows, archivedCount,
  });
  const preservedSearch = replaceClientListMarkup(modal, html, focusedSearch);
  // Close floating menus on list scroll
  const list = modal.querySelector('.cl-list');
  if (list) list.addEventListener('scroll', _closeMenus);
  return preservedSearch;
}

function _getSortFn(): (a: ProfileRecord, b: ProfileRecord) => number {
  switch (_sort) {
    case 'az': return (a, b) => (a.name || '').localeCompare(b.name || '');
    case 'za': return (a, b) => (b.name || '').localeCompare(a.name || '');
    case 'created': return (a, b) => (b.createdAt || 0) - (a.createdAt || 0);
    default: return (a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0);
  }
}

function _timeAgo(ts: number | null | undefined) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ═══════════════════════════════════════════════
// LIST ACTIONS
// ═══════════════════════════════════════════════
function _clSelect(id: string) {
  switchProfile(id);
  refreshClientProfileButton();
  closeClientList();
}

function _clSearch(val: string) {
  _search = val;
  const revision = ++_searchRevision;
  const current = document.getElementById('cl-search');
  const focused = current instanceof HTMLInputElement && document.activeElement === current ? current : undefined;
  if (renderClientList(focused)) return;
  // Preserve the existing deferred fallback for a nonfocused/programmatic search.
  // Restore focus + cursor position
  requestAnimationFrame(() => {
    if (revision !== _searchRevision) return;
    const input = document.getElementById('cl-search');
    if (input instanceof HTMLInputElement) { input.focus(); input.setSelectionRange(val.length, val.length); }
  });
}

function _clSort(val: string) { _sort = val; renderClientList(); }
function _clStatusFilter(val: string) { _statusFilter = val; renderClientList(); }
function _clTagFilter(val: string) { _tagFilter = (_tagFilter === val) ? '' : val; renderClientList(); }

function _clToggleToolsMenu(e: Event) {
  e.stopPropagation();
  const menu = document.getElementById('cl-tools-menu');
  if (!menu) return;
  const open = menu.classList.contains('show');
  _closeMenus();
  menu.classList.toggle('show', !open);
}

function _clToggleMenu(e: Event, id: string, buttonEl: Element | null = null) {
  e.stopPropagation();
  const menu = document.getElementById('cl-active-menu');
  if (!menu) return;
  // Toggle off if already open for this profile
  if (menu.classList.contains('show') && menu.dataset.profileId === id) {
    menu.classList.remove('show');
    return;
  }
  // Build menu items for this profile
  const profiles = getProfiles();
  const p = profiles.find(pr => pr.id === id);
  if (!p) return;
  menu.dataset.profileId = id;
  menu.innerHTML =
    _clMenuButton({ icon: 'edit', label: 'Edit', action: 'edit-profile', profileId: id }) +
    (p.pinned
      ? _clMenuButton({ icon: 'pin', label: 'Unpin', action: 'unpin-profile', profileId: id })
      : _clMenuButton({ icon: 'pin', label: 'Pin', action: 'pin-profile', profileId: id })) +
    (p.status === 'flagged'
      ? _clMenuButton({ icon: 'flag', label: 'Unflag', action: 'unflag-profile', profileId: id })
      : _clMenuButton({ icon: 'flag', label: 'Flag', action: 'flag-profile', profileId: id })) +
    `<div class="cl-menu-sep"></div>` +
    _clMenuButton({ icon: 'share', label: 'Share Profile', action: 'share-profile', profileId: id }) +
    _clMenuButton({ icon: 'export', label: 'Export', action: 'export-profile', profileId: id }) +
    _clMenuButton({ icon: 'export', label: 'Export with Chat', action: 'export-profile-chat', profileId: id }) +
    `<div class="cl-menu-sep"></div>` +
    (p.status === 'archived'
      ? _clMenuButton({ icon: 'archive', label: 'Unarchive', action: 'unarchive-profile', profileId: id })
      : _clMenuButton({ icon: 'archive', label: 'Archive', action: 'archive-profile', profileId: id })) +
    _clMenuButton({ icon: 'trash', label: 'Delete', action: 'delete-profile', profileId: id, danger: true });
  // Position relative to the modal (absolute positioned child)
  const btn = buttonEl || e.currentTarget;
  if (!(btn instanceof Element)) return;
  const modal = menu.parentElement;
  if (!modal) return;
  const modalRect = modal.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  menu.style.right = (modalRect.right - btnRect.right) + 'px';
  // Show first so we can measure menu height
  menu.classList.add('show');
  const menuH = menu.offsetHeight;
  const modalH = modalRect.height;
  const btnBottom = btnRect.bottom - modalRect.top;
  const btnTop = btnRect.top - modalRect.top;
  // Prefer below; flip above if more space there
  const spaceBelow = modalH - btnBottom;
  const spaceAbove = btnTop;
  let top;
  if (spaceBelow >= menuH + 8 || spaceBelow >= spaceAbove) {
    top = btnBottom + 4;
  } else {
    top = btnTop - menuH - 4;
  }
  menu.style.top = top + 'px';
}

function _clEdit(id: string) { _closeMenus(); openClientForm(id); }
function _clUpdateProfile(id: string, updates: Parameters<typeof updateProfileMeta>[1], refreshProfileButton = false) {
  void updateProfileMeta(id, updates).then(changed => {
    if (!changed) return;
    renderClientList();
    if (refreshProfileButton) refreshClientProfileButton();
  }).catch(() => {
    // saveProfiles already surfaced the storage failure; retain current UI.
  });
}
function _clPin(id: string) { _clUpdateProfile(id, { pinned: true }); }
function _clUnpin(id: string) { _clUpdateProfile(id, { pinned: false }); }
function _clFlag(id: string) { _clUpdateProfile(id, { status: 'flagged' }, true); }
function _clUnflag(id: string) { _clUpdateProfile(id, { status: 'active' }, true); }
function _clArchive(id: string) { _clUpdateProfile(id, { status: 'archived' }, true); }
function _clUnarchive(id: string) { _clUpdateProfile(id, { status: 'active' }, true); }
function _closeMenus() {
  const m = document.getElementById('cl-active-menu');
  const tools = document.getElementById('cl-tools-menu');
  if (m) m.classList.remove('show');
  if (tools) tools.classList.remove('show');
}
function _clExport(id: string) { _closeMenus(); clientListRuntime.exportClientJSON(id); }
function _clExportChat(id: string) { _closeMenus(); clientListRuntime.exportClientJSON(id, true); }
function _clShare(id: string) {
  _closeMenus();
  closeClientList();
  setTimeout(() => clientListRuntime.openProfileShareModal(id), 120);
}
function _clDelete(id: string) { _closeMenus(); deleteProfile(id, () => renderClientList()); }

function _closestClientEl(event: Event, selector: string) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const el = target.closest(selector);
  if (!el || !el.closest('#client-list-modal')) return null;
  return el as HTMLElement;
}

function _clickFileInput(id: string) {
  const input = document.getElementById(id);
  if (input instanceof HTMLInputElement) input.click();
}

function _handleClientClick(event: MouseEvent) {
  const actionEl = _closestClientEl(event, '[data-cl-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.clAction;
  const id = actionEl.dataset.clProfileId || '';
  if (action === 'select-profile' && event.target instanceof Element && event.target.closest('.cl-row-actions')) return;
  let handled = true;

  if (action === 'close') closeClientList();
  else if (action === 'open-form') openClientForm();
  else if (action === 'select-profile') _clSelect(id);
  else if (action === 'edit-profile') _clEdit(id);
  else if (action === 'toggle-tools-menu') _clToggleToolsMenu(event);
  else if (action === 'trigger-json-import') { _closeMenus(); _clickFileInput('cl-json-import'); }
  else if (action === 'export-all') { _closeMenus(); clientListRuntime.exportAllDataJSON(); }
  else if (action === 'load-demo') { closeClientList(); clientListRuntime.loadDemoData(actionEl.dataset.clDemo || 'female'); }
  else if (action === 'tag-filter') _clTagFilter(actionEl.dataset.clTag || '');
  else if (action === 'toggle-menu') _clToggleMenu(event, id, actionEl);
  else if (action === 'pin-profile') _clPin(id);
  else if (action === 'unpin-profile') _clUnpin(id);
  else if (action === 'flag-profile') _clFlag(id);
  else if (action === 'unflag-profile') _clUnflag(id);
  else if (action === 'archive-profile') _clArchive(id);
  else if (action === 'unarchive-profile') _clUnarchive(id);
  else if (action === 'share-profile') _clShare(id);
  else if (action === 'export-profile') _clExport(id);
  else if (action === 'export-profile-chat') _clExportChat(id);
  else if (action === 'delete-profile') _clDelete(id);
  else handled = handleClientFormClick(action || '', actionEl, event);

  if (handled) event.preventDefault();
}

function _handleClientInput(event: Event) {
  const input = _closestClientEl(event, '[data-cl-input-action]');
  if (!(input instanceof HTMLInputElement)) return;

  const action = input.dataset.clInputAction;
  if (action === 'search') _clSearch(input.value);
  else handleClientFormInput(action || '');
}

function _handleClientChange(event: Event) {
  const el = _closestClientEl(event, '[data-cl-change-action]');
  if (!(el instanceof HTMLElement)) return;

  const action = el.dataset.clChangeAction;
  if (action === 'import-json' && el instanceof HTMLInputElement) {
    const file = el.files?.[0];
    if (!file) return;
    closeClientList();
    clientListRuntime.importDataJSON(file);
    el.value = '';
  } else if (action === 'sort' && el instanceof HTMLSelectElement) {
    _clSort(el.value);
  } else if (action === 'status-filter' && el instanceof HTMLSelectElement) {
    _clStatusFilter(el.value);
  } else {
    handleClientFormChange(action || '', el);
  }
}

function _handleClientSubmit(event: Event) {
  const form = _closestClientEl(event, '[data-cl-submit-action]');
  if (!(form instanceof HTMLFormElement)) return;
  handleClientFormSubmit(form.dataset.clSubmitAction || '', event);
}

function _handleClientKeydown(event: KeyboardEvent) {
  const el = _closestClientEl(event, '[data-cl-key-action]');
  if (!el) return;
  const action = el.dataset.clKeyAction;
  if (handleClientFormKeydown(action as string, event)) return;
  if (event.key !== 'Enter' && event.key !== ' ') return;

  if (action === 'select-profile') {
    if (event.target !== el) return;
    event.preventDefault();
    _clSelect(el.dataset.clProfileId || '');
  }
}

// Global "click outside" dismiss: intentionally not scoped to #client-list-modal
// so open client-list menus close when the user clicks anywhere on the page.
function _handleClientDocumentClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!target.closest('.cl-row-menu-btn, .cl-row-menu, .cl-tools-wrap')) _closeMenus();
}

function installClientListDelegates() {
  if (clientListDelegatesInstalled || typeof document === 'undefined') return;
  clientListDelegatesInstalled = true;
  document.addEventListener('click', _handleClientClick);
  document.addEventListener('input', _handleClientInput);
  document.addEventListener('change', _handleClientChange);
  // Own local form submits before the Kit router can intercept GET navigation.
  document.addEventListener('submit', _handleClientSubmit, true);
  document.addEventListener('keydown', _handleClientKeydown);
  document.addEventListener('click', _handleClientDocumentClick);
}

// Open the current profile's edit form, focused on the country field.
// Used by the rec disclosure footer's "change region" link so users can
// jump straight to fixing their region from any rec section.
//
// Two-step: openClientList() makes the modal overlay visible (sets the
// .show class); openClientForm(id) replaces the list view with the form.
// Calling openClientForm alone leaves the overlay hidden — the form
// renders in the DOM but isn't visible to the user.
export async function openProfileLocationEditor() {
  // Close any other modal that might be on top first (marker modal, etc.)
  // so the client-list overlay isn't sitting behind it.
  const otherOverlay = document.getElementById('modal-overlay');
  if (otherOverlay) otherOverlay.classList.remove('show');
  const opened = await openClientList();
  if (!opened) return false;
  const id = state?.currentProfile;
  if (id) openClientForm(id);
  // Focus the country input after the form mounts.
  setTimeout(() => {
    const el = document.getElementById('cl-country');
    if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }, 80);
  return true;
}

configureClientListFormRuntime({
  closeClientList,
  renderClientList,
});
installClientListDelegates();
