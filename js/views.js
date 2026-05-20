// views.js — Navigate, dashboard, and shared view composition

import { state } from './state.js';
import { getActiveData, destroyAllCharts, getEffectiveRangeForDate, getLatestValueIndex } from './data.js';
import { canonicalMetric } from './wearable-adapters.js';
import { setupDropZone } from './import-drop-zone.js';
import { createRecommendationActions } from './recommendation-actions.js';
import { createNavigate, getInitialView as getRouterInitialView } from './views-router.js';
import { createDashboardPageView } from './dashboard-page-view.js';
import { createLensPageHandlers } from './lens-pages.js';
import { configureLensPageShell, inlineHandlerCall, renderLensHeader, renderLensPageWidgets, renderLensWidget, moveLensPageWidget } from './lens-page-shell.js';
import { createDashboardWidgetRegistry } from './dashboard-widgets.js';
import { createDashboardWidgetControls } from './dashboard-widget-controls.js';
import { createDashboardWidgetRenderers } from './dashboard-widget-renderers.js';
import { renderFocusCard, buildFocusContext, loadFocusCard, refreshFocusCard } from './focus-card.js';
import { configureOnboardingView, renderOnboardingBanner, renderAIConnectionReminder, dismissAIReminder, openChatProviderQuiz, setOnboardingFocus, completeOnboardingSex, completeOnboardingProfile, dismissOnboarding } from './onboarding-view.js';
import { renderCategoryGlyph } from './category-glyphs.js';
import { renderChartCard, renderTableColgroup, renderScrollableTableShell, renderTableView, renderHeatmapView, renderFattyAcidsView, renderFattyAcidsCharts } from './category-view-renderers.js';
import { showCategory, switchView } from './category-page-view.js';
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
  syncMobileBottomNav,
  refreshMobileDashboardActiveTab,
  getMobileDashboardMarkers,
  getMobileDashboardInsights,
  getMobileWearableTiles,
  formatMobileWearableValue,
  formatMobileWearableDelta,
  getMobileWearablePriority,
  mobileDashboardSetTab,
  openMobileDashboardSearch,
  mobileDashboardJump,
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
  showCategory,
  switchView,
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

function markerHasData(m) { return m.values?.some(v => v !== null) ?? false; }

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
let dashboardPageView;
export function showDashboard(data) { return dashboardPageView.showDashboard(data); }

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

dashboardPageView = createDashboardPageView({
  setupDropZone,
  markerHasData,
  buildDashboardWidgetContext,
  getDashboardWidgetPrefs,
  getVisibleDashboardWidgetEntries,
  renderOnboardingBanner,
  renderAIConnectionReminder,
  renderDashboardStickyControls,
  renderDashboardControlButtons,
  renderDashboardWidget,
  isDashboardOrganizeMode: () => dashboardWidgetControls.isOrganizeMode(),
  loadFocusCard,
});

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

const recommendationActions = createRecommendationActions({
  getActiveData,
  buildDashboardWidgetContext,
  getCachedRecommendationsCatalog,
  getGlobalRecommendationCandidates,
  setRecommendationState: (...args) => dashboardWidgetRenderers.setRecommendationState(...args),
});

export function openRecommendationDetail(...args) { return recommendationActions.openRecommendationDetail(...args); }
export function discussRecommendation(...args) { return recommendationActions.discussRecommendation(...args); }
export function saveRecommendation(...args) { return recommendationActions.saveRecommendation(...args); }
export function dismissRecommendation(...args) { return recommendationActions.dismissRecommendation(...args); }

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
