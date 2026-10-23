import {componentStaticStyles} from './component-inline-style-map.generated.js';
import {renderSidebarPresentation,sidebarText,sidebarAction,type SidebarView,type SidebarCategoryView,type ConditionalSidebarView,type SidebarIcon,type SidebarGroup as SidebarGroupView,type SidebarBadge,type SidebarActionName} from './sidebar-presentation.js';
// nav.js — Sidebar, compact profile button

import { state } from './state.js';
import type { ActiveData, ActiveCategory } from './data-view-types.js';

export interface NavActionDependencies {
  openLightEnvironmentAssessment: () => unknown;
  openClientList: (returnFocus?: HTMLElement) => unknown;
  openKnowledgeBase: typeof openKnowledgeBaseModal;
}
interface NavItem { withData: number; flagged: number; view: SidebarCategoryView }
interface NavGroup { items: NavItem[]; totalFlagged: number }
interface ConditionalNavItem {
  key: string; icon: SidebarIcon; label: string; route?: string;
  action?: SidebarActionName; badge?: string | number | null;
}

import { getLabCategoryEntriesInSidebarOrder } from './category-order.js';
import { escapeAttr, hashString } from './utils.js';
import { getActiveData, filterDatesByRange } from './data.js';
import { countFlagged } from './marker-analysis.js';
import { getProfiles } from './profile.js';
import { closeModalOverlay, openModalOverlay } from './modal-lifecycle.js';
import {
  navigateFromNavRuntime,
  openContextFromNavRuntime,
  openCreateMarkerFromNavRuntime,
  openEMFAssessmentFromNavRuntime,
  openReportBuilderFromNavRuntime,
} from './nav-runtime.js';
import { openKnowledgeBaseModal } from './lens.js';
import { projectProfileButton } from './profile-button-presentation.js';
import { renderProfileButtonView } from './profile-button-rendering.js';

function _sidebarIcon(name:SidebarIcon):SidebarIcon { return name; }

let navDelegatesInstalled = false;
const navActionDeps: NavActionDependencies = {
  openLightEnvironmentAssessment: () => {},
  openClientList: () => {},
  openKnowledgeBase: (options) => openKnowledgeBaseModal(options),
};

export function configureNavActions(deps: Partial<NavActionDependencies> | null = {}) {
  const previous = { ...navActionDeps };
  for (const [name, value] of Object.entries(deps || {})) {
    if (Object.prototype.hasOwnProperty.call(navActionDeps, name) && typeof value === 'function') {
      (navActionDeps as unknown as Record<string, unknown>)[name] = value;
    }
  }
  return previous;
}

function _navActionAttrs(action: unknown, attrs: Record<string, unknown> = {}) {
  const extraAttrs = Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => ` data-nav-${name}="${escapeAttr(String(value))}"`)
    .join('');
  return `data-nav-action="${escapeAttr(action)}"${extraAttrs}`;
}

function _navNavigateAttrs(route: string) {
  return _navActionAttrs('navigate', { route });
}

function _navActionScope(el: Element) {
  return !!el.closest('#sidebar-nav, #profile-selector');
}

function _findGroupHeader(groupName: string | undefined) {
  return Array.from((document.querySelectorAll('.sidebar-group-header')) as NodeListOf<HTMLElement>)
    .find(el => el.dataset.groupName === groupName) || null;
}

function _findGroupItems(groupName: string | undefined) {
  return Array.from((document.querySelectorAll('.sidebar-group-items')) as NodeListOf<HTMLElement>)
    .find(el => el.dataset.groupItems === groupName) || null;
}

