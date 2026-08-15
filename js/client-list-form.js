// @ts-check
// client-list-form.js — Create/edit form owner for the Client List modal

import { state } from './state.js';
import { escapeAttr, escapeHTML } from './utils.js';
import {
  createProfile,
  detectLatitudeWithAI,
  getLatitudeFromLocation,
  getLocationCache,
  getProfileHeight,
  getProfiles,
  latitudeToBand,
  switchProfile,
  updateProfileMeta,
} from './profile.js';
import { LATITUDE_BANDS } from './constants.js';
import { getAvatarColor } from './nav.js';
import {
  getClientHaplogroupList,
  navigateClientListRoute,
  refreshClientProfileButton,
  setClientManualHaplogroup,
  showClientListNotification,
} from './client-list-runtime.js';

const FORM_ICONS = Object.freeze({
  arrowLeft: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 4 13 6H8a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V9a3 3 0 0 0-3-3h-.5L14.5 4z"/><circle cx="12" cy="13" r="3"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
});

/**
 * @typedef {{
 *   closeClientList: () => void,
 *   renderClientList: () => void,
 * }} ClientListFormRuntime
 */

/** @type {ClientListFormRuntime} */
const clientListFormRuntime = {
  closeClientList: () => {},
  renderClientList: () => {},
};

/** @param {Partial<ClientListFormRuntime>} [runtime] */
export function configureClientListFormRuntime(runtime = {}) {
  const previous = { ...clientListFormRuntime };
  Object.assign(clientListFormRuntime, runtime);
  return previous;
}

/** @type {string | null} */
let editingId = null;
/** @type {string | null | undefined} */
let pendingAvatar;
/** @type {ReturnType<typeof setTimeout> | null} */
let latitudeTimer = null;

export function resetClientListFormState() {
  editingId = null;
  pendingAvatar = undefined;
}

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

/** @param {Element} pill */
function _clTagText(pill) {
  return pill.firstChild?.textContent?.trim() || '';
}

/** @param {File} file */
function _resizeAvatar(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 80;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context is unavailable'));
        return;
      }
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

function _isSafeAvatarSrc(src) {
  return typeof src === 'string' && src.startsWith('data:image/');
}

