// @ts-check
// Browser controls for data views, chart layers, and display preferences.

import { state } from './state.js';
import { escapeAttr } from './utils.js';
import { profileStorageKey } from './profile.js';
import { scheduleUtilsAfterNextPaint } from './utils-runtime.js';
import { normalizeUnitProfile } from './unit-profiles.js';

/**
 * @typedef {import('../types/app-state.js').ProfileData} ImportedDataRecord
 * @typedef {{
 *   buildSidebar: null | ((data?: ImportedDataRecord) => void),
 *   navigate: null | ((route?: string, data?: unknown) => void),
 *   showDetailModal: null | ((id: string) => void),
 * }} DataRuntimeDeps
 * @typedef {{
 *   getActiveData: null | (() => any),
 *   invalidateActiveDataCache: null | (() => void),
 * }} DataViewCoreDeps
 */

/** @type {DataRuntimeDeps} */
const dataRuntimeDeps = {
  buildSidebar: null,
  navigate: null,
  showDetailModal: null,
};

/** @type {DataViewCoreDeps} */
const dataViewCoreDeps = {
  getActiveData: null,
  invalidateActiveDataCache: null,
};

/** @param {Partial<DataRuntimeDeps>} [deps] */
export function configureDataRuntimeDeps(deps = {}) {
  const previous = { ...dataRuntimeDeps };
  if (Object.hasOwn(deps, 'buildSidebar') && (deps.buildSidebar === null || typeof deps.buildSidebar === 'function')) {
    dataRuntimeDeps.buildSidebar = deps.buildSidebar;
  }
  if (Object.hasOwn(deps, 'navigate') && (deps.navigate === null || typeof deps.navigate === 'function')) {
    dataRuntimeDeps.navigate = deps.navigate;
  }
  if (Object.hasOwn(deps, 'showDetailModal') && (deps.showDetailModal === null || typeof deps.showDetailModal === 'function')) {
    dataRuntimeDeps.showDetailModal = deps.showDetailModal;
  }
  return previous;
}

/** @param {Partial<DataViewCoreDeps>} [deps] */
export function configureDataViewCoreDependencies(deps = {}) {
  const previous = { ...dataViewCoreDeps };
  if (Object.hasOwn(deps, 'getActiveData')
    && (deps.getActiveData === null || typeof deps.getActiveData === 'function')) {
    dataViewCoreDeps.getActiveData = deps.getActiveData;
  }
  if (Object.hasOwn(deps, 'invalidateActiveDataCache')
    && (deps.invalidateActiveDataCache === null || typeof deps.invalidateActiveDataCache === 'function')) {
    dataViewCoreDeps.invalidateActiveDataCache = deps.invalidateActiveDataCache;
  }
  return previous;
}

function getActiveData() {
  if (typeof dataViewCoreDeps.getActiveData !== 'function') {
    throw new Error('Data view controls require getActiveData');
  }
  return dataViewCoreDeps.getActiveData();
}

function invalidateActiveDataCache() {
  dataViewCoreDeps.invalidateActiveDataCache?.();
}

function navigateDataView(route, data) {
  dataRuntimeDeps.navigate?.(route, data);
}

function buildDataSidebar(data) {
  dataRuntimeDeps.buildSidebar?.(data);
}

const DATA_ACTION_ATTR = 'data-lab-data-action';
const DATA_CHANGE_ATTR = 'data-lab-data-change';
const DATA_RANGE_ATTR = 'data-lab-data-range';
const DATA_ACTION_SELECTOR = `[${DATA_ACTION_ATTR}]`;
const DATA_CHANGE_SELECTOR = `[${DATA_CHANGE_ATTR}]`;
const dataActionDelegateRoots = new WeakSet();

function dataAttrName(name) {
  return String(name).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);
}

function dataControlAttrs(kind, action, attrs = {}) {
  let html = `data-lab-data-${kind}="${escapeAttr(action)}"`;
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    html += ` data-lab-data-${escapeAttr(dataAttrName(name))}="${escapeAttr(String(value))}"`;
  }
  return html;
}

