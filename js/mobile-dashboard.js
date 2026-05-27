// mobile-dashboard.js - Mobile dashboard shell and bottom navigation

import { state } from './state.js';
import { escapeHTML, escapeAttr, getStatus, formatValue, getTrend, formatDate, safeMarkerId } from './utils.js';
import { getActiveData, getEffectiveRangeForDate, getLatestValueIndex, getAllFlaggedMarkers } from './data.js';
import { getProfiles } from './profile.js';
import { canonicalMetric, metricsForSources } from './wearable-adapters.js';
import { loadContextHealthDots } from './context-cards.js';

const MOBILE_DASHBOARD_QUERY = '(max-width: 799px)';
const MOBILE_WEARABLE_PRIORITY = [
  'hrv_rmssd',
  'sleep_score',
  'readiness_score',
  'steps',
  'rhr',
  'weight',
  'body_fat_pct',
  'bp_systolic',
];

let _mobileDashboardManualTabLockUntil = 0;
let _mobileChromeStateObserver = null;

const mobileDashboardDeps = {
  buildDashboardWidgetContext: () => ({ data: getActiveData(), filteredData: getActiveData() }),
  getDashboardWidgetPrefs: () => ({}),
  getVisibleDashboardWidgetEntries: () => [],
  renderDashboardControlButtons: () => '',
  isDashboardOrganizeMode: () => false,
  renderDashboardWidget: () => '',
  setupDropZone: () => {},
  loadCommitHash: () => {},
};

export function configureMobileDashboardView(deps = {}) {
  Object.assign(mobileDashboardDeps, deps);
}

function markerHasData(m) {
  return m.values?.some(v => v !== null) ?? false;
}

export function isMobileDashboardViewport() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(MOBILE_DASHBOARD_QUERY).matches;
}

function getMobileVisualBottomOffset() {
  if (typeof window === 'undefined' || !window.visualViewport) return 0;
  const layoutHeight = window.innerHeight || document.documentElement?.clientHeight || window.visualViewport.height;
  const visualBottom = window.visualViewport.offsetTop + window.visualViewport.height;
  return Math.max(0, Math.ceil(layoutHeight - visualBottom));
}

function syncMobileChromeRootState() {
  if (typeof document === 'undefined' || !document.body) return;
  const root = document.documentElement;
  const dashboardActive = document.body.classList.contains('mobile-dashboard-active');
  const tabsActive = document.body.classList.contains('mobile-tabs-active');
  root.classList.toggle('mobile-dashboard-active', dashboardActive);
  root.classList.toggle('mobile-tabs-active', tabsActive);
  if (dashboardActive || tabsActive) {
    root.style.setProperty('--mobile-visual-bottom-offset', `${getMobileVisualBottomOffset()}px`);
  } else {
    root.style.removeProperty('--mobile-visual-bottom-offset');
  }
}

function initMobileChromeStateSync() {
  if (typeof document === 'undefined' || _mobileChromeStateObserver) return;
  const start = () => {
    if (!document.body || _mobileChromeStateObserver) return;
    if (typeof MutationObserver === 'function') {
      _mobileChromeStateObserver = new MutationObserver(syncMobileChromeRootState);
      _mobileChromeStateObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }
    syncMobileChromeRootState();
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
  window.addEventListener('resize', syncMobileChromeRootState, { passive: true });
  window.visualViewport?.addEventListener('resize', syncMobileChromeRootState, { passive: true });
  window.visualViewport?.addEventListener('scroll', syncMobileChromeRootState, { passive: true });
}

function getMobileBottomTabForRoute(route) {
  if (['dashboard', 'labs', 'body', 'light', 'insight'].includes(route)) return route;
  if (route === 'recommendations') return 'insight';
  if (route === 'compare' || route === 'correlations') return 'labs';
  if (route && getActiveData().categories?.[route]) return 'labs';
  return 'dashboard';
}

export function syncMobileBottomNav(route = state.currentView || 'dashboard') {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('mobile-bottom-tabs');
  const hasDashboardShell = document.body.classList.contains('mobile-dashboard-active');
  const shouldRender = isMobileDashboardViewport() && !hasDashboardShell;
  document.body.classList.toggle('mobile-tabs-active', shouldRender);
  syncMobileChromeRootState();
  if (!shouldRender) {
    existing?.remove();
    return;
  }
  const activeTab = getMobileBottomTabForRoute(route);
  const html = renderMobileBottomTabs(activeTab, { id: 'mobile-bottom-tabs' });
  if (existing) {
    existing.outerHTML = html;
  } else {
    document.body.insertAdjacentHTML('beforeend', html);
  }
}

export function refreshMobileDashboardActiveTab() {
  if (!document.body.classList.contains('mobile-dashboard-active')) return;
  _mobileDashboardManualTabLockUntil = 0;
  mobileDashboardSetTab('dashboard', { fromScroll: true });
}

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  initMobileChromeStateSync();
  const mobileDashboardMedia = window.matchMedia(MOBILE_DASHBOARD_QUERY);
  const refreshDashboardForBreakpoint = () => {
    if (state.currentView === 'dashboard') window.navigate?.('dashboard');
    else syncMobileBottomNav(state.currentView || 'dashboard');
  };
  if (typeof mobileDashboardMedia.addEventListener === 'function') {
    mobileDashboardMedia.addEventListener('change', refreshDashboardForBreakpoint);
  } else if (typeof mobileDashboardMedia.addListener === 'function') {
    mobileDashboardMedia.addListener(refreshDashboardForBreakpoint);
  }
}