function handleNavActionClick(event: Event) {
  const target = event.target instanceof Element ? event.target : null;
  const actionEl = (target?.closest('[data-nav-action]') || null) as HTMLElement | null;
  if (!actionEl || !_navActionScope(actionEl)) return;

  const action = actionEl.dataset.navAction;
  let handled = true;
  if (action === 'navigate') {
    navigateFromNavRuntime(actionEl.dataset.navRoute || actionEl.dataset.category || 'dashboard');
  } else if (action === 'open-emf-assessment') {
    if (document.getElementById('sidebar-nav')?.classList.contains('mobile-open')) closeMobileSidebar();
    openEMFAssessmentFromNavRuntime();
  } else if (action === 'open-light-assessment') {
    navActionDeps.openLightEnvironmentAssessment();
  } else if (action === 'open-knowledge-base') {
    if (document.getElementById('sidebar-nav')?.classList.contains('mobile-open')) {
      closeMobileSidebar();
    }
    navActionDeps.openKnowledgeBase({ source: 'sidebar' });
  } else if (action === 'open-report-builder') {
    if (document.getElementById('sidebar-nav')?.classList.contains('mobile-open')) closeMobileSidebar();
    openReportBuilderFromNavRuntime();
  } else if (action === 'open-context') {
    if (document.getElementById('sidebar-nav')?.classList.contains('mobile-open')) closeMobileSidebar();
    openContextFromNavRuntime();
  } else if (action === 'open-custom-marker') {
    if (document.getElementById('sidebar-nav')?.classList.contains('mobile-open')) closeMobileSidebar();
    openCreateMarkerFromNavRuntime();
  } else if (action === 'toggle-group') {
    toggleNavGroup(actionEl.dataset.navGroup || '');
  } else if (action === 'open-client-list') {
    navActionDeps.openClientList(actionEl);
  } else {
    handled = false;
  }

  if (handled) event.preventDefault();
}

function handleNavInput(event: Event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target || !_navActionScope(target)) return;
  if (target.dataset.navInputAction === 'filter-sidebar') {
    filterSidebar();
  }
}

export function installNavActionDelegates() {
  if (navDelegatesInstalled || typeof document === 'undefined') return;
  navDelegatesInstalled = true;
  document.addEventListener('click', handleNavActionClick);
  document.addEventListener('input', handleNavInput);
}

// Render a compact sidebar entry for modules whose visibility depends on data.
function _projectConditionalNavItem({ key, icon, label, route = 'dashboard', action = 'navigate', badge }: ConditionalNavItem):ConditionalSidebarView {
  const badgeView:SidebarBadge = badge ? {kind:'count',text:sidebarText(String(badge))} : {kind:'dot'};
  const actionAttrs = action === 'navigate' ? _navNavigateAttrs(route) : _navActionAttrs(action);
  const category = sidebarText(key);
  const actionView = sidebarAction(actionAttrs,action,action==='navigate'?route:undefined);
  const iconView = _sidebarIcon(icon);
  const labelText = sidebarText(label);
  return {category,action:actionView,icon:iconView,label:labelText,badge:badgeView};
}

export function openRecommendationsFromSidebar() {
  navigateFromNavRuntime('recommendations');
}

export function syncSidebarActive(route: string | null | undefined = state.currentView || 'dashboard') {
  const activeRoute = String(route || 'dashboard');
  document.querySelectorAll('#sidebar-nav .nav-item').forEach(el => {
    const item = (el as HTMLElement);
    const isActive = item.dataset.category === activeRoute;
    item.classList.toggle('active', isActive);
    item.classList.toggle('is-active', isActive);
    if (isActive) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  });
}

function _buildNavItem(key: string, cat: ActiveCategory): NavItem | null {
  const markers = Object.values(cat.markers).filter(m => !m.hidden);
  const withData = markers.filter(m => m.values && m.values.some(v => v !== null)).length;
  if (withData === 0) return null;
  const flagged = countFlagged(markers);
  const badge:SidebarCategoryView['badge'] = flagged > 0 ? {kind:'flagged',text:`${flagged}`} : {kind:'count',text:`${withData}`};
  const markerNames = markers.map(m => m.name).join('|');
  // Preserve native group-prefix reads and label coercion before the next category.
  let label = cat.label;
  if (cat.group && label.startsWith(cat.group + ': ')) {
    label = label.slice(cat.group.length + 2);
  }
  const category = sidebarText(key);
  const markerNamesText = sidebarText(markerNames);
  const group = sidebarText(cat.group || '');
  const action = sidebarAction(_navNavigateAttrs(key),'navigate',key);
  const labelText = sidebarText(label);
  return {withData,flagged,view:{category,markerNames:markerNamesText,group,action,label:labelText,badge}};
}

