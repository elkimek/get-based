// dashboard-page-view.js — dashboard route shell and empty-state orchestration

import { state } from './state.js';
import { escapeHTML, formatDate } from './utils.js';
import { getActiveData } from './data.js';
import { profileStorageKey } from './profile.js';
import { loadContextHealthDots } from './context-cards.js';
import { hasAIProvider, isAIPaused } from './api.js';
import { loadCommitHash } from './commit-hash.js';
import {
  isMobileDashboardViewport,
  renderMobileDashboard,
  getMobileDashboardProfile,
  getMobileGreetingName,
  getMobileDashboardCounts,
} from './mobile-dashboard.js';

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
  const months = Math.max(1, Math.round((last - first) / (1000 * 60 * 60 * 24 * 30.4375)));
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
    // Resume the live-session ticker if a session was started before this
    // page loaded — keeps the dashboard Light Today surface ticking after a
    // hard reload mid-session.
    if (window._resumeActiveTickerIfNeeded) try { window._resumeActiveTickerIfNeeded(); } catch (e) {}
    if (window.ensureActiveDeviceTicker) try { window.ensureActiveDeviceTicker(); } catch (e) {}
    if (!data) data = getActiveData();
    const main = document.getElementById("main-content");
    const wasMobileDashboardActive = document.body.classList.contains('mobile-dashboard-active');
    document.body.classList.remove('mobile-dashboard-active');
    const wearableMetrics = state.importedData?.wearableSummary?.metrics || {};
    const hasWearableData = Object.values(wearableMetrics).some(metric => metric?.latest != null);
    const hasData = data.dates.length > 0 || hasWearableData || Object.values(data.categories).some(c => c.singlePoint && c.singleDate);

    // Clear any onboarding focus mode once the user has data — the
    // welcome-hero / context-details targets no longer exist in the
    // data view, so the dimmed-peer rules would be no-ops anyway,
    // but stripping the classes keeps body state clean.
    if (hasData) document.body.classList.remove('cards-focus', 'import-focus', 'chat-autostart-reserved', 'empty-dashboard-active');

    // ── Demo-load in flight: short-lived placeholder while
    //    importDataJSON parses the demo blob (typically 2–3s). Without
    //    this the empty Welcome hero flashes for the duration. The flag
    //    is set in loadDemoData() and cleared on import success/failure.
    if (!hasData && window._demoLoadingProfileId === state.currentProfile) {
      document.body.classList.add('empty-dashboard-active');
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
      const chatAction = "window.openChatPanel && window.openChatPanel()";
      const primaryTitle = aiPaused ? 'Resume guided chat' : 'Start with guided chat';
      const primaryCopy = aiPaused
        ? 'Chat will walk you through re-enabling AI before you add files, connect sources, or ask for recommendations.'
        : (aiReady
          ? 'Chat will ask for context only when it helps, then route you to labs, DNA, wearables, light, or first-test planning.'
          : 'Chat starts with the basics, then guides AI setup only when it is needed for import or recommendations.');
      const secondaryAction = aiPaused
        ? `<button type="button" class="welcome-action-btn" onclick="closeChatPanel();window.openSettingsModal('ai')">Re-enable AI</button>`
        : (importReady
          ? `<button type="button" class="welcome-action-btn welcome-direct-import-btn" onclick="document.getElementById('pdf-input')?.click()">Import directly</button>`
          : '');
      const primaryPanel = `<div class="welcome-primary-panel welcome-chat-panel">
          <span class="welcome-primary-kicker">Start here</span>
          <strong>${escapeHTML(primaryTitle)}</strong>
          <p>${escapeHTML(primaryCopy)}</p>
          <div class="welcome-primary-actions">
            <button type="button" class="welcome-action-btn welcome-action-primary" onclick="${chatAction}">Start guided chat</button>
            ${secondaryAction}
          </div>
        </div>
        <div class="drop-zone drop-zone-hidden" id="drop-zone"></div>`;
      const html = `${renderAIConnectionReminder()}<div class="${escapeHTML(heroClass)}">
        <h2>Welcome to getbased</h2>
        <p class="welcome-hero-subtitle">Health intelligence that's actually yours — five lenses on your biology, one private dashboard.</p>
        ${primaryPanel}
        <div class="welcome-demo-section">
          <span class="welcome-section-label">Preview with demo data</span>
          <div class="demo-cards">
            <button class="demo-card" onclick="loadDemoData('female')">
              <span class="demo-card-avatar">\uD83D\uDC69</span>
              <span class="demo-card-name">Sarah, 34</span>
              <span class="demo-card-desc">Iron + Oura: overtraining clues</span>
            </button>
            <button class="demo-card" onclick="loadDemoData('male')">
              <span class="demo-card-avatar">\uD83D\uDC68</span>
              <span class="demo-card-name">Alex, 38</span>
              <span class="demo-card-desc">Metabolic + Withings body comp</span>
            </button>
          </div>
        </div>
      </div>`;
      main.innerHTML = html;
      setupDropZone();
      // First visit starts the empty-state tour from the welcome screen.
      // Delay one tick so header/profile controls are rendered before targets
      // are filtered. If the user already completed it, fall through to chat onboarding.
      const shouldAutoStartEmptyTour = !!window.startEmptyTour && !localStorage.getItem(profileStorageKey(state.currentProfile, 'emptyTour'));
      if (shouldAutoStartEmptyTour) setTimeout(() => window.startEmptyTour?.(true), 100);
      // Returning desktop visitors get the guided chat setup beside the
      // welcome hero. Mobile keeps the welcome/import controls unobscured.
      const isDesktopChatOnboardingViewport = typeof window !== 'undefined' && window.innerWidth > 768;
      if (!shouldAutoStartEmptyTour && state.chatHistory.length === 0) {
        if (isDesktopChatOnboardingViewport && !document.getElementById('chat-panel')?.classList.contains('open')) {
          document.body.classList.add('chat-autostart-reserved');
        }
        setTimeout(() => {
          if (!isDesktopChatOnboardingViewport || window.innerWidth <= 768) return;
          const panel = document.getElementById('chat-panel');
          if (state.chatHistory.length > 0 || panel?.classList.contains('open')) {
            document.body.classList.remove('chat-autostart-reserved');
            return;
          }
          if (window.openChatPanel) window.openChatPanel();
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
    if (window.loadContextCardTips) window.loadContextCardTips();
    loadCommitHash();
    // Preload catalog so rec sections and sorting use it immediately
    if (window.loadCatalog) window.loadCatalog().then(c => { window._cachedCatalog = c; });

    // Auto-trigger guided tour on first populated dashboard visit as a fallback
    // for users who imported before seeing the empty-state tour.
    const _p = window.getProfiles?.()?.find(p => p.id === state.currentProfile);
    const _hasProfile = _p?.name && _p.name !== 'Default' && state.profileSex;
    if (_hasProfile && hasData) {
      if (window.startTour) window.startTour(true);
    }
  }

  return {
    showDashboard,
  };
}
