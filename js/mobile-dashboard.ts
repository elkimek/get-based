import {disposeDashboardPage} from './dashboard-page-owner.js';
import {getLoadedMobileDashboardRenderer, loadMobileDashboardRenderer} from './dashboard-renderer-loader.js';
import {beginDashboardRenderRequest, showDashboardRendererLoading, showDashboardRendererFailure} from './dashboard-render-request.js';
import type {MobileDashboardStackView} from './mobile-dashboard-presentation.js';
import {renderMobileNavigation} from './mobile-navigation-presentation.js';
import type { MobileDataReader, MobileMarkerReader, MobileContextReader, MobileSummary, MobileInsight, MobileCallbacks, MobileMetricReader, MobileWearableReader, MobileCanonReader } from '../types/mobile-dashboard.js';
// mobile-dashboard.js - Mobile dashboard shell and bottom navigation

import { state } from './state.js';
import { getStatus, formatValue, getTrend, formatDate, safeMarkerId } from './utils.js';
import { getActiveData, projectDateRangeFilter } from './data.js';
import { getAllFlaggedMarkers, getEffectiveRangeForDate, getLatestValueIndex } from './marker-analysis.js';
import { getProfiles } from './profile.js';
import { canonicalMetric, metricsForSources } from './wearable-adapters.js';
import {
  formatWearableMetricValue,
  wearableDisplayUnit,
} from './wearables-formatters.js';
import { loadContextHealthDots } from './health-data-loader.js';
import {
  addMobileDashboardBreakpointListener,
  addMobileDashboardVisualViewportListener,
  addMobileDashboardWindowListener,
  getMobileDashboardVisualBottomOffset,
  isMobileDashboardRuntimeViewport,
  scrollMobileDashboardToTop,
} from './mobile-dashboard-runtime.js';

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

let _mobileChromeStateObserver: MutationObserver | null = null;
let _mobileDashboardActionsInstalled = false;
let _mobileNavigationScrollLeft = 0;

const MOBILE_DASHBOARD_ACTION_ATTR = 'data-mobile-dashboard-action';
const MOBILE_DASHBOARD_ACTION_SELECTOR = `[${MOBILE_DASHBOARD_ACTION_ATTR}]`;

const mobileDashboardDeps: MobileCallbacks = {
  buildDashboardWidgetContext: (_data) => ({ data: getActiveData(), filteredData: getActiveData() }),
  getDashboardWidgetPrefs: () => ({ order: [], hidden: [] }),
  getVisibleDashboardWidgetViews: (_ctx, _prefs) => [],
  projectDashboardControlButtons: (_options) => null,
  isDashboardOrganizeMode: () => false,
  projectDashboardWidget: (_entry, _prefs, _index, _visibleEntries) => null,
  setupDropZone: () => {},
  loadCommitHash: () => {},
  navigate: () => {},
  toggleMobileSidebar: () => {},
  loadContextCardTips: () => {},
  loadCatalog: async () => null,
  cacheCatalog: () => {},
};

export function configureMobileDashboardView(deps: unknown = {}) {
  Object.assign(mobileDashboardDeps, deps);
}

function markerHasData(m: MobileMarkerReader) {
  return (m.values as {some(callback:(value:unknown)=>boolean):unknown}|null|undefined)?.some(v => v !== null) ?? false;
}

function closestMobileDashboardAction(target: {closest?:unknown}|null|undefined) {
  return (
    target && typeof target.closest === 'function'
      ? (target.closest as (selector:string)=>HTMLElement|null)(MOBILE_DASHBOARD_ACTION_SELECTOR)
      : null
  );
}

function handleMobileDashboardActionClick(event: Event) {
  const actionEl = closestMobileDashboardAction(event.target as {closest?:unknown}|null);
  if (!actionEl) return;
  const action = actionEl.getAttribute(MOBILE_DASHBOARD_ACTION_ATTR);
  if (action === 'navigate-tab') {
    const navigation = actionEl.closest<HTMLElement>('.m-tabbar');
    if (navigation) _mobileNavigationScrollLeft = navigation.scrollLeft;
    const tab = actionEl.dataset.mobileDashboardTab || 'dashboard';
    const route = actionEl.dataset.mobileDashboardRoute || tab;
    mobileDashboardSetTab(tab);
    mobileDashboardDeps.navigate(route);
  } else if (action === 'open-search') {
    openMobileDashboardSearch();
  } else {
    return;
  }
  event.preventDefault();
}