export function dataActionAttrs(action, attrs = {}) {
  return dataControlAttrs('action', action, attrs);
}

export function dataChangeAttrs(action, attrs = {}) {
  return dataControlAttrs('change', action, attrs);
}

function closestDataElement(target, selector) {
  return /** @type {HTMLElement | null} */ (
    target && typeof target.closest === 'function' ? target.closest(selector) : null
  );
}

function rootContains(root, el) {
  return !!(root && typeof root.contains === 'function' && root.contains(el));
}

function containChartLayersClick(event) {
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
}

function handleDataClick(event) {
  const actionEl = closestDataElement(event.target, DATA_ACTION_SELECTOR);
  if (!actionEl || !rootContains(event.currentTarget, actionEl)) return;
  const action = actionEl.getAttribute(DATA_ACTION_ATTR);
  if (action === 'chart-layers-row') {
    containChartLayersClick(event);
    return;
  }
  if (action === 'set-date-range') {
    event.preventDefault();
    setDateRange(actionEl.getAttribute(DATA_RANGE_ATTR) || 'all');
    return;
  }
  if (action === 'toggle-chart-layers') {
    event.preventDefault();
    toggleChartLayersDropdown(event);
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    return;
  }
  if (action === 'switch-range-mode') {
    event.preventDefault();
    switchRangeMode(actionEl.getAttribute(DATA_RANGE_ATTR) || 'optimal');
    return;
  }
}

function handleDataChange(event) {
  const actionEl = closestDataElement(event.target, DATA_CHANGE_SELECTOR);
  if (!actionEl || !rootContains(event.currentTarget, actionEl)) return;
  const action = actionEl.getAttribute(DATA_CHANGE_ATTR);
  const checked = /** @type {{ checked?: boolean }} */ (event.target || {}).checked === true;
  const mode = checked ? 'on' : 'off';
  if (action === 'set-note-overlay') {
    setNoteOverlay(mode);
  } else if (action === 'set-supp-overlay') {
    setSuppOverlay(mode);
  } else if (action === 'set-phase-overlay') {
    setPhaseOverlay(mode);
  }
}

export function installDataActionDelegates(root = typeof document !== 'undefined' ? document : null) {
  if (!root || dataActionDelegateRoots.has(root)) return;
  dataActionDelegateRoots.add(root);
  root.addEventListener('click', handleDataClick);
  root.addEventListener('change', handleDataChange);
}

installDataActionDelegates();

export function renderDateRangeFilter() {
  const ranges = [
    { key: '3m', label: '3M' },
    { key: '6m', label: '6M' },
    { key: '1y', label: '1Y' },
    { key: 'all', label: 'All' }
  ];
  return `<div class="date-range-filter">${ranges.map(r =>
    `<button class="range-btn${state.dateRangeFilter === r.key ? ' active' : ''}" type="button" ${dataActionAttrs('set-date-range', { range: r.key })}>${r.label}</button>`
  ).join('')}</div>`;
}

export function setDateRange(range) {
  state.dateRangeFilter = range;
  buildDataSidebar();
  navigateDataView(state.currentView || 'dashboard');
}

