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
// Native namespaces own default arguments; injected results remain opaque.
type CompareModule = typeof import('./compare-correlations.js');
type NativeDashboardFactory = typeof import('./dashboard-view-composition.js').createDashboardViewComposition;
type DashboardView = ReturnType<NativeDashboardFactory>;
type DashboardMethods = {
  [Key in keyof DashboardView]: DashboardView[Key] extends (...args: infer Args) => unknown
    ? (...args: Args) => unknown
    : unknown;
};
type DashboardPreferenceOperations = {
  order: { filter(predicate: (id: unknown) => boolean): unknown[] };
  hidden: { includes(id: unknown): boolean };
};
type DashboardOperations = Omit<DashboardMethods, 'getDashboardWidgetPrefs'> & {
  getDashboardWidgetPrefs: () => DashboardPreferenceOperations;
};
type ComparisonOperations = Omit<CompareModule, 'showCompare' | 'showCorrelations'> & {
  showCompare(data: unknown): ReturnType<CompareModule['showCompare']>;
  showCorrelations(data: unknown): ReturnType<CompareModule['showCorrelations']>;
};
type DashboardDataOperations = import('../types/health-data-loader.js').DashboardHealthDataReader;
type RecommendationConstructorOperations = (deps:
  Omit<Parameters<typeof createRecommendationActions>[0],
    'buildDashboardWidgetContext' | 'getCachedRecommendationsCatalog' | 'getGlobalRecommendationCandidates'>
  & Pick<DashboardOperations,
    'buildDashboardWidgetContext' | 'getCachedRecommendationsCatalog' | 'getGlobalRecommendationCandidates'>
) => ReturnType<typeof createRecommendationActions>;

let compareModule: CompareModule | null = null;
let comparePromise: Promise<CompareModule> | null = null;
const compareDeps: Record<string, unknown> = {};
export function configureCompareCorrelationViews(deps: unknown) {
  Object.assign(compareDeps, deps);
  compareModule?.configureCompareCorrelationViews(deps);
}
function loadCompareModule() {
  return comparePromise ||= import('./compare-correlations.js').then(module => {
    module.configureCompareCorrelationViews(compareDeps);
    compareModule = module;
    return module;
  }).catch(error => { comparePromise = null; throw error; });
}
function showCompare(data?: unknown) {
  return showPreparedRoute('compare', 'Compare', () => !!compareModule, loadCompareModule,
    () => (compareModule as ComparisonOperations | null)?.showCompare(data));
}
function showCorrelations(data?: unknown) {
  return showPreparedRoute('correlations', 'Correlations', () => !!compareModule, loadCompareModule,
    () => (compareModule as ComparisonOperations | null)?.showCorrelations(data));
}
const setCompareDate1 = (...args: Parameters<CompareModule['setCompareDate1']>) => compareModule?.setCompareDate1(...args);
const setCompareDate2 = (...args: Parameters<CompareModule['setCompareDate2']>) => compareModule?.setCompareDate2(...args);
const updateCompare = (...args: Parameters<CompareModule['updateCompare']>) => compareModule?.updateCompare(...args);
const swapCompareDates = (...args: Parameters<CompareModule['swapCompareDates']>) => compareModule?.swapCompareDates(...args);
const renderCompareTable = (...args: Parameters<CompareModule['renderCompareTable']>) => compareModule?.renderCompareTable(...args);
const populateCorrelationOptions = (...args: Parameters<CompareModule['populateCorrelationOptions']>) => compareModule?.populateCorrelationOptions(...args);
const showCorrelationDropdown = (...args: Parameters<CompareModule['showCorrelationDropdown']>) => compareModule?.showCorrelationDropdown(...args);
const filterCorrelationOptions = (...args: Parameters<CompareModule['filterCorrelationOptions']>) => compareModule?.filterCorrelationOptions(...args);
const toggleCorrelationMarker = (...args: Parameters<CompareModule['toggleCorrelationMarker']>) => compareModule?.toggleCorrelationMarker(...args);
const applyCorrelationPreset = (...args: Parameters<CompareModule['applyCorrelationPreset']>) => compareModule?.applyCorrelationPreset(...args);
const renderCorrelationChips = (...args: Parameters<CompareModule['renderCorrelationChips']>) => compareModule?.renderCorrelationChips(...args);
const renderCorrelationChart = (...args: Parameters<CompareModule['renderCorrelationChart']>) => compareModule?.renderCorrelationChart(...args);
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

