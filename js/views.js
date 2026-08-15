// @ts-check
// views.js — route facade and compatibility exports

import { getActiveData, destroyAllCharts } from './data.js';
import {
  buildSidebar,
} from './nav.js';
import { setupDropZone } from './import-drop-zone.js';
import { createRecommendationActions } from './recommendation-actions.js';
import { createNavigate, getInitialView as getRouterInitialView } from './views-router.js';
import { isGeneticsStylesheetLoaded, loadGeneticsStylesheet } from './dna-runtime.js';
import {
  getLoadedLightSunModule,
  isLightSunUILoaded,
  loadLightSunUI,
} from './light-sun-loader.js';
import {
  isBodyHealthDataReady,
  isChartsModuleLoaded,
  isDashboardHealthDataReady,
  isDnaModuleLoaded,
  isInsightHealthDataReady,
  isRecommendationsHealthDataReady,
  loadBodyHealthDataModules,
  loadChartsModule,
  loadDashboardHealthDataModules,
  loadDnaModule,
  loadInsightHealthDataModules,
  loadRecommendationsHealthDataModules,
} from './health-data-loader.js';
import { state } from './state.js';
import { createLensPageHandlers } from './lens-pages.js';
import { lensPageActionAttrs, renderLensHeader, renderLensPageWidgets, renderLensWidget, moveLensPageWidget } from './lens-page-shell.js';
import { renderFocusCard, buildFocusContext, loadFocusCard, refreshFocusCard } from './focus-card.js';
import { configureOnboardingView, renderOnboardingBanner, renderAIConnectionReminder, dismissAIReminder, openChatProviderQuiz, setOnboardingFocus, completeOnboardingSex, completeOnboardingProfile, dismissOnboarding } from './onboarding-view.js';
import { renderCategoryGlyph } from './category-glyphs.js';
import { renderChartCard, renderTableColgroup, renderScrollableTableShell, renderTableView, renderHeatmapView, renderFattyAcidsView, renderFattyAcidsCharts } from './category-view-renderers.js';
import { showCategory, switchView } from './category-page-view.js';
import { isCategoryViewsStylesheetLoaded, loadCategoryViewsStylesheet } from './category-page-runtime.js';
import { isCycleStylesheetLoaded, loadCycleStylesheet } from './cycle-runtime.js';
import { configureCategoryCustomization, renameCategory, renameMarker, revertMarkerName, showEmojiPicker, changeCategoryIcon } from './category-customization.js';
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

/** @typedef {ReturnType<typeof import('./dashboard-view-composition.js').createDashboardViewComposition>} DashboardView */

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
  renameCategory,
  renameMarker,
  revertMarkerName,
  changeCategoryIcon,
  switchView,
  showLight,
  _expandLightToolsSection,
  _toggleChannelDetail,
  _openChannelOnLightPage,
  renderLightTodayStrip,
  renderLightChannelsLive,
  renderConditionsNow,
  _refreshConditionsNow,
  _inspectConditionsNow,
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

export function showLabs(preData) { return getLensPageHandlers().showLabs(preData); }
export function showBiologyScoresLens(preData) { return getLensPageHandlers().showBiologyScores(preData); }
export function showGenomeLens() { return getLensPageHandlers().showGenomeLens(); }
export function showBodyLens() { return getLensPageHandlers().showBodyLens(); }
export function showInsightLens(preData) { return getLensPageHandlers().showInsightLens(preData); }
export function showRecommendations(preData) { return getLensPageHandlers().showRecommendations(preData); }

/** @type {DashboardView | undefined} */
let dashboardView;
/** @type {ReturnType<typeof createLensPageHandlers> | undefined} */
let lensPageHandlers;
/** @type {ReturnType<typeof createRecommendationActions> | undefined} */
let recommendationActions;

function getDashboardView() {
  if (!dashboardView) throw new Error('Dashboard view is not initialized; call configureDashboardViewFactory first');
  return dashboardView;
}

function getLensPageHandlers() {
  if (!lensPageHandlers) throw new Error('Lens page handlers are not initialized; call configureDashboardViewFactory first');
  return lensPageHandlers;
}

function getRecommendationActions() {
  if (!recommendationActions) throw new Error('Recommendation actions are not initialized; call configureDashboardViewFactory first');
  return recommendationActions;
}

export function showDashboard(data) { return getDashboardView().showDashboard(data); }