export function renderChartLayersDropdown() {
  const hasNotes = (state.importedData.notes || []).length > 0;
  const hasSupps = (state.importedData.supplements || []).length > 0;
  const hasRecordedDrawPhase = state.importedData.entries?.some(entry => entry.context?.cyclePhase);
  const hasCycle = state.profileSex === 'female'
    && (state.importedData.menstrualCycle?.periods?.length > 0 || hasRecordedDrawPhase);
  if (!hasNotes && !hasSupps && !hasCycle) return '';
  return `<div class="chart-layers-wrapper">
    <button class="view-btn chart-layers-trigger" type="button" aria-haspopup="true" aria-expanded="false" aria-controls="chart-layers-dropdown" ${dataActionAttrs('toggle-chart-layers')}>Layers \u25BE</button>
    <div class="chart-layers-dropdown" id="chart-layers-dropdown" role="menu">
      ${hasNotes ? `<label class="chart-layers-row" ${dataActionAttrs('chart-layers-row')}>
        <input type="checkbox" ${state.noteOverlayMode === 'on' ? 'checked' : ''} ${dataChangeAttrs('set-note-overlay')}>
        <span>\uD83D\uDCDD Notes</span>
      </label>` : ''}
      ${hasSupps ? `<label class="chart-layers-row" ${dataActionAttrs('chart-layers-row')}>
        <input type="checkbox" ${state.suppOverlayMode === 'on' ? 'checked' : ''} ${dataChangeAttrs('set-supp-overlay')}>
        <span>\uD83D\uDC8A Supplements</span>
      </label>` : ''}
      ${hasCycle ? `<label class="chart-layers-row" ${dataActionAttrs('chart-layers-row')}>
        <input type="checkbox" ${state.phaseOverlayMode === 'on' ? 'checked' : ''} ${dataChangeAttrs('set-phase-overlay')}>
        <span>\uD83D\uDD34 Cycle phase at blood draw</span>
      </label>` : ''}
    </div>
  </div>`;
}

function _getActiveNavCategory() {
  const activeNav = /** @type {HTMLElement | null} */ (document.querySelector('.nav-item.active'));
  return activeNav?.dataset.category || 'dashboard';
}

export function toggleChartLayersDropdown(e) {
  // Direct callers still rely on this; delegated clicks add
  // stopImmediatePropagation() at document level after this returns.
  e.stopPropagation();
  const dd = document.getElementById('chart-layers-dropdown');
  if (!dd) return;
  const trigger = /** @type {HTMLButtonElement | null} */ (
    dd.parentElement?.querySelector('.chart-layers-trigger') || null
  );
  const isOpen = dd.classList.contains('open');
  dd.classList.toggle('open', !isOpen);
  if (trigger) trigger.setAttribute('aria-expanded', String(!isOpen));
  if (!isOpen) {
    const close = (ev) => {
      // Allow keyboard close (Escape) without requiring an event target
      if (!ev || !ev.target || !ev.target.closest || !ev.target.closest('.chart-layers-wrapper')) {
        dd.classList.remove('open');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', close);
        document.removeEventListener('keydown', closeOnEsc);
      }
    };
    const closeOnEsc = (ev) => {
      if (ev.key === 'Escape') {
        dd.classList.remove('open');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        if (trigger) trigger.focus();
        document.removeEventListener('click', close);
        document.removeEventListener('keydown', closeOnEsc);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', close);
      document.addEventListener('keydown', closeOnEsc);
    }, 0);
  }
}

export function setSuppOverlay(mode) {
  state.suppOverlayMode = mode === 'off' ? 'off' : 'on';
  localStorage.setItem(profileStorageKey(state.currentProfile, 'suppOverlay'), state.suppOverlayMode);
  const activeCat = _getActiveNavCategory();
  navigateDataView(activeCat);
}

export function setNoteOverlay(mode) {
  state.noteOverlayMode = mode === 'off' ? 'off' : 'on';
  localStorage.setItem(profileStorageKey(state.currentProfile, 'noteOverlay'), state.noteOverlayMode);
  const activeCat = _getActiveNavCategory();
  navigateDataView(activeCat);
}

export function setPhaseOverlay(mode) {
  state.phaseOverlayMode = mode === 'off' ? 'off' : 'on';
  localStorage.setItem(profileStorageKey(state.currentProfile, 'phaseOverlay'), state.phaseOverlayMode);
  const activeCat = _getActiveNavCategory();
  navigateDataView(activeCat);
}

export function destroyAllCharts() {
  for (const c of Object.values(state.chartInstances)) c.destroy();
  state.chartInstances = {};
}

