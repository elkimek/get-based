// views.js — Navigate, dashboard, category views, and shared view composition

import { state } from './state.js';
import { escapeHTML, escapeAttr, getStatus, formatDate, safeMarkerId } from './utils.js';
import { getActiveData, filterDatesByRange, destroyAllCharts, getEffectiveRangeForDate, getLatestValueIndex, countFlagged, renderDateRangeFilter, renderChartLayersDropdown } from './data.js';
import { profileStorageKey } from './profile.js';
import { createLineChart } from './charts.js';
import { canonicalMetric } from './wearable-adapters.js';
import { loadContextHealthDots } from './context-cards.js';
import { hasAIProvider, isAIPaused } from './api.js';
import { loadPdfImport } from './import-loader.js';
import { createNavigate, getInitialView as getRouterInitialView } from './views-router.js';
import { createLensPageHandlers } from './lens-pages.js';
import { configureLensPageShell, inlineHandlerCall, renderLensHeader, renderLensPageWidgets, renderLensWidget, moveLensPageWidget } from './lens-page-shell.js';
import { createDashboardWidgetRegistry } from './dashboard-widgets.js';
import { createDashboardWidgetControls } from './dashboard-widget-controls.js';
import { createDashboardWidgetRenderers } from './dashboard-widget-renderers.js';
import { renderFocusCard, buildFocusContext, loadFocusCard, refreshFocusCard } from './focus-card.js';
import { configureOnboardingView, renderOnboardingBanner, renderAIConnectionReminder, dismissAIReminder, openChatProviderQuiz, setOnboardingFocus, completeOnboardingSex, completeOnboardingProfile, dismissOnboarding } from './onboarding-view.js';
import { loadChartCardRecs } from './chart-card-recs.js';
import { renderCategoryGlyph } from './category-glyphs.js';
import { renderChartCard, renderTableColgroup, renderScrollableTableShell, renderTableView, renderHeatmapView, renderFattyAcidsView, renderFattyAcidsCharts } from './category-view-renderers.js';
import { configureCategoryCustomization, renameCategory, renameMarker, revertMarkerName, showEmojiPicker, changeCategoryIcon } from './category-customization.js';
import { loadCommitHash } from './commit-hash.js';
import { renderLightConditionsWidgetBody, renderConditionsNow, _refreshConditionsNow, _inspectConditionsNow, _setManualUvi, _clearManualUvi } from './light-conditions-now.js';
import { _openAllSessionsModal } from './light-sessions-view.js';
import { _toggleChannelDetail, _openChannelOnLightPage } from './light-channel-view.js';
import {
  showLight,
  _expandLightToolsSection,
  renderLightTodayStrip,
  renderLightChannelsLive,
  renderDashboardLightChannelPills,
  renderLightSessionLogActions,
} from './light-page-view.js';
import {
  configureMobileDashboardView,
  isMobileDashboardViewport,
  syncMobileBottomNav,
  refreshMobileDashboardActiveTab,
  getMobileDashboardProfile,
  getMobileGreetingName,
  getMobileDashboardCounts,
  getMobileDashboardMarkers,
  getMobileDashboardInsights,
  getMobileWearableTiles,
  formatMobileWearableValue,
  formatMobileWearableDelta,
  getMobileWearablePriority,
  mobileDashboardSetTab,
  openMobileDashboardSearch,
  mobileDashboardJump,
  renderMobileDashboard,
} from './mobile-dashboard.js';
import {
  configureCompareCorrelationViews,
  showCompare,
  setCompareDate1,
  setCompareDate2,
  updateCompare,
  swapCompareDates,
  renderCompareTable,
  showCorrelations,
  populateCorrelationOptions,
  showCorrelationDropdown,
  filterCorrelationOptions,
  toggleCorrelationMarker,
  applyCorrelationPreset,
  renderCorrelationChips,
  renderCorrelationChart,
} from './compare-correlations.js';
import {
  configureMarkerDetailModal,
  fetchCustomMarkerDescription,
  showDetailModal,
  editRefRange,
  saveRefRange,
  revertRefRange,
  openManualEntryForm,
  saveManualEntry,
  saveAndAddAnotherManualEntry,
  openCreateMarkerModal,
  pickNewCatIcon,
  saveCustomMarker,
  deleteMarkerValue,
  deleteCustomMarker,
  editMarkerValue,
  revertMarkerValue,
  editValueNote,
  deleteValueNote,
  toggleMarkerNoteEditor,
  saveMarkerNote,
  deleteMarkerNote,
  closeModal,
  rememberModalTrigger,
} from './marker-detail-modal.js';
export {
  refreshMobileDashboardActiveTab,
  mobileDashboardSetTab,
  openMobileDashboardSearch,
  mobileDashboardJump,
  renderFocusCard,
  buildFocusContext,
  loadFocusCard,
  refreshFocusCard,
  renderOnboardingBanner,
  renderAIConnectionReminder,
  dismissAIReminder,
  openChatProviderQuiz,
  setOnboardingFocus,
  completeOnboardingSex,
  completeOnboardingProfile,
  dismissOnboarding,
  showCompare,
  setCompareDate1,
  setCompareDate2,
  updateCompare,
  swapCompareDates,
  renderCompareTable,
  showCorrelations,
  populateCorrelationOptions,
  showCorrelationDropdown,
  filterCorrelationOptions,
  toggleCorrelationMarker,
  applyCorrelationPreset,
  renderCorrelationChips,
  renderCorrelationChart,
  renderChartCard,
  renderTableView,
  renderHeatmapView,
  renderFattyAcidsView,
  renderFattyAcidsCharts,
  showLight,
  renderLightTodayStrip,
  renderLightChannelsLive,
  moveLensPageWidget,
  fetchCustomMarkerDescription,
  showDetailModal,
  editRefRange,
  saveRefRange,
  revertRefRange,
  openManualEntryForm,
  saveManualEntry,
  saveAndAddAnotherManualEntry,
  openCreateMarkerModal,
  pickNewCatIcon,
  saveCustomMarker,
  deleteMarkerValue,
  deleteCustomMarker,
  editMarkerValue,
  revertMarkerValue,
  editValueNote,
  deleteValueNote,
  toggleMarkerNoteEditor,
  saveMarkerNote,
  deleteMarkerNote,
  closeModal,
  rememberModalTrigger,
};

