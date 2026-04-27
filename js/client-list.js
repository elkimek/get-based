// client-list.js — Client List modal for managing profiles

import { state } from './state.js';
import { escapeHTML, escapeAttr } from './utils.js';
import { getProfiles, getActiveProfileId, createProfile, switchProfile, deleteProfile, updateProfileMeta, getAllTags, getLocationCache, latitudeToBand, getLatitudeFromLocation, detectLatitudeWithAI, getProfileHeight } from './profile.js';
import { LATITUDE_BANDS } from './constants.js';
import { getAvatarColor } from './nav.js';

let _search = '';
let _sort = 'lastUpdated';
let _statusFilter = 'active';
let _tagFilter = '';
let _editingId = null;
let _pendingAvatar = undefined; // undefined = no change, null = remove, string = new dataURL

// Use imported escapeAttr for onclick="fn('${val}')" contexts

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
export function openClientList() {
  _search = '';
  _statusFilter = 'active';
  _tagFilter = '';
  _editingId = null;
  _pendingAvatar = undefined;
  const overlay = document.getElementById('client-list-overlay');
  if (!overlay) return;
  renderClientList();
  overlay.classList.add('show');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => {
    const input = document.getElementById('cl-search');
    if (input) input.focus();
  });
}

export function closeClientList() {
  const overlay = document.getElementById('client-list-overlay');
  if (overlay) overlay.classList.remove('show');
  document.body.style.overflow = '';
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

  let html = `<div class="cl-header">
    <div class="cl-header-left">
      <h2 class="cl-title">Clients <span class="cl-count">(${profiles.filter(p => p.status !== 'archived').length})</span></h2>
    </div>
    <div class="cl-header-right">
      <button class="cl-export-all-btn" onclick="document.getElementById('cl-json-import').click()">Import</button>
      <input type="file" id="cl-json-import" accept=".json" style="display:none" onchange="if(this.files[0]){closeClientList();window.importDataJSON(this.files[0]);this.value=''}">
      <button class="cl-export-all-btn" onclick="window.exportAllDataJSON()">Export All</button>
      <button class="cl-new-btn cl-demo-btn" onclick="closeClientList();window.loadDemoData('female')">+ Demo Sarah</button>
      <button class="cl-new-btn cl-demo-btn" onclick="closeClientList();window.loadDemoData('male')">+ Demo Alex</button>
      <button class="cl-new-btn" onclick="openClientForm()">+ New Client</button>
      <button class="modal-close" onclick="closeClientList()" aria-label="Close">&times;</button>
    </div>
  </div>
  <div class="cl-toolbar">
    <input type="text" class="cl-search" id="cl-search" placeholder="Search clients..." value="${escapeHTML(_search)}" oninput="window._clSearch(this.value)">
    <select class="cl-sort" onchange="window._clSort(this.value)">
      <option value="lastUpdated"${_sort === 'lastUpdated' ? ' selected' : ''}>Last Updated</option>
      <option value="az"${_sort === 'az' ? ' selected' : ''}>A \u2192 Z</option>
      <option value="za"${_sort === 'za' ? ' selected' : ''}>Z \u2192 A</option>
      <option value="created"${_sort === 'created' ? ' selected' : ''}>Created</option>
    </select>
    <select class="cl-status-filter" onchange="window._clStatusFilter(this.value)">
      <option value="active"${_statusFilter === 'active' ? ' selected' : ''}>Active</option>
      <option value="flagged"${_statusFilter === 'flagged' ? ' selected' : ''}>Flagged</option>
      <option value="all"${_statusFilter === 'all' ? ' selected' : ''}>All</option>
      <option value="archived"${_statusFilter === 'archived' ? ' selected' : ''}>Archived</option>
    </select>
  </div>`;

  // Tag filter chips
  if (allTags.length > 0) {
    html += `<div class="cl-tag-filters">`;
    for (const tag of allTags) {
      const active = _tagFilter === tag;
      html += `<button class="cl-tag-chip${active ? ' active' : ''}" onclick="window._clTagFilter('${escapeAttr(tag)}')">${escapeHTML(tag)}</button>`;
    }
    if (_tagFilter) {
      html += `<button class="cl-tag-chip cl-tag-clear" onclick="window._clTagFilter('')">Clear</button>`;
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
  const color = getAvatarColor(p.id);
  const initial = (p.name || '?')[0].toUpperCase();
  const isActive = p.id === activeId;
  const timeAgo = _timeAgo(p.lastUpdated);
  const notePreview = (p.notes || '').slice(0, 60).replace(/\n/g, ' ');

  let badges = '';
  if (p.status === 'flagged') badges += `<span class="cl-badge cl-badge-flagged" title="Flagged">flagged</span>`;
  if (p.pinned) badges += `<span class="cl-badge cl-badge-pinned" title="Pinned">pinned</span>`;

  let tags = '';
  if (Array.isArray(p.tags) && p.tags.length) {
    tags = p.tags.map(t => `<span class="cl-row-tag">${escapeHTML(t)}</span>`).join('');
  }

  return `<div class="cl-row${isActive ? ' cl-row-active' : ''}" data-id="${escapeAttr(p.id)}" onclick="window._clSelect('${escapeAttr(p.id)}')">
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
    <div class="cl-row-actions" onclick="event.stopPropagation()">
      <button class="cl-row-edit" onclick="openClientForm('${escapeAttr(p.id)}')" title="Edit">Edit</button>
      <button class="cl-row-menu-btn" onclick="window._clToggleMenu(event, '${escapeAttr(p.id)}')" title="More">&ctdot;</button>
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
  const heightDisplay = heightData.height ? (heightUnit === 'in' ? (heightData.height / 2.54).toFixed(1) : heightData.height) : '';

  const avatarColor = getAvatarColor(p ? p.id : 'new');
  const avatarInitial = (name || '?')[0].toUpperCase();
  const avatarPreview = avatar && _isSafeAvatarSrc(avatar)
    ? `<img class="cl-avatar-preview-img" id="cl-avatar-img" src="${escapeAttr(avatar)}" alt="">`
    : `<span class="cl-avatar-preview-initial" id="cl-avatar-img" style="background:${avatarColor}">${escapeHTML(avatarInitial)}</span>`;

  modal.innerHTML = `<div class="cl-header">
    <div class="cl-header-left">
      <button class="cl-back-btn" onclick="window._clBackToList()">&larr;</button>
      <h2 class="cl-title">${p ? 'Edit Client' : 'New Client'}</h2>
    </div>
    <div class="cl-header-right">
      <button class="modal-close" onclick="closeClientList()" aria-label="Close">&times;</button>
    </div>
  </div>
  <form class="cl-form" onsubmit="window._clSaveForm(event)">
    <div class="cl-form-row cl-avatar-row">
      <div class="cl-avatar-picker" onclick="document.getElementById('cl-avatar-input').click()">
        ${avatarPreview}
        <span class="cl-avatar-edit-icon">&#128247;</span>
      </div>
      <input type="file" id="cl-avatar-input" accept="image/*" style="display:none" onchange="window._clAvatarChanged(this)">
      ${avatar ? `<button type="button" class="cl-avatar-remove" onclick="window._clRemoveAvatar()">Remove photo</button>` : ''}
    </div>
    <div class="cl-form-row">
      <label class="cl-form-label">Name <span class="cl-required">*</span></label>
      <input type="text" class="cl-form-input" id="cl-name" value="${escapeHTML(name)}" required autofocus>
    </div>
    <div class="cl-form-row">
      <label class="cl-form-label">Sex</label>
      <div class="cl-sex-toggle" id="cl-sex-toggle">
        <button type="button" class="sex-toggle-btn${sex === 'male' ? ' active' : ''}" data-sex="male" onclick="window._clSetSex('male')">Male</button>
        <button type="button" class="sex-toggle-btn${sex === 'female' ? ' active' : ''}" data-sex="female" onclick="window._clSetSex('female')">Female</button>
      </div>
    </div>
    <div class="cl-form-row">
      <label class="cl-form-label">Date of Birth</label>
      <input type="date" class="cl-form-input cl-form-date" id="cl-dob" value="${escapeHTML(dob)}">
    </div>
    <div class="cl-form-row">
      <label class="cl-form-label">Location <span style="font-weight:400;color:var(--text-muted);font-size:11px">(country drives which region's recommendations + affiliate URLs you see)</span></label>
      <div class="cl-form-row-split">
        <div class="cl-form-col">
          <input type="text" class="cl-form-input" id="cl-country" value="${escapeHTML(country)}" placeholder="Country (e.g. Slovakia)" oninput="window._clUpdateLat()" list="cl-country-list" autocomplete="country-name">
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
          <input type="text" class="cl-form-input" id="cl-zip" value="${escapeHTML(zip)}" placeholder="ZIP / postal code" oninput="window._clUpdateLat()">
        </div>
      </div>
      <div id="cl-lat-display" style="font-size:11px;margin-top:4px"></div>
    </div>
    <div class="cl-form-row" style="border-top:1px solid var(--border);padding-top:12px;margin-top:4px">
      <div class="cl-form-row-split" style="margin-bottom:4px">
        <div class="cl-form-col">
          <label style="font-size:11px;color:var(--text-muted)">Height <a href="#" class="cl-bio-unit-toggle" id="cl-height-unit-toggle" data-unit="${heightUnit}" onclick="window._clHeightUnitChanged();return false">${heightUnit}</a></label>
          <input type="number" class="cl-form-input" id="cl-height" value="${escapeHTML(String(heightDisplay))}" step="0.1" placeholder="${heightUnit === 'in' ? 'inches' : 'cm'}" oninput="window._clUpdateBMI()">
          <input type="hidden" id="cl-height-unit" value="${heightUnit}">
        </div>
        <div class="cl-form-col">
          <label style="font-size:11px;color:var(--text-muted)">BMI</label>
          <div class="mc-auto-value" id="cl-bmi-display"></div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
        <a href="#" onclick="window._clGoToHealthMetrics(event)" style="color:var(--text-muted);text-decoration:underline">Log weight, blood pressure &amp; pulse on the dashboard &rarr;</a>
      </div>
    </div>
    <div class="cl-form-row">
      <label class="cl-form-label">mtDNA Haplogroup <span style="font-weight:400;color:var(--text-muted);font-size:11px">(maternal lineage)</span></label>
      <div style="display:flex;align-items:center;gap:8px">
        <select class="cl-form-input" id="cl-haplogroup" style="max-width:160px" onchange="window._clHaplogroupChanged()">
          <option value="">— not set —</option>
          ${window.HAPLOGROUP_LIST ? window.HAPLOGROUP_LIST.map(h => '<option value="' + h + '"' + (state.importedData?.genetics?.mtdna?.haplogroup === h ? ' selected' : '') + '>' + h + '</option>').join('') : ''}
        </select>
        <span id="cl-hg-coupling" style="font-size:12px;color:var(--text-muted)">${state.importedData?.genetics?.mtdna?.coupling?.shortLabel || ''}</span>
      </div>
    </div>
    <div class="cl-form-row">
      <label class="cl-form-label">Tags</label>
      <div class="cl-tags-wrap" id="cl-tags-wrap">
        ${tags.map(t => `<span class="cl-tag-pill">${escapeHTML(t)}<button type="button" class="cl-tag-remove" onclick="window._clRemoveTag(this)">&times;</button></span>`).join('')}
        <input type="text" class="cl-tag-input" id="cl-tag-input" placeholder="Add tag + Enter" onkeydown="window._clTagKeydown(event)">
      </div>
    </div>
    <div class="cl-form-row">
      <label class="cl-form-label">Notes</label>
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
    <div class="cl-form-actions">
      <button type="button" class="cl-form-cancel" onclick="window._clBackToList()">Cancel</button>
      <button type="submit" class="cl-form-save">${p ? 'Save Changes' : 'Create Client'}</button>
    </div>
  </form>`;
  requestAnimationFrame(() => {
    _clUpdateLat();
    _clUpdateBMI();
  });
}

// Close the Edit Client modal and navigate to the dashboard — the anchor in
// the Height & BMI row tells the user weight/BP/pulse live there now.
function _clGoToHealthMetrics(event) {
  if (event) event.preventDefault();
  if (window.closeClientList) window.closeClientList();
  if (window.navigate) window.navigate('dashboard');
  // Scroll to the wearable strip so the user lands on the metric cards.
  requestAnimationFrame(() => {
    document.getElementById('wearable-strip')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ═══════════════════════════════════════════════
// FORM HANDLERS
// ═══════════════════════════════════════════════
function _clSaveForm(e) {
  e.preventDefault();
  const name = (document.getElementById('cl-name')?.value || '').trim();
  if (!name) return;
  const sexBtn = document.querySelector('#cl-sex-toggle .sex-toggle-btn.active');
  const sex = sexBtn ? sexBtn.dataset.sex : null;
  const dob = document.getElementById('cl-dob')?.value || null;
  const country = (document.getElementById('cl-country')?.value || '').trim();
  const zip = (document.getElementById('cl-zip')?.value || '').trim();
  const notes = (document.getElementById('cl-notes')?.value || '').trim();
  const statusRadio = document.querySelector('input[name="cl-status"]:checked');
  const status = statusRadio ? statusRadio.value : 'active';

  // Collect tags from pills
  const tags = [];
  document.querySelectorAll('#cl-tags-wrap .cl-tag-pill').forEach(pill => {
    const text = pill.firstChild.textContent.trim();
    if (text && !tags.includes(text)) tags.push(text);
  });

  // Height — stored in cm
  const heightRaw = parseFloat(document.getElementById('cl-height')?.value);
  const heightUnit = document.getElementById('cl-height-unit')?.value || 'cm';
  const height = heightRaw ? (heightUnit === 'in' ? Math.round(heightRaw * 2.54 * 10) / 10 : heightRaw) : null;

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
    window.renderProfileButton();
    window.showNotification(`"${name}" updated`, 'info');
  } else {
    // Create new profile
    const id = createProfile(name, { sex, dob, location: { country, zip }, tags, notes, status, height, heightUnit, ...avatarUpdate });
    switchProfile(id);
    window.renderProfileButton();
    window.showNotification(`"${name}" created`, 'success');
  }
  _editingId = null;
  renderClientList();
}

async function _clHaplogroupChanged() {
  const sel = document.getElementById('cl-haplogroup');
  const label = document.getElementById('cl-hg-coupling');
  if (!sel) return;
  const hg = sel.value;
  if (!hg) {
    if (label) label.textContent = '';
    return;
  }
  await window.setManualHaplogroup(hg);
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
      container.innerHTML = `<img class="cl-avatar-preview-img" id="cl-avatar-img" src="${escapeAttr(dataUrl)}" alt=""><span class="cl-avatar-edit-icon">&#128247;</span>`;
    }
    // Add remove button if not present
    if (!document.querySelector('.cl-avatar-remove')) {
      const row = document.querySelector('.cl-avatar-row');
      if (row) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cl-avatar-remove';
        btn.textContent = 'Remove photo';
        btn.onclick = () => window._clRemoveAvatar();
        row.appendChild(btn);
      }
    }
  } catch {
    window.showNotification('Could not load image', 'error');
  }
  input.value = '';
}

