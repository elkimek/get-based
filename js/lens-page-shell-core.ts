// lens-page-shell-core.ts — shared lens state, ordering, delegates and typed chrome

import {projectLensWidgetChrome, type LensWidgetToolsView, type LensWidgetChromeView} from './lens-shell-presentation.js';

export interface LensDashboardToggleView {id: string; label: string; action: 'remove-dashboard-widget' | 'add-dashboard-widget'}

import { state } from './state.js';
import { getWidgetHeaderDescription } from './dashboard-widget-copy.js';
import { actionAttributes } from './action-attributes.js';
import { profileStorageKey } from './profile.js';
import { openEMFAssessmentEditor } from './emf-runtime.js';
import { triggerContextCardDNAFilePickerRuntime } from './context-cards-runtime.js';
import { getDnaModuleFunction } from './dna-runtime-bridge.js';
import { getSettingsModuleFunction } from './settings-runtime-bridge.js';

export interface LensPageShellDeps {
  addDashboardWidgetFromLens: (id: string) => unknown;
  getAvailableDashboardFixedWidgetIds: () => string[];
  getDashboardWidgetPrefs: () => { hidden?: readonly string[] | null } | null;
  navigate: (route: string) => unknown;
  openChatPanel: () => unknown;
  openEMFAssessmentEditor: typeof openEMFAssessmentEditor;
  openDashboardBiometricPicker: () => unknown;
  removeDashboardWidgetFromLens: (id: string) => unknown;
}

export interface LensWidgetOptions {
  dashboardId?: string | null;
  pageRoute?: string;
  pageIndex?: number;
  pageCount?: number;
  compactScore?: boolean;
}

export interface LensPageWidget {
  id: string;
  title: unknown;
  description?: string;
  body: unknown;
  size?: string;
  opts?: LensWidgetOptions;
}

const LENS_PAGE_ORDER_VERSION = 1;

let _shellDeps: LensPageShellDeps = {
  addDashboardWidgetFromLens: (_id) => {},
  getAvailableDashboardFixedWidgetIds: () => [],
  getDashboardWidgetPrefs: () => ({ hidden: [] }),
  navigate: (_route) => {},
  openChatPanel: () => {},
  openEMFAssessmentEditor,
  openDashboardBiometricPicker: () => {},
  removeDashboardWidgetFromLens: (_id) => {},
};
let lensPageShellDelegatesInstalled = false;

function lensPageRuntime() {
  return globalThis as unknown as Record<string, unknown>;
}

function callLensPageRuntime(name: string, ...args: unknown[]) {
  const fn = name === 'navigate'
    ? _shellDeps.navigate
    : getSettingsModuleFunction(name)
      || getDnaModuleFunction(name)
      || lensPageRuntime()[name];
  if (typeof fn === 'function') (fn as (...args: unknown[]) => unknown)(...args);
}

export function configureLensPageShell(deps: Partial<LensPageShellDeps> = {}) {
  const previous = { ..._shellDeps };
  _shellDeps = { ..._shellDeps, ...deps };
  installLensPageShellDelegates();
  return previous;
}

export function lensPageActionAttrs(action: string, attrs: Parameters<typeof actionAttributes>[2] = {}) {
  return actionAttributes("lens-page", action, attrs);
}

function handleLensPageShellClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  const actionEl = target.closest<HTMLElement>('[data-lens-page-action]');
  if (!actionEl) return;
  if (!actionEl.closest('.lens-page-header, .lens-page-widgets, #recommendations-page, .biology-coherence-hero')) return;
  // .biology-coherence-hero is included because the Biology Scores lens renders the coherence
  // hero as a standalone top-section before the regular lens-page-widgets container, and its
  // dashboard toggle must be handled by the lens page shell.
  event.preventDefault();

  const action = actionEl.dataset.lensPageAction || '';
  const id = actionEl.dataset.lensPageId || '';
  if (action === 'move-widget') {
    moveLensPageWidget(actionEl.dataset.lensPageRoute || '', id, actionEl.dataset.lensPageDirection || 0);
  } else if (action === 'add-dashboard-widget') {
    _shellDeps.addDashboardWidgetFromLens(id);
  } else if (action === 'remove-dashboard-widget') {
    _shellDeps.removeDashboardWidgetFromLens(id);
  } else if (action === 'import-dna') {
    triggerContextCardDNAFilePickerRuntime();
  } else if (action === 'import-snp-report') {
    callLensPageRuntime('importSnpReport');
  } else if (action === 'add-manual-snp') {
    callLensPageRuntime('openManualSnpModal');
  } else if (action === 'reimport-dna') {
    if (getDnaModuleFunction('reimportDNA')) callLensPageRuntime('reimportDNA');
    else triggerContextCardDNAFilePickerRuntime();
  } else if (action === 'delete-dna') {
    callLensPageRuntime('confirmDeleteDNA');
  } else if (action === 'open-wearables-settings') {
    callLensPageRuntime('openSettingsModal', 'wearables');
  } else if (action === 'open-biometric-picker') {
    _shellDeps.openDashboardBiometricPicker();
  } else if (action === 'open-ai-chat') {
    _shellDeps.openChatPanel();
  } else if (action === 'open-emf-assessment') {
    void _shellDeps.openEMFAssessmentEditor();
  } else if (action === 'open-recommendations') {
    callLensPageRuntime('navigate', 'recommendations');
  } else if (action === 'open-privacy-settings') {
    callLensPageRuntime('openSettingsModal', 'privacy');
  }
}