export function showLabs(preData?: unknown) { return getLensPageHandlers().showLabs(preData); }
export function showBiologyScoresLens(preData?: unknown) {
  return showCategoryPresentationRoute('biology-scores', 'Biology Scores', () => getLensPageHandlers().showBiologyScores(preData));
}
export function showGenomeLens() { return getLensPageHandlers().showGenomeLens(); }
export function showBodyLens() { return getLensPageHandlers().showBodyLens(); }
export function showInsightLens(preData?: unknown) { return getLensPageHandlers().showInsightLens(preData); }
export function showRecommendations(preData?: unknown) { return getLensPageHandlers().showRecommendations(preData); }

let dashboardView: unknown;
let lensPageHandlers: ReturnType<typeof createLensPageHandlers> | undefined;
let recommendationActions: ReturnType<typeof createRecommendationActions> | undefined;

function getDashboardView() {
  if (!dashboardView) throw new Error('Dashboard view is not initialized; call configureDashboardViewFactory first');
  return dashboardView as DashboardOperations;
}

function getLensPageHandlers() {
  if (!lensPageHandlers) throw new Error('Lens page handlers are not initialized; call configureDashboardViewFactory first');
  return lensPageHandlers;
}

function getRecommendationActions() {
  if (!recommendationActions) throw new Error('Recommendation actions are not initialized; call configureDashboardViewFactory first');
  return recommendationActions;
}

export function showDashboard(data?: unknown) { return getDashboardView().showDashboard(data); }

export async function _openAllSessionsModal() {
  const module = await loadLightSunUI();
  return module._openAllSessionsModal();
}

function _expandLightToolsSection() {
  return loadLightSunUI().then(module => module._expandLightToolsSection());
}

function _toggleChannelDetail(channel: unknown) {
  return loadLightSunUI().then(module => module._toggleChannelDetail(channel));
}

function _openChannelOnLightPage(channel: unknown) {
  return loadLightSunUI().then(module => module._openChannelOnLightPage(channel));
}

function renderLightTodayStrip() {
  return getLoadedLightSunModule()?.renderLightTodayStrip?.() || '';
}

function renderLightChannelsLive() {
  return getLoadedLightSunModule()?.renderLightChannelsLive?.();
}

function renderConditionsNow(options?: Parameters<NonNullable<ReturnType<typeof getLoadedLightSunModule>>['renderConditionsNow']>[0]) {
  return getLoadedLightSunModule()?.renderConditionsNow?.(options) || '';
}

function _refreshConditionsNow() {
  return loadLightSunUI().then(module => module._refreshConditionsNow());
}

function _inspectConditionsNow() {
  return loadLightSunUI().then(module => module._inspectConditionsNow());
}