function setupDropZone() {
  const dropZone = document.getElementById("drop-zone");
  if (!dropZone || dropZone.dataset.lazyDropZoneBound === 'true') return;
  dropZone.dataset.lazyDropZoneBound = 'true';
  dropZone.addEventListener("click", () => {
    if (window.isImportRunning && window.isImportRunning()) return;
    document.getElementById('pdf-input')?.click();
  });
  dropZone.addEventListener("dragover", e => {
    e.preventDefault();
    if (!(window.isImportRunning && window.isImportRunning())) dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", e => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
  });
  dropZone.addEventListener("drop", async e => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    if (window.isImportRunning && window.isImportRunning()) {
      window.showNotification?.("Import already in progress", "info");
      return;
    }
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length === 0) return;
    let importMod;
    try {
      importMod = await loadPdfImport();
    } catch (err) {
      window.showNotification?.('Could not load import module - check your connection and try again.', 'error');
      return;
    }
    const { jsonFiles, pdfFiles, imageFiles, dnaFiles, textFiles, unsupportedCount } = await importMod.classifyImportFiles(files);
    if (unsupportedCount > 0 && jsonFiles.length === 0 && pdfFiles.length === 0 && imageFiles.length === 0 && dnaFiles.length === 0 && textFiles.length === 0) {
      window.showNotification?.("Unsupported file type. Use PDF, text, image, JSON, or DNA raw data (.txt/.csv).", "error");
      return;
    }
    for (const f of jsonFiles) window.importDataJSON(f);
    if (dnaFiles.length > 0) {
      for (const f of dnaFiles) {
        const header = await f.slice(0, 1500).text();
        const fmt = window.detectDNAFile ? window.detectDNAFile(header) : null;
        if ((fmt === 'mtdna' || fmt === '23andme-mito') && window.handleMtDNAFile) await window.handleMtDNAFile(f);
        else if (fmt === '23andme-y') { window.showNotification?.('Y-chromosome DNA files are not supported', 'info'); }
        else await window.handleDNAFile(f);
      }
    }
    else if (textFiles.length > 0) { for (const f of textFiles) await importMod.handleTextFile(f); }
    else if (imageFiles.length > 0) { for (const f of imageFiles) await importMod.handleImageFile(f); }
    else {
      if (pdfFiles.length === 1) await importMod.handlePDFFile(pdfFiles[0]);
      else if (pdfFiles.length > 1) await importMod.handleBatchPDFs(pdfFiles);
    }
  });
}

function markerHasData(m) { return m.values?.some(v => v !== null) ?? false; }
function sortCategoryChartEntries(entries, categoryKey) {
  const preserved = state._preserveCategoryCardOrder;
  if (preserved?.categoryKey === categoryKey && Array.isArray(preserved.markerKeys)) {
    const order = new Map(preserved.markerKeys.map((key, index) => [key, index]));
    entries.sort(([ka], [kb]) => (order.get(ka) ?? Number.MAX_SAFE_INTEGER) - (order.get(kb) ?? Number.MAX_SAFE_INTEGER));
    delete state._preserveCategoryCardOrder;
    return;
  }
  delete state._preserveCategoryCardOrder;

  // Default category landing sort: markers with catalog slots first, then
  // by status (out-of-range before normal).
  const catalog = window._cachedCatalog;
  const hasSlot = (k) => catalog?.slots?.[categoryKey + '.' + k] ? 0 : 1;
  const statusOrder = { high: 0, low: 0, normal: 1, missing: 2 };
  entries.sort(([ka, a], [kb, b]) => {
    const slotDiff = hasSlot(ka) - hasSlot(kb);
    if (slotDiff !== 0) return slotDiff;
    const ai = getLatestValueIndex(a.values), bi = getLatestValueIndex(b.values);
    const ar = ai !== -1 ? getEffectiveRangeForDate(a, ai) : { min: null, max: null };
    const br = bi !== -1 ? getEffectiveRangeForDate(b, bi) : { min: null, max: null };
    const as = ai !== -1 ? getStatus(a.values[ai], ar.min, ar.max) : 'missing';
    const bs = bi !== -1 ? getStatus(b.values[bi], br.min, br.max) : 'missing';
    return (statusOrder[as] ?? 2) - (statusOrder[bs] ?? 2);
  });
}
function setDetailModalShell(...classes) {
  const modal = document.getElementById('detail-modal');
  if (!modal) return null;
  modal.className = ['modal', ...classes.filter(Boolean)].join(' ');
  return modal;
}

// ═══════════════════════════════════════════════
// NAVIGATE (router)
// ═══════════════════════════════════════════════

export function getInitialView() {
  return getRouterInitialView();
}

