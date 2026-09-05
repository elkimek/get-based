// @ts-check
// dashboard-widget-controls.js - dashboard widget controls, picker, and layout actions

import { DASHBOARD_WIDGET_SOURCE_ORDER, dashboardBiometricSelectionKey } from './dashboard-widgets.js';
import { getWidgetHeaderDescription } from './dashboard-widget-copy.js';
import { escapeAttr, escapeHTML, formatValue, getStatus, safeMarkerId, showNotification } from './utils.js';
import { openAppendedModalOverlay, removeModalOverlay } from './modal-lifecycle.js';
import {
  askDashboardAIAboutSnp,
  deleteDashboardNote,
  getDashboardViewportHeight,
  navigateDashboardRoute,
  openDashboardManualLogForm,
  openDashboardMarkerDetail,
  openDashboardNoteEditor,
  openDashboardWearableDetail,
  openDashboardWearablesSettings,
  syncDashboardWearableNow,
  triggerDashboardDnaPicker,
} from './dashboard-widget-runtime.js';

const DASHBOARD_WIDGET_KEYBOARD_ACTIONS = new Set([
  'open-biometric-manual-log',
  'open-marker-detail',
  'navigate',
  'trigger-dna-picker',
  'open-note-editor',
]);

export function dashboardWidgetActionAttrs(action, attrs = {}) {
  return [
    `data-dashboard-widget-action="${escapeAttr(action)}"`,
    ...Object.entries(attrs)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([name, value]) => `data-dashboard-widget-${escapeAttr(name)}="${escapeAttr(String(value))}"`),
  ].join(' ');
}

export function dashboardWidgetInputAttrs(action) {
  return `data-dashboard-widget-input="${escapeAttr(action)}"`;
}

export function dashboardWidgetDragAttrs(id) {
  const safeId = escapeAttr(id);
  return `data-dashboard-widget-drag-id="${safeId}" data-dashboard-widget-drop-id="${safeId}"`;
}

