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

function markerHasData(m: unknown) {
  return (m as {values?:{some(callback:(value:unknown)=>boolean):unknown}|null}).values?.some(v => v !== null) ?? false;
}

export function createDashboardViewComposition({
  navigate,
  showRecommendations,
  showEmojiPicker,
  renderFocusCard,
  loadFocusCard,
  renderOnboardingBanner,
  renderAIConnectionReminder,
}: {navigate:unknown;showRecommendations:unknown;showEmojiPicker:unknown;renderFocusCard:unknown;loadFocusCard:unknown;renderOnboardingBanner:unknown;renderAIConnectionReminder:unknown}) {
  let dashboardWidgetControls: ReturnType<typeof createDashboardWidgetControls> | undefined;

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

  function getDashboardMarkerWidgetDefinition(widgetId: unknown, ctx: {data?:unknown;filteredData?:unknown}|null = null) {
    const markerId = dashboardMarkerIdFromWidgetId(widgetId);
    if (!markerId) return null;
    const hit = ctx
      ? (getDashboardMarkerById(ctx.data, markerId) || getDashboardMarkerById(ctx.filteredData, markerId))
      : getDashboardMarkerById(getActiveData(), markerId);
    const title = (hit?.marker as {name?:unknown}|null|undefined)?.name || markerId.replace(/_/g, ' ');
    const category = (hit?.category as {label?:unknown}|null|undefined)?.label || 'Single marker';
    return {
      id: widgetId,
      title,
      source: 'Labs',
      description: `${category} marker widget`,
      size: 'quarter',
      customMarkerWidget: true,
      render: (renderCtx: import("../types/dashboard-lab-widget-renderers.js").LabContext) => renderDashboardSingleMarkerWidget(renderCtx, markerId),
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
    isDashboardOrganizeMode: () => dashboardWidgetControls!.isOrganizeMode(),
    loadFocusCard,
    loadContextCardTips,
    ensureActiveDeviceTicker: ensureLoadedActiveDeviceTicker,
    resumeActiveTickerIfNeeded: resumeLoadedActiveSunTickerIfNeeded,
  });

  (configureLensPageShell as (deps:unknown)=>ReturnType<typeof configureLensPageShell>)({
    addDashboardWidgetFromLens: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["addDashboardWidgetFromLens"]>) => dashboardWidgetControls!.addDashboardWidgetFromLens(...args),
    getAvailableDashboardFixedWidgetIds,
    getDashboardWidgetPrefs,
    openChatPanel,
    openDashboardBiometricPicker: () => dashboardWidgetControls.openDashboardBiometricPicker(),
    removeDashboardWidgetFromLens: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["removeDashboardWidgetFromLens"]>) => dashboardWidgetControls!.removeDashboardWidgetFromLens(...args),
  });

  configureMobileDashboardView({
    buildDashboardWidgetContext,
    getDashboardWidgetPrefs,
    getVisibleDashboardWidgetEntries,
    renderDashboardControlButtons,
    isDashboardOrganizeMode: () => dashboardWidgetControls!.isOrganizeMode(),
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
    showDashboard: (...args: Parameters<typeof dashboardPageView.showDashboard>) => dashboardPageView.showDashboard(...args),
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
    setRecommendationState: (...args: Parameters<typeof dashboardWidgetRenderers.setRecommendationState>) => dashboardWidgetRenderers.setRecommendationState(...args),
    toggleDashboardOrganizeMode: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["toggleDashboardOrganizeMode"]>) => dashboardWidgetControls!.toggleDashboardOrganizeMode(...args),
    moveDashboardWidget: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["moveDashboardWidget"]>) => dashboardWidgetControls!.moveDashboardWidget(...args),
    hideDashboardWidget: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["hideDashboardWidget"]>) => dashboardWidgetControls!.hideDashboardWidget(...args),
    showDashboardWidget: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["showDashboardWidget"]>) => dashboardWidgetControls!.showDashboardWidget(...args),
    addDashboardWidgetFromLens: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["addDashboardWidgetFromLens"]>) => dashboardWidgetControls!.addDashboardWidgetFromLens(...args),
    removeDashboardWidgetFromLens: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["removeDashboardWidgetFromLens"]>) => dashboardWidgetControls!.removeDashboardWidgetFromLens(...args),
    addDashboardMarkerWidget: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["addDashboardMarkerWidget"]>) => dashboardWidgetControls!.addDashboardMarkerWidget(...args),
    addDashboardBiometricMetric: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["addDashboardBiometricMetric"]>) => dashboardWidgetControls!.addDashboardBiometricMetric(...args),
    addDashboardBiometricWidget: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["addDashboardBiometricWidget"]>) => dashboardWidgetControls!.addDashboardBiometricWidget(...args),
    removeDashboardBiometricMetric: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["removeDashboardBiometricMetric"]>) => dashboardWidgetControls!.removeDashboardBiometricMetric(...args),
    filterDashboardMarkerWidgetPicker: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["filterDashboardMarkerWidgetPicker"]>) => dashboardWidgetControls!.filterDashboardMarkerWidgetPicker(...args),
    filterDashboardBiometricWidgetPicker: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["filterDashboardBiometricWidgetPicker"]>) => dashboardWidgetControls!.filterDashboardBiometricWidgetPicker(...args),

    resetDashboardWidgets: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["resetDashboardWidgets"]>) => dashboardWidgetControls!.resetDashboardWidgets(...args),

    clearDashboardWidgets: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["clearDashboardWidgets"]>) => dashboardWidgetControls!.clearDashboardWidgets(...args),

    openDashboardWidgetPicker: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["openDashboardWidgetPicker"]>) => dashboardWidgetControls!.openDashboardWidgetPicker(...args),

    openDashboardBiometricPicker: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["openDashboardBiometricPicker"]>) => dashboardWidgetControls!.openDashboardBiometricPicker(...args),

    closeDashboardWidgetPicker: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["closeDashboardWidgetPicker"]>) => dashboardWidgetControls!.closeDashboardWidgetPicker(...args),
    startDashboardWidgetDrag: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["startDashboardWidgetDrag"]>) => dashboardWidgetControls!.startDashboardWidgetDrag(...args),
    allowDashboardWidgetDrop: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["allowDashboardWidgetDrop"]>) => dashboardWidgetControls!.allowDashboardWidgetDrop(...args),
    dropDashboardWidget: (...args: Parameters<NonNullable<typeof dashboardWidgetControls>["dropDashboardWidget"]>) => dashboardWidgetControls!.dropDashboardWidget(...args),
    toggleDashboardQuickMarkerPin,
  };
}