export function showLabs(preData) { return lensPageHandlers.showLabs(preData); }
export function showGenomeLens() { return lensPageHandlers.showGenomeLens(); }
export function showBodyLens() { return lensPageHandlers.showBodyLens(); }
export function showInsightLens(preData) { return lensPageHandlers.showInsightLens(preData); }
export function showRecommendations(preData) { return lensPageHandlers.showRecommendations(preData); }

const _navigate = createNavigate({
  routeHandlers: {
    dashboard: showDashboard,
    labs: showLabs,
    genome: showGenomeLens,
    body: showBodyLens,
    insight: showInsightLens,
    recommendations: showRecommendations,
    correlations: showCorrelations,
    compare: showCompare,
    light: showLight,
    category: showCategory,
  },
  syncMobileBottomNav,
  destroyAllCharts,
});

export function navigate(category, data) {
  return _navigate(category, data);
}

configureOnboardingView({ navigate });
configureCategoryCustomization({ navigate });

// ═══════════════════════════════════════════════
// DASHBOARD WIDGETS
// ═══════════════════════════════════════════════

let dashboardWidgetControls;

const dashboardWidgetRenderers = createDashboardWidgetRenderers({
  markerHasData,
  renderDashboardLightChannelPills,
  renderLightConditionsWidgetBody,
  renderLightSessionLogActions,
  getMobileDashboardMarkers,
  getMobileDashboardInsights,
  getMobileWearableTiles,
  formatMobileWearableValue,
  formatMobileWearableDelta,
  getMobileWearablePriority,
  rerenderDashboardFromWidgetChange,
  showRecommendations,
});

const {
  buildDashboardWidgetContext,
  getCachedRecommendationsCatalog,
  refreshRecommendationsWhenCatalogReady,
  getGlobalRecommendationCandidates,
  renderRecommendationCard,
  renderRecommendationsEmpty,
  renderDashboardBioAgeWidget,
  renderDashboardRecommendationsWidget,
  renderDashboardSpotlightWidget,
  renderDashboardWearableTilesWidget,
  renderDashboardQuickMarkersWidget,
  renderDashboardInsightsListWidget,
  renderDashboardGenomeWidget,
  renderDashboardAlertsWidget,
  renderDashboardCorrelationWidget,
  renderDashboardLightTodayWidget,
  renderDashboardLightConditionsWidget,
  renderDashboardLightSessionLogWidget,
  renderDashboardLightChannelsWidget,
  renderDashboardKeyTrendsWidget,
  renderDashboardNotesWidget,
  renderLabsPriorityBanner,
  getDashboardMarkerById,
  getDashboardBiometricSelection,
  saveDashboardBiometricSelection,
  getDashboardBiometricMetricOrder,
  getDashboardBiometricTile,
  renderDashboardSingleMarkerWidget,
  isDashboardQuickMarkerPinned,
  toggleDashboardQuickMarkerPin,
} = dashboardWidgetRenderers;

configureMarkerDetailModal({ navigate, isDashboardQuickMarkerPinned, showEmojiPicker });

const dashboardWidgetRegistry = createDashboardWidgetRegistry({
  renderDashboardBioAgeWidget,
  renderFocusCard,
  renderDashboardRecommendationsWidget,
  renderDashboardSpotlightWidget,
  renderDashboardWearableTilesWidget,
  renderDashboardQuickMarkersWidget,
  renderDashboardInsightsListWidget,
  renderDashboardGenomeWidget,
  renderDashboardAlertsWidget,
  renderDashboardCorrelationWidget,
  renderDashboardLightTodayWidget,
  renderDashboardLightConditionsWidget,
  renderDashboardLightSessionLogWidget,
  renderDashboardLightChannelsWidget,
  renderDashboardKeyTrendsWidget,
  renderDashboardNotesWidget,
}, {
  getDashboardMarkerWidgetDefinition,
  isOrganizeMode: () => dashboardWidgetControls?.isOrganizeMode() || false,
});

const {
  getAvailableDashboardFixedWidgets,
  getAvailableDashboardFixedWidgetIds,
  dashboardMarkerWidgetId,
  dashboardMarkerIdFromWidgetId,
  isDashboardMarkerWidgetId,
  getDashboardWidgetPrefs,
  saveDashboardWidgetPrefs,
  resetDashboardWidgetPrefs,
  getVisibleDashboardWidgetEntries,
} = dashboardWidgetRegistry;

dashboardWidgetControls = createDashboardWidgetControls({
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
});

const {
  renderDashboardControlButtons,
  renderDashboardStickyControls,
  renderDashboardWidget,
} = dashboardWidgetControls;

configureLensPageShell({
  getAvailableDashboardFixedWidgetIds,
  getDashboardWidgetPrefs,
});

configureMobileDashboardView({
  buildDashboardWidgetContext,
  getDashboardWidgetPrefs,
  getVisibleDashboardWidgetEntries,
  renderDashboardControlButtons,
  isDashboardOrganizeMode: () => dashboardWidgetControls.isOrganizeMode(),
  renderDashboardWidget,
  setupDropZone,
  loadCommitHash,
});