function installLensPageShellDelegates() {
  if (lensPageShellDelegatesInstalled || typeof document === 'undefined') return;
  lensPageShellDelegatesInstalled = true;
  document.addEventListener('click', handleLensPageShellClick);
}

function lensPageOrderStorageKey(route: string) {
  return profileStorageKey(state.currentProfile || 'default', `lensPageOrder-${route}-v${LENS_PAGE_ORDER_VERSION}`);
}

export function getLensPageWidgetOrder(route: string, defaultIds: string[]): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(lensPageOrderStorageKey(route)) || '[]') as unknown;
    if (!Array.isArray(raw)) return defaultIds;
    const known = new Set(defaultIds);
    const ordered = raw.filter(id => known.has(id)) as string[];
    for (const id of defaultIds) if (!ordered.includes(id)) ordered.push(id);
    return ordered;
  } catch {
    return defaultIds;
  }
}

export function orderLensPageWidgets<Widget extends {id: string}>(route: string, widgets: Widget[]): Widget[] {
  const ids = widgets.map(w => w.id);
  const order = getLensPageWidgetOrder(route, ids);
  const byId = new Map(widgets.map(w => [w.id, w]));
  return order.map(id => byId.get(id)).filter(Boolean) as Widget[];
}

export function moveLensPageWidget(route: unknown, id: unknown, direction: unknown) {
  route = String(route || state.currentView || '');
  id = String(id || '');
  const dir = Number(direction);
  if (!route || !id || !Number.isFinite(dir) || dir === 0) return;
  const container = Array.from(document.querySelectorAll<HTMLElement>('.lens-page-widgets[data-lens-route]'))
    .find(el => el.dataset.lensRoute === route && Array.from(el.querySelectorAll('[data-widget-id]')).some(widget => widget.getAttribute('data-widget-id') === id));
  const ids = container
    ? Array.from(container.querySelectorAll<HTMLElement>(':scope > [data-widget-id]')).map(el => el.dataset.widgetId).filter(Boolean) as string[]
    : getLensPageWidgetOrder(route as string, []);
  const index = ids.indexOf(id as string);
  const target = index + (dir < 0 ? -1 : 1);
  if (index < 0 || target < 0 || target >= ids.length) return;
  [ids[index], ids[target]] = [ids[target]!, ids[index]!];
  localStorage.setItem(lensPageOrderStorageKey(container?.dataset.lensOrderKey || route as string), JSON.stringify(ids));
  if (state.currentView === route) callLensPageRuntime('navigate', route);
}

export function getLensDashboardToggleView(dashboardId: string | null | undefined): LensDashboardToggleView | null {
  const availableIds = _shellDeps.getAvailableDashboardFixedWidgetIds();
  // Biology Score widgets are generated dynamically from score definitions. In
  // isolated Node/source-inspection tests the dashboard registry is not always
  // configured before the lens renderer runs, so keep the toggle renderable for
  // these declared dynamic widget ids instead of silently dropping it.
  const isDeclaredDynamicBiologyScoreWidget = typeof dashboardId === 'string' && dashboardId.startsWith('biology-score-');
  if (!dashboardId || (!availableIds.includes(dashboardId) && !isDeclaredDynamicBiologyScoreWidget)) return null;
  const prefs = _shellDeps.getDashboardWidgetPrefs();
  const hidden = Array.isArray(prefs?.hidden) ? prefs.hidden : [];
  const isVisible = !hidden.includes(dashboardId);
  const label = isVisible ? 'Remove from Dashboard' : 'Add to Dashboard';
  const action = isVisible ? 'remove-dashboard-widget' : 'add-dashboard-widget';
  return {id: dashboardId, label, action};
}

export function lensWidgetChromeFacts(id: string, description: string | undefined, opts: LensWidgetOptions) {
  const headerDescription = getWidgetHeaderDescription(id, description);
  const dashboardId = Object.prototype.hasOwnProperty.call(opts, 'dashboardId') ? opts.dashboardId : id;
  const route = opts.pageRoute || '', index = opts.pageIndex || 0, count = opts.pageCount || 0;
  const tools: LensWidgetToolsView = {dashboard: getLensDashboardToggleView(dashboardId),
    move: route && count >= 2 ? {route, id, index, count} : null};
  return {headerDescription, tools};
}

export function getLensWidgetChrome(id: string, title: unknown, description: string | undefined, size = 'full', opts: LensWidgetOptions = {}): LensWidgetChromeView {
  const {headerDescription, tools} = lensWidgetChromeFacts(id, description, opts);
  return projectLensWidgetChrome(id, title, headerDescription, size, tools, !!opts.compactScore);
}

export interface LensContentWidget<Content> {
  id: string; title: unknown; description?: string; size?: string;
  opts?: LensWidgetOptions & {source?: unknown}; content: Content;
}
export interface LensContentGrid<Content> {
  route: string; orderKey: string; widgets: Array<{view: LensWidgetChromeView; content: Content}>;
}

/** Typed feature bodies share the existing widget ordering, chrome and delegates. */
export function getLensContentGrid<Content>(route: string, widgets: LensContentWidget<Content>[], options: {group?: string} = {}): LensContentGrid<Content> {
  const orderKey = options.group ? `${route}-${options.group}` : route;
  const ordered = orderLensPageWidgets(orderKey, widgets);
  return {route, orderKey, widgets: ordered.map((widget, index) => ({
    view: getLensWidgetChrome(widget.id, widget.title, widget.description, widget.size || 'full',
      {...(widget.opts || {}), pageRoute: route, pageIndex: index, pageCount: ordered.length}),
    content: widget.content,
  }))};
}

installLensPageShellDelegates();
