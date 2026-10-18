import {tsStateStyles} from './ts-state-ui-inline-style-map.generated.js';
// client-list-form.js — Create/edit form owner for the Client List modal

import { state } from './state.js';
import {projectClientFormAvatar,projectClientFormTag,projectClientListForm} from './client-list-form-presentation.js';
import {renderClientFormAvatar,renderClientFormTagBody,renderClientListForm} from './client-list-form-rendering.js';
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
import { isOfficialGetbasedHost } from './url-safety.js';
import {
  getClientHaplogroupList,
  navigateClientListRoute,
  refreshClientProfileButton,
  setClientManualHaplogroup,
  showClientListNotification,
} from './client-list-runtime.js';

interface ClientListFormCalls { closeClientList: () => unknown; renderClientList: () => unknown }
export type ClientListFormSnapshot = { [Key in keyof ClientListFormCalls]: unknown };
interface CachedLatitudeReader { lat?: unknown; latitude?: unknown }

const clientListFormRuntime: ClientListFormCalls = {
  closeClientList: () => {},
  renderClientList: () => {},
};

export function configureClientListFormRuntime(runtime: unknown = {}): ClientListFormSnapshot {
  const previous = { ...clientListFormRuntime };
  Object.assign(clientListFormRuntime, runtime);
  return previous;
}

let editingId: string | null = null;
let pendingAvatar: string | null | undefined;
let latitudeTimer: ReturnType<typeof setTimeout> | null = null;

export function resetClientListFormState() {
  editingId = null;
  pendingAvatar = undefined;
}

function _clInput(id: string) {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el : null;
}

function _clTextarea(id: string) {
  const el = document.getElementById(id);
  return el instanceof HTMLTextAreaElement ? el : null;
}

function _clSelectElement(id: string) {
  const el = document.getElementById(id);
  return el instanceof HTMLSelectElement ? el : null;
}

function _clTagText(pill: Element) {
  return Array.from(pill.childNodes)
    .filter(node => node.nodeType === 3)
    .map(node => node.textContent || '')
    .join('').trim();
}