export function buildSidebar(data?: unknown) {
  installNavActionDelegates();
  if (!data) data = getActiveData();
  data = filterDatesByRange(data as ActiveData);
  const nav = document.getElementById("sidebar-nav");
  if (!nav) return;
  const counts = (() => {
    let markerCount = 0;
    for (const cat of Object.values((data as ActiveData).categories || {})) {
      for (const marker of Object.values(cat.markers || {})) {
        if (!marker.hidden && marker.values?.some(v => v !== null)) markerCount++;
      }
    }
    return markerCount;
  })();
  const searchIcon = _sidebarIcon('search');
  const dashboard = {action:sidebarAction(_navNavigateAttrs('dashboard'),'navigate','dashboard'),icon:_sidebarIcon('dashboard')};
  const dashboardCount = `${counts}`;
  const labs = {action:sidebarAction(_navNavigateAttrs('labs'),'navigate','labs'),icon:_sidebarIcon('labs')};
  const labsCount = `${counts}`;
  const biology = {action:sidebarAction(_navNavigateAttrs('biology-scores'),'navigate','biology-scores'),icon:_sidebarIcon('biologyScores')};

  // Lens entries route to dedicated views; compact summary widgets remain
  // available on the dashboard.

  const genetics = state.importedData?.genetics;
  const hasGeneticsData = genetics && ((genetics.snps && Object.keys(genetics.snps).length > 0) || genetics.mtdna);
  const gParts: Array<string | number> = [];
  if (hasGeneticsData) {
    if (genetics.snps && Object.keys(genetics.snps).length > 0) gParts.push(Object.keys(genetics.snps).length);
    if (genetics.mtdna) gParts.push(genetics.mtdna.haplogroup);
  }
  const genome = {action:sidebarAction(_navNavigateAttrs('genome'),'navigate','genome'),icon:_sidebarIcon('genome')};
  const genomeBadge:SidebarBadge = gParts.length ? {kind:'count',text:sidebarText(gParts.join(' '))} : {kind:'dot'};

  const wearableConn = state.importedData?.wearableConnections || {};
  const wearableCount = Object.keys(wearableConn).length;
  const body = {action:sidebarAction(_navNavigateAttrs('body'),'navigate','body'),icon:_sidebarIcon('body')};
  const bodyBadge:SidebarBadge = wearableCount ? {kind:'count',text:`${wearableCount}`} : {kind:'dot'};
  const nutrition = {action:sidebarAction(_navNavigateAttrs('nutrition'),'navigate','nutrition'),icon:_sidebarIcon('nutrition')};
  const supplements = {action:sidebarAction(_navNavigateAttrs('supplements'),'navigate','supplements'),icon:_sidebarIcon('supplements')};

  // \u2600 Light & Sun \u2014 always visible (flagship module). New users
  // need a discoverable entry point even before logging anything; once
  // sessions exist, the badge shows this week's count.
  const sunSessions = state.importedData?.sunSessions || [];
  const weekStart = Date.now() - 7 * 86400 * 1000;
  const weekCount = sunSessions.filter(s => (s.endedAt || s.startedAt || 0) >= weekStart).length;
  const light = _projectConditionalNavItem({
    key: 'light',
    icon: 'light',
    label: 'Light',
    route: 'light',
    badge: weekCount > 0 ? (weekCount > 9 ? '9+' : weekCount) : null,
  });

  const insight = {action:sidebarAction(_navNavigateAttrs('insight'),'navigate','insight'),icon:_sidebarIcon('insight')};
  const recommendations = {action:sidebarAction(_navNavigateAttrs('recommendations'),'navigate','recommendations'),icon:_sidebarIcon('recommendations')};
  const compare = {action:sidebarAction(_navNavigateAttrs('compare'),'navigate','compare'),icon:_sidebarIcon('compare')};
  const correlations = {action:sidebarAction(_navNavigateAttrs('correlations'),'navigate','correlations'),icon:_sidebarIcon('correlations')};
  const emfAssessments = state.importedData?.emfAssessment?.assessments;
  const emfAssessmentCount = Array.isArray(emfAssessments) ? emfAssessments.length : 0;
  const emf = _projectConditionalNavItem({
    key: 'emf',
    icon: 'emf',
    label: 'EMF assessment',
    action: 'open-emf-assessment',
    badge: emfAssessmentCount > 0 ? emfAssessmentCount : null,
  });
  const lightRoomCount = Array.isArray(state.importedData?.lightEnvironment?.rooms) ? state.importedData.lightEnvironment.rooms.length : 0;
  const lightAuditCount = Array.isArray(state.importedData?.lightAudits) ? state.importedData.lightAudits.length : 0;
  const lightAssessment = _projectConditionalNavItem({
    key: 'light-env-assessment',
    icon: 'light',
    label: 'Light assessment',
    action: 'open-light-assessment',
    badge: lightRoomCount > 0 && lightAuditCount > 0 ? lightAuditCount : null,
  });

  const reports = {action:sidebarAction(_navActionAttrs('open-report-builder'),'open-report-builder'),icon:_sidebarIcon('report')};
  const context = {action:sidebarAction(_navActionAttrs('open-context'),'open-context'),icon:_sidebarIcon('context')};
  const knowledge = {action:sidebarAction(_navActionAttrs('open-knowledge-base'),'open-knowledge-base'),icon:_sidebarIcon('knowledge')};
  const custom = {action:sidebarAction(_navActionAttrs('open-custom-marker'),'open-custom-marker'),icon:_sidebarIcon('plus')};

  // Separate categories into blood work (no group) and specialty groups
  const bloodWork: NavItem[] = [];
  const specialtyGroups: Record<string, NavGroup> = {};
  for (const [key, cat] of getLabCategoryEntriesInSidebarOrder((data as ActiveData).categories)) {
    const item = _buildNavItem(key, cat);
    if (!item) continue;
    if (cat.group) {
      if (!specialtyGroups[cat.group]) specialtyGroups[cat.group] = { items: [], totalFlagged: 0 };
      specialtyGroups[cat.group]!.items.push(item);
      specialtyGroups[cat.group]!.totalFlagged += item.flagged;
    } else {
      bloodWork.push(item);
    }
  }

  // Lab category shortcuts stay in the sidebar because they are the fastest
  // way to jump into a biomarker table, but the Labs lens itself is the
  // all-biomarker entry point.
  const labAction = sidebarAction(_navActionAttrs('open-custom-marker'),'open-custom-marker');
  const categories = bloodWork.map(item => item.view);
  const groups:SidebarGroupView[] = [];
  for (const [groupName, group] of Object.entries(specialtyGroups)) {
    const collapsed = _getGroupCollapsed(groupName);
    const flagged = group.totalFlagged > 0 ? `${group.totalFlagged}` : null;
    const className = 'sidebar-group-header' + `${collapsed ? ' collapsed' : ''}`;
    const name = sidebarText(groupName);
    const headerAction = sidebarAction(_navActionAttrs('toggle-group', { group: groupName }),'toggle-group',undefined,groupName);
    const toggleAction = sidebarAction(_navActionAttrs('toggle-group', { group: groupName }),'toggle-group',undefined,groupName);
    const expanded:SidebarGroupView['expanded'] = collapsed ? 'false' : 'true';
    const accessibleName = sidebarText(groupName) + ' group';
    const label = sidebarText(groupName);
    const itemsName = sidebarText(groupName);
    const collapsedStyle = collapsed ? componentStaticStyles.hidden : undefined;
    groups.push({className,name,headerAction,toggleAction,expanded,accessibleName,label,flagged,itemsName,collapsedStyle,items:group.items.map(item => item.view)});
  }
  const view:SidebarView = {searchIcon,dashboard,dashboardCount,labs,labsCount,biology,genome,genomeBadge,body,bodyBadge,nutrition,supplements,light,insight,recommendations,compare,correlations,emf,lightAssessment,reports,context,knowledge,custom,labAction,categories,groups};
  const html = renderSidebarPresentation(view);

  nav.innerHTML = html;
  syncSidebarActive(state.currentView || 'dashboard');
}

