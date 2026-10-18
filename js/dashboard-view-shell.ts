import type {createDashboardViewComposition} from './dashboard-view-composition.js';
import {createOwnedCompositionGate, loadDashboardComposition} from './dashboard-composition-loader.js';
import {createDashboardQuickMarkerCore} from './dashboard-quick-marker-core.js';
import {createDashboardPageView} from './dashboard-page-view.js';
import {configureMarkerDetailRuntime} from './marker-detail-runtime.js';
import {configureMarkerDetailModal} from './marker-detail-modal.js';
import {configureLensPageShell} from './lens-page-shell-core.js';
import {configureMobileDashboardView} from './mobile-dashboard.js';
import {setupDropZone} from './import-drop-zone.js';
import {openChatPanel} from './chat-loader.js';
import {loadCommitHash} from './commit-hash.js';
import {loadCatalog, loadContextCardTips} from './health-data-loader.js';
import {setRecommendationsCatalogCache} from './recommendations-runtime.js';
import {toggleMobileSidebar} from './nav.js';
import {navigateViewportRuntime} from './views-router-runtime.js';
import {ensureLoadedActiveDeviceTicker, resumeLoadedActiveSunTickerIfNeeded} from './light-sun-loader.js';
import {state} from './state.js';

type Factory = typeof createDashboardViewComposition;
type View = ReturnType<Factory>;

/** A real empty-state page with stable ports to the one resident body owner. */
export function createProductionDashboardShell(deps: Parameters<Factory>[0], publish: (view: View) => void) {
  const {
    navigate, showRecommendations, showEmojiPicker, renderFocusCard, loadFocusCard,
    projectOnboardingBanner, projectAIConnectionReminder,
  } = deps;
  const captured = {navigate, showRecommendations, showEmojiPicker, renderFocusCard, loadFocusCard,
    projectOnboardingBanner, projectAIConnectionReminder};
  const quickMarkers = createDashboardQuickMarkerCore(() => {
    if (state.currentView === 'dashboard') navigateViewportRuntime('dashboard');
  });
  const gate = createOwnedCompositionGate(loadDashboardComposition,
    module => module.createDashboardViewComposition(captured, {quickMarkers, deferRuntimeWiring: true}), publish);
  const resident = (): View => {
    const view = gate.getResident();
    if (!view) throw new Error('Dashboard body must be prepared before invoking a body port');
    return view;
  };
  const buildDashboardWidgetContext = (...args: Parameters<View['buildDashboardWidgetContext']>) => resident().buildDashboardWidgetContext(...args);
  const getDashboardWidgetPrefs = () => resident().getDashboardWidgetPrefs();
  const getVisibleDashboardWidgetViews = (...args: Parameters<View['getVisibleDashboardWidgetViews']>) => resident().getVisibleDashboardWidgetViews(...args);
  const projectDashboardControlButtons = (...args: Parameters<View['projectDashboardControlButtons']>) => resident().projectDashboardControlButtons(...args);
  const projectDashboardWidget = (...args: Parameters<View['projectDashboardWidget']>) => resident().projectDashboardWidget(...args);
  const isDashboardOrganizeMode = () => resident().isDashboardOrganizeMode();

  configureMarkerDetailRuntime({isDashboardQuickMarkerPinned: quickMarkers.isDashboardQuickMarkerPinned,
    navigate, showEmojiPicker, toggleDashboardQuickMarkerPin: quickMarkers.toggleDashboardQuickMarkerPin});
  configureMarkerDetailModal({navigate, isDashboardQuickMarkerPinned: quickMarkers.isDashboardQuickMarkerPinned,
    toggleDashboardQuickMarkerPin: quickMarkers.toggleDashboardQuickMarkerPin, showEmojiPicker});
  (configureLensPageShell as (deps: unknown) => ReturnType<typeof configureLensPageShell>)({
    addDashboardWidgetFromLens: (...args: Parameters<View['addDashboardWidgetFromLens']>) => resident().addDashboardWidgetFromLens(...args),
    getAvailableDashboardFixedWidgetIds: () => resident().getAvailableDashboardFixedWidgetIds(),
    getDashboardWidgetPrefs,
    openChatPanel,
    openDashboardBiometricPicker: () => resident().openDashboardBiometricPicker(),
    removeDashboardWidgetFromLens: (...args: Parameters<View['removeDashboardWidgetFromLens']>) => resident().removeDashboardWidgetFromLens(...args),
  });
  configureMobileDashboardView({buildDashboardWidgetContext, getDashboardWidgetPrefs, getVisibleDashboardWidgetViews,
    projectDashboardControlButtons, isDashboardOrganizeMode, projectDashboardWidget, setupDropZone, loadCommitHash,
    navigate, toggleMobileSidebar, loadContextCardTips, loadCatalog, cacheCatalog: setRecommendationsCatalogCache});
  const emptyPage = createDashboardPageView({
    setupDropZone,
    markerHasData: (marker: unknown) => (marker as {values?: {some(callback: (value: unknown) => boolean): unknown} | null}).values?.some(value => value !== null) ?? false,
    buildDashboardWidgetContext, getDashboardWidgetPrefs, getVisibleDashboardWidgetViews,
    projectOnboardingBanner, projectAIConnectionReminder, projectDashboardControlButtons, projectDashboardWidget,
    isDashboardOrganizeMode, loadFocusCard, loadContextCardTips,
    ensureActiveDeviceTicker: ensureLoadedActiveDeviceTicker,
    resumeActiveTickerIfNeeded: resumeLoadedActiveSunTickerIfNeeded,
  });
  return {...gate, showEmptyDashboard: emptyPage.showDashboard, quickMarkers};
}