function _resizeAvatar(file: File) {
  return new Promise<string>((resolve, reject) => {
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

function _isSafeAvatarSrc(src: unknown) {
  return typeof src === 'string' && src.startsWith('data:image/');
}

export function openClientForm(profileId?: string) {
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
  const avatarInitial = (name || '?')[0]!.toUpperCase();
  const avatarPreview = projectClientFormAvatar(avatar, !!(avatar && _isSafeAvatarSrc(avatar)), avatarColor, avatarInitial);

  modal.innerHTML = renderClientListForm(projectClientListForm({
    editing:!!profile, avatar:avatarPreview, removeAvatar:!!avatar,
    readCount:()=>profile ? profile.name || 'Profile' : 'Create a local profile',
    name, sex, dob, country, zip, tags, notes, status, heightUnit, heightDisplay,
    officialHost:isOfficialGetbasedHost, readHaplogroups:getClientHaplogroupList,
    readSelectedHaplogroup:()=>state.importedData?.genetics?.mtdna?.haplogroup,
    readCouplingLabel:()=>state.importedData?.genetics?.mtdna?.coupling?.shortLabel,
  }));
  requestAnimationFrame(() => {
    _clUpdateLat();
    _clUpdateBMI();
  });
}

function _clGoToHealthMetrics(event: Event) {
  event.preventDefault();
  clientListFormRuntime.closeClientList();
  navigateClientListRoute('dashboard');
  requestAnimationFrame(() => {
    document.getElementById('wearable-strip')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function _clSaveForm(event: Event) {
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

  const tags: string[] = [];
  document.querySelectorAll('#cl-tags-wrap .cl-tag-pill').forEach(pill => {
    const text = _clTagText(pill);
    if (text && !tags.includes(text)) tags.push(text);
  });

  const heightRaw = parseFloat(_clInput('cl-height')?.value || '');
  const heightUnit = _clInput('cl-height-unit')?.value || 'cm';
  const height = heightRaw ? (heightUnit === 'in' ? Math.round(heightRaw * 2.54 * 10) / 10 : Math.round(heightRaw)) : null;

  const avatarUpdate: { avatar?: string | null } = {};
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

async function _clAvatarChanged(input: HTMLInputElement) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const dataUrl = await _resizeAvatar(file);
    pendingAvatar = dataUrl;
    const container = document.querySelector('.cl-avatar-picker');
    if (container) {
      container.innerHTML = renderClientFormAvatar(projectClientFormAvatar(dataUrl, true, '', ''));
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
    const initial = ((nameInput?.value || '?')[0]!).toUpperCase();
    container.innerHTML = renderClientFormAvatar(projectClientFormAvatar('', false, color, initial));
  }
  document.querySelector('.cl-avatar-remove')?.remove();
}

function _clSetSex(sex: string) {
  document.querySelectorAll('#cl-sex-toggle .sex-toggle-btn').forEach(button => {
    if (button instanceof HTMLElement) button.classList.toggle('active', button.dataset.sex === sex);
  });
}

function _clShowLat(element: HTMLElement, latitude: number, suffix: unknown) {
  const band = latitudeToBand(latitude);
  element.style.color = tsStateStyles.successColor;
  element.textContent = '\u2713 ' + Math.abs(Math.round(latitude)) + '\u00b0' + (latitude >= 0 ? 'N' : 'S') + ' \u2014 ' + LATITUDE_BANDS[band] + (suffix || '');
}

function _clCachedLatitude(value: unknown) {
  if (Number.isFinite(value)) return Number(value);
  const latitude = Number((value as CachedLatitudeReader | null | undefined)?.lat ?? (value as CachedLatitudeReader | null | undefined)?.latitude);
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
  if (isOfficialGetbasedHost()) {
    const bandLabel = getLatitudeFromLocation(country, '');
    if (bandLabel) {
      element.style.color = tsStateStyles.successColor;
      element.textContent = `✓ ${bandLabel}${zip ? ' — postal code stays local' : ''}`;
    } else {
      element.style.color = tsStateStyles.mutedColor;
      element.textContent = 'Country not recognized — try the full name';
    }
    return;
  }
  if (countryOnly !== null) {
    _clShowLat(element, countryOnly, ' \u2014 refining with ZIP\u2026');
  } else {
    const bandLabel = getLatitudeFromLocation(country, zip);
    if (bandLabel) {
      element.style.color = tsStateStyles.successColor;
      element.textContent = '\u2713 ' + bandLabel + (zip ? ' \u2014 resolving postal area\u2026' : '');
    } else if (zip) {
      element.style.color = tsStateStyles.mutedColor;
      element.textContent = 'Resolving postal area\u2026';
    } else {
      element.style.color = tsStateStyles.mutedColor;
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

function _clTagKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const value = input.value.trim();
  if (!value) return;
  const existing: string[] = [];
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
  pill.innerHTML = renderClientFormTagBody(projectClientFormTag(value));
  wrap.insertBefore(pill, input);
  input.value = '';
}

function _clRemoveTag(button: Element) {
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

function _clFormatHeightInput(heightCm: number, unit: string) {
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

function _clickFileInput(id: string) {
  const input = document.getElementById(id);
  if (input instanceof HTMLInputElement) input.click();
}

export function handleClientFormClick(action: string, actionElement: HTMLElement, event: Event) {
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

export function handleClientFormInput(action: string) {
  if (action === 'update-lat') _clUpdateLat();
  else if (action === 'update-bmi') _clUpdateBMI();
  else return false;
  return true;
}

export function handleClientFormChange(action: string, element: HTMLElement) {
  if (action === 'avatar-changed' && element instanceof HTMLInputElement) {
    _clAvatarChanged(element);
  } else if (action === 'haplogroup-changed') {
    _clHaplogroupChanged();
  } else {
    return false;
  }
  return true;
}

export function handleClientFormSubmit(action: string, event: Event) {
  if (action !== 'save-form') return false;
  void _clSaveForm(event);
  return true;
}

export function handleClientFormKeydown(action: string, event: KeyboardEvent) {
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