export async function _openAllSessionsModal() {
  const module = await loadLightSunUI();
  return module._openAllSessionsModal();
}

function _expandLightToolsSection() {
  return loadLightSunUI().then(module => module._expandLightToolsSection());
}

function _toggleChannelDetail(channel) {
  return loadLightSunUI().then(module => module._toggleChannelDetail(channel));
}

function _openChannelOnLightPage(channel) {
  return loadLightSunUI().then(module => module._openChannelOnLightPage(channel));
}

function renderLightTodayStrip() {
  return getLoadedLightSunModule()?.renderLightTodayStrip?.() || '';
}

function renderLightChannelsLive() {
  return getLoadedLightSunModule()?.renderLightChannelsLive?.();
}

function renderConditionsNow(options) {
  return getLoadedLightSunModule()?.renderConditionsNow?.(options) || '';
}

function _refreshConditionsNow() {
  return loadLightSunUI().then(module => module._refreshConditionsNow());
}

function _inspectConditionsNow() {
  return loadLightSunUI().then(module => module._inspectConditionsNow());
}

function renderDeferredRouteStatus(content, message, { busy = false, error = false } = {}) {
  const status = document.createElement('section');
  status.className = 'dashboard-widget-empty';
  status.textContent = message;
  if (busy) {
    status.setAttribute('aria-busy', 'true');
    status.setAttribute('aria-live', 'polite');
  }
  if (error) status.setAttribute('role', 'alert');
  content.replaceChildren(status);
}

function showLightRoute(data) {
  if (isLightSunUILoaded()) return getLoadedLightSunModule()?.showLight(data);

  const content = typeof document !== 'undefined' ? document.getElementById('main-content') : null;
  if (content) renderDeferredRouteStatus(content, 'Loading Light & Sun…', { busy: true });

  return loadLightSunUI()
    .then(module => {
      if (state.currentView !== 'light') return false;
      module.showLight(data);
      return true;
    })
    .catch(err => {
      console.error('Failed to load Light & Sun modules', err);
      if (state.currentView === 'light' && content) {
        renderDeferredRouteStatus(
          content,
          'Light & Sun could not be loaded. Try opening the page again.',
          { error: true },
        );
      }
      return false;
    });
}

function showLight(data) {
  return showLightRoute(data);
}

/**
 * @param {string} route
 * @param {string} label
 * @param {() => boolean} isReady
 * @param {() => Promise<unknown>} prepare
 * @param {(...args: any[]) => any} render
 * @param {any[]} [args]
 */
function showPreparedRoute(route, label, isReady, prepare, render, args = []) {
  if (isReady()) return render(...args);
  const content = typeof document !== 'undefined' ? document.getElementById('main-content') : null;
  if (content) renderDeferredRouteStatus(content, `Loading ${label}…`, { busy: true });

  return prepare()
    .then(() => {
      if (state.currentView !== route) return false;
      render(...args);
      // A prepared Dashboard renders its mobile shell after createNavigate's
      // initial nav sync. Reconcile again so the temporary lens tab bar is
      // removed instead of remaining beside the Dashboard-owned tab bar.
      syncMobileBottomNav(route);
      return true;
    })
    .catch(err => {
      console.error(`Failed to load ${label}`, err);
      if (state.currentView === route && content) {
        renderDeferredRouteStatus(
          content,
          `${label} could not be loaded. Try opening the page again.`,
          { error: true },
        );
      }
      return false;
    });
}

function showGenomeRoute() {
  return showPreparedRoute(
    'genome',
    'Genome',
    () => isGeneticsStylesheetLoaded() && isDnaModuleLoaded(),
    () => Promise.all([loadGeneticsStylesheet(), loadDnaModule()]),
    showGenomeLens,
  );
}

/**
 * @param {string} route
 * @param {string} label
 * @param {() => any} render
 * @param {{ charts?: boolean }} [options]
 */
function showCategoryPresentationRoute(route, label, render, options = {}) {
  const needsCharts = options.charts === true;
  return showPreparedRoute(
    route,
    label,
    () => isCategoryViewsStylesheetLoaded() && (!needsCharts || isChartsModuleLoaded()),
    () => Promise.all([
      loadCategoryViewsStylesheet(),
      ...(needsCharts ? [loadChartsModule()] : []),
    ]),
    render,
  );
}

