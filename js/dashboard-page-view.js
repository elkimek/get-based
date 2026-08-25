// @ts-check
// dashboard-page-view.js — dashboard route shell and empty-state orchestration

import { state } from './state.js';
import { escapeAttr, escapeHTML, formatDate } from './utils.js';
import { getActiveData } from './data.js';
import { getProfiles, profileStorageKey } from './profile.js';
import { loadContextHealthDots } from './health-data-loader.js';
import { hasAIProvider, isAIPaused } from './api.js';
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

let _dashboardWelcomeActionsInstalled = false;

const dashboardPageRuntimeDeps = {
  closeChatPanel: () => {},
  loadDemoData,
  openChatPanel: /** @type {null | (() => unknown)} */ (null),
};

export function configureDashboardPageRuntimeDeps(deps = {}) {
  const previous = { ...dashboardPageRuntimeDeps };
  if (typeof deps.closeChatPanel === 'function') dashboardPageRuntimeDeps.closeChatPanel = deps.closeChatPanel;
  if (typeof deps.loadDemoData === 'function') dashboardPageRuntimeDeps.loadDemoData = deps.loadDemoData;
  if (Object.prototype.hasOwnProperty.call(deps, 'openChatPanel')) {
    dashboardPageRuntimeDeps.openChatPanel = typeof deps.openChatPanel === 'function'
      ? deps.openChatPanel
      : null;
  }
  return previous;
}

const DASHBOARD_WELCOME_ACTION_ATTR = 'data-dashboard-welcome-action';
const DASHBOARD_WELCOME_ACTION_SELECTOR = `[${DASHBOARD_WELCOME_ACTION_ATTR}]`;

function dashboardPageRuntime() {
  return /** @type {any} */ (globalThis);
}

function getDashboardPageRuntimeValue(name) {
  return dashboardPageRuntime()[name];
}

function dashboardWelcomeActionAttrs(action, attrs = {}) {
  let html = `${DASHBOARD_WELCOME_ACTION_ATTR}="${escapeAttr(action)}"`;
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    const attr = key.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
    html += ` data-dashboard-welcome-${attr}="${escapeAttr(String(value))}"`;
  }
  return html;
}

function closestDashboardWelcomeAction(target) {
  return /** @type {HTMLElement | null} */ (
    target && typeof target.closest === 'function'
      ? target.closest(DASHBOARD_WELCOME_ACTION_SELECTOR)
      : null
  );
}

function handleDashboardWelcomeActionClick(event) {
  const actionEl = closestDashboardWelcomeAction(event.target);
  if (!actionEl) return;
  const action = actionEl.getAttribute(DASHBOARD_WELCOME_ACTION_ATTR);
  if (action === 'open-chat') {
    dashboardPageRuntimeDeps.openChatPanel?.();
  } else if (action === 'open-ai-settings') {
    dashboardPageRuntimeDeps.closeChatPanel();
    getSettingsModuleFunction('openSettingsModal')?.('ai');
  } else if (action === 'direct-import') {
    document.getElementById('pdf-input')?.click();
  } else if (action === 'load-demo') {
    void dashboardPageRuntimeDeps.loadDemoData(actionEl.dataset.dashboardWelcomeDemo || 'female');
  } else {
    return;
  }
  event.preventDefault();
}

