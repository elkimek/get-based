import type { ProfileData as ImportedDataRecord } from '../types/app-state.js';
import type { ActiveData } from './data-view-types.js';
import { configureValidRuntimeCallbacks } from './runtime-callbacks.js';
// Browser controls for data views, chart layers, and display preferences.

import { state } from './state.js';
import { escapeAttr } from './utils.js';
import { profileStorageKey } from './profile.js';
import { scheduleUtilsAfterNextPaint } from './utils-runtime.js';
import { normalizeUnitProfile } from './unit-profiles.js';

export interface DataRuntimeDeps {
  buildSidebar: ((data?: ImportedDataRecord | ActiveData) => unknown) | null;
  navigate: ((route?: string, data?: unknown) => unknown) | null;
  showDetailModal: ((id: string) => unknown) | null;
}
export interface DataViewCoreDeps {
  getActiveData: (() => ActiveData) | null;
  invalidateActiveDataCache: (() => void) | null;
}

const dataRuntimeDeps: DataRuntimeDeps = {
  buildSidebar: null,
  navigate: null,
  showDetailModal: null,
};

const dataViewCoreDeps: DataViewCoreDeps = {
  getActiveData: null,
  invalidateActiveDataCache: null,
};

export function configureDataRuntimeDeps(deps: Partial<DataRuntimeDeps> = {}) {
  return configureValidRuntimeCallbacks(dataRuntimeDeps, deps, ["buildSidebar","navigate","showDetailModal"]);
}

export function configureDataViewCoreDependencies(deps: Partial<DataViewCoreDeps> = {}) {
  return configureValidRuntimeCallbacks(dataViewCoreDeps, deps, ["getActiveData","invalidateActiveDataCache"]);
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

function navigateDataView(route: string, data?: unknown) {
  dataRuntimeDeps.navigate?.(route, data);
}

export function navigateDataViewRuntime(route: string, data?: unknown) {
  if (!dataRuntimeDeps.navigate) return false;
  dataRuntimeDeps.navigate(route, data);
  return true;
}

export function showDataMarkerDetailRuntime(markerId: string) {
  if (!dataRuntimeDeps.showDetailModal) return false;
  dataRuntimeDeps.showDetailModal(markerId);
  return true;
}

function buildDataSidebar(data?: ActiveData) {
  dataRuntimeDeps.buildSidebar?.(data);
}

const DATA_ACTION_ATTR = 'data-lab-data-action';
const DATA_CHANGE_ATTR = 'data-lab-data-change';
const DATA_RANGE_ATTR = 'data-lab-data-range';
const DATA_ACTION_SELECTOR = `[${DATA_ACTION_ATTR}]`;
const DATA_CHANGE_SELECTOR = `[${DATA_CHANGE_ATTR}]`;
const dataActionDelegateRoots = new WeakSet<Document | Element>();

function dataAttrName(name: unknown) {
  return String(name).replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);
}

function dataControlAttrs(kind: string, action: string, attrs: Record<string, unknown> = {}) {
  let html = `data-lab-data-${kind}="${escapeAttr(action)}"`;
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    html += ` data-lab-data-${escapeAttr(dataAttrName(name))}="${escapeAttr(String(value))}"`;
  }
  return html;
}

export function dataActionAttrs(action: string, attrs: Record<string, unknown> = {}) {
  return dataControlAttrs('action', action, attrs);
}

export function dataChangeAttrs(action: string, attrs: Record<string, unknown> = {}) {
  return dataControlAttrs('change', action, attrs);
}

function closestDataElement(target: EventTarget | null, selector: string) {
  return ((target as Element | null) && typeof (target as Element).closest === 'function' ? (target as Element).closest(selector) : null as HTMLElement | null);
}

function rootContains(root: EventTarget | null, el: Element) {
  return !!(root && typeof (root as Node).contains === 'function' && (root as Node).contains(el));
}

function containChartLayersClick(event: Event) {
  event.stopPropagation();
  if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
}

