import type {createDashboardQuickMarkerCore} from './dashboard-quick-marker-core.js';
import {projectFocusCard} from './focus-card.js';
import {createDashboardBiologyProjectionScope, projectDashboardBiologyScoreWidget, projectDashboardBiologicalCoherenceWidget} from './biology-score-dashboard.js';
import type {DashboardWidgetContent} from './dashboard-widget-presentation.js';
import type {LabContext} from '../types/dashboard-lab-widget-renderers.js';
import type {DashboardWidgetContext} from '../types/dashboard-widgets.js';
// dashboard-view-composition.js - dashboard route/widget composition wiring

import { state } from './state.js';
import { getActiveData } from './data.js';
import { getEffectiveRangeForDate, getLatestValueIndex } from './marker-analysis.js';
import { canonicalMetric } from './wearable-adapters.js';
import { setupDropZone } from './import-drop-zone.js';
import { loadCommitHash } from './commit-hash.js';
import { loadCatalog, loadContextCardTips, renderFuelWidget, renderNutritionWidget, projectFuelWidget, projectNutritionWidget, projectMenstrualCycleSection, projectSupplementsSection, projectProfileContextCards } from './health-data-loader.js';
import { openChatPanel } from './chat-loader.js';
import { toggleMobileSidebar } from './nav.js';
import { setRecommendationsCatalogCache } from './recommendations-runtime.js';
import { createDashboardPageView } from './dashboard-page-view.js';
import { configureLensPageShell } from './lens-page-shell-core.js';
import { createDashboardWidgetRegistry } from './dashboard-widgets.js';
import { createDashboardWidgetControls } from './dashboard-widget-controls.js';
import { createDashboardWidgetRenderers } from './dashboard-widget-renderers.js';
import { configureMarkerDetailModal } from './marker-detail-modal.js';
import { configureMarkerDetailRuntime } from './marker-detail-runtime.js';
import { navigateViewportRuntime } from './views-router-runtime.js';
import {
  getLoadedLightTodayHeroView,
  getLoadedLightConditionsWidgetView,
  getLoadedLightLiveSessionView,
  getLoadedLightSessionLogActionsView,
  getLoadedDashboardLightChannelsWidgetView,
  ensureLoadedActiveDeviceTicker,
  isLightSunUILoaded,
  loadLightSunUI,
  renderLoadedDashboardLightChannelsWidget,
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
  projectOnboardingBanner,
  projectAIConnectionReminder,
}: {navigate:unknown;showRecommendations:unknown;showEmojiPicker:unknown;renderFocusCard:unknown;loadFocusCard:unknown;projectOnboardingBanner:unknown;projectAIConnectionReminder:unknown}, prepared: {
  quickMarkers?: ReturnType<typeof createDashboardQuickMarkerCore>;
  deferRuntimeWiring?: boolean;
} = {}) {
  let dashboardWidgetControls: ReturnType<typeof createDashboardWidgetControls> | undefined;

  function rerenderDashboardFromWidgetChange() {
    if (state.currentView === 'dashboard') navigateViewportRuntime('dashboard');
  }

  const dashboardWidgetRenderers = createDashboardWidgetRenderers({
    markerHasData,
    getLightTodayHeroView:getLoadedLightTodayHeroView,
    getLightConditionsWidgetView:getLoadedLightConditionsWidgetView,
    getLightLiveSessionView:getLoadedLightLiveSessionView,
    getLightSessionLogActionsView:getLoadedLightSessionLogActionsView,
    getDashboardLightChannelsWidgetView:getLoadedDashboardLightChannelsWidgetView,
    renderDashboardLightChannelsWidget: renderLoadedDashboardLightChannelsWidget,
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
  }, prepared.quickMarkers);

  const {
    buildDashboardWidgetContext,
    getCachedRecommendationsCatalog,
    refreshRecommendationsWhenCatalogReady,
    getGlobalRecommendationCandidates,
    renderRecommendationCard,
    renderRecommendationList,
    renderRecommendationsEmpty,
    renderDashboardBioAgeWidget,
    projectDashboardBioAgeWidget,
    projectDashboardAlertsWidget,
    projectDashboardCorrelationWidget,
    renderBiologyScoresWidget,
    renderDashboardBiologyScoreWidget,
    renderDashboardBiologicalCoherenceWidget,
    renderDashboardRecommendationsWidget,
    renderDashboardSpotlightWidget,
    projectDashboardSpotlightWidget,
    renderDashboardWearableTilesWidget,
    prepareDashboardWearableTilesWidget,
    renderDashboardQuickMarkersWidget,
    projectDashboardQuickMarkersWidget,
    projectDashboardNotesWidget,
    renderDashboardInsightsListWidget,
    prepareDashboardInsightsListWidget,
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
    projectLabsPriorityBanner,
    projectDashboardWearableTilesWidget,
    projectDashboardInsightsListWidget,
    projectDashboardRecommendationsWidget,
    projectDashboardKeyTrendsWidget,
    projectDashboardGenomeWidget,
    getDashboardMarkerById,
    getDashboardBiometricSelection,
    saveDashboardBiometricSelection,
    getDashboardBiometricMetricOrder,
    getDashboardBiometricTile,
    renderDashboardSingleMarkerWidget,
    projectDashboardSingleMarkerWidget,
    isDashboardQuickMarkerPinned,
    toggleDashboardQuickMarkerPin,
    projectDashboardLightTodayWidget,
    projectDashboardLightConditionsWidget,
    projectDashboardLightLiveSessionWidget,
    projectDashboardLightSessionLogWidget,
    projectDashboardLightChannelsWidget,
  } = dashboardWidgetRenderers;

  if (!prepared.deferRuntimeWiring) {
    configureMarkerDetailRuntime({
      isDashboardQuickMarkerPinned,
      navigate,
      showEmojiPicker,
      toggleDashboardQuickMarkerPin,
    });
    configureMarkerDetailModal({ navigate, isDashboardQuickMarkerPinned, toggleDashboardQuickMarkerPin, showEmojiPicker });
  }

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
      project: (renderCtx: import("../types/dashboard-lab-widget-renderers.js").LabContext) => projectDashboardSingleMarkerWidget(renderCtx, markerId),
    };
  }

  /** Route composition selects feature-owned data; the Svelte body owns child rendering. */
  function projectWidgetBody(id: string, input: unknown, biology?: ReturnType<typeof createDashboardBiologyProjectionScope>): DashboardWidgetContent | null {
    const ctx = input as LabContext;
    if (id.startsWith('marker_')) {
      const view = projectDashboardSingleMarkerWidget(ctx, dashboardMarkerIdFromWidgetId(id));
      return view ? {kind: 'lab-marker', view} : null;
    }
    if (id.startsWith('biology-score-')) {
      if (id === 'biology-score-biologicalCoherence') {
        const view = biology ? biology.projectCoherenceWidget(input) : projectDashboardBiologicalCoherenceWidget(input);
        return view ? {kind: 'biology-dashboard-coherence', view} : null;
      }
      const scoreId = id.slice('biology-score-'.length);
      const view = biology ? biology.projectScoreWidget(input, scoreId) : projectDashboardBiologyScoreWidget(input, scoreId);
      return view ? {kind: 'biology-dashboard-score', view} : null;
    }
    switch (id) {
      case 'bio-age': return {kind: 'lab-summary', view: projectDashboardBioAgeWidget(ctx)};
      case 'alerts': {const view = projectDashboardAlertsWidget(ctx); return view ? {kind: 'lab-summary', view} : null;}
      case 'correlation': return {kind: 'lab-summary', view: projectDashboardCorrelationWidget(ctx)};
      case 'focus': return {kind: 'focus', view: projectFocusCard()};
      case 'recommendations': return {kind: 'recommendations', view: projectDashboardRecommendationsWidget(input)};
      case 'spotlight': {const view = projectDashboardSpotlightWidget(ctx); return view ? {kind: 'lab-marker', view} : null;}
      case 'wearables': return {kind: 'wearables', view: projectDashboardWearableTilesWidget()};
      case 'nutrition': return {kind: 'nutrition', view: projectNutritionWidget()};
      case 'nutrition-fuel-mix': return {kind: 'fuel', view: projectFuelWidget()};
      case 'quick-markers': return {kind: 'quick-markers', view: projectDashboardQuickMarkersWidget(ctx)};
      case 'insights': return {kind: 'insights', view: projectDashboardInsightsListWidget(input)};
      case 'genome': return {kind: 'genome', view: projectDashboardGenomeWidget()};
      case 'profile-context': return {kind: 'profile-context', view: projectProfileContextCards({embedded: true})};
      case 'cycle': return input ? {kind: 'cycle', view: projectMenstrualCycleSection((input as DashboardWidgetContext).data, {variant: 'dashboard', showHeader: false})} : null;
      case 'supplements': return {kind: 'supplements', view: projectSupplementsSection()};
      case 'key-trends': return {kind: 'key-trends', view: projectDashboardKeyTrendsWidget(ctx)};
      case 'notes': return {kind: 'notes', view: projectDashboardNotesWidget()};
      case 'light-today': return {kind: 'dashboard-light', view: projectDashboardLightTodayWidget()};
      case 'light-conditions-now': return {kind: 'dashboard-light', view: projectDashboardLightConditionsWidget()};
      case 'light-live-session': return {kind: 'dashboard-light', view: projectDashboardLightLiveSessionWidget()};
      case 'light-session-log': return {kind: 'dashboard-light', view: projectDashboardLightSessionLogWidget()};
      case 'light-channels': return {kind: 'dashboard-light', view: projectDashboardLightChannelsWidget()};
      default: throw new Error(`Missing typed Dashboard feature: ${id}`);
    }
  }

  const dashboardWidgetRegistry = createDashboardWidgetRegistry({
    renderDashboardBioAgeWidget,
    renderBiologyScoresWidget,
    renderDashboardBiologyScoreWidget,
    renderDashboardBiologicalCoherenceWidget,
    renderFocusCard,
    renderDashboardRecommendationsWidget,
    renderDashboardSpotlightWidget,
    projectDashboardSpotlightWidget,
    renderDashboardWearableTilesWidget,
    prepareDashboardWearableTilesWidget,
    renderDashboardNutritionWidget: renderNutritionWidget,
    renderFuelWidget,
    renderDashboardQuickMarkersWidget,
    projectDashboardQuickMarkersWidget,
    projectDashboardNotesWidget,
    renderDashboardInsightsListWidget,
    prepareDashboardInsightsListWidget,
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
    projectWidgetBody,
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
    getVisibleDashboardWidgetViews: projectVisibleDashboardWidgetViews,
  } = dashboardWidgetRegistry;

  /** One render owns the scope; intervening feature callbacks retire its score snapshot. */
  function getVisibleDashboardWidgetViews(ctx: unknown,
    prefs?: Parameters<typeof projectVisibleDashboardWidgetViews>[1],
    options?: Parameters<typeof projectVisibleDashboardWidgetViews>[2]) {
    const biology = createDashboardBiologyProjectionScope();
    return projectVisibleDashboardWidgetViews(ctx, prefs, options, (id, input) => {
      if (!id.startsWith('biology-score-')) biology.clear();
      return projectWidgetBody(id, input, biology);
    });
  }

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
    projectDashboardControlButtons,
    projectDashboardWidget,
  } = dashboardWidgetControls;

  const dashboardPageView = createDashboardPageView({
    setupDropZone,
    markerHasData,
    buildDashboardWidgetContext,
    getDashboardWidgetPrefs,
    getVisibleDashboardWidgetViews,
    projectOnboardingBanner,
    projectAIConnectionReminder,
    projectDashboardControlButtons,
    projectDashboardWidget,
    isDashboardOrganizeMode: () => dashboardWidgetControls!.isOrganizeMode(),
    loadFocusCard,
    loadContextCardTips,
    ensureActiveDeviceTicker: ensureLoadedActiveDeviceTicker,
    resumeActiveTickerIfNeeded: resumeLoadedActiveSunTickerIfNeeded,
  });

  if (!prepared.deferRuntimeWiring) {
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
      getVisibleDashboardWidgetViews,
      projectDashboardControlButtons,
      isDashboardOrganizeMode: () => dashboardWidgetControls!.isOrganizeMode(),
      projectDashboardWidget,
      setupDropZone,
      loadCommitHash,
      navigate,
      toggleMobileSidebar,
      loadContextCardTips,
      loadCatalog,
      cacheCatalog: setRecommendationsCatalogCache,
    });
  }

  return {
    getAvailableDashboardFixedWidgetIds,
    getVisibleDashboardWidgetViews,
    projectDashboardControlButtons,
    projectDashboardWidget,
    isDashboardOrganizeMode: () => dashboardWidgetControls!.isOrganizeMode(),
    showDashboard: (...args: Parameters<typeof dashboardPageView.showDashboard>) => dashboardPageView.showDashboard(...args),
    buildDashboardWidgetContext,
    getCachedRecommendationsCatalog,
    refreshRecommendationsWhenCatalogReady,
    getGlobalRecommendationCandidates,
    renderRecommendationCard,
    renderRecommendationList,
    renderRecommendationsEmpty,
    renderDashboardQuickMarkersWidget,
    projectDashboardQuickMarkersWidget,
    projectDashboardNotesWidget,
    renderDashboardKeyTrendsWidget,
    renderDashboardGenomeWidget,
    renderDashboardWearableTilesWidget,
    prepareDashboardWearableTilesWidget,
    renderDashboardInsightsListWidget,
    prepareDashboardInsightsListWidget,
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
    projectLabsPriorityBanner,
    projectDashboardWearableTilesWidget,
    projectDashboardInsightsListWidget,
    projectDashboardRecommendationsWidget,
    projectDashboardKeyTrendsWidget,
    projectDashboardGenomeWidget,
  };
}