export function getMobileDashboardProfile() {
  const profiles = getProfiles() || [];
  return profiles.find(p => p.id === state.currentProfile) || profiles[0] || { id: 'default', name: 'Default' };
}

export function getMobileGreetingName(profile) {
  const name = (profile?.name || 'there').trim();
  if (!name || name === 'Default') return 'there';
  return name.split(/\s+/)[0];
}

export function getMobileDashboardCounts(data) {
  let markerCount = 0;
  let inRange = 0;
  let flagged = 0;
  for (const cat of Object.values(data.categories || {})) {
    for (const marker of Object.values(cat.markers || {})) {
      if (!markerHasData(marker)) continue;
      markerCount++;
      const idx = getLatestValueIndex(marker.values || []);
      if (idx < 0) continue;
      const value = marker.values[idx];
      const range = getEffectiveRangeForDate(marker, idx);
      const status = getStatus(value, range.min, range.max);
      if (status === 'normal') inRange++;
      else if (status === 'high' || status === 'low') flagged++;
    }
  }
  const latestDate = data.dates?.[data.dates.length - 1] || '';
  return { markerCount, inRange, flagged, latestDate };
}

function mobileStatusLabel(status) {
  if (status === 'normal') return 'In range';
  if (status === 'high') return 'High';
  if (status === 'low') return 'Low';
  return 'No value';
}

function mobileStatusTone(status) {
  if (status === 'normal') return 'good';
  if (status === 'high' || status === 'low') return 'alert';
  return 'muted';
}

function getMobileMarkerSummary(data, catKey, markerKey) {
  const id = `${catKey}_${markerKey}`;
  if (!safeMarkerId(id)) return null;
  const category = data.categories?.[catKey];
  const marker = category?.markers?.[markerKey];
  if (!marker || !markerHasData(marker)) return null;
  const latestIdx = getLatestValueIndex(marker.values || []);
  if (latestIdx < 0) return null;
  const value = marker.values[latestIdx];
  const range = getEffectiveRangeForDate(marker, latestIdx);
  const status = getStatus(value, range.min, range.max);
  const trend = getTrend(marker.values || [], range.min, range.max);
  const labelSource = marker.singlePoint ? [marker.singleDateLabel || 'Latest'] : (data.dateLabels || data.dates || []);
  state.markerRegistry[id] = marker;
  return {
    id,
    name: marker.name || markerKey,
    category: category.label || catKey,
    value: formatValue(value),
    unit: marker.unit || '',
    date: labelSource[latestIdx] || 'Latest',
    status,
    statusLabel: mobileStatusLabel(status),
    tone: mobileStatusTone(status),
    trend,
    values: marker.values || [],
  };
}

