import {projectChartLayers,renderChartLayersPresentation} from './chart-layers-presentation.js';
import {renderHTML as renderLabRange} from './components/LabDateRange.svelte.html.js';
import {projectLabDateRange} from './lab-date-range-presentation.js';
import {renderHeaderDateSummary, renderHeaderRangeButtons} from './header-date-range.js';
import type { ProfileData as ImportedDataRecord } from '../types/app-state.js';
import type { ActiveData } from './data-view-types.js';
import { configureValidRuntimeCallbacks } from './runtime-callbacks.js';
// Browser controls for data views, chart layers, and display preferences.

import { state } from './state.js';
import { escapeAttr, showNotification } from './utils.js';
import { scheduleUtilsAfterNextPaint } from './utils-runtime.js';
import { normalizeUnitProfile } from './unit-profiles.js';
import { commitDisplayPreferences } from './display-preferences.js';
import { LAB_VIEW_RANGES } from '../shared/app-navigation-contract.js';
import type { DisplayPreferenceCommitOptions, DisplayPreferenceReceipt } from './display-preferences.js';
import { commitLabOverlayPreferences } from './lab-overlay-preferences.js';

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
export async function navigateDataViewOutcomeRuntime(route: string, data?: unknown): Promise<boolean> {
  if (!dataRuntimeDeps.navigate) return false;
  return await dataRuntimeDeps.navigate(route, data) !== false;
}