export function installMobileDashboardActionDelegates(root: {addEventListener(type:string,callback:(event:Event)=>void):unknown}|null = typeof document !== 'undefined' ? document : null) {
  if (!root || _mobileDashboardActionsInstalled) return;
  _mobileDashboardActionsInstalled = true;
  root.addEventListener('click', handleMobileDashboardActionClick);
}

installMobileDashboardActionDelegates();

export function isMobileDashboardViewport() {
  return isMobileDashboardRuntimeViewport(MOBILE_DASHBOARD_QUERY);
}

function syncMobileChromeRootState() {
  if (typeof document === 'undefined' || !document.body) return;
  const root = document.documentElement;
  const dashboardActive = document.body.classList.contains('mobile-dashboard-active');
  const tabsActive = document.body.classList.contains('mobile-tabs-active');
  root.classList.toggle('mobile-dashboard-active', dashboardActive);
  root.classList.toggle('mobile-tabs-active', tabsActive);
  const rootStyle = root.style;
  if (dashboardActive || tabsActive) {
    if (typeof rootStyle?.setProperty === 'function') {
      rootStyle.setProperty('--mobile-visual-bottom-offset', `${getMobileDashboardVisualBottomOffset()}px`);
    }
  } else if (typeof rootStyle?.removeProperty === 'function') {
    rootStyle.removeProperty('--mobile-visual-bottom-offset');
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
    document.addEventListener('scroll', event => {
      if (event.target instanceof HTMLElement && event.target.classList.contains('m-tabbar')) {
        _mobileNavigationScrollLeft = event.target.scrollLeft;
      }
    }, {capture: true, passive: true});
  };
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
  addMobileDashboardWindowListener('resize', syncMobileChromeRootState, { passive: true });
  addMobileDashboardVisualViewportListener('resize', syncMobileChromeRootState, { passive: true });
  addMobileDashboardVisualViewportListener('scroll', syncMobileChromeRootState, { passive: true });
}

function getMobileBottomTabForRoute(route: string) {
  if (['dashboard', 'labs', 'body', 'nutrition', 'supplements', 'light', 'insight'].includes(route)) return route;
  if (route === 'recommendations') return 'insight';
  if (route === 'compare' || route === 'correlations') return 'labs';
  if (route && getActiveData().categories?.[route]) return 'labs';
  return 'dashboard';
}

export function syncMobileBottomNav(route: string = state.currentView || 'dashboard') {
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
    _mobileNavigationScrollLeft = existing.scrollLeft;
    existing.outerHTML = html;
  } else {
    document.body.insertAdjacentHTML('beforeend', html);
  }
  mobileDashboardSetTab(activeTab);
}

export function refreshMobileDashboardActiveTab() {
  if (!document.body.classList.contains('mobile-dashboard-active')) return;
  mobileDashboardSetTab('dashboard');
}

const refreshDashboardForBreakpoint = () => {
  if (state.currentView === 'dashboard') mobileDashboardDeps.navigate('dashboard');
  else syncMobileBottomNav(state.currentView || 'dashboard');
};
addMobileDashboardBreakpointListener(MOBILE_DASHBOARD_QUERY, refreshDashboardForBreakpoint);
initMobileChromeStateSync();

export function getMobileDashboardProfile() {
  const profiles = getProfiles() || [];
  return profiles.find(p => p.id === state.currentProfile) || profiles[0] || { id: 'default', name: 'Default' };
}

export function getMobileGreetingName(profile: {name?:unknown}|null|undefined) {
  const name = ((profile?.name || 'there') as {trim():{split(pattern:RegExp):{[index:number]:unknown}}|string}).trim();
  if (!name || name === 'Default') return 'there';
  return name.split(/\s+/)[0];
}

