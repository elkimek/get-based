// views.js — route facade and compatibility exports

import { getActiveData, destroyAllCharts } from './data.js';
import { setupDropZone } from './import-drop-zone.js';
import { createRecommendationActions } from './recommendation-actions.js';
import { createNavigate, getInitialView as getRouterInitialView } from './views-router.js';
import { createDashboardViewComposition } from './dashboard-view-composition.js';
import { createLensPageHandlers } from './lens-pages.js';
import { inlineHandlerCall, renderLensHeader, renderLensPageWidgets, renderLensWidget, moveLensPageWidget } from './lens-page-shell.js';
import { renderFocusCard, buildFocusContext, loadFocusCard, refreshFocusCard } from './focus-card.js';
import { configureOnboardingView, renderOnboardingBanner, renderAIConnectionReminder, dismissAIReminder, openChatProviderQuiz, setOnboardingFocus, completeOnboardingSex, completeOnboardingProfile, dismissOnboarding } from './onboarding-view.js';
import { renderCategoryGlyph } from './category-glyphs.js';
import { renderChartCard, renderTableColgroup, renderScrollableTableShell, renderTableView, renderHeatmapView, renderFattyAcidsView, renderFattyAcidsCharts } from './category-view-renderers.js';
import { showCategory, switchView } from './category-page-view.js';
import { configureCategoryCustomization, renameCategory, renameMarker, revertMarkerName, showEmojiPicker, changeCategoryIcon } from './category-customization.js';
import { renderConditionsNow, _refreshConditionsNow, _inspectConditionsNow, _setManualUvi, _clearManualUvi } from './light-conditions-now.js';
import { _openAllSessionsModal } from './light-sessions-view.js';
import { _toggleChannelDetail, _openChannelOnLightPage } from './light-channel-view.js';
import {
  showLight,
  _expandLightToolsSection,
  renderLightTodayStrip,
  renderLightChannelsLive,
} from './light-page-view.js';
import {
  syncMobileBottomNav,
  refreshMobileDashboardActiveTab,
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
let dashboardView;
export function showDashboard(data) { return dashboardView.showDashboard(data); }

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

dashboardView = createDashboardViewComposition({
  navigate,
  showRecommendations,
  showEmojiPicker,
  renderFocusCard,
  loadFocusCard,
  renderOnboardingBanner,
  renderAIConnectionReminder,
});

const {
  buildDashboardWidgetContext,
  getCachedRecommendationsCatalog,
  refreshRecommendationsWhenCatalogReady,
  getGlobalRecommendationCandidates,
  renderRecommendationCard,
  renderRecommendationsEmpty,
  renderDashboardRecommendationsWidget,
  renderDashboardWearableTilesWidget,
  renderDashboardQuickMarkersWidget,
  renderDashboardInsightsListWidget,
  renderDashboardGenomeWidget,
  renderDashboardKeyTrendsWidget,
  renderLabsPriorityBanner,
  getDashboardWidgetPrefs,
} = dashboardView;

export const toggleDashboardOrganizeMode = (...args) => dashboardView.toggleDashboardOrganizeMode(...args);
export const moveDashboardWidget = (...args) => dashboardView.moveDashboardWidget(...args);
export const hideDashboardWidget = (...args) => dashboardView.hideDashboardWidget(...args);
export const showDashboardWidget = (...args) => dashboardView.showDashboardWidget(...args);
export const addDashboardWidgetFromLens = (...args) => dashboardView.addDashboardWidgetFromLens(...args);
export const removeDashboardWidgetFromLens = (...args) => dashboardView.removeDashboardWidgetFromLens(...args);
export const addDashboardMarkerWidget = (...args) => dashboardView.addDashboardMarkerWidget(...args);
export const addDashboardBiometricMetric = (...args) => dashboardView.addDashboardBiometricMetric(...args);
export const addDashboardBiometricWidget = (...args) => dashboardView.addDashboardBiometricWidget(...args);
export const removeDashboardBiometricMetric = (...args) => dashboardView.removeDashboardBiometricMetric(...args);
export const filterDashboardMarkerWidgetPicker = (...args) => dashboardView.filterDashboardMarkerWidgetPicker(...args);
export const filterDashboardBiometricWidgetPicker = (...args) => dashboardView.filterDashboardBiometricWidgetPicker(...args);
export const resetDashboardWidgets = (...args) => dashboardView.resetDashboardWidgets(...args);
export const clearDashboardWidgets = (...args) => dashboardView.clearDashboardWidgets(...args);
export const openDashboardWidgetPicker = (...args) => dashboardView.openDashboardWidgetPicker(...args);
export const openDashboardBiometricPicker = (...args) => dashboardView.openDashboardBiometricPicker(...args);
export const closeDashboardWidgetPicker = (...args) => dashboardView.closeDashboardWidgetPicker(...args);
export const startDashboardWidgetDrag = (...args) => dashboardView.startDashboardWidgetDrag(...args);
export const allowDashboardWidgetDrop = (...args) => dashboardView.allowDashboardWidgetDrop(...args);
export const dropDashboardWidget = (...args) => dashboardView.dropDashboardWidget(...args);
const toggleDashboardQuickMarkerPin = (...args) => dashboardView.toggleDashboardQuickMarkerPin(...args);

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
  setRecommendationState: (...args) => dashboardView.setRecommendationState(...args),
});

export function openRecommendationDetail(...args) { return recommendationActions.openRecommendationDetail(...args); }
export function discussRecommendation(...args) { return recommendationActions.discussRecommendation(...args); }
export function saveRecommendation(...args) { return recommendationActions.saveRecommendation(...args); }
export function dismissRecommendation(...args) { return recommendationActions.dismissRecommendation(...args); }

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