export function createDashboardWidgetControls(deps) {
  let organizeMode = false;
  let draggingWidgetId = null;
  let dashboardWidgetDelegatesInstalled = false;

  const {
    state,
    getActiveData,
    getAvailableDashboardFixedWidgets,
    getAvailableDashboardFixedWidgetIds,
    getDashboardWidgetPrefs,
    saveDashboardWidgetPrefs,
    resetDashboardWidgetPrefs,
    dashboardMarkerWidgetId,
    dashboardMarkerIdFromWidgetId,
    isDashboardMarkerWidgetId,
    getDashboardMarkerById,
    markerHasData,
    getLatestValueIndex,
    getEffectiveRangeForDate,
    canonicalMetric,
    getDashboardBiometricSelection,
    saveDashboardBiometricSelection,
    getDashboardBiometricMetricOrder,
    getDashboardBiometricTile,
    rerenderDashboardFromWidgetChange,
  } = deps;

  function isOrganizeMode() {
    return organizeMode;
  }

  function renderDashboardControlButtons({ includeReset = false } = {}) {
    const organizeLabel = organizeMode ? 'Done' : 'Customize';
    return `<button class="dashboard-action-btn" type="button" ${dashboardWidgetActionAttrs('toggle-organize')}>${organizeLabel}</button>
      <button class="dashboard-action-btn dashboard-action-btn-primary" type="button" ${dashboardWidgetActionAttrs('open-picker')}>+ Add widget</button>
      ${includeReset || organizeMode ? `<button type="button" class="dashboard-action-btn" ${dashboardWidgetActionAttrs('reset-widgets')}>Reset layout</button>` : ''}`;
  }

  function renderDashboardStickyControls() {
    return `<div class="dashboard-sticky-actions" aria-label="Floating dashboard widget controls">${renderDashboardControlButtons()}</div>`;
  }

  function renderDashboardWidget(entry, prefs, index, visibleEntries) {
    const { def, body } = entry;
    const description = getWidgetHeaderDescription(def.id, def.description);
    const isHidden = prefs.hidden.includes(def.id);
    if (isHidden || (!body && !organizeMode)) return '';
    const canMoveUp = index > 0;
    const canMoveDown = index < visibleEntries.length - 1;
    const removeLabel = def.customMarkerWidget ? 'Remove' : 'Hide';
    const controls = organizeMode ? `<div class="dashboard-widget-tools">
        <button type="button" class="dashboard-widget-tool" ${canMoveUp ? '' : 'disabled'} ${dashboardWidgetActionAttrs('move-widget', { id: def.id, direction: -1 })} aria-label="Move ${escapeHTML(def.title)} up">↑</button>
        <button type="button" class="dashboard-widget-tool" ${canMoveDown ? '' : 'disabled'} ${dashboardWidgetActionAttrs('move-widget', { id: def.id, direction: 1 })} aria-label="Move ${escapeHTML(def.title)} down">↓</button>
        <button type="button" class="dashboard-widget-tool" ${dashboardWidgetActionAttrs('hide-widget', { id: def.id })} aria-label="${removeLabel} ${escapeHTML(def.title)}">${removeLabel}</button>
      </div>` : '';
    return `<section class="dashboard-widget dashboard-widget-${def.size || 'full'}${organizeMode ? ' is-organizing' : ''}${body ? '' : ' is-empty'}"
        data-widget-id="${escapeAttr(def.id)}"
        ${organizeMode ? `draggable="true" ${dashboardWidgetDragAttrs(def.id)}` : ''}>
      <div class="dashboard-widget-chrome">
        <div class="dashboard-widget-handle" aria-hidden="true">⋮⋮</div>
        <div class="dashboard-widget-heading">
          ${organizeMode && def.source ? `<div class="dashboard-widget-source">${escapeHTML(def.source)}</div>` : ''}
          <div class="dashboard-widget-title">${escapeHTML(def.title)}</div>
          ${description ? `<div class="dashboard-widget-description">${escapeHTML(description)}</div>` : ''}
        </div>
        ${controls}
      </div>
      <div class="dashboard-widget-body">${body || '<div class="dashboard-widget-empty">No data available for this widget.</div>'}</div>
    </section>`;
  }

  function scrollDashboardWidgetIntoView(id) {
    if (!id || typeof document === 'undefined') return;
    requestAnimationFrame(() => {
      const widgets = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.dashboard-widget[data-widget-id]')]);
      const el = widgets.find(node => node.dataset.widgetId === id);
      el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
  }

  function getDashboardViewportTargetWidgetId() {
    if (typeof document === 'undefined') return '';
    const viewportHeight = getDashboardViewportHeight();
    if (viewportHeight == null) return '';
    const targetLine = Math.max(120, viewportHeight * 0.36);
    const widgets = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.dashboard-widget[data-widget-id]')]);
    for (const el of widgets) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom >= targetLine) return el.dataset.widgetId || '';
    }
    return widgets.at(-1)?.dataset.widgetId || '';
  }

  function insertDashboardWidgetAtViewport(prefs, id) {
    prefs.order = (prefs.order || []).filter(widgetId => widgetId !== id);
    prefs.hidden = (prefs.hidden || []).filter(widgetId => widgetId !== id);
    const targetId = getDashboardViewportTargetWidgetId();
    const targetIndex = targetId ? prefs.order.indexOf(targetId) : -1;
    if (targetIndex >= 0) prefs.order.splice(targetIndex, 0, id);
    else prefs.order.push(id);
  }

  function getDashboardMarkerWidgetOptions(data = getActiveData(), prefs = getDashboardWidgetPrefs()) {
    const existing = new Set((prefs.order || []).map(dashboardMarkerIdFromWidgetId).filter(Boolean));
    const options = [];
    for (const [catKey, category] of Object.entries(data.categories || {})) {
      for (const [markerKey, marker] of Object.entries(category.markers || {})) {
        const markerId = `${catKey}_${markerKey}`;
        if (!safeMarkerId(markerId) || existing.has(markerId) || marker?.hidden || !markerHasData(marker)) continue;
        const latestIdx = getLatestValueIndex(marker.values || []);
        if (latestIdx < 0) continue;
        const range = getEffectiveRangeForDate(marker, latestIdx);
        const value = marker.values[latestIdx];
        const status = getStatus(value, range.min, range.max);
        options.push({
          id: markerId,
          name: marker.name || markerKey,
          category: category.label || catKey,
          value: formatValue(value),
          unit: marker.unit || '',
          status,
        });
      }
    }
    return options.sort((a, b) => String(a.category).localeCompare(String(b.category)) || String(a.name).localeCompare(String(b.name)));
  }

  function getDashboardBiometricWidgetOptions() {
    const selected = new Set(getDashboardBiometricSelection());
    const options = [];
    for (const metricId of getDashboardBiometricMetricOrder()) {
      if (selected.has(metricId)) continue;
      if (metricId === 'bp_diastolic' && selected.has('bp_systolic')) continue;
      const tile = getDashboardBiometricTile(metricId, { allowEmptyManual: true });
      const canon = canonicalMetric(metricId);
      if (!tile || !canon) continue;
      options.push({
        id: metricId,
        label: tile.label,
        sub: canon.sub || '',
        value: tile.value,
        unit: tile.unit,
        change: tile.change,
      });
    }
    return options;
  }

  function renderDashboardMarkerWidgetOption(option) {
    const searchText = `${option.name} ${option.category} ${option.value} ${option.unit}`.toLowerCase();
    return `<button type="button" class="dashboard-widget-picker-card dashboard-marker-widget-option" data-marker-search="${escapeAttr(searchText)}" ${dashboardWidgetActionAttrs('add-marker-widget', { id: option.id })}>
      <span class="dashboard-widget-picker-title">${escapeHTML(option.name)}</span>
      <span class="dashboard-widget-picker-sub">${escapeHTML(option.category)} · ${escapeHTML(option.value)}${option.unit ? ` ${escapeHTML(option.unit)}` : ''}</span>
      <span class="dashboard-widget-picker-action">Add marker widget</span>
    </button>`;
  }

  function renderDashboardBiometricWidgetOption(option) {
    const searchText = `${option.label} ${option.sub} ${option.value} ${option.unit} ${option.change}`.toLowerCase();
    return `<button type="button" class="dashboard-widget-picker-card dashboard-biometric-widget-option" data-biometric-search="${escapeAttr(searchText)}" ${dashboardWidgetActionAttrs('add-biometric-metric', { id: option.id })}>
      <span class="dashboard-widget-picker-title">${escapeHTML(option.label)}${option.sub ? ` <small>${escapeHTML(option.sub)}</small>` : ''}</span>
      <span class="dashboard-widget-picker-sub">${escapeHTML(option.value)}${option.unit ? ` ${escapeHTML(option.unit)}` : ''} · ${escapeHTML(option.change || 'latest')}</span>
      <span class="dashboard-widget-picker-action">Add to Biometrics Overview</span>
    </button>`;
  }

  function renderDashboardPickerFixedGroups(hidden) {
    if (!hidden.length) return `<div class="dashboard-widget-picker-empty">All dashboard widgets are visible.</div>`;
    const groups = new Map();
    for (const def of hidden) {
      const source = def.source || 'Other';
      if (!groups.has(source)) groups.set(source, []);
      groups.get(source).push(def);
    }
    const orderedSources = [
      ...DASHBOARD_WIDGET_SOURCE_ORDER,
      ...[...groups.keys()].filter(source => !DASHBOARD_WIDGET_SOURCE_ORDER.includes(source)).sort(),
    ];
    return orderedSources
      .filter(source => groups.has(source))
      .map(source => `<div class="dashboard-widget-picker-source">
        <div class="dashboard-widget-picker-label">${escapeHTML(source)}</div>
        <div class="dashboard-widget-picker-grid">${groups.get(source).map(def => `<button type="button" class="dashboard-widget-picker-card" ${dashboardWidgetActionAttrs('show-widget', { id: def.id })}>
          <span class="dashboard-widget-picker-title">${escapeHTML(def.title)}</span>
          <span class="dashboard-widget-picker-sub">${escapeHTML(def.description || '')}</span>
          <span class="dashboard-widget-picker-action">Add dashboard widget</span>
        </button>`).join('')}</div>
      </div>`)
      .join('');
  }

  function filterDashboardPickerOptions(selector, dataAttr, emptyId, query = '') {
    const needle = String(query || '').trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll?.(selector).forEach(el => {
      const match = !needle || (el.dataset[dataAttr] || '').includes(needle);
      el.hidden = !match;
      if (match) visible += 1;
    });
    const empty = document.getElementById(emptyId);
    if (empty) empty.hidden = visible > 0;
  }

  function handleDashboardWidgetAction(actionEl, event) {
    const action = actionEl.dataset.dashboardWidgetAction || '';
    const id = actionEl.dataset.dashboardWidgetId || '';
    if (action === 'toggle-organize') {
      toggleDashboardOrganizeMode();
    } else if (action === 'open-picker') {
      openDashboardWidgetPicker();
    } else if (action === 'reset-widgets') {
      resetDashboardWidgets();
    } else if (action === 'move-widget') {
      moveDashboardWidget(id, Number(actionEl.dataset.dashboardWidgetDirection || 0));
    } else if (action === 'hide-widget') {
      hideDashboardWidget(id);
    } else if (action === 'show-widget') {
      showDashboardWidget(id);
    } else if (action === 'add-marker-widget') {
      addDashboardMarkerWidget(id);
    } else if (action === 'add-biometric-metric') {
      addDashboardBiometricMetric(id);
    } else if (action === 'close-picker') {
      closeDashboardWidgetPicker();
    } else if (action === 'customize-layout') {
      toggleDashboardOrganizeMode(true);
      closeDashboardWidgetPicker();
    } else if (action === 'reset-layout') {
      resetDashboardWidgets();
      closeDashboardWidgetPicker();
    } else if (action === 'connect-source') {
      openDashboardWearablesSettings();
      closeDashboardWidgetPicker();
    } else if (action === 'open-biometric-picker') {
      openDashboardBiometricPicker();
    } else if (action === 'sync-biometric-now') {
      syncDashboardWearableNow(actionEl);
    } else if (action === 'remove-biometric-metric') {
      removeDashboardBiometricMetric(id);
    } else if (action === 'open-biometric-detail') {
      if (!openDashboardWearableDetail(id)) openDashboardWearablesSettings();
    } else if (action === 'open-biometric-manual-log') {
      openDashboardManualLogForm(id, event);
    } else if (action === 'open-marker-detail') {
      if (safeMarkerId(id)) openDashboardMarkerDetail(id);
    } else if (action === 'ask-genome-snp') {
      askDashboardAIAboutSnp(actionEl.dataset.dashboardWidgetRsid || '');
    } else if (action === 'navigate') {
      const route = actionEl.dataset.dashboardWidgetRoute || '';
      if (/^[a-zA-Z0-9_-]+$/.test(route)) navigateDashboardRoute(route);
    } else if (action === 'trigger-dna-picker') {
      triggerDashboardDnaPicker();
    } else if (action === 'open-note-editor') {
      const rawIndex = actionEl.dataset.dashboardWidgetIndex;
      if (rawIndex == null || rawIndex === '') {
        openDashboardNoteEditor();
      } else {
        const index = Number(rawIndex);
        if (Number.isInteger(index) && index >= 0) openDashboardNoteEditor(index);
      }
    } else if (action === 'delete-note') {
      const index = Number(actionEl.dataset.dashboardWidgetIndex);
      if (Number.isInteger(index) && index >= 0) deleteDashboardNote(index);
    }
  }

  function handleDashboardWidgetClick(event) {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    const overlay = target.closest('#dashboard-widget-picker-overlay[data-dashboard-widget-overlay]');
    if (overlay && target === overlay) {
      closeDashboardWidgetPicker();
      return;
    }
    const actionEl = target.closest('[data-dashboard-widget-action]');
    if (!actionEl) return;
    const wearableActionEl = target.closest('[data-wearable-action]');
    if (wearableActionEl && actionEl.contains(wearableActionEl)) return;
    event.preventDefault();
    handleDashboardWidgetAction(actionEl, event);
  }

  function handleDashboardWidgetKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    if (target.closest('input, textarea, select, button, a')) return;
    const actionEl = target.closest('[data-dashboard-widget-action]');
    if (!actionEl) return;
    if (!DASHBOARD_WIDGET_KEYBOARD_ACTIONS.has(actionEl.dataset.dashboardWidgetAction || '')) return;
    event.preventDefault();
    actionEl.click();
  }

  function handleDashboardWidgetInput(event) {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    const input = target.closest('[data-dashboard-widget-input]');
    if (!input) return;
    const action = input.dataset.dashboardWidgetInput || '';
    if (action === 'filter-marker-picker') {
      filterDashboardMarkerWidgetPicker(input.value);
    } else if (action === 'filter-biometric-picker') {
      filterDashboardBiometricWidgetPicker(input.value);
    }
  }

  function handleDashboardWidgetDragStart(event) {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    const dragEl = target.closest('[data-dashboard-widget-drag-id]');
    if (!dragEl) return;
    startDashboardWidgetDrag(event, dragEl.dataset.dashboardWidgetDragId || '', dragEl);
  }

  function handleDashboardWidgetDragOver(event) {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    if (!target.closest('[data-dashboard-widget-drop-id]')) return;
    allowDashboardWidgetDrop(event);
  }

  function handleDashboardWidgetDrop(event) {
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    const dropEl = target.closest('[data-dashboard-widget-drop-id]');
    if (!dropEl) return;
    dropDashboardWidget(event, dropEl.dataset.dashboardWidgetDropId || '');
  }

  function installDashboardWidgetControlDelegates() {
    if (dashboardWidgetDelegatesInstalled || typeof document === 'undefined') return;
    dashboardWidgetDelegatesInstalled = true;
    document.addEventListener('click', handleDashboardWidgetClick);
    document.addEventListener('keydown', handleDashboardWidgetKeydown);
    document.addEventListener('input', handleDashboardWidgetInput);
    document.addEventListener('dragstart', handleDashboardWidgetDragStart);
    document.addEventListener('dragover', handleDashboardWidgetDragOver);
    document.addEventListener('drop', handleDashboardWidgetDrop);
  }

  function toggleDashboardOrganizeMode(force) {
    organizeMode = typeof force === 'boolean' ? force : !organizeMode;
    rerenderDashboardFromWidgetChange();
  }

  function moveDashboardWidget(id, direction) {
    const prefs = getDashboardWidgetPrefs();
    const visible = prefs.order.filter(widgetId => !prefs.hidden.includes(widgetId));
    const visibleIndex = visible.indexOf(id);
    const targetVisibleId = visible[visibleIndex + direction];
    if (visibleIndex < 0 || !targetVisibleId) return;
    const from = prefs.order.indexOf(id);
    const to = prefs.order.indexOf(targetVisibleId);
    prefs.order.splice(from, 1);
    prefs.order.splice(to, 0, id);
    saveDashboardWidgetPrefs(prefs);
    rerenderDashboardFromWidgetChange();
  }

  function hideDashboardWidget(id) {
    const prefs = getDashboardWidgetPrefs();
    if (isDashboardMarkerWidgetId(id)) {
      prefs.order = prefs.order.filter(widgetId => widgetId !== id);
      prefs.hidden = prefs.hidden.filter(widgetId => widgetId !== id);
    } else if (!prefs.hidden.includes(id)) {
      prefs.hidden.push(id);
    }
    saveDashboardWidgetPrefs(prefs);
    rerenderDashboardFromWidgetChange();
  }

  function showDashboardWidget(id) {
    if (!getAvailableDashboardFixedWidgetIds().includes(id)) return;
    const prefs = getDashboardWidgetPrefs();
    insertDashboardWidgetAtViewport(prefs, id);
    saveDashboardWidgetPrefs(prefs);
    closeDashboardWidgetPicker();
    rerenderDashboardFromWidgetChange();
    scrollDashboardWidgetIntoView(id);
  }

  function addDashboardWidgetFromLens(id) {
    showDashboardWidget(id);
    if (state.currentView && state.currentView !== 'dashboard') navigateDashboardRoute(state.currentView);
    showNotification('Added to Dashboard', 'success');
  }

  function removeDashboardWidgetFromLens(id) {
    if (!getAvailableDashboardFixedWidgetIds().includes(id)) return;
    const prefs = getDashboardWidgetPrefs();
    if (!prefs.hidden.includes(id)) prefs.hidden.push(id);
    saveDashboardWidgetPrefs(prefs);
    if (state.currentView === 'dashboard') rerenderDashboardFromWidgetChange();
    else if (state.currentView) navigateDashboardRoute(state.currentView);
    showNotification('Removed from Dashboard', 'info');
  }

  function addDashboardMarkerWidget(markerId) {
    const widgetId = dashboardMarkerWidgetId(markerId);
    if (!widgetId) return;
    const hit = getDashboardMarkerById(getActiveData(), markerId);
    if (!hit) {
      showNotification('That marker has no data yet', 'info');
      return;
    }
    const prefs = getDashboardWidgetPrefs();
    insertDashboardWidgetAtViewport(prefs, widgetId);
    saveDashboardWidgetPrefs(prefs);
    closeDashboardWidgetPicker();
    rerenderDashboardFromWidgetChange();
    scrollDashboardWidgetIntoView(widgetId);
  }

  function addDashboardBiometricMetric(metricId) {
    if (!safeMarkerId(metricId) || !canonicalMetric(metricId)) return;
    if (!getDashboardBiometricTile(metricId, { allowEmptyManual: true })) {
      showNotification('That biometric has no data yet', 'info');
      return;
    }
    const selected = getDashboardBiometricSelection();
    if (!selected.includes(metricId)) saveDashboardBiometricSelection([...selected, metricId]);
    const prefs = getDashboardWidgetPrefs();
    const wasHidden = prefs.hidden.includes('wearables');
    prefs.hidden = prefs.hidden.filter(id => id !== 'wearables');
    if (wasHidden) prefs.order = prefs.order.filter(id => id !== 'wearables');
    if (wasHidden || !prefs.order.includes('wearables')) insertDashboardWidgetAtViewport(prefs, 'wearables');
    saveDashboardWidgetPrefs(prefs);
    closeDashboardWidgetPicker();
    rerenderDashboardFromWidgetChange();
    scrollDashboardWidgetIntoView('wearables');
  }

  function addDashboardBiometricWidget(metricId) {
    addDashboardBiometricMetric(metricId);
  }

  function removeDashboardBiometricMetric(metricId) {
    const selected = getDashboardBiometricSelection().filter(id => id !== metricId);
    saveDashboardBiometricSelection(selected);
    rerenderDashboardFromWidgetChange();
  }

  function filterDashboardMarkerWidgetPicker(query = '') {
    filterDashboardPickerOptions('.dashboard-marker-widget-option', 'markerSearch', 'dashboard-marker-widget-empty', query);
  }

  function filterDashboardBiometricWidgetPicker(query = '') {
    filterDashboardPickerOptions('.dashboard-biometric-widget-option', 'biometricSearch', 'dashboard-biometric-widget-empty', query);
  }

  function resetDashboardWidgets() {
    resetDashboardWidgetPrefs();
    localStorage.removeItem(dashboardBiometricSelectionKey());
    organizeMode = false;
    rerenderDashboardFromWidgetChange();
  }

  function clearDashboardWidgets() {
    saveDashboardWidgetPrefs({
      order: [...getAvailableDashboardFixedWidgetIds()],
      hidden: [...getAvailableDashboardFixedWidgetIds()],
    });
    organizeMode = false;
    rerenderDashboardFromWidgetChange();
  }

  function openDashboardWidgetPickerOverlay(html, options = {}) {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    const overlay = template.content.firstElementChild;
    if (!(overlay instanceof HTMLElement)) return null;
    openAppendedModalOverlay(overlay, closeDashboardWidgetPicker, options);
    return overlay;
  }

  function openDashboardWidgetPicker() {
    closeDashboardWidgetPicker();
    const prefs = getDashboardWidgetPrefs();
    const hidden = getAvailableDashboardFixedWidgets().filter(def => prefs.hidden.includes(def.id));
    const hiddenList = renderDashboardPickerFixedGroups(hidden);
    const biometricOptions = getDashboardBiometricWidgetOptions();
    const biometricList = biometricOptions.length ? biometricOptions.map(renderDashboardBiometricWidgetOption).join('') : '';
    const markerOptions = getDashboardMarkerWidgetOptions(getActiveData(), prefs);
    const markerList = markerOptions.length ? markerOptions.map(renderDashboardMarkerWidgetOption).join('') : '';
    openDashboardWidgetPickerOverlay(`<div class="modal-overlay" id="dashboard-widget-picker-overlay" data-dashboard-widget-overlay>
      <div class="modal dashboard-widget-picker" role="dialog" aria-modal="true" aria-labelledby="dashboard-widget-picker-title">
        <button class="modal-close" aria-label="Close" ${dashboardWidgetActionAttrs('close-picker')}>&times;</button>
        <h3 id="dashboard-widget-picker-title">Add dashboard widget</h3>
        <div class="dashboard-widget-picker-section">
          <div class="dashboard-widget-picker-label">Lens and tool widgets</div>
          <div class="dashboard-widget-picker-grid">${hiddenList}</div>
        </div>
        <div class="dashboard-widget-picker-section">
          <label class="dashboard-widget-picker-label" for="dashboard-biometric-widget-search">Body / Biometrics Overview metrics</label>
          <input id="dashboard-biometric-widget-search" class="dashboard-widget-picker-search" type="search" placeholder="Search biometrics to add" ${dashboardWidgetInputAttrs('filter-biometric-picker')}>
          <div class="dashboard-widget-picker-grid dashboard-biometric-widget-grid">${biometricList}</div>
          <div class="dashboard-widget-picker-empty" id="dashboard-biometric-widget-empty" ${biometricOptions.length ? 'hidden' : ''}>All available biometrics are already in the overview.</div>
        </div>
        <div class="dashboard-widget-picker-section">
          <label class="dashboard-widget-picker-label" for="dashboard-marker-widget-search">Labs / Single marker widgets</label>
          <input id="dashboard-marker-widget-search" class="dashboard-widget-picker-search" type="search" placeholder="Search markers" ${dashboardWidgetInputAttrs('filter-marker-picker')}>
          <div class="dashboard-widget-picker-grid dashboard-marker-widget-grid">${markerList}</div>
          <div class="dashboard-widget-picker-empty" id="dashboard-marker-widget-empty" ${markerOptions.length ? 'hidden' : ''}>No available markers to add.</div>
        </div>
        <div class="dashboard-widget-picker-actions">
          <button type="button" class="dashboard-action-btn" ${dashboardWidgetActionAttrs('customize-layout')}>Customize layout</button>
          <button type="button" class="dashboard-action-btn" ${dashboardWidgetActionAttrs('reset-layout')}>Reset layout</button>
        </div>
      </div>
    </div>`);
  }

  function openDashboardBiometricPicker() {
    closeDashboardWidgetPicker();
    const biometricOptions = getDashboardBiometricWidgetOptions();
    const biometricList = biometricOptions.length ? biometricOptions.map(renderDashboardBiometricWidgetOption).join('') : '';
    openDashboardWidgetPickerOverlay(`<div class="modal-overlay" id="dashboard-widget-picker-overlay" data-dashboard-widget-overlay>
      <div class="modal dashboard-widget-picker dashboard-biometric-picker" role="dialog" aria-modal="true" aria-labelledby="dashboard-biometric-picker-title">
        <button class="modal-close" aria-label="Close" ${dashboardWidgetActionAttrs('close-picker')}>&times;</button>
        <h3 id="dashboard-biometric-picker-title">Add biometric metrics</h3>
        <div class="dashboard-widget-picker-section">
          <label class="dashboard-widget-picker-label" for="dashboard-biometric-widget-search">Manual and wearable metrics</label>
          <input id="dashboard-biometric-widget-search" class="dashboard-widget-picker-search" type="search" placeholder="Search biometrics to add" ${dashboardWidgetInputAttrs('filter-biometric-picker')}>
          <div class="dashboard-widget-picker-grid dashboard-biometric-widget-grid">${biometricList}</div>
          <div class="dashboard-widget-picker-empty" id="dashboard-biometric-widget-empty" ${biometricOptions.length ? 'hidden' : ''}>All available biometrics are already in the overview.</div>
        </div>
        <div class="dashboard-widget-picker-actions">
          <button type="button" class="dashboard-action-btn" ${dashboardWidgetActionAttrs('connect-source')}>Connect source</button>
        </div>
      </div>
    </div>`, { initialFocus: '#dashboard-biometric-widget-search', focusDelay: 50 });
  }

  function closeDashboardWidgetPicker() {
    const overlay = document.getElementById('dashboard-widget-picker-overlay');
    if (overlay) removeModalOverlay(overlay);
  }

  function startDashboardWidgetDrag(event, id, dragEl = event.currentTarget) {
    draggingWidgetId = id;
    event.dataTransfer?.setData('text/plain', id);
    event.dataTransfer?.setDragImage?.(dragEl, 20, 20);
  }

  function allowDashboardWidgetDrop(event) {
    if (!organizeMode) return;
    event.preventDefault();
  }

  function dropDashboardWidget(event, targetId) {
    if (!organizeMode) return;
    event.preventDefault();
    const sourceId = event.dataTransfer?.getData('text/plain') || draggingWidgetId;
    draggingWidgetId = null;
    if (!sourceId || sourceId === targetId) return;
    const prefs = getDashboardWidgetPrefs();
    const from = prefs.order.indexOf(sourceId);
    const to = prefs.order.indexOf(targetId);
    if (from < 0 || to < 0) return;
    prefs.order.splice(from, 1);
    prefs.order.splice(to, 0, sourceId);
    saveDashboardWidgetPrefs(prefs);
    rerenderDashboardFromWidgetChange();
  }

  installDashboardWidgetControlDelegates();

  return {
    isOrganizeMode,
    renderDashboardControlButtons,
    renderDashboardStickyControls,
    renderDashboardWidget,
    toggleDashboardOrganizeMode,
    moveDashboardWidget,
    hideDashboardWidget,
    showDashboardWidget,
    addDashboardWidgetFromLens,
    removeDashboardWidgetFromLens,
    addDashboardMarkerWidget,
    addDashboardBiometricMetric,
    addDashboardBiometricWidget,
    removeDashboardBiometricMetric,
    filterDashboardMarkerWidgetPicker,
    filterDashboardBiometricWidgetPicker,
    resetDashboardWidgets,
    clearDashboardWidgets,
    openDashboardWidgetPicker,
    openDashboardBiometricPicker,
    closeDashboardWidgetPicker,
    startDashboardWidgetDrag,
    allowDashboardWidgetDrop,
    dropDashboardWidget,
  };
}