function _getGroupCollapsed(groupName: string | undefined) {
  try { return localStorage.getItem(`labcharts-navgroup-${groupName}`) === 'collapsed'; } catch(e) { return false; }
}

export function toggleNavGroup(groupName: string | undefined) {
  const header = _findGroupHeader(groupName);
  const items = _findGroupItems(groupName);
  if (!header || !items) return;
  const isCollapsed = header.classList.toggle('collapsed');
  items.style.display = isCollapsed ? 'none' : '';
  // Keep aria-expanded in sync with the visual state. Without this, the
  // attribute captured at render time goes stale on every toggle and screen
  // readers announce a wrong expansion state until the next full re-render.
  const toggleBtn = header.querySelector('.sidebar-group-toggle');
  if (toggleBtn) toggleBtn.setAttribute('aria-expanded', String(!isCollapsed));
  try { localStorage.setItem(`labcharts-navgroup-${groupName}`, isCollapsed ? 'collapsed' : 'expanded'); } catch(e) {}
}

export function filterSidebar() {
  const searchInput = (document.getElementById('sidebar-search') as HTMLInputElement | null);
  const query = (searchInput?.value || '').toLowerCase().trim();
  const items = (document.querySelectorAll('#sidebar-nav .nav-item') as NodeListOf<HTMLElement>);
  const titles = (document.querySelectorAll('#sidebar-nav .sidebar-title') as NodeListOf<HTMLElement>);
  const groupHeaders = (document.querySelectorAll('#sidebar-nav .sidebar-group-header') as NodeListOf<HTMLElement>);
  const groupItemContainers = (document.querySelectorAll('#sidebar-nav .sidebar-group-items') as NodeListOf<HTMLElement>);
  if (!query) {
    items.forEach(el => el.style.display = '');
    titles.forEach(el => el.style.display = '');
    // Restore saved collapse state for groups
    groupHeaders.forEach(el => {
      const gn = el.dataset.groupName;
      const collapsed = _getGroupCollapsed(gn);
      el.style.display = '';
      el.classList.toggle('collapsed', collapsed);
      el.querySelector('.sidebar-group-toggle')?.setAttribute('aria-expanded', String(!collapsed));
    });
    groupItemContainers.forEach(el => {
      const gn = el.dataset.groupItems;
      el.style.display = _getGroupCollapsed(gn) ? 'none' : '';
    });
    return;
  }
  // When searching: show matching items, expand groups with matches, hide empty groups
  items.forEach(el => {
    const cat = el.dataset.category;
    if (cat === 'dashboard' || cat === 'labs' || cat === 'biology-scores' || cat === 'correlations' || cat === 'compare' || cat === 'recommendations' || cat === 'reports' || cat === 'context' || cat === 'knowledge-base' || cat === 'custom-markers' || cat === 'light' || cat === 'body' || cat === 'nutrition' || cat === 'supplements' || cat === 'wearables' || cat === 'emf' || cat === 'light-env-assessment' || cat === 'genome' || cat === 'genetics' || cat === 'insight') { el.style.display = ''; return; }
    const label = el.textContent!.toLowerCase();
    const markers = (el.dataset.markers || '').toLowerCase();
    el.style.display = (label.includes(query) || markers.includes(query)) ? '' : 'none';
  });
  titles.forEach(el => el.style.display = '');
  // Expand groups with matching items, hide groups with none
  groupItemContainers.forEach(el => {
    const gn = el.dataset.groupItems;
    const visibleItems = el.querySelectorAll('.nav-item:not([style*="display: none"])');
    const header = _findGroupHeader(gn);
    if (visibleItems.length > 0) {
      el.style.display = '';
      if (header) {
        header.style.display = '';
        header.classList.remove('collapsed');
        header.querySelector('.sidebar-group-toggle')?.setAttribute('aria-expanded', 'true');
      }
    } else {
      el.style.display = 'none';
      if (header) header.style.display = 'none';
    }
  });
}

