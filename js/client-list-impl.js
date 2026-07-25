// @ts-check
// client-list-impl.js — Client List modal implementation for managing profiles

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { getProfiles, getActiveProfileId, createProfile, switchProfile, deleteProfile, updateProfileMeta, getAllTags, getLocationCache, latitudeToBand, getLatitudeFromLocation, detectLatitudeWithAI, getProfileHeight } from './profile.js';
import { LATITUDE_BANDS } from './constants.js';
import { getAvatarColor } from './nav.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import {
  getClientHaplogroupList,
  hasClientListAIProvider,
  navigateClientListRoute,
  refreshClientProfileButton,
  setClientManualHaplogroup,
  showClientListNotification,
} from './client-list-runtime.js';

const CLIENT_LIST_STYLESHEET_URL = new URL('../css/client-list.css', import.meta.url).href;

/**
 * @typedef {{
 *   exportAllDataJSON: () => Promise<void> | void,
 *   exportClientJSON: (profileId: string, includeChat?: boolean) => Promise<void> | void,
 *   importDataJSON: (file: File) => Promise<void> | void,
 *   loadDemoData: (sex?: string) => Promise<void> | void,
 *   openProfileShareModal: (profileId?: string) => void,
 * }} ClientListRuntime
 */

/** @type {ClientListRuntime} */
const clientListRuntime = {
  exportAllDataJSON: () => {},
  exportClientJSON: () => {},
  importDataJSON: () => {},
  loadDemoData: () => {},
  openProfileShareModal: () => {},
};

/** @param {Partial<ClientListRuntime>} [runtime] */
export function configureClientListRuntime(runtime = {}) {
  const previous = { ...clientListRuntime };
  Object.assign(clientListRuntime, runtime);
  return previous;
}

let _search = '';
let _sort = 'lastUpdated';
let _statusFilter = 'active';
let _tagFilter = '';
let _editingId = null;
let _pendingAvatar = undefined; // undefined = no change, null = remove, string = new dataURL
let clientListDelegatesInstalled = false;
/** @type {Promise<HTMLLinkElement> | null} */
let _clientListStylesheetLoad = null;
/** @type {Promise<boolean> | null} */
let _clientListOpen = null;
let _useClientListStylesheetRetryUrl = false;

const CL_ICONS = Object.freeze({
  archive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>',
  arrowLeft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4 13 6H8a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-.5L14.5 4z"/><circle cx="12" cy="13" r="3"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  export: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 22V4"/><path d="M4 5h13l-1 5 1 5H4"/></svg>',
  import: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 8 5-5 5 5"/><path d="M12 3v12"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4 5 5-4 4v5l-2 2-5-5-4 4-1-1 4-4-5-5 2-2h5Z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4"/><path d="m15.4 6.5-6.8 4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
  user: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>',
});

function _clActionAttrs(action, attrs = {}) {
  return Object.entries({ 'data-cl-action': action, ...attrs })
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => `${name}="${escapeAttr(String(value))}"`)
    .join(' ');
}

function _clInputAttrs(action) {
  return `data-cl-input-action="${escapeAttr(action)}"`;
}

function _clChangeAttrs(action) {
  return `data-cl-change-action="${escapeAttr(action)}"`;
}

function _clKeyAttrs(action) {
  return `data-cl-key-action="${escapeAttr(action)}"`;
}

/**
 * @param {string} id
 * @returns {HTMLInputElement | null}
 */
function _clInput(id) {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el : null;
}

/**
 * @param {string} id
 * @returns {HTMLTextAreaElement | null}
 */
function _clTextarea(id) {
  const el = document.getElementById(id);
  return el instanceof HTMLTextAreaElement ? el : null;
}

/**
 * @param {string} id
 * @returns {HTMLSelectElement | null}
 */
function _clSelectElement(id) {
  const el = document.getElementById(id);
  return el instanceof HTMLSelectElement ? el : null;
}

function _clMenuButton({ icon, label, action, profileId, danger = false }) {
  return `<button type="button" class="cl-menu-item${danger ? ' cl-menu-danger' : ''}" ${_clActionAttrs(action, { 'data-cl-profile-id': profileId })}>${icon}<span>${escapeHTML(label)}</span></button>`;
}

// ═══════════════════════════════════════════════
// AVATAR HELPERS
// ═══════════════════════════════════════════════
function _resizeAvatar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 80;
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      // Center-crop to square
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function _isSafeAvatarSrc(s) { return typeof s === 'string' && s.startsWith('data:image/'); }

function _renderAvatarEl(profile) {
  if (profile.avatar && _isSafeAvatarSrc(profile.avatar)) {
    return `<img class="cl-avatar cl-avatar-img" src="${escapeAttr(profile.avatar)}" alt="">`;
  }
  const color = getAvatarColor(profile.id);
  const initial = (profile.name || '?')[0].toUpperCase();
  return `<span class="cl-avatar" style="background:${color}">${initial}</span>`;
}

// ═══════════════════════════════════════════════
// OPEN / CLOSE
// ═══════════════════════════════════════════════
function clientListStylesheetUrl() {
  if (!_useClientListStylesheetRetryUrl) return CLIENT_LIST_STYLESHEET_URL;
  const retryUrl = new URL(CLIENT_LIST_STYLESHEET_URL);
  retryUrl.searchParams.set('lazy-retry', '1');
  return retryUrl.href;
}