export const toggleDashboardOrganizeMode = (...args) => dashboardWidgetControls.toggleDashboardOrganizeMode(...args);
export const moveDashboardWidget = (...args) => dashboardWidgetControls.moveDashboardWidget(...args);
export const hideDashboardWidget = (...args) => dashboardWidgetControls.hideDashboardWidget(...args);
export const showDashboardWidget = (...args) => dashboardWidgetControls.showDashboardWidget(...args);
export const addDashboardWidgetFromLens = (...args) => dashboardWidgetControls.addDashboardWidgetFromLens(...args);
export const removeDashboardWidgetFromLens = (...args) => dashboardWidgetControls.removeDashboardWidgetFromLens(...args);
export const addDashboardMarkerWidget = (...args) => dashboardWidgetControls.addDashboardMarkerWidget(...args);
export const addDashboardBiometricMetric = (...args) => dashboardWidgetControls.addDashboardBiometricMetric(...args);
export const addDashboardBiometricWidget = (...args) => dashboardWidgetControls.addDashboardBiometricWidget(...args);
export const removeDashboardBiometricMetric = (...args) => dashboardWidgetControls.removeDashboardBiometricMetric(...args);
export const filterDashboardMarkerWidgetPicker = (...args) => dashboardWidgetControls.filterDashboardMarkerWidgetPicker(...args);
export const filterDashboardBiometricWidgetPicker = (...args) => dashboardWidgetControls.filterDashboardBiometricWidgetPicker(...args);
export const resetDashboardWidgets = (...args) => dashboardWidgetControls.resetDashboardWidgets(...args);
export const clearDashboardWidgets = (...args) => dashboardWidgetControls.clearDashboardWidgets(...args);
export const openDashboardWidgetPicker = (...args) => dashboardWidgetControls.openDashboardWidgetPicker(...args);
export const openDashboardBiometricPicker = (...args) => dashboardWidgetControls.openDashboardBiometricPicker(...args);
export const closeDashboardWidgetPicker = (...args) => dashboardWidgetControls.closeDashboardWidgetPicker(...args);
export const startDashboardWidgetDrag = (...args) => dashboardWidgetControls.startDashboardWidgetDrag(...args);
export const allowDashboardWidgetDrop = (...args) => dashboardWidgetControls.allowDashboardWidgetDrop(...args);
export const dropDashboardWidget = (...args) => dashboardWidgetControls.dropDashboardWidget(...args);

function getDashboardMarkerWidgetDefinition(widgetId, ctx = null) {
  const markerId = dashboardMarkerIdFromWidgetId(widgetId);
  if (!markerId) return null;
  const hit = ctx ? (getDashboardMarkerById(ctx.data, markerId) || getDashboardMarkerById(ctx.filteredData, markerId)) : getDashboardMarkerById(getActiveData(), markerId);
  const title = hit?.marker?.name || markerId.replace(/_/g, ' ');
  const category = hit?.category?.label || 'Single marker';
  return {
    id: widgetId,
    title,
    source: 'Labs',
    description: `${category} marker widget`,
    size: 'quarter',
    customMarkerWidget: true,
    render: (renderCtx) => renderDashboardSingleMarkerWidget(renderCtx, markerId),
  };
}

function getDashboardProfileName() {
  const profile = getMobileDashboardProfile();
  const name = getMobileGreetingName(profile);
  return name === 'there' ? 'Dashboard' : name;
}

function getDashboardPanelCount(data) {
  return Object.values(data.categories || {}).filter(cat => {
    if (cat.singlePoint && cat.singleDate) return true;
    return Object.values(cat.markers || {}).some(markerHasData);
  }).length;
}

function getDashboardMonthSpan(data) {
  const dates = (data.dates || []).filter(Boolean);
  if (dates.length < 2) return '';
  const first = new Date(dates[0] + 'T00:00:00');
  const last = new Date(dates[dates.length - 1] + 'T00:00:00');
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return '';
  const months = Math.max(1, Math.round((last - first) / (1000 * 60 * 60 * 24 * 30.4375)));
  return `${months} month${months === 1 ? '' : 's'}`;
}

function renderDashboardGreeting(ctx, title, visibleCount) {
  const counts = getMobileDashboardCounts(ctx.data);
  const panelCount = getDashboardPanelCount(ctx.data);
  const span = getDashboardMonthSpan(ctx.data);
  const parts = [
    `${counts.inRange} of ${counts.markerCount || 0} markers in range`,
    counts.latestDate ? `last draw ${formatDate(counts.latestDate, 'short')}` : '',
    `${panelCount} panel${panelCount === 1 ? '' : 's'}${span ? ` across ${span}` : ''}`,
    `${visibleCount} widget${visibleCount === 1 ? '' : 's'} active`,
  ].filter(Boolean);
  return `<div class="category-header dashboard-greeting">
    <div>
      <div class="dashboard-greeting-kicker">${escapeHTML(title)}</div>
      <h1>Hey ${escapeHTML(getDashboardProfileName())}.</h1>
      <div class="dashboard-greeting-sub">${parts.map(escapeHTML).join(' · ')}</div>
    </div>
  </div>`;
}

function renderDashboardWidgets(ctx, title) {
  const prefs = getDashboardWidgetPrefs();
  const visibleEntries = getVisibleDashboardWidgetEntries(ctx, prefs);
  let html = renderDashboardGreeting(ctx, title, visibleEntries.length);
  html += `<div class="drop-zone drop-zone-hidden" id="drop-zone"></div>`;
  html += renderOnboardingBanner();
  html += renderAIConnectionReminder();
  html += renderDashboardStickyControls();
  html += `<div class="dashboard-widgets${dashboardWidgetControls.isOrganizeMode() ? ' is-organizing' : ''}">`;
  visibleEntries.forEach((entry, index) => { html += renderDashboardWidget(entry, prefs, index, visibleEntries); });
  if (visibleEntries.length === 0) {
    html += `<div class="dashboard-widget dashboard-widget-full is-empty">
      <div class="dashboard-widget-empty">No widgets are visible.</div>
    </div>`;
  }
  html += `</div>`;
  if (dashboardWidgetControls.isOrganizeMode()) {
    html += `<div class="dashboard-organize-footer">
      ${renderDashboardControlButtons({ includeReset: true })}
    </div>`;
  }
  return html;
}