export function switchUnitSystem(system) {
  const unitProfile = normalizeUnitProfile(system);
  invalidateActiveDataCache();
  state.unitSystem = unitProfile;
  localStorage.setItem(profileStorageKey(state.currentProfile, 'units'), unitProfile);
  const openId = state._activeDetailMarkerId;
  const data = getActiveData();
  buildDataSidebar(data);
  updateHeaderDates(data);
  navigateDataView(state.currentView || 'dashboard', data);
  if (openId) dataRuntimeDeps.showDetailModal?.(openId);
}

export function toggleAltUnits(force) {
  const next = (force === true || force === false) ? force : !state.showAltUnits;
  if (next === state.showAltUnits) return;
  state.showAltUnits = next;
  localStorage.setItem(profileStorageKey(state.currentProfile, 'showAltUnits'), next ? 'on' : 'off');
  const openId = state._activeDetailMarkerId;
  if (openId) dataRuntimeDeps.showDetailModal?.(openId);
}

let _rangeModeRefreshToken = 0;

function _captureCategoryCardOrderForRangeRefresh(route) {
  if (typeof document === 'undefined' || !route) return null;
  const grid = document.querySelector('#view-content .charts-grid');
  if (!grid) return null;
  const prefix = `${route}_`;
  const markerKeys = Array.from(grid.querySelectorAll('canvas[id^="chart-"]'))
    .map(canvas => String(canvas.id || '').slice('chart-'.length))
    .filter(id => id.startsWith(prefix))
    .map(id => id.slice(prefix.length))
    .filter(Boolean);
  return markerKeys.length ? { categoryKey: route, markerKeys } : null;
}

function _afterNextPaint(fn) {
  scheduleUtilsAfterNextPaint(fn);
}

export function switchRangeMode(mode) {
  const nextMode = mode === 'reference' ? 'reference' : mode === 'both' ? 'both' : 'optimal';
  if (state.rangeMode === nextMode) return;
  state.rangeMode = nextMode;
  localStorage.setItem(profileStorageKey(state.currentProfile, 'rangeMode'), nextMode);
  updateHeaderRangeToggle();
  const openId = state._activeDetailMarkerId;
  const preservedOrder = _captureCategoryCardOrderForRangeRefresh(state.currentView);
  if (preservedOrder) state._preserveCategoryCardOrder = preservedOrder;
  else delete state._preserveCategoryCardOrder;
  const token = ++_rangeModeRefreshToken;
  _afterNextPaint(() => {
    if (token !== _rangeModeRefreshToken || state.rangeMode !== nextMode) return;
    const data = getActiveData();
    buildDataSidebar(data);
    navigateDataView(state.currentView || 'dashboard', data);
    if (openId && state._activeDetailMarkerId === openId) {
      dataRuntimeDeps.showDetailModal?.(openId);
    }
  });
}

export function updateHeaderDates(data) {
  if (!data) data = getActiveData();
  const el = document.getElementById("header-dates");
  if (el) {
    if (data.dateLabels.length > 0) {
      const labels = data.dateLabels;
      const dateText = labels.length === 1 ? labels[0] : `${labels[0]} – ${labels[labels.length - 1]}`;
      el.innerHTML = `<span class="label">Dates:</span> ${dateText}`;
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  }
}

export function updateHeaderRangeToggle() {
  const el = document.getElementById('header-range-toggle');
  if (!el) return;
  const modes = ['optimal', 'reference', 'both'];
  const buttons = /** @type {HTMLButtonElement[]} */ (
    Array.from(el.querySelectorAll('.range-toggle-btn'))
  );
  const canPatch = buttons.length === modes.length && modes.every(m => buttons.some(btn => btn.dataset.range === m));
  if (!canPatch) {
    el.innerHTML = modes.map(m =>
      `<button class="range-toggle-btn${state.rangeMode === m ? ' active' : ''}" type="button" data-range="${m}" aria-pressed="${state.rangeMode === m ? 'true' : 'false'}" ${dataActionAttrs('switch-range-mode', { range: m })}>${m.charAt(0).toUpperCase() + m.slice(1)}</button>`
    ).join('');
    return;
  }
  for (const btn of buttons) {
    const active = btn.dataset.range === state.rangeMode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}