function renderDeferredRouteStatus(content: Element, message: string, { busy = false, error = false }: {busy?: unknown;error?: unknown} = {}) {
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

function showLightRoute(data: unknown) {
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

function showLight(data: unknown) {
  return showLightRoute(data);
}

function showPreparedRoute<Args extends unknown[], Result>(route: string, label: string, isReady: () => unknown, prepare: () => Promise<unknown>, render: (...args: Args) => Result, args: Args = [] as unknown as Args) {
  if (isReady()) return render(...args);
  const content = typeof document !== 'undefined' ? document.getElementById('main-content') : null;
  if (content) renderDeferredRouteStatus(content, `Loading ${label}…`, { busy: true });

  return prepare()
    .then(async () => {
      if (state.currentView !== route) return false;
      if (await render(...args) === false || state.currentView !== route) return false;
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

function showCategoryPresentationRoute<Result>(route: string, label: string, render: () => Result, options: {charts?: unknown} = {}) {
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

function dashboardRouteDataHasContent(data: unknown) {
  const wearableMetrics = state.importedData?.wearableSummary?.metrics || {};
  return Boolean(
    (data as DashboardDataOperations | null | undefined)?.dates?.length
    || Object.values(wearableMetrics).some(metric => (metric as { latest?: unknown } | null | undefined)?.latest != null)
    || Number(state.nutritionSummary?.totalMeals || 0) > 0
    || Object.values((data as DashboardDataOperations | null | undefined)?.categories || {}).some(category => category?.singlePoint && category?.singleDate),
  );
}

function showDashboardRoute(data: unknown) {
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

function showInsightRoute(data: unknown) {
  return showPreparedRoute(
    'insight',
    'Insight',
    isInsightHealthDataReady,
    loadInsightHealthDataModules,
    showInsightLens,
    [data],
  );
}

function showRecommendationsRoute(data: unknown) {
  return showPreparedRoute(
    'recommendations',
    'Tips',
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

export function navigate(category: Parameters<ReturnType<typeof createNavigate>>[0], data?: Parameters<ReturnType<typeof createNavigate>>[1]) {
  return _navigate(category, data);
}

configureOnboardingView({ navigate });
configureCategoryCustomization({ navigate, buildSidebar });

// ═══════════════════════════════════════════════
// DASHBOARD WIDGETS
// ═══════════════════════════════════════════════

export function configureDashboardViewFactory(createDashboardView: unknown) {
  if (typeof createDashboardView !== 'function') {
    throw new TypeError('configureDashboardViewFactory requires a dashboard view factory');
  }
  if (dashboardView) return dashboardView;

  dashboardView = (createDashboardView as (deps: Parameters<NativeDashboardFactory>[0]) => unknown)({
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
    buildDashboardWidgetContext: (dashboardView as DashboardOperations).buildDashboardWidgetContext,
    renderLabsPriorityBanner: (dashboardView as DashboardOperations).renderLabsPriorityBanner,
    renderDashboardQuickMarkersWidget: (dashboardView as DashboardOperations).renderDashboardQuickMarkersWidget,
    renderDashboardKeyTrendsWidget: (dashboardView as DashboardOperations).renderDashboardKeyTrendsWidget,
    renderDashboardGenomeWidget: (dashboardView as DashboardOperations).renderDashboardGenomeWidget,
    renderDashboardWearableTilesWidget: (dashboardView as DashboardOperations).renderDashboardWearableTilesWidget,
    renderDashboardInsightsListWidget: (dashboardView as DashboardOperations).renderDashboardInsightsListWidget,
    renderDashboardRecommendationsWidget: (dashboardView as DashboardOperations).renderDashboardRecommendationsWidget,
    renderFocusCard,
    loadFocusCard,
    getDashboardWidgetPrefs: (dashboardView as DashboardOperations).getDashboardWidgetPrefs,
    getCachedRecommendationsCatalog: (dashboardView as DashboardOperations).getCachedRecommendationsCatalog,
    refreshRecommendationsWhenCatalogReady: (dashboardView as DashboardOperations).refreshRecommendationsWhenCatalogReady,
    getGlobalRecommendationCandidates: (dashboardView as DashboardOperations).getGlobalRecommendationCandidates,
    renderRecommendationCard: (dashboardView as DashboardOperations).renderRecommendationCard,
    renderRecommendationsEmpty: (dashboardView as DashboardOperations).renderRecommendationsEmpty,
    lensPageActionAttrs,
    renderLensHeader,
    renderLensPageWidgets,
    renderLensWidget,
  });

  recommendationActions = (createRecommendationActions as RecommendationConstructorOperations)({
    getActiveData,
    buildDashboardWidgetContext: (dashboardView as DashboardOperations).buildDashboardWidgetContext,
    getCachedRecommendationsCatalog: (dashboardView as DashboardOperations).getCachedRecommendationsCatalog,
    getGlobalRecommendationCandidates: (dashboardView as DashboardOperations).getGlobalRecommendationCandidates,
    setRecommendationState: (...args) => getDashboardView().setRecommendationState(...args),
  });

  return dashboardView;
}

export const toggleDashboardOrganizeMode = (...args: Parameters<DashboardOperations['toggleDashboardOrganizeMode']>) => getDashboardView().toggleDashboardOrganizeMode(...args);
export const moveDashboardWidget = (...args: Parameters<DashboardOperations['moveDashboardWidget']>) => getDashboardView().moveDashboardWidget(...args);
export const hideDashboardWidget = (...args: Parameters<DashboardOperations['hideDashboardWidget']>) => getDashboardView().hideDashboardWidget(...args);
export const showDashboardWidget = (...args: Parameters<DashboardOperations['showDashboardWidget']>) => getDashboardView().showDashboardWidget(...args);
export const addDashboardWidgetFromLens = (...args: Parameters<DashboardOperations['addDashboardWidgetFromLens']>) => getDashboardView().addDashboardWidgetFromLens(...args);
export const removeDashboardWidgetFromLens = (...args: Parameters<DashboardOperations['removeDashboardWidgetFromLens']>) => getDashboardView().removeDashboardWidgetFromLens(...args);
export const addDashboardMarkerWidget = (...args: Parameters<DashboardOperations['addDashboardMarkerWidget']>) => getDashboardView().addDashboardMarkerWidget(...args);
export const addDashboardBiometricMetric = (...args: Parameters<DashboardOperations['addDashboardBiometricMetric']>) => getDashboardView().addDashboardBiometricMetric(...args);
export const addDashboardBiometricWidget = (...args: Parameters<DashboardOperations['addDashboardBiometricWidget']>) => getDashboardView().addDashboardBiometricWidget(...args);
export const removeDashboardBiometricMetric = (...args: Parameters<DashboardOperations['removeDashboardBiometricMetric']>) => getDashboardView().removeDashboardBiometricMetric(...args);
export const filterDashboardMarkerWidgetPicker = (...args: Parameters<DashboardOperations['filterDashboardMarkerWidgetPicker']>) => getDashboardView().filterDashboardMarkerWidgetPicker(...args);
export const filterDashboardBiometricWidgetPicker = (...args: Parameters<DashboardOperations['filterDashboardBiometricWidgetPicker']>) => getDashboardView().filterDashboardBiometricWidgetPicker(...args);
export const resetDashboardWidgets = () => getDashboardView().resetDashboardWidgets();
export const clearDashboardWidgets = () => getDashboardView().clearDashboardWidgets();
export const openDashboardWidgetPicker = () => getDashboardView().openDashboardWidgetPicker();
export const openDashboardBiometricPicker = () => getDashboardView().openDashboardBiometricPicker();
export const closeDashboardWidgetPicker = () => getDashboardView().closeDashboardWidgetPicker();
export const startDashboardWidgetDrag = (...args: Parameters<DashboardOperations['startDashboardWidgetDrag']>) => getDashboardView().startDashboardWidgetDrag(...args);
export const allowDashboardWidgetDrop = (...args: Parameters<DashboardOperations['allowDashboardWidgetDrop']>) => getDashboardView().allowDashboardWidgetDrop(...args);
export const dropDashboardWidget = (...args: Parameters<DashboardOperations['dropDashboardWidget']>) => getDashboardView().dropDashboardWidget(...args);
export const toggleDashboardQuickMarkerPin = (...args: Parameters<DashboardOperations['toggleDashboardQuickMarkerPin']>) => getDashboardView().toggleDashboardQuickMarkerPin(...args);

export function openRecommendationDetail(...args: Parameters<ReturnType<typeof createRecommendationActions>['openRecommendationDetail']>) { return getRecommendationActions().openRecommendationDetail(...args); }
export function discussRecommendation(...args: Parameters<ReturnType<typeof createRecommendationActions>['discussRecommendation']>) { return getRecommendationActions().discussRecommendation(...args); }
export function saveRecommendation(...args: Parameters<ReturnType<typeof createRecommendationActions>['saveRecommendation']>) { return getRecommendationActions().saveRecommendation(...args); }
export function dismissRecommendation(...args: Parameters<ReturnType<typeof createRecommendationActions>['dismissRecommendation']>) { return getRecommendationActions().dismissRecommendation(...args); }

configureCompareCorrelationViews({
  renderTableColgroup,
  renderScrollableTableShell,
  renderCategoryGlyph,
});