export function getMobileDashboardMarkers(ctx) {
  const seen = new Set();
  const summaries = [];
  const add = (catKey, markerKey, sourceData = ctx.filteredData) => {
    const id = `${catKey}_${markerKey}`;
    if (seen.has(id)) return;
    const summary = getMobileMarkerSummary(sourceData, catKey, markerKey)
      || getMobileMarkerSummary(ctx.data, catKey, markerKey);
    if (!summary) return;
    seen.add(id);
    summaries.push(summary);
  };

  for (const km of ctx.keyMarkers || []) add(km.cat, km.key);
  for (const alert of ctx.trendAlerts || []) {
    const idx = alert.id.indexOf('_');
    if (idx > 0) add(alert.id.slice(0, idx), alert.id.slice(idx + 1));
  }
  for (const flag of getAllFlaggedMarkers(ctx.data).slice(0, 12)) {
    add(flag.categoryKey, flag.markerKey, ctx.data);
  }
  for (const [catKey, category] of Object.entries(ctx.filteredData.categories || {})) {
    for (const markerKey of Object.keys(category.markers || {})) add(catKey, markerKey);
    if (summaries.length >= 10) break;
  }
  return summaries.slice(0, 10);
}

export function getMobileDashboardInsights(ctx, markers) {
  const insights = [];
  for (const flag of ctx.criticalFlags.slice(0, 2)) {
    const summary = markers.find(m => m.id === flag.id);
    insights.push({
      id: flag.id,
      tone: 'danger',
      eyebrow: flag.status === 'high' ? 'Critical high' : 'Critical low',
      title: flag.name,
      body: `${formatValue(flag.rawValue)} ${flag.unit || ''} is outside the active range.`,
      meta: summary?.trend?.arrow || summary?.date || '',
    });
  }
  for (const alert of ctx.trendAlerts.slice(0, 3)) {
    if (insights.length >= 3) break;
    insights.push({
      id: alert.id,
      tone: alert.concern.startsWith('past_') || alert.concern.startsWith('sudden_') ? 'warn' : 'info',
      eyebrow: 'Trend',
      title: alert.name,
      body: alert.concern.replace(/_/g, ' '),
      meta: (alert.spark || []).join(' -> '),
    });
  }
  if (insights.length === 0) {
    insights.push({
      tone: 'good',
      eyebrow: 'Snapshot',
      title: 'No urgent trend alerts',
      body: 'Latest high-priority markers are not showing sudden range breaks.',
      meta: `${markers.length} markers in the mobile watch list`,
    });
  }
  return insights.slice(0, 3);
}

export function getMobileWearablePriority() {
  return MOBILE_WEARABLE_PRIORITY;
}

export function formatMobileWearableValue(metricId, metric, summary) {
  if (metricId === 'bp_systolic' && summary?.metrics?.bp_diastolic?.latest != null) {
    return `${formatValue(metric.latest)}/${formatValue(summary.metrics.bp_diastolic.latest)}`;
  }
  const value = Number(metric?.latest);
  if (!Number.isFinite(value)) return '—';
  if (metricId === 'steps' && Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  }
  return formatValue(value);
}

export function formatMobileWearableDelta(metricId, metric, canon) {
  const latest = Number(metric?.latest);
  const baseline = Number(metric?.baseline);
  if (!Number.isFinite(latest) || !Number.isFinite(baseline) || baseline === 0) return '';
  if (metricId === 'steps') return '';
  if (canon?.sub === 'Δ') {
    const diff = latest - baseline;
    const arrow = diff > 0.005 ? '↑' : diff < -0.005 ? '↓' : '→';
    return `${arrow} ${Math.abs(diff).toFixed(2)}${canon.unit || ''}`;
  }
  const pct = ((latest - baseline) / baseline) * 100;
  if (Math.abs(pct) < 0.5) return '→ baseline';
  const arrow = pct > 0 ? '↑' : '↓';
  return `${arrow} ${Math.abs(pct).toFixed(0)}%`;
}

export function getMobileWearableTiles() {
  const summary = state.importedData?.wearableSummary;
  if (!summary?.metrics || Object.keys(summary.metrics).length === 0) return [];
  const sourceIds = Object.keys(summary.sources || {});
  const registryOrder = metricsForSources(sourceIds.length ? sourceIds : Object.keys(summary.metrics || {}));
  const ordered = [
    ...MOBILE_WEARABLE_PRIORITY,
    ...registryOrder,
    ...Object.keys(summary.metrics || {}),
  ];
  const seen = new Set();
  const tiles = [];
  for (const metricId of ordered) {
    if (seen.has(metricId)) continue;
    seen.add(metricId);
    if (metricId === 'bp_diastolic' && summary.metrics.bp_systolic) continue;
    const metric = summary.metrics[metricId];
    const canon = canonicalMetric(metricId);
    if (!metric || !canon || metric.latest == null) continue;
    tiles.push({
      id: metricId,
      label: canon.label,
      value: formatMobileWearableValue(metricId, metric, summary),
      unit: metricId === 'bp_systolic' ? 'mmHg' : (canon.unit || canon.sub || ''),
      change: formatMobileWearableDelta(metricId, metric, canon),
    });
    if (tiles.length >= 4) break;
  }
  return tiles;
}

