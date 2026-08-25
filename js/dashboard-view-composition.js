// @ts-check
// dashboard-view-composition.js - dashboard route/widget composition wiring

import { state } from './state.js';
import { getActiveData } from './data.js';
import { getEffectiveRangeForDate, getLatestValueIndex } from './marker-analysis.js';
import { canonicalMetric } from './wearable-adapters.js';
import { setupDropZone } from './import-drop-zone.js';
import { loadCommitHash } from './commit-hash.js';
import { loadCatalog, loadContextCardTips, renderFuelWidget, renderNutritionWidget } from './health-data-loader.js';
import { openChatPanel } from './chat-loader.js';
import { toggleMobileSidebar } from './nav.js';
import { setRecommendationsCatalogCache } from './recommendations-runtime.js';
import { createDashboardPageView } from './dashboard-page-view.js';
import { configureLensPageShell } from './lens-page-shell.js';
import { createDashboardWidgetRegistry } from './dashboard-widgets.js';
import { createDashboardWidgetControls } from './dashboard-widget-controls.js';
import { createDashboardWidgetRenderers } from './dashboard-widget-renderers.js';
import { configureMarkerDetailModal } from './marker-detail-modal.js';
import { configureMarkerDetailRuntime } from './marker-detail-runtime.js';
import { navigateViewportRuntime } from './views-router-runtime.js';
import {
  ensureLoadedActiveDeviceTicker,
  isLightSunUILoaded,
  loadLightSunUI,
  renderLoadedDashboardLightChannelPills,
  renderLoadedLightConditionsWidgetBody,
  renderLoadedLightLiveSession,
  renderLoadedLightSessionLogActions,
  renderLoadedLightTodayHero,
  resumeLoadedActiveSunTickerIfNeeded,
} from './light-sun-loader.js';
import {
  configureMobileDashboardView,
  getMobileDashboardMarkers,
  getMobileDashboardInsights,
  getMobileWearableTiles,
  formatMobileWearableValue,
  formatMobileWearableDelta,
  getMobileWearablePriority,
} from './mobile-dashboard.js';

function markerHasData(m) {
  return m.values?.some(v => v !== null) ?? false;
}

