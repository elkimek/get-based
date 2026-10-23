import {createNavigationCompletionTracker} from './navigation-completion.js';
import {showNotification} from './utils.js';
import {initRecommendationDetailDelegates} from './recommendation-action-delegates.js';
import {createProductionDashboardShell} from './dashboard-view-shell.js';
import {loadDashboardLens, loadDashboardRecommendations} from './dashboard-composition-loader.js';
import {setupDropZone} from './import-drop-zone.js';
import {projectFocusCard} from './focus-card.js';
import {projectOnboardingBanner, projectAIConnectionReminder} from './onboarding-view.js';
import {getLensContentGrid, getLensWidgetChrome} from './lens-page-shell-core.js';
import {isMobileDashboardViewport} from './mobile-dashboard.js';
import { getLoadedBiologyPage, loadBiologyPage } from './biology-page-loader.js';
import { routeRevision } from './route-lifecycle.js';
// views.js — route facade and compatibility exports

import { getActiveData, destroyAllCharts } from './data.js';
import {
  buildSidebar,
} from './nav.js';
import type { createRecommendationActions } from './recommendation-actions.js';
import { createNavigate, getInitialView as getRouterInitialView } from './views-router.js';
import { isGeneticsStylesheetLoaded, loadGeneticsStylesheet } from './dna-runtime.js';
import {
  getLoadedLightSunModule,
  isLightSunUILoaded,
  loadLightSunUI,
} from './light-sun-loader.js';
import {
  isBodyHealthDataReady,
  isNutritionFeatureReady,
  isSupplementsModuleLoaded,
  isChartsModuleLoaded,
  isDashboardHealthDataReady,
  isDnaModuleLoaded,
  isInsightHealthDataReady,
  isRecommendationsHealthDataReady,
  loadBodyHealthDataModules,
  loadNutritionFeature,
  loadSupplementsModule,
  loadChartsModule,
  loadDashboardHealthDataModules,
  loadDnaModule,
  loadInsightHealthDataModules,
  loadRecommendationsHealthDataModules,
} from './health-data-loader.js';
import { state } from './state.js';
import type { createLensPageHandlers } from './lens-pages.js';
import { moveLensPageWidget } from './lens-page-shell-core.js';
import { renderFocusCard, buildFocusContext, loadFocusCard, refreshFocusCard } from './focus-card.js';
import { configureOnboardingView, renderOnboardingBanner, renderAIConnectionReminder, dismissAIReminder, openChatProviderQuiz, setOnboardingFocus, completeOnboardingSex, completeOnboardingProfile, dismissOnboarding } from './onboarding-view.js';
import { renderChartCard, renderTableView, renderHeatmapView, renderFattyAcidsView, renderFattyAcidsCharts } from './category-view-renderers.js';
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
export type NativeDashboardFactory = typeof import('./dashboard-view-composition.js').createDashboardViewComposition;
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
export type DashboardOperations = Omit<DashboardMethods, 'getDashboardWidgetPrefs'> & {
  getDashboardWidgetPrefs: () => DashboardPreferenceOperations;
};
type ComparisonOperations = Omit<CompareModule, 'showCompare' | 'showCorrelations'> & {
  showCompare(data: unknown): ReturnType<CompareModule['showCompare']>;
  showCorrelations(data: unknown): ReturnType<CompareModule['showCorrelations']>;
};
type DashboardDataOperations = import('../types/health-data-loader.js').DashboardHealthDataReader;
export type RecommendationConstructorOperations = (deps:
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
  showEmojiPicker,
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

export function showLabs(preData?: unknown) { return withLens('labs', 'Labs', handlers => handlers.showLabs(preData)); }
let biologyRouteRequest = 0;
export function showBiologyScoresLens(preData?: unknown) {
  const request = ++biologyRouteRequest;
  const profileId = state.currentProfile;
  const importedData = state.importedData;
  const revision = routeRevision();
  const content = typeof document !== 'undefined' ? document.getElementById('main-content') : null;
  const ownsView = () => request === biologyRouteRequest && state.currentProfile === profileId
    && state.importedData === importedData && routeRevision() === revision
    && (typeof document === 'undefined' || document.getElementById('main-content') === content);
  return showPreparedRoute(
    'biology-scores', 'Biology Scores',
    () => isCategoryViewsStylesheetLoaded() && getLoadedBiologyPage(),
    () => Promise.all([loadCategoryViewsStylesheet(), loadBiologyPage()]),
    () => withLens('biology-scores', 'Biology Scores', handlers => handlers.showBiologyScores(preData)),
    [], ownsView,
  );
}
export function showGenomeLens() { return withLens('genome', 'Genome', handlers => handlers.showGenomeLens()); }
export function showBodyLens() { return withLens('body', 'Biometrics', handlers => handlers.showBodyLens()); }
export function showNutritionLens() { return withLens('nutrition', 'Nutrition', handlers => handlers.showNutritionLens()); }
export function showSupplementsLens() { return withLens('supplements', 'Supplements & Medication', handlers => handlers.showSupplementsLens()); }
export function showInsightLens(preData?: unknown) { return withLens('insight', 'Insight', handlers => handlers.showInsightLens(preData)); }
export function showRecommendations(preData?: unknown) { return withLens('recommendations', 'Tips', handlers => handlers.showRecommendations(preData)); }

export const viewsComposition: {
  dashboardView: unknown;
  lensPageHandlers: ReturnType<typeof createLensPageHandlers> | undefined;
  recommendationActions: ReturnType<typeof createRecommendationActions> | undefined;
} = {dashboardView: undefined, lensPageHandlers: undefined, recommendationActions: undefined};

type ProductionDashboard = ReturnType<typeof createProductionDashboardShell>;
let productionDashboard: ProductionDashboard | null = null;
let productionConfiguration = 0;
let productionRequest = 0;

/** The old injected configure path remains synchronous and owns its own faults. */
export function retireProductionDashboard(): void {
  productionConfiguration++;
  productionRequest++;
  productionDashboard = null;
}

export function configureProductionDashboard(): void {
  if (productionDashboard || viewsComposition.dashboardView) return;
  productionConfiguration++;
  initRecommendationDetailDelegates();
  productionDashboard = createProductionDashboardShell({
    navigate, showRecommendations, showEmojiPicker, renderFocusCard, loadFocusCard,
    projectOnboardingBanner, projectAIConnectionReminder,
  }, view => { viewsComposition.dashboardView = view; });
}

function captureProductionRoute(route: string) {
  const shell = productionDashboard, configuration = productionConfiguration;
  const profile = state.currentProfile, data = state.importedData, revision = routeRevision();
  const main = typeof document === 'undefined' ? null : document.getElementById('main-content');
  const mobile = isMobileDashboardViewport(), originalRoute = state.currentView;
  let synchronous = true;
  queueMicrotask(() => { synchronous = false; });
  return () => !shell || shell === productionDashboard && configuration === productionConfiguration
    && profile === state.currentProfile && data === state.importedData && revision === routeRevision()
    && (state.currentView === route || synchronous && state.currentView === originalRoute)
    && (route !== 'dashboard' || isMobileDashboardViewport() === mobile)
    && (typeof document === 'undefined' ? null : document.getElementById('main-content')) === main;
}

function beginProductionRequest(route: string, modalAction = false, supersedes = true) {
  const request = supersedes ? ++productionRequest : productionRequest;
  const shell = productionDashboard, configuration = productionConfiguration;
  const profile = state.currentProfile, data = state.importedData, revision = routeRevision();
  const originalRoute = state.currentView, mobile = isMobileDashboardViewport();
  const origin = typeof document === 'undefined' ? null : document;
  const main = origin?.getElementById('main-content') ?? null;
  const focus = origin?.activeElement;
  const modalSelector = '.modal-overlay.show,.confirm-overlay.show,dialog[open],[data-modal-focus-trap]';
  const visible = () => origin ? [...origin.querySelectorAll(modalSelector)].map(overlay => {
    const modal = overlay.querySelector(':scope > .modal') ?? overlay;
    return {overlay, modal, first: modal.firstElementChild};
  }) : [];
  const dialogs = modalAction ? visible() : [];
  let active = true, synchronous = true, observer: MutationObserver | null = null;
  queueMicrotask(() => { synchronous = false; });
  const current = () => active && (!supersedes || request === productionRequest) && shell === productionDashboard
    && configuration === productionConfiguration && profile === state.currentProfile && data === state.importedData
    && revision === routeRevision() && (state.currentView === route || (synchronous && state.currentView === originalRoute))
    && (!supersedes || !modalAction && route !== 'dashboard' || isMobileDashboardViewport() === mobile)
    && (typeof document === 'undefined' ? null : document) === origin
    && (origin?.getElementById('main-content') ?? null) === main && (!main || main.isConnected)
    && (!modalAction || origin?.activeElement === focus && (() => {
      const next = visible();
      return next.length === dialogs.length && next.every((row, index) => {
        const before = dialogs[index]!;
        return row.overlay === before.overlay && row.modal === before.modal && row.first === before.first;
      });
    })());
  const release = () => { observer?.disconnect(); observer = null; };
  if (modalAction && origin?.body && typeof MutationObserver !== 'undefined') {
    observer = new MutationObserver(records => {
      const isModal = (node: Node) => node instanceof Element && (node.matches('.modal-overlay,.confirm-overlay,[data-modal-focus-trap]')
        || !!node.querySelector('.modal-overlay,.confirm-overlay,[data-modal-focus-trap]'));
      if (!current() || records.some(record => record.type === 'attributes'
        ? record.target instanceof Element && record.target.matches('.modal-overlay,.confirm-overlay,[data-modal-focus-trap]')
        : record.target instanceof Element && record.target.matches('.modal')
          || [...record.addedNodes, ...record.removedNodes].some(isModal))) {
        active = false;
        release();
      }
    });
    observer.observe(origin.body, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-modal-focus-trap']});
  }
  return {current, release, main, shell};
}

function withProductionDashboard<Result>(route: string, label: string, render: (isCurrent: () => boolean) => Result, modalAction = false) {
  const owner = beginProductionRequest(route, modalAction);
  if (!owner.shell) return render(owner.current);
  if (owner.main && !modalAction) renderDeferredRouteStatus(owner.main, `Loading ${label}…`, {busy: true});
  return owner.shell.prepare(owner.current).then(view => {
    if (!view || !owner.current()) return false;
    return render(owner.current);
  }).catch(error => {
    console.error(`Failed to load ${label}`, error);
    if (owner.current() && owner.main && !modalAction) {
      renderDeferredRouteStatus(owner.main, `${label} could not be loaded. Try opening the page again.`, {error: true});
    }
    return false;
  }).finally(owner.release);
}

type LensHandlers = ReturnType<typeof createLensPageHandlers>;
function withLens<Result>(route: string, label: string, render: (handlers: LensHandlers) => Result) {
  if (viewsComposition.lensPageHandlers) return render(viewsComposition.lensPageHandlers);
  if (!productionDashboard) return render(getLensPageHandlers());
  return withProductionDashboard(route, label, async isCurrent => {
    const shell = productionDashboard, configuration = productionConfiguration;
    const profile = state.currentProfile, data = state.importedData, revision = routeRevision();
    const main = document.getElementById('main-content');
    const module = await loadDashboardLens();
    if (!isCurrent() || shell !== productionDashboard || configuration !== productionConfiguration || profile !== state.currentProfile
      || data !== state.importedData || revision !== routeRevision() || state.currentView !== route
      || document.getElementById('main-content') !== main) return false;
    if (!viewsComposition.lensPageHandlers) {
      const view = viewsComposition.dashboardView as ReturnType<NativeDashboardFactory>;
      viewsComposition.lensPageHandlers = module.createLensPageHandlers({
        setupDropZone,
        buildDashboardWidgetContext: view.buildDashboardWidgetContext,
        projectLabsPriorityBanner: view.projectLabsPriorityBanner,
        projectDashboardQuickMarkersWidget: view.projectDashboardQuickMarkersWidget,
        projectDashboardKeyTrendsWidget: view.projectDashboardKeyTrendsWidget,
        projectDashboardGenomeWidget: view.projectDashboardGenomeWidget,
        projectDashboardWearableTilesWidget: view.projectDashboardWearableTilesWidget,
        projectDashboardInsightsListWidget: view.projectDashboardInsightsListWidget,
        projectDashboardRecommendationsWidget: view.projectDashboardRecommendationsWidget,
        projectFocusCard, loadFocusCard,
        getDashboardWidgetPrefs: view.getDashboardWidgetPrefs,
        getCachedRecommendationsCatalog: view.getCachedRecommendationsCatalog,
        refreshRecommendationsWhenCatalogReady: view.refreshRecommendationsWhenCatalogReady,
        getGlobalRecommendationCandidates: view.getGlobalRecommendationCandidates,
        getLensContentGrid, getLensWidgetChrome,
      });
    }
    return render(viewsComposition.lensPageHandlers);
  });
}

function withRecommendations<Result>(render: (actions: ReturnType<typeof createRecommendationActions>) => Result, modalAction: boolean) {
  if (viewsComposition.recommendationActions) return render(viewsComposition.recommendationActions);
  if (!productionDashboard) return render(getRecommendationActions());
  const owner = beginProductionRequest(state.currentView, modalAction, modalAction);
  return owner.shell!.prepare(owner.current).then(async view => {
    if (!view || !owner.current()) return false;
    const module = await loadDashboardRecommendations();
    if (!owner.current()) return false;
    viewsComposition.recommendationActions ||= (module.createRecommendationActions as RecommendationConstructorOperations)({
      getActiveData,
      buildDashboardWidgetContext: view.buildDashboardWidgetContext,
      getCachedRecommendationsCatalog: view.getCachedRecommendationsCatalog,
      getGlobalRecommendationCandidates: view.getGlobalRecommendationCandidates,
      setRecommendationState: (...args) => getDashboardView().setRecommendationState(...args),
    });
    return render(viewsComposition.recommendationActions);
  }).catch(error => {
    console.error('Failed to load Tips actions', error);
    if (owner.current()) showNotification('Tips could not be loaded. Please try again.', 'error');
    return false;
  }).finally(owner.release);
}

export function getDashboardView() {
  if (!viewsComposition.dashboardView) throw new Error('Dashboard view is not initialized; call configureDashboardViewFactory first');
  return viewsComposition.dashboardView as DashboardOperations;
}

function getLensPageHandlers() {
  if (!viewsComposition.lensPageHandlers) throw new Error('Lens page handlers are not initialized; call configureDashboardViewFactory first');
  return viewsComposition.lensPageHandlers;
}

function getRecommendationActions() {
  if (!viewsComposition.recommendationActions) throw new Error('Recommendation actions are not initialized; call configureDashboardViewFactory first');
  return viewsComposition.recommendationActions;
}

export function showDashboard(data?: unknown) {
  if (viewsComposition.dashboardView) return getDashboardView().showDashboard(data);
  if (!productionDashboard) return getDashboardView().showDashboard(data);
  const routeData = data || getActiveData();
  if (!dashboardRouteDataHasContent(routeData)) {
    productionRequest++;
    return productionDashboard.showEmptyDashboard(routeData);
  }
  return withProductionDashboard(state.currentView, 'Dashboard', () => getDashboardView().showDashboard(routeData));
}

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

function showLightRoute(data: unknown): unknown {
  if (productionDashboard && !viewsComposition.dashboardView) {
    return withProductionDashboard('light', 'Light & Sun', () => showLightRoute(data));
  }
  const ownsLight = captureProductionRoute('light');
  if (isLightSunUILoaded()) return getLoadedLightSunModule()?.showLight(data);

  const content = typeof document !== 'undefined' ? document.getElementById('main-content') : null;
  if (content) renderDeferredRouteStatus(content, 'Loading Light & Sun…', { busy: true });

  return loadLightSunUI()
    .then(module => {
      if (state.currentView !== 'light' || !ownsLight()) return false;
      module.showLight(data);
      return true;
    })
    .catch(err => {
      console.error('Failed to load Light & Sun modules', err);
      if (state.currentView === 'light' && content && ownsLight()) {
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

function showPreparedRoute<Args extends unknown[], Result>(route: string, label: string, isReady: () => unknown, prepare: () => Promise<unknown>, render: (...args: Args) => Result, args: Args = [] as unknown as Args, ownsView: () => boolean = captureProductionRoute(route)) {
  if (isReady()) return ownsView() ? render(...args) : false;
  const content = typeof document !== 'undefined' ? document.getElementById('main-content') : null;
  if (content) renderDeferredRouteStatus(content, `Loading ${label}…`, { busy: true });

  return prepare()
    .then(async () => {
      if (state.currentView !== route || !ownsView()) return false;
      if (await render(...args) === false || state.currentView !== route || !ownsView()) return false;
      // A prepared Dashboard renders its mobile shell after createNavigate's
      // initial nav sync. Reconcile again so the temporary lens tab bar is
      // removed instead of remaining beside the Dashboard-owned tab bar.
      syncMobileBottomNav(route);
      return true;
    })
    .catch(err => {
      console.error(`Failed to load ${label}`, err);
      if (state.currentView === route && content && ownsView()) {
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

function showDashboardRoute(data: unknown): unknown {
  const routeData = data || getActiveData();
  if (!dashboardRouteDataHasContent(routeData)) return showDashboard(routeData);
  if (productionDashboard && !viewsComposition.dashboardView) {
    return withProductionDashboard('dashboard', 'Dashboard', () => showDashboardRoute(routeData));
  }
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
    'Biometrics',
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
    nutrition: () => showPreparedRoute('nutrition', 'Nutrition', isNutritionFeatureReady, loadNutritionFeature, showNutritionLens),
    supplements: () => showPreparedRoute('supplements', 'Supplements & Medication', isSupplementsModuleLoaded, loadSupplementsModule, showSupplementsLens),
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

const navigationCompletion = createNavigationCompletionTracker();
export function navigate(category: Parameters<ReturnType<typeof createNavigate>>[0], data?: Parameters<ReturnType<typeof createNavigate>>[1]) {
  return productionDashboard && navigationCompletion.isActive()
    ? navigationCompletion.run(() => _navigate(category, data))
    : _navigate(category, data);
}

export function completeProductionStartupNavigation(navigation: unknown): unknown {
  return productionDashboard ? navigationCompletion.completeInitial(navigation) : navigation;
}

export function drainProductionStartupNavigation(): Promise<unknown> | undefined {
  return productionDashboard ? navigationCompletion.drain() : undefined;
}

configureOnboardingView({ navigate });
configureCategoryCustomization({ navigate, buildSidebar });

// ═══════════════════════════════════════════════
// DASHBOARD WIDGETS
// ═══════════════════════════════════════════════


export const toggleDashboardOrganizeMode = (...args: Parameters<DashboardOperations['toggleDashboardOrganizeMode']>) => productionDashboard && !viewsComposition.dashboardView
  ? withProductionDashboard(state.currentView, 'Dashboard controls', () => getDashboardView().toggleDashboardOrganizeMode(...args), true)
  : getDashboardView().toggleDashboardOrganizeMode(...args);
export const moveDashboardWidget = (...args: Parameters<DashboardOperations['moveDashboardWidget']>) => productionDashboard && !viewsComposition.dashboardView
  ? withProductionDashboard(state.currentView, 'Dashboard controls', () => getDashboardView().moveDashboardWidget(...args), true)
  : getDashboardView().moveDashboardWidget(...args);
export const hideDashboardWidget = (...args: Parameters<DashboardOperations['hideDashboardWidget']>) => productionDashboard && !viewsComposition.dashboardView
  ? withProductionDashboard(state.currentView, 'Dashboard controls', () => getDashboardView().hideDashboardWidget(...args), true)
  : getDashboardView().hideDashboardWidget(...args);
export const showDashboardWidget = (...args: Parameters<DashboardOperations['showDashboardWidget']>) => productionDashboard && !viewsComposition.dashboardView
  ? withProductionDashboard(state.currentView, 'Dashboard controls', () => getDashboardView().showDashboardWidget(...args), true)
  : getDashboardView().showDashboardWidget(...args);
export const addDashboardWidgetFromLens = (...args: Parameters<DashboardOperations['addDashboardWidgetFromLens']>) => productionDashboard && !viewsComposition.dashboardView
  ? withProductionDashboard(state.currentView, 'Dashboard controls', () => getDashboardView().addDashboardWidgetFromLens(...args), true)
  : getDashboardView().addDashboardWidgetFromLens(...args);
export const removeDashboardWidgetFromLens = (...args: Parameters<DashboardOperations['removeDashboardWidgetFromLens']>) => productionDashboard && !viewsComposition.dashboardView
  ? withProductionDashboard(state.currentView, 'Dashboard controls', () => getDashboardView().removeDashboardWidgetFromLens(...args), true)
  : getDashboardView().removeDashboardWidgetFromLens(...args);
export const addDashboardMarkerWidget = (...args: Parameters<DashboardOperations['addDashboardMarkerWidget']>) => productionDashboard && !viewsComposition.dashboardView
  ? withProductionDashboard(state.currentView, 'Dashboard controls', () => getDashboardView().addDashboardMarkerWidget(...args), true)
  : getDashboardView().addDashboardMarkerWidget(...args);
export const addDashboardBiometricMetric = (...args: Parameters<DashboardOperations['addDashboardBiometricMetric']>) => productionDashboard && !viewsComposition.dashboardView
  ? withProductionDashboard(state.currentView, 'Dashboard controls', () => getDashboardView().addDashboardBiometricMetric(...args), true)
  : getDashboardView().addDashboardBiometricMetric(...args);
export const addDashboardBiometricWidget = (...args: Parameters<DashboardOperations['addDashboardBiometricWidget']>) => productionDashboard && !viewsComposition.dashboardView
  ? withProductionDashboard(state.currentView, 'Dashboard controls', () => getDashboardView().addDashboardBiometricWidget(...args), true)
  : getDashboardView().addDashboardBiometricWidget(...args);
export const removeDashboardBiometricMetric = (...args: Parameters<DashboardOperations['removeDashboardBiometricMetric']>) => productionDashboard && !viewsComposition.dashboardView
  ? withProductionDashboard(state.currentView, 'Dashboard controls', () => getDashboardView().removeDashboardBiometricMetric(...args), true)
  : getDashboardView().removeDashboardBiometricMetric(...args);
export const filterDashboardMarkerWidgetPicker = (...args: Parameters<DashboardOperations['filterDashboardMarkerWidgetPicker']>) => getDashboardView().filterDashboardMarkerWidgetPicker(...args);
export const filterDashboardBiometricWidgetPicker = (...args: Parameters<DashboardOperations['filterDashboardBiometricWidgetPicker']>) => getDashboardView().filterDashboardBiometricWidgetPicker(...args);
export const resetDashboardWidgets = () => productionDashboard && !viewsComposition.dashboardView
  ? withProductionDashboard(state.currentView, 'Dashboard controls', () => getDashboardView().resetDashboardWidgets(), true)
  : getDashboardView().resetDashboardWidgets();
export const clearDashboardWidgets = () => productionDashboard && !viewsComposition.dashboardView
  ? withProductionDashboard(state.currentView, 'Dashboard controls', () => getDashboardView().clearDashboardWidgets(), true)
  : getDashboardView().clearDashboardWidgets();
export const openDashboardWidgetPicker = () => productionDashboard && !viewsComposition.dashboardView
  ? withProductionDashboard(state.currentView, 'Dashboard controls', () => getDashboardView().openDashboardWidgetPicker(), true)
  : getDashboardView().openDashboardWidgetPicker();
export const openDashboardBiometricPicker = () => productionDashboard && !viewsComposition.dashboardView
  ? withProductionDashboard(state.currentView, 'Dashboard controls', () => getDashboardView().openDashboardBiometricPicker(), true)
  : getDashboardView().openDashboardBiometricPicker();
export const closeDashboardWidgetPicker = () => productionDashboard && !viewsComposition.dashboardView ? undefined : getDashboardView().closeDashboardWidgetPicker();
export const startDashboardWidgetDrag = (...args: Parameters<DashboardOperations['startDashboardWidgetDrag']>) => getDashboardView().startDashboardWidgetDrag(...args);
export const allowDashboardWidgetDrop = (...args: Parameters<DashboardOperations['allowDashboardWidgetDrop']>) => getDashboardView().allowDashboardWidgetDrop(...args);
export const dropDashboardWidget = (...args: Parameters<DashboardOperations['dropDashboardWidget']>) => getDashboardView().dropDashboardWidget(...args);
export const toggleDashboardQuickMarkerPin = (...args: Parameters<DashboardOperations['toggleDashboardQuickMarkerPin']>) => productionDashboard
  ? productionDashboard.quickMarkers.toggleDashboardQuickMarkerPin(...args)
  : getDashboardView().toggleDashboardQuickMarkerPin(...args);

export function openRecommendationDetail(...args: Parameters<ReturnType<typeof createRecommendationActions>['openRecommendationDetail']>) { return withRecommendations(actions => actions.openRecommendationDetail(...args), true); }
export function discussRecommendation(...args: Parameters<ReturnType<typeof createRecommendationActions>['discussRecommendation']>) { return withRecommendations(actions => actions.discussRecommendation(...args), true); }
export function saveRecommendation(...args: Parameters<ReturnType<typeof createRecommendationActions>['saveRecommendation']>) { return withRecommendations(actions => actions.saveRecommendation(...args), false); }
export function dismissRecommendation(...args: Parameters<ReturnType<typeof createRecommendationActions>['dismissRecommendation']>) { return withRecommendations(actions => actions.dismissRecommendation(...args), false); }
