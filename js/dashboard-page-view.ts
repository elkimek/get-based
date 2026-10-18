import {getLoadedDesktopDashboardRenderer, loadDesktopDashboardRenderer} from './dashboard-renderer-loader.js';
import {beginDashboardRenderRequest, retireDashboardRenderRequests, showDashboardRendererLoading, showDashboardRendererFailure} from './dashboard-render-request.js';
import {disposeDashboardPage} from './dashboard-page-owner.js';
import type {DesktopDashboardPageView} from './desktop-dashboard-presentation.js';
// dashboard-page-view.js — dashboard route shell and empty-state orchestration

import { state } from './state.js';
import { formatDate } from './utils.js';
import { projectDashboardGreetingView, projectDashboardWelcomeView, renderDashboardWelcomeFragment } from './dashboard-welcome-presentation.js';
import { getActiveData, projectDateRangeFilter } from './data.js';
import { getProfiles, profileStorageKey } from './profile.js';
import { loadContextHealthDots } from './health-data-loader.js';
import { isAIPaused } from './api.js';
import { hasChatResponseBackend } from './chat-backend-selection.js';
import { loadCommitHash } from './commit-hash.js';
import {
  isMobileDashboardViewport,
  renderMobileDashboard,
  getMobileDashboardProfile,
  getMobileGreetingName,
  getMobileDashboardCounts,
} from './mobile-dashboard.js';
import { startEmptyTour as defaultStartEmptyTour, startTour as defaultStartTour } from './tour.js';
import { loadDemoData } from './export-loader.js';
import {
  getRecommendationModuleFunction,
  setRecommendationsCatalogCache,
} from './recommendations-runtime.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';

import type {DashboardPageData, DashboardPageContext, DashboardPageFactoryOperations, DashboardPageRuntimeInput, DashboardPageRuntimeSnapshot, DashboardPageDelegateRoot} from '../types/dashboard-page-view.js';

let _dashboardWelcomeActionsInstalled = false;

const dashboardPageRuntimeDeps: DashboardPageRuntimeSnapshot = {
  closeChatPanel: () => {},
  loadDemoData,
  openChatPanel: null,
};

export function configureDashboardPageRuntimeDeps(deps: unknown = {}) {
  const previous = { ...dashboardPageRuntimeDeps };
  if (typeof (deps as DashboardPageRuntimeInput).closeChatPanel === 'function') dashboardPageRuntimeDeps.closeChatPanel = (deps as DashboardPageRuntimeInput).closeChatPanel;
  if (typeof (deps as DashboardPageRuntimeInput).loadDemoData === 'function') dashboardPageRuntimeDeps.loadDemoData = (deps as DashboardPageRuntimeInput).loadDemoData;
  if (Object.prototype.hasOwnProperty.call(deps, 'openChatPanel')) {
    dashboardPageRuntimeDeps.openChatPanel = typeof (deps as DashboardPageRuntimeInput).openChatPanel === 'function'
      ? (deps as DashboardPageRuntimeInput).openChatPanel
      : null;
  }
  return previous;
}

const DASHBOARD_WELCOME_ACTION_ATTR = 'data-dashboard-welcome-action';
const DASHBOARD_WELCOME_ACTION_SELECTOR = `[${DASHBOARD_WELCOME_ACTION_ATTR}]`;

function dashboardPageRuntime() {
  return (globalThis as unknown as Record<string, unknown>);
}

function getDashboardPageRuntimeValue(name: string) {
  return dashboardPageRuntime()[name];
}

function closestDashboardWelcomeAction(target: unknown) {
  return (
    target && typeof (target as {closest?: unknown}).closest === 'function'
      ? ((target as {closest(selector: string): HTMLElement | null}).closest(DASHBOARD_WELCOME_ACTION_SELECTOR))
      : null
  );
}