function dashboardRouteDataHasContent(data) {
  const wearableMetrics = state.importedData?.wearableSummary?.metrics || {};
  return Boolean(
    data?.dates?.length
    || Object.values(wearableMetrics).some(metric => metric?.latest != null)
    || Object.values(data?.categories || {}).some(category => category?.singlePoint && category?.singleDate),
  );
}

function showDashboardRoute(data) {
  const routeData = data || getActiveData();
  if (!dashboardRouteDataHasContent(routeData)) return showDashboard(routeData);
  const prefs = getDashboardView().getDashboardWidgetPrefs();
  const visibleWidgetIds = prefs.order.filter(id => !prefs.hidden.includes(id));
  const needsCyclePresentation = state.profileSex === 'female'
    && (visibleWidgetIds.includes('cycle') || state.importedData?.menstrualCycle);
  const options = { visibleWidgetIds };
  return showPreparedRoute(
    'dashboard',
    'Dashboard',
    () => isDashboardHealthDataReady(routeData, options)
      && (!needsCyclePresentation || isCycleStylesheetLoaded()),
    () => Promise.all([
      loadDashboardHealthDataModules(routeData, options),
      ...(needsCyclePresentation ? [loadCycleStylesheet()] : []),
    ]),
    showDashboard,
    [routeData],
  );
}

function showBodyRoute() {
  return showPreparedRoute(
    'body',
    'Body',
    () => isBodyHealthDataReady()
      && (state.profileSex !== 'female' || isCycleStylesheetLoaded()),
    () => Promise.all([
      loadBodyHealthDataModules(),
      ...(state.profileSex === 'female' ? [loadCycleStylesheet()] : []),
    ]),
    showBodyLens,
  );
}

function showInsightRoute(data) {
  return showPreparedRoute(
    'insight',
    'Insight',
    isInsightHealthDataReady,
    loadInsightHealthDataModules,
    showInsightLens,
    [data],
  );
}

function showRecommendationsRoute(data) {
  return showPreparedRoute(
    'recommendations',
    'Recommendations',
    isRecommendationsHealthDataReady,
    loadRecommendationsHealthDataModules,
    showRecommendations,
    [data],
  );
}

const _navigate = createNavigate({
  routeHandlers: {
    dashboard: showDashboardRoute,
    labs: showLabs,
    biologyScores: showBiologyScoresLens,
    genome: showGenomeRoute,
    body: showBodyRoute,
    insight: showInsightRoute,
    recommendations: showRecommendationsRoute,
    correlations: data => showCategoryPresentationRoute(
      'correlations',
      'Correlations',
      () => showCorrelations(data),
      { charts: true },
    ),
    compare: data => showCategoryPresentationRoute('compare', 'Compare', () => showCompare(data)),
    light: showLightRoute,
    category: (category, data) => showCategoryPresentationRoute(
      category,
      'Category',
      () => showCategory(category, data),
      { charts: true },
    ),
  },
  syncMobileBottomNav,
  destroyAllCharts,
});

export function navigate(category, data) {
  return _navigate(category, data);
}

configureOnboardingView({ navigate });
configureCategoryCustomization({ navigate, buildSidebar });

// ═══════════════════════════════════════════════
// DASHBOARD WIDGETS
// ═══════════════════════════════════════════════