export function installDashboardWelcomeActionDelegates(root = typeof document !== 'undefined' ? document : null) {
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

function getDashboardPanelCount(data, markerHasData) {
  return Object.values(data.categories || {}).filter(cat => {
    if (cat.singlePoint && cat.singleDate) return true;
    return Object.values(cat.markers || {}).some(markerHasData);
  }).length;
}

function getDashboardMonthSpan(data) {
  const dates = (data.dates || []).filter(Boolean);
  if (dates.length < 2) return '';
  const first = new Date(dates[0] + 'T00:00:00');
  const last = new Date(dates[dates.length - 1] + 'T00:00:00');
  if (Number.isNaN(first.getTime()) || Number.isNaN(last.getTime())) return '';
  const months = Math.max(1, Math.round((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24 * 30.4375)));
  return `${months} month${months === 1 ? '' : 's'}`;
}

export function createDashboardPageView(deps) {
  const {
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
    isDashboardOrganizeMode,
    loadFocusCard,
    loadContextCardTips,
    ensureActiveDeviceTicker = () => {},
    resumeActiveTickerIfNeeded = () => {},
    startEmptyTour = defaultStartEmptyTour,
    startTour = defaultStartTour,
  } = deps;

  function renderDashboardGreeting(ctx, title, visibleCount) {
    const counts = getMobileDashboardCounts(ctx.data);
    const panelCount = getDashboardPanelCount(ctx.data, markerHasData);
    const span = getDashboardMonthSpan(ctx.data);
    const parts = [
      `${counts.inRange} of ${counts.markerCount || 0} markers in range`,
      counts.latestDate ? `last draw ${formatDate(counts.latestDate, 'short')}` : '',
      `${panelCount} panel${panelCount === 1 ? '' : 's'}${span ? ` across ${span}` : ''}`,
      `${visibleCount} widget${visibleCount === 1 ? '' : 's'} active`,
    ].filter(Boolean);
    return `<div class="category-header dashboard-greeting">
      <div>
        <div class="dashboard-greeting-kicker">${escapeHTML(title)}</div>
        <h1>Hey ${escapeHTML(getDashboardProfileName())}.</h1>
        <div class="dashboard-greeting-sub">${parts.map(escapeHTML).join(' · ')}</div>
      </div>
    </div>`;
  }

  function renderDashboardWidgets(ctx, title) {
    const prefs = getDashboardWidgetPrefs();
    const visibleEntries = getVisibleDashboardWidgetEntries(ctx, prefs);
    let html = renderDashboardGreeting(ctx, title, visibleEntries.length);
    html += `<div class="drop-zone drop-zone-hidden" id="drop-zone"></div>`;
    html += renderOnboardingBanner();
    html += renderAIConnectionReminder();
    html += renderDashboardStickyControls();
    html += `<div class="dashboard-widgets${isDashboardOrganizeMode() ? ' is-organizing' : ''}">`;
    visibleEntries.forEach((entry, index) => { html += renderDashboardWidget(entry, prefs, index, visibleEntries); });
    if (visibleEntries.length === 0) {
      html += `<div class="dashboard-widget dashboard-widget-full is-empty">
        <div class="dashboard-widget-empty">No widgets are visible.</div>
      </div>`;
    }
    html += `</div>`;
    if (isDashboardOrganizeMode()) {
      html += `<div class="dashboard-organize-footer">
        ${renderDashboardControlButtons({ includeReset: true })}
      </div>`;
    }
    return html;
  }

  function showDashboard(data) {
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
    const hasWearableData = Object.values(wearableMetrics).some(metric => metric?.latest != null);
    const hasData = data.dates.length > 0 || hasWearableData || Number(state.nutritionSummary?.totalMeals || 0) > 0 || Object.values(data.categories).some(c => c.singlePoint && c.singleDate);

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
      main.innerHTML = `<div class="welcome-hero" aria-busy="true" role="status" aria-live="polite">
        <h2>Loading demo data…</h2>
        <p class="welcome-hero-subtitle">Setting up the demo profile — this takes a few seconds the first time.</p>
      </div>`;
      return;
    }

    // ── Empty state: chat-first welcome hero ──
    if (!hasData) {
      document.body.classList.add('empty-dashboard-active');
      document.body.classList.remove('chat-autostart-reserved');
      const aiReady = hasAIProvider();
      const aiPaused = isAIPaused();
      const importReady = aiReady && !aiPaused;
      const heroClass = importReady ? 'welcome-hero welcome-hero-ready' : 'welcome-hero welcome-hero-noai';
      const aiConnectionReminder = renderAIConnectionReminder();
      const primaryTitle = aiPaused ? 'Resume guided chat' : 'Start with guided chat';
      const primaryCopy = aiPaused
        ? 'Chat will walk you through re-enabling AI before you add files, connect sources, or ask for recommendations.'
        : (aiReady
          ? 'Chat will ask for context only when it helps, then route you to labs, DNA, wearables, light, or first-test planning.'
          : 'Chat starts with the basics, then guides AI setup only when it is needed for import or recommendations.');
      const secondaryAction = aiPaused
        ? `<button type="button" class="welcome-action-btn" ${dashboardWelcomeActionAttrs('open-ai-settings')}>Re-enable AI</button>
           <button type="button" class="welcome-action-btn welcome-direct-import-btn" ${dashboardWelcomeActionAttrs('direct-import')}>Import file</button>`
        : `<button type="button" class="welcome-action-btn welcome-direct-import-btn" ${dashboardWelcomeActionAttrs('direct-import')}>Import file</button>`;
      const primaryPanel = `<div class="welcome-primary-panel welcome-chat-panel">
          <span class="welcome-primary-kicker">Start here</span>
          <strong>${escapeHTML(primaryTitle)}</strong>
          <p>${escapeHTML(primaryCopy)}</p>
          <div class="welcome-primary-actions">
            <button type="button" class="welcome-action-btn welcome-action-primary" ${dashboardWelcomeActionAttrs('open-chat')}>Start guided chat</button>
            ${secondaryAction}
          </div>
        </div>
        <div class="drop-zone drop-zone-hidden" id="drop-zone"></div>`;
      const html = `${aiConnectionReminder}<div class="${escapeHTML(heroClass)}">
        <h2>Welcome to getbased</h2>
        <p class="welcome-hero-subtitle">Health intelligence that's actually yours — five lenses on your biology, one private dashboard.</p>
        ${primaryPanel}
        <div class="welcome-demo-section">
          <span class="welcome-section-label">Preview with demo data</span>
          <div class="demo-cards">
            <button type="button" class="demo-card" ${dashboardWelcomeActionAttrs('load-demo', { demo: 'female' })}>
              <span class="demo-card-avatar">\uD83D\uDC69</span>
              <span class="demo-card-name">Sarah, 34</span>
              <span class="demo-card-desc">Iron + Oura: overtraining clues</span>
            </button>
            <button type="button" class="demo-card" ${dashboardWelcomeActionAttrs('load-demo', { demo: 'male' })}>
              <span class="demo-card-avatar">\uD83D\uDC68</span>
              <span class="demo-card-name">Alex, 38</span>
              <span class="demo-card-desc">Metabolic + Withings body comp</span>
            </button>
          </div>
        </div>
      </div>`;
      const startupWelcome = main.querySelector('[data-prerendered-welcome]');
      const canHydrateStartupWelcome = startupWelcome
        && !aiReady
        && !aiPaused
        && !aiConnectionReminder;
      // Preserve the already-painted DOM in the default state so the welcome
      // copy remains the page's early LCP candidate. Delegated actions are
      // live after startup without changing the rendered subtree.
      if (!canHydrateStartupWelcome) {
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
      const isDesktopChatOnboardingViewport = getDashboardPageRuntimeValue('innerWidth') > 768;
      if (!shouldAutoStartEmptyTour && state.chatHistory.length === 0) {
        if (isDesktopChatOnboardingViewport && !document.getElementById('chat-panel')?.classList.contains('open')) {
          document.body.classList.add('chat-autostart-reserved');
        }
        setTimeout(() => {
          if (!isDesktopChatOnboardingViewport || getDashboardPageRuntimeValue('innerWidth') <= 768) return;
          // Rendering real data or an explicit chat close removes this
          // reservation. Treat that as cancellation so a stale onboarding
          // timer cannot reopen chat after the user has dismissed it.
          if (!document.body.classList.contains('chat-autostart-reserved')) return;
          const panel = document.getElementById('chat-panel');
          if (state.chatHistory.length > 0 || panel?.classList.contains('open')) {
            document.body.classList.remove('chat-autostart-reserved');
            return;
          }
          if (dashboardPageRuntimeDeps.openChatPanel) dashboardPageRuntimeDeps.openChatPanel();
          else document.body.classList.remove('chat-autostart-reserved');
        }, 800);
      }
      return;
    }

    if (isMobileDashboardViewport()) {
      renderMobileDashboard(data, { resetScroll: !wasMobileDashboardActive });
      return;
    }

    // ── Has data: full dashboard, rendered through modular widgets ──
    const dashboardCtx = buildDashboardWidgetContext(data);
    const dashboardTitle = 'Dashboard Overview';
    const html = renderDashboardWidgets(dashboardCtx, dashboardTitle);

    main.innerHTML = html;

    setupDropZone();

    // Non-blocking: hydrate cached focus text for LCP, but don't replace stale
    // cached text with a fresh AI response during startup.
    if (hasData) loadFocusCard({ refreshStale: false });
    loadContextHealthDots();
    loadContextCardTips();
    loadCommitHash();
    // Preload catalog so rec sections and sorting use it immediately
    const catalogPromise = getRecommendationModuleFunction('loadCatalog')?.();
    if (catalogPromise && typeof catalogPromise.then === 'function') {
      catalogPromise.then(setRecommendationsCatalogCache);
    }

    // Auto-trigger guided tour on first populated dashboard visit as a fallback
    // for users who imported before seeing the empty-state tour.
    const _p = getProfiles().find(p => p.id === state.currentProfile);
    const _hasProfile = _p?.name && _p.name !== 'Default' && state.profileSex;
    if (_hasProfile && hasData) {
      startTour(true);
    }
  }

  return {
    showDashboard,
  };
}