function handleDashboardWelcomeActionClick(event: Event) {
  const actionEl = closestDashboardWelcomeAction(event.target);
  if (!actionEl) return;
  const action = actionEl.getAttribute(DASHBOARD_WELCOME_ACTION_ATTR);
  if (action === 'open-chat') {
    (dashboardPageRuntimeDeps.openChatPanel as (() => unknown) | null | undefined)?.();
  } else if (action === 'open-ai-settings') {
    (dashboardPageRuntimeDeps.closeChatPanel as () => unknown)();
    getSettingsModuleFunction('openSettingsModal')?.('ai');
  } else if (action === 'direct-import') {
    document.getElementById('pdf-input')?.click();
  } else if (action === 'load-demo') {
    void (dashboardPageRuntimeDeps.loadDemoData as (...args: Parameters<typeof loadDemoData>) => unknown)(actionEl.dataset.dashboardWelcomeDemo || 'female');
  } else {
    return;
  }
  event.preventDefault();
}

export function installDashboardWelcomeActionDelegates(root: DashboardPageDelegateRoot | null = typeof document !== 'undefined' ? document : null) {
  if (!root || _dashboardWelcomeActionsInstalled) return;
  _dashboardWelcomeActionsInstalled = true;
  root.addEventListener('click', handleDashboardWelcomeActionClick);
}

installDashboardWelcomeActionDelegates();

function getDashboardProfileName() {
  const profile = getMobileDashboardProfile();
  const name = getMobileGreetingName(profile);
  return name === 'there' ? 'Dashboard' : name;
}

function getDashboardPanelCount(data: DashboardPageData, markerHasData: (marker: unknown, index: number, markers: unknown[]) => unknown) {
  return Object.values(data.categories || {}).filter(cat => {
    if (cat.singlePoint && cat.singleDate) return true;
    return Object.values(cat.markers || {}).some(markerHasData);
  }).length;
}

function getDashboardMonthSpan(data: DashboardPageData) {
  const dates = (data.dates || []).filter(Boolean);
  if (dates.length < 2) return '';
  const first = new Date((dates[0] as string) + 'T00:00:00');
  const last = new Date((dates[dates.length - 1] as string) + 'T00:00:00');
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return '';
  const months = Math.max(1, Math.round((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24 * 30.4375)));
  return `${months} month${months === 1 ? '' : 's'}`;
}