/** @returns {Promise<HTMLLinkElement>} */
function loadClientListStylesheet() {
  if (!_clientListStylesheetLoad) {
    if (typeof document === 'undefined') {
      return Promise.reject(new Error('Client List stylesheet requires a document'));
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = clientListStylesheetUrl();
    link.dataset.clientListStylesheet = '';
    _clientListStylesheetLoad = new Promise((resolve, reject) => {
      link.addEventListener('load', () => resolve(link), { once: true });
      link.addEventListener('error', () => {
        reject(new Error('Client List stylesheet could not be loaded'));
      }, { once: true });
      const anchor = document.querySelector('[data-client-list-stylesheet-anchor]');
      const parent = anchor?.parentNode || document.head;
      parent.insertBefore(link, anchor || null);
    }).catch(err => {
      link.remove();
      _clientListStylesheetLoad = null;
      _useClientListStylesheetRetryUrl = true;
      throw err;
    });
  }
  return _clientListStylesheetLoad;
}

/** @returns {Promise<boolean>} */
export function openClientList() {
  if (!_clientListOpen) {
    _clientListOpen = loadClientListStylesheet()
      .then(() => {
        _search = '';
        _statusFilter = 'active';
        _tagFilter = '';
        _editingId = null;
        _pendingAvatar = undefined;
        const overlay = document.getElementById('client-list-overlay');
        if (!overlay) return false;
        renderClientList();
        openModalOverlay(overlay, { initialFocus: '#cl-search', scrollLock: true });
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
  _editingId = null;
}

// ═══════════════════════════════════════════════
// RENDER LIST
// ═══════════════════════════════════════════════
function renderClientList() {
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
  let html = `<div class="cl-header">
    <div class="cl-header-left">
      <div>
        <h2 class="cl-title">Clients</h2>
        <div class="cl-count">${activeCount} active profile${activeCount === 1 ? '' : 's'}</div>
      </div>
    </div>
    <div class="cl-header-right">
      <input type="file" id="cl-json-import" accept=".json" style="display:none" ${_clChangeAttrs('import-json')}>
      <div class="cl-tools-wrap">
        <button type="button" class="cl-icon-btn cl-tools-btn" ${_clActionAttrs('toggle-tools-menu')} aria-label="More client actions" title="More actions">${CL_ICONS.more}</button>
        <div class="cl-tools-menu" id="cl-tools-menu">
          <button type="button" class="cl-tools-item" ${_clActionAttrs('trigger-json-import')}>${CL_ICONS.import}<span>Import JSON</span></button>
          <button type="button" class="cl-tools-item" ${_clActionAttrs('export-all')}>${CL_ICONS.export}<span>Export all</span></button>
          <button type="button" class="cl-tools-item" ${_clActionAttrs('load-demo', { 'data-cl-demo': 'female' })}>${CL_ICONS.user}<span>Demo Sarah</span></button>
          <button type="button" class="cl-tools-item" ${_clActionAttrs('load-demo', { 'data-cl-demo': 'male' })}>${CL_ICONS.user}<span>Demo Alex</span></button>
        </div>
      </div>
      <button type="button" class="cl-new-btn" ${_clActionAttrs('open-form')} aria-label="New Client">${CL_ICONS.plus}<span>New Client</span></button>
      <button type="button" class="modal-close cl-icon-btn" ${_clActionAttrs('close')} aria-label="Close">${CL_ICONS.close}</button>
    </div>
  </div>
  <div class="cl-toolbar">
    <label class="cl-search-wrap" for="cl-search">
      ${CL_ICONS.search}
      <input type="text" class="cl-search" id="cl-search" placeholder="Search clients..." value="${escapeHTML(_search)}" ${_clInputAttrs('search')}>
    </label>
    <div class="cl-filter-group">
      <select class="cl-sort" aria-label="Sort clients" ${_clChangeAttrs('sort')}>
        <option value="lastUpdated"${_sort === 'lastUpdated' ? ' selected' : ''}>Last Updated</option>
        <option value="az"${_sort === 'az' ? ' selected' : ''}>A \u2192 Z</option>
        <option value="za"${_sort === 'za' ? ' selected' : ''}>Z \u2192 A</option>
        <option value="created"${_sort === 'created' ? ' selected' : ''}>Created</option>
      </select>
      <select class="cl-status-filter" aria-label="Filter client status" ${_clChangeAttrs('status-filter')}>
        <option value="active"${_statusFilter === 'active' ? ' selected' : ''}>Active</option>
        <option value="flagged"${_statusFilter === 'flagged' ? ' selected' : ''}>Flagged</option>
        <option value="all"${_statusFilter === 'all' ? ' selected' : ''}>All</option>
        <option value="archived"${_statusFilter === 'archived' ? ' selected' : ''}>Archived</option>
      </select>
    </div>
  </div>`;

  // Tag filter chips
  if (allTags.length > 0) {
    html += `<div class="cl-tag-filters">`;
    for (const tag of allTags) {
      const active = _tagFilter === tag;
      html += `<button class="cl-tag-chip${active ? ' active' : ''}" ${_clActionAttrs('tag-filter', { 'data-cl-tag': tag })}>${escapeHTML(tag)}</button>`;
    }
    if (_tagFilter) {
      html += `<button class="cl-tag-chip cl-tag-clear" ${_clActionAttrs('tag-filter', { 'data-cl-tag': '' })}>Clear</button>`;
    }
    html += `</div>`;
  }

  html += `<div class="cl-list">`;
  if (sorted.length === 0) {
    html += `<div class="cl-empty">No clients match your filters</div>`;
  }
  for (const p of sorted) {
    html += _renderClientRow(p, activeId);
  }

  // Archived collapsed section — inside .cl-list so it scrolls
  if (archived.length > 0 && _statusFilter !== 'archived') {
    html += `<details class="cl-archived-section">
      <summary class="cl-archived-header">Archived (${archived.length})</summary>`;
    for (const p of archived) {
      html += _renderClientRow(p, activeId);
    }
    html += `</details>`;
  }
  html += `</div>`;
  // Shared context menu — outside .cl-list so it's not clipped by overflow
  html += `<div class="cl-row-menu" id="cl-active-menu"></div>`;

  modal.innerHTML = html;
  // Close floating menus on list scroll
  const list = modal.querySelector('.cl-list');
  if (list) list.addEventListener('scroll', _closeMenus);
}

function _renderClientRow(p, activeId) {
  const isActive = p.id === activeId;
  const timeAgo = _timeAgo(p.lastUpdated);
  const notePreview = (p.notes || '').slice(0, 60).replace(/\n/g, ' ');
  const eid = escapeAttr(p.id);
  const label = escapeAttr(p.name || 'client');

  let badges = '';
  if (p.status === 'flagged') badges += `<span class="cl-badge cl-badge-flagged" title="Flagged">flagged</span>`;
  if (p.pinned) badges += `<span class="cl-badge cl-badge-pinned" title="Pinned">pinned</span>`;

  let tags = '';
  if (Array.isArray(p.tags) && p.tags.length) {
    tags = p.tags.map(t => `<span class="cl-row-tag">${escapeHTML(t)}</span>`).join('');
  }

  return `<div class="cl-row${isActive ? ' cl-row-active' : ''}" data-id="${eid}" ${_clActionAttrs('select-profile', { 'data-cl-profile-id': p.id })} ${_clKeyAttrs('select-profile')} role="button" tabindex="0">
    ${_renderAvatarEl(p)}
    <div class="cl-row-info">
      <div class="cl-row-top">
        <span class="cl-row-name">${escapeHTML(p.name)}</span>
        ${tags}${badges}
      </div>
      <div class="cl-row-bottom">
        <span class="cl-row-time">${escapeHTML(timeAgo)}</span>${notePreview ? `<span class="cl-row-sep">&middot;</span><span class="cl-row-note">${escapeHTML(notePreview)}</span>` : ''}
      </div>
    </div>
    <div class="cl-row-actions">
      <button type="button" class="cl-row-edit cl-icon-btn" ${_clActionAttrs('edit-profile', { 'data-cl-profile-id': p.id })} title="Edit" aria-label="Edit ${label}">${CL_ICONS.edit}</button>
      <button type="button" class="cl-row-menu-btn cl-icon-btn" ${_clActionAttrs('toggle-menu', { 'data-cl-profile-id': p.id })} title="More" aria-label="More actions for ${label}">${CL_ICONS.more}</button>
    </div>
  </div>`;
}

function _getSortFn() {
  switch (_sort) {
    case 'az': return (a, b) => (a.name || '').localeCompare(b.name || '');
    case 'za': return (a, b) => (b.name || '').localeCompare(a.name || '');
    case 'created': return (a, b) => (b.createdAt || 0) - (a.createdAt || 0);
    default: return (a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0);
  }
}

function _timeAgo(ts) {
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
// CLIENT FORM (create / edit)
// ═══════════════════════════════════════════════
export function openClientForm(profileId) {
  _editingId = profileId || null;
  _pendingAvatar = undefined;
  const modal = document.getElementById('client-list-modal');
  if (!modal) return;
  const profiles = getProfiles();
  const p = profileId ? profiles.find(pr => pr.id === profileId) : null;

  const name = p ? p.name : '';
  const sex = p ? (p.sex || '') : '';
  const dob = p ? (p.dob || '') : '';
  const country = p ? ((p.location || {}).country || '') : '';
  const zip = p ? ((p.location || {}).zip || '') : '';
  const tags = p ? (p.tags || []) : [];
  const notes = p ? (p.notes || '') : '';
  const status = p ? (p.status || 'active') : 'active';
  const avatar = p ? (p.avatar || '') : '';
  const heightData = p ? getProfileHeight(p.id) : { height: null, unit: 'cm' };
  const heightUnit = heightData.unit || 'cm';
  const heightValue = heightData.height == null || heightData.height === '' ? null : Number(heightData.height);
  const heightDisplay = heightValue ? _clFormatHeightInput(heightValue, heightUnit) : '';

  const avatarColor = getAvatarColor(p ? p.id : 'new');
  const avatarInitial = (name || '?')[0].toUpperCase();
  const avatarPreview = avatar && _isSafeAvatarSrc(avatar)
    ? `<img class="cl-avatar-preview-img" id="cl-avatar-img" src="${escapeAttr(avatar)}" alt="">`
    : `<span class="cl-avatar-preview-initial" id="cl-avatar-img" style="background:${avatarColor}">${escapeHTML(avatarInitial)}</span>`;

  modal.innerHTML = `<div class="cl-header cl-form-header">
    <div class="cl-header-left">
      <button type="button" class="cl-back-btn cl-icon-btn" ${_clActionAttrs('back-to-list')} aria-label="Back to clients">${CL_ICONS.arrowLeft}</button>
      <div>
        <h2 class="cl-title">${p ? 'Edit Client' : 'New Client'}</h2>
        <div class="cl-count">${p ? escapeHTML(p.name || 'Profile') : 'Create a local profile'}</div>
      </div>
    </div>
    <div class="cl-header-right">
      <button type="button" class="modal-close cl-icon-btn" ${_clActionAttrs('close')} aria-label="Close">${CL_ICONS.close}</button>
    </div>
  </div>
  <form class="cl-form" data-cl-submit-action="save-form">
    <div class="cl-form-body">
      <section class="cl-form-section">
        <div class="cl-section-title">Profile</div>
        <div class="cl-form-row cl-avatar-row">
          <div class="cl-avatar-picker" ${_clActionAttrs('choose-avatar')} ${_clKeyAttrs('choose-avatar')} role="button" tabindex="0">
            ${avatarPreview}
            <span class="cl-avatar-edit-icon">${CL_ICONS.camera}</span>
          </div>
          <input type="file" id="cl-avatar-input" accept="image/*" style="display:none" ${_clChangeAttrs('avatar-changed')}>
          ${avatar ? `<button type="button" class="cl-avatar-remove" ${_clActionAttrs('remove-avatar')}>Remove photo</button>` : ''}
        </div>
        <div class="cl-form-row">
          <label class="cl-form-label" for="cl-name">Name <span class="cl-required">*</span></label>
          <input type="text" class="cl-form-input" id="cl-name" value="${escapeHTML(name)}" required autofocus>
        </div>
        <div class="cl-form-row-split">
          <div class="cl-form-row cl-form-col">
            <label class="cl-form-label">Sex</label>
            <div class="cl-sex-toggle" id="cl-sex-toggle">
              <button type="button" class="sex-toggle-btn${sex === 'male' ? ' active' : ''}" data-sex="male" ${_clActionAttrs('set-sex', { 'data-cl-sex': 'male' })}>Male</button>
              <button type="button" class="sex-toggle-btn${sex === 'female' ? ' active' : ''}" data-sex="female" ${_clActionAttrs('set-sex', { 'data-cl-sex': 'female' })}>Female</button>
            </div>
          </div>
          <div class="cl-form-row cl-form-col">
            <label class="cl-form-label" for="cl-dob">Date of Birth</label>
            <input type="date" class="cl-form-input cl-form-date" id="cl-dob" value="${escapeHTML(dob)}">
          </div>
        </div>
      </section>

      <section class="cl-form-section">
        <div class="cl-section-title">Region</div>
        <div class="cl-form-row">
          <label class="cl-form-label" for="cl-country">Location <span class="cl-label-detail">drives regional recommendations and affiliate URLs</span></label>
          <div class="cl-form-row-split">
            <div class="cl-form-col">
              <input type="text" class="cl-form-input" id="cl-country" value="${escapeHTML(country)}" placeholder="Country (e.g. Slovakia)" ${_clInputAttrs('update-lat')} list="cl-country-list" autocomplete="country-name">
              <datalist id="cl-country-list">
                <option value="Czech Republic"></option>
                <option value="Slovakia"></option>
                <option value="Germany"></option>
                <option value="Austria"></option>
                <option value="United States"></option>
                <option value="France"></option>
                <option value="Italy"></option>
                <option value="Spain"></option>
                <option value="Netherlands"></option>
                <option value="Belgium"></option>
                <option value="Poland"></option>
                <option value="Hungary"></option>
                <option value="Portugal"></option>
                <option value="Ireland"></option>
                <option value="Denmark"></option>
                <option value="Sweden"></option>
                <option value="Finland"></option>
                <option value="United Kingdom"></option>
                <option value="Canada"></option>
                <option value="Australia"></option>
              </datalist>
            </div>
            <div class="cl-form-col">
              <input type="text" class="cl-form-input" id="cl-zip" value="${escapeHTML(zip)}" placeholder="ZIP / postal code" ${_clInputAttrs('update-lat')}>
            </div>
          </div>
          <div id="cl-lat-display" class="cl-lat-display"></div>
        </div>
      </section>

      <section class="cl-form-section">
        <div class="cl-section-title">Health Metadata</div>
        <div class="cl-form-row-split">
          <div class="cl-form-row cl-form-col">
            <label class="cl-form-label" for="cl-height">Height <a href="#" class="cl-bio-unit-toggle" id="cl-height-unit-toggle" data-unit="${heightUnit}" ${_clActionAttrs('height-unit')}>${heightUnit}</a></label>
            <input type="number" class="cl-form-input" id="cl-height" value="${escapeHTML(String(heightDisplay))}" step="${heightUnit === 'in' ? '0.1' : '1'}" placeholder="${heightUnit === 'in' ? 'inches' : 'cm'}" ${_clInputAttrs('update-bmi')}>
            <input type="hidden" id="cl-height-unit" value="${heightUnit}">
          </div>
          ${p ? `<div class="cl-form-row cl-form-col">
            <label class="cl-form-label">BMI</label>
            <div class="mc-auto-value cl-bmi-display" id="cl-bmi-display"></div>
          </div>` : ''}
        </div>
        <div class="cl-health-note">
          ${p
            ? `<a href="#" class="cl-health-link" ${_clActionAttrs('health-metrics')}>Log weight, blood pressure and pulse on the dashboard</a>`
            : 'Log weight, blood pressure and pulse on the dashboard after creating the client.'}
        </div>
        <div class="cl-form-row">
          <label class="cl-form-label" for="cl-haplogroup">mtDNA Haplogroup <span class="cl-label-detail">maternal lineage</span></label>
          <div class="cl-haplogroup-row">
            <select class="cl-form-input cl-haplogroup-select" id="cl-haplogroup" ${_clChangeAttrs('haplogroup-changed')}>
              <option value="">Not set</option>
              ${getClientHaplogroupList().map(h => '<option value="' + h + '"' + (state.importedData?.genetics?.mtdna?.haplogroup === h ? ' selected' : '') + '>' + h + '</option>').join('')}
            </select>
            <span id="cl-hg-coupling" class="cl-hg-coupling">${state.importedData?.genetics?.mtdna?.coupling?.shortLabel || ''}</span>
          </div>
        </div>
      </section>

      <section class="cl-form-section">
        <div class="cl-section-title">Client Notes</div>
        <div class="cl-form-row">
          <label class="cl-form-label">Tags</label>
          <div class="cl-tags-wrap" id="cl-tags-wrap">
            ${tags.map(t => `<span class="cl-tag-pill">${escapeHTML(t)}<button type="button" class="cl-tag-remove" ${_clActionAttrs('remove-tag')} aria-label="Remove tag">${CL_ICONS.close}</button></span>`).join('')}
            <input type="text" class="cl-tag-input" id="cl-tag-input" placeholder="Add tag + Enter" ${_clKeyAttrs('tag-input')}>
          </div>
        </div>
        <div class="cl-form-row">
          <label class="cl-form-label" for="cl-notes">Notes</label>
          <textarea class="cl-form-textarea" id="cl-notes" rows="3" placeholder="Practitioner notes...">${escapeHTML(notes)}</textarea>
        </div>
        <div class="cl-form-row">
          <label class="cl-form-label">Status</label>
          <div class="cl-status-radios">
            <label class="cl-radio"><input type="radio" name="cl-status" value="active"${status === 'active' ? ' checked' : ''}> Active</label>
            <label class="cl-radio"><input type="radio" name="cl-status" value="flagged"${status === 'flagged' ? ' checked' : ''}> Flagged</label>
            <label class="cl-radio"><input type="radio" name="cl-status" value="archived"${status === 'archived' ? ' checked' : ''}> Archived</label>
          </div>
        </div>
      </section>
    </div>
    <div class="cl-form-actions">
      <button type="button" class="cl-form-cancel" ${_clActionAttrs('back-to-list')}>Cancel</button>
      <button type="submit" class="cl-form-save">${p ? 'Save Changes' : 'Create Client'}</button>
    </div>
  </form>`;
  requestAnimationFrame(() => {
    _clUpdateLat();
    _clUpdateBMI();
  });
}

function _clGoToHealthMetrics(event) {
  if (event) event.preventDefault();
  closeClientList();
  navigateClientListRoute('dashboard');
  requestAnimationFrame(() => {
    document.getElementById('wearable-strip')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ═══════════════════════════════════════════════
// FORM HANDLERS
// ═══════════════════════════════════════════════
function _clSaveForm(e) {
  e.preventDefault();
  const name = (_clInput('cl-name')?.value || '').trim();
  if (!name) return;
  const sexBtn = document.querySelector('#cl-sex-toggle .sex-toggle-btn.active');
  const sex = sexBtn instanceof HTMLElement ? sexBtn.dataset.sex || null : null;
  const dob = _clInput('cl-dob')?.value || null;
  const country = (_clInput('cl-country')?.value || '').trim();
  const zip = (_clInput('cl-zip')?.value || '').trim();
  const notes = (_clTextarea('cl-notes')?.value || '').trim();
  const statusRadio = document.querySelector('input[name="cl-status"]:checked');
  const status = statusRadio instanceof HTMLInputElement ? statusRadio.value : 'active';

  // Collect tags from pills
  const tags = [];
  document.querySelectorAll('#cl-tags-wrap .cl-tag-pill').forEach(pill => {
    const text = pill.firstChild.textContent.trim();
    if (text && !tags.includes(text)) tags.push(text);
  });

  // Height — stored in cm
  const heightRaw = parseFloat(_clInput('cl-height')?.value || '');
  const heightUnit = _clInput('cl-height-unit')?.value || 'cm';
  const height = heightRaw ? (heightUnit === 'in' ? Math.round(heightRaw * 2.54 * 10) / 10 : Math.round(heightRaw)) : null;

  // Build avatar update
  const avatarUpdate = {};
  if (_pendingAvatar !== undefined) {
    avatarUpdate.avatar = _pendingAvatar; // null = remove, string = new
  }

  if (_editingId) {
    // Update existing profile
    updateProfileMeta(_editingId, { name, sex, dob, location: { country, zip }, tags, notes, status, height, heightUnit, ...avatarUpdate });
    // If editing the active profile, sync runtime state so data pipeline uses fresh values
    if (_editingId === state.currentProfile) {
      if (sex !== undefined) state.profileSex = sex;
      if (dob !== undefined) state.profileDob = dob;
    }
    refreshClientProfileButton();
    showClientListNotification(`"${name}" updated`, 'info');
  } else {
    // Create new profile
    const id = createProfile(name, { sex, dob, location: { country, zip }, tags, notes, status, height, heightUnit, ...avatarUpdate });
    switchProfile(id);
    refreshClientProfileButton();
    showClientListNotification(`"${name}" created`, 'success');
  }
  _editingId = null;
  renderClientList();
}

async function _clHaplogroupChanged() {
  const sel = _clSelectElement('cl-haplogroup');
  const label = document.getElementById('cl-hg-coupling');
  if (!sel) return;
  const hg = sel.value;
  if (!hg) {
    if (label) label.textContent = '';
    return;
  }
  await setClientManualHaplogroup(hg);
  // Update coupling label
  const mt = state.importedData?.genetics?.mtdna;
  if (label) label.textContent = mt?.coupling?.shortLabel || '';
}

async function _clAvatarChanged(input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await _resizeAvatar(file);
    _pendingAvatar = dataUrl;
    const container = document.querySelector('.cl-avatar-picker');
    if (container) {
      container.innerHTML = `<img class="cl-avatar-preview-img" id="cl-avatar-img" src="${escapeAttr(dataUrl)}" alt=""><span class="cl-avatar-edit-icon">${CL_ICONS.camera}</span>`;
    }
    // Add remove button if not present
    if (!document.querySelector('.cl-avatar-remove')) {
      const row = document.querySelector('.cl-avatar-row');
      if (row) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cl-avatar-remove';
        btn.textContent = 'Remove photo';
        btn.setAttribute('data-cl-action', 'remove-avatar');
        row.appendChild(btn);
      }
    }
  } catch {
    showClientListNotification('Could not load image', 'error');
  }
  input.value = '';
}

function _clRemoveAvatar() {
  _pendingAvatar = null;
  const container = document.querySelector('.cl-avatar-picker');
  if (container) {
    const color = getAvatarColor(_editingId || 'new');
    const nameInput = _clInput('cl-name');
    const initial = ((nameInput?.value || '?')[0]).toUpperCase();
    container.innerHTML = `<span class="cl-avatar-preview-initial" id="cl-avatar-img" style="background:${color}">${escapeHTML(initial)}</span><span class="cl-avatar-edit-icon">${CL_ICONS.camera}</span>`;
  }
  const removeBtn = document.querySelector('.cl-avatar-remove');
  if (removeBtn) removeBtn.remove();
}

function _clSetSex(sex) {
  document.querySelectorAll('#cl-sex-toggle .sex-toggle-btn').forEach(btn => {
    if (btn instanceof HTMLElement) btn.classList.toggle('active', btn.dataset.sex === sex);
  });
}

function _clShowLat(el, lat, suffix) {
  var band = latitudeToBand(lat);
  el.style.color = 'var(--green)';
  el.textContent = '\u2713 ' + Math.abs(Math.round(lat)) + '\u00b0' + (lat >= 0 ? 'N' : 'S') + ' \u2014 ' + LATITUDE_BANDS[band] + (suffix || '');
}

var _clLatTimer = null;
function _clUpdateLat() {
  const country = (_clInput('cl-country')?.value || '').trim();
  const zip = (_clInput('cl-zip')?.value || '').trim();
  const el = document.getElementById('cl-lat-display');
  if (!el) return;
  if (!country) { el.textContent = ''; return; }

  var cache = getLocationCache();
  var cacheKey = (country + '|' + zip).toLowerCase();
  var cached = cache[cacheKey];
  const hasAIProvider = hasClientListAIProvider();

  // Exact cache hit — show immediately, done
  if (cached !== undefined) {
    var countryLat = zip ? cache[(country + '|').toLowerCase()] : undefined;
    var zipSuffix = '';
    if (zip && countryLat !== undefined) zipSuffix = Math.round(cached) !== Math.round(countryLat) ? ' (ZIP-refined)' : ' (ZIP \u2014 same area)';
    _clShowLat(el, cached, zipSuffix);
    return;
  }

  // No exact hit — check if country-only is cached (show it as interim when ZIP is being refined)
  var countryOnly = zip ? cache[(country + '|').toLowerCase()] : undefined;
  if (countryOnly !== undefined) {
    _clShowLat(el, countryOnly, ' \u2014 refining with ZIP\u2026');
  } else {
    // Hardcoded fallback (instant, no AI needed)
    var bandLabel = getLatitudeFromLocation(country, zip);
    if (bandLabel) {
      el.style.color = 'var(--green)';
      el.textContent = '\u2713 ' + bandLabel + (hasAIProvider ? ' \u2014 refining\u2026' : '');
    } else if (hasAIProvider) {
      el.style.color = 'var(--text-muted)';
      el.textContent = 'Detecting\u2026';
    } else {
      el.style.color = 'var(--text-muted)';
      el.textContent = 'Country not recognized \u2014 try the full name';
    }
  }

  // Debounced AI refinement
  if (_clLatTimer) clearTimeout(_clLatTimer);
  _clLatTimer = setTimeout(function() {
    if (!hasClientListAIProvider()) return;
    detectLatitudeWithAI(country, zip).then(() => {
      var freshCache = getLocationCache();
      var updated = freshCache[(country + '|' + zip).toLowerCase()];
      if (updated !== undefined) {
        var cOnly = zip ? freshCache[(country + '|').toLowerCase()] : undefined;
        var zSuffix = '';
        if (zip && cOnly !== undefined) zSuffix = Math.round(updated) !== Math.round(cOnly) ? ' (ZIP-refined)' : ' (ZIP \u2014 same area)';
        var display = document.getElementById('cl-lat-display');
        if (display) _clShowLat(display, updated, zSuffix);
      }
    });
  }, 1500);
}

function _clTagKeydown(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const input = e.target;
  const val = input.value.trim();
  if (!val) return;
  // Check for duplicates
  const existing = [];
  document.querySelectorAll('#cl-tags-wrap .cl-tag-pill').forEach(pill => {
    existing.push(pill.firstChild.textContent.trim().toLowerCase());
  });
  if (existing.includes(val.toLowerCase())) { input.value = ''; return; }
  const pill = document.createElement('span');
  pill.className = 'cl-tag-pill';
  pill.innerHTML = `${escapeHTML(val)}<button type="button" class="cl-tag-remove" ${_clActionAttrs('remove-tag')} aria-label="Remove tag">${CL_ICONS.close}</button>`;
  const wrap = document.getElementById('cl-tags-wrap');
  wrap.insertBefore(pill, input);
  input.value = '';
}

function _clRemoveTag(btn) {
  btn.parentElement.remove();
}

function _clBackToList() {
  _editingId = null;
  renderClientList();
}

// ═══════════════════════════════════════════════
// LIST ACTIONS
// ═══════════════════════════════════════════════
function _clSelect(id) {
  switchProfile(id);
  refreshClientProfileButton();
  closeClientList();
}

function _clSearch(val) {
  _search = val;
  renderClientList();
  // Restore focus + cursor position
  requestAnimationFrame(() => {
    const input = document.getElementById('cl-search');
    if (input instanceof HTMLInputElement) { input.focus(); input.setSelectionRange(val.length, val.length); }
  });
}

function _clSort(val) { _sort = val; renderClientList(); }
function _clStatusFilter(val) { _statusFilter = val; renderClientList(); }
function _clTagFilter(val) { _tagFilter = (_tagFilter === val) ? '' : val; renderClientList(); }

function _clToggleToolsMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('cl-tools-menu');
  if (!menu) return;
  const open = menu.classList.contains('show');
  _closeMenus();
  menu.classList.toggle('show', !open);
}

function _clToggleMenu(e, id, buttonEl = null) {
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
    _clMenuButton({ icon: CL_ICONS.edit, label: 'Edit', action: 'edit-profile', profileId: id }) +
    (p.pinned
      ? _clMenuButton({ icon: CL_ICONS.pin, label: 'Unpin', action: 'unpin-profile', profileId: id })
      : _clMenuButton({ icon: CL_ICONS.pin, label: 'Pin', action: 'pin-profile', profileId: id })) +
    (p.status === 'flagged'
      ? _clMenuButton({ icon: CL_ICONS.flag, label: 'Unflag', action: 'unflag-profile', profileId: id })
      : _clMenuButton({ icon: CL_ICONS.flag, label: 'Flag', action: 'flag-profile', profileId: id })) +
    `<div class="cl-menu-sep"></div>` +
    _clMenuButton({ icon: CL_ICONS.share, label: 'Share Profile', action: 'share-profile', profileId: id }) +
    _clMenuButton({ icon: CL_ICONS.export, label: 'Export', action: 'export-profile', profileId: id }) +
    _clMenuButton({ icon: CL_ICONS.export, label: 'Export with Chat', action: 'export-profile-chat', profileId: id }) +
    `<div class="cl-menu-sep"></div>` +
    (p.status === 'archived'
      ? _clMenuButton({ icon: CL_ICONS.archive, label: 'Unarchive', action: 'unarchive-profile', profileId: id })
      : _clMenuButton({ icon: CL_ICONS.archive, label: 'Archive', action: 'archive-profile', profileId: id })) +
    _clMenuButton({ icon: CL_ICONS.trash, label: 'Delete', action: 'delete-profile', profileId: id, danger: true });
  // Position relative to the modal (absolute positioned child)
  const btn = buttonEl || e.currentTarget;
  if (!(btn instanceof Element)) return;
  const modal = menu.parentElement;
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

function _clEdit(id) { _closeMenus(); openClientForm(id); }
function _clPin(id) { updateProfileMeta(id, { pinned: true }); renderClientList(); }
function _clUnpin(id) { updateProfileMeta(id, { pinned: false }); renderClientList(); }
function _clFlag(id) { updateProfileMeta(id, { status: 'flagged' }); renderClientList(); refreshClientProfileButton(); }
function _clUnflag(id) { updateProfileMeta(id, { status: 'active' }); renderClientList(); refreshClientProfileButton(); }
function _clArchive(id) { updateProfileMeta(id, { status: 'archived' }); renderClientList(); refreshClientProfileButton(); }
function _clUnarchive(id) { updateProfileMeta(id, { status: 'active' }); renderClientList(); refreshClientProfileButton(); }
function _closeMenus() {
  const m = document.getElementById('cl-active-menu');
  const tools = document.getElementById('cl-tools-menu');
  if (m) m.classList.remove('show');
  if (tools) tools.classList.remove('show');
}
function _clExport(id) { _closeMenus(); clientListRuntime.exportClientJSON(id); }
function _clExportChat(id) { _closeMenus(); clientListRuntime.exportClientJSON(id, true); }
function _clShare(id) {
  _closeMenus();
  closeClientList();
  setTimeout(() => clientListRuntime.openProfileShareModal(id), 120);
}
function _clDelete(id) { _closeMenus(); deleteProfile(id, () => renderClientList()); }

function _closestClientEl(event, selector) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const el = target.closest(selector);
  if (!el || !el.closest('#client-list-modal')) return null;
  return el;
}

function _clickFileInput(id) {
  const input = document.getElementById(id);
  if (input instanceof HTMLInputElement) input.click();
}

function _handleClientClick(event) {
  const actionEl = _closestClientEl(event, '[data-cl-action]');
  if (!actionEl) return;

  const action = actionEl.dataset.clAction;
  const id = actionEl.dataset.clProfileId || '';
  if (action === 'select-profile' && event.target instanceof Element && event.target.closest('.cl-row-actions')) return;
  let handled = true;

  if (action === 'close') closeClientList();
  else if (action === 'open-form') openClientForm();
  else if (action === 'back-to-list') _clBackToList();
  else if (action === 'select-profile') _clSelect(id);
  else if (action === 'edit-profile') _clEdit(id);
  else if (action === 'toggle-tools-menu') _clToggleToolsMenu(event);
  else if (action === 'trigger-json-import') { _closeMenus(); _clickFileInput('cl-json-import'); }
  else if (action === 'export-all') { _closeMenus(); clientListRuntime.exportAllDataJSON(); }
  else if (action === 'load-demo') { closeClientList(); clientListRuntime.loadDemoData(actionEl.dataset.clDemo || 'female'); }
  else if (action === 'tag-filter') _clTagFilter(actionEl.dataset.clTag || '');
  else if (action === 'toggle-menu') _clToggleMenu(event, id, actionEl);
  else if (action === 'choose-avatar') _clickFileInput('cl-avatar-input');
  else if (action === 'remove-avatar') _clRemoveAvatar();
  else if (action === 'set-sex') _clSetSex(actionEl.dataset.clSex || '');
  else if (action === 'remove-tag') _clRemoveTag(actionEl);
  else if (action === 'height-unit') _clHeightUnitChanged();
  else if (action === 'health-metrics') _clGoToHealthMetrics(event);
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
  else handled = false;

  if (handled) event.preventDefault();
}

function _handleClientInput(event) {
  const input = _closestClientEl(event, '[data-cl-input-action]');
  if (!(input instanceof HTMLInputElement)) return;

  const action = input.dataset.clInputAction;
  if (action === 'search') _clSearch(input.value);
  else if (action === 'update-lat') _clUpdateLat();
  else if (action === 'update-bmi') _clUpdateBMI();
}

function _handleClientChange(event) {
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
  } else if (action === 'avatar-changed' && el instanceof HTMLInputElement) {
    _clAvatarChanged(el);
  } else if (action === 'haplogroup-changed') {
    _clHaplogroupChanged();
  }
}

function _handleClientSubmit(event) {
  const form = _closestClientEl(event, '[data-cl-submit-action]');
  if (!(form instanceof HTMLFormElement)) return;
  if (form.dataset.clSubmitAction === 'save-form') _clSaveForm(event);
}

function _handleClientKeydown(event) {
  const el = _closestClientEl(event, '[data-cl-key-action]');
  if (!el) return;
  const action = el.dataset.clKeyAction;

  if (action === 'tag-input') {
    _clTagKeydown(event);
    return;
  }
  if (event.key !== 'Enter' && event.key !== ' ') return;

  if (action === 'select-profile') {
    event.preventDefault();
    _clSelect(el.dataset.clProfileId || '');
  } else if (action === 'choose-avatar') {
    event.preventDefault();
    _clickFileInput('cl-avatar-input');
  }
}

// Global "click outside" dismiss: intentionally not scoped to #client-list-modal
// so open client-list menus close when the user clicks anywhere on the page.
function _handleClientDocumentClick(event) {
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
  document.addEventListener('submit', _handleClientSubmit);
  document.addEventListener('keydown', _handleClientKeydown);
  document.addEventListener('click', _handleClientDocumentClick);
}

function _clUpdateBMI() {
  const el = document.getElementById('cl-bmi-display');
  if (!el) return;
  const heightRaw = parseFloat(_clInput('cl-height')?.value || '');
  const heightUnit = _clInput('cl-height-unit')?.value || 'cm';
  const heightCm = heightRaw ? (heightUnit === 'in' ? heightRaw * 2.54 : heightRaw) : null;

  // Weight now lives in the wearables summary (single source of truth after
  // the Health Metrics unification). Any manual entry is canonicalized to kg
  // on write, so no unit conversion needed here.
  const weightKg = state.importedData?.wearableSummary?.metrics?.weight?.latest ?? null;

  if (heightCm && weightKg) {
    const htM = heightCm / 100;
    const bmi = weightKg / (htM * htM);
    let cat = '> 30';
    if (bmi < 18.5) cat = '< 18.5';
    else if (bmi < 25) cat = 'normal';
    else if (bmi < 30) cat = '25–30';
    el.className = 'mc-auto-value';
    el.textContent = `${bmi.toFixed(1)} (${cat})`;
  } else {
    el.className = 'mc-auto-value mc-auto-pending';
    el.textContent = heightCm ? 'add weight' : weightKg ? 'add height' : '--';
  }
}

/**
 * @param {number} heightCm
 * @param {string} unit
 * @returns {string}
 */
function _clFormatHeightInput(heightCm, unit) {
  return unit === 'in' ? (heightCm / 2.54).toFixed(1) : String(Math.round(heightCm));
}

function _clHeightUnitChanged() {
  const input = _clInput('cl-height');
  const hidden = _clInput('cl-height-unit');
  const toggle = document.getElementById('cl-height-unit-toggle');
  if (!input || !hidden || !toggle) return;
  const current = hidden.value;
  const next = current === 'cm' ? 'in' : 'cm';
  const val = parseFloat(input.value);
  if (val) {
    const heightCm = current === 'in' ? val * 2.54 : val;
    input.value = _clFormatHeightInput(heightCm, next);
  }
  input.placeholder = next === 'in' ? 'inches' : 'cm';
  input.step = next === 'in' ? '0.1' : '1';
  hidden.value = next;
  toggle.textContent = next;
  toggle.dataset.unit = next;
  _clUpdateBMI();
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

installClientListDelegates();