/** @param {string} [profileId] */
export function openClientForm(profileId) {
  editingId = profileId || null;
  pendingAvatar = undefined;
  const modal = document.getElementById('client-list-modal');
  if (!modal) return;
  const profiles = getProfiles();
  const profile = profileId ? profiles.find(candidate => candidate.id === profileId) : null;

  const name = profile ? profile.name : '';
  const sex = profile ? (profile.sex || '') : '';
  const dob = profile ? (profile.dob || '') : '';
  const country = profile ? ((profile.location || {}).country || '') : '';
  const zip = profile ? ((profile.location || {}).zip || '') : '';
  const tags = profile ? (profile.tags || []) : [];
  const notes = profile ? (profile.notes || '') : '';
  const status = profile ? (profile.status || 'active') : 'active';
  const avatar = profile ? (profile.avatar || '') : '';
  const heightData = profile ? getProfileHeight(profile.id) : { height: null, unit: 'cm' };
  const heightUnit = heightData.unit || 'cm';
  const heightValue = heightData.height == null || heightData.height === '' ? null : Number(heightData.height);
  const heightDisplay = heightValue ? _clFormatHeightInput(heightValue, heightUnit) : '';

  const avatarColor = getAvatarColor(profile ? profile.id : 'new');
  const avatarInitial = (name || '?')[0].toUpperCase();
  const avatarPreview = avatar && _isSafeAvatarSrc(avatar)
    ? `<img class="cl-avatar-preview-img" id="cl-avatar-img" src="${escapeAttr(avatar)}" alt="">`
    : `<span class="cl-avatar-preview-initial" id="cl-avatar-img" style="background:${avatarColor}">${escapeHTML(avatarInitial)}</span>`;

  modal.innerHTML = `<div class="cl-header cl-form-header">
    <div class="cl-header-left">
      <button type="button" class="cl-back-btn cl-icon-btn" ${_clActionAttrs('back-to-list')} aria-label="Back to clients">${FORM_ICONS.arrowLeft}</button>
      <div>
        <h2 class="cl-title">${profile ? 'Edit Client' : 'New Client'}</h2>
        <div class="cl-count">${profile ? escapeHTML(profile.name || 'Profile') : 'Create a local profile'}</div>
      </div>
    </div>
    <div class="cl-header-right">
      <button type="button" class="modal-close cl-icon-btn" ${_clActionAttrs('close')} aria-label="Close">${FORM_ICONS.close}</button>
    </div>
  </div>
  <form class="cl-form" data-cl-submit-action="save-form">
    <div class="cl-form-body">
      <section class="cl-form-section">
        <div class="cl-section-title">Profile</div>
        <div class="cl-form-row cl-avatar-row">
          <div class="cl-avatar-picker" ${_clActionAttrs('choose-avatar')} ${_clKeyAttrs('choose-avatar')} role="button" tabindex="0">
            ${avatarPreview}
            <span class="cl-avatar-edit-icon">${FORM_ICONS.camera}</span>
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
          <label class="cl-form-label" for="cl-country">Home location <span class="cl-label-detail">circadian, seasonal, and regional context</span></label>
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
          <div class="cl-form-help">Postal codes are optional. When entered, the getbased proxy asks OpenStreetMap for the postal area and returns only privacy-rounded coordinates (~11 km); current phone location remains a separate opt-in. © OpenStreetMap contributors.</div>
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
          ${profile ? `<div class="cl-form-row cl-form-col">
            <label class="cl-form-label">BMI</label>
            <div class="mc-auto-value cl-bmi-display" id="cl-bmi-display"></div>
          </div>` : ''}
        </div>
        <div class="cl-health-note">
          ${profile
            ? `<a href="#" class="cl-health-link" ${_clActionAttrs('health-metrics')}>Log weight, blood pressure and pulse on the dashboard</a>`
            : 'Log weight, blood pressure and pulse on the dashboard after creating the client.'}
        </div>
        <div class="cl-form-row">
          <label class="cl-form-label" for="cl-haplogroup">mtDNA Haplogroup <span class="cl-label-detail">maternal lineage</span></label>
          <div class="cl-haplogroup-row">
            <select class="cl-form-input cl-haplogroup-select" id="cl-haplogroup" ${_clChangeAttrs('haplogroup-changed')}>
              <option value="">Not set</option>
              ${getClientHaplogroupList().map(haplogroup => '<option value="' + haplogroup + '"' + (state.importedData?.genetics?.mtdna?.haplogroup === haplogroup ? ' selected' : '') + '>' + haplogroup + '</option>').join('')}
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
            ${tags.map(tag => `<span class="cl-tag-pill">${escapeHTML(tag)}<button type="button" class="cl-tag-remove" ${_clActionAttrs('remove-tag')} aria-label="Remove tag">${FORM_ICONS.close}</button></span>`).join('')}
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
      <button type="submit" class="cl-form-save">${profile ? 'Save Changes' : 'Create Client'}</button>
    </div>
  </form>`;
  requestAnimationFrame(() => {
    _clUpdateLat();
    _clUpdateBMI();
  });
}