// Avatar color palette — 10 distinct hues that work on dark & light
const AVATAR_COLORS = ['#4f8cff','#f472b6','#34d399','#fbbf24','#a78bfa','#f87171','#38bdf8','#fb923c','#22d3ee','#a3e635'];

export function getAvatarColor(id: string | null | undefined) {
  const h = parseInt(hashString(id || ''), 36);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]!;
}

export function renderProfileButton() {
  installNavActionDelegates();
  const container = document.getElementById('profile-selector');
  if (!container) return;
  const profiles = getProfiles();
  const active = profiles.find(p => p.id === state.currentProfile) || profiles[0];
  if (!active) return;
  container.innerHTML = renderProfileButtonView(projectProfileButton(active, getAvatarColor));
}

// Keep renderProfileDropdown as alias for backward compat (tests, other modules)
export function renderProfileDropdown() { renderProfileButton(); }

// ═══════════════════════════════════════════════
// MOBILE SIDEBAR
// ═══════════════════════════════════════════════
export function toggleMobileSidebar() {
  const sidebar = document.getElementById('sidebar-nav');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) {
    closeModalOverlay('sidebar-backdrop', { restoreFocus: false });
    return;
  }
  const isOpen = sidebar.classList.contains('mobile-open');
  if (isOpen) {
    closeMobileSidebar();
  } else {
    sidebar.classList.add('mobile-open');
    openModalOverlay(backdrop, { scrollLock: true });
  }
}

export function closeMobileSidebar() {
  document.getElementById('sidebar-nav')?.classList.remove('mobile-open');
  closeModalOverlay('sidebar-backdrop', { restoreFocus: false });
}