const lensPageHandlers = createLensPageHandlers({
  setupDropZone,
  buildDashboardWidgetContext,
  renderLabsPriorityBanner,
  renderDashboardQuickMarkersWidget,
  renderDashboardKeyTrendsWidget,
  renderDashboardGenomeWidget,
  renderDashboardWearableTilesWidget,
  renderDashboardInsightsListWidget,
  renderDashboardRecommendationsWidget,
  renderFocusCard,
  loadFocusCard,
  getDashboardWidgetPrefs,
  getCachedRecommendationsCatalog,
  refreshRecommendationsWhenCatalogReady,
  getGlobalRecommendationCandidates,
  renderRecommendationCard,
  renderRecommendationsEmpty,
  inlineHandlerCall,
  renderLensHeader,
  renderLensPageWidgets,
  renderLensWidget,
});

export function openRecommendationDetail(slotKey, label = 'Recommendation', markerStatus = '') {
  const modal = setDetailModalShell('recommendation-detail-modal');
  const overlay = document.getElementById("modal-overlay");
  if (!modal || !overlay) return;
  modal.innerHTML = `<button class="modal-close" aria-label="Close" onclick="closeModal()">&times;</button>
    <h3>${escapeHTML(label || 'Recommendation')}</h3>
    <div class="dashboard-widget-empty">Loading options...</div>`;
  overlay.classList.add("show");
  window.renderRecommendationSection?.(slotKey, { label: 'Options', maxProducts: 4, markerStatus })
    .then(html => {
      modal.innerHTML = `<button class="modal-close" aria-label="Close" onclick="closeModal()">&times;</button>
        <h3>${escapeHTML(label || 'Recommendation')}</h3>
        ${html || '<div class="dashboard-widget-empty">No recommendation details available for this slot.</div>'}`;
    })
    .catch(() => {
      modal.innerHTML = `<button class="modal-close" aria-label="Close" onclick="closeModal()">&times;</button>
        <h3>${escapeHTML(label || 'Recommendation')}</h3>
        <div class="dashboard-widget-empty">Could not load recommendation details.</div>`;
    });
}

export function discussRecommendation(id) {
  const catalog = getCachedRecommendationsCatalog();
  const ctx = buildDashboardWidgetContext(getActiveData());
  const candidate = getGlobalRecommendationCandidates(ctx, catalog, { includeDismissed: true }).find(c => c.id === id);
  const prompt = candidate
    ? `Help me evaluate this recommendation from getbased.\nSource: ${candidate.source}\nRecommendation: ${candidate.label}\nReason: ${candidate.reason}\nSuggested first action: ${candidate.primaryAction || 'none listed'}\nWhat are the pros, cons, and safer non-product alternatives?`
    : 'Help me evaluate my current getbased recommendations. Which should I prioritize and why?';
  window.openChatPanel?.(prompt);
}

export function saveRecommendation(id, on = true) {
  dashboardWidgetRenderers.setRecommendationState('saved', id, !!on);
}

export function dismissRecommendation(id) {
  dashboardWidgetRenderers.setRecommendationState('dismissed', id, true);
}

function rerenderDashboardFromWidgetChange() {
  if (state.currentView === 'dashboard') window.navigate?.('dashboard');
}

Object.assign(window, {
  toggleDashboardOrganizeMode,
  moveDashboardWidget,
  moveLensPageWidget,
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
  toggleDashboardQuickMarkerPin,
  openDashboardWidgetPicker,
  openDashboardBiometricPicker,
  closeDashboardWidgetPicker,
  startDashboardWidgetDrag,
  allowDashboardWidgetDrop,
  dropDashboardWidget,
});

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════