/** @param {Event} event */
function _clGoToHealthMetrics(event) {
  event.preventDefault();
  clientListFormRuntime.closeClientList();
  navigateClientListRoute('dashboard');
  requestAnimationFrame(() => {
    document.getElementById('wearable-strip')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/** @param {SubmitEvent | Event} event */
async function _clSaveForm(event) {
  event.preventDefault();
  const name = (_clInput('cl-name')?.value || '').trim();
  if (!name) return;
  const sexButton = document.querySelector('#cl-sex-toggle .sex-toggle-btn.active');
  const sex = sexButton instanceof HTMLElement ? sexButton.dataset.sex || null : null;
  const dob = _clInput('cl-dob')?.value || null;
  const country = (_clInput('cl-country')?.value || '').trim();
  const zip = (_clInput('cl-zip')?.value || '').trim();
  const notes = (_clTextarea('cl-notes')?.value || '').trim();
  const statusRadio = document.querySelector('input[name="cl-status"]:checked');
  const status = statusRadio instanceof HTMLInputElement ? statusRadio.value : 'active';

  const tags = [];
  document.querySelectorAll('#cl-tags-wrap .cl-tag-pill').forEach(pill => {
    const text = _clTagText(pill);
    if (text && !tags.includes(text)) tags.push(text);
  });

  const heightRaw = parseFloat(_clInput('cl-height')?.value || '');
  const heightUnit = _clInput('cl-height-unit')?.value || 'cm';
  const height = heightRaw ? (heightUnit === 'in' ? Math.round(heightRaw * 2.54 * 10) / 10 : Math.round(heightRaw)) : null;

  const avatarUpdate = {};
  if (pendingAvatar !== undefined) avatarUpdate.avatar = pendingAvatar;

  try {
    if (editingId) {
      const updated = await updateProfileMeta(editingId, { name, sex, dob, location: { country, zip }, tags, notes, status, height, heightUnit, ...avatarUpdate });
      if (!updated) return;
      if (editingId === state.currentProfile) {
        if (sex !== undefined) state.profileSex = sex;
        if (dob !== undefined) state.profileDob = dob;
      }
      await refreshClientProfileButton();
      showClientListNotification(`"${name}" updated`, 'info');
    } else {
      const id = await createProfile(name, { sex, dob, location: { country, zip }, tags, notes, status, height, heightUnit, ...avatarUpdate });
      await switchProfile(id);
      await refreshClientProfileButton();
      showClientListNotification(`"${name}" created`, 'success');
    }
    editingId = null;
    clientListFormRuntime.renderClientList();
  } catch {
    // The profile persistence boundary reports the actionable storage error.
    // Keep the populated form open so the user can retry without data loss.
  }
}

async function _clHaplogroupChanged() {
  const select = _clSelectElement('cl-haplogroup');
  const label = document.getElementById('cl-hg-coupling');
  if (!select) return;
  const haplogroup = select.value;
  if (!haplogroup) {
    if (label) label.textContent = '';
    return;
  }
  await setClientManualHaplogroup(haplogroup);
  const mitochondrial = state.importedData?.genetics?.mtdna;
  if (label) label.textContent = mitochondrial?.coupling?.shortLabel || '';
}

/** @param {HTMLInputElement} input */
async function _clAvatarChanged(input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await _resizeAvatar(file);
    pendingAvatar = dataUrl;
    const container = document.querySelector('.cl-avatar-picker');
    if (container) {
      container.innerHTML = `<img class="cl-avatar-preview-img" id="cl-avatar-img" src="${escapeAttr(dataUrl)}" alt=""><span class="cl-avatar-edit-icon">${FORM_ICONS.camera}</span>`;
    }
    if (!document.querySelector('.cl-avatar-remove')) {
      const row = document.querySelector('.cl-avatar-row');
      if (row) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cl-avatar-remove';
        button.textContent = 'Remove photo';
        button.setAttribute('data-cl-action', 'remove-avatar');
        row.appendChild(button);
      }
    }
  } catch {
    showClientListNotification('Could not load image', 'error');
  }
  input.value = '';
}

function _clRemoveAvatar() {
  pendingAvatar = null;
  const container = document.querySelector('.cl-avatar-picker');
  if (container) {
    const color = getAvatarColor(editingId || 'new');
    const nameInput = _clInput('cl-name');
    const initial = ((nameInput?.value || '?')[0]).toUpperCase();
    container.innerHTML = `<span class="cl-avatar-preview-initial" id="cl-avatar-img" style="background:${color}">${escapeHTML(initial)}</span><span class="cl-avatar-edit-icon">${FORM_ICONS.camera}</span>`;
  }
  document.querySelector('.cl-avatar-remove')?.remove();
}

/** @param {string} sex */
function _clSetSex(sex) {
  document.querySelectorAll('#cl-sex-toggle .sex-toggle-btn').forEach(button => {
    if (button instanceof HTMLElement) button.classList.toggle('active', button.dataset.sex === sex);
  });
}

/** @param {HTMLElement} element */
function _clShowLat(element, latitude, suffix) {
  const band = latitudeToBand(latitude);
  element.style.color = 'var(--green)';
  element.textContent = '\u2713 ' + Math.abs(Math.round(latitude)) + '\u00b0' + (latitude >= 0 ? 'N' : 'S') + ' \u2014 ' + LATITUDE_BANDS[band] + (suffix || '');
}

function _clCachedLatitude(value) {
  if (Number.isFinite(value)) return Number(value);
  const latitude = Number(value?.lat ?? value?.latitude);
  return Number.isFinite(latitude) ? latitude : null;
}

function _clUpdateLat() {
  const country = (_clInput('cl-country')?.value || '').trim();
  const zip = (_clInput('cl-zip')?.value || '').trim();
  const element = document.getElementById('cl-lat-display');
  if (!element) return;
  if (!country) {
    element.textContent = '';
    return;
  }

  const cache = getLocationCache();
  const cacheKey = (country + '|' + zip).toLowerCase();
  const cached = cache[cacheKey];
  const cachedLatitude = _clCachedLatitude(cached);

  if (cachedLatitude !== null) {
    const countryLatitude = zip ? _clCachedLatitude(cache[(country + '|').toLowerCase()]) : null;
    let zipSuffix = '';
    if (zip) zipSuffix = countryLatitude !== null && Math.round(cachedLatitude) === Math.round(countryLatitude) ? ' (home area)' : ' (postal area)';
    _clShowLat(element, cachedLatitude, zipSuffix);
    return;
  }

  const countryOnly = zip ? _clCachedLatitude(cache[(country + '|').toLowerCase()]) : null;
  if (countryOnly !== null) {
    _clShowLat(element, countryOnly, ' \u2014 refining with ZIP\u2026');
  } else {
    const bandLabel = getLatitudeFromLocation(country, zip);
    if (bandLabel) {
      element.style.color = 'var(--green)';
      element.textContent = '\u2713 ' + bandLabel + (zip ? ' \u2014 resolving postal area\u2026' : '');
    } else if (zip) {
      element.style.color = 'var(--text-muted)';
      element.textContent = 'Resolving postal area\u2026';
    } else {
      element.style.color = 'var(--text-muted)';
      element.textContent = 'Country not recognized \u2014 try the full name';
    }
  }

  if (latitudeTimer) clearTimeout(latitudeTimer);
  latitudeTimer = setTimeout(() => {
    if (!zip) return;
    detectLatitudeWithAI(country, zip).then(() => {
      const freshCache = getLocationCache();
      const updated = _clCachedLatitude(freshCache[(country + '|' + zip).toLowerCase()]);
      if (updated === null) return;
      const display = document.getElementById('cl-lat-display');
      if (display) _clShowLat(display, updated, ' (postal area)');
    });
  }, 1500);
}

/** @param {KeyboardEvent} event */
function _clTagKeydown(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const value = input.value.trim();
  if (!value) return;
  const existing = [];
  document.querySelectorAll('#cl-tags-wrap .cl-tag-pill').forEach(pill => {
    existing.push(_clTagText(pill).toLowerCase());
  });
  if (existing.includes(value.toLowerCase())) {
    input.value = '';
    return;
  }
  const wrap = document.getElementById('cl-tags-wrap');
  if (!wrap) return;
  const pill = document.createElement('span');
  pill.className = 'cl-tag-pill';
  pill.innerHTML = `${escapeHTML(value)}<button type="button" class="cl-tag-remove" ${_clActionAttrs('remove-tag')} aria-label="Remove tag">${FORM_ICONS.close}</button>`;
  wrap.insertBefore(pill, input);
  input.value = '';
}

/** @param {Element} button */
function _clRemoveTag(button) {
  button.parentElement?.remove();
}

function _clBackToList() {
  editingId = null;
  clientListFormRuntime.renderClientList();
}

function _clUpdateBMI() {
  const element = document.getElementById('cl-bmi-display');
  if (!element) return;
  const heightRaw = parseFloat(_clInput('cl-height')?.value || '');
  const heightUnit = _clInput('cl-height-unit')?.value || 'cm';
  const heightCm = heightRaw ? (heightUnit === 'in' ? heightRaw * 2.54 : heightRaw) : null;
  const weightKg = state.importedData?.wearableSummary?.metrics?.weight?.latest ?? null;

  if (heightCm && weightKg) {
    const heightMeters = heightCm / 100;
    const bmi = weightKg / (heightMeters * heightMeters);
    let category = '> 30';
    if (bmi < 18.5) category = '< 18.5';
    else if (bmi < 25) category = 'normal';
    else if (bmi < 30) category = '25–30';
    element.className = 'mc-auto-value';
    element.textContent = `${bmi.toFixed(1)} (${category})`;
  } else {
    element.className = 'mc-auto-value mc-auto-pending';
    element.textContent = heightCm ? 'add weight' : weightKg ? 'add height' : '--';
  }
}

/**
 * @param {number} heightCm
 * @param {string} unit
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
  const value = parseFloat(input.value);
  if (value) {
    const heightCm = current === 'in' ? value * 2.54 : value;
    input.value = _clFormatHeightInput(heightCm, next);
  }
  input.placeholder = next === 'in' ? 'inches' : 'cm';
  input.step = next === 'in' ? '0.1' : '1';
  hidden.value = next;
  toggle.textContent = next;
  toggle.dataset.unit = next;
  _clUpdateBMI();
}

/** @param {string} id */
function _clickFileInput(id) {
  const input = document.getElementById(id);
  if (input instanceof HTMLInputElement) input.click();
}

/**
 * @param {string} action
 * @param {HTMLElement} actionElement
 * @param {Event} event
 */
export function handleClientFormClick(action, actionElement, event) {
  if (action === 'back-to-list') _clBackToList();
  else if (action === 'choose-avatar') _clickFileInput('cl-avatar-input');
  else if (action === 'remove-avatar') _clRemoveAvatar();
  else if (action === 'set-sex') _clSetSex(actionElement.dataset.clSex || '');
  else if (action === 'remove-tag') _clRemoveTag(actionElement);
  else if (action === 'height-unit') _clHeightUnitChanged();
  else if (action === 'health-metrics') _clGoToHealthMetrics(event);
  else return false;
  return true;
}

/** @param {string} action */
export function handleClientFormInput(action) {
  if (action === 'update-lat') _clUpdateLat();
  else if (action === 'update-bmi') _clUpdateBMI();
  else return false;
  return true;
}

/**
 * @param {string} action
 * @param {HTMLElement} element
 */
export function handleClientFormChange(action, element) {
  if (action === 'avatar-changed' && element instanceof HTMLInputElement) {
    _clAvatarChanged(element);
  } else if (action === 'haplogroup-changed') {
    _clHaplogroupChanged();
  } else {
    return false;
  }
  return true;
}

/**
 * @param {string} action
 * @param {SubmitEvent | Event} event
 */
export function handleClientFormSubmit(action, event) {
  if (action !== 'save-form') return false;
  void _clSaveForm(event);
  return true;
}

/**
 * @param {string} action
 * @param {KeyboardEvent} event
 */
export function handleClientFormKeydown(action, event) {
  if (action === 'tag-input') {
    _clTagKeydown(event);
    return true;
  }
  if (action !== 'choose-avatar') return false;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    _clickFileInput('cl-avatar-input');
  }
  return true;
}