export function createDashboardPageView(deps: unknown) {
  const {
    setupDropZone,
    markerHasData,
    buildDashboardWidgetContext,
    getDashboardWidgetPrefs,
    getVisibleDashboardWidgetViews,
    projectOnboardingBanner,
    projectAIConnectionReminder,
    projectDashboardControlButtons,
    projectDashboardWidget,
    isDashboardOrganizeMode,
    loadFocusCard,
    loadContextCardTips,
    ensureActiveDeviceTicker = () => {},
    resumeActiveTickerIfNeeded = () => {},
    startEmptyTour = defaultStartEmptyTour,
    startTour = defaultStartTour,
  } = deps as DashboardPageFactoryOperations;

  function projectDashboardGreeting(ctx: DashboardPageContext, title: unknown, visibleCount: number) {
    const counts = getMobileDashboardCounts(ctx.data);
    const panelCount = getDashboardPanelCount(ctx.data, markerHasData);
    const span = getDashboardMonthSpan(ctx.data);
    const parts = [
      `${counts.inRange} of ${counts.markerCount || 0} markers in range`,
      counts.latestDate ? `last draw ${(formatDate as (value: unknown, format: Parameters<typeof formatDate>[1]) => ReturnType<typeof formatDate>)(counts.latestDate, 'short')}` : '',
      `${panelCount} panel${panelCount === 1 ? '' : 's'}${span ? ` across ${span}` : ''}`,
      `${visibleCount} widget${visibleCount === 1 ? '' : 's'} active`,
    ].filter(Boolean);
    return projectDashboardGreetingView({ title: () => title, name: () => getDashboardProfileName(), parts: () => parts });
  }

  function projectDashboardPage(ctx: DashboardPageContext, title: unknown): DesktopDashboardPageView {
    const prefs = getDashboardWidgetPrefs();
    const visibleEntries = getVisibleDashboardWidgetViews(ctx, prefs);
    const greeting = projectDashboardGreeting(ctx, title, visibleEntries.length);
    const dateRange = ctx.data.dates.length > 0 ? projectDateRangeFilter({showScope: true}) : null;
    const onboarding = projectOnboardingBanner();
    const reminder = projectAIConnectionReminder();
    const stickyControls = projectDashboardControlButtons();
    const organizing = !!isDashboardOrganizeMode();
    const widgets = visibleEntries.map((entry, index) => projectDashboardWidget(entry, prefs, index, visibleEntries));
    const empty = visibleEntries.length === 0 ? {mode: 'empty' as const} : null;
    const footerControls = isDashboardOrganizeMode() ? projectDashboardControlButtons({includeReset: true}) : null;
    return {greeting, dateRange, onboarding, reminder, stickyControls, organizing, widgets, empty, footerControls};
  }

  function showDashboard(data?: unknown) {
    retireDashboardRenderRequests();
    const main = document.getElementById("main-content");
    if (!main) return;
    // Resume the live-session ticker if a session was started before this
    // page loaded — keeps the dashboard Light Today surface ticking after a
    // hard reload mid-session.
    try { resumeActiveTickerIfNeeded(); } catch (e) {}
    try { ensureActiveDeviceTicker(); } catch (e) {}
    if (!data) data = getActiveData();
    if (main.hasAttribute('aria-busy')) main.removeAttribute('aria-busy');
    const wasMobileDashboardActive = document.body.classList.contains('mobile-dashboard-active');
    document.body.classList.remove('mobile-dashboard-active');
    const wearableMetrics = state.importedData?.wearableSummary?.metrics || {};
    const hasWearableData = Object.values(wearableMetrics).some(metric => (metric as {latest?: unknown} | null | undefined)?.latest != null);
    const hasData = (data as DashboardPageData).dates.length > 0 || hasWearableData || Number(state.nutritionSummary?.totalMeals || 0) > 0 || Object.values((data as DashboardPageData).categories).some(c => c.singlePoint && c.singleDate);

    // Clear any onboarding focus mode once the user has data — the
    // welcome-hero / context-details targets no longer exist in the
    // data view, so the dimmed-peer rules would be no-ops anyway,
    // but stripping the classes keeps body state clean.
    if (hasData) document.body.classList.remove('cards-focus', 'import-focus', 'chat-autostart-reserved', 'empty-dashboard-active');

    // ── Demo-load in flight: short-lived placeholder while
    //    importDataJSON parses the demo blob (typically 2–3s). Without
    //    this the empty Welcome hero flashes for the duration. The flag
    //    is set in loadDemoData() and cleared on import success/failure.
    if (!hasData && getDashboardPageRuntimeValue('_demoLoadingProfileId') === state.currentProfile) {
      document.body.classList.add('empty-dashboard-active');
      main.setAttribute('aria-busy', 'true');
      const html = renderDashboardWelcomeFragment({ mode: 'loading' });
      disposeDashboardPage();
      main.innerHTML = html;
      return;
    }

    // ── Empty state: chat-first welcome hero ──
    if (!hasData) {
      document.body.classList.add('empty-dashboard-active');
      document.body.classList.remove('chat-autostart-reserved');
      const aiReady = hasChatResponseBackend();
      const aiPaused = isAIPaused();
      const aiConnectionReminder = projectAIConnectionReminder();
      const html = renderDashboardWelcomeFragment(projectDashboardWelcomeView({ready: aiReady, paused: aiPaused, reminder: aiConnectionReminder}));
      const startupWelcome = main.querySelector('[data-prerendered-welcome]');
      const canHydrateStartupWelcome = startupWelcome
        && !aiReady
        && !aiPaused
        && !aiConnectionReminder;
      // Preserve the already-painted DOM in the default state so the welcome
      // copy remains the page's early LCP candidate. Delegated actions are
      // live after startup without changing the rendered subtree.
      if (!canHydrateStartupWelcome) {
        disposeDashboardPage();
        main.innerHTML = html;
      }
      setupDropZone();
      // First visit starts the empty-state tour from the welcome screen.
      // Delay one tick so header/profile controls are rendered before targets
      // are filtered. If the user already completed it, fall through to chat onboarding.
      const shouldAutoStartEmptyTour = !localStorage.getItem(profileStorageKey(state.currentProfile, 'emptyTour'));
      if (shouldAutoStartEmptyTour) setTimeout(() => startEmptyTour(true), 100);
      // Returning desktop visitors get the guided chat setup beside the
      // welcome hero. Mobile keeps the welcome/import controls unobscured.
      const isDesktopChatOnboardingViewport = (getDashboardPageRuntimeValue('innerWidth') as number) > 768;
      if (!shouldAutoStartEmptyTour && state.chatHistory.length === 0) {
        if (isDesktopChatOnboardingViewport && !document.getElementById('chat-panel')?.classList.contains('open')) {
          document.body.classList.add('chat-autostart-reserved');
        }
        setTimeout(() => {
          if (!isDesktopChatOnboardingViewport || (getDashboardPageRuntimeValue('innerWidth') as number) <= 768) return;
          // Rendering real data or an explicit chat close removes this
          // reservation. Treat that as cancellation so a stale onboarding
          // timer cannot reopen chat after the user has dismissed it.
          if (!document.body.classList.contains('chat-autostart-reserved')) return;
          const panel = document.getElementById('chat-panel');
          if (state.chatHistory.length > 0 || panel?.classList.contains('open')) {
            document.body.classList.remove('chat-autostart-reserved');
            return;
          }
          if (dashboardPageRuntimeDeps.openChatPanel) (dashboardPageRuntimeDeps.openChatPanel as () => unknown)();
          else document.body.classList.remove('chat-autostart-reserved');
        }, 800);
      }
      return;
    }

    if (isMobileDashboardViewport()) {
      return (renderMobileDashboard as (data: unknown, options: Parameters<typeof renderMobileDashboard>[1]) => ReturnType<typeof renderMobileDashboard>)(data, { resetScroll: !wasMobileDashboardActive });
    }

    const request = beginDashboardRenderRequest(main, isMobileDashboardViewport);
    const render = ({renderDesktopDashboardPage, hydrateDesktopDashboardPage}: NonNullable<ReturnType<typeof getLoadedDesktopDashboardRenderer>>) => {
      // ── Has data: full dashboard, rendered through modular widgets ──
      const dashboardCtx = buildDashboardWidgetContext(data) as DashboardPageContext;
      const dashboardTitle = 'Dashboard Overview';
      const view = projectDashboardPage(dashboardCtx, dashboardTitle);
      const html = renderDesktopDashboardPage(view);
      if (!request.isCurrent()) return false;
      disposeDashboardPage();
      main.innerHTML = html;
      hydrateDesktopDashboardPage(main, view);
      if (!request.isCurrent()) return false;

      setupDropZone();
      if (!request.isCurrent()) return false;
      void import('./dashboard-widget-packing.js')
        .then(module => { if (request.isCurrent()) module.setupDashboardWidgetPacking(main); })
        .catch(() => { /* Keep the standard grid if optional packing cannot load. */ });

      // Non-blocking: hydrate cached focus text for LCP, but don't replace stale
      // cached text with a fresh AI response during startup.
      if (hasData) loadFocusCard({ refreshStale: false });
      if (!request.isCurrent()) return false;
      loadContextHealthDots();
      loadContextCardTips();
      if (!request.isCurrent()) return false;
      loadCommitHash();
      if (!request.isCurrent()) return false;
      // Preload catalog so rec sections and sorting use it immediately
      const catalogPromise = (getRecommendationModuleFunction('loadCatalog') as (() => unknown) | null | undefined)?.();
      if (catalogPromise && typeof (catalogPromise as {then?: unknown}).then === 'function') {
        (catalogPromise as {then(callback: typeof setRecommendationsCatalogCache): unknown}).then(catalog => request.isCurrent() ? setRecommendationsCatalogCache(catalog) : null);
      }

      // Auto-trigger guided tour on first populated dashboard visit as a fallback
      // for users who imported before seeing the empty-state tour.
      const _p = getProfiles().find(p => p.id === state.currentProfile);
      const _hasProfile = _p?.name && _p.name !== 'Default' && state.profileSex;
      if (_hasProfile && hasData && request.mayRunFocusEffects()) {
        startTour(true);
      }
      return;
    };
    const loaded = getLoadedDesktopDashboardRenderer();
    if (loaded) return render(loaded);
    showDashboardRendererLoading(main);
    return loadDesktopDashboardRenderer().then(renderer => {
      if (!request.isCurrent()) return false;
      return render(renderer);
    }).catch(error => {
      console.error('Failed to load Desktop Dashboard renderer', error);
      if (request.isCurrent()) showDashboardRendererFailure(main, () => request.isCurrent() ? showDashboard(data) : false);
      return false;
    });
  }

  return {
    showDashboard,
  };
}