export function showDashboard(data) {
  // Resume the live-session ticker if a session was started before this
  // page loaded — keeps the dashboard Light Today surface ticking after a
  // hard reload mid-session.
  if (window._resumeActiveTickerIfNeeded) try { window._resumeActiveTickerIfNeeded(); } catch (e) {}
  if (window.ensureActiveDeviceTicker) try { window.ensureActiveDeviceTicker(); } catch (e) {}
  if (!data) data = getActiveData();
  const main = document.getElementById("main-content");
  const wasMobileDashboardActive = document.body.classList.contains('mobile-dashboard-active');
  document.body.classList.remove('mobile-dashboard-active');
  const wearableMetrics = state.importedData?.wearableSummary?.metrics || {};
  const hasWearableData = Object.values(wearableMetrics).some(metric => metric?.latest != null);
  const hasData = data.dates.length > 0 || hasWearableData || Object.values(data.categories).some(c => c.singlePoint && c.singleDate);

  // Show/hide import FAB based on whether dashboard has data
  const importFab = document.getElementById('import-fab');
  if (importFab) importFab.classList.toggle('hidden', !hasData);

  // Clear any onboarding focus mode once the user has data — the
  // welcome-hero / context-details targets no longer exist in the
  // data view, so the dimmed-peer rules would be no-ops anyway,
  // but stripping the classes keeps body state clean.
  if (hasData) document.body.classList.remove('cards-focus', 'import-focus', 'chat-autostart-reserved', 'empty-dashboard-active');

  // ── Demo-load in flight: short-lived placeholder while
  //    importDataJSON parses the demo blob (typically 2–3s). Without
  //    this the empty Welcome hero flashes for the duration. The flag
  //    is set in loadDemoData() and cleared on import success/failure.
  if (!hasData && window._demoLoadingProfileId === state.currentProfile) {
    document.body.classList.add('empty-dashboard-active');
    main.innerHTML = `<div class="welcome-hero" aria-busy="true" role="status" aria-live="polite">
      <h2>Loading demo data…</h2>
      <p class="welcome-hero-subtitle">Setting up the demo profile — this takes a few seconds the first time.</p>
    </div>`;
    return;
  }

  // ── Empty state: chat-first welcome hero ──
  if (!hasData) {
    document.body.classList.add('empty-dashboard-active');
    document.body.classList.remove('chat-autostart-reserved');
    const aiReady = hasAIProvider();
    const aiPaused = isAIPaused();
    const importReady = aiReady && !aiPaused;
    const heroClass = importReady ? 'welcome-hero welcome-hero-ready' : 'welcome-hero welcome-hero-noai';
    const chatAction = "window.openChatPanel && window.openChatPanel()";
    const primaryTitle = aiPaused ? 'Resume guided chat' : 'Start with guided chat';
    const primaryCopy = aiPaused
      ? 'Chat will walk you through re-enabling AI before you add files, connect sources, or ask for recommendations.'
      : (aiReady
        ? 'Chat will ask for context only when it helps, then route you to labs, DNA, wearables, light, or first-test planning.'
        : 'Chat starts with the basics, then guides AI setup only when it is needed for import or recommendations.');
    const secondaryAction = aiPaused
      ? `<button type="button" class="welcome-action-btn" onclick="closeChatPanel();window.openSettingsModal('ai')">Re-enable AI</button>`
      : (importReady
        ? `<button type="button" class="welcome-action-btn welcome-direct-import-btn" onclick="document.getElementById('pdf-input')?.click()">Import directly</button>`
        : '');
    const primaryPanel = `<div class="welcome-primary-panel welcome-chat-panel">
        <span class="welcome-primary-kicker">Start here</span>
        <strong>${escapeHTML(primaryTitle)}</strong>
        <p>${escapeHTML(primaryCopy)}</p>
        <div class="welcome-primary-actions">
          <button type="button" class="welcome-action-btn welcome-action-primary" onclick="${chatAction}">Start guided chat</button>
          ${secondaryAction}
        </div>
      </div>
      <div class="drop-zone drop-zone-hidden" id="drop-zone"></div>`;
    let html = `${renderAIConnectionReminder()}<div class="${escapeHTML(heroClass)}">
      <h2>Welcome to getbased</h2>
      <p class="welcome-hero-subtitle">Health intelligence that's actually yours — five lenses on your biology, one private dashboard.</p>
      ${primaryPanel}
      <div class="welcome-demo-section">
        <span class="welcome-section-label">Preview with demo data</span>
        <div class="demo-cards">
          <button class="demo-card" onclick="loadDemoData('female')">
            <span class="demo-card-avatar">\uD83D\uDC69</span>
            <span class="demo-card-name">Sarah, 34</span>
            <span class="demo-card-desc">Iron + Oura: overtraining clues</span>
          </button>
          <button class="demo-card" onclick="loadDemoData('male')">
            <span class="demo-card-avatar">\uD83D\uDC68</span>
            <span class="demo-card-name">Alex, 38</span>
            <span class="demo-card-desc">Metabolic + Withings body comp</span>
          </button>
        </div>
      </div>
    </div>`;
    main.innerHTML = html;
    setupDropZone();
    // First visit starts the empty-state tour from the welcome screen.
    // Delay one tick so header/profile controls are rendered before targets
    // are filtered. If the user already completed it, fall through to chat onboarding.
    const shouldAutoStartEmptyTour = !!window.startEmptyTour && !localStorage.getItem(profileStorageKey(state.currentProfile, 'emptyTour'));
    if (shouldAutoStartEmptyTour) setTimeout(() => window.startEmptyTour?.(true), 100);
    // Returning desktop visitors get the guided chat setup beside the
    // welcome hero. Mobile keeps the welcome/import controls unobscured.
    const isDesktopChatOnboardingViewport = typeof window !== 'undefined' && window.innerWidth > 768;
    if (!shouldAutoStartEmptyTour && state.chatHistory.length === 0) {
      if (isDesktopChatOnboardingViewport && !document.getElementById('chat-panel')?.classList.contains('open')) {
        document.body.classList.add('chat-autostart-reserved');
      }
      setTimeout(() => {
        if (!isDesktopChatOnboardingViewport || window.innerWidth <= 768) return;
        const panel = document.getElementById('chat-panel');
        if (state.chatHistory.length > 0 || panel?.classList.contains('open')) {
          document.body.classList.remove('chat-autostart-reserved');
          return;
        }
        if (window.openChatPanel) window.openChatPanel();
        else document.body.classList.remove('chat-autostart-reserved');
      }, 800);
    }
    return;
  }

  if (isMobileDashboardViewport()) {
    renderMobileDashboard(data, { resetScroll: !wasMobileDashboardActive });
    return;
  }

  // ── Has data: full dashboard, rendered through modular widgets ──
  const dashboardCtx = buildDashboardWidgetContext(data);
  const dashboardTitle = 'Dashboard Overview';
  let html = renderDashboardWidgets(dashboardCtx, dashboardTitle);

  main.innerHTML = html;

  setupDropZone();

  // Non-blocking: hydrate cached focus text for LCP, but don't replace stale
  // cached text with a fresh AI response during startup.
  if (hasData) loadFocusCard({ refreshStale: false });
  loadContextHealthDots();
  if (window.loadContextCardTips) window.loadContextCardTips();
  loadCommitHash();
  // Preload catalog so rec sections and sorting use it immediately
  if (window.loadCatalog) window.loadCatalog().then(c => { window._cachedCatalog = c; });

  // Auto-trigger guided tour on first populated dashboard visit as a fallback
  // for users who imported before seeing the empty-state tour.
  const _p = window.getProfiles?.()?.find(p => p.id === state.currentProfile);
  const _hasProfile = _p?.name && _p.name !== 'Default' && state.profileSex;
  if (_hasProfile && hasData) {
    if (window.startTour) window.startTour(true);
  }
}