function handleDataClick(event: Event) {
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

function handleDataChange(event: Event) {
  const actionEl = closestDataElement(event.target, DATA_CHANGE_SELECTOR);
  if (!actionEl || !rootContains(event.currentTarget, actionEl)) return;
  const action = actionEl.getAttribute(DATA_CHANGE_ATTR);
  const checked = ((event.target || {}) as { checked?: boolean }).checked === true;
  const mode = checked ? 'on' : 'off';
  if (action === 'set-note-overlay') {
    setNoteOverlay(mode);
  } else if (action === 'set-supp-overlay') {
    setSuppOverlay(mode);
  } else if (action === 'set-phase-overlay') {
    setPhaseOverlay(mode);
  }
}

export function installDataActionDelegates(root: Document | Element | null = typeof document !== 'undefined' ? document : null) {
  if (!root || dataActionDelegateRoots.has(root)) return;
  dataActionDelegateRoots.add(root);
  root.addEventListener('click', handleDataClick);
  root.addEventListener('change', handleDataChange);
}

installDataActionDelegates();

export function renderDateRangeFilter({ showScope = false } = {}) {
  const ranges = [
    { key: '3m', label: '3M' },
    { key: '6m', label: '6M' },
    { key: '1y', label: '1Y' },
    { key: 'all', label: 'All' }
  ];
  const control = `<div class="date-range-filter" role="group" aria-label="Lab date range">${ranges.map(r =>
    `<button class="range-btn${state.dateRangeFilter === r.key ? ' active' : ''}" type="button" aria-pressed="${state.dateRangeFilter === r.key}" ${dataActionAttrs('set-date-range', { range: r.key })}>${r.label}</button>`
  ).join('')}</div>`;
  if (!showScope) return control;
  return `<div class="dashboard-lab-date-range">
    <div><strong>Lab date range</strong><p>Filters lab trends and sidebar categories.${state.dateRangeFilter === 'all' ? ' All saved dates are included.' : ' Older results and categories may be hidden.'}</p></div>
    ${control}
  </div>`;
}

export function setDateRange(range: string) {
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
  const activeNav = (document.querySelector('.nav-item.active') as HTMLElement | null);
  return activeNav?.dataset.category || 'dashboard';
}

export function toggleChartLayersDropdown(e: Event) {
  // Direct callers still rely on this; delegated clicks add
  // stopImmediatePropagation() at document level after this returns.
  e.stopPropagation();
  const dd = document.getElementById('chart-layers-dropdown');
  if (!dd) return;
  const trigger = ((dd.parentElement?.querySelector('.chart-layers-trigger') || null) as HTMLButtonElement | null);
  const isOpen = dd.classList.contains('open');
  dd.classList.toggle('open', !isOpen);
  if (trigger) trigger.setAttribute('aria-expanded', String(!isOpen));
  if (!isOpen) {
    const close = (ev: Event | null) => {
      // Allow keyboard close (Escape) without requiring an event target
      if (!ev || !ev.target || !(ev.target as Element).closest || !(ev.target as Element).closest('.chart-layers-wrapper')) {
        dd.classList.remove('open');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', close);
        document.removeEventListener('keydown', closeOnEsc);
      }
    };
    const closeOnEsc = (ev: KeyboardEvent) => {
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

function setOverlayMode(
  field: 'suppOverlayMode' | 'noteOverlayMode' | 'phaseOverlayMode',
  key: 'suppOverlay' | 'noteOverlay' | 'phaseOverlay', mode: unknown,
) {
  state[field] = mode === 'off' ? 'off' : 'on';
  localStorage.setItem(profileStorageKey(state.currentProfile, key), state[field]);
  const activeCat = _getActiveNavCategory();
  navigateDataView(activeCat);
}

export function setSuppOverlay(mode: unknown) { setOverlayMode('suppOverlayMode', 'suppOverlay', mode); }
export function setNoteOverlay(mode: unknown) { setOverlayMode('noteOverlayMode', 'noteOverlay', mode); }
export function setPhaseOverlay(mode: unknown) { setOverlayMode('phaseOverlayMode', 'phaseOverlay', mode); }

export function destroyAllCharts() {
  for (const c of Object.values(state.chartInstances)) c.destroy();
  state.chartInstances = {};
}

export function switchUnitSystem(system: unknown) {
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

export function toggleAltUnits(force?: unknown) {
  const next = (force === true || force === false) ? force : !state.showAltUnits;
  if (next === state.showAltUnits) return;
  state.showAltUnits = next;
  localStorage.setItem(profileStorageKey(state.currentProfile, 'showAltUnits'), next ? 'on' : 'off');
  const openId = state._activeDetailMarkerId;
  if (openId) dataRuntimeDeps.showDetailModal?.(openId);
}

let _rangeModeRefreshToken = 0;

function _captureCategoryCardOrderForRangeRefresh(route: string | null | undefined) {
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

function _afterNextPaint(fn: () => void) {
  scheduleUtilsAfterNextPaint(fn);
}

export function switchRangeMode(mode: unknown) {
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

export function updateHeaderDates(data?: ActiveData | null) {
  if (!data) data = getActiveData();
  const el = document.getElementById("header-dates");
  if (el) {
    if (data.dateLabels.length > 0) {
      const labels = data.dateLabels;
      const dateText = labels.length === 1 ? labels[0]! : `${labels[0]} – ${labels[labels.length - 1]}`;
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
  const buttons = (Array.from(el.querySelectorAll('.range-toggle-btn')) as HTMLButtonElement[]);
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