/** Publish committed data in the current view without navigating away. */
export function refreshDataViewRuntime() {
  if (!dataRuntimeDeps.navigate) return false;
  dataRuntimeDeps.buildSidebar?.(getActiveData());
  const pending = dataRuntimeDeps.navigate(state.currentView || 'dashboard', { preserveScroll: true, preserveSidebar: true });
  void Promise.resolve(pending).catch(() => { /* The view owner handles its load failure; committed data remains saved. */ });
  updateHeaderDates(); updateHeaderRangeToggle();
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
    void switchRangeMode(actionEl.getAttribute(DATA_RANGE_ATTR) || 'optimal').catch(() => showNotification('The range preference could not be confirmed. Check Display settings before trying again.', 'error'));
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

export function projectDateRangeFilter({ showScope = false } = {}) {
  return projectLabDateRange(state.dateRangeFilter,showScope);
}

export function renderDateRangeFilter({ showScope = false } = {}) {
  return renderLabRange({view:projectLabDateRange(state.dateRangeFilter,showScope)});
}

export function setDateRange(range: string, options: { navigate?: boolean } = {}) {
  if (!LAB_VIEW_RANGES.includes(range as typeof LAB_VIEW_RANGES[number])) return false;
  state.dateRangeFilter = range;
  buildDataSidebar();
  if (options.navigate !== false) navigateDataView(state.currentView || 'dashboard');
  return true;
}

export function projectChartLayersDropdown() {
  const hasNotes = (state.importedData.notes || []).length > 0;
  const hasSupps = (state.importedData.supplements || []).length > 0;
  const hasRecordedDrawPhase = state.importedData.entries?.some(entry => entry.context?.cyclePhase);
  const hasCycle = state.profileSex === 'female'
    && (state.importedData.menstrualCycle?.periods?.length > 0 || hasRecordedDrawPhase);
  if (!hasNotes && !hasSupps && !hasCycle) return null;
  return projectChartLayers({hasNotes,hasSupps,hasCycle},
    ()=>state.noteOverlayMode, ()=>state.suppOverlayMode, ()=>state.phaseOverlayMode);
}

export function renderChartLayersDropdown() {
 const view=projectChartLayersDropdown();
 return view?renderChartLayersPresentation({hasNotes:!!view.notes,hasSupps:!!view.supplements,hasCycle:!!view.cycle},
   ()=>view.notes?.checked?'on':'off',()=>view.supplements?.checked?'on':'off',()=>view.cycle?.checked?'on':'off'):'';
}

function _getActiveNavCategory() {
  const activeNav = (document.querySelector('.nav-item.active') as HTMLElement | null);
  return activeNav?.dataset.category || 'dashboard';
}

let chartLayersDismiss: (() => void) | null = null;

export function toggleChartLayersDropdown(e: Event) {
  // Direct callers still rely on this; delegated clicks add
  // stopImmediatePropagation() at document level after this returns.
  e.stopPropagation();
  const dd = document.getElementById('chart-layers-dropdown');
  if (!dd) return;
  const trigger = ((dd.parentElement?.querySelector('.chart-layers-trigger') || null) as HTMLButtonElement | null);
  const isOpen = dd.classList.contains('open');
  chartLayersDismiss?.();
  dd.classList.toggle('open', !isOpen);
  if (trigger) trigger.setAttribute('aria-expanded', String(!isOpen));
  if (isOpen) return;
  const ownerDocument = dd.ownerDocument;
  const isCurrent = () => dd.isConnected && ownerDocument.getElementById('chart-layers-dropdown') === dd;
  const close = (restoreFocus: boolean) => {
    const current = isCurrent();
    dd.classList.remove('open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    ownerDocument.removeEventListener('click', closeOnOutside);
    ownerDocument.removeEventListener('keydown', closeOnEsc);
    if (chartLayersDismiss === cleanup) chartLayersDismiss = null;
    if (restoreFocus && current && trigger?.isConnected) trigger.focus();
  };
  const closeOnOutside = (ev: Event) => {
    if (!isCurrent()) { cleanup(); return; }
    if (!ev.target || !(ev.target as Element).closest || !(ev.target as Element).closest('.chart-layers-wrapper')) cleanup();
  };
  const closeOnEsc = (ev: KeyboardEvent) => {
    if (!isCurrent()) { cleanup(); return; }
    if (ev.key === 'Escape') close(true);
  };
  const cleanup = () => close(false);
  chartLayersDismiss = cleanup;
  // The opening event is contained above, and rows retain their existing
  // delegated stopImmediatePropagation; listeners are ready before the next input.
  ownerDocument.addEventListener('click', closeOnOutside);
  ownerDocument.addEventListener('keydown', closeOnEsc);
}

function setOverlayMode(
  field: 'suppOverlayMode' | 'noteOverlayMode' | 'phaseOverlayMode',
  key: 'suppOverlay' | 'noteOverlay' | 'phaseOverlay', mode: unknown,
) {
  const profile = state.currentProfile, root = state.importedData, view = state.currentView;
  const activeCat = _getActiveNavCategory();
  const overlay = { suppOverlay: 'supplements', noteOverlay: 'notes', phaseOverlay: 'cycle' } as const;
  const owns = () => state.currentProfile === profile && state.importedData === root && state.currentView === view;
  const repaintFailed = () => { if (owns()) showNotification('Chart-layer preference saved. Reopen the view to refresh it.', 'info'); };
  void commitLabOverlayPreferences({ [overlay[key]]: mode !== 'off' }).then(() => {
    if (owns() && !document.querySelector('.modal-overlay.show,.confirm-overlay.show,[data-modal-focus-trap]')) {
      try { void Promise.resolve(dataRuntimeDeps.navigate?.(activeCat)).catch(repaintFailed); } catch { repaintFailed(); }
    }
  }, error => {
    if (owns()) {
      const action = { noteOverlay: 'set-note-overlay', suppOverlay: 'set-supp-overlay', phaseOverlay: 'set-phase-overlay' }[key];
      for (const input of document.querySelectorAll<HTMLInputElement>(`[data-lab-data-change="${action}"]`)) input.checked = state[field] === 'on';
      showNotification(error instanceof Error ? error.message : 'The chart-layer preference could not be saved. Check the Layers menu.', 'error');
    }
  });
}

export function setSuppOverlay(mode: unknown) { setOverlayMode('suppOverlayMode', 'suppOverlay', mode); }
export function setNoteOverlay(mode: unknown) { setOverlayMode('noteOverlayMode', 'noteOverlay', mode); }
export function setPhaseOverlay(mode: unknown) { setOverlayMode('phaseOverlayMode', 'phaseOverlay', mode); }

export function destroyAllCharts() {
  for (const c of Object.values(state.chartInstances)) c.destroy();
  state.chartInstances = {};
}

export async function switchUnitSystem(system: unknown, options: DisplayPreferenceCommitOptions = {}): Promise<DisplayPreferenceReceipt> {
  const unitProfile = normalizeUnitProfile(system);
  const receipt = await commitDisplayPreferences({ unitSystem: unitProfile }, options);
  if (state.currentProfile !== receipt.profileId) return receipt;
  try {
    invalidateActiveDataCache();
    const openId = state._activeDetailMarkerId;
    const data = getActiveData();
    buildDataSidebar(data);
    updateHeaderDates(data);
    navigateDataView(state.currentView || 'dashboard', data);
    if (openId) dataRuntimeDeps.showDetailModal?.(openId);
  } catch { showNotification('Units were saved. Reopen the view to refresh its display.', 'info'); }
  return receipt;
}

export async function toggleAltUnits(force?: unknown, options: DisplayPreferenceCommitOptions = {}): Promise<DisplayPreferenceReceipt> {
  const receipt = await commitDisplayPreferences((current: Readonly<import('./display-preferences.js').DisplayPreferenceValues>) => ({ showAltUnits: typeof force === 'boolean' ? force : !current.showAltUnits }), options);
  if (state.currentProfile !== receipt.profileId || !receipt.refresh.length) return receipt;
  const openId = state._activeDetailMarkerId;
  try { if (openId) dataRuntimeDeps.showDetailModal?.(openId); }
  catch { showNotification('Alternate units were saved. Reopen the marker to refresh its display.', 'info'); }
  return receipt;
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

export async function switchRangeMode(mode: unknown, options: DisplayPreferenceCommitOptions = {}): Promise<DisplayPreferenceReceipt> {
  const nextMode = mode === 'reference' ? 'reference' : mode === 'both' ? 'both' : 'optimal';
  const receipt = await commitDisplayPreferences({ rangeMode: nextMode }, options);
  if (state.currentProfile !== receipt.profileId || !receipt.refresh.length) return receipt;
  try { refreshCommittedDisplayPreferences(receipt); }
  catch { showNotification('Range preferences were saved. Reopen the view to refresh its display.', 'info'); }
  return receipt;
}

/** Repaint an already durable command without issuing a second preference write. */
export function refreshCommittedDisplayPreferences(receipt: DisplayPreferenceReceipt): void {
  if (state.currentProfile !== receipt.profileId || !receipt.refresh.length) return;
  if (receipt.refresh.includes('unitSystem') || receipt.refresh.includes('timeFormat')) {
    invalidateActiveDataCache();
    const openId = state._activeDetailMarkerId, data = getActiveData();
    buildDataSidebar(data); updateHeaderDates(data);
    navigateDataView(state.currentView || 'dashboard', data);
    if (openId) dataRuntimeDeps.showDetailModal?.(openId);
    return;
  }
  if (!receipt.refresh.includes('rangeMode')) {
    if (receipt.refresh.includes('showAltUnits') && state._activeDetailMarkerId) dataRuntimeDeps.showDetailModal?.(state._activeDetailMarkerId);
    return;
  }
  const nextMode = receipt.after.rangeMode;
  updateHeaderRangeToggle();
  const openId = state._activeDetailMarkerId;
  const preservedOrder = _captureCategoryCardOrderForRangeRefresh(state.currentView);
  if (preservedOrder) state._preserveCategoryCardOrder = preservedOrder;
  else delete state._preserveCategoryCardOrder;
  const token = ++_rangeModeRefreshToken;
  _afterNextPaint(() => {
    if (token !== _rangeModeRefreshToken || state.rangeMode !== nextMode) return;
    if (state.currentProfile !== receipt.profileId) return;
    try {
      const data = getActiveData();
      buildDataSidebar(data);
      navigateDataView(state.currentView || 'dashboard', data);
      if (openId && state._activeDetailMarkerId === openId) dataRuntimeDeps.showDetailModal?.(openId);
    } catch { showNotification('Range preferences were saved. Reopen the view to refresh its display.', 'info'); }
  });
}

export function updateHeaderDates(data?: ActiveData | null) {
  if (!data) data = getActiveData();
  const el = document.getElementById("header-dates");
  if (el) {
    if (data.dateLabels.length > 0) {
      const labels = data.dateLabels;
      const dateText = labels.length === 1 ? labels[0]! : `${labels[0]} – ${labels[labels.length - 1]}`;
      el.innerHTML = renderHeaderDateSummary(dateText);
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
    el.innerHTML = renderHeaderRangeButtons(modes, () => state.rangeMode);
    return;
  }
  for (const btn of buttons) {
    const active = btn.dataset.range === state.rangeMode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}