// ═══════════════════════════════════════════════
// CATEGORY VIEWS
// ═══════════════════════════════════════════════

export function showCategory(categoryKey, preData) {
  // categoryKey is interpolated into inline-onclick handlers below (rename,
  // switchView, showDetailModal). Reject anything that doesn't
  // match the strict allowlist so a poisoned customMarker key can't break
  // out of the JS string context.
  if (!safeMarkerId(categoryKey)) return;
  // Ensure catalog is preloaded for sorting and rec links
  if (window.loadCatalog && !window._cachedCatalog) window.loadCatalog().then(c => { window._cachedCatalog = c; });
  const rawData = preData || getActiveData();
  const data = filterDatesByRange(rawData);
  const cat = data.categories[categoryKey];
  const main = document.getElementById("main-content");
  const allEntries = Object.entries(cat.markers).filter(([, m]) => !m.hidden);
  const withData = allEntries.filter(([, m]) => markerHasData(m));
  const countLabel = withData.length < allEntries.length ? `${withData.length} of ${allEntries.length} biomarkers with data` : `${allEntries.length} biomarkers tracked`;
  const renameBtn = ` <span class="ref-edited-badge" role="button" tabindex="0" aria-label="Rename category" title="Rename category" onclick="event.stopPropagation();renameCategory('${categoryKey}')" style="cursor:pointer;font-size:12px">rename</span>`;
  let html = `<div class="category-header"><h2>${renderCategoryGlyph(categoryKey, cat.label)}<span class="category-title-text">${escapeHTML(cat.label)}</span>${renameBtn}</h2>
    <p>${countLabel}</p></div>`;

  html += `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:20px">`;
  html += `<div class="view-toggle" role="tablist" aria-label="View mode" style="margin-bottom:0">
    <button class="view-btn active" role="tab" aria-selected="true" tabindex="0" onclick="switchView('charts','${categoryKey}',this)">Charts</button>
    <button class="view-btn" role="tab" aria-selected="false" tabindex="-1" onclick="switchView('table','${categoryKey}',this)">Table</button>
    <button class="view-btn" role="tab" aria-selected="false" tabindex="-1" onclick="switchView('heatmap','${categoryKey}',this)">Heatmap</button></div>`;
  html += renderDateRangeFilter();
  html += renderChartLayersDropdown();
  html += `</div>`;

  html += `<div id="view-content">`;
  if (withData.length === 0) {
    html += `<div class="empty-state"><div class="empty-state-icon empty-state-icon-category">${renderCategoryGlyph(categoryKey, cat.label, { large: true })}</div>
      <h3>No Data Available</h3><p>Import lab results containing ${escapeHTML(cat.label.toLowerCase())} markers to see data here.</p></div>`;
  } else if (cat.singleDate) {
    html += renderFattyAcidsView(cat, categoryKey);
  } else {
    sortCategoryChartEntries(withData, categoryKey);
    html += `<div class="charts-grid">`;
    for (const [key, marker] of withData) {
      // Skip legacy customMarkers with unsafe keys — they can't be safely
      // embedded in inline-onclick handlers.
      if (!safeMarkerId(key)) continue;
      html += renderChartCard(categoryKey + "_" + key, marker, data.dateLabels);
    }
    html += `</div>`;
    // Show empty markers (no data yet) as clickable cards
    const noData = allEntries.filter(([, m]) => !markerHasData(m));
    if (noData.length > 0) {
      html += `<div style="margin-top:16px"><p style="color:var(--text-secondary);font-size:13px;margin-bottom:8px">No data yet</p><div style="display:flex;flex-wrap:wrap;gap:8px">`;
      for (const [key, marker] of noData) {
        if (!safeMarkerId(key)) continue;
        const id = categoryKey + '_' + key;
        html += `<div class="chart-card" role="button" tabindex="0" aria-label="Add value for ${escapeHTML(marker.name)}" onclick="showDetailModal('${id}')" style="cursor:pointer;padding:12px 16px;min-height:auto;flex:0 0 auto">
          <span style="color:var(--text-secondary)">${escapeHTML(marker.name)}</span>
          <span style="color:var(--text-muted);font-size:11px;margin-left:6px">+ add value</span></div>`;
      }
      html += `</div></div>`;
    }
  }
  html += `</div>`;
  main.innerHTML = html;

  const savedView = state.categoryView;
  if (savedView === 'table' || savedView === 'heatmap') {
    const buttons = main.querySelectorAll('.view-toggle .view-btn');
    const idx = savedView === 'table' ? 1 : 2;
    if (buttons[idx]) { switchView(savedView, categoryKey, buttons[idx]); return; }
  }

  if (withData.length === 0) { /* no charts to render */ }
  else if (cat.singleDate) { renderFattyAcidsCharts(cat); }
  else {
    for (const [key, marker] of withData) {
      createLineChart(categoryKey + "_" + key, marker, data.dateLabels, data.dates, data.phaseLabels);
    }
  }
  loadChartCardRecs();
}