function renderMobileSectionHead(title, count, actionLabel = '', action = '') {
  return `<div class="m-section-head">
    <div class="m-section-labels">
      <span class="m-section-title">${escapeHTML(title)}</span>
      ${count ? `<span class="m-section-count">${escapeHTML(count)}</span>` : ''}
    </div>
    ${actionLabel && action ? `<button type="button" onclick="${escapeAttr(action)}">${escapeHTML(actionLabel)}</button>` : ''}
  </div>`;
}

function renderMobileIcon(name) {
  const icons = {
    labs: '<rect x="4" y="4" width="6" height="6" rx="1.2"></rect><rect x="14" y="4" width="6" height="6" rx="1.2"></rect><rect x="4" y="14" width="6" height="6" rx="1.2"></rect><rect x="14" y="14" width="6" height="6" rx="1.2"></rect>',
    genome: '<path d="M8 4c4 4 4 12 8 16"></path><path d="M16 4c-4 4-4 12-8 16"></path><path d="M9.5 8h5"></path><path d="M9.5 12h5"></path><path d="M9.5 16h5"></path>',
    body: '<path d="M4 12h4l2-6 4 12 2-6h4"></path>',
    light: '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v3"></path><path d="M12 19v3"></path><path d="M4.93 4.93l2.12 2.12"></path><path d="M16.95 16.95l2.12 2.12"></path><path d="M2 12h3"></path><path d="M19 12h3"></path><path d="M4.93 19.07l2.12-2.12"></path><path d="M16.95 7.05l2.12-2.12"></path>',
    insight: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path><path d="M8 9h8"></path><path d="M8 13h5"></path>',
    more: '<path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h16"></path>',
    tweaks: '<line x1="4" y1="21" x2="4" y2="14"></line><line x1="4" y1="10" x2="4" y2="3"></line><line x1="12" y1="21" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="3"></line><line x1="20" y1="21" x2="20" y2="16"></line><line x1="20" y1="12" x2="20" y2="3"></line><line x1="1" y1="14" x2="7" y2="14"></line><line x1="9" y1="8" x2="15" y2="8"></line><line x1="17" y1="16" x2="23" y2="16"></line>',
    settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>',
    search: '<circle cx="11" cy="11" r="6"></circle><path d="m16 16 4 4"></path>',
    chat: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path>',
  };
  return `<svg class="m-svg-icon" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.labs}</svg>`;
}