function _clRemoveAvatar() {
  _pendingAvatar = null;
  const container = document.querySelector('.cl-avatar-picker');
  if (container) {
    const color = getAvatarColor(_editingId || 'new');
    const nameInput = document.getElementById('cl-name');
    const initial = ((nameInput?.value || '?')[0]).toUpperCase();
    container.innerHTML = `<span class="cl-avatar-preview-initial" id="cl-avatar-img" style="background:${color}">${escapeHTML(initial)}</span><span class="cl-avatar-edit-icon">&#128247;</span>`;
  }
  const removeBtn = document.querySelector('.cl-avatar-remove');
  if (removeBtn) removeBtn.remove();
}

function _clSetSex(sex) {
  document.querySelectorAll('#cl-sex-toggle .sex-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sex === sex);
  });
}

function _clShowLat(el, lat, suffix) {
  var band = latitudeToBand(lat);
  el.style.color = 'var(--green)';
  el.textContent = '\u2713 ' + Math.abs(Math.round(lat)) + '\u00b0' + (lat >= 0 ? 'N' : 'S') + ' \u2014 ' + LATITUDE_BANDS[band] + (suffix || '');
}

var _clLatTimer = null;
function _clUpdateLat() {
  const country = (document.getElementById('cl-country')?.value || '').trim();
  const zip = (document.getElementById('cl-zip')?.value || '').trim();
  const el = document.getElementById('cl-lat-display');
  if (!el) return;
  if (!country) { el.textContent = ''; return; }

  var cache = getLocationCache();
  var cacheKey = (country + '|' + zip).toLowerCase();
  var cached = cache[cacheKey];

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
      el.textContent = '\u2713 ' + bandLabel + (window.hasAIProvider() ? ' \u2014 refining\u2026' : '');
    } else if (window.hasAIProvider()) {
      el.style.color = 'var(--text-muted)';
      el.textContent = 'Detecting\u2026';
    } else {
      el.style.color = 'var(--text-muted)';
      el.textContent = 'Country not recognized \u2014 try the full name';
    }
  }

  // Debounced AI refinement
  if (_clLatTimer) clearTimeout(_clLatTimer);
  if (window.hasAIProvider()) {
    _clLatTimer = setTimeout(function() {
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
  pill.innerHTML = `${escapeHTML(val)}<button type="button" class="cl-tag-remove" onclick="window._clRemoveTag(this)">&times;</button>`;
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
  window.renderProfileButton();
  closeClientList();
}

function _clSearch(val) {
  _search = val;
  renderClientList();
  // Restore focus + cursor position
  requestAnimationFrame(() => {
    const input = document.getElementById('cl-search');
    if (input) { input.focus(); input.setSelectionRange(val.length, val.length); }
  });
}

function _clSort(val) { _sort = val; renderClientList(); }
function _clStatusFilter(val) { _statusFilter = val; renderClientList(); }
function _clTagFilter(val) { _tagFilter = (_tagFilter === val) ? '' : val; renderClientList(); }

function _clToggleMenu(e, id) {
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
  const eid = escapeAttr(id);
  menu.innerHTML =
    (p.pinned
      ? `<div class="cl-menu-item" onclick="window._clUnpin('${eid}')">Unpin</div>`
      : `<div class="cl-menu-item" onclick="window._clPin('${eid}')">Pin</div>`) +
    (p.status === 'flagged'
      ? `<div class="cl-menu-item" onclick="window._clUnflag('${eid}')">Unflag</div>`
      : `<div class="cl-menu-item" onclick="window._clFlag('${eid}')">Flag</div>`) +
    `<div class="cl-menu-sep"></div>` +
    `<div class="cl-menu-item" onclick="window._clExport('${eid}')">Export</div>` +
    `<div class="cl-menu-item" onclick="window._clExportChat('${eid}')">Export with Chat</div>` +
    `<div class="cl-menu-sep"></div>` +
    (p.status === 'archived'
      ? `<div class="cl-menu-item" onclick="window._clUnarchive('${eid}')">Unarchive</div>`
      : `<div class="cl-menu-item" onclick="window._clArchive('${eid}')">Archive</div>`) +
    `<div class="cl-menu-item cl-menu-danger" onclick="window._clDelete('${eid}')">Delete</div>`;
  // Position relative to the modal (absolute positioned child)
  const btn = e.currentTarget;
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

function _clPin(id) { updateProfileMeta(id, { pinned: true }); renderClientList(); }
function _clUnpin(id) { updateProfileMeta(id, { pinned: false }); renderClientList(); }
function _clFlag(id) { updateProfileMeta(id, { status: 'flagged' }); renderClientList(); window.renderProfileButton(); }
function _clUnflag(id) { updateProfileMeta(id, { status: 'active' }); renderClientList(); window.renderProfileButton(); }
function _clArchive(id) { updateProfileMeta(id, { status: 'archived' }); renderClientList(); window.renderProfileButton(); }
function _clUnarchive(id) { updateProfileMeta(id, { status: 'active' }); renderClientList(); window.renderProfileButton(); }
function _closeMenus() { const m = document.getElementById('cl-active-menu'); if (m) m.classList.remove('show'); }
function _clExport(id) { _closeMenus(); window.exportClientJSON(id); }
function _clExportChat(id) { _closeMenus(); window.exportClientJSON(id, true); }
function _clDelete(id) { _closeMenus(); deleteProfile(id, () => renderClientList()); }

// Close context menus on click outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.cl-row-menu-btn')) _closeMenus();
});

function _clUpdateBMI() {
  const el = document.getElementById('cl-bmi-display');
  if (!el) return;
  const heightRaw = parseFloat(document.getElementById('cl-height')?.value);
  const heightUnit = document.getElementById('cl-height-unit')?.value || 'cm';
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

function _clHeightUnitChanged() {
  const input = document.getElementById('cl-height');
  const hidden = document.getElementById('cl-height-unit');
  const toggle = document.getElementById('cl-height-unit-toggle');
  if (!input || !hidden || !toggle) return;
  const current = hidden.value;
  const next = current === 'cm' ? 'in' : 'cm';
  const val = parseFloat(input.value);
  if (val) {
    input.value = next === 'in' ? (val / 2.54).toFixed(1) : (val * 2.54).toFixed(1);
  }
  input.placeholder = next === 'in' ? 'inches' : 'cm';
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
function openProfileLocationEditor() {
  // Close any other modal that might be on top first (marker modal, etc.)
  // so the client-list overlay isn't sitting behind it.
  const otherOverlay = document.getElementById('modal-overlay');
  if (otherOverlay) otherOverlay.classList.remove('show');
  openClientList();
  const id = state?.currentProfile;
  if (id) openClientForm(id);
  // Focus the country input after the form mounts.
  setTimeout(() => {
    const el = document.getElementById('cl-country');
    if (el) { el.focus(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }, 80);
}

Object.assign(window, {
  openClientList, closeClientList, openClientForm, openProfileLocationEditor,
  _clSearch, _clSort, _clStatusFilter, _clTagFilter, _clSelect,
  _clSaveForm, _clSetSex, _clUpdateLat, _clTagKeydown, _clRemoveTag, _clBackToList,
  _clAvatarChanged, _clRemoveAvatar, _clHaplogroupChanged,
  _clToggleMenu, _clPin, _clUnpin, _clFlag, _clUnflag, _clArchive, _clUnarchive, _clExport, _clExportChat, _clDelete,
  _clUpdateBMI, _clHeightUnitChanged, _clGoToHealthMetrics,
});
