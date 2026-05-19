// dashboard-widget-controls.js - dashboard widget controls, picker, and layout actions

import { DASHBOARD_WIDGET_SOURCE_ORDER, dashboardBiometricSelectionKey } from './dashboard-widgets.js';
import { escapeAttr, escapeHTML, formatValue, getStatus, safeMarkerId, showNotification } from './utils.js';

export function createDashboardWidgetControls(deps) {
  let organizeMode = false;
  let draggingWidgetId = null;

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
    return `<button class="dashboard-action-btn" type="button" onclick="window.toggleDashboardOrganizeMode()">${organizeLabel}</button>
      <button class="dashboard-action-btn dashboard-action-btn-primary" type="button" onclick="window.openDashboardWidgetPicker()">+ Add widget</button>
      ${includeReset || organizeMode ? `<button type="button" class="dashboard-action-btn" onclick="window.resetDashboardWidgets()">Reset layout</button>` : ''}`;
  }

  function renderDashboardStickyControls() {
    return `<div class="dashboard-sticky-actions" aria-label="Floating dashboard widget controls">${renderDashboardControlButtons()}</div>`;
  }

  function renderDashboardWidget(entry, prefs, index, visibleEntries) {
    const { def, body } = entry;
    const isHidden = prefs.hidden.includes(def.id);
    if (isHidden || (!body && !organizeMode)) return '';
    const canMoveUp = index > 0;
    const canMoveDown = index < visibleEntries.length - 1;
    const removeLabel = def.customMarkerWidget ? 'Remove' : 'Hide';
    const controls = organizeMode ? `<div class="dashboard-widget-tools">
        <button type="button" class="dashboard-widget-tool" ${canMoveUp ? '' : 'disabled'} onclick="window.moveDashboardWidget('${def.id}', -1)" aria-label="Move ${escapeHTML(def.title)} up">↑</button>
        <button type="button" class="dashboard-widget-tool" ${canMoveDown ? '' : 'disabled'} onclick="window.moveDashboardWidget('${def.id}', 1)" aria-label="Move ${escapeHTML(def.title)} down">↓</button>
        <button type="button" class="dashboard-widget-tool" onclick="window.hideDashboardWidget('${def.id}')" aria-label="${removeLabel} ${escapeHTML(def.title)}">${removeLabel}</button>
      </div>` : '';
    return `<section class="dashboard-widget dashboard-widget-${def.size || 'full'}${organizeMode ? ' is-organizing' : ''}${body ? '' : ' is-empty'}"
        data-widget-id="${escapeAttr(def.id)}"
        ${organizeMode ? `draggable="true" ondragstart="window.startDashboardWidgetDrag(event, '${def.id}')" ondragover="window.allowDashboardWidgetDrop(event)" ondrop="window.dropDashboardWidget(event, '${def.id}')"` : ''}>
      <div class="dashboard-widget-chrome">
        <div class="dashboard-widget-handle" aria-hidden="true">⋮⋮</div>
        <div class="dashboard-widget-heading">
          ${def.source ? `<div class="dashboard-widget-source">${escapeHTML(def.source)}</div>` : ''}
          <div class="dashboard-widget-title">${escapeHTML(def.title)}</div>
          <div class="dashboard-widget-description">${escapeHTML(def.description || '')}</div>
        </div>
        ${controls}
      </div>
      <div class="dashboard-widget-body">${body || '<div class="dashboard-widget-empty">No data available for this widget.</div>'}</div>
    </section>`;
  }

  function scrollDashboardWidgetIntoView(id) {
    if (!id || typeof document === 'undefined') return;
    requestAnimationFrame(() => {
      const el = [...document.querySelectorAll('.dashboard-widget[data-widget-id]')]
        .find(node => node.dataset.widgetId === id);
      el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
  }

  function getDashboardViewportTargetWidgetId() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return '';
    const targetLine = Math.max(120, window.innerHeight * 0.36);
    const widgets = [...document.querySelectorAll('.dashboard-widget[data-widget-id]')];
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

  function getDashboardBiometricWidgetOptions(prefs = getDashboardWidgetPrefs()) {
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
    return `<button type="button" class="dashboard-widget-picker-card dashboard-marker-widget-option" data-marker-search="${escapeAttr(searchText)}" onclick="window.addDashboardMarkerWidget('${option.id}')">
      <span class="dashboard-widget-picker-title">${escapeHTML(option.name)}</span>
      <span class="dashboard-widget-picker-sub">${escapeHTML(option.category)} · ${escapeHTML(option.value)}${option.unit ? ` ${escapeHTML(option.unit)}` : ''}</span>
      <span class="dashboard-widget-picker-action">Add marker widget</span>
    </button>`;
  }

  function renderDashboardBiometricWidgetOption(option) {
    const searchText = `${option.label} ${option.sub} ${option.value} ${option.unit} ${option.change}`.toLowerCase();
    return `<button type="button" class="dashboard-widget-picker-card dashboard-biometric-widget-option" data-biometric-search="${escapeAttr(searchText)}" onclick="window.addDashboardBiometricMetric('${option.id}')">
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
        <div class="dashboard-widget-picker-grid">${groups.get(source).map(def => `<button type="button" class="dashboard-widget-picker-card" onclick="window.showDashboardWidget('${def.id}')">
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
    if (state.currentView && state.currentView !== 'dashboard') window.navigate?.(state.currentView);
    showNotification('Added to Dashboard', 'success');
  }

  function removeDashboardWidgetFromLens(id) {
    if (!getAvailableDashboardFixedWidgetIds().includes(id)) return;
    const prefs = getDashboardWidgetPrefs();
    if (!prefs.hidden.includes(id)) prefs.hidden.push(id);
    saveDashboardWidgetPrefs(prefs);
    if (state.currentView === 'dashboard') rerenderDashboardFromWidgetChange();
    else if (state.currentView) window.navigate?.(state.currentView);
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

  function openDashboardWidgetPicker() {
    closeDashboardWidgetPicker();
    const prefs = getDashboardWidgetPrefs();
    const hidden = getAvailableDashboardFixedWidgets().filter(def => prefs.hidden.includes(def.id));
    const hiddenList = renderDashboardPickerFixedGroups(hidden);
    const biometricOptions = getDashboardBiometricWidgetOptions(prefs);
    const biometricList = biometricOptions.length ? biometricOptions.map(renderDashboardBiometricWidgetOption).join('') : '';
    const markerOptions = getDashboardMarkerWidgetOptions(getActiveData(), prefs);
    const markerList = markerOptions.length ? markerOptions.map(renderDashboardMarkerWidgetOption).join('') : '';
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-overlay show" id="dashboard-widget-picker-overlay" onclick="if(event.target===this)window.closeDashboardWidgetPicker()">
      <div class="modal show dashboard-widget-picker" role="dialog" aria-modal="true" aria-labelledby="dashboard-widget-picker-title">
        <button class="modal-close" aria-label="Close" onclick="window.closeDashboardWidgetPicker()">&times;</button>
        <h3 id="dashboard-widget-picker-title">Add dashboard widget</h3>
        <div class="dashboard-widget-picker-section">
          <div class="dashboard-widget-picker-label">Lens and tool widgets</div>
          <div class="dashboard-widget-picker-grid">${hiddenList}</div>
        </div>
        <div class="dashboard-widget-picker-section">
          <label class="dashboard-widget-picker-label" for="dashboard-biometric-widget-search">Body / Biometrics Overview metrics</label>
          <input id="dashboard-biometric-widget-search" class="dashboard-widget-picker-search" type="search" placeholder="Search biometrics to add" oninput="window.filterDashboardBiometricWidgetPicker(this.value)">
          <div class="dashboard-widget-picker-grid dashboard-biometric-widget-grid">${biometricList}</div>
          <div class="dashboard-widget-picker-empty" id="dashboard-biometric-widget-empty" ${biometricOptions.length ? 'hidden' : ''}>All available biometrics are already in the overview.</div>
        </div>
        <div class="dashboard-widget-picker-section">
          <label class="dashboard-widget-picker-label" for="dashboard-marker-widget-search">Labs / Single marker widgets</label>
          <input id="dashboard-marker-widget-search" class="dashboard-widget-picker-search" type="search" placeholder="Search markers" oninput="window.filterDashboardMarkerWidgetPicker(this.value)">
          <div class="dashboard-widget-picker-grid dashboard-marker-widget-grid">${markerList}</div>
          <div class="dashboard-widget-picker-empty" id="dashboard-marker-widget-empty" ${markerOptions.length ? 'hidden' : ''}>No available markers to add.</div>
        </div>
        <div class="dashboard-widget-picker-actions">
          <button type="button" class="dashboard-action-btn" onclick="window.toggleDashboardOrganizeMode(true);window.closeDashboardWidgetPicker()">Customize layout</button>
          <button type="button" class="dashboard-action-btn" onclick="window.resetDashboardWidgets();window.closeDashboardWidgetPicker()">Reset layout</button>
        </div>
      </div>
    </div>`);
  }

  function openDashboardBiometricPicker() {
    closeDashboardWidgetPicker();
    const prefs = getDashboardWidgetPrefs();
    const biometricOptions = getDashboardBiometricWidgetOptions(prefs);
    const biometricList = biometricOptions.length ? biometricOptions.map(renderDashboardBiometricWidgetOption).join('') : '';
    document.body.insertAdjacentHTML('beforeend', `<div class="modal-overlay show" id="dashboard-widget-picker-overlay" onclick="if(event.target===this)window.closeDashboardWidgetPicker()">
      <div class="modal show dashboard-widget-picker dashboard-biometric-picker" role="dialog" aria-modal="true" aria-labelledby="dashboard-biometric-picker-title">
        <button class="modal-close" aria-label="Close" onclick="window.closeDashboardWidgetPicker()">&times;</button>
        <h3 id="dashboard-biometric-picker-title">Add biometric metrics</h3>
        <div class="dashboard-widget-picker-section">
          <label class="dashboard-widget-picker-label" for="dashboard-biometric-widget-search">Manual and wearable metrics</label>
          <input id="dashboard-biometric-widget-search" class="dashboard-widget-picker-search" type="search" placeholder="Search biometrics to add" oninput="window.filterDashboardBiometricWidgetPicker(this.value)">
          <div class="dashboard-widget-picker-grid dashboard-biometric-widget-grid">${biometricList}</div>
          <div class="dashboard-widget-picker-empty" id="dashboard-biometric-widget-empty" ${biometricOptions.length ? 'hidden' : ''}>All available biometrics are already in the overview.</div>
        </div>
        <div class="dashboard-widget-picker-actions">
          <button type="button" class="dashboard-action-btn" onclick="window.openSettingsModal && window.openSettingsModal('wearables');window.closeDashboardWidgetPicker()">Connect source</button>
        </div>
      </div>
    </div>`);
    setTimeout(() => document.getElementById('dashboard-biometric-widget-search')?.focus(), 0);
  }

  function closeDashboardWidgetPicker() {
    document.getElementById('dashboard-widget-picker-overlay')?.remove();
  }

  function startDashboardWidgetDrag(event, id) {
    draggingWidgetId = id;
    event.dataTransfer?.setData('text/plain', id);
    event.dataTransfer?.setDragImage?.(event.currentTarget, 20, 20);
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