/** @param {typeof import('./dashboard-view-composition.js').createDashboardViewComposition} createDashboardView */
export function configureDashboardViewFactory(createDashboardView) {
  if (typeof createDashboardView !== 'function') {
    throw new TypeError('configureDashboardViewFactory requires a dashboard view factory');
  }
  if (dashboardView) return dashboardView;

  dashboardView = createDashboardView({
    navigate,
    showRecommendations,
    showEmojiPicker,
    renderFocusCard,
    loadFocusCard,
    renderOnboardingBanner,
    renderAIConnectionReminder,
  });

  lensPageHandlers = createLensPageHandlers({
    setupDropZone,
    buildDashboardWidgetContext: dashboardView.buildDashboardWidgetContext,
    renderLabsPriorityBanner: dashboardView.renderLabsPriorityBanner,
    renderDashboardQuickMarkersWidget: dashboardView.renderDashboardQuickMarkersWidget,
    renderDashboardKeyTrendsWidget: dashboardView.renderDashboardKeyTrendsWidget,
    renderDashboardGenomeWidget: dashboardView.renderDashboardGenomeWidget,
    renderDashboardWearableTilesWidget: dashboardView.renderDashboardWearableTilesWidget,
    renderDashboardInsightsListWidget: dashboardView.renderDashboardInsightsListWidget,
    renderDashboardRecommendationsWidget: dashboardView.renderDashboardRecommendationsWidget,
    renderFocusCard,
    loadFocusCard,
    getDashboardWidgetPrefs: dashboardView.getDashboardWidgetPrefs,
    getCachedRecommendationsCatalog: dashboardView.getCachedRecommendationsCatalog,
    refreshRecommendationsWhenCatalogReady: dashboardView.refreshRecommendationsWhenCatalogReady,
    getGlobalRecommendationCandidates: dashboardView.getGlobalRecommendationCandidates,
    renderRecommendationCard: dashboardView.renderRecommendationCard,
    renderRecommendationsEmpty: dashboardView.renderRecommendationsEmpty,
    lensPageActionAttrs,
    renderLensHeader,
    renderLensPageWidgets,
    renderLensWidget,
  });

  recommendationActions = createRecommendationActions({
    getActiveData,
    buildDashboardWidgetContext: dashboardView.buildDashboardWidgetContext,
    getCachedRecommendationsCatalog: dashboardView.getCachedRecommendationsCatalog,
    getGlobalRecommendationCandidates: dashboardView.getGlobalRecommendationCandidates,
    setRecommendationState: (...args) => getDashboardView().setRecommendationState(...args),
  });

  return dashboardView;
}

export const toggleDashboardOrganizeMode = (...args) => getDashboardView().toggleDashboardOrganizeMode(...args);
export const moveDashboardWidget = (...args) => getDashboardView().moveDashboardWidget(...args);
export const hideDashboardWidget = (...args) => getDashboardView().hideDashboardWidget(...args);
export const showDashboardWidget = (...args) => getDashboardView().showDashboardWidget(...args);
export const addDashboardWidgetFromLens = (...args) => getDashboardView().addDashboardWidgetFromLens(...args);
export const removeDashboardWidgetFromLens = (...args) => getDashboardView().removeDashboardWidgetFromLens(...args);
export const addDashboardMarkerWidget = (...args) => getDashboardView().addDashboardMarkerWidget(...args);
export const addDashboardBiometricMetric = (...args) => getDashboardView().addDashboardBiometricMetric(...args);
export const addDashboardBiometricWidget = (...args) => getDashboardView().addDashboardBiometricWidget(...args);
export const removeDashboardBiometricMetric = (...args) => getDashboardView().removeDashboardBiometricMetric(...args);
export const filterDashboardMarkerWidgetPicker = (...args) => getDashboardView().filterDashboardMarkerWidgetPicker(...args);
export const filterDashboardBiometricWidgetPicker = (...args) => getDashboardView().filterDashboardBiometricWidgetPicker(...args);
export const resetDashboardWidgets = () => getDashboardView().resetDashboardWidgets();
export const clearDashboardWidgets = () => getDashboardView().clearDashboardWidgets();
export const openDashboardWidgetPicker = () => getDashboardView().openDashboardWidgetPicker();
export const openDashboardBiometricPicker = () => getDashboardView().openDashboardBiometricPicker();
export const closeDashboardWidgetPicker = () => getDashboardView().closeDashboardWidgetPicker();
export const startDashboardWidgetDrag = (...args) => getDashboardView().startDashboardWidgetDrag(...args);
export const allowDashboardWidgetDrop = (...args) => getDashboardView().allowDashboardWidgetDrop(...args);
export const dropDashboardWidget = (...args) => getDashboardView().dropDashboardWidget(...args);
export const toggleDashboardQuickMarkerPin = (...args) => getDashboardView().toggleDashboardQuickMarkerPin(...args);

export function openRecommendationDetail(...args) { return getRecommendationActions().openRecommendationDetail(...args); }
export function discussRecommendation(...args) { return getRecommendationActions().discussRecommendation(...args); }
export function saveRecommendation(...args) { return getRecommendationActions().saveRecommendation(...args); }
export function dismissRecommendation(...args) { return getRecommendationActions().dismissRecommendation(...args); }

configureCompareCorrelationViews({
  renderTableColgroup,
  renderScrollableTableShell,
  renderCategoryGlyph,
});