export function createDashboardViewComposition({
  navigate,
  showRecommendations,
  showEmojiPicker,
  renderFocusCard,
  loadFocusCard,
  renderOnboardingBanner,
  renderAIConnectionReminder,
}) {
  let dashboardWidgetControls;

  function rerenderDashboardFromWidgetChange() {
    if (state.currentView === 'dashboard') navigateViewportRuntime('dashboard');
  }

  const dashboardWidgetRenderers = createDashboardWidgetRenderers({
    markerHasData,
    renderDashboardLightChannelPills: renderLoadedDashboardLightChannelPills,
    renderLightConditionsWidgetBody: renderLoadedLightConditionsWidgetBody,
    renderLightLiveSession: renderLoadedLightLiveSession,
    renderLightSessionLogActions: renderLoadedLightSessionLogActions,
    getMobileDashboardMarkers,
    getMobileDashboardInsights,
    getMobileWearableTiles,
    formatMobileWearableValue,
    formatMobileWearableDelta,
    getMobileWearablePriority,
    isLightSunUILoaded,
    loadLightSunUI,
    rerenderDashboardFromWidgetChange,
    renderLightTodayHero: renderLoadedLightTodayHero,
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
    renderBiologyScoresWidget,
    renderDashboardBiologyScoreWidget,
    renderDashboardBiologicalCoherenceWidget,
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
    renderDashboardLightLiveSessionWidget,
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

  configureMarkerDetailRuntime({
    isDashboardQuickMarkerPinned,
    navigate,
    showEmojiPicker,
    toggleDashboardQuickMarkerPin,
  });
  configureMarkerDetailModal({ navigate, isDashboardQuickMarkerPinned, toggleDashboardQuickMarkerPin, showEmojiPicker });

  /**
   * @param {string} widgetId
   * @param {{data: any, filteredData: any} | null} [ctx]
   */
  function getDashboardMarkerWidgetDefinition(widgetId, ctx = null) {
    const markerId = dashboardMarkerIdFromWidgetId(widgetId);
    if (!markerId) return null;
    const hit = ctx
      ? (getDashboardMarkerById(ctx.data, markerId) || getDashboardMarkerById(ctx.filteredData, markerId))
      : getDashboardMarkerById(getActiveData(), markerId);
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

  const dashboardWidgetRegistry = createDashboardWidgetRegistry({
    renderDashboardBioAgeWidget,
    renderBiologyScoresWidget,
    renderDashboardBiologyScoreWidget,
    renderDashboardBiologicalCoherenceWidget,
    renderFocusCard,
    renderDashboardRecommendationsWidget,
    renderDashboardSpotlightWidget,
    renderDashboardWearableTilesWidget,
    renderDashboardNutritionWidget: renderNutritionWidget,
    renderFuelWidget,
    renderDashboardQuickMarkersWidget,
    renderDashboardInsightsListWidget,
    renderDashboardGenomeWidget,
    renderDashboardAlertsWidget,
    renderDashboardCorrelationWidget,
    renderDashboardLightTodayWidget,
    renderDashboardLightConditionsWidget,
    renderDashboardLightLiveSessionWidget,
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

  const dashboardPageView = createDashboardPageView({
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
    loadContextCardTips,
    ensureActiveDeviceTicker: ensureLoadedActiveDeviceTicker,
    resumeActiveTickerIfNeeded: resumeLoadedActiveSunTickerIfNeeded,
  });

  configureLensPageShell({
    addDashboardWidgetFromLens: (...args) => dashboardWidgetControls.addDashboardWidgetFromLens(...args),
    getAvailableDashboardFixedWidgetIds,
    getDashboardWidgetPrefs,
    openChatPanel,
    openDashboardBiometricPicker: () => dashboardWidgetControls.openDashboardBiometricPicker(),
    removeDashboardWidgetFromLens: (...args) => dashboardWidgetControls.removeDashboardWidgetFromLens(...args),
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
    navigate,
    toggleMobileSidebar,
    loadContextCardTips,
    loadCatalog,
    cacheCatalog: setRecommendationsCatalogCache,
  });

  return {
    showDashboard: (...args) => dashboardPageView.showDashboard(...args),
    buildDashboardWidgetContext,
    getCachedRecommendationsCatalog,
    refreshRecommendationsWhenCatalogReady,
    getGlobalRecommendationCandidates,
    renderRecommendationCard,
    renderRecommendationsEmpty,
    renderDashboardQuickMarkersWidget,
    renderDashboardKeyTrendsWidget,
    renderDashboardGenomeWidget,
    renderDashboardWearableTilesWidget,
    renderDashboardInsightsListWidget,
    renderDashboardRecommendationsWidget,
    renderLabsPriorityBanner,
    getDashboardWidgetPrefs,
    setRecommendationState: (...args) => dashboardWidgetRenderers.setRecommendationState(...args),
    toggleDashboardOrganizeMode: (...args) => dashboardWidgetControls.toggleDashboardOrganizeMode(...args),
    moveDashboardWidget: (...args) => dashboardWidgetControls.moveDashboardWidget(...args),
    hideDashboardWidget: (...args) => dashboardWidgetControls.hideDashboardWidget(...args),
    showDashboardWidget: (...args) => dashboardWidgetControls.showDashboardWidget(...args),
    addDashboardWidgetFromLens: (...args) => dashboardWidgetControls.addDashboardWidgetFromLens(...args),
    removeDashboardWidgetFromLens: (...args) => dashboardWidgetControls.removeDashboardWidgetFromLens(...args),
    addDashboardMarkerWidget: (...args) => dashboardWidgetControls.addDashboardMarkerWidget(...args),
    addDashboardBiometricMetric: (...args) => dashboardWidgetControls.addDashboardBiometricMetric(...args),
    addDashboardBiometricWidget: (...args) => dashboardWidgetControls.addDashboardBiometricWidget(...args),
    removeDashboardBiometricMetric: (...args) => dashboardWidgetControls.removeDashboardBiometricMetric(...args),
    filterDashboardMarkerWidgetPicker: (...args) => dashboardWidgetControls.filterDashboardMarkerWidgetPicker(...args),
    filterDashboardBiometricWidgetPicker: (...args) => dashboardWidgetControls.filterDashboardBiometricWidgetPicker(...args),
    /** @param {[]} args */
    resetDashboardWidgets: (...args) => dashboardWidgetControls.resetDashboardWidgets(...args),
    /** @param {[]} args */
    clearDashboardWidgets: (...args) => dashboardWidgetControls.clearDashboardWidgets(...args),
    /** @param {[]} args */
    openDashboardWidgetPicker: (...args) => dashboardWidgetControls.openDashboardWidgetPicker(...args),
    /** @param {[]} args */
    openDashboardBiometricPicker: (...args) => dashboardWidgetControls.openDashboardBiometricPicker(...args),
    /** @param {[]} args */
    closeDashboardWidgetPicker: (...args) => dashboardWidgetControls.closeDashboardWidgetPicker(...args),
    startDashboardWidgetDrag: (...args) => dashboardWidgetControls.startDashboardWidgetDrag(...args),
    allowDashboardWidgetDrop: (...args) => dashboardWidgetControls.allowDashboardWidgetDrop(...args),
    dropDashboardWidget: (...args) => dashboardWidgetControls.dropDashboardWidget(...args),
    toggleDashboardQuickMarkerPin,
  };
}