export function mobileDashboardSetTab(tab, { fromScroll = false } = {}) {
  if (!fromScroll) _mobileDashboardManualTabLockUntil = Date.now() + 600;
  document.querySelectorAll('.m-tab').forEach(btn => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
}

function renderMobileBottomTabs(activeTab = 'dashboard', { id = '' } = {}) {
  const navId = id ? ` id="${id}"` : '';
  const tabAttrs = tab => `class="m-tab${activeTab === tab ? ' active' : ''}" data-tab="${tab}" aria-current="${activeTab === tab ? 'page' : 'false'}"`;
  return `<nav${navId} class="m-tabbar" aria-label="Mobile primary navigation">
    <button type="button" ${tabAttrs('dashboard')} onclick="window.mobileDashboardSetTab('dashboard');window.navigate('dashboard')" aria-label="Dashboard"><span class="m-tab-icon">${renderMobileIcon('labs')}</span><small>Home</small></button>
    <button type="button" ${tabAttrs('labs')} onclick="window.mobileDashboardSetTab('labs');window.navigate('labs')" aria-label="Labs"><span class="m-tab-icon">${renderMobileIcon('labs')}</span><small>Labs</small></button>
    <button type="button" ${tabAttrs('body')} onclick="window.mobileDashboardSetTab('body');window.navigate('body')" aria-label="Body"><span class="m-tab-icon">${renderMobileIcon('body')}</span><small>Body</small></button>
    <button type="button" ${tabAttrs('light')} onclick="window.mobileDashboardSetTab('light');window.navigate('light')" aria-label="Light"><span class="m-tab-icon">${renderMobileIcon('light')}</span><small>Light</small></button>
    <button type="button" ${tabAttrs('insight')} onclick="window.mobileDashboardSetTab('insight');window.navigate('insight')" aria-label="Insight"><span class="m-tab-icon">${renderMobileIcon('insight')}</span><small>Insight</small></button>
  </nav>`;
}

function renderMobileDashboardWidgetStack(ctx) {
  const prefs = mobileDashboardDeps.getDashboardWidgetPrefs();
  const visibleEntries = mobileDashboardDeps.getVisibleDashboardWidgetEntries(ctx, prefs);
  return `<section class="m-section m-dashboard-widget-section">
    ${renderMobileSectionHead('Dashboard widgets', String(visibleEntries.length))}
    <div class="m-dashboard-widget-actions">${mobileDashboardDeps.renderDashboardControlButtons({ includeReset: mobileDashboardDeps.isDashboardOrganizeMode() })}</div>
    <div class="dashboard-widgets m-dashboard-widgets">
      ${visibleEntries.length
        ? visibleEntries.map((entry, index) => mobileDashboardDeps.renderDashboardWidget(entry, prefs, index, visibleEntries)).join('')
        : '<div class="dashboard-widget dashboard-widget-full is-empty"><div class="dashboard-widget-empty">No widgets are visible.</div></div>'}
    </div>
  </section>`;
}

export function openMobileDashboardSearch() {
  if (window.toggleMobileSidebar) window.toggleMobileSidebar();
  setTimeout(() => document.getElementById('sidebar-search')?.focus(), 80);
}

export function mobileDashboardJump(section) {
  const route = ['dashboard', 'labs', 'genome', 'body', 'light', 'insight', 'recommendations'].includes(section) ? section : 'dashboard';
  mobileDashboardSetTab(route === 'genome' || route === 'recommendations' ? 'dashboard' : route);
  window.navigate?.(route);
}

export function renderMobileDashboard(data, { resetScroll = false } = {}) {
  const main = document.getElementById("main-content");
  if (!main) return;
  const ctx = mobileDashboardDeps.buildDashboardWidgetContext(data);
  const profile = getMobileDashboardProfile();
  const mobileWidgetStack = renderMobileDashboardWidgetStack(ctx);
  const firstName = getMobileGreetingName(profile);
  const counts = getMobileDashboardCounts(data);
  const greetingSub = [
    `${counts.markerCount || 0} markers`,
    counts.latestDate ? `last draw ${formatDate(counts.latestDate, 'short')}` : '',
    `${data.dates?.length || 0} draw${data.dates?.length === 1 ? '' : 's'}`,
  ].filter(Boolean).join(' · ');

  document.body.classList.add('mobile-dashboard-active');
  syncMobileChromeRootState();
  main.innerHTML = `<div class="drop-zone drop-zone-hidden" id="drop-zone"></div>
    <div class="m-shell">
      <div class="m-bg" aria-hidden="true"></div>
      <div class="m-content">
        <section class="m-greeting">
          <h1>Hey ${escapeHTML(firstName)}.</h1>
          <div class="m-greeting-sub">${escapeHTML(greetingSub)}</div>
        </section>

        ${mobileWidgetStack}
      </div>
    </div>
    <button type="button" class="m-chat-fab" onclick="window.openChatPanel && window.openChatPanel()" aria-label="Ask AI">${renderMobileIcon('chat')}</button>
    ${renderMobileBottomTabs('dashboard')}`;

  if (resetScroll && typeof window.scrollTo === 'function') {
    window.scrollTo(0, 0);
  }
  mobileDashboardDeps.setupDropZone();
  refreshMobileDashboardActiveTab();
  loadContextHealthDots();
  if (window.loadContextCardTips) window.loadContextCardTips();
  mobileDashboardDeps.loadCommitHash();
  if (window.loadCatalog) window.loadCatalog().then(c => { window._cachedCatalog = c; });
}

Object.assign(window, {
  openMobileDashboardSearch,
  mobileDashboardJump,
  mobileDashboardSetTab,
  refreshMobileDashboardActiveTab,
});