export function switchView(view, categoryKey, btn) {
  // categoryKey reaches inline-onclick handlers via renderChartCard /
  // renderFattyAcidsView / renderTableView / renderHeatmapView. Same
  // allowlist guard as showCategory.
  if (!safeMarkerId(categoryKey)) return;
  state.categoryView = view;
  document.querySelectorAll(".view-btn").forEach(b => {
    b.classList.remove("active");
    b.setAttribute('aria-selected', 'false');
    b.setAttribute('tabindex', '-1');
  });
  btn.classList.add("active");
  btn.setAttribute('aria-selected', 'true');
  btn.setAttribute('tabindex', '0');
  destroyAllCharts();
  const rawData = getActiveData();
  const data = filterDatesByRange(rawData);
  const cat = data.categories[categoryKey];
  const container = document.getElementById("view-content");
  // Pre-sanitize date labels at the call boundary — CodeQL's taint analysis
  // (js/xss-through-dom) doesn't trace sanitizers across function calls, so
  // even though renderTableView/renderHeatmapView re-escape internally,
  // escaping here closes the call-site taint flow. Date arrays stay raw
  // because they're consumed by JSON.stringify in inline-onclick attrs
  // (escapeHTML would double-escape the JSON literal).
  const safeLabels = Array.isArray(data.dateLabels) ? data.dateLabels.map(escapeHTML) : data.dateLabels;
  if (view === "table") {
    container.innerHTML = renderTableView(cat, safeLabels, categoryKey, data.dates);
  } else if (view === "heatmap") {
    container.innerHTML = renderHeatmapView(cat, safeLabels, data.dates, categoryKey);
  } else {
    if (cat.singleDate) {
      container.innerHTML = renderFattyAcidsView(cat, categoryKey);
      renderFattyAcidsCharts(cat);
    } else {
      // Per-key safety check skips legacy customMarkers with unsafe keys so
      // they never reach inline-onclick handlers in renderChartCard.
      const withData = Object.entries(cat.markers).filter(([key, m]) => markerHasData(m) && safeMarkerId(key));
      let html = `<div class="charts-grid">`;
      for (const [key, marker] of withData) {
        html += renderChartCard(categoryKey + "_" + key, marker, data.dateLabels);
      }
      html += `</div>`;
      container.innerHTML = html;
      for (const [key, marker] of withData) {
        createLineChart(categoryKey + "_" + key, marker, data.dateLabels, data.dates, data.phaseLabels);
      }
    }
  }
}

configureCompareCorrelationViews({
  renderTableColgroup,
  renderScrollableTableShell,
  renderCategoryGlyph,
});

// ═══════════════════════════════════════════════
// WELCOME INTRO (profile setup on first visit)
// ═══════════════════════════════════════════════


// ═══════════════════════════════════════════════
// WINDOW EXPORTS
// ═══════════════════════════════════════════════

Object.assign(window, {
  navigate,
  getInitialView,
  showDashboard,
  showLabs,
  showGenomeLens,
  showBodyLens,
  showInsightLens,
  showRecommendations,
  openRecommendationDetail,
  discussRecommendation,
  saveRecommendation,
  dismissRecommendation,
  showLight,
  _expandLightToolsSection,
  _toggleChannelDetail,
  _openChannelOnLightPage,
  _openAllSessionsModal,
  renderLightTodayStrip,
  renderLightChannelsLive,
  renderConditionsNow,
  _refreshConditionsNow,
  _inspectConditionsNow,
  _setManualUvi,
  _clearManualUvi,
  renderFocusCard,
  buildFocusContext,
  loadFocusCard,
  refreshFocusCard,
  renderOnboardingBanner,
  renderAIConnectionReminder,
  dismissAIReminder,
  openChatProviderQuiz,
  setOnboardingFocus,
  completeOnboardingSex,
  completeOnboardingProfile,
  dismissOnboarding,
  showCategory,
  renameCategory,
  renameMarker,
  revertMarkerName,
  changeCategoryIcon,
  switchView,
  renderChartCard,
  renderTableView,
  renderHeatmapView,
  renderFattyAcidsView,
  renderFattyAcidsCharts,
  fetchCustomMarkerDescription,
  showDetailModal,
  editRefRange,
  saveRefRange,
  revertRefRange,
  openManualEntryForm,
  saveManualEntry,
  saveAndAddAnotherManualEntry,
  openCreateMarkerModal,
  pickNewCatIcon,
  saveCustomMarker,
  deleteMarkerValue,
  deleteCustomMarker,
  editMarkerValue,
  revertMarkerValue,
  editValueNote,
  deleteValueNote,
  toggleMarkerNoteEditor,
  saveMarkerNote,
  deleteMarkerNote,
  closeModal,
  rememberModalTrigger,
  showCompare,
  setCompareDate1,
  setCompareDate2,
  updateCompare,
  swapCompareDates,
  renderCompareTable,
  showCorrelations,
  populateCorrelationOptions,
  showCorrelationDropdown,
  filterCorrelationOptions,
  toggleCorrelationMarker,
  applyCorrelationPreset,
  renderCorrelationChips,
  renderCorrelationChart,
});