export function getMobileDashboardCounts(data: MobileDataReader) {
  let markerCount = 0;
  let inRange = 0;
  let flagged = 0;
  for (const cat of Object.values(data.categories || {})) {
    for (const marker of Object.values(cat.markers || {})) {
      if (!markerHasData(marker)) continue;
      markerCount++;
      const idx = (getLatestValueIndex as (values:unknown)=>number)(marker.values || []);
      if (idx < 0) continue;
      const value = (marker.values as unknown[])[idx];
      const range = (getEffectiveRangeForDate as (marker:unknown,index:number)=>{min:unknown;max:unknown})(marker, idx);
      const status = (getStatus as (value:unknown,min:unknown,max:unknown)=>ReturnType<typeof getStatus>)(value, range.min, range.max);
      if (status === 'normal') inRange++;
      else if (status === 'high' || status === 'low') flagged++;
    }
  }
  const latestDate = data.dates?.[(data.dates.length as number) - 1] || '';
  return { markerCount, inRange, flagged, latestDate };
}

function mobileStatusLabel(status: unknown) {
  if (status === 'normal') return 'In range';
  if (status === 'high') return 'High';
  if (status === 'low') return 'Low';
  return 'No value';
}

function mobileStatusTone(status: unknown) {
  if (status === 'normal') return 'good';
  if (status === 'high' || status === 'low') return 'alert';
  return 'muted';
}

function getMobileMarkerSummary(data: MobileDataReader, catKey: unknown, markerKey: unknown): MobileSummary | null {
  const id = `${catKey}_${markerKey}`;
  if (!safeMarkerId(id)) return null;
  const category = data.categories?.[catKey as string];
  const marker = category?.markers?.[markerKey as string];
  if (!marker || !markerHasData(marker)) return null;
  const latestIdx = (getLatestValueIndex as (values:unknown)=>number)(marker.values || []);
  if (latestIdx < 0) return null;
  const value = (marker.values as unknown[])[latestIdx];
  const range = (getEffectiveRangeForDate as (marker:unknown,index:number)=>{min:unknown;max:unknown})(marker, latestIdx);
  const status = (getStatus as (value:unknown,min:unknown,max:unknown)=>ReturnType<typeof getStatus>)(value, range.min, range.max);
  const trend = (getTrend as (values:unknown,min:unknown,max:unknown)=>ReturnType<typeof getTrend>)(marker.values || [], range.min, range.max);
  const labelSource: {[index:number]:unknown} = marker.singlePoint ? [marker.singleDateLabel || 'Latest'] : (data.dateLabels || data.dates || []);
  (state.markerRegistry as Record<string,unknown>)[id] = marker;
  return {
    id,
    name: marker.name || markerKey,
    category: category.label || catKey,
    value: (formatValue as (value:unknown)=>unknown)(value),
    unit: marker.unit || '',
    date: labelSource[latestIdx] || 'Latest',
    status,
    statusLabel: mobileStatusLabel(status),
    tone: mobileStatusTone(status),
    trend,
    values: marker.values || [],
  };
}

export function getMobileDashboardMarkers(ctx: MobileContextReader) {
  const seen = new Set();
  const summaries: MobileSummary[] = [];
  const add = (catKey: unknown, markerKey: unknown, sourceData = ctx.filteredData) => {
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
    const idx = (alert.id as {indexOf(value:string):number}).indexOf('_');
    if (idx > 0) add((alert.id as {slice(start:number,end?:number):unknown}).slice(0, idx), (alert.id as {slice(start:number,end?:number):unknown}).slice(idx + 1));
  }
  for (const flag of (getAllFlaggedMarkers as unknown as (data:MobileDataReader)=>{categoryKey:string;markerKey:string}[])(ctx.data).slice(0, 12)) {
    add(flag.categoryKey, flag.markerKey, ctx.data);
  }
  for (const [catKey, category] of Object.entries(ctx.filteredData.categories || {})) {
    for (const markerKey of Object.keys(category.markers || {})) add(catKey, markerKey);
    if (summaries.length >= 10) break;
  }
  return summaries.slice(0, 10);
}

export function getMobileDashboardInsights(ctx: MobileContextReader, markers: MobileSummary[]) {
  const insights: MobileInsight[] = [];
  for (const flag of ctx.criticalFlags.slice(0, 2)) {
    const summary = markers.find(m => m.id === flag.id);
    insights.push({
      id: flag.id,
      tone: 'danger',
      eyebrow: flag.status === 'high' ? 'Critical high' : 'Critical low',
      title: flag.name,
      body: `${(formatValue as (value:unknown)=>unknown)(flag.rawValue)} ${flag.unit || ''} is outside the active range.`,
      meta: summary?.trend?.arrow || summary?.date || '',
    });
  }
  for (const alert of ctx.trendAlerts.slice(0, 3)) {
    if (insights.length >= 3) break;
    insights.push({
      id: alert.id,
      tone: (alert.concern as {startsWith(value:string):unknown}).startsWith('past_') || (alert.concern as {startsWith(value:string):unknown}).startsWith('sudden_') ? 'warn' : 'info',
      eyebrow: 'Trend',
      title: alert.name,
      body: (alert.concern as {replace(pattern:RegExp,value:string):unknown}).replace(/_/g, ' '),
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

export function formatMobileWearableValue(metricId: string, metric: MobileMetricReader | null | undefined, summary?: MobileWearableReader | null) {
  if (metricId === 'bp_systolic' && summary?.metrics?.bp_diastolic?.latest != null) {
    return `${(formatValue as (value:unknown)=>unknown)(metric!.latest)}/${(formatValue as (value:unknown)=>unknown)(summary.metrics.bp_diastolic.latest)}`;
  }
  const value = Number(metric?.latest);
  if (!Number.isFinite(value)) return '—';
  if (metricId === 'steps' && Math.abs(value) >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  }
  if (metricId === 'weight') {
    const canonicalUnit = canonicalMetric(metricId)?.unit || '';
    return formatWearableMetricValue(metricId, value, canonicalUnit, state.unitSystem);
  }
  return formatValue(value);
}

export function formatMobileWearableDelta(metricId: string, metric: MobileMetricReader | null | undefined, canon?: MobileCanonReader | null) {
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
  const summary = state.importedData?.wearableSummary as MobileWearableReader | null | undefined;
  if (!summary?.metrics || Object.keys(summary.metrics).length === 0) return [];
  const sourceIds = Object.keys(summary.sources || {});
  const registryOrder = metricsForSources(sourceIds.length ? sourceIds : Object.keys(summary.metrics || {}));
  const ordered = [
    ...MOBILE_WEARABLE_PRIORITY,
    ...registryOrder,
    ...Object.keys(summary.metrics || {}),
  ];
  const seen = new Set();
  const tiles: Array<{id:string;label:string;value:string;unit:string;change:string}> = [];
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
      unit: metricId === 'bp_systolic'
        ? 'mmHg'
        : (wearableDisplayUnit(metricId, canon.unit || '', state.unitSystem) || canon.sub || ''),
      change: formatMobileWearableDelta(metricId, metric, canon),
    });
    if (tiles.length >= 4) break;
  }
  return tiles;
}

export function mobileDashboardSetTab(tab: unknown) {
  document.querySelectorAll('.m-tab').forEach(btn => {
    const tabButton = (btn as HTMLElement);
    const isActive = tabButton.dataset.tab === tab;
    tabButton.classList.toggle('active', isActive);
    tabButton.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
  document.querySelectorAll<HTMLElement>('.m-tabbar').forEach(navigation => {
    navigation.scrollLeft = _mobileNavigationScrollLeft;
    const active = navigation.querySelector<HTMLElement>('.m-tab.active');
    if (!active || !navigation.clientWidth) return;
    const bounds = navigation.getBoundingClientRect();
    const button = active.getBoundingClientRect();
    if (button.left < bounds.left + 8 || button.right > bounds.right - 8) {
      navigation.scrollLeft += button.left + button.width / 2 - (bounds.left + bounds.width / 2);
    }
    _mobileNavigationScrollLeft = navigation.scrollLeft;
  });
}

function renderMobileBottomTabs(activeTab: unknown = 'dashboard', { id = '' }: {id?: unknown} = {}) {
  const active = activeTab === 'dashboard' || activeTab === 'labs' || activeTab === 'body'
    || activeTab === 'nutrition' || activeTab === 'supplements'
    || activeTab === 'light' || activeTab === 'insight' ? activeTab : null;
  return renderMobileNavigation({activeTab: active, id: id ? `${id}` : null});
}

function projectMobileDashboardWidgetStack(ctx:unknown):MobileDashboardStackView {
 const prefs=mobileDashboardDeps.getDashboardWidgetPrefs();
 const visibleEntries=mobileDashboardDeps.getVisibleDashboardWidgetViews(ctx,prefs);
 const count=String(visibleEntries.length);
 const actions=mobileDashboardDeps.projectDashboardControlButtons({includeReset:mobileDashboardDeps.isDashboardOrganizeMode()});
 const hasEntries=!!visibleEntries.length;
 const widgets=hasEntries?visibleEntries.map((entry,index)=>mobileDashboardDeps.projectDashboardWidget(entry,prefs,index,visibleEntries)):[];
 return {count,actions,hasEntries,widgets};
}

export function openMobileDashboardSearch() {
  mobileDashboardDeps.toggleMobileSidebar();
  setTimeout(() => document.getElementById('sidebar-search')?.focus(), 80);
}

export function mobileDashboardJump(section: string) {
  const route = ['dashboard', 'labs', 'genome', 'body', 'nutrition', 'supplements', 'light', 'insight', 'recommendations'].includes(section) ? section : 'dashboard';
  mobileDashboardSetTab(route === 'genome' || route === 'recommendations' ? 'dashboard' : route);
  mobileDashboardDeps.navigate(route);
}

export function renderMobileDashboard(data: MobileDataReader, { resetScroll = false }: {resetScroll?:unknown} = {}) {
  const main = document.getElementById("main-content");
  if (!main) return;
  const request = beginDashboardRenderRequest(main, isMobileDashboardViewport);
  const render = ({renderMobileDashboardPage, hydrateMobileDashboardPage}: NonNullable<ReturnType<typeof getLoadedMobileDashboardRenderer>>) => {
    const ctx = mobileDashboardDeps.buildDashboardWidgetContext(data);
    const profile = getMobileDashboardProfile();
    const mobileWidgetStack = projectMobileDashboardWidgetStack(ctx);
    const firstName = getMobileGreetingName(profile);
    const counts = getMobileDashboardCounts(data);
    const greetingSub = [
      `${counts.markerCount || 0} markers`,
      counts.latestDate ? `last draw ${(formatDate as (value:unknown,format:string)=>string)(counts.latestDate, 'short')}` : '',
      `${data.dates?.length || 0} draw${data.dates?.length === 1 ? '' : 's'}`,
    ].filter(Boolean).join(' · ');

    if (!request.isCurrent()) return false;
    document.body.classList.add('mobile-dashboard-active');
    syncMobileChromeRootState();
    // Preserve the native template's text conversion and date-control read positions.
    const firstNameText=firstName==null?'':String(firstName);
    const greetingSubText=greetingSub==null?'':String(greetingSub);
    const range=data.dates?.length?projectDateRangeFilter({showScope:true}):null;
    const view={firstName:firstNameText,greetingSub:greetingSubText,range,stack:mobileWidgetStack};
    const html=renderMobileDashboardPage(view);
    if (!request.isCurrent()) return false;
    disposeDashboardPage();
    main.innerHTML=html;
    hydrateMobileDashboardPage(main,view);
    if (!request.isCurrent()) return false;

    if (resetScroll && request.mayRunFocusEffects()) scrollMobileDashboardToTop();
    mobileDashboardDeps.setupDropZone();
    if (!request.isCurrent()) return false;
    refreshMobileDashboardActiveTab();
    loadContextHealthDots();
    mobileDashboardDeps.loadContextCardTips();
    if (!request.isCurrent()) return false;
    mobileDashboardDeps.loadCommitHash();
    if (!request.isCurrent()) return false;
    mobileDashboardDeps.loadCatalog().then(c => { if (request.isCurrent()) mobileDashboardDeps.cacheCatalog(c); });
    return;
  };
  const loaded = getLoadedMobileDashboardRenderer();
  if (loaded) return render(loaded);
  showDashboardRendererLoading(main);
  return loadMobileDashboardRenderer().then(renderer => {
    if (!request.isCurrent()) return false;
    return render(renderer);
  }).catch(error => {
    console.error('Failed to load Mobile Dashboard renderer', error);
    if (request.isCurrent()) showDashboardRendererFailure(main, () => request.isCurrent() ? renderMobileDashboard(data, {resetScroll}) : false);
    return false;
  });
}
